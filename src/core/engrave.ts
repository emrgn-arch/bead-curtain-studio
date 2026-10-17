// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
// Bead numbers engraved into the top face: "rope-bead" (3-12 = rope 3, twelfth
// bead from the bottom knot), set in a blocky digit font that stays readable as
// a 1 mm deep groove on an FDM print, curved around the bore and centred at the
// top of the bead (+y), reading clockwise when seen from above.

import type { Design } from './design';

export type P2 = [number, number];
/** One glyph cut into the top: its grid placed on the bead, and which cells go. */
export interface GlyphCut {
  /** nodes[i][j]: row line i (0 = top of the glyph) crossing column line j, bead mm. */
  nodes: P2[][];
  /** cut[i][j]: the cell between row lines i, i + 1 and column lines j, j + 1 is engraved. */
  cut: boolean[][];
}

export const ENGRAVE_DEPTH = 1; // mm
const CLEAR = 0.8; // mm of flat top kept around the bore and inside the chamfer
const MAX_ARC = 1.5 * Math.PI; // a label never wraps more than 270° around the bore
const H_MAX = 4; // mm
const H_MIN = 2.4; // mm, below this the numbers would not print legibly

// Glyphs on a 5-row grid; rows are stroke, gap, stroke, gap, stroke. Column
// kinds: s = stroke width, c = counter width, d = dash width.
const GLYPHS: Record<string, { cols: string; rows: string[] }> = {
  '0': { cols: 'scs', rows: ['###', '#.#', '#.#', '#.#', '###'] },
  '1': { cols: 'sss', rows: ['.#.', '##.', '.#.', '.#.', '###'] },
  '2': { cols: 'scs', rows: ['###', '..#', '###', '#..', '###'] },
  '3': { cols: 'scs', rows: ['###', '..#', '###', '..#', '###'] },
  '4': { cols: 'scs', rows: ['#.#', '#.#', '###', '..#', '..#'] },
  '5': { cols: 'scs', rows: ['###', '#..', '###', '..#', '###'] },
  '6': { cols: 'scs', rows: ['###', '#..', '###', '#.#', '###'] },
  '7': { cols: 'scs', rows: ['###', '..#', '..#', '..#', '..#'] },
  '8': { cols: 'scs', rows: ['###', '#.#', '###', '#.#', '###'] },
  '9': { cols: 'scs', rows: ['###', '#.#', '###', '..#', '###'] },
  '-': { cols: 'd', rows: ['.', '.', '#', '.', '.'] },
};

interface Metrics {
  /** Glyph height, stroke, counter, dash and letter gap, mm. */
  h: number;
  s: number;
  c: number;
  d: number;
  gap: number;
}

function metrics(h: number): Metrics {
  const s = Math.max(0.18 * h, 0.5);
  return { h, s, c: 0.26 * h, d: 0.4 * h, gap: Math.max(0.2 * h, 0.5) };
}

function colWidths(ch: string, m: Metrics): number[] {
  return [...GLYPHS[ch].cols].map((k) => (k === 's' ? m.s : k === 'c' ? m.c : m.d));
}

const glyphWidth = (ch: string, m: Metrics) => colWidths(ch, m).reduce((a, b) => a + b, 0);
const textWidth = (text: string, m: Metrics) => [...text].reduce((w, ch) => w + glyphWidth(ch, m), 0) + (text.length - 1) * m.gap;

/** Where a design's labels go: glyph height and the radius of their inner edge. */
export interface LabelLayout {
  h: number;
  rb: number;
}

/** 1-based place of every bead on its rope, from the bottom knot up (threading order). */
export function beadNumbers(d: Design): Uint16Array {
  const seq = new Uint16Array(d.beadCount);
  const byRope: number[][] = Array.from({ length: d.layout.n }, () => []);
  for (let k = 0; k < d.beadCount; k++) byRope[d.bRope[k]].push(k);
  for (const list of byRope) {
    list.sort((a, b) => d.bY[a] - d.bY[b]);
    list.forEach((k, i) => (seq[k] = i + 1));
  }
  return seq;
}

/**
 * One size for every label of the design: as tall as fits between the bore
 * and the chamfer while the widest label spans at most MAX_ARC. Null when the
 * beads are too small for legible numbers.
 */
export function labelLayout(labels: string[], R: number, r: number, chamfer: number): LabelLayout | null {
  if (!labels.length) return null;
  const outer = R - Math.min(chamfer, (R - r) * 0.9) - CLEAR;
  // Widths only depend on where the narrow 1s are, so a few shapes stand for all labels.
  const shapes = [...new Set(labels.map((l) => l.replace(/[02-9]/g, '0')))];
  for (let h = H_MAX; h >= H_MIN - 1e-9; h -= 0.05) {
    const m = metrics(h);
    const W = Math.max(...shapes.map((l) => textWidth(l, m)));
    const rb = Math.max(r + CLEAR, W / MAX_ARC);
    const half = Math.max(...Object.keys(GLYPHS).map((ch) => glyphWidth(ch, m))) / 2;
    if (Math.hypot(rb + h, half) <= outer) return { h: Math.round(h * 100) / 100, rb };
  }
  return null;
}

/** The engraved glyphs of one label, in bead coordinates (mm, bore at the origin). */
export function labelCuts(text: string, lay: LabelLayout): GlyphCut[] {
  const m = metrics(lay.h);
  const W = textWidth(text, m);
  const gapH = (m.h - 3 * m.s) / 2;
  const ys = [m.h];
  for (const v of [m.s, gapH, m.s, gapH, m.s]) ys.push(ys[ys.length - 1] - v);
  const out: GlyphCut[] = [];
  let u = 0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    const gw = glyphWidth(ch, m);
    const xs = [0];
    for (const w of colWidths(ch, m)) xs.push(xs[xs.length - 1] + w);
    // Glyph centre on the arc; its baseline is the chord at distance rb.
    const theta = Math.PI / 2 + (W / 2 - (u + gw / 2)) / lay.rb;
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);
    const place = (x: number, y: number): P2 => [lay.rb * nx + (x - gw / 2) * ny + y * nx, lay.rb * ny - (x - gw / 2) * nx + y * ny];
    out.push({ nodes: ys.map((y) => xs.map((x) => place(x, y))), cut: g.rows.map((row) => [...row].map((c) => c === '#')) });
    u += gw + m.gap;
  }
  return out;
}
