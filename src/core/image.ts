// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import demoUrl from '../assets/demo.jpg';
import { linearToOklab, linearToSrgb8, srgb8ToLinear } from './color';
import type { Layout } from './layout';
import type { ImageParams } from './state';

const MAX_SOURCE_DIM = 1800;

/** Downscale the raw image and bake brightness / contrast / saturation into a canvas. */
export function processImage(src: CanvasImageSource & { width: number; height: number }, adj: Pick<ImageParams, 'brightness' | 'contrast' | 'saturation'>): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SOURCE_DIM / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = `brightness(${adj.brightness}) contrast(${adj.contrast}) saturate(${adj.saturation})`;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.filter = 'none';
  return c;
}

export async function loadImageFile(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** The built-in example photo (inlined into the build, so it also works offline). */
export async function loadDemoImage(): Promise<ImageBitmap> {
  const res = await fetch(demoUrl);
  return loadImageFile(await res.blob());
}

// ---------------------------------------------------------------- placement

export interface Placement {
  /** Centre and size in opening-space mm. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export function gridCenter(layout: Layout): [number, number] {
  return [(layout.gridLeft + layout.gridRight) / 2, (layout.gridTop + layout.gridBottom) / 2];
}

/** zoom = 1 → the image just covers the beaded grid (like CSS object-fit: cover). */
export function placeImage(layout: Layout, aspect: number, t: Pick<ImageParams, 'offsetX' | 'offsetY' | 'zoom'>): Placement {
  const gw = layout.gridRight - layout.gridLeft;
  const gh = layout.gridTop - layout.gridBottom;
  const coverW = Math.max(gw, gh * aspect);
  const w = coverW * Math.max(0.02, t.zoom);
  const [gx, gy] = gridCenter(layout);
  return { cx: gx + t.offsetX, cy: gy + t.offsetY, w, h: w / aspect };
}

/** Zoom that makes the image fit entirely inside the grid (object-fit: contain). */
export function containZoom(layout: Layout, aspect: number): number {
  const gw = layout.gridRight - layout.gridLeft;
  const gh = layout.gridTop - layout.gridBottom;
  const coverW = Math.max(gw, gh * aspect);
  const containW = Math.min(gw, gh * aspect);
  return containW / coverW;
}

// ---------------------------------------------------------------- sampling

export interface Grid {
  n: number;
  rows: number;
  /** OKLab per cell, row-major from the top row: idx = row * n + rope. */
  lab: Float32Array;
  rgb: Uint8ClampedArray;
  valid: Uint8Array;
  validCount: number;
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Render the placed image onto a supersampled canvas aligned with the rope grid,
 * then box-average each cell in linear light. Cells that the image covers less
 * than half of are marked invalid ("outside the image").
 */
export function sampleGrid(layout: Layout, src: HTMLCanvasElement, pl: Placement, fast: boolean): Grid {
  const { n, rows } = layout;
  const cells = n * rows;
  const budget = fast ? 400_000 : 2_400_000;
  const k = Math.max(1, Math.min(6, Math.floor(Math.sqrt(budget / cells))));
  const cw = n * k;
  const ch = rows * k;

  scratch ??= document.createElement('canvas');
  if (scratch.width !== cw || scratch.height !== ch) {
    scratch.width = cw;
    scratch.height = ch;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const pxW = layout.pitch / k;
  const pxH = layout.step / k;
  const left = (pl.cx - pl.w / 2 - layout.gridLeft) / pxW;
  const top = (layout.gridTop - (pl.cy + pl.h / 2)) / pxH;
  ctx.drawImage(src, left, top, pl.w / pxW, pl.h / pxH);
  const data = ctx.getImageData(0, 0, cw, ch).data;

  const lab = new Float32Array(cells * 3);
  const rgb = new Uint8ClampedArray(cells * 3);
  const valid = new Uint8Array(cells);
  let validCount = 0;
  const kk = k * k;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < n; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let y = 0; y < k; y++) {
        let p = ((j * k + y) * cw + i * k) * 4;
        for (let x = 0; x < k; x++, p += 4) {
          const al = data[p + 3];
          if (al === 0) continue;
          r += srgb8ToLinear(data[p]) * al;
          g += srgb8ToLinear(data[p + 1]) * al;
          b += srgb8ToLinear(data[p + 2]) * al;
          a += al;
        }
      }
      const c = j * n + i;
      if (a / kk >= 127.5) {
        valid[c] = 1;
        validCount++;
        r /= a; g /= a; b /= a;
        linearToOklab(r, g, b, lab, c * 3);
        rgb[c * 3] = linearToSrgb8(r);
        rgb[c * 3 + 1] = linearToSrgb8(g);
        rgb[c * 3 + 2] = linearToSrgb8(b);
      }
    }
  }
  return { n, rows, lab, rgb, valid, validCount };
}
