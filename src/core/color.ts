// Color utilities. All perceptual matching happens in OKLab, which is cheap and
// far closer to human perception than RGB distance.

export type Lab = [number, number, number];

const SRGB8_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB8_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function srgb8ToLinear(v: number): number {
  return SRGB8_TO_LINEAR[v];
}

export function linearToSrgb8(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Linear sRGB (0..1) → OKLab, written into out[o..o+2]. */
export function linearToOklab(r: number, g: number, b: number, out: Float32Array | number[], o = 0): void {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/** OKLab → linear sRGB (unclamped). */
export function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToRgb8(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgb8ToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function hexToOklab(hex: string): Lab {
  const [r, g, b] = hexToRgb8(hex);
  const out: Lab = [0, 0, 0];
  linearToOklab(srgb8ToLinear(r), srgb8ToLinear(g), srgb8ToLinear(b), out);
  return out;
}

export function oklabToHex(L: number, a: number, b: number): string {
  const [r, g, bl] = oklabToLinear(L, a, b);
  const c = (v: number) => linearToSrgb8(Math.max(0, Math.min(1, v)));
  return rgb8ToHex(c(r), c(g), c(bl));
}

export function hexToLinear(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb8(hex);
  return [srgb8ToLinear(r), srgb8ToLinear(g), srgb8ToLinear(b)];
}

export function labDist2(a: ArrayLike<number>, b: ArrayLike<number>, ao = 0, bo = 0): number {
  const dL = a[ao] - b[bo];
  const da = a[ao + 1] - b[bo + 1];
  const db = a[ao + 2] - b[bo + 2];
  return dL * dL + da * da + db * db;
}

/** OKLab distance scaled ×100 so it reads roughly like a classic ΔE. */
export function deltaE(a: Lab, b: Lab): number {
  return Math.sqrt(labDist2(a, b)) * 100;
}

/** Relative luminance-ish lightness for choosing readable text on a swatch. */
export function isLight(hex: string): boolean {
  return hexToOklab(hex)[0] > 0.68;
}
