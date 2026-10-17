// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import { hexToRgb8 } from '../core/color';
import type { Design } from '../core/design';
import { labelCuts, type LabelLayout, type P2 } from '../core/engrave';
import { chamferSize } from '../core/layout';
import type { Tray, TrayPlan } from '../core/trays';

// A small, non-interactive isometric drawing of one print tray: the build plate
// with every bead standing on it, in its colour and real proportions. Plus a top
// view of one bead with its engraved number.

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

function shade([r, g, b]: [number, number, number], f: number): string {
  // f < 1 darkens, f > 1 lightens towards white
  const c = (v: number) => Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export function drawTray(canvas: HTMLCanvasElement, d: Design, plan: TrayPlan, tray: Tray): void {
  const { w, d: depth } = plan.plate;
  const tallest = Math.max(...tray.beads.map((li) => d.lengths[li]));
  const R = d.layout.beadOD / 2;
  const hole = d.layout.hole / 2;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // Fit the card's inner width (its padding excluded), never wider.
  const parent = canvas.parentElement;
  const cs = parent ? getComputedStyle(parent) : null;
  const inner = parent && cs ? parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 280;
  const cssW = Math.max(160, Math.floor(inner));
  const pad = 10;
  // Fit the plate diamond plus the tallest bead.
  const s = Math.min((cssW - 2 * pad) / ((w + depth) * COS30), 200 / ((w + depth) * SIN30 + tallest));
  const cssH = Math.round((w + depth) * SIN30 * s + tallest * s + 2 * pad);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssW, cssH);

  const ox = cssW / 2;
  const oy = pad + tallest * s + ((w + depth) / 2) * SIN30 * s;
  const project = (x: number, y: number, z = 0): [number, number] => [ox + (x - y) * COS30 * s, oy + (x + y) * SIN30 * s - z * s];

  // Build plate.
  const corners: [number, number][] = [[-w / 2, -depth / 2], [w / 2, -depth / 2], [w / 2, depth / 2], [-w / 2, depth / 2]];
  g.beginPath();
  corners.forEach(([x, y], i) => {
    const [px, py] = project(x, y);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
  g.fillStyle = '#e4e4e0';
  g.fill();
  g.strokeStyle = '#c9c9c4';
  g.lineWidth = 1;
  g.stroke();

  // Beads, back to front so nearer ones overlap farther ones.
  const rgb = hexToRgb8(d.palette[tray.color].hex);
  const rx = R * s * COS30 * Math.SQRT2;
  const ry = R * s * SIN30 * Math.SQRT2;
  const hx = hole * s * COS30 * Math.SQRT2;
  const hy = hole * s * SIN30 * Math.SQRT2;
  const order = tray.positions.map((_, i) => i).sort((a, b) => {
    const [ax, ay] = tray.positions[a];
    const [bx, by] = tray.positions[b];
    return ax + ay - (bx + by) || ax - bx;
  });

  for (const i of order) {
    const [x, y] = tray.positions[i];
    const L = d.lengths[tray.beads[i]];
    const [cx, base] = project(x, y);
    const top = base - L * s;

    const side = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
    side.addColorStop(0, shade(rgb, 0.55));
    side.addColorStop(0.55, shade(rgb, 0.9));
    side.addColorStop(1, shade(rgb, 0.7));
    g.beginPath();
    g.moveTo(cx - rx, top);
    g.lineTo(cx - rx, base);
    g.ellipse(cx, base, rx, ry, 0, Math.PI, 0, true);
    g.lineTo(cx + rx, top);
    g.ellipse(cx, top, rx, ry, 0, 0, Math.PI, false);
    g.closePath();
    g.fillStyle = side;
    g.fill();

    g.beginPath();
    g.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = shade(rgb, 1.18);
    g.fill();
    g.beginPath();
    g.ellipse(cx, top, hx, hy, 0, 0, Math.PI * 2);
    g.fillStyle = shade(rgb, 0.35);
    g.fill();
  }
}

/** Top view of the tray's lowest-numbered bead with its engraved number, to scale. */
export function drawBeadTop(canvas: HTMLCanvasElement, d: Design, tray: Tray, lettering: LabelLayout): void {
  const first = Math.max(0, tray.labels.indexOf(tray.range[0]));
  const size = 92;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = canvas.style.height = `${size}px`;
  canvas.width = canvas.height = Math.round(size * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);

  const R = d.layout.beadOD / 2;
  const hole = d.layout.hole / 2;
  const k = (size / 2 - 1) / R;
  const at = ([x, y]: P2): P2 => [size / 2 + x * k, size / 2 - y * k];
  const disc = (radius: number) => {
    g.beginPath();
    g.arc(size / 2, size / 2, radius * k, 0, Math.PI * 2);
  };
  const rgb = hexToRgb8(d.palette[tray.color].hex);
  // Numbers read as darker grooves on light beads and lighter ones on dark beads.
  const dark = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.35;

  disc(R);
  g.fillStyle = shade(rgb, dark ? 1.04 : 0.82);
  g.fill();
  disc(R - chamferSize(d.chamfer, d.lengths[tray.beads[first]], R - hole).w);
  g.fillStyle = shade(rgb, dark ? 1.14 : 1.06);
  g.fill();

  // Engraved cells, all wound the same way so the shared sides leave no seams.
  g.beginPath();
  for (const { nodes, cut } of labelCuts(tray.labels[first], lettering))
    cut.forEach((row, i) =>
      row.forEach((on, j) => {
        if (!on) return;
        [nodes[i + 1][j], nodes[i + 1][j + 1], nodes[i][j + 1], nodes[i][j]].forEach((p, k) => {
          const [px, py] = at(p);
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        });
        g.closePath();
      }),
    );
  g.fillStyle = shade(rgb, dark ? 1.55 : 0.5);
  g.fill('nonzero');

  g.globalCompositeOperation = 'destination-out';
  disc(hole);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}
