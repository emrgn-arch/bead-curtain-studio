// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import './styles.css';
import { DesignEngine, type Design } from './core/design';
import { download } from './core/export';
import { containZoom, loadDemoImage, loadImageFile } from './core/image';
import { defaultParams, defaultUi, loadFilaments, loadParams, saveFilaments, saveParams, Store, type AppState, type ImageParams } from './core/state';
import { clearImage, loadImage, saveImage } from './core/storage';
import { AUTHOR, CREDIT, REPO_URL } from './credit';
import { withPngText } from './core/png';
import { getLang, setLang, t, type Lang } from './i18n';
import { Stage } from './scene/stage';
import { buildSheet } from './ui/buildsheet';
import type { Ctx } from './ui/controls';
import { h, ICONS, svgIcon } from './ui/dom';
import { buildSidebar } from './ui/sidebar';
import { attachPlacement, buildViewport } from './ui/viewport';

const store = new Store<AppState>({ params: loadParams(), filaments: loadFilaments(), ui: defaultUi() });
const engine = new DesignEngine();
const ctx: Ctx = { store, onState: [], onDesign: [] };
let design: Design | null = null;
let stage: Stage | null = null;
let placementBackup: ImageParams | null = null;

// ---------------------------------------------------------------- actions

const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void useFile(f);
  fileInput.value = '';
});

async function useFile(file: File): Promise<void> {
  try {
    const bmp = await loadImageFile(file);
    engine.setSource(bmp);
    store.update((s) => {
      s.ui.imageVersion++;
      s.ui.imageName = file.name;
      Object.assign(s.params.image, { offsetX: 0, offsetY: 0, zoom: 1 });
    });
    setOverlay(true);
    void saveImage({ blob: file, name: file.name });
  } catch (e) {
    console.error(e);
    alert(t('unreadableImage'));
  }
}

async function useDemo(): Promise<void> {
  engine.setSource(await loadDemoImage());
  store.update((s) => {
    s.ui.imageVersion++;
    s.ui.imageName = '';
    Object.assign(s.params.image, { offsetX: 0, offsetY: 0, zoom: 1 });
  });
  void clearImage();
}

function setOverlay(on: boolean): void {
  const s = store.get();
  if (on === s.ui.overlay) return;
  placementBackup = on ? structuredClone(s.params.image) : null;
  store.update((st) => {
    st.ui.overlay = on;
    st.ui.interacting = false;
  });
}

function cancelOverlay(): void {
  const backup = placementBackup;
  store.update((s) => {
    if (backup) s.params.image = backup;
    s.ui.overlay = false;
    s.ui.interacting = false;
  });
  placementBackup = null;
}

function fit(mode: 'cover' | 'contain' | 'center'): void {
  store.update((s) => {
    const img = s.params.image;
    img.offsetX = 0;
    img.offsetY = 0;
    if (mode === 'cover') img.zoom = 1;
    if (mode === 'contain' && design) img.zoom = Number(containZoom(design.layout, engine.aspect).toFixed(3));
  });
}

function screenshot(): void {
  if (!stage) return;
  const url = stage.snapshot();
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const png = withPngText(new Uint8Array(buf), { Software: CREDIT, Source: REPO_URL, Author: AUTHOR });
      download(`bead-curtain-${new Date().toISOString().slice(0, 10)}.png`, new Blob([png], { type: 'image/png' }));
    });
}

// ---------------------------------------------------------------- layout

function buildHeader(): HTMLElement {
  const resetBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, t('resetDesign'));
  let armed = 0;
  resetBtn.addEventListener('click', () => {
    if (!armed) {
      resetBtn.textContent = t('resetConfirm');
      armed = window.setTimeout(() => {
        armed = 0;
        resetBtn.textContent = t('resetDesign');
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = 0;
    resetBtn.textContent = t('resetDesign');
    store.update((s) => {
      s.params = defaultParams();
    });
  });

  const langs: Lang[] = ['en', 'tr'];
  const langSwitch = h(
    'div',
    { class: 'seg seg-lang', role: 'group', 'aria-label': t('language') },
    langs.map((l) =>
      h('button', { type: 'button', class: `seg-btn${l === getLang() ? ' on' : ''}`, 'aria-pressed': String(l === getLang()), lang: l, onClick: () => switchLanguage(l) }, l.toUpperCase()),
    ),
  );

  return h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('a', { class: 'logo', href: REPO_URL, target: '_blank', rel: 'noopener', title: CREDIT }, 'Strands'), h('span', { class: 'sticker' }, t('sticker'))),
    h('span', { class: 'tagline' }, t('tagline')),
    h('div', { class: 'top-actions' }, langSwitch, resetBtn, h('button', { type: 'button', class: 'btn btn-dark', onClick: () => fileInput.click() }, svgIcon(ICONS.upload, 16), t('uploadImage'))),
  );
}

const viewportActions = { setOverlay, cancelOverlay, screenshot, fit };
/** Holds the WebGL canvas; it is created once and moved into each rebuilt viewport. */
const stageHost = h('div', { class: 'stage-host' });
const root = document.getElementById('app')!;
let bindStage: (s: Stage) => void = () => {};

/** (Re)build all UI chrome in the current language. The 3D stage and state are untouched. */
function mountUI(): void {
  ctx.onState.length = 0;
  ctx.onDesign.length = 0;
  document.documentElement.lang = getLang();
  document.title = t('docTitle');

  const viewport = buildViewport(ctx, stageHost, viewportActions);
  bindStage = viewport.bindStage;
  if (stage) bindStage(stage);
  const sidebar = buildSidebar(ctx, {
    openFile: () => fileInput.click(),
    useDemo: () => void useDemo(),
    setOverlay,
    preview: () => engine.processed(store.get().params),
  });
  root.replaceChildren(h('div', { class: 'app' }, buildHeader(), h('div', { class: 'workspace' }, sidebar, viewport.el, buildSheet(ctx))), fileInput);

  const s = store.get();
  for (const f of ctx.onState) f(s);
  if (design) for (const f of ctx.onDesign) f(design, s);
}

function switchLanguage(l: Lang): void {
  if (l === getLang()) return;
  setLang(l);
  mountUI();
}

mountUI();
console.info(`%c${CREDIT}`, 'font: 12px monospace');

// ---------------------------------------------------------------- drag & drop anywhere

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('dragging');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f) void useFile(f);
});

// ---------------------------------------------------------------- compute loop

let scheduled = false;
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}

function run(): void {
  scheduled = false;
  const s = store.get();
  try {
    design = engine.compute(s);
  } catch (e) {
    console.error('Design computation failed', e);
    return;
  }
  if (stage) {
    stage.setOverlayImage(engine.processed(s.params));
    stage.setLook(s.params.scene.backdrop, s.params.scene.mood);
    stage.setMotion(s.params.scene.motion, s.params.scene.physics);
    stage.setDesign(design, s.params.ropes.color, s.ui.overlayOpacity);
    stage.setOverlayMode(s.ui.overlay);
  }
  for (const f of ctx.onDesign) f(design, s);
}

let saveTimer = 0;
store.subscribe((s) => {
  for (const f of ctx.onState) f(s);
  schedule();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const latest = store.get();
    saveParams(latest.params);
    saveFilaments(latest.filaments);
  }, 300);
});

// ---------------------------------------------------------------- boot

try {
  stage = new Stage(stageHost);
  bindStage(stage);
  attachPlacement(ctx, stage, () => design, viewportActions);
} catch (e) {
  console.error(e);
  stageHost.append(h('div', { class: 'webgl-error' }, t('noWebgl')));
}

// Paint every control and the scene right away; the image arrives a moment later.
for (const f of ctx.onState) f(store.get());
schedule();

(async () => {
  // IndexedDB can be slow or unavailable (e.g. some file:// setups) — never block on it.
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 1500));
  const saved = await Promise.race([loadImage(), timeout]);
  let restored = false;
  if (saved) {
    try {
      engine.setSource(await loadImageFile(saved.blob));
      store.update((s) => {
        s.ui.imageVersion++;
        s.ui.imageName = saved.name;
      });
      restored = true;
    } catch {
      /* fall back to the demo */
    }
  }
  if (!restored) {
    engine.setSource(await loadDemoImage());
    store.update((s) => {
      s.ui.imageVersion++;
    });
  }
})();
