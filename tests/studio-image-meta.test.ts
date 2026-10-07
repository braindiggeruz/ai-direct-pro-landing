// The photo's metadata cut on the server (functions/lib/studio/image-meta.ts;
// spec §8.1 item 4): what a picture is by its first bytes, which JPEG
// segments, PNG chunks and WebP chunks go, and that a broken structure is no
// picture at all. Pure; no network.
// Run: node --import tsx --test tests/studio-image-meta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_MIMES,
  MAX_PHOTO_BYTES,
  hasImageMetadata,
  jpegSegments,
  pngChunks,
  sniffImage,
  stripImageMetadata,
  webpChunks,
} from "../functions/lib/studio/image-meta";

// ── Fixtures ────────────────────────────────────────────────────────────────

function segment(marker: number, payload: Uint8Array | number[]): number[] {
  const data = Array.from(payload);
  const length = data.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...data];
}

const text = (value: string) => Array.from(new TextEncoder().encode(value));

/** A JPEG with JFIF, EXIF (a fake GPS tag), an XMP packet, a comment, a quantization table and a scan. */
export function jpegWithMetadata(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...text("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...text("Exif\0\0"), ...text("GPSLatitude 41.3111 N")]),
    ...segment(0xe1, text("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Ali Valiyev</x:xmpmeta>")),
    ...segment(0xfe, text("Shot on a phone by Ali")),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, (_, i) => i + 1)]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    0x12, 0x34, 0x56, 0xff, 0x00, 0x78,
    0xff, 0xd9,
  ]);
}

function pngChunk(type: string, data: number[]): number[] {
  const length = data.length;
  return [(length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...text(type), ...data, 0, 0, 0, 0];
}

export function pngWithMetadata(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...pngChunk("tEXt", text("Author\0Ali Valiyev")),
    ...pngChunk("iTXt", text("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>")),
    ...pngChunk("zTXt", text("Comment\0") .concat([0, 0x78, 0x9c])),
    ...pngChunk("eXIf", text("Exif\0\0")),
    ...pngChunk("tIME", [7, 0xea, 10, 7, 12, 0, 0]),
    ...pngChunk("IDAT", [0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]),
    ...pngChunk("IEND", []),
  ]);
}

function webpChunk(fourcc: string, data: number[]): number[] {
  const size = data.length;
  return [...text(fourcc), size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff, ...data, ...(size % 2 ? [0] : [])];
}

export function webpWithMetadata(): Uint8Array {
  const body = [
    ...webpChunk("VP8X", [0x0c | 0x10, 0, 0, 0, 0x0f, 0, 0, 0x0f, 0, 0]), // EXIF + XMP + alpha flags
    ...webpChunk("VP8L", [0x2f, 0x0f, 0x00, 0x00, 0x00, 0x10, 0x07]),
    ...webpChunk("EXIF", text("Exif\0\0GPS 69.2797 E")),
    ...webpChunk("XMP ", text("<x:xmpmeta>Ali</x:xmpmeta>")),
  ];
  const size = 4 + body.length;
  return new Uint8Array([...text("RIFF"), size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff, ...text("WEBP"), ...body]);
}

const bytesOf = (image: Uint8Array) => Array.from(image).map((byte) => byte.toString(16).padStart(2, "0")).join("");

// ── Sniffing ────────────────────────────────────────────────────────────────

test("magic bytes decide the kind: JPEG, PNG and WebP; anything else is no picture", () => {
  assert.equal(sniffImage(jpegWithMetadata()), "image/jpeg");
  assert.equal(sniffImage(pngWithMetadata()), "image/png");
  assert.equal(sniffImage(webpWithMetadata()), "image/webp");
  assert.equal(sniffImage(new Uint8Array(text("GIF89a......"))), null);
  assert.equal(sniffImage(new Uint8Array(text("<svg xmlns='http://www.w3.org/2000/svg'/>"))), null);
  assert.equal(sniffImage(new Uint8Array(text("%PDF-1.4"))), null);
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null, "two bytes are not a JPEG");
  assert.equal(sniffImage(new Uint8Array([...text("RIFF"), 4, 0, 0, 0, ...text("WAVE")])), null, "a RIFF that is not WEBP");
  assert.equal(sniffImage(new Uint8Array()), null);
  assert.deepEqual([...IMAGE_MIMES], ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(MAX_PHOTO_BYTES, 1024 * 1024);
});

// ── JPEG ────────────────────────────────────────────────────────────────────

test("JPEG: APP1–APP15 and COM go, APP0, the tables and the scan stay byte for byte", () => {
  const dirty = jpegWithMetadata();
  assert.equal(hasImageMetadata(dirty), true);
  const clean = stripImageMetadata(dirty);
  assert.ok(clean);
  assert.equal(clean.mime, "image/jpeg");
  const markers = (jpegSegments(clean.bytes) ?? []).map((segment) => segment.marker);
  assert.deepEqual(markers, [0xe0, 0xdb, 0xda]);
  assert.equal(hasImageMetadata(clean.bytes), false);
  const hex = bytesOf(clean.bytes);
  assert.doesNotMatch(hex, new RegExp(bytesOf(new Uint8Array(text("GPSLatitude")))));
  assert.doesNotMatch(hex, new RegExp(bytesOf(new Uint8Array(text("Ali")))));
  assert.match(hex, /ffd8ffe0/);
  // The scan, its escaped 0xff00 included, and EOI are untouched at the end.
  assert.ok(hex.endsWith("123456ff0078ffd9"));
  // A second pass changes nothing.
  assert.deepEqual(stripImageMetadata(clean.bytes)?.bytes, clean.bytes);
  // The input is not modified.
  assert.deepEqual(dirty, jpegWithMetadata());
});

test("JPEG: a truncated segment or a file without a start of scan is no picture", () => {
  const dirty = jpegWithMetadata();
  assert.equal(stripImageMetadata(dirty.subarray(0, 30)), null, "cut inside a segment");
  const noScan = new Uint8Array([0xff, 0xd8, ...segment(0xe0, text("JFIF\0")), 0xff, 0xd9]);
  assert.equal(stripImageMetadata(noScan), null);
  const badLength = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, 0xff, 0xd9]);
  assert.equal(stripImageMetadata(badLength), null);
  // Every APP marker counts, APP15 too; a stand-alone marker between segments is fine.
  const app15 = new Uint8Array([0xff, 0xd8, 0xff, 0xff, ...segment(0xef, text("secret")), 0xff, 0xd0, ...segment(0xda, [1]), 0xff, 0xd9]);
  const cleaned = stripImageMetadata(app15);
  assert.ok(cleaned);
  assert.deepEqual((jpegSegments(cleaned.bytes) ?? []).map((segment) => segment.marker), [0xd0, 0xda]);
});

// ── PNG ─────────────────────────────────────────────────────────────────────

test("PNG: tEXt, zTXt, iTXt, eXIf and tIME go; IHDR, IDAT and IEND stay", () => {
  const dirty = pngWithMetadata();
  assert.equal(hasImageMetadata(dirty), true);
  const clean = stripImageMetadata(dirty);
  assert.ok(clean);
  assert.equal(clean.mime, "image/png");
  assert.deepEqual((pngChunks(clean.bytes) ?? []).map((chunk) => chunk.type), ["IHDR", "IDAT", "IEND"]);
  assert.equal(hasImageMetadata(clean.bytes), false);
  assert.doesNotMatch(bytesOf(clean.bytes), new RegExp(bytesOf(new Uint8Array(text("Valiyev")))));
  assert.deepEqual(stripImageMetadata(clean.bytes)?.bytes, clean.bytes);
});

test("PNG: a chunk past the end, a non-letter chunk type, a missing IEND or a file that does not start with IHDR is no picture", () => {
  const dirty = pngWithMetadata();
  assert.equal(stripImageMetadata(dirty.subarray(0, dirty.length - 20)), null);
  const noIhdr = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...pngChunk("tEXt", text("a\0b")), ...pngChunk("IEND", [])]);
  assert.equal(stripImageMetadata(noIhdr), null);
  const bad = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x31, 0x32, 0x33, 0x34, 0, 0, 0, 0]);
  assert.equal(stripImageMetadata(bad), null);
});

// ── WebP ────────────────────────────────────────────────────────────────────

test("WebP: EXIF and XMP go, the VP8X flags are cleared, the RIFF size follows", () => {
  const dirty = webpWithMetadata();
  assert.equal(hasImageMetadata(dirty), true);
  const clean = stripImageMetadata(dirty);
  assert.ok(clean);
  assert.equal(clean.mime, "image/webp");
  const chunks = webpChunks(clean.bytes) ?? [];
  assert.deepEqual(chunks.map((chunk) => chunk.fourcc), ["VP8X", "VP8L"]);
  assert.equal(hasImageMetadata(clean.bytes), false);
  // The VP8X flag byte: alpha stays, EXIF and XMP are off.
  assert.equal(clean.bytes[20], 0x10);
  const riffSize = clean.bytes[4] | (clean.bytes[5] << 8) | (clean.bytes[6] << 16) | (clean.bytes[7] << 24);
  assert.equal(riffSize, clean.bytes.length - 8);
  assert.doesNotMatch(bytesOf(clean.bytes), new RegExp(bytesOf(new Uint8Array(text("GPS")))));
  assert.deepEqual(stripImageMetadata(clean.bytes)?.bytes, clean.bytes);
});

test("WebP: a RIFF size past the file or a chunk past the end is no picture", () => {
  const dirty = webpWithMetadata();
  assert.equal(stripImageMetadata(dirty.subarray(0, dirty.length - 6)), null);
  const lying = new Uint8Array(dirty);
  lying[4] = 0xff;
  lying[5] = 0xff;
  assert.equal(stripImageMetadata(lying), null);
});
