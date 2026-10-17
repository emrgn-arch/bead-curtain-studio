// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import { paletteLabels, t } from '../i18n';
import type { Design } from './design';

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(','))
    .join('\r\n');
}

/** Bead counts per colour × length plus filament estimate. */
export function bomCsv(d: Design): string {
  const labels = paletteLabels(d.palette);
  const rows: (string | number)[][] = [[t('csvColour'), 'Hex', ...d.lengths.map((l) => `${l} mm`), t('csvTotalBeads'), t('csvPla')]];
  d.palette.forEach((p, ci) => {
    const name = p.match ? `${labels[ci]} (≈ ${p.match.name})` : labels[ci];
    rows.push([name, p.hex.toUpperCase(), ...d.bom[ci], d.colorCounts[ci], Math.round(d.grams[ci])]);
  });
  rows.push([t('csvTotal'), '', ...d.lengthCounts, d.beadCount, Math.round(d.totalGrams)]);
  rows.push([]);
  const L = d.layout;
  rows.push([t('csvBeadOD'), L.beadOD.toFixed(2)]);
  rows.push([t('csvHole'), L.hole.toFixed(2)]);
  rows.push([t('csvRope'), L.ropeD.toFixed(2)]);
  rows.push([t('csvRopes'), L.n]);
  rows.push([t('csvPitch'), L.pitch.toFixed(2)]);
  rows.push([t('csvRopeTotal'), (d.totalRope / 1000).toFixed(1)]);
  return csv(rows);
}

/**
 * Per-rope threading order. Ropes are numbered left → right as seen from the
 * front; beads are listed bottom → top, i.e. the order they go onto the rope
 * after tying the bottom knot.
 */
export function stringingCsv(d: Design): string {
  const labels = paletteLabels(d.palette);
  const rows: (string | number)[][] = [[t('csvRopeNo'), t('csvX'), t('csvStep'), t('csvColour'), 'Hex', t('csvLength'), t('csvQty')]];
  const byRope: number[][] = Array.from({ length: d.layout.n }, () => []);
  for (let k = 0; k < d.beadCount; k++) byRope[d.bRope[k]].push(k);
  byRope.forEach((beads, rope) => {
    beads.sort((a, b) => d.bY[a] - d.bY[b]);
    let step = 0;
    for (let i = 0; i < beads.length; ) {
      const k = beads[i];
      let j = i + 1;
      while (j < beads.length && d.bColor[beads[j]] === d.bColor[k] && d.bLen[beads[j]] === d.bLen[k]) j++;
      const c = d.bColor[k];
      rows.push([rope + 1, d.layout.ropeX[rope].toFixed(1), ++step, labels[c], d.palette[c].hex.toUpperCase(), d.lengths[d.bLen[k]], j - i]);
      i = j;
    }
  });
  return csv(rows);
}

export function download(filename: string, content: string | Blob, type = 'text/csv;charset=utf-8'): void {
  const blob = typeof content === 'string' ? new Blob(type.startsWith('text/csv') ? ['﻿', content] : [content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
