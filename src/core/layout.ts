// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import type { MessageKey } from '../i18n';
import { STEP_MAX, STEP_MIN, type Params } from './state';

export interface Warning {
  level: 'info' | 'warn' | 'error';
  key: MessageKey;
  vars?: Record<string, string | number>;
}

/**
 * Physical layout of the curtain. Coordinates are mm in "opening space":
 * x = 0 at the centre of the opening, y = 0 at the floor.
 */
export interface Layout {
  W: number;
  H: number;
  railY: number;
  zoneTop: number;
  zoneBottom: number;
  zoneH: number;

  n: number;
  pitch: number;
  ropeX: Float32Array;
  ropeD: number;
  beadOD: number;
  hole: number;
  wall: number;

  /** Sample size along the rope = the shortest bead. */
  step: number;
  rows: number;

  gridLeft: number;
  gridRight: number;
  gridTop: number;
  gridBottom: number;

  warnings: Warning[];
}

export const MAX_CELLS = 220_000;
export const RAIL_DROP = 22; // rail centre below top of opening
export const MIN_WALL = 0.8;
export const MAX_ROPES = 100; // upper limit when choosing ropes by count

/** Chamfer slope against the build plate. Steeper than 45° so the underside prints cleanly without support. */
export const CHAMFER_ANGLE = 55;

/**
 * Outer-edge chamfer of one bead: horizontal width `w` (the slider value) and
 * vertical height `h` from the slope. Kept inside the wall and below half the
 * bead's length. Works in any unit, as long as all inputs share it.
 */
export function chamferSize(width: number, length: number, wall: number): { w: number; h: number } {
  const slope = Math.tan((CHAMFER_ANGLE * Math.PI) / 180);
  let w = Math.max(0, Math.min(width, wall * 0.9));
  let h = w * slope;
  if (h > length * 0.45) {
    h = length * 0.45;
    w = h / slope;
  }
  return { w, h };
}

/**
 * Bead lengths in mm: `count` values spread evenly from the shortest to the
 * longest bead (both always included), rounded to 0.5 mm.
 */
export function beadLengths(min: number, max: number, count: number): number[] {
  const lo = Math.min(STEP_MAX, Math.max(STEP_MIN, min));
  const hi = Math.min(STEP_MAX, Math.max(lo, max));
  const K = Math.max(1, Math.min(8, Math.round(count)));
  if (K === 1 || hi - lo < 0.5) return [lo];
  const out = new Set<number>();
  for (let i = 0; i < K; i++) out.add(Math.round((lo + (i * (hi - lo)) / (K - 1)) * 2) / 2);
  return [...out].sort((a, b) => a - b);
}

export function computeLayout(p: Params): Layout {
  const warnings: Warning[] = [];
  const o = p.opening;
  const r = p.ropes;

  const W = Math.max(100, o.width);
  const H = Math.max(200, o.height);
  const railY = H - RAIL_DROP;
  const zoneTop = H - Math.min(Math.max(o.topOffset, RAIL_DROP + 10), H - 60);
  const zoneBottom = Math.min(Math.max(0, o.bottomClearance), zoneTop - 40);
  const zoneH = zoneTop - zoneBottom;

  const sideGap = Math.max(0, r.sideGap);
  const usable = Math.max(10, W - 2 * Math.max(0, o.sideMargin));

  // Ropes are spaced on a pitch grid; the outermost bead edges must stay inside
  // the usable width: n·pitch − gap ≤ usable. Whatever is left over is split
  // evenly on both sides, which centres the distribution in the opening.
  let n: number;
  let pitch: number;
  if (r.density === 'count') {
    n = Math.max(1, Math.min(MAX_ROPES, Math.round(r.count)));
    pitch = (usable + sideGap) / n;
  } else {
    pitch = Math.max(1, r.pitch);
    n = Math.max(1, Math.min(1000, Math.floor((usable + sideGap) / pitch + 1e-6)));
  }

  const ropeD = Math.max(0.2, r.diameter);
  const hole = ropeD + Math.max(0, r.holeClearance);
  let beadOD = pitch - sideGap;
  if (beadOD <= hole + 0.4) {
    warnings.push({ level: 'error', key: 'wNoWall', vars: { od: beadOD.toFixed(1), hole: hole.toFixed(1) } });
    beadOD = hole + 0.4;
  }
  const wall = (beadOD - hole) / 2;
  if (wall < MIN_WALL && wall >= 0.2) {
    warnings.push({ level: 'warn', key: 'wThinWall', vars: { wall: wall.toFixed(2), min: MIN_WALL } });
  }

  const ropeX = new Float32Array(n);
  for (let i = 0; i < n; i++) ropeX[i] = (i - (n - 1) / 2) * pitch;

  const step = Math.min(STEP_MAX, Math.max(STEP_MIN, p.resolution.step));
  let rows = Math.max(1, Math.floor(zoneH / step + 1e-6));
  if (n * rows > MAX_CELLS) {
    rows = Math.max(1, Math.floor(MAX_CELLS / n));
    warnings.push({ level: 'warn', key: 'wCapped', vars: { n: MAX_CELLS.toLocaleString() } });
  }

  return {
    W, H, railY, zoneTop, zoneBottom, zoneH,
    n, pitch, ropeX, ropeD, beadOD, hole, wall,
    step, rows,
    gridLeft: ropeX[0] - pitch / 2,
    gridRight: ropeX[n - 1] + pitch / 2,
    gridTop: zoneTop,
    gridBottom: zoneTop - rows * step,
    warnings,
  };
}
