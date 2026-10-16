import { isLight } from '../core/color';
import { download } from '../core/export';
import { beadLengths, MAX_ROPES } from '../core/layout';
import { OPENING_PRESETS, STEP_MAX, STEP_MIN, parseFilaments, type AppState, type Filament } from '../core/state';
import { t } from '../i18n';
import { colorField, dualRange, fmt, hint, panel, range, readout, segmented, setParams, showIf, type Ctx } from './controls';
import { h, ICONS, svgIcon } from './dom';

export interface SidebarActions {
  openFile: () => void;
  useDemo: () => void;
  setOverlay: (on: boolean) => void;
  preview: () => HTMLCanvasElement | null;
}

// ---------------------------------------------------------------- 01 image

function imagePanel(ctx: Ctx, a: SidebarActions) {
  const thumb = h('canvas', { class: 'thumb-canvas', width: 120, height: 160 });
  const name = h('b', {});
  const drop = h(
    'button',
    { type: 'button', class: 'dropzone', onClick: a.openFile },
    h('span', { class: 'thumb' }, thumb),
    h('span', { class: 'drop-text' }, h('span', { class: 'drop-title' }, t('dropTitle')), h('span', {}, t('dropSub')), name),
    svgIcon(ICONS.upload, 20),
  );
  let lastVersion = -1;
  ctx.onState.push((s) => {
    name.textContent = s.ui.imageName || t('demoName');
    if (s.ui.imageVersion === lastVersion) return;
    lastVersion = s.ui.imageVersion;
    const src = a.preview();
    const g = thumb.getContext('2d')!;
    g.clearRect(0, 0, thumb.width, thumb.height);
    if (!src) return;
    const sc = Math.max(thumb.width / src.width, thumb.height / src.height);
    g.drawImage(src, (thumb.width - src.width * sc) / 2, (thumb.height - src.height * sc) / 2, src.width * sc, src.height * sc);
  });

  const placeBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block btn-place' });
  placeBtn.addEventListener('click', () => a.setOverlay(!ctx.store.get().ui.overlay));
  ctx.onState.push((s) => {
    placeBtn.replaceChildren(svgIcon(s.ui.overlay ? ICONS.check : ICONS.move, 18), s.ui.overlay ? t('confirmPlacement') : t('placeImage'));
    placeBtn.classList.toggle('btn-confirm', s.ui.overlay);
  });

  const P = panel(
    'image',
    '01',
    t('pImage'),
    true,
    drop,
    h('button', { type: 'button', class: 'link', onClick: a.useDemo }, t('useDemo')),
    placeBtn,
    h(
      'details',
      { class: 'more' },
      h('summary', {}, t('adjustImage')),
      range(ctx, { label: t('brightness'), unit: '%', min: 0.5, max: 1.6, step: 0.01, scale: 100, get: (p) => p.image.brightness, set: (p, v) => (p.image.brightness = v) }),
      range(ctx, { label: t('contrast'), unit: '%', min: 0.5, max: 2, step: 0.01, scale: 100, get: (p) => p.image.contrast, set: (p, v) => (p.image.contrast = v) }),
      range(ctx, { label: t('saturation'), unit: '%', min: 0, max: 2.2, step: 0.01, scale: 100, get: (p) => p.image.saturation, set: (p, v) => (p.image.saturation = v) }),
      segmented(ctx, {
        label: t('outside'),
        options: [
          { value: 'fill', label: t('fillColour') },
          { value: 'bare', label: t('bareRope'), title: t('bareRopeTitle') },
        ],
        get: (p) => p.image.outside,
        set: (p, v) => (p.image.outside = v),
      }),
      showIf(ctx, colorField(ctx, t('fillColour'), (p) => p.image.fillColor, (p, v) => (p.image.fillColor = v)), (s) => s.params.image.outside === 'fill'),
    ),
  );
  ctx.onState.push((s) => P.setSummary(s.ui.overlay ? t('placing') : s.ui.imageName || t('demo')));
  return P.el;
}

// ---------------------------------------------------------------- 02 resolution

function resolutionPanel(ctx: Ctx) {
  const P = panel(
    'resolution',
    '02',
    t('pResolution'),
    true,
    dualRange(ctx, {
      label: t('beadLength'),
      unit: 'mm',
      min: STEP_MIN,
      max: STEP_MAX,
      step: 1,
      loLabel: t('shortestBead'),
      hiLabel: t('longestBead'),
      get: (p) => [p.resolution.step, p.resolution.maxLength],
      set: (p, lo, hi) => {
        p.resolution.step = lo;
        p.resolution.maxLength = hi;
      },
    }),
    range(ctx, { label: t('lengthCount'), min: 1, max: 8, step: 1, get: (p) => p.resolution.lengthCount, set: (p, v) => (p.resolution.lengthCount = Math.round(v)) }),
    range(ctx, { label: t('dithering'), unit: '%', min: 0, max: 1, step: 0.01, scale: 100, get: (p) => p.resolution.dither, set: (p, v) => (p.resolution.dither = v) }),
  );
  ctx.onState.push((s) => {
    const r = s.params.resolution;
    const n = beadLengths(r.step, r.maxLength, r.lengthCount).length;
    P.setSummary(`${r.step}–${r.maxLength} mm · ${t('lengthsSummary', { n })}`);
  });
  return P.el;
}

// ---------------------------------------------------------------- 03 colours

function updateFilaments(ctx: Ctx, fn: (f: Filament[]) => Filament[]): void {
  ctx.store.update((s) => {
    s.filaments = fn(s.filaments);
  });
}

function colorsPanel(ctx: Ctx) {
  const grid = h('div', { class: 'swatches' });
  let used = new Set<string>();
  let lastKey = '';
  const renderSwatches = (s: AppState) => {
    const key = JSON.stringify([s.filaments, [...used]]);
    if (key === lastKey) return;
    lastKey = key;
    grid.replaceChildren(
      ...s.filaments.map((c) =>
        h(
          'div',
          { class: `swatch${c.enabled ? '' : ' off'}${used.has(c.id) ? ' used' : ''}`, style: { '--c': c.hex }, title: `${c.name} ${c.hex.toUpperCase()}${c.enabled ? '' : ` (${t('switchedOff')})`}` },
          h(
            'button',
            {
              type: 'button',
              class: `swatch-dot${isLight(c.hex) ? ' light' : ''}`,
              'aria-label': c.enabled ? t('switchOff', { name: c.name }) : t('switchOn', { name: c.name }),
              'aria-pressed': String(c.enabled),
              onClick: () => updateFilaments(ctx, (f) => f.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x))),
            },
            used.has(c.id) ? svgIcon(ICONS.check, 14) : null,
          ),
          h('span', { class: 'swatch-name' }, c.name),
          h('button', { type: 'button', class: 'swatch-del', 'aria-label': t('remove', { name: c.name }), onClick: () => updateFilaments(ctx, (f) => f.filter((x) => x.id !== c.id)) }, svgIcon(ICONS.x, 11)),
        ),
      ),
    );
  };
  ctx.onDesign.push((d, s) => {
    used = new Set(d.palette.map((e) => e.inventoryId).filter((x): x is string => !!x));
    renderSwatches(s);
  });
  ctx.onState.push(renderSwatches);

  // Add a filament.
  const newColor = h('input', { type: 'color', class: 'color-input', value: '#c86b3c', 'aria-label': t('filamentColour') });
  const newName = h('input', { type: 'text', class: 'text-input', placeholder: t('filamentNamePh'), 'aria-label': t('filamentName') });
  const add = () => {
    const hex = newColor.value.toLowerCase();
    updateFilaments(ctx, (f) => [...f, { id: `f${Date.now().toString(36)}`, name: newName.value.trim() || hex.toUpperCase(), hex, enabled: true }]);
    newName.value = '';
  };
  newName.addEventListener('keydown', (e) => e.key === 'Enter' && add());

  // Backup / move the list between computers.
  const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      const incoming = parseFilaments(JSON.parse(await file.text()));
      updateFilaments(ctx, (f) => [...f, ...incoming.filter((n) => !f.some((x) => x.hex === n.hex))]);
    } catch {
      alert(t('badFilamentFile'));
    }
  });
  const exportList = () => download('my-filaments.json', JSON.stringify(ctx.store.get().filaments, null, 2), 'application/json');

  const isFilaments = (s: AppState) => s.params.colors.mode === 'inventory';
  const backup = h(
    'span',
    { class: 'sub-actions' },
    h('button', { type: 'button', class: 'link', onClick: () => importInput.click() }, t('import')),
    showIf(ctx, h('button', { type: 'button', class: 'link', onClick: exportList }, t('export')), (s) => s.filaments.length > 0),
  );

  const P = panel(
    'colours',
    '03',
    t('pColours'),
    false,
    segmented(ctx, {
      options: [
        { value: 'free', label: t('idealColours') },
        { value: 'inventory', label: t('myFilaments') },
      ],
      get: (p) => p.colors.mode,
      set: (p, v) => (p.colors.mode = v),
    }),
    range(ctx, { label: t('maxColours'), min: 1, max: 24, step: 1, get: (p) => p.colors.maxColors, set: (p, v) => (p.colors.maxColors = Math.round(v)) }),
    showIf(ctx, h('button', { type: 'button', class: 'link', onClick: () => setParams(ctx, (p) => (p.colors.mode = 'inventory')) }, t('useOwnFilaments')), (s) => !isFilaments(s)),
    showIf(
      ctx,
      h(
        'div',
        { class: 'filaments' },
        h('div', { class: 'sub-head' }, h('span', {}, t('myFilaments')), backup),
        showIf(ctx, hint(t('filamentsEmpty')), (s) => s.filaments.length === 0),
        grid,
        h('div', { class: 'add-row' }, newColor, newName, h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': t('addFilament'), onClick: add }, svgIcon(ICONS.plus, 16))),
        importInput,
      ),
      isFilaments,
    ),
  );
  ctx.onDesign.push((d, s) => P.setSummary(`${d.palette.length} · ${isFilaments(s) && s.filaments.some((f) => f.enabled) ? t('summaryFilaments') : t('summaryIdeal')}`));
  return P.el;
}

// ---------------------------------------------------------------- 04 opening

function openingPanel(ctx: Ctx) {
  const chips = OPENING_PRESETS.map((pr) =>
    h(
      'button',
      { type: 'button', class: 'chip', onClick: () => setParams(ctx, (p) => Object.assign(p.opening, { width: pr.width, height: pr.height })) },
      h('b', {}, t(pr.label)),
      h('small', {}, `${pr.width} × ${pr.height}`),
    ),
  );
  ctx.onState.push((s) => {
    const o = s.params.opening;
    chips.forEach((c, i) => c.classList.toggle('on', OPENING_PRESETS[i].width === o.width && OPENING_PRESETS[i].height === o.height));
  });

  const P = panel(
    'opening',
    '04',
    t('pOpening'),
    false,
    h('div', { class: 'chips chips-3' }, chips),
    h(
      'div',
      { class: 'grid2' },
      range(ctx, { label: t('width'), unit: 'mm', min: 300, max: 3000, hardMax: 6000, step: 10, get: (p) => p.opening.width, set: (p, v) => (p.opening.width = v) }),
      range(ctx, { label: t('height'), unit: 'mm', min: 500, max: 3000, hardMax: 4000, step: 10, get: (p) => p.opening.height, set: (p, v) => (p.opening.height = v) }),
    ),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, t('margins')),
      range(ctx, { label: t('topToFirst'), unit: 'mm', min: 30, max: 400, step: 5, get: (p) => p.opening.topOffset, set: (p, v) => (p.opening.topOffset = v), hint: t('topToFirstHint') }),
      range(ctx, { label: t('bottomClearance'), unit: 'mm', min: 0, max: 600, step: 5, get: (p) => p.opening.bottomClearance, set: (p, v) => (p.opening.bottomClearance = v) }),
      range(ctx, { label: t('sideMargin'), unit: 'mm', min: 0, max: 200, step: 1, get: (p) => p.opening.sideMargin, set: (p, v) => (p.opening.sideMargin = v), hint: t('sideMarginHint') }),
    ),
  );
  ctx.onState.push((s) => P.setSummary(`${s.params.opening.width} × ${s.params.opening.height}`));
  return P.el;
}

// ---------------------------------------------------------------- 05 ropes & beads

function ropesPanel(ctx: Ctx) {
  const P = panel(
    'ropes',
    '05',
    t('pRopes'),
    false,
    segmented(ctx, {
      options: [
        { value: 'pitch', label: t('bySpacing') },
        { value: 'count', label: t('byCount') },
      ],
      get: (p) => p.ropes.density,
      set: (p, v) => (p.ropes.density = v),
    }),
    showIf(ctx, range(ctx, { label: t('ropeSpacing'), unit: 'mm', min: 4, max: 60, step: 0.5, get: (p) => p.ropes.pitch, set: (p, v) => (p.ropes.pitch = v) }), (s) => s.params.ropes.density === 'pitch'),
    showIf(ctx, range(ctx, { label: t('ropeCount'), min: 2, max: MAX_ROPES, step: 1, get: (p) => p.ropes.count, set: (p, v) => (p.ropes.count = Math.round(v)) }), (s) => s.params.ropes.density === 'count'),
    range(ctx, { label: t('beadGap'), unit: 'mm', min: 0, max: 20, step: 0.5, get: (p) => p.ropes.sideGap, set: (p, v) => (p.ropes.sideGap = v) }),
    readout(ctx, 'spec-row', (d) => {
      const L = d.layout;
      const warn = L.wall < 0.8 ? ' warn' : '';
      return `<span><em>${t('beadDia')}</em>${fmt(L.beadOD)}</span><span><em>${t('holeDia')}</em>${fmt(L.hole, 2)}</span><span class="${warn}"><em>${t('wall')}</em>${fmt(L.wall, 2)}</span>`;
    }),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, t('ropeHole')),
      h(
        'div',
        { class: 'grid2' },
        range(ctx, { label: t('ropeDia'), unit: 'mm', min: 0.5, max: 6, step: 0.1, get: (p) => p.ropes.diameter, set: (p, v) => (p.ropes.diameter = v) }),
        range(ctx, { label: t('clearance'), unit: 'mm', min: 0, max: 2, step: 0.05, get: (p) => p.ropes.holeClearance, set: (p, v) => (p.ropes.holeClearance = v) }),
      ),
      colorField(ctx, t('ropeColour'), (p) => p.ropes.color, (p, v) => (p.ropes.color = v)),
    ),
  );
  ctx.onDesign.push((d) => P.setSummary(`${t('ropesSummary', { n: d.layout.n })} · Ø${fmt(d.layout.beadOD)}`));
  return P.el;
}

export function buildSidebar(ctx: Ctx, actions: SidebarActions): HTMLElement {
  return h('aside', { class: 'sidebar', 'aria-label': t('settings') }, imagePanel(ctx, actions), resolutionPanel(ctx), colorsPanel(ctx), openingPanel(ctx), ropesPanel(ctx));
}
