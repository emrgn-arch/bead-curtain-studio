// Fitting bead lengths along a rope.
//
// Each rope is a column of sampled cells. Consecutive cells of the same colour
// form a "run", which is filled with beads from the available lengths. A run
// may end up a few millimetres longer or shorter than the image says when that
// saves beads; the running position carries forward, so the next run corrects
// for it and the error never accumulates.

export interface Run {
  /** Palette index, −1 for bare rope. */
  color: number;
  /** End of the run, mm down from the top of the beaded zone. */
  end: number;
}

export interface PlacedBead {
  /** Top of the bead, mm down from the top of the beaded zone. */
  top: number;
  /** Index into the length list. */
  len: number;
  color: number;
}

export interface LengthTable {
  lengths: number[];
  units: number[];
  M: number;
  /** count[s] = fewest beads summing to exactly s units, −1 if unreachable. */
  count: Int32Array;
  /** Length index used last for sum s. */
  last: Int32Array;
  /** best[t] = sum to use for a run of t units (balances accuracy against bead count). */
  best: Int32Array;
}

const RES = 0.5; // mm per unit
/** One extra bead is worth this fraction of the shortest bead in placement error. */
const BEAD_PENALTY = 0.25;

export function ropeRuns(idx: Int16Array, n: number, rows: number, rope: number, step: number): Run[] {
  const runs: Run[] = [];
  let cur = idx[rope];
  for (let j = 1; j <= rows; j++) {
    const c = j < rows ? idx[j * n + rope] : -32768;
    if (c !== cur) {
      runs.push({ color: cur, end: j * step });
      cur = c;
    }
  }
  return runs;
}

export function buildTable(lengths: number[], maxMm: number): LengthTable {
  const units = lengths.map((l) => Math.max(1, Math.round(l / RES)));
  const shortest = Math.min(...units);
  const M = Math.ceil(maxMm / RES) + Math.max(...units) + 1;

  // Fewest beads for every exactly reachable sum (unbounded coin change).
  const count = new Int32Array(M + 1).fill(-1);
  const last = new Int32Array(M + 1).fill(-1);
  count[0] = 0;
  for (let k = 1; k <= M; k++) {
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (k < u || count[k - u] < 0) continue;
      const c = count[k - u] + 1;
      if (count[k] < 0 || c < count[k] || (c === count[k] && u > units[last[k]])) {
        count[k] = c;
        last[k] = i;
      }
    }
  }

  // For each target pick the sum minimising |error| + penalty × beads, looking
  // no further than one shortest bead either way.
  const penalty = BEAD_PENALTY * shortest;
  const best = new Int32Array(M + 1);
  for (let t = 0; t <= M; t++) {
    let pick = 0;
    let cost = t;
    for (let s = Math.max(1, t - shortest); s <= Math.min(M, t + shortest); s++) {
      if (count[s] < 0) continue;
      const c = Math.abs(s - t) + penalty * count[s];
      if (c < cost - 1e-9 || (Math.abs(c - cost) < 1e-9 && Math.abs(s - t) < Math.abs(pick - t))) {
        cost = c;
        pick = s;
      }
    }
    best[t] = pick;
  }
  return { lengths, units, M, count, last, best };
}

/** Length indices summing to s units, longest first. */
function decompose(t: LengthTable, s: number): number[] {
  const out: number[] = [];
  for (let k = s; k > 0 && t.last[k] >= 0; k -= t.units[t.last[k]]) out.push(t.last[k]);
  return out.sort((a, b) => t.units[b] - t.units[a]);
}

/** Walk one rope's runs top to bottom and push its beads into `out`. */
export function fitRope(runs: Run[], t: LengthTable, out: PlacedBead[]): void {
  let P = 0; // units
  for (const r of runs) {
    const end = Math.round(r.end / RES);
    if (r.color < 0) {
      if (end > P) P = end;
      continue;
    }
    const T = end - P;
    if (T <= 0) continue;
    for (const li of decompose(t, t.best[Math.min(t.M, T)])) {
      out.push({ top: P * RES, len: li, color: r.color });
      P += t.units[li];
    }
  }
}
