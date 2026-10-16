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

/** A warm retro sunset, so the app has something to show before an upload. */
export function makeDemoImage(): HTMLCanvasElement {
  const w = 1000;
  const h = 1600;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#2b1a3a');
  sky.addColorStop(0.35, '#a1305a');
  sky.addColorStop(0.7, '#f06a2a');
  sky.addColorStop(1, '#ffc46b');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // Sun with horizontal cut stripes.
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = w * 0.3;
  const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
  sun.addColorStop(0, '#fff1b8');
  sun.addColorStop(1, '#ff8f2e');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  const sky2 = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky2.addColorStop(0.35, '#a1305a');
  sky2.addColorStop(0.7, '#f06a2a');
  sky2.addColorStop(1, '#ffc46b');
  g.fillStyle = sky2;
  for (let i = 0; i < 6; i++) {
    const y = cy + r * 0.12 + i * r * 0.16;
    g.fillRect(cx - r - 2, y, 2 * r + 4, 8 + i * 5);
  }

  // Layered dunes.
  const dune = (base: number, amp: number, freq: number, phase: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  };
  dune(h * 0.6, 26, 0.006, 0.8, '#c4502b');
  dune(h * 0.68, 34, 0.005, 2.2, '#8e3423');
  dune(h * 0.77, 30, 0.0045, 4.1, '#5e2418');
  dune(h * 0.87, 26, 0.004, 1.3, '#38160f');
  return c;
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
