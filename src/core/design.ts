// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import { beadLengths, computeLayout, type Layout, type Warning } from './layout';
import { placeImage, processImage, sampleGrid, type Grid, type Placement } from './image';
import { buildPalette, mapToPalette, type PaletteEntry } from './quantize';
import { buildTable, fitRope, ropeRuns, type PlacedBead } from './lengths';
import { MAX_COLOURS, type AppState, type Params } from './state';

export const FILAMENT_DENSITY = 1.24; // g/cm³, PLA
/** Print settings the PLA estimate assumes (shown next to the estimate). */
export const PRINT = {
  infill: 0.5,
  perimeters: 3, // wall loops, on the outside and around the hole
  lineWidth: 0.42, // mm
  layerHeight: 0.2, // mm
  bottomLayers: 5,
  topLayers: 5,
};

/**
 * Printed volume (mm³) of one tube bead as a slicer would make it: solid
 * perimeters on both walls, solid top and bottom layers, and sparse infill in
 * the core between them. A wall too thin for infill prints solid.
 */
function printedVolume(R: number, r: number, L: number): number {
  const ring = (a: number, b: number) => Math.PI * (b * b - a * a);
  const wall = PRINT.perimeters * PRINT.lineWidth;
  const caps = (PRINT.bottomLayers + PRINT.topLayers) * PRINT.layerHeight;
  const solid = ring(r, R) * L;
  const coreIn = r + wall;
  const coreOut = R - wall;
  if (coreOut <= coreIn) return solid;
  return solid - ring(coreIn, coreOut) * Math.max(0, L - caps) * (1 - PRINT.infill);
}
export const ROPE_ALLOWANCE = 150; // mm per rope for the bottom knot and tying onto the rail

export interface Design {
  layout: Layout;
  placement: Placement | null;
  palette: PaletteEntry[];
  /** Planned bead lengths, mm, ascending (a length may end up unused). */
  lengths: number[];
  /** Bevel on the beads' outer edges, mm (never more than the wall allows). */
  chamfer: number;

  beadCount: number;
  bRope: Uint16Array;
  /** Bead centre, opening-space mm. */
  bY: Float32Array;
  bLen: Uint8Array;
  bColor: Uint8Array;

  knotCount: number;
  knotRope: Uint16Array;
  knotY: Float32Array;
  /** Lowest point of each rope (its bottom knot), opening-space mm. */
  ropeBottom: Float32Array;

  colorCounts: number[];
  lengthCounts: number[];
  /** bom[color][length] = bead count. */
  bom: number[][];
  /** Estimated PLA per colour with the PRINT settings, g. */
  grams: number[];
  /** Estimated PLA of one bead of each length, g. */
  beadGrams: number[];
  totalGrams: number;
  ropeLengths: Float32Array;
  totalRope: number;

  warnings: Warning[];
}

type RawSource = HTMLCanvasElement | ImageBitmap;

export class DesignEngine {
  private source: RawSource | null = null;
  private slots = new Map<string, { key: string; value: unknown }>();

  setSource(src: RawSource | null): void {
    this.source = src;
    this.slots.clear();
  }

  get aspect(): number {
    return this.source ? this.source.width / this.source.height : 1;
  }

  private memo<T>(slot: string, key: string, fn: () => T): T {
    const hit = this.slots.get(slot);
    if (hit && hit.key === key) return hit.value as T;
    const value = fn();
    this.slots.set(slot, { key, value });
    return value;
  }

  /** The adjusted, downscaled image used for both sampling and the overlay. */
  processed(p: Params): HTMLCanvasElement | null {
    const src = this.source;
    if (!src) return null;
    const { brightness, contrast, saturation } = p.image;
    return this.memo('processed', JSON.stringify([brightness, contrast, saturation]), () => processImage(src, { brightness, contrast, saturation }));
  }

  compute(state: AppState): Design {
    const p = state.params;
    const fast = state.ui.interacting;
    const { color: _ropeColor, chamfer: _chamfer, ...ropeGeom } = p.ropes;

    const layoutKey = JSON.stringify([p.opening, ropeGeom, p.resolution.step]);
    const layout = this.memo('layout', layoutKey, () => computeLayout(p));

    const img = this.processed(p);
    const placement = img ? placeImage(layout, img.width / img.height, p.image) : null;

    const gridKey = JSON.stringify([layoutKey, state.ui.imageVersion, p.image, fast]);
    const grid = this.memo('grid', gridKey, () => {
      if (img && placement) return sampleGrid(layout, img, placement, fast);
      const cells = layout.n * layout.rows;
      return { n: layout.n, rows: layout.rows, lab: new Float32Array(cells * 3), rgb: new Uint8ClampedArray(cells * 3), valid: new Uint8Array(cells), validCount: 0 } satisfies Grid;
    });

    const needsFill = p.image.outside === 'fill' && grid.validCount < layout.n * layout.rows;
    const fill = needsFill ? p.image.fillColor : null;
    const paletteKey = JSON.stringify([gridKey, p.colors, state.filaments, fill]);
    const rawPalette = this.memo('palette', paletteKey, () =>
      buildPalette(grid, { mode: p.colors.mode, maxColors: Math.min(MAX_COLOURS, p.colors.maxColors), inventory: state.filaments, fill }),
    );

    const mapKey = JSON.stringify([paletteKey, p.resolution.dither]);
    const mapped = this.memo('map', mapKey, () => {
      const fillIdx = rawPalette.findIndex((e) => e.isFill);
      const idx = mapToPalette(grid, rawPalette, p.resolution.dither, needsFill ? fillIdx : -1);
      // Drop palette entries that ended up unused and remap.
      const used = new Uint32Array(rawPalette.length);
      for (let c = 0; c < idx.length; c++) if (idx[c] >= 0) used[idx[c]]++;
      const remap = new Int16Array(rawPalette.length).fill(-1);
      const palette: PaletteEntry[] = [];
      rawPalette.forEach((e, i) => {
        if (used[i] > 0) {
          remap[i] = palette.length;
          palette.push(e);
        }
      });
      for (let c = 0; c < idx.length; c++) if (idx[c] >= 0) idx[c] = remap[idx[c]];
      return { idx, palette };
    });

    const lengths = beadLengths(layout.step, p.resolution.maxLength, p.resolution.lengthCount);
    const fitKey = JSON.stringify([mapKey, lengths]);
    const fit = this.memo('fit', fitKey, () => this.fitBeads(layout, mapped.idx, lengths));

    const design = this.assemble(layout, placement, mapped.palette, lengths, fit.beads, fit.ropeOf);
    design.chamfer = Math.max(0, Math.min(p.ropes.chamfer, layout.wall * 0.9));
    return design;
  }

  private fitBeads(layout: Layout, idx: Int16Array, lengths: number[]) {
    const { n, rows, step } = layout;
    const table = buildTable(lengths, rows * step);
    const beads: PlacedBead[] = [];
    const ropeOf: number[] = [];
    for (let i = 0; i < n; i++) {
      const start = beads.length;
      fitRope(ropeRuns(idx, n, rows, i, step), table, beads);
      for (let b = start; b < beads.length; b++) ropeOf.push(i);
    }
    return { beads, ropeOf };
  }

  private assemble(layout: Layout, placement: Placement | null, palette: PaletteEntry[], lengths: number[], beads: PlacedBead[], ropeOf: number[]): Design {
    const warnings = [...layout.warnings];
    const { n, zoneTop, ropeD } = layout;

    const count = beads.length;
    const bRope = new Uint16Array(count);
    const bY = new Float32Array(count);
    const bLen = new Uint8Array(count);
    const bColor = new Uint8Array(count);
    const knotR = ropeD * 1.25;
    const knotRope: number[] = [];
    const knotY: number[] = [];
    const ropeBottom = new Float32Array(n).fill(zoneTop);

    const colorCounts = new Array(palette.length).fill(0);
    const lengthCounts = new Array(lengths.length).fill(0);
    const bom = palette.map(() => new Array(lengths.length).fill(0));

    for (let k = 0; k < count; k++) {
      const b = beads[k];
      const li = b.len;
      const L = lengths[li];
      const rope = ropeOf[k];
      bRope[k] = rope;
      bLen[k] = li;
      bColor[k] = b.color;
      bY[k] = zoneTop - (b.top + L / 2);
      colorCounts[b.color]++;
      lengthCounts[li]++;
      bom[b.color][li]++;

      // Beads rest on a knot under each contiguous stack (stacks split only around bare rope).
      const next = k + 1 < count && ropeOf[k + 1] === rope ? beads[k + 1] : null;
      if (!next || Math.abs(next.top - (b.top + L)) > 0.01) {
        const y = zoneTop - (b.top + L) - knotR;
        knotRope.push(rope);
        knotY.push(y);
        if (y - knotR < ropeBottom[rope]) ropeBottom[rope] = y - knotR;
      }
    }

    const beadGrams = lengths.map((L) => (printedVolume(layout.beadOD / 2, layout.hole / 2, L) * FILAMENT_DENSITY) / 1000);
    const grams = bom.map((row) => row.reduce((s, cnt, li) => s + cnt * beadGrams[li], 0));
    const totalGrams = grams.reduce((a, b) => a + b, 0);

    const ropeLengths = new Float32Array(n);
    let totalRope = 0;
    for (let i = 0; i < n; i++) {
      ropeLengths[i] = layout.railY - ropeBottom[i] + ROPE_ALLOWANCE;
      totalRope += ropeLengths[i];
    }

    if (count > 120_000) warnings.push({ level: 'warn', key: 'wManyBeads', vars: { n: count.toLocaleString() } });

    return {
      layout, placement, palette, lengths, chamfer: 0,
      beadCount: count, bRope, bY, bLen, bColor,
      knotCount: knotY.length, knotRope: Uint16Array.from(knotRope), knotY: Float32Array.from(knotY), ropeBottom,
      colorCounts, lengthCounts, bom, grams, beadGrams, totalGrams, ropeLengths, totalRope,
      warnings,
    };
  }
}
