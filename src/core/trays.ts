// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
// Print trays: every bead laid out standing upright on Bambu Lab build plates,
// one colour per tray, exported as 3MF files Bambu Studio opens directly.

import { CREDIT } from '../credit';
import { paletteLabels, t } from '../i18n';
import type { Design } from './design';
import { PRINTERS, type PrinterId } from './state';
import { zip, type ZipEntry } from './zip';

const MARGIN = 8; // mm kept free along the plate edge
const GAP = 3; // mm between neighbouring beads
const SEGMENTS = 64;

export interface Tray {
  color: number;
  /** Length index of every bead on the tray, tallest first. */
  beads: number[];
  part: number;
  parts: number;
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

export function planTrays(d: Design, printer: PrinterId): { trays: Tray[]; capacity: number } {
  const plate = PRINTERS[printer];
  const capacity = Math.max(1, slots(plate.w, plate.d, d.layout.beadOD).length);
  const byColor: number[][] = d.palette.map(() => []);
  for (let k = 0; k < d.beadCount; k++) byColor[d.bColor[k]].push(d.bLen[k]);
  const trays: Tray[] = [];
  byColor.forEach((lens, color) => {
    lens.sort((a, b) => d.lengths[b] - d.lengths[a]);
    const parts = Math.ceil(lens.length / capacity);
    for (let i = 0; i < parts; i++) trays.push({ color, beads: lens.slice(i * capacity, (i + 1) * capacity), part: i + 1, parts });
  });
  return { trays, capacity };
}

// ---------------------------------------------------------------- 3MF

const num = (v: number) => String(Math.round(v * 1e4) / 1e4);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Watertight tube with chamfered outer edges, standing on z = 0. The profile is
 * walked bottom → outer wall → top → bore, which with (a, b, c) winding gives
 * outward-facing triangles everywhere.
 */
function beadMesh(L: number, R: number, r: number): string {
  const c = Math.min(0.4, L * 0.15, (R - r) * 0.3);
  const prof: [number, number][] = c >= 0.05
    ? [[r, 0], [R - c, 0], [R, c], [R, L - c], [R - c, L], [r, L]]
    : [[r, 0], [R, 0], [R, L], [r, L]];
  const P = prof.length;
  const v: string[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const [pr, pz] of prof) v.push(`<vertex x="${num(pr * ca)}" y="${num(pr * sa)}" z="${num(pz)}"/>`);
  }
  const tri: string[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const i2 = (i + 1) % SEGMENTS;
    for (let j = 0; j < P; j++) {
      const j2 = (j + 1) % P;
      const a = i * P + j;
      const b = i2 * P + j;
      const cc = i2 * P + j2;
      const dd = i * P + j2;
      tri.push(`<triangle v1="${a}" v2="${b}" v3="${cc}"/>`, `<triangle v1="${a}" v2="${cc}" v3="${dd}"/>`);
    }
  }
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${tri.join('')}</triangles></mesh>`;
}

function package3mf(title: string, resources: string, build: string): Uint8Array {
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata><metadata name="Application">${esc(CREDIT)}</metadata>` +
    `<resources>${resources}</resources><build>${build}</build></model>`;
  return zip([
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

/** Zip with one 3MF per tray, one 3MF per bead length (for reprints) and a README. */
export function traysZip(d: Design, printer: PrinterId): Uint8Array<ArrayBuffer> {
  const plate = PRINTERS[printer];
  const { trays } = planTrays(d, printer);
  const R = d.layout.beadOD / 2;
  const r = d.layout.hole / 2;
  const meshes = d.lengths.map((L) => beadMesh(L, R, r));
  const labels = paletteLabels(d.palette);
  const allSlots = slots(plate.w, plate.d, d.layout.beadOD);
  const centre = `1 0 0 0 1 0 0 0 1 ${num(plate.w / 2)} ${num(plate.d / 2)} 0`;

  const entries: ZipEntry[] = [];
  const readme: string[] = [t('readmeTitle'), '', t('readmeIntro'), '', `${PRINTERS[printer].label}: ${plate.w} × ${plate.d} mm`, ''];

  trays.forEach((tray, ti) => {
    const label = labels[tray.color];
    const hex = d.palette[tray.color].hex.toUpperCase();
    const used = [...new Set(tray.beads)];
    const pos = allSlots.slice(0, tray.beads.length);
    // Centre the occupied area on the plate.
    const xs = pos.map((p) => p[0]);
    const ys = pos.map((p) => p[1]);
    const dx = -(Math.min(...xs) + Math.max(...xs)) / 2;
    const dy = -(Math.min(...ys) + Math.max(...ys)) / 2;

    const objects = used.map((li) => `<object id="${2 + li}" type="model" name="${esc(`${label} ${d.lengths[li]} mm`)}" pid="1" pindex="0">${meshes[li]}</object>`).join('');
    const components = tray.beads.map((li, i) => `<component objectid="${2 + li}" transform="1 0 0 0 1 0 0 0 1 ${num(pos[i][0] + dx)} ${num(pos[i][1] + dy)} 0"/>`).join('');
    const trayId = 2 + d.lengths.length;
    const title = `${label} ${tray.part}/${tray.parts}`;
    const resources =
      `<basematerials id="1"><base name="${esc(label)}" displaycolor="${hex}FF"/></basematerials>` +
      objects +
      `<object id="${trayId}" type="model" name="${esc(title)}"><components>${components}</components></object>`;

    const file = `trays/${String(ti + 1).padStart(2, '0')}-${slug(label)}-${hex.slice(1)}${tray.parts > 1 ? `-${tray.part}of${tray.parts}` : ''}.3mf`;
    entries.push({ name: file, data: package3mf(title, resources, `<item objectid="${trayId}" transform="${centre}"/>`) });
    readme.push(t('readmeTray', { file, colour: label, hex, count: tray.beads.length }));
  });

  d.lengths.forEach((L, li) => {
    if (!d.lengthCounts[li]) return;
    const resources = `<object id="2" type="model" name="Bead ${L} mm">${meshes[li]}</object>`;
    entries.push({ name: `singles/bead-${L}mm.3mf`, data: package3mf(`Bead ${L} mm`, resources, `<item objectid="2" transform="${centre}"/>`) });
  });
  readme.push('', t('readmeSingles'), '', CREDIT);
  entries.push({ name: 'README.txt', data: readme.join('\r\n') });
  return zip(entries);
}
