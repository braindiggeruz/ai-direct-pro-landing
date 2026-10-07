// A photographed task before it leaves for the model (spec §8.1 item 4):
// what kind of picture it is, by its first bytes, and the same picture
// without its metadata.
//
// The browser already re-encodes the photo through a canvas, which drops
// EXIF; the server trusts nothing of that and cuts the metadata again:
//   JPEG  every APP1–APP15 segment (EXIF, XMP, ICC, Photoshop …) and every
//         COM segment, up to the start of scan; APP0 (JFIF) stays, it holds
//         only the density. The entropy-coded data after SOS is copied as is.
//   PNG   the chunks tEXt, zTXt, iTXt (text and XMP), eXIf and tIME (the
//         modification time). Everything else is copied, CRC included.
//   WebP  the chunks EXIF and XMP; in a VP8X header the EXIF and XMP flag
//         bits are cleared and the RIFF size is corrected.
// A picture whose structure does not parse is not a picture we send on
// (null: 415 unsupported_media). Nothing here keeps or logs a byte.

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

/** The most a photo may weigh after the browser shrank it (spec §8.1: 1 MB). */
export const MAX_PHOTO_BYTES = 1_048_576;

export const IMAGE_MIMES: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp"];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG segments that may carry metadata: APP1–APP15 and COM. APP0 (0xe0) stays. */
const JPEG_META_MARKERS = new Set<number>([...Array.from({ length: 15 }, (_, i) => 0xe1 + i), 0xfe]);
/** PNG chunks that carry text, EXIF or the time; the picture needs none of them. */
const PNG_META_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
/** WebP chunks with metadata. */
const WEBP_META_CHUNKS = new Set(["EXIF", "XMP "]);
const WEBP_EXIF_FLAG = 0x08;
const WEBP_XMP_FLAG = 0x04;

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

/** The kind of picture `bytes` are, by their magic bytes, or null. */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export interface JpegSegment {
  readonly marker: number;
  readonly offset: number;
  /** Marker, length and payload. */
  readonly length: number;
}

/**
 * The marker segments of a JPEG before its start of scan, in order, or null
 * when the structure does not parse (no SOI, a truncated segment, no SOS).
 */
export function jpegSegments(bytes: Uint8Array): JpegSegment[] | null {
  if (sniffImage(bytes) !== "image/jpeg") return null;
  const segments: JpegSegment[] = [];
  let at = 2;
  for (;;) {
    // Fill bytes (0xff) may pad a marker.
    while (at < bytes.length && bytes[at] === 0xff && bytes[at + 1] === 0xff) at++;
    if (at + 4 > bytes.length || bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Stand-alone markers carry no length.
      segments.push({ marker, offset: at, length: 2 });
      at += 2;
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2 || at + 2 + length > bytes.length) return null;
    segments.push({ marker, offset: at, length: length + 2 });
    at += length + 2;
    if (marker === 0xda) return segments; // SOS: the scan follows until EOI
  }
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const segments = jpegSegments(bytes);
  if (!segments) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let end = 2;
  for (const segment of segments) {
    end = segment.offset + segment.length;
    if (!JPEG_META_MARKERS.has(segment.marker)) kept.push(bytes.subarray(segment.offset, end));
  }
  kept.push(bytes.subarray(end));
  return concat(kept);
}

export interface PngChunk {
  readonly type: string;
  readonly offset: number;
  /** Length, type, data and CRC. */
  readonly length: number;
}

/** The chunks of a PNG, in order, or null when the structure does not parse (IEND must close it). */
export function pngChunks(bytes: Uint8Array): PngChunk[] | null {
  if (sniffImage(bytes) !== "image/png") return null;
  const chunks: PngChunk[] = [];
  let at = 8;
  for (;;) {
    if (at + 12 > bytes.length) return null;
    const dataLength = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    const type = ascii(bytes, at + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    const length = 12 + dataLength;
    if (at + length > bytes.length) return null;
    chunks.push({ type, offset: at, length });
    at += length;
    if (type === "IEND") return chunks;
  }
}

function stripPng(bytes: Uint8Array): Uint8Array | null {
  const chunks = pngChunks(bytes);
  if (!chunks || chunks[0]?.type !== "IHDR") return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  for (const chunk of chunks) {
    if (!PNG_META_CHUNKS.has(chunk.type)) kept.push(bytes.subarray(chunk.offset, chunk.offset + chunk.length));
  }
  return concat(kept);
}

export interface WebpChunk {
  readonly fourcc: string;
  readonly offset: number;
  /** FourCC, size, payload and the pad byte of an odd payload. */
  readonly length: number;
}

/** The chunks of a WebP after its RIFF header, or null when the container does not parse. */
export function webpChunks(bytes: Uint8Array): WebpChunk[] | null {
  if (sniffImage(bytes) !== "image/webp") return null;
  const riffSize = readU32LE(bytes, 4);
  const end = Math.min(bytes.length, 8 + riffSize);
  if (riffSize < 4 || 8 + riffSize > bytes.length) return null;
  const chunks: WebpChunk[] = [];
  let at = 12;
  while (at < end) {
    if (at + 8 > end) return null;
    const fourcc = ascii(bytes, at, 4);
    const size = readU32LE(bytes, at + 4);
    const length = 8 + size + (size % 2);
    if (at + 8 + size > end) return null;
    chunks.push({ fourcc, offset: at, length: Math.min(length, end - at) });
    at += length;
  }
  return chunks.length ? chunks : null;
}

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  const chunks = webpChunks(bytes);
  if (!chunks) return null;
  const kept: Uint8Array[] = [];
  for (const chunk of chunks) {
    if (WEBP_META_CHUNKS.has(chunk.fourcc)) continue;
    const slice = bytes.slice(chunk.offset, chunk.offset + chunk.length);
    if (chunk.fourcc === "VP8X" && slice.length >= 9) slice[8] &= ~(WEBP_EXIF_FLAG | WEBP_XMP_FLAG) & 0xff;
    kept.push(slice);
  }
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12), 0);
  out.set(body, 12);
  writeU32LE(out, 4, 4 + body.length);
  return out;
}

/**
 * `bytes` without their metadata, as a new array, or null when they are
 * not a picture this tool sends on (unknown kind, or a structure that does
 * not parse). Pure.
 */
export function stripImageMetadata(bytes: Uint8Array): { readonly mime: ImageMime; readonly bytes: Uint8Array } | null {
  const mime = sniffImage(bytes);
  if (!mime) return null;
  const stripped = mime === "image/jpeg" ? stripJpeg(bytes) : mime === "image/png" ? stripPng(bytes) : stripWebp(bytes);
  return stripped ? { mime, bytes: stripped } : null;
}

/** True when a picture still carries a metadata segment or chunk this file removes. */
export function hasImageMetadata(bytes: Uint8Array): boolean {
  switch (sniffImage(bytes)) {
    case "image/jpeg":
      return (jpegSegments(bytes) ?? []).some((segment) => JPEG_META_MARKERS.has(segment.marker));
    case "image/png":
      return (pngChunks(bytes) ?? []).some((chunk) => PNG_META_CHUNKS.has(chunk.type));
    case "image/webp":
      return (webpChunks(bytes) ?? []).some((chunk) => WEBP_META_CHUNKS.has(chunk.fourcc));
    default:
      return false;
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function readU32LE(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

function writeU32LE(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >>> 8) & 0xff;
  bytes[at + 2] = (value >>> 16) & 0xff;
  bytes[at + 3] = (value >>> 24) & 0xff;
}
