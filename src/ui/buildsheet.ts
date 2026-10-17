// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import type { Design } from '../core/design';
import { bomCsv, download, stringingCsv } from '../core/export';
import { PRINTERS, type PrinterId } from '../core/state';
import { planTrays, traysZip } from '../core/trays';
import { paletteLabels, t } from '../i18n';
import { fmt, int, pct, segmented, type Ctx } from './controls';
import { h, ICONS, svgIcon } from './dom';

function drawPattern(canvas: HTMLCanvasElement, d: Design): void {
  const L = d.layout;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // Measure the wrapper, not the canvas (its size is set below).
  const wrap = canvas.parentElement;
  const cssW = Math.max(120, (wrap?.clientWidth ?? 300) - 24);
  const gw = L.gridRight - L.gridLeft;
  const top = L.zoneTop;
  let bottom = L.zoneTop - 1;
  for (let i = 0; i < L.n; i++) bottom = Math.min(bottom, d.ropeBottom[i]);
  const gh = Math.max(1, top - bottom);
  const maxH = 380;
  const s = Math.min(cssW / gw, maxH / gh);
  const w = Math.round(gw * s);
  const hgt = Math.round(gh * s);
  canvas.style.height = `${hgt}px`;
  canvas.style.width = `${w}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
  g.fillStyle = '#f6f6f4';
  g.fillRect(0, 0, gw, gh);

  // ropes
  g.fillStyle = 'rgba(0,0,0,0.16)';
  const rw = Math.max(L.ropeD, 0.6 / s);
  for (let i = 0; i < L.n; i++) g.fillRect(L.ropeX[i] - L.gridLeft - rw / 2, 0, rw, top - d.ropeBottom[i]);

  const seam = s * L.pitch > 3 ? 0.6 / s : 0;
  for (let ci = 0; ci < d.palette.length; ci++) {
    g.fillStyle = d.palette[ci].hex;
    for (let k = 0; k < d.beadCount; k++) {
      if (d.bColor[k] !== ci) continue;
      const len = d.lengths[d.bLen[k]];
      const x = L.ropeX[d.bRope[k]] - L.beadOD / 2 - L.gridLeft;
      const y = top - (d.bY[k] + len / 2);
      g.fillRect(x, y, L.beadOD, Math.max(0.2, len - seam));
    }
  }
}

export function buildSheet(ctx: Ctx): HTMLElement {
  const canvas = h('canvas', { class: 'pattern', 'aria-label': t('patternAria') });
  const stats = h('div', { class: 'stats' });
  // Each stat tile has its own shade; the details that belong to it share that shade.
  const ropeSpecs = h('dl', { class: 'specs group g-ropes' });
  const beadSpecs = h('dl', { class: 'specs group g-beads' });
  const colors = h('div', { class: 'table' });
  const lengths = h('div', { class: 'len-list' });
  const bom = h('div', { class: 'bom-wrap' });
  const warnings = h('div', { class: 'warnings' });
  const traysInfo = h('p', { class: 'hint' });
  let latest: Design | null = null;

  const exportBom = () => latest && download('bead-curtain-bom.csv', bomCsv(latest));
  const exportGuide = () => latest && download('bead-curtain-stringing-guide.csv', stringingCsv(latest));
  const exportTrays = () => {
    if (!latest) return;
    const printer = ctx.store.get().params.export.printer;
    download(`bead-curtain-trays-${printer}.zip`, new Blob([traysZip(latest, printer)], { type: 'application/zip' }));
  };

  const printer = segmented(ctx, {
    options: (Object.keys(PRINTERS) as PrinterId[]).map((id) => ({ value: id, label: PRINTERS[id].label, title: `${PRINTERS[id].w} × ${PRINTERS[id].d} mm` })),
    get: (p) => p.export.printer,
    set: (p, v) => (p.export.printer = v),
  });
  const updateTrays = () => {
    if (!latest) return;
    const id = ctx.store.get().params.export.printer;
    const pl = PRINTERS[id];
    traysInfo.textContent = t('traysSummary', { n: planTrays(latest, id).trays.length, size: `${pl.w} × ${pl.d}` });
  };
  ctx.onState.push(updateTrays);

  ctx.onDesign.push((d) => {
    latest = d;
    const L = d.layout;
    drawPattern(canvas, d);
    updateTrays();

    stats.replaceChildren(
      ...[
        ['g-ropes', t('statRopes'), int(L.n)],
        ['g-beads', t('statBeads'), int(d.beadCount)],
        ['g-colours', t('statColours'), String(d.palette.length)],
        ['g-lengths', t('statLengths'), String(d.lengthCounts.filter((c) => c > 0).length)],
      ].map(([group, label, value]) => h('div', { class: `stat ${group}` }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label))),
    );

    const rows = (list: [string, string][]) => list.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]);
    const maxRope = Math.max(...Array.from(d.ropeLengths));
    ropeSpecs.replaceChildren(
      ...rows([
        [t('ropeDia'), `${fmt(L.ropeD)} mm`],
        [t('ropeSpacing'), `${fmt(L.pitch, 2)} mm`],
        [t('specRopeEach'), `≤ ${fmt(maxRope / 1000, 2)} m`],
        [t('specRopeTotal'), `${fmt(d.totalRope / 1000, 1)} m`],
      ]),
    );
    beadSpecs.replaceChildren(
      ...rows([
        [t('specBeadOD'), `${fmt(L.beadOD)} mm`],
        [t('holeDia'), `${fmt(L.hole, 2)} mm`],
        [t('wall'), `${fmt(L.wall, 2)} mm`],
        [t('specFilament'), `${fmt(d.totalGrams / 1000, 2)} kg`],
      ]),
    );

    const total = Math.max(1, d.beadCount);
    const labels = paletteLabels(d.palette);
    colors.replaceChildren(
      ...d.palette.map((p, ci) =>
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'dot', style: { background: p.hex } }),
          h(
            'span',
            { class: 'row-name' },
            h('b', {}, labels[ci], p.isFill ? h('i', { class: 'tag' }, t('fillTag')) : null),
            p.match ? h('small', {}, h('span', { class: 'dot dot-sm', style: { background: p.match.hex } }), `≈ ${p.match.name} · ΔE ${fmt(p.match.dE, 1)}`) : h('small', {}, p.hex.toUpperCase()),
          ),
          h('span', { class: 'row-num' }, h('b', {}, int(d.colorCounts[ci])), h('small', {}, `${pct((d.colorCounts[ci] / total) * 100)} · ${int(d.grams[ci])} g`)),
          h('span', { class: 'bar', style: { '--w': `${(d.colorCounts[ci] / total) * 100}%`, '--c': p.hex } }),
        ),
      ),
    );

    lengths.replaceChildren(
      ...d.lengths.map((l, li) => h('div', { class: `len-row${d.lengthCounts[li] ? '' : ' unused'}` }, h('span', { class: 'len-pill', style: { '--h': `${Math.min(40, 8 + l * 0.4)}px` } }), h('b', {}, `${l} mm`), h('span', {}, `× ${int(d.lengthCounts[li])}`))),
    );

    const head = h('tr', {}, h('th', {}, ''), ...d.lengths.map((l) => h('th', {}, `${l}`)), h('th', {}, 'Σ'));
    const body = d.palette.map((p, ci) =>
      h('tr', {}, h('td', {}, h('span', { class: 'dot dot-sm', style: { background: p.hex } }), labels[ci]), ...d.bom[ci].map((v) => h('td', {}, v ? int(v) : '·')), h('td', {}, h('b', {}, int(d.colorCounts[ci])))),
    );
    bom.replaceChildren(h('table', { class: 'bom' }, h('thead', {}, head), h('tbody', {}, body)));

    warnings.replaceChildren(
      ...d.warnings.map((w) => h('div', { class: `warning ${w.level}` }, svgIcon(ICONS.warn, 15), h('span', {}, t(w.key, w.vars)))),
    );
  });

  return h(
    'aside',
    { class: 'sheet', 'aria-label': t('buildSheet') },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('buildSheet'))),
    warnings,
    h('div', { class: 'pattern-wrap' }, canvas),
    stats,
    ropeSpecs,
    beadSpecs,
    h('div', { class: 'group g-colours' }, h('h3', {}, t('pColours')), colors),
    h('div', { class: 'group g-lengths' }, h('h3', {}, t('hLengths')), lengths),
    h('details', { class: 'more' }, h('summary', {}, t('matrix')), bom),
    h(
      'div',
      { class: 'btn-col' },
      h('button', { type: 'button', class: 'btn btn-dark btn-block', onClick: exportBom }, svgIcon(ICONS.download, 16), t('bomCsv')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onClick: exportGuide }, svgIcon(ICONS.download, 16), t('guideCsv')),
    ),
    h(
      'section',
      { class: 'trays' },
      h('h3', {}, t('trays')),
      printer,
      traysInfo,
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: exportTrays }, svgIcon(ICONS.layers, 17), t('exportTrays')),
    ),
  );
}
