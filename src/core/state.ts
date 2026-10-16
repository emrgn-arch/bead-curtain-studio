// All physical dimensions are millimetres.

export type DensityMode = 'pitch' | 'count';
export type OutsideMode = 'fill' | 'bare';
export type ColorMode = 'free' | 'inventory';
export type Mood = 'golden' | 'daylight' | 'evening';
export type Backdrop = 'studio' | 'room';

export interface OpeningParams {
  width: number;
  height: number;
  /** Distance from the top of the opening down to the first bead. */
  topOffset: number;
  /** Gap kept free above the floor. */
  bottomClearance: number;
  /** Minimum free space between the outermost beads and the frame. */
  sideMargin: number;
}

export interface RopeParams {
  density: DensityMode;
  /** Centre-to-centre spacing between ropes. */
  pitch: number;
  count: number;
  diameter: number;
  color: string;
  /** Bead hole Ø = rope Ø + clearance. */
  holeClearance: number;
  /** Horizontal gap between beads on neighbouring ropes. Bead Ø = pitch − gap. */
  sideGap: number;
}

export interface ImageParams {
  offsetX: number;
  offsetY: number;
  /** 1 = image just covers the beaded area. */
  zoom: number;
  brightness: number;
  contrast: number;
  saturation: number;
  outside: OutsideMode;
  fillColor: string;
}

export interface ResolutionParams {
  /** Shortest bead — also the sample size along the rope. */
  step: number;
  /** Longest bead. */
  maxLength: number;
  /** How many different lengths are spread between the shortest and the longest. */
  lengthCount: number;
  /** Floyd–Steinberg strength 0..1. */
  dither: number;
}

export interface ColorParams {
  mode: ColorMode;
  maxColors: number;
}

export interface SceneParams {
  backdrop: Backdrop;
  /** Lighting mood of the room backdrop. */
  mood: Mood;
  /** Gentle rope sway in the 3D view. */
  motion: boolean;
}

export type PrinterId = 'x1' | 'a1mini' | 'h2d';

export interface ExportParams {
  printer: PrinterId;
}

export interface Params {
  opening: OpeningParams;
  ropes: RopeParams;
  image: ImageParams;
  resolution: ResolutionParams;
  colors: ColorParams;
  scene: SceneParams;
  export: ExportParams;
}

/** A filament colour the user owns. Kept outside Params so "Reset design" never wipes it. */
export interface Filament {
  id: string;
  name: string;
  hex: string;
  enabled: boolean;
}

export interface UiState {
  overlay: boolean;
  overlayOpacity: number;
  /** Bumped whenever the source image changes. */
  imageVersion: number;
  imageName: string;
  /** True while the user drags/zooms the overlay — lets the engine trade quality for speed. */
  interacting: boolean;
}

export interface AppState {
  params: Params;
  filaments: Filament[];
  ui: UiState;
}

export interface OpeningPreset {
  label: 'presetSingle' | 'presetStandard' | 'presetDouble';
  width: number;
  height: number;
}

export const OPENING_PRESETS: OpeningPreset[] = [
  { label: 'presetSingle', width: 800, height: 2000 },
  { label: 'presetStandard', width: 900, height: 2100 },
  { label: 'presetDouble', width: 1600, height: 2100 },
];

/** Bambu Lab build plates (usable XY, mm). */
export const PRINTERS: Record<PrinterId, { label: string; w: number; d: number }> = {
  x1: { label: 'X1 · P1 · A1', w: 256, d: 256 },
  a1mini: { label: 'A1 mini', w: 180, d: 180 },
  h2d: { label: 'H2D', w: 325, d: 320 },
};

export const STEP_MIN = 5;
export const STEP_MAX = 150;

export function defaultParams(): Params {
  return {
    opening: { width: 900, height: 2100, topOffset: 60, bottomClearance: 40, sideMargin: 10 },
    ropes: { density: 'pitch', pitch: 12, count: 73, diameter: 1.5, color: '#d9c7a5', holeClearance: 0.5, sideGap: 2 },
    image: { offsetX: 0, offsetY: 0, zoom: 1, brightness: 1, contrast: 1, saturation: 1, outside: 'fill', fillColor: '#e9dcc4' },
    resolution: { step: 10, maxLength: 100, lengthCount: 4, dither: 0 },
    colors: { mode: 'free', maxColors: 8 },
    scene: { backdrop: 'studio', mood: 'golden', motion: true },
    export: { printer: 'x1' },
  };
}

export function defaultUi(): UiState {
  return { overlay: false, overlayOpacity: 0.8, imageVersion: 0, imageName: '', interacting: false };
}

// ---------------------------------------------------------------- store

type Listener<T> = (next: T, prev: T) => void;

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  /** Clone, mutate the draft, then notify. State is small so cloning is cheap. */
  update(mutate: (draft: T) => void): void {
    const prev = this.state;
    const next = structuredClone(prev);
    mutate(next);
    this.state = next;
    for (const l of this.listeners) l(next, prev);
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

// ---------------------------------------------------------------- persistence (browser localStorage)

const PARAMS_KEY = 'bead-curtain-studio.params.v2';
const FILAMENTS_KEY = 'bead-curtain-studio.filaments.v1';

function mergeDeep<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return base;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const b = out[k];
    if (Array.isArray(b)) out[k] = Array.isArray(v) ? v : b;
    else if (b !== null && typeof b === 'object') out[k] = mergeDeep(b, v);
    else if (typeof v === typeof b) out[k] = v;
  }
  return out as T;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — ignore */
  }
}

export function loadParams(): Params {
  return mergeDeep(defaultParams(), read(PARAMS_KEY));
}

export function saveParams(p: Params): void {
  write(PARAMS_KEY, p);
}

/** Accepts anything that looks like a filament list (also used for file import). */
export function parseFilaments(data: unknown): Filament[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as Filament).hex === 'string' && /^#[0-9a-f]{6}$/i.test((f as Filament).hex))
    .map((f, i) => ({
      id: typeof f.id === 'string' ? f.id : `f${Date.now().toString(36)}${i}`,
      name: typeof f.name === 'string' && f.name.trim() ? f.name.trim() : String(f.hex).toUpperCase(),
      hex: String(f.hex).toLowerCase(),
      enabled: f.enabled !== false,
    }));
}

export function loadFilaments(): Filament[] {
  return parseFilaments(read(FILAMENTS_KEY));
}

export function saveFilaments(f: Filament[]): void {
  write(FILAMENTS_KEY, f);
}
