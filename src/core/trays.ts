// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
// Print trays: every bead laid out standing upright on Bambu Lab build plates,
// one colour per tray, exported as 3MF files Bambu Studio opens directly.

import { ShapeUtils, Vector2 } from 'three';
import { CREDIT } from '../credit';
import { paletteLabels, t } from '../i18n';
import type { Design } from './design';
import { beadNumbers, ENGRAVE_DEPTH, labelCuts, labelLayout, type GlyphCut, type LabelLayout } from './engrave';
import { chamferSize } from './layout';
import { PRINTERS, type PrinterId } from './state';
import { zip, zipDeflated, type ZipEntry } from './zip';

const MARGIN = 18; // mm kept free along each plate edge
const GAP = 3; // mm between neighbouring beads
const SEGMENTS = 64;

export interface Tray {
  /** 1-based tray number across all colours. */
  number: number;
  color: number;
  /** Length index of every bead on the tray, tallest first. */
  beads: number[];
  /** "rope-bead" number of every bead: rope from the left, bead from the bottom knot up. */
  labels: string[];
  /** Lowest and highest number on the tray. */
  range: [string, string];
  /** Bead centres in mm relative to the plate centre (occupied area centred). */
  positions: [number, number][];
  part: number;
  parts: number;
}

export interface TrayPlan {
  trays: Tray[];
  capacity: number;
  plate: { label: string; w: number; d: number };
  /** mm kept free along each plate edge. */
  margin: number;
  /** How the engraved numbers fit on these beads; null when the beads are too small. */
  lettering: LabelLayout | null;
}

/** Hex-packed bead centres, relative to the plate centre. */
function slots(plateW: number, plateD: number, beadOD: number): [number, number][] {
  const pitch = beadOD + GAP;
  const rowH = (pitch * Math.sqrt(3)) / 2;
  const lo = MARGIN + beadOD / 2;
  const out: [number, number][] = [];
  for (let row = 0; lo + row * rowH <= plateD - lo + 1e-9; row++) {
    const y = lo + row * rowH;
    for (let x = lo + (row % 2) * (pitch / 2); x <= plateW - lo + 1e-9; x += pitch) out.push([x - plateW / 2, y - plateD / 2]);
  }
  return out;
}

/** Centre the occupied slots on the plate. */
function centred(pos: [number, number][]): [number, number][] {
  const xs = pos.map((p) => p[0]);
  const ys = pos.map((p) => p[1]);
  const dx = -(Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = -(Math.min(...ys) + Math.max(...ys)) / 2;
  return pos.map(([x, y]) => [x + dx, y + dy]);
}

export function planTrays(d: Design, printer: PrinterId): TrayPlan {
  const plate = PRINTERS[printer];
  const allSlots = slots(plate.w, plate.d, d.layout.beadOD);
  const capacity = Math.max(1, allSlots.length);
  const seq = beadNumbers(d);
  const byColor: number[][] = d.palette.map(() => []);
  for (let k = 0; k < d.beadCount; k++) byColor[d.bColor[k]].push(k);
  const trays: Tray[] = [];
  const label = (k: number) => `${d.bRope[k] + 1}-${seq[k]}`;
  byColor.forEach((ids, color) => {
    // Threading order, so a tray holds whole stretches of ropes.
    ids.sort((a, b) => d.bRope[a] - d.bRope[b] || seq[a] - seq[b]);
    const parts = Math.ceil(ids.length / capacity);
    for (let i = 0; i < parts; i++) {
      const part = ids.slice(i * capacity, (i + 1) * capacity);
      const range: [string, string] = [label(part[0]), label(part[part.length - 1])];
      // On the plate: tallest at −X down to the shortest at +X, column by column
      // (the stable sort keeps equal lengths in number order).
      part.sort((a, b) => d.lengths[d.bLen[b]] - d.lengths[d.bLen[a]]);
      const positions = centred(allSlots.slice(0, part.length)).sort((a, b) => Math.round((a[0] - b[0]) * 1e3) || a[1] - b[1]);
      trays.push({ number: trays.length + 1, color, beads: part.map((k) => d.bLen[k]), labels: part.map(label), range, positions, part: i + 1, parts });
    }
  });
  const lettering = labelLayout(trays.flatMap((tr) => tr.labels), d.layout.beadOD / 2, d.layout.hole / 2, d.chamfer);
  return { trays, capacity, plate, margin: MARGIN, lettering };
}

// ---------------------------------------------------------------- 3MF

const num = (v: number) => String(Math.round(v * 1e4) / 1e4);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function meshXml(xyz: number[], tri: number[]): string {
  const v: string[] = [];
  for (let i = 0; i < xyz.length; i += 3) v.push(`<vertex x="${num(xyz[i])}" y="${num(xyz[i + 1])}" z="${num(xyz[i + 2])}"/>`);
  const f: string[] = [];
  for (let i = 0; i < tri.length; i += 3) f.push(`<triangle v1="${tri[i]}" v2="${tri[i + 1]}" v3="${tri[i + 2]}"/>`);
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${f.join('')}</triangles></mesh>`;
}

/**
 * Watertight tube with chamfered outer edges, standing on z = 0. The profile is
 * walked bottom → outer wall → top → bore, which with (a, b, c) winding gives
 * outward-facing triangles everywhere. With a label, the flat top is rebuilt
 * with the number cut ENGRAVE_DEPTH into it.
 */
function beadMesh(L: number, R: number, r: number, chamfer: number, label: GlyphCut[] = []): string {
  const { w, h } = chamferSize(chamfer, L, R - r);
  const prof: [number, number][] = w >= 0.05
    ? [[r, 0], [R - w, 0], [R, h], [R, L - h], [R - w, L], [r, L]]
    : [[r, 0], [R, 0], [R, L], [r, L]];
  const P = prof.length;
  const xyz: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const [pr, pz] of prof) xyz.push(pr * ca, pr * sa, pz);
  }
  const tri: number[] = [];
  const engraved = label.length > 0;
  for (let i = 0; i < SEGMENTS; i++) {
    const i2 = (i + 1) % SEGMENTS;
    for (let j = 0; j < P; j++) {
      if (engraved && j === P - 2) continue; // the flat top, rebuilt below
      const j2 = (j + 1) % P;
      const a = i * P + j;
      const b = i2 * P + j;
      const cc = i2 * P + j2;
      const dd = i * P + j2;
      tri.push(a, b, cc, a, cc, dd);
    }
  }
  if (engraved) {
    const ring = (j: number) => Array.from({ length: SEGMENTS }, (_, i) => i * P + j);
    engraveTop(xyz, tri, ring(P - 2), ring(P - 1), L, label);
  }
  return meshXml(xyz, tri);
}

/**
 * The bead's flat top (between the chamfer ring and the bore ring) with the
 * label sunk into it. Inside each glyph's box the mesh follows the font grid:
 * cut cells become groove floor, the rest stays top surface, and walls stand
 * wherever the two meet. Earcut only fills the plain top around the boxes (four
 * corners each, nothing collinear), and each box side is then fanned out to all
 * of its grid nodes so every edge pairs up. All horizontal faces point up.
 */
function engraveTop(xyz: number[], tri: number[], outerRing: number[], bore: number[], L: number, glyphs: GlyphCut[]): void {
  const add = (x: number, y: number, z: number) => (xyz.push(x, y, z), xyz.length / 3 - 1);
  const boxes: number[][] = [];
  const sides = new Map<string, number[]>();
  for (const gl of glyphs) {
    const rows = gl.cut.length;
    const cols = gl.cut[0].length;
    const upper: number[][] = gl.nodes.map(() => []);
    const lower: number[][] = gl.nodes.map(() => []);
    const top = (i: number, j: number) => (upper[i][j] ??= add(gl.nodes[i][j][0], gl.nodes[i][j][1], L));
    const low = (i: number, j: number) => (lower[i][j] ??= add(gl.nodes[i][j][0], gl.nodes[i][j][1], L - ENGRAVE_DEPTH));
    const isCut = (i: number, j: number) => i >= 0 && i < rows && j >= 0 && j < cols && gl.cut[i][j];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        // Cell corners counter-clockwise: bottom-left, bottom-right, top-right, top-left.
        const c: [number, number][] = [[i + 1, j], [i + 1, j + 1], [i, j + 1], [i, j]];
        const v = c.map(([a, b]) => (gl.cut[i][j] ? low(a, b) : top(a, b)));
        tri.push(v[0], v[1], v[2], v[0], v[2], v[3]);
        if (!gl.cut[i][j]) continue;
        // A wall on each side that faces uncut surface; the groove lies left of a → b.
        const wall = ([ai, aj]: [number, number], [bi, bj]: [number, number]) =>
          tri.push(top(ai, aj), top(bi, bj), low(bi, bj), top(ai, aj), low(bi, bj), low(ai, aj));
        if (!isCut(i + 1, j)) wall(c[0], c[1]);
        if (!isCut(i, j + 1)) wall(c[1], c[2]);
        if (!isCut(i - 1, j)) wall(c[2], c[3]);
        if (!isCut(i, j - 1)) wall(c[3], c[0]);
      }
    // The box outline counter-clockwise, every side with all its grid nodes.
    const span = (n: number, at: (k: number) => number) => Array.from({ length: n + 1 }, (_, k) => at(k));
    const box = [
      span(cols, (k) => top(rows, k)),
      span(rows, (k) => top(rows - k, cols)),
      span(cols, (k) => top(0, cols - k)),
      span(rows, (k) => top(k, 0)),
    ];
    for (const side of box) {
      sides.set(`${side[0]},${side[side.length - 1]}`, side);
      sides.set(`${side[side.length - 1]},${side[0]}`, [...side].reverse());
    }
    boxes.push(box.map((side) => side[0]));
  }

  const at = (v: number) => new Vector2(xyz[3 * v], xyz[3 * v + 1]);
  const all = [outerRing, bore, ...boxes].flat();
  const faces = ShapeUtils.triangulateShape(outerRing.map(at), [bore, ...boxes].map((loop) => loop.map(at))).map((f) => f.map((i) => all[i]));
  let sum = 0;
  for (const [a, b, c] of faces) {
    const [pa, pb, pc] = [at(a), at(b), at(c)];
    sum += (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
  }
  for (const [a, b, c] of faces) {
    const t = sum > 0 ? [a, b, c] : [a, c, b];
    // A triangle resting on a box side takes in that side's grid nodes as a fan.
    const e = [0, 1, 2].find((k) => sides.has(`${t[k]},${t[(k + 1) % 3]}`));
    if (e === undefined) {
      tri.push(...t);
      continue;
    }
    const run = sides.get(`${t[e]},${t[(e + 1) % 3]}`)!;
    const apex = t[(e + 2) % 3];
    for (let n = 0; n + 1 < run.length; n++) tri.push(run[n], run[n + 1], apex);
  }
}

async function package3mf(title: string, resources: string, build: string): Promise<Uint8Array<ArrayBuffer>> {
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata><metadata name="Application">${esc(CREDIT)}</metadata>` +
    `<resources>${resources}</resources><build>${build}</build></model>`;
  return zipDeflated([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    },
    { name: '3D/3dmodel.model', data: model },
  ]);
}

function slug(s: string): string {
  return s
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .toLowerCase() || 'colour';
}

const centreOf = (plate: TrayPlan['plate']) => `1 0 0 0 1 0 0 0 1 ${num(plate.w / 2)} ${num(plate.d / 2)} 0`;
const moveTo = ([x, y]: [number, number]) => `1 0 0 0 1 0 0 0 1 ${num(x)} ${num(y)} 0`;

/** One tray as a 3MF package, plus a tidy file name. */
async function trayPackage(d: Design, plan: TrayPlan, tray: Tray, meshes: string[], engrave: boolean): Promise<{ name: string; data: Uint8Array<ArrayBuffer> }> {
  const colour = paletteLabels(d.palette)[tray.color];
  const hex = d.palette[tray.color].hex.toUpperCase();
  const lettering = engrave ? plan.lettering : null;
  const bead = (id: number, name: string, mesh: string) => `<object id="${id}" type="model" name="${esc(name)}" pid="1" pindex="0">${mesh}</object>`;
  let objects: string;
  let components: string;
  let trayId: number;
  if (lettering) {
    // Every bead carries its own number, so each one is its own mesh.
    const R = d.layout.beadOD / 2;
    const r = d.layout.hole / 2;
    objects = tray.beads
      .map((li, i) => bead(2 + i, `${tray.labels[i]} · ${d.lengths[li]} mm`, beadMesh(d.lengths[li], R, r, d.chamfer, labelCuts(tray.labels[i], lettering))))
      .join('');
    components = tray.positions.map((p, i) => `<component objectid="${2 + i}" transform="${moveTo(p)}"/>`).join('');
    trayId = 2 + tray.beads.length;
  } else {
    objects = [...new Set(tray.beads)].map((li) => bead(2 + li, `${colour} ${d.lengths[li]} mm`, meshes[li])).join('');
    components = tray.beads.map((li, i) => `<component objectid="${2 + li}" transform="${moveTo(tray.positions[i])}"/>`).join('');
    trayId = 2 + d.lengths.length;
  }
  const title = `${colour} ${tray.part}/${tray.parts}`;
  const resources =
    `<basematerials id="1"><base name="${esc(colour)}" displaycolor="${hex}FF"/></basematerials>` +
    objects +
    `<object id="${trayId}" type="model" name="${esc(title)}"><components>${components}</components></object>`;
  const name = `${String(tray.number).padStart(2, '0')}-${slug(colour)}-${hex.slice(1)}${tray.parts > 1 ? `-${tray.part}of${tray.parts}` : ''}.3mf`;
  return { name, data: await package3mf(title, resources, `<item objectid="${trayId}" transform="${centreOf(plan.plate)}"/>`) };
}

function beadMeshes(d: Design): string[] {
  return d.lengths.map((L) => beadMesh(L, d.layout.beadOD / 2, d.layout.hole / 2, d.chamfer));
}

/** A single tray as a 3MF file (opens straight in Bambu Studio). */
export async function trayFile(d: Design, printer: PrinterId, index: number, engrave: boolean): Promise<{ name: string; data: Uint8Array<ArrayBuffer> } | null> {
  const plan = planTrays(d, printer);
  const tray = plan.trays[index];
  if (!tray) return null;
  const { name, data } = await trayPackage(d, plan, tray, beadMeshes(d), engrave);
  return { name: `bead-curtain-tray-${name}`, data };
}

/** Zip with one 3MF per tray, one 3MF per bead length (for reprints) and a README. */
export async function traysZip(
  d: Design,
  printer: PrinterId,
  engrave: boolean,
  onProgress?: (done: number, total: number) => void | Promise<void>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plan = planTrays(d, printer);
  const { plate } = plan;
  const meshes = beadMeshes(d);
  const labels = paletteLabels(d.palette);
  const centre = centreOf(plate);

  const entries: ZipEntry[] = [];
  const readme: string[] = [t('readmeTitle'), '', t('readmeIntro'), ''];
  if (engrave && plan.lettering) readme.push(t('readmeNumbers'), '');
  readme.push(`${plate.label}: ${plate.w} × ${plate.d} mm`, '');

  for (const [i, tray] of plan.trays.entries()) {
    await onProgress?.(i + 1, plan.trays.length);
    const { name, data } = await trayPackage(d, plan, tray, meshes, engrave);
    const file = `trays/${name}`;
    entries.push({ name: file, data });
    readme.push(t('readmeTray', { file, colour: labels[tray.color], hex: d.palette[tray.color].hex.toUpperCase(), count: tray.beads.length }));
  }

  for (const [li, L] of d.lengths.entries()) {
    if (!d.lengthCounts[li]) continue;
    const resources = `<object id="2" type="model" name="Bead ${L} mm">${meshes[li]}</object>`;
    entries.push({ name: `singles/bead-${L}mm.3mf`, data: await package3mf(`Bead ${L} mm`, resources, `<item objectid="2" transform="${centre}"/>`) });
  }
  readme.push('', t('readmeSingles'), '', CREDIT);
  entries.push({ name: 'README.txt', data: readme.join('\r\n') });
  return zip(entries);
}
