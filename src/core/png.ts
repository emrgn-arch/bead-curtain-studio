// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import { crc32 } from './zip';

const IHDR_END = 33; // 8-byte signature + IHDR chunk (4 length + 4 type + 13 data + 4 CRC)

/** Add Latin-1 tEXt metadata chunks to a PNG, right after its header. Image data is untouched. */
export function withPngText(png: Uint8Array, entries: Record<string, string>): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  for (const [key, value] of Object.entries(entries)) {
    const text = `${key}\0${value}`;
    const chunk = new Uint8Array(12 + text.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, text.length);
    chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
    for (let i = 0; i < text.length; i++) chunk[8 + i] = text.charCodeAt(i) & 0xff;
    view.setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));
    chunks.push(chunk);
  }
  const out = new Uint8Array(png.length + chunks.reduce((s, c) => s + c.length, 0));
  out.set(png.subarray(0, IHDR_END), 0);
  let p = IHDR_END;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(png.subarray(IHDR_END), p);
  return out;
}
