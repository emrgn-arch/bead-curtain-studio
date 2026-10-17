// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
// UI strings. English is the reference; the Turkish table must have every key
// (TypeScript enforces it). Placeholders look like {name}.

import type { PaletteEntry } from './core/quantize';

const en = {
  docTitle: 'Strands — Bead Curtain Studio',
  sticker: 'Bead curtain studio',
  tagline: 'Your picture in → every bead out',
  resetDesign: 'Reset design',
  resetConfirm: 'Click again to reset',
  uploadImage: 'Upload image',
  unreadableImage: 'Sorry, that file could not be read as an image.',
  noWebgl: 'WebGL is not available in this browser, so the 3D preview is disabled. The build sheet still works.',
  language: 'Language',
  settings: 'Design settings',
  valueOf: '{label} value',

  pImage: 'Image',
  pResolution: 'Resolution',
  pColours: 'Colours',
  pOpening: 'Opening',
  pRopes: 'Ropes & beads',

  dropTitle: 'Drop an image',
  dropSub: 'or click to upload',
  demoName: 'Demo image',
  useDemo: 'Use the demo image',
  placeImage: 'Place image',
  confirmPlacement: 'Confirm placement',
  adjustImage: 'Adjust image',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  outside: 'Outside the image',
  fillColour: 'Fill colour',
  bareRope: 'Bare rope',
  bareRopeTitle: 'No beads where the image does not reach (needs knots)',
  placing: 'placing…',
  demo: 'demo',

  beadLength: 'Bead length',
  shortestBead: 'Shortest bead',
  longestBead: 'Longest bead',
  lengthCount: 'Number of lengths',
  dithering: 'Dithering',
  lengthsSummary: '{n} lengths',

  idealColours: 'Ideal colours',
  myFilaments: 'My filaments',
  maxColours: 'Max number of colours',
  useOwnFilaments: '+ Use my own filament colours',
  import: 'Import',
  export: 'Export',
  filamentsEmpty: 'Add the colours you can print. Until then, ideal colours are used.',
  filamentNamePh: 'Name, e.g. Rust PLA',
  filamentColour: 'Filament colour',
  filamentName: 'Filament name',
  addFilament: 'Add filament',
  switchOff: 'Switch off {name}',
  switchOn: 'Switch on {name}',
  remove: 'Remove {name}',
  switchedOff: 'switched off',
  badFilamentFile: 'That file does not look like a filament list.',
  summaryFilaments: 'filaments',
  summaryIdeal: 'ideal',
  colourN: 'Colour {n}',
  fillName: 'Fill',

  presetSingle: 'Single',
  presetStandard: 'Standard',
  presetDouble: 'Double',
  width: 'Width',
  height: 'Height',
  margins: 'Margins & clearances',
  topToFirst: 'Top → first bead',
  topToFirstHint: 'Free rope between the rail and the first bead.',
  bottomClearance: 'Bottom clearance',
  sideMargin: 'Side margin',
  sideMarginHint: 'Minimum space between the outermost beads and the frame.',

  bySpacing: 'By spacing',
  byCount: 'By count',
  ropeSpacing: 'Rope spacing',
  ropeCount: 'Number of ropes',
  beadGap: 'Bead gap',
  beadDia: 'Bead Ø',
  holeDia: 'Hole Ø',
  wall: 'Wall',
  ropeHole: 'Rope, hole & chamfer',
  chamfer: 'Bead chamfer',
  ropeDia: 'Rope Ø',
  clearance: 'Clearance',
  ropeColour: 'Rope colour',
  ropesSummary: '{n} ropes',

  viewFront: 'Front',
  viewAngle: 'Angle',
  viewDetail: 'Close-up',
  cameraView: 'Camera view',
  backdropStudio: 'Studio',
  backdropRoom: 'Room',
  moodGolden: 'Golden hour',
  moodDaylight: 'Daylight',
  moodEvening: 'Evening',
  motion: 'Motion',
  motionTitle: 'Gentle rope sway',
  physics: 'Physics',
  physicsTitle: 'Drag the beads to swing the curtain',
  screenshot: 'Screenshot',
  screenshotTitle: 'Save a PNG of the view',
  imageOverlay: 'Image overlay',
  overlayHint: '<b>Drag</b> to move · <b>scroll</b> to zoom · <b>arrows</b> nudge',
  fitImage: 'Fit image',
  fitFill: 'Fill',
  fitFit: 'Fit',
  fitCentre: 'Centre',
  opacity: 'Opacity',
  cancel: 'Cancel',
  confirm: 'Confirm',
  dropToLoad: 'Drop to load image',
  badge: '<b>{n}</b> ropes <i>/</i> <b>{m}</b> beads <i>/</i> {w} × {h} m',

  buildSheet: 'Build sheet',
  live: 'live',
  statRopes: 'Ropes',
  statBeads: 'Beads',
  statColours: 'Colours',
  statLengths: 'Lengths',
  specBeadOD: 'Bead outer Ø',
  specRopeEach: 'Rope per strand',
  specRopeTotal: 'Rope total',
  specFilament: 'Filament (PLA, solid)',
  hLengths: 'Lengths',
  fillTag: 'fill',
  matrix: 'Colour × length matrix',
  bomCsv: 'Bill of materials (CSV)',
  guideCsv: 'Stringing guide (CSV)',
  patternAria: 'Flat pattern preview of the curtain',
  trays: 'Print trays',
  printer: 'Printer',
  traysSummary: '{n} trays · one colour per tray · {size} mm plate',
  exportTrays: 'Export for Bambu Studio (.3mf)',

  wNoWall: 'Bead Ø ({od} mm) leaves no wall around the {hole} mm hole — increase the rope spacing or reduce the bead gap.',
  wThinWall: 'Bead wall is only {wall} mm — thin for FDM printing (≥ {min} mm recommended).',
  wCapped: 'Resolution capped at {n} samples to keep things responsive — use a longer shortest bead.',
  wManyBeads: '{n} beads — rendering may be slow. Use longer beads or a wider rope spacing.',

  csvColour: 'Colour',
  csvTotalBeads: 'Total beads',
  csvFilament: 'Filament (g)',
  csvTotal: 'Total',
  csvBeadOD: 'Bead outer Ø (mm)',
  csvHole: 'Hole Ø (mm)',
  csvRope: 'Rope Ø (mm)',
  csvRopes: 'Ropes',
  csvPitch: 'Rope pitch (mm)',
  csvRopeTotal: 'Total rope incl. allowance (m)',
  csvRopeNo: 'Rope',
  csvX: 'X from centre (mm)',
  csvStep: 'Step',
  csvLength: 'Length (mm)',
  csvQty: 'Qty',

  readmeTitle: 'Print trays for Bambu Studio',
  readmeIntro: 'Open a tray in Bambu Studio (File → Import). Each tray holds a single colour and the beads stand upright, so slice it with that filament.',
  readmeTray: '{file}: {colour} ({hex}) — {count} beads',
  readmeSingles: 'singles/: one bead of each length, for reprints.',
};

export type MessageKey = keyof typeof en;

const tr: Record<MessageKey, string> = {
  docTitle: 'Strands — Boncuk Perde Stüdyosu',
  sticker: 'Boncuk perde stüdyosu',
  tagline: 'Resminden boncuk boncuk perdeye',
  resetDesign: 'Tasarımı sıfırla',
  resetConfirm: 'Onaylamak için tekrar tıkla',
  uploadImage: 'Görsel yükle',
  unreadableImage: 'Üzgünüz, bu dosya görsel olarak okunamadı.',
  noWebgl: 'Bu tarayıcıda WebGL yok, bu yüzden 3B önizleme kapalı. Üretim föyü yine de çalışır.',
  language: 'Dil',
  settings: 'Tasarım ayarları',
  valueOf: '{label} değeri',

  pImage: 'Görsel',
  pResolution: 'Çözünürlük',
  pColours: 'Renkler',
  pOpening: 'Açıklık',
  pRopes: 'İpler ve boncuklar',

  dropTitle: 'Görseli bırak',
  dropSub: 'ya da tıklayıp yükle',
  demoName: 'Örnek görsel',
  useDemo: 'Örnek görseli kullan',
  placeImage: 'Görseli yerleştir',
  confirmPlacement: 'Yerleşimi onayla',
  adjustImage: 'Görsel ayarları',
  brightness: 'Parlaklık',
  contrast: 'Kontrast',
  saturation: 'Doygunluk',
  outside: 'Görselin dışı',
  fillColour: 'Dolgu rengi',
  bareRope: 'Çıplak ip',
  bareRopeTitle: 'Görselin ulaşmadığı yerde boncuk olmaz (düğüm gerekir)',
  placing: 'yerleştiriliyor…',
  demo: 'örnek',

  beadLength: 'Boncuk boyu',
  shortestBead: 'En kısa boncuk',
  longestBead: 'En uzun boncuk',
  lengthCount: 'Boy sayısı',
  dithering: 'Renk karıştırma',
  lengthsSummary: '{n} boy',

  idealColours: 'İdeal renkler',
  myFilaments: 'Filamentlerim',
  maxColours: 'En fazla renk sayısı',
  useOwnFilaments: '+ Kendi filament renklerimi kullan',
  import: 'İçe aktar',
  export: 'Dışa aktar',
  filamentsEmpty: 'Basabildiğin renkleri ekle. O zamana kadar ideal renkler kullanılır.',
  filamentNamePh: 'Ad, ör. Kiremit PLA',
  filamentColour: 'Filament rengi',
  filamentName: 'Filament adı',
  addFilament: 'Filament ekle',
  switchOff: '{name} kapat',
  switchOn: '{name} aç',
  remove: '{name} kaldır',
  switchedOff: 'kapalı',
  badFilamentFile: 'Bu dosya bir filament listesine benzemiyor.',
  summaryFilaments: 'filament',
  summaryIdeal: 'ideal',
  colourN: 'Renk {n}',
  fillName: 'Dolgu',

  presetSingle: 'Tek',
  presetStandard: 'Standart',
  presetDouble: 'Çift',
  width: 'Genişlik',
  height: 'Yükseklik',
  margins: 'Kenar boşlukları',
  topToFirst: 'Üst → ilk boncuk',
  topToFirstHint: 'Korniş ile ilk boncuk arasındaki boş ip.',
  bottomClearance: 'Alt boşluk',
  sideMargin: 'Yan boşluk',
  sideMarginHint: 'En dıştaki boncuklarla kasa arasında kalacak en az boşluk.',

  bySpacing: 'Aralığa göre',
  byCount: 'Sayıya göre',
  ropeSpacing: 'İp aralığı',
  ropeCount: 'İp sayısı',
  beadGap: 'Boncuk aralığı',
  beadDia: 'Boncuk Ø',
  holeDia: 'Delik Ø',
  wall: 'Et kalınlığı',
  ropeHole: 'İp, delik ve pah',
  chamfer: 'Boncuk pahı',
  ropeDia: 'İp Ø',
  clearance: 'Tolerans',
  ropeColour: 'İp rengi',
  ropesSummary: '{n} ip',

  viewFront: 'Ön',
  viewAngle: 'Açılı',
  viewDetail: 'Yakın',
  cameraView: 'Kamera açısı',
  backdropStudio: 'Stüdyo',
  backdropRoom: 'Oda',
  moodGolden: 'Altın saat',
  moodDaylight: 'Gün ışığı',
  moodEvening: 'Akşam',
  motion: 'Hareket',
  motionTitle: 'Hafif ip salınımı',
  physics: 'Fizik',
  physicsTitle: 'Perdeyi sallamak için boncukları sürükle',
  screenshot: 'Ekran görüntüsü',
  screenshotTitle: 'Görünümü PNG olarak kaydet',
  imageOverlay: 'Görsel katmanı',
  overlayHint: '<b>Sürükle</b>: taşı · <b>Tekerlek</b>: yakınlaştır · <b>Oklar</b>: ince ayar',
  fitImage: 'Görseli sığdır',
  fitFill: 'Doldur',
  fitFit: 'Sığdır',
  fitCentre: 'Ortala',
  opacity: 'Opaklık',
  cancel: 'İptal',
  confirm: 'Onayla',
  dropToLoad: 'Yüklemek için bırak',
  badge: '<b>{n}</b> ip <i>/</i> <b>{m}</b> boncuk <i>/</i> {w} × {h} m',

  buildSheet: 'Üretim föyü',
  live: 'canlı',
  statRopes: 'İp',
  statBeads: 'Boncuk',
  statColours: 'Renk',
  statLengths: 'Boy',
  specBeadOD: 'Boncuk dış Ø',
  specRopeEach: 'Sıra başına ip',
  specRopeTotal: 'Toplam ip',
  specFilament: 'Filament (PLA, dolu)',
  hLengths: 'Boylar',
  fillTag: 'dolgu',
  matrix: 'Renk × boy tablosu',
  bomCsv: 'Malzeme listesi (CSV)',
  guideCsv: 'Dizme kılavuzu (CSV)',
  patternAria: 'Perdenin düz desen önizlemesi',
  trays: 'Baskı tablaları',
  printer: 'Yazıcı',
  traysSummary: '{n} tabla · her tablada tek renk · {size} mm tabla',
  exportTrays: 'Bambu Studio için dışa aktar (.3mf)',

  wNoWall: 'Boncuk Ø ({od} mm), {hole} mm deliğin çevresinde et bırakmıyor — ip aralığını artır ya da boncuk aralığını azalt.',
  wThinWall: 'Boncuk et kalınlığı yalnızca {wall} mm — FDM baskı için ince (≥ {min} mm önerilir).',
  wCapped: 'Akıcılık için çözünürlük {n} örnekle sınırlandı — en kısa boncuğu uzat.',
  wManyBeads: '{n} boncuk — görüntüleme yavaşlayabilir. Daha uzun boncuk ya da daha geniş ip aralığı kullan.',

  csvColour: 'Renk',
  csvTotalBeads: 'Toplam boncuk',
  csvFilament: 'Filament (g)',
  csvTotal: 'Toplam',
  csvBeadOD: 'Boncuk dış Ø (mm)',
  csvHole: 'Delik Ø (mm)',
  csvRope: 'İp Ø (mm)',
  csvRopes: 'İp sayısı',
  csvPitch: 'İp aralığı (mm)',
  csvRopeTotal: 'Toplam ip, pay dahil (m)',
  csvRopeNo: 'İp',
  csvX: 'Merkezden X (mm)',
  csvStep: 'Sıra',
  csvLength: 'Boy (mm)',
  csvQty: 'Adet',

  readmeTitle: 'Bambu Studio için baskı tablaları',
  readmeIntro: 'Bir tablayı Bambu Studio’da açın (Dosya → İçe aktar). Her tabla tek renktir ve boncuklar dik durur; o renkteki filamentle dilimleyin.',
  readmeTray: '{file}: {colour} ({hex}) — {count} boncuk',
  readmeSingles: 'singles/: yeniden basım için her boydan bir boncuk.',
};

export type Lang = 'en' | 'tr';
const TABLES: Record<Lang, Record<MessageKey, string>> = { en, tr };
const LANG_KEY = 'bead-curtain-studio.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

let lang: Lang = initialLang();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
}

/** Locale used for number formatting. */
export function locale(): string {
  return lang === 'tr' ? 'tr-TR' : 'en-US';
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const s = TABLES[lang][key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Display names for a palette: filament names, or "Fill" / "Colour n" for free colours. */
export function paletteLabels(palette: PaletteEntry[]): string[] {
  let n = 0;
  return palette.map((e) => (e.kind === 'inventory' ? e.name : e.isFill ? t('fillName') : t('colourN', { n: ++n })));
}
