// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import type { Design } from '../core/design';
import type { ImageParams } from '../core/state';
import type { Stage, View } from '../scene/stage';
import { t } from '../i18n';
import { fmt, int, segmented, setParams, showIf, type Ctx } from './controls';
import { h, ICONS, svgIcon } from './dom';

export interface ViewportActions {
  setOverlay: (on: boolean) => void;
  cancelOverlay: () => void;
  screenshot: () => void;
  fit: (mode: 'cover' | 'contain' | 'center') => void;
}

/** Viewport chrome around the 3D canvas. `host` holds the canvas and survives UI rebuilds. */
export function buildViewport(ctx: Ctx, host: HTMLElement, a: ViewportActions): { el: HTMLElement; bindStage: (s: Stage) => void } {
  const views: [View, string][] = [
    ['front', t('viewFront')],
    ['angle', t('viewAngle')],
    ['detail', t('viewDetail')],
  ];
  let stage: Stage | null = null;
  const viewBtns = views.map(([v, label]) => h('button', { type: 'button', class: 'seg-btn', onClick: () => stage?.setView(v) }, label));

  const mood = segmented(ctx, {
    options: [
      { value: 'golden', label: t('moodGolden') },
      { value: 'daylight', label: t('moodDaylight') },
      { value: 'evening', label: t('moodEvening') },
    ],
    get: (p) => p.scene.mood,
    set: (p, v) => (p.scene.mood = v),
  });
  mood.classList.add('vp-mood');
  showIf(ctx, mood, (s) => s.params.scene.backdrop === 'room');

  const backdrop = segmented(ctx, {
    options: [
      { value: 'studio', label: t('backdropStudio') },
      { value: 'room', label: t('backdropRoom') },
    ],
    get: (p) => p.scene.backdrop,
    set: (p, v) => (p.scene.backdrop = v),
  });
  backdrop.classList.add('vp-mood');

  const motion = h('button', { type: 'button', class: 'btn btn-glass btn-motion', title: t('motionTitle'), onClick: () => setParams(ctx, (p) => (p.scene.motion = !p.scene.motion)) }, svgIcon(ICONS.wind, 16), t('motion'));
  const physics = h('button', { type: 'button', class: 'btn btn-glass btn-motion', title: t('physicsTitle'), onClick: () => setParams(ctx, (p) => (p.scene.physics = !p.scene.physics)) }, svgIcon(ICONS.hand, 16), t('physics'));
  ctx.onState.push((s) => {
    motion.classList.toggle('on', s.params.scene.motion);
    motion.setAttribute('aria-pressed', String(s.params.scene.motion));
    physics.classList.toggle('on', s.params.scene.physics);
    physics.setAttribute('aria-pressed', String(s.params.scene.physics));
  });

  const badge = h('div', { class: 'vp-badge' });
  ctx.onDesign.push((d: Design) => {
    badge.innerHTML = t('badge', { n: d.layout.n, m: int(d.beadCount), w: fmt(d.layout.W / 1000, 2), h: fmt(d.layout.H / 1000, 2) });
  });

  // Overlay toggle + placement controls.
  const toggle = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-label': t('imageOverlay') }, h('span', { class: 'knob' }));
  toggle.addEventListener('click', () => a.setOverlay(!ctx.store.get().ui.overlay));
  const opacity = h('input', { type: 'range', class: 'slider slider-dark', min: 0.15, max: 1, step: 0.01, 'aria-label': t('opacity') });
  opacity.addEventListener('input', () => ctx.store.update((s) => (s.ui.overlayOpacity = parseFloat(opacity.value))));
  const fits: [Parameters<ViewportActions['fit']>[0], string][] = [
    ['cover', t('fitFill')],
    ['contain', t('fitFit')],
    ['center', t('fitCentre')],
  ];
  const hintText = h('span', { class: 'ob-hint', html: t('overlayHint') });
  const placing = h(
    'div',
    { class: 'ob-placing' },
    h('div', { class: 'seg seg-dark ob-fit', role: 'group', 'aria-label': t('fitImage') }, fits.map(([m, label]) => h('button', { type: 'button', class: 'seg-btn', onClick: () => a.fit(m) }, label))),
    h('label', { class: 'ob-opacity' }, t('opacity'), opacity),
    h('span', { class: 'ob-spacer' }),
    h('button', { type: 'button', class: 'btn btn-glass', onClick: a.cancelOverlay }, svgIcon(ICONS.undo, 16), t('cancel')),
    h('button', { type: 'button', class: 'btn btn-primary', onClick: () => a.setOverlay(false) }, svgIcon(ICONS.check, 16), t('confirm')),
  );
  const bar = h('div', { class: 'overlay-bar' }, h('div', { class: 'ob-head' }, h('label', { class: 'ob-toggle' }, toggle, h('span', {}, t('imageOverlay'))), hintText), placing);
  ctx.onState.push((s) => {
    toggle.setAttribute('aria-checked', String(s.ui.overlay));
    toggle.classList.toggle('on', s.ui.overlay);
    placing.hidden = !s.ui.overlay;
    hintText.hidden = !s.ui.overlay;
    bar.classList.toggle('active', s.ui.overlay);
    opacity.value = String(s.ui.overlayOpacity);
    opacity.style.setProperty('--p', `${((s.ui.overlayOpacity - 0.15) / 0.85) * 100}%`);
    host.classList.toggle('placing', s.ui.overlay);
  });

  const el = h(
    'main',
    { class: 'viewport' },
    host,
    h('div', { class: 'vp-top' }, h('div', { class: 'seg seg-dark', role: 'group', 'aria-label': t('cameraView') }, viewBtns), h('div', { class: 'vp-right' }, backdrop, mood, motion, physics, h('button', { type: 'button', class: 'btn btn-glass btn-icon', title: t('screenshotTitle'), 'aria-label': t('screenshot'), onClick: a.screenshot }, svgIcon(ICONS.camera, 17)))),
    badge,
    bar,
    h('div', { class: 'drop-veil' }, h('span', {}, t('dropToLoad'))),
  );

  // The stage is created after the host is in the DOM, so it is bound late.
  return { el, bindStage: (s) => (stage = s) };
}

/** Pointer, wheel and keyboard handling for positioning the overlay image. */
export function attachPlacement(ctx: Ctx, stage: Stage, getDesign: () => Design | null, a: ViewportActions): void {
  const canvas = stage.canvas;
  let drag: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
  let wheelTimer = 0;

  const setImage = (fn: (img: ImageParams) => void, interacting: boolean) =>
    ctx.store.update((s) => {
      fn(s.params.image);
      s.ui.interacting = interacting;
    });

  canvas.addEventListener('pointerdown', (e) => {
    if (!ctx.store.get().ui.overlay || e.button !== 0) return;
    const p = stage.pickOverlay(e.clientX, e.clientY);
    if (!p) return;
    const img = ctx.store.get().params.image;
    drag = { id: e.pointerId, x: p.x, y: p.y, ox: img.offsetX, oy: img.offsetY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = stage.pickOverlay(e.clientX, e.clientY);
    if (!p) return;
    const d = drag;
    setImage((img) => {
      img.offsetX = Math.round(d.ox + p.x - d.x);
      img.offsetY = Math.round(d.oy + p.y - d.y);
    }, true);
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    canvas.classList.remove('grabbing');
    ctx.store.update((s) => (s.ui.interacting = false));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const zoomAt = (factor: number, at: { x: number; y: number } | null) => {
    const d = getDesign();
    if (!d?.placement) return;
    const pl = d.placement;
    const p = at ?? { x: pl.cx, y: pl.cy };
    // Scale about the cursor: the image point under it stays put.
    setImage((img) => {
      const z = Math.min(20, Math.max(0.05, img.zoom * factor));
      const f = z / img.zoom;
      img.zoom = z;
      img.offsetX = Math.round(img.offsetX + (pl.cx - p.x) * (f - 1));
      img.offsetY = Math.round(img.offsetY + (pl.cy - p.y) * (f - 1));
    }, true);
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => ctx.store.update((s) => (s.ui.interacting = false)), 220);
  };

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!ctx.store.get().ui.overlay) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), stage.pickOverlay(e.clientX, e.clientY));
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (!ctx.store.get().ui.overlay) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const step = e.shiftKey ? 25 : 5;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (nudge[e.key]) {
      e.preventDefault();
      const [dx, dy] = nudge[e.key];
      setImage((img) => {
        img.offsetX += dx;
        img.offsetY += dy;
      }, false);
    } else if (e.key === '+' || e.key === '=') {
      zoomAt(1.05, null);
    } else if (e.key === '-' || e.key === '_') {
      zoomAt(1 / 1.05, null);
    } else if (e.key === 'Enter' && t.tagName !== 'BUTTON') {
      e.preventDefault();
      a.setOverlay(false);
    } else if (e.key === 'Escape') {
      a.cancelOverlay();
    }
  });
}
