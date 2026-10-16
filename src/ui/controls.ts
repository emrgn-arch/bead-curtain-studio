import type { Design } from '../core/design';
import type { AppState, Params, Store } from '../core/state';
import { locale, t } from '../i18n';
import { h, ICONS, svgIcon } from './dom';

/** Shared UI context: every control registers a refresher for state and/or design updates. */
export interface Ctx {
  store: Store<AppState>;
  onState: ((s: AppState) => void)[];
  onDesign: ((d: Design, s: AppState) => void)[];
}

export function setParams(ctx: Ctx, fn: (p: Params) => void): void {
  ctx.store.update((s) => fn(s.params));
}

// ---------------------------------------------------------------- range + number

export interface RangeOpts {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  get: (p: Params) => number;
  set: (p: Params, v: number) => void;
  /** Accept typed values beyond the slider range up to these limits. */
  hardMin?: number;
  hardMax?: number;
  digits?: number;
  hint?: string;
  /** Multiply the stored value for display (e.g. 100 for percentages). */
  scale?: number;
}

export function range(ctx: Ctx, o: RangeOpts): HTMLElement {
  const scale = o.scale ?? 1;
  const shown = o.step * scale;
  const digits = o.digits ?? (shown < 1 ? (shown < 0.1 ? 2 : 1) : 0);
  const id = `f${Math.random().toString(36).slice(2, 8)}`;
  const slider = h('input', { type: 'range', class: 'slider', id, min: o.min * scale, max: o.max * scale, step: o.step * scale, 'aria-label': o.label });
  const num = h('input', { type: 'number', class: 'num-input', step: o.step * scale, 'aria-label': t('valueOf', { label: o.label }) });

  const commit = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const lo = (o.hardMin ?? o.min) * scale;
    const hi = (o.hardMax ?? o.max) * scale;
    const v = Math.min(hi, Math.max(lo, raw)) / scale;
    setParams(ctx, (p) => o.set(p, v));
  };
  slider.addEventListener('input', () => commit(parseFloat(slider.value)));
  num.addEventListener('change', () => commit(parseFloat(num.value)));
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') num.blur();
  });

  ctx.onState.push((s) => {
    const v = o.get(s.params) * scale;
    slider.value = String(v);
    const pct = ((Math.min(o.max * scale, Math.max(o.min * scale, v)) - o.min * scale) / ((o.max - o.min) * scale)) * 100;
    slider.style.setProperty('--p', `${pct}%`);
    if (document.activeElement !== num) num.value = v.toFixed(digits);
  });

  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', { for: id }, o.label), h('span', { class: 'num' }, num, o.unit ? h('em', {}, o.unit) : null)),
    slider,
    o.hint ? h('p', { class: 'hint' }, o.hint) : null,
  );
}

// ---------------------------------------------------------------- dual range (two knobs)

export interface DualOpts {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  loLabel: string;
  hiLabel: string;
  get: (p: Params) => [number, number];
  set: (p: Params, lo: number, hi: number) => void;
}

export function dualRange(ctx: Ctx, o: DualOpts): HTMLElement {
  const attrs = { type: 'range', class: 'slider', min: o.min, max: o.max, step: o.step };
  const lo = h('input', { ...attrs, 'aria-label': o.loLabel });
  const hi = h('input', { ...attrs, 'aria-label': o.hiLabel });
  const numLo = h('input', { type: 'number', class: 'num-input', step: o.step, 'aria-label': t('valueOf', { label: o.loLabel }) });
  const numHi = h('input', { type: 'number', class: 'num-input', step: o.step, 'aria-label': t('valueOf', { label: o.hiLabel }) });
  const track = h('div', { class: 'dual-track' });

  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, v));
  const commit = (a: number, b: number, moved: 'lo' | 'hi') => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    a = clamp(a);
    b = clamp(b);
    // Knobs push each other instead of crossing.
    if (a > b) {
      if (moved === 'lo') b = a;
      else a = b;
    }
    setParams(ctx, (p) => o.set(p, a, b));
  };
  lo.addEventListener('input', () => commit(+lo.value, +hi.value, 'lo'));
  hi.addEventListener('input', () => commit(+lo.value, +hi.value, 'hi'));
  numLo.addEventListener('change', () => commit(parseFloat(numLo.value), +hi.value, 'lo'));
  numHi.addEventListener('change', () => commit(+lo.value, parseFloat(numHi.value), 'hi'));
  for (const n of [numLo, numHi]) n.addEventListener('keydown', (e) => e.key === 'Enter' && n.blur());

  ctx.onState.push((s) => {
    const [a, b] = o.get(s.params);
    lo.value = String(a);
    hi.value = String(b);
    const pct = (v: number) => `${((clamp(v) - o.min) / (o.max - o.min)) * 100}%`;
    track.style.setProperty('--a', pct(a));
    track.style.setProperty('--b', pct(b));
    // When the knobs overlap, keep the one that can still move on top.
    lo.style.zIndex = a > (o.min + o.max) / 2 ? '3' : '1';
    if (document.activeElement !== numLo) numLo.value = String(a);
    if (document.activeElement !== numHi) numHi.value = String(b);
  });

  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-head' }, h('label', {}, o.label), h('span', { class: 'num' }, numLo, h('em', { class: 'dash' }, '–'), numHi, o.unit ? h('em', {}, o.unit) : null)),
    h('div', { class: 'dual' }, track, lo, hi),
  );
}

// ---------------------------------------------------------------- segmented

export interface SegOpts<T extends string> {
  label?: string;
  options: { value: T; label: string; title?: string }[];
  get: (p: Params) => T;
  set: (p: Params, v: T) => void;
}

export function segmented<T extends string>(ctx: Ctx, o: SegOpts<T>): HTMLElement {
  const buttons = o.options.map((opt) =>
    h('button', { type: 'button', class: 'seg-btn', title: opt.title, onClick: () => setParams(ctx, (p) => o.set(p, opt.value)) }, opt.label),
  );
  ctx.onState.push((s) => {
    const v = o.get(s.params);
    buttons.forEach((b, i) => {
      const on = o.options[i].value === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  return h('div', { class: 'field' }, o.label ? h('div', { class: 'field-head' }, h('label', {}, o.label)) : null, h('div', { class: 'seg', role: 'group' }, buttons));
}

// ---------------------------------------------------------------- colour

export function colorField(ctx: Ctx, label: string, get: (p: Params) => string, set: (p: Params, v: string) => void): HTMLElement {
  const input = h('input', { type: 'color', class: 'color-input', 'aria-label': label });
  const code = h('code', {});
  input.addEventListener('input', () => setParams(ctx, (p) => set(p, input.value)));
  ctx.onState.push((s) => {
    const v = get(s.params);
    if (input.value !== v) input.value = v;
    code.textContent = v.toUpperCase();
  });
  return h('div', { class: 'field field-inline' }, h('label', {}, label), h('span', { class: 'color-wrap' }, code, input));
}

// ---------------------------------------------------------------- misc

export function hint(text: string): HTMLElement {
  return h('p', { class: 'hint' }, text);
}

/** Show an element only when the predicate holds. */
export function showIf<E extends HTMLElement>(ctx: Ctx, el: E, pred: (s: AppState) => boolean): E {
  ctx.onState.push((s) => {
    el.hidden = !pred(s);
  });
  return el;
}

/** Text that follows the latest design. */
export function readout(ctx: Ctx, cls: string, fn: (d: Design, s: AppState) => string): HTMLElement {
  const el = h('p', { class: cls });
  ctx.onDesign.push((d, s) => {
    el.innerHTML = fn(d, s);
  });
  return el;
}

export interface Panel {
  el: HTMLElement;
  setSummary: (text: string) => void;
}

/** Open/closed state survives UI rebuilds (e.g. switching language). */
const panelOpen = new Map<string, boolean>();

export function panel(id: string, num: string, title: string, defaultOpen: boolean, ...body: (HTMLElement | null)[]): Panel {
  const open = panelOpen.get(id) ?? defaultOpen;
  const summary = h('span', { class: 'panel-summary' });
  const bodyEl = h('div', { class: 'panel-body' }, body.filter(Boolean) as HTMLElement[]);
  const head = h(
    'button',
    { type: 'button', class: 'panel-head', 'aria-expanded': String(open) },
    h('span', { class: 'panel-num' }, num),
    h('span', { class: 'panel-title' }, title),
    summary,
    svgIcon(ICONS.chevron, 18),
  );
  const el = h('section', { class: `panel${open ? ' open' : ''}` }, head, bodyEl);
  head.addEventListener('click', () => {
    const isOpen = el.classList.toggle('open');
    head.setAttribute('aria-expanded', String(isOpen));
    panelOpen.set(id, isOpen);
  });
  return { el, setSummary: (t) => (summary.textContent = t) };
}

export function fmt(v: number, digits = 1): string {
  return v.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Locale-aware percentage, e.g. 28.1% / %28,1. */
export function pct(v: number): string {
  return (v / 100).toLocaleString(locale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function int(v: number): string {
  return Math.round(v).toLocaleString(locale());
}
