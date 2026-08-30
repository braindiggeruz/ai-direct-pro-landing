import {
  sniffImageType,
  type MarketImageType,
} from '../market/upload';
import { telegramIdentifierDigest } from './telegram-business';

export const TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES = 5_000_000;
export const TELEGRAM_CAMPAIGN_MEDIA_MAX_DIMENSION_SUM = 10_000;
export const TELEGRAM_CAMPAIGN_MEDIA_MAX_ASPECT_RATIO = 20;
// Keep decoded RGBA and its orientation/flattening/JPEG copies comfortably
// below the 128 MiB container ceiling alongside the raw/base64 request.
export const TELEGRAM_CAMPAIGN_MEDIA_MAX_PIXELS = 4_000_000;
export const TELEGRAM_CAMPAIGN_MEDIA_RETENTION_DAYS = 30;
// One list + at most two HEAD/claim/delete/complete sequences keeps this
// maintenance task inside the documented Workers Free subrequest budget even
// when the same cron also reconciles campaigns.
export const TELEGRAM_CAMPAIGN_MEDIA_SWEEP_LIMIT = 2;

const MEDIA_ID_PATTERN = /^lrtgcm_[0-9a-f]{32}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const ORG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9:_-]{8,160}$/u;
const METADATA_VERSION = '1';

export type TelegramCampaignMediaType = MarketImageType;

export interface TelegramCampaignAttachmentReference {
  mediaId: string;
  mediaDigest: string;
}

export interface TelegramCampaignUploadedMedia extends TelegramCampaignAttachmentReference {
  filename: string;
  mimeType: TelegramCampaignMediaType;
  sizeBytes: number;
  width: number;
  height: number;
  expiresAt: string;
}

export interface TelegramCampaignResolvedMedia extends TelegramCampaignUploadedMedia {
  /**
   * Immutable tenant-scoped source in the shared private campaign bucket.
   * The gateway streams this object to the authenticated Bridge; it must never
   * create or delete a per-recipient copy.
   */
  objectKey: string;
}

export interface TelegramCampaignMediaSweepResult {
  scanned: number;
  deleted: number;
  cursor: string | null;
}

export type TelegramCampaignMediaErrorCode =
  | 'telegram_campaign_media_invalid'
  | 'telegram_campaign_media_type_invalid'
  | 'telegram_campaign_media_too_large'
  | 'telegram_campaign_media_dimensions_invalid'
  | 'telegram_campaign_media_animated'
  | 'telegram_campaign_media_idempotency_conflict'
  | 'telegram_campaign_media_not_found'
  | 'telegram_campaign_media_digest_mismatch'
  | 'telegram_campaign_media_in_use'
  | 'telegram_campaign_media_quota_exceeded'
  | 'telegram_campaign_media_storage_unavailable';

export class TelegramCampaignMediaError extends Error {
  constructor(readonly code: TelegramCampaignMediaErrorCode) {
    super(code);
    this.name = 'TelegramCampaignMediaError';
  }
}

function mediaFail(code: TelegramCampaignMediaErrorCode): never {
  throw new TelegramCampaignMediaError(code);
}

function readU16Be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
}

function readU24Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0)
    + (bytes[offset + 1] ?? 0) * 256
    + (bytes[offset + 2] ?? 0) * 65_536;
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 16_777_216)
    + ((bytes[offset + 1] ?? 0) * 65_536)
    + ((bytes[offset + 2] ?? 0) * 256)
    + (bytes[offset + 3] ?? 0);
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0)
    + ((bytes[offset + 1] ?? 0) * 256)
    + ((bytes[offset + 2] ?? 0) * 65_536)
    + ((bytes[offset + 3] ?? 0) * 16_777_216);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

function pngChunkCrc(bytes: Uint8Array, typeOffset: number, dataEnd: number): number {
  let crc = 0xffffffff;
  for (let index = typeOffset; index < dataEnd; index += 1) {
    crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ (bytes[index] ?? 0)) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number; animated: boolean } | null {
  if (bytes.byteLength < 33 || ascii(bytes, 12, 4) !== 'IHDR') return null;
  let width = 0;
  let height = 0;
  let offset = 8;
  let animated = false;
  let ended = false;
  let sawHeader = false;
  let sawImageData = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = readU32Be(bytes, offset);
    if (length > bytes.byteLength - offset - 12) return null;
    const kind = ascii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    if (readU32Be(bytes, dataEnd) !== pngChunkCrc(bytes, offset + 4, dataEnd)) return null;
    if (!sawHeader) {
      if (kind !== 'IHDR' || length !== 13) return null;
      width = readU32Be(bytes, dataOffset);
      height = readU32Be(bytes, dataOffset + 4);
      sawHeader = true;
    } else if (kind === 'IHDR') return null;
    if (kind === 'acTL') animated = true;
    if (kind === 'IDAT' && length > 0) sawImageData = true;
    if (kind === 'IEND') {
      ended = length === 0 && dataEnd + 4 === bytes.byteLength;
      break;
    }
    offset += 12 + length;
  }
  return ended && sawHeader && sawImageData ? { width, height, animated } : null;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number; animated: false } | null {
  if (bytes.byteLength < 4
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
    || bytes[bytes.byteLength - 2] !== 0xff
    || bytes[bytes.byteLength - 1] !== 0xd9) return null;
  // Deliberately accept only Huffman-coded frames. Rejecting uncommon valid
  // arithmetic JPEGs is safer than accepting a structurally incomplete file
  // which Pillow would discover only after a recipient reservation.
  const sof = new Set([0xc0, 0xc1, 0xc2]);
  let offset = 2;
  let width = 0;
  let height = 0;
  let sawFrame = false;
  let frameMarker = 0;
  let sawScan = false;
  let inScan = false;
  let scanHasEntropy = false;
  const frameComponents = new Map<number, number>();
  const scannedComponents = new Set<number>();
  const quantizationTables = new Set<number>();
  const dcHuffmanTables = new Set<number>();
  const acHuffmanTables = new Set<number>();
  while (offset < bytes.byteLength) {
    let marker: number | undefined;
    if (inScan) {
      while (offset < bytes.byteLength) {
        if (bytes[offset] !== 0xff) {
          scanHasEntropy = true;
          offset += 1;
          continue;
        }
        while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
        const candidate = bytes[offset];
        offset += 1;
        if (candidate === 0x00) {
          scanHasEntropy = true;
          continue;
        }
        if (candidate !== undefined && candidate >= 0xd0 && candidate <= 0xd7) {
          continue;
        }
        if (!scanHasEntropy) return null;
        marker = candidate;
        inScan = false;
        break;
      }
    } else {
      if (bytes[offset] !== 0xff) return null;
      while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
      marker = bytes[offset];
      offset += 1;
    }
    if (marker === undefined || marker === 0x00 || marker === 0xd8) return null;
    if (marker === 0xd9) {
      return sawFrame
        && sawScan
        && !inScan
        && scannedComponents.size === frameComponents.size
        && offset === bytes.byteLength
        ? { width, height, animated: false }
        : null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      if (!inScan) return null;
      continue;
    }
    if (offset + 2 > bytes.byteLength) return null;
    const length = readU16Be(bytes, offset);
    if (length < 2 || offset + length > bytes.byteLength) return null;
    if (sof.has(marker)) {
      const componentCount = bytes[offset + 7] ?? 0;
      if (sawFrame || sawScan
        || ![1, 3, 4].includes(componentCount)
        || length !== 8 + (3 * componentCount)) return null;
      width = readU16Be(bytes, offset + 5);
      height = readU16Be(bytes, offset + 3);
      for (let component = 0; component < componentCount; component += 1) {
        const selector = bytes[offset + 8 + (3 * component)] ?? -1;
        const quantizationTable = bytes[offset + 10 + (3 * component)] ?? -1;
        if (selector < 0 || frameComponents.has(selector) || quantizationTable > 3) return null;
        frameComponents.set(selector, quantizationTable);
      }
      sawFrame = true;
      frameMarker = marker;
    } else if (marker === 0xdb) {
      let cursor = offset + 2;
      const end = offset + length;
      while (cursor < end) {
        const table = bytes[cursor] ?? -1;
        cursor += 1;
        const precision = table >>> 4;
        const identifier = table & 0x0f;
        if (precision > 1 || identifier > 3) return null;
        const tableBytes = 64 * (precision + 1);
        if (cursor + tableBytes > end) return null;
        quantizationTables.add(identifier);
        cursor += tableBytes;
      }
      if (cursor !== end) return null;
    } else if (marker === 0xc4) {
      let cursor = offset + 2;
      const end = offset + length;
      while (cursor < end) {
        const table = bytes[cursor] ?? -1;
        cursor += 1;
        const tableClass = table >>> 4;
        const identifier = table & 0x0f;
        if (tableClass > 1 || identifier > 3 || cursor + 16 > end) return null;
        let symbolCount = 0;
        for (let index = 0; index < 16; index += 1) {
          symbolCount += bytes[cursor + index] ?? 0;
        }
        cursor += 16;
        if (symbolCount < 1 || symbolCount > 256 || cursor + symbolCount > end) return null;
        (tableClass === 0 ? dcHuffmanTables : acHuffmanTables).add(identifier);
        cursor += symbolCount;
      }
      if (cursor !== end) return null;
    } else if (marker === 0xda) {
      const componentCount = bytes[offset + 2] ?? 0;
      const spectralStart = bytes[offset + 3 + (2 * componentCount)] ?? -1;
      const spectralEnd = bytes[offset + 4 + (2 * componentCount)] ?? -1;
      const progressive = frameMarker === 0xc2;
      if (!sawFrame
        || componentCount < 1
        || componentCount > frameComponents.size
        || length !== 6 + (2 * componentCount)
        || spectralStart < 0
        || spectralEnd < spectralStart
        || spectralEnd > 63
        || (progressive && spectralStart === 0 && spectralEnd !== 0)
        || (progressive && spectralStart > 0 && componentCount !== 1)
        || (!progressive && (spectralStart !== 0 || spectralEnd !== 63))
        || [...frameComponents.values()].some((table) => !quantizationTables.has(table))) return null;
      const currentScan = new Set<number>();
      for (let component = 0; component < componentCount; component += 1) {
        const selector = bytes[offset + 3 + (2 * component)] ?? -1;
        const tables = bytes[offset + 4 + (2 * component)] ?? -1;
        const dcTable = tables >>> 4;
        const acTable = tables & 0x0f;
        if (!frameComponents.has(selector)
          || currentScan.has(selector)
          || ((!progressive || spectralStart === 0) && !dcHuffmanTables.has(dcTable))
          || ((!progressive || spectralStart > 0) && !acHuffmanTables.has(acTable))) return null;
        currentScan.add(selector);
        scannedComponents.add(selector);
      }
      sawScan = true;
      inScan = true;
      scanHasEntropy = false;
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number; animated: boolean } | null {
  if (bytes.byteLength < 20
    || ascii(bytes, 0, 4) !== 'RIFF'
    || ascii(bytes, 8, 4) !== 'WEBP'
    || readU32Le(bytes, 4) + 8 !== bytes.byteLength) return null;
  let offset = 12;
  let dimensions: { width: number; height: number } | null = null;
  let animated = false;
  let sawImageBitstream = false;
  while (offset + 8 <= bytes.byteLength) {
    const kind = ascii(bytes, offset, 4);
    const length = readU32Le(bytes, offset + 4);
    const data = offset + 8;
    if (length > bytes.byteLength - data) return null;
    if (kind === 'ANIM' || kind === 'ANMF') animated = true;
    if (kind === 'VP8X' && length >= 10) {
      animated ||= Boolean((bytes[data] ?? 0) & 0x02);
      dimensions = {
        width: readU24Le(bytes, data + 4) + 1,
        height: readU24Le(bytes, data + 7) + 1,
      };
    } else if (kind === 'VP8 ' && length >= 10
      && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      sawImageBitstream = true;
      dimensions ??= {
        width: readU16Be(Uint8Array.of(bytes[data + 7] ?? 0, bytes[data + 6] ?? 0), 0) & 0x3fff,
        height: readU16Be(Uint8Array.of(bytes[data + 9] ?? 0, bytes[data + 8] ?? 0), 0) & 0x3fff,
      };
    } else if (kind === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
      sawImageBitstream = true;
      const bits = readU32Le(bytes, data + 1);
      dimensions ??= {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    offset = data + length + (length % 2);
  }
  return offset === bytes.byteLength && dimensions && sawImageBitstream
    ? { ...dimensions, animated }
    : null;
}

export function inspectTelegramCampaignImage(
  buffer: ArrayBuffer,
  contentType: TelegramCampaignMediaType,
): { width: number; height: number } {
  const bytes = new Uint8Array(buffer);
  const dimensions = contentType === 'image/png'
    ? pngDimensions(bytes)
    : contentType === 'image/jpeg'
      ? jpegDimensions(bytes)
      : webpDimensions(bytes);
  if (!dimensions) mediaFail('telegram_campaign_media_invalid');
  if (dimensions.animated) mediaFail('telegram_campaign_media_animated');
  const { width, height } = dimensions;
  if (!Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width * height > TELEGRAM_CAMPAIGN_MEDIA_MAX_PIXELS
    || width + height > TELEGRAM_CAMPAIGN_MEDIA_MAX_DIMENSION_SUM
    || Math.max(width, height) / Math.min(width, height) > TELEGRAM_CAMPAIGN_MEDIA_MAX_ASPECT_RATIO) {
    mediaFail('telegram_campaign_media_dimensions_invalid');
  }
  return { width, height };
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const value = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeFilename(value: string, type: TelegramCampaignMediaType): string {
  const basename = (value.split(/[\\/]/u).at(-1) ?? '').trim();
  const cleaned = [...basename]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .slice(0, 120)
    .join('');
  if (cleaned) return cleaned;
  return type === 'image/jpeg' ? 'image.jpg' : type === 'image/png' ? 'image.png' : 'image.webp';
}

function decodeFilename(value: string | undefined, type: TelegramCampaignMediaType): string {
  if (!value) return safeFilename('', type);
  try {
    return safeFilename(decodeURIComponent(value), type);
  } catch {
    return safeFilename('', type);
  }
}

export function isTelegramCampaignAttachmentReference(
  value: unknown,
): value is TelegramCampaignAttachmentReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(',') === 'mediaDigest,mediaId'
    && typeof record.mediaId === 'string'
    && MEDIA_ID_PATTERN.test(record.mediaId)
    && typeof record.mediaDigest === 'string'
    && DIGEST_PATTERN.test(record.mediaDigest);
}

export function telegramCampaignMediaObjectKey(orgId: string, mediaId: string): string | null {
  return ORG_ID_PATTERN.test(orgId) && MEDIA_ID_PATTERN.test(mediaId)
    ? `lead-radar/campaign-media/${orgId}/${mediaId}`
    : null;
}

function metadataFrom(object: R2Object): TelegramCampaignUploadedMedia | null {
  const metadata = object.customMetadata ?? {};
  const mediaId = object.key.split('/').at(-1) ?? '';
  const mediaDigest = metadata.sha256 ?? '';
  const mimeType = metadata.mime_type as TelegramCampaignMediaType | undefined;
  const sizeBytes = Number(metadata.size_bytes ?? Number.NaN);
  const width = Number(metadata.width ?? Number.NaN);
  const height = Number(metadata.height ?? Number.NaN);
  const expiresAt = metadata.expires_at ?? '';
  if (metadata.version !== METADATA_VERSION
    || !MEDIA_ID_PATTERN.test(mediaId)
    || !DIGEST_PATTERN.test(mediaDigest)
    || (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp')
    || !Number.isSafeInteger(sizeBytes)
    || sizeBytes < 1
    || sizeBytes > TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES
    || !Number.isFinite(Date.parse(expiresAt))
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)) return null;
  return {
    mediaId,
    mediaDigest,
    filename: decodeFilename(metadata.filename_uri, mimeType),
    mimeType,
    sizeBytes,
    width,
    height,
    expiresAt,
  };
}

async function readRawImage(request: Request): Promise<{
  bytes: ArrayBuffer;
  type: TelegramCampaignMediaType;
  filename: string;
  width: number;
  height: number;
}> {
  const declaredType = (request.headers.get('Content-Type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (declaredType !== 'image/jpeg'
    && declaredType !== 'image/png'
    && declaredType !== 'image/webp') {
    mediaFail('telegram_campaign_media_type_invalid');
  }
  const declaredHeader = request.headers.get('Content-Length');
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null
    && (!Number.isSafeInteger(declared) || declared < 1)) {
    mediaFail('telegram_campaign_media_invalid');
  }
  if (declared !== null && declared > TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES) {
    mediaFail('telegram_campaign_media_too_large');
  }
  if (!request.body || request.bodyUsed) mediaFail('telegram_campaign_media_invalid');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      total += chunk.byteLength;
      if (total > TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES) {
        await reader.cancel('payload_too_large').catch(() => undefined);
        mediaFail('telegram_campaign_media_too_large');
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof TelegramCampaignMediaError) throw error;
    return mediaFail('telegram_campaign_media_invalid');
  } finally {
    reader.releaseLock();
  }
  if (total < 1 || (declared !== null && declared !== total)) {
    mediaFail('telegram_campaign_media_invalid');
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bytes = combined.buffer as ArrayBuffer;
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== declaredType) {
    mediaFail('telegram_campaign_media_invalid');
  }
  const dimensions = inspectTelegramCampaignImage(bytes, sniffed);
  const rawFilename = request.headers.get('X-File-Name') ?? '';
  let filename: string;
  try {
    filename = decodeURIComponent(rawFilename);
  } catch {
    filename = '';
  }
  return {
    bytes,
    type: sniffed,
    filename: safeFilename(filename, sniffed),
    ...dimensions,
  };
}

/** Private, immutable and tenant-scoped R2 custody for one campaign image. */
export class LeadRadarTelegramCampaignMediaStore {
  constructor(private readonly bucket: R2Bucket) {}

  async upload(input: {
    request: Request;
    dataKey: string;
    orgId: string;
    idempotencyKey: string;
    now?: Date;
    reserveQuota?: (reservation: {
      mediaId: string;
      mediaDigest: string;
      sizeBytes: number;
      expiresAt: string;
      now: string;
    }) => Promise<'reserved' | 'replayed' | 'quota_exceeded' | 'conflict'>;
  }): Promise<TelegramCampaignUploadedMedia> {
    if (!ORG_ID_PATTERN.test(input.orgId) || !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) {
      mediaFail('telegram_campaign_media_invalid');
    }
    const upload = await readRawImage(input.request);
    const [mediaDigest, idempotencyDigest] = await Promise.all([
      sha256Hex(upload.bytes),
      telegramIdentifierDigest(
        input.dataKey,
        'campaign-media-idempotency',
        JSON.stringify([input.orgId, input.idempotencyKey]),
      ),
    ]);
    const mediaId = `lrtgcm_${idempotencyDigest.slice(0, 32)}`;
    const key = telegramCampaignMediaObjectKey(input.orgId, mediaId);
    if (!key) mediaFail('telegram_campaign_media_invalid');
    const now = input.now ?? new Date();
    const expiresAt = new Date(
      now.getTime() + TELEGRAM_CAMPAIGN_MEDIA_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    if (input.reserveQuota) {
      const reservation = await input.reserveQuota({
        mediaId,
        mediaDigest,
        sizeBytes: upload.bytes.byteLength,
        expiresAt,
        now: now.toISOString(),
      });
      if (reservation === 'quota_exceeded') {
        mediaFail('telegram_campaign_media_quota_exceeded');
      }
      if (reservation === 'conflict') {
        mediaFail('telegram_campaign_media_idempotency_conflict');
      }
    }
    let existing: R2Object | null;
    try {
      existing = await this.bucket.head(key);
    } catch {
      return mediaFail('telegram_campaign_media_storage_unavailable');
    }
    if (existing) {
      const previous = metadataFrom(existing);
      if (!previous) mediaFail('telegram_campaign_media_storage_unavailable');
      if (previous.mediaDigest !== mediaDigest) {
        mediaFail('telegram_campaign_media_idempotency_conflict');
      }
      return previous;
    }
    try {
      const stored = await this.bucket.put(key, upload.bytes, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: upload.type },
        customMetadata: {
          version: METADATA_VERSION,
          sha256: mediaDigest,
          mime_type: upload.type,
          size_bytes: String(upload.bytes.byteLength),
          width: String(upload.width),
          height: String(upload.height),
          filename_uri: encodeURIComponent(upload.filename),
          expires_at: expiresAt,
        },
        sha256: mediaDigest,
      });
      if (!stored) {
        const concurrent = await this.bucket.head(key);
        const previous = concurrent ? metadataFrom(concurrent) : null;
        if (previous?.mediaDigest === mediaDigest) return previous;
        mediaFail(previous
          ? 'telegram_campaign_media_idempotency_conflict'
          : 'telegram_campaign_media_storage_unavailable');
      }
    } catch (error) {
      if (error instanceof TelegramCampaignMediaError) throw error;
      return mediaFail('telegram_campaign_media_storage_unavailable');
    }
    return {
      mediaId,
      mediaDigest,
      filename: upload.filename,
      mimeType: upload.type,
      sizeBytes: upload.bytes.byteLength,
      width: upload.width,
      height: upload.height,
      expiresAt,
    };
  }

  async inspect(
    orgId: string,
    attachment: TelegramCampaignAttachmentReference,
  ): Promise<TelegramCampaignUploadedMedia> {
    const key = telegramCampaignMediaObjectKey(orgId, attachment.mediaId);
    if (!key || !isTelegramCampaignAttachmentReference(attachment)) {
      mediaFail('telegram_campaign_media_invalid');
    }
    let object: R2Object | null;
    try {
      object = await this.bucket.head(key);
    } catch {
      return mediaFail('telegram_campaign_media_storage_unavailable');
    }
    if (!object) mediaFail('telegram_campaign_media_not_found');
    const metadata = metadataFrom(object);
    if (!metadata) mediaFail('telegram_campaign_media_storage_unavailable');
    if (metadata.mediaDigest !== attachment.mediaDigest) {
      mediaFail('telegram_campaign_media_digest_mismatch');
    }
    return metadata;
  }

  async read(
    orgId: string,
    attachment: TelegramCampaignAttachmentReference,
  ): Promise<TelegramCampaignResolvedMedia> {
    const key = telegramCampaignMediaObjectKey(orgId, attachment.mediaId);
    if (!key || !isTelegramCampaignAttachmentReference(attachment)) {
      mediaFail('telegram_campaign_media_invalid');
    }
    let object: R2Object | null;
    try {
      object = await this.bucket.head(key);
    } catch {
      return mediaFail('telegram_campaign_media_storage_unavailable');
    }
    if (!object) mediaFail('telegram_campaign_media_not_found');
    const metadata = metadataFrom(object);
    if (!metadata) mediaFail('telegram_campaign_media_storage_unavailable');
    if (metadata.mediaDigest !== attachment.mediaDigest) {
      mediaFail('telegram_campaign_media_digest_mismatch');
    }
    return { ...metadata, objectKey: key };
  }

  async preview(orgId: string, attachment: TelegramCampaignAttachmentReference, now = new Date()): Promise<{ bytes: ArrayBuffer; mimeType: TelegramCampaignMediaType }> {
    const key = telegramCampaignMediaObjectKey(orgId, attachment.mediaId);
    if (!key || !isTelegramCampaignAttachmentReference(attachment)) mediaFail('telegram_campaign_media_invalid');
    let object: R2ObjectBody | null;
    try { object = await this.bucket.get(key); }
    catch { return mediaFail('telegram_campaign_media_storage_unavailable'); }
    if (!object) mediaFail('telegram_campaign_media_not_found');
    const metadata = metadataFrom(object);
    if (!metadata || object.size > TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES || object.size !== metadata.sizeBytes) mediaFail('telegram_campaign_media_invalid');
    if (Date.parse(metadata.expiresAt) <= now.getTime()) mediaFail('telegram_campaign_media_not_found');
    if (metadata.mediaDigest !== attachment.mediaDigest) mediaFail('telegram_campaign_media_digest_mismatch');
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== metadata.sizeBytes || await sha256Hex(bytes) !== attachment.mediaDigest) mediaFail('telegram_campaign_media_digest_mismatch');
    return { bytes, mimeType: metadata.mimeType };
  }

  async delete(orgId: string, mediaId: string): Promise<void> {
    const key = telegramCampaignMediaObjectKey(orgId, mediaId);
    if (!key) mediaFail('telegram_campaign_media_invalid');
    try {
      await this.bucket.delete(key);
    } catch {
      mediaFail('telegram_campaign_media_storage_unavailable');
    }
  }

  async exists(orgId: string, mediaId: string): Promise<boolean> {
    const key = telegramCampaignMediaObjectKey(orgId, mediaId);
    if (!key) mediaFail('telegram_campaign_media_invalid');
    try {
      return Boolean(await this.bucket.head(key));
    } catch {
      return mediaFail('telegram_campaign_media_storage_unavailable');
    }
  }

  /**
   * Scan one bounded private-R2 page. An expired object is removed only after
   * D1 proves it is not frozen into a live approval or non-terminal campaign.
   * The caller persists the opaque continuation cursor between cron runs.
   */
  async sweepExpired(input: {
    /** Omit for the private maintenance Worker's cross-tenant root scan. */
    orgId?: string;
    cursor: string | null;
    now: Date;
    claimDeletion: (
      orgId: string,
      mediaId: string,
      mediaDigest: string,
    ) => Promise<'claimed' | 'missing' | 'skip'>;
    completeDeletion: (orgId: string, mediaId: string) => Promise<void>;
    restoreDeletion: (orgId: string, mediaId: string) => Promise<void>;
    limit?: number;
  }): Promise<TelegramCampaignMediaSweepResult> {
    if (input.orgId !== undefined && !ORG_ID_PATTERN.test(input.orgId)) {
      mediaFail('telegram_campaign_media_invalid');
    }
    const limit = Math.max(1, Math.min(
      TELEGRAM_CAMPAIGN_MEDIA_SWEEP_LIMIT,
      Math.trunc(input.limit ?? TELEGRAM_CAMPAIGN_MEDIA_SWEEP_LIMIT),
    ));
    const prefix = input.orgId === undefined
      ? 'lead-radar/campaign-media/'
      : `lead-radar/campaign-media/${input.orgId}/`;
    const listPage = async (cursor: string | null): Promise<R2Objects> => this.bucket.list({
      prefix,
      limit,
      ...(cursor ? { cursor } : {}),
    });
    let listed: R2Objects;
    try {
      listed = await listPage(input.cursor);
    } catch {
      // R2 cursors are opaque and may become invalid after enough mutations.
      // Resetting to the first page is safe; deletion still requires expiry +
      // the authoritative D1 reference check below.
      try {
        listed = input.cursor ? await listPage(null) : mediaFail(
          'telegram_campaign_media_storage_unavailable',
        );
      } catch (error) {
        if (error instanceof TelegramCampaignMediaError) throw error;
        return mediaFail('telegram_campaign_media_storage_unavailable');
      }
    }
    let deleted = 0;
    for (const object of listed.objects) {
      if (!object.key.startsWith(prefix)) continue;
      const segments = object.key.split('/');
      const objectOrgId = segments.length === 4 ? segments[2] ?? '' : '';
      const objectMediaId = segments.length === 4 ? segments[3] ?? '' : '';
      if (!ORG_ID_PATTERN.test(objectOrgId)
        || !MEDIA_ID_PATTERN.test(objectMediaId)
        || (input.orgId !== undefined && objectOrgId !== input.orgId)) continue;
      let authoritative: R2Object | null;
      try {
        authoritative = await this.bucket.head(object.key);
      } catch {
        return mediaFail('telegram_campaign_media_storage_unavailable');
      }
      if (!authoritative) continue;
      const media = metadataFrom(authoritative);
      const expiresAt = authoritative.customMetadata?.expires_at;
      if (!media || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) continue;
      if (Date.parse(expiresAt) > input.now.getTime()) continue;
      if (media.mediaId !== objectMediaId) continue;
      const deletion = await input.claimDeletion(
        objectOrgId,
        media.mediaId,
        media.mediaDigest,
      );
      if (deletion === 'skip') continue;
      try {
        await this.bucket.delete(object.key);
      } catch {
        if (deletion === 'claimed') {
          await input.restoreDeletion(objectOrgId, media.mediaId);
        }
        return mediaFail('telegram_campaign_media_storage_unavailable');
      }
      if (deletion === 'claimed') {
        await input.completeDeletion(objectOrgId, media.mediaId);
      }
      deleted += 1;
    }
    return {
      scanned: listed.objects.length,
      deleted,
      cursor: listed.truncated ? listed.cursor : null,
    };
  }
}
