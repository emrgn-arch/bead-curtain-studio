// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import { deltaE, hexToOklab, oklabToHex, type Lab } from './color';
import type { Grid } from './image';
import type { Filament } from './state';
import type { ColorMode } from './state';

export interface PaletteEntry {
  hex: string;
  /** Filament name; empty for free colours (the UI labels those). */
  name: string;
  lab: Lab;
  kind: 'inventory' | 'free';
  /** Used for cells outside the image. */
  isFill: boolean;
  inventoryId?: string;
  /** Closest inventory colour (only for free-mode colours). */
  match?: { name: string; hex: string; dE: number };
}

interface Hist {
  lab: Float32Array;
  w: Float32Array;
  size: number;
}

/** Bin the valid cells (5 bits per channel) so palette search scales with colour variety, not cell count. */
function histogram(grid: Grid): Hist {
  const bins = new Map<number, number>();
  const labs: number[] = [];
  const ws: number[] = [];
  const cells = grid.n * grid.rows;
  for (let c = 0; c < cells; c++) {
    if (!grid.valid[c]) continue;
    const key = ((grid.rgb[c * 3] >> 3) << 10) | ((grid.rgb[c * 3 + 1] >> 3) << 5) | (grid.rgb[c * 3 + 2] >> 3);
    let b = bins.get(key);
    if (b === undefined) {
      b = ws.length;
      bins.set(key, b);
      labs.push(0, 0, 0);
      ws.push(0);
    }
    labs[b * 3] += grid.lab[c * 3];
    labs[b * 3 + 1] += grid.lab[c * 3 + 1];
    labs[b * 3 + 2] += grid.lab[c * 3 + 2];
    ws[b] += 1;
  }
  const size = ws.length;
  const lab = new Float32Array(size * 3);
  for (let b = 0; b < size; b++) {
    lab[b * 3] = labs[b * 3] / ws[b];
    lab[b * 3 + 1] = labs[b * 3 + 1] / ws[b];
    lab[b * 3 + 2] = labs[b * 3 + 2] / ws[b];
  }
  return { lab, w: Float32Array.from(ws), size };
}

function d2(h: Float32Array, b: number, c: Lab): number {
  const dL = h[b * 3] - c[0];
  const da = h[b * 3 + 1] - c[1];
  const db = h[b * 3 + 2] - c[2];
  return dL * dL + da * da + db * db;
}

/**
 * Pick ≤ k colours from a candidate set minimising the summed squared OKLab
 * error: greedy forward selection, then swap refinement.
 */
function selectSubset(hist: Hist, candidates: Lab[], fixed: Lab[], k: number): number[] {
  const { size, w } = hist;
  const dist = candidates.map((c) => {
    const d = new Float32Array(size);
    for (let b = 0; b < size; b++) d[b] = d2(hist.lab, b, c);
    return d;
  });
  // Start from a finite ceiling (larger than any OKLab distance²) so gains stay comparable.
  const fixedBest = new Float32Array(size).fill(10);
  for (const f of fixed) for (let b = 0; b < size; b++) fixedBest[b] = Math.min(fixedBest[b], d2(hist.lab, b, f));

  const chosen: number[] = [];
  const best = Float32Array.from(fixedBest);
  const limit = Math.min(k, candidates.length);
  while (chosen.length < limit) {
    let bestGain = 0;
    let pick = -1;
    for (let c = 0; c < candidates.length; c++) {
      if (chosen.includes(c)) continue;
      const dc = dist[c];
      let gain = 0;
      for (let b = 0; b < size; b++) if (dc[b] < best[b]) gain += (best[b] - dc[b]) * w[b];
      if (gain > bestGain) {
        bestGain = gain;
        pick = c;
      }
    }
    if (pick < 0 || (bestGain <= 1e-9 && chosen.length > 0)) break;
    chosen.push(pick);
    const dp = dist[pick];
    for (let b = 0; b < size; b++) if (dp[b] < best[b]) best[b] = dp[b];
  }

  // Swap refinement using nearest / second-nearest bookkeeping (O(bins) per trial).
  const cost = (set: number[]) => {
    let s = 0;
    for (let b = 0; b < size; b++) {
      let m = fixedBest[b];
      for (const c of set) if (dist[c][b] < m) m = dist[c][b];
      s += m * w[b];
    }
    return s;
  };
  let current = cost(chosen);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let si = 0; si < chosen.length; si++) {
      // Best distance per bin without chosen[si].
      const without = Float32Array.from(fixedBest);
      for (let sj = 0; sj < chosen.length; sj++) {
        if (sj === si) continue;
        const d = dist[chosen[sj]];
        for (let b = 0; b < size; b++) if (d[b] < without[b]) without[b] = d[b];
      }
      for (let c = 0; c < candidates.length; c++) {
        if (chosen.includes(c)) continue;
        const dc = dist[c];
        let s = 0;
        for (let b = 0; b < size; b++) s += Math.min(without[b], dc[b]) * w[b];
        if (s < current - 1e-9) {
          current = s;
          chosen[si] = c;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  return chosen;
}

/** Deterministic PRNG so the palette does not flicker between recomputes. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted k-means++ in OKLab. Fixed centres take part in assignment but never move. */
function kmeans(hist: Hist, k: number, fixed: Lab[]): Lab[] {
  const { size, w, lab } = hist;
  if (k <= 0 || size === 0) return [];
  const rand = mulberry32(1337);
  const centers: Lab[] = [];
  const best = new Float32Array(size).fill(Infinity);
  for (const f of fixed) for (let b = 0; b < size; b++) best[b] = Math.min(best[b], d2(lab, b, f));

  const pushCenter = (b: number) => {
    const c: Lab = [lab[b * 3], lab[b * 3 + 1], lab[b * 3 + 2]];
    centers.push(c);
    for (let i = 0; i < size; i++) best[i] = Math.min(best[i], d2(lab, i, c));
  };

  if (fixed.length === 0) {
    let heavy = 0;
    for (let b = 1; b < size; b++) if (w[b] > w[heavy]) heavy = b;
    pushCenter(heavy);
  }
  while (centers.length < Math.min(k, size)) {
    let total = 0;
    for (let b = 0; b < size; b++) total += best[b] * w[b];
    if (total <= 1e-12) break;
    let r = rand() * total;
    let pick = size - 1;
    for (let b = 0; b < size; b++) {
      r -= best[b] * w[b];
      if (r <= 0) { pick = b; break; }
    }
    pushCenter(pick);
  }

  const all = () => [...fixed, ...centers];
  const assign = new Int32Array(size);
  for (let it = 0; it < 18; it++) {
    const cs = all();
    for (let b = 0; b < size; b++) {
      let m = Infinity, mi = 0;
      for (let c = 0; c < cs.length; c++) {
        const d = d2(lab, b, cs[c]);
        if (d < m) { m = d; mi = c; }
      }
      assign[b] = mi;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let b = 0; b < size; b++) {
      const ci = assign[b] - fixed.length;
      if (ci < 0) continue;
      const s = sums[ci];
      s[0] += lab[b * 3] * w[b];
      s[1] += lab[b * 3 + 1] * w[b];
      s[2] += lab[b * 3 + 2] * w[b];
      s[3] += w[b];
    }
    let moved = 0;
    centers.forEach((c, i) => {
      const s = sums[i];
      if (s[3] === 0) return;
      const nc: Lab = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      moved = Math.max(moved, Math.abs(nc[0] - c[0]) + Math.abs(nc[1] - c[1]) + Math.abs(nc[2] - c[2]));
      centers[i] = nc;
    });
    if (moved < 1e-4) break;
  }
  return centers;
}

function nearestInventory(lab: Lab, inv: { c: Filament; lab: Lab }[]) {
  let best = inv[0];
  let bd = Infinity;
  for (const e of inv) {
    const d = deltaE(lab, e.lab);
    if (d < bd) { bd = d; best = e; }
  }
  return { entry: best, dE: bd };
}

export interface PaletteOptions {
  mode: ColorMode;
  maxColors: number;
  inventory: Filament[];
  /** Hex of the outside-image fill, or null when no fill is needed. */
  fill: string | null;
}

export function buildPalette(grid: Grid, opts: PaletteOptions): PaletteEntry[] {
  const inv = opts.inventory.filter((c) => c.enabled).map((c) => ({ c, lab: hexToOklab(c.hex) }));
  const maxColors = Math.max(1, Math.round(opts.maxColors));
  const hist = histogram(grid);
  const out: PaletteEntry[] = [];

  if (opts.mode === 'inventory' && inv.length > 0) {
    let fixedInv: (typeof inv)[number] | null = null;
    if (opts.fill) {
      fixedInv = nearestInventory(hexToOklab(opts.fill), inv).entry;
      out.push({ hex: fixedInv.c.hex, name: fixedInv.c.name, lab: fixedInv.lab, kind: 'inventory', isFill: true, inventoryId: fixedInv.c.id });
    }
    const candidates = inv.filter((e) => e !== fixedInv);
    const picked = hist.size ? selectSubset(hist, candidates.map((e) => e.lab), fixedInv ? [fixedInv.lab] : [], maxColors - out.length) : [];
    for (const i of picked) {
      const e = candidates[i];
      out.push({ hex: e.c.hex, name: e.c.name, lab: e.lab, kind: 'inventory', isFill: false, inventoryId: e.c.id });
    }
    return out;
  }

  // Free mode: ideal colours straight from the image, with the closest inventory match as a hint.
  const fixed: Lab[] = [];
  if (opts.fill) {
    const lab = hexToOklab(opts.fill);
    fixed.push(lab);
    out.push({ hex: opts.fill, name: '', lab, kind: 'free', isFill: true });
  }
  const centers = kmeans(hist, maxColors - fixed.length, fixed);
  centers.forEach((c) => {
    const hex = oklabToHex(c[0], c[1], c[2]);
    out.push({ hex, name: '', lab: hexToOklab(hex), kind: 'free', isFill: false });
  });
  if (inv.length) {
    for (const e of out) {
      const m = nearestInventory(e.lab, inv);
      e.match = { name: m.entry.c.name, hex: m.entry.c.hex, dE: m.dE };
    }
  }
  return out;
}

/**
 * Map every cell to a palette index (−1 = bare rope). Optional Floyd–Steinberg
 * dithering spreads quantisation error across neighbouring ropes and rows.
 */
export function mapToPalette(grid: Grid, palette: PaletteEntry[], dither: number, outsideIdx: number): Int16Array {
  const { n, rows } = grid;
  const cells = n * rows;
  const idx = new Int16Array(cells).fill(-1);
  const P = palette.length;
  if (P === 0) return idx;
  const pl = new Float32Array(P * 3);
  palette.forEach((p, i) => pl.set(p.lab, i * 3));

  const nearest = (L: number, a: number, b: number) => {
    let m = Infinity, mi = 0;
    for (let i = 0; i < P; i++) {
      const dL = L - pl[i * 3], da = a - pl[i * 3 + 1], db = b - pl[i * 3 + 2];
      const d = dL * dL + da * da + db * db;
      if (d < m) { m = d; mi = i; }
    }
    return mi;
  };

  if (dither <= 0) {
    for (let c = 0; c < cells; c++) {
      idx[c] = grid.valid[c] ? nearest(grid.lab[c * 3], grid.lab[c * 3 + 1], grid.lab[c * 3 + 2]) : outsideIdx;
    }
    return idx;
  }

  const work = Float32Array.from(grid.lab);
  const s = Math.min(1, dither);
  const spread = (i: number, j: number, eL: number, ea: number, eb: number, f: number) => {
    if (i < 0 || i >= n || j >= rows) return;
    const c = j * n + i;
    if (!grid.valid[c]) return;
    work[c * 3] += eL * f;
    work[c * 3 + 1] += ea * f;
    work[c * 3 + 2] += eb * f;
  };
  for (let j = 0; j < rows; j++) {
    const ltr = j % 2 === 0;
    for (let t = 0; t < n; t++) {
      const i = ltr ? t : n - 1 - t;
      const c = j * n + i;
      if (!grid.valid[c]) { idx[c] = outsideIdx; continue; }
      const L = Math.max(-0.1, Math.min(1.1, work[c * 3]));
      const a = work[c * 3 + 1];
      const b = work[c * 3 + 2];
      const k = nearest(L, a, b);
      idx[c] = k;
      const eL = (L - pl[k * 3]) * s, ea = (a - pl[k * 3 + 1]) * s, eb = (b - pl[k * 3 + 2]) * s;
      const dir = ltr ? 1 : -1;
      spread(i + dir, j, eL, ea, eb, 7 / 16);
      spread(i - dir, j + 1, eL, ea, eb, 3 / 16);
      spread(i, j + 1, eL, ea, eb, 5 / 16);
      spread(i + dir, j + 1, eL, ea, eb, 1 / 16);
    }
  }
  return idx;
}
