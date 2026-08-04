/**
 * Seller image uploads.
 *
 * Product photos used to exist only as Telegram `file_id`s, which meant a
 * seller could not add one without leaving the cabinet for the bot. A store's
 * own bucket takes that detour away.
 *
 * Two rules shape everything here. The bytes are trusted only after their own
 * header says what they are — a declared `Content-Type` is a claim by the
 * uploader, not a fact — and the object key always carries the org and the
 * store, so one shop's key can never address another shop's object.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const REFERENCE_PREFIX = 'r2.';
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export type MarketImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface MarketUpload {
  bytes: ArrayBuffer;
  contentType: MarketImageType;
}

export class MarketUploadError extends Error {
  constructor(public readonly code:
    | 'unsupported_media_type'
    | 'payload_too_large'
    | 'invalid_image') {
    super(code);
    this.name = 'MarketUploadError';
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * The image type the bytes themselves declare, or null.
 *
 * Sniffing rather than trusting the header is what keeps an HTML document
 * renamed to `.jpg` out of the bucket: the object is later served back with the
 * type recorded here, so a wrong answer would be a stored-XSS vector rather
 * than a cosmetic mismatch.
 */
export function sniffImageType(buffer: ArrayBuffer): MarketImageType | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Reads one uploaded image from a raw request body.
 *
 * The body is bounded twice: the declared length is refused before anything is
 * read, and the actual bytes are measured again afterwards, because a missing
 * or lying `Content-Length` must not become an unbounded read.
 */
export async function readImageUpload(request: Request): Promise<MarketUpload> {
  const declaredType = (request.headers.get('Content-Type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(declaredType)) {
    throw new MarketUploadError('unsupported_media_type');
  }
  const declaredLength = Number(request.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    throw new MarketUploadError('payload_too_large');
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) throw new MarketUploadError('invalid_image');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new MarketUploadError('payload_too_large');
  }
  const sniffed = sniffImageType(bytes);
  // The declared type is only accepted when the bytes agree with it.
  if (!sniffed || sniffed !== declaredType) {
    throw new MarketUploadError('invalid_image');
  }
  return { bytes, contentType: sniffed };
}

/** A fresh, unguessable media id. Collision-resistant without a round trip. */
export function newMediaReference(): string {
  const random = crypto.getRandomValues(new Uint8Array(16));
  let id = '';
  for (const byte of random) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return `${REFERENCE_PREFIX}${id}`;
}

/**
 * True for a reference this platform stores itself.
 *
 * Telegram file ids are base64url and therefore never contain a dot, so the
 * prefix separates the two sources with no ambiguity and no migration: both
 * kinds live in the same `media_refs_json` column that already exists.
 */
export function isStoredMediaReference(reference: string): boolean {
  return /^r2\.[a-z2-7]{16}$/.test(reference);
}

/**
 * Object key for one stored image.
 *
 * The org and the store are part of the key, so authority is expressed by the
 * path itself: a handle resolved against one store can only ever build a key
 * inside that store's prefix.
 */
export function mediaObjectKey(
  orgId: string,
  storeId: string,
  reference: string,
): string | null {
  if (!isStoredMediaReference(reference)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(orgId)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(storeId)) return null;
  return `market/${orgId}/${storeId}/${reference.slice(REFERENCE_PREFIX.length)}`;
}

/**
 * The object key for a private seller's photograph.
 *
 * A private seller has no organisation and no store, so `mediaObjectKey` cannot
 * name their objects. They get their own prefix rather than a placeholder org:
 * inventing `org/private/...` would put private photographs inside the tenant
 * namespace, where a store-scoped read could reach them.
 */
export function privateMediaObjectKey(
  sellerProfileId: string,
  reference: string,
): string | null {
  if (!isStoredMediaReference(reference)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(sellerProfileId)) return null;
  return `classifieds/${sellerProfileId}/${reference.slice(REFERENCE_PREFIX.length)}`;
}

/**
 * Serves a stored image with the same hardened headers the Telegram proxy uses:
 * private cache, no indexing, no scripting, and a type the bytes proved.
 */
export function storedMediaResponse(
  body: ReadableStream | ArrayBuffer,
  contentType: string,
): Response {
  const safeType = ['image/jpeg', 'image/png', 'image/webp'].includes(contentType)
    ? contentType
    : 'application/octet-stream';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': safeType,
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const MARKET_UPLOAD_MAX_BYTES = MAX_UPLOAD_BYTES;
