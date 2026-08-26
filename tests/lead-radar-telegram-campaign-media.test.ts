import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectTelegramCampaignImage,
  LeadRadarTelegramCampaignMediaStore,
  TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES,
  TelegramCampaignMediaError,
} from '../functions/platform/lead-radar/telegram-campaign-media';

const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DATA_KEY = Buffer.alloc(32, 23).toString('base64url');
const NOW = new Date('2026-08-25T12:00:00.000Z');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(kind: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(12 + data.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.byteLength);
  result.set(new TextEncoder().encode(kind), 4);
  result.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(result.subarray(4, 8 + data.byteLength)));
  return result;
}

function structuralPng(width: number, height: number, extra: Uint8Array[] = []): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const chunks = [
    pngChunk('IHDR', header),
    ...extra,
    pngChunk('IDAT', Uint8Array.of(0x78)),
    pngChunk('IEND', new Uint8Array()),
  ];
  const length = 8 + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  result.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

interface StoredObject {
  bytes: Uint8Array;
  customMetadata: Record<string, string>;
  httpMetadata: R2HTTPMetadata;
  uploaded: Date;
}

class PrivateR2Fixture {
  readonly objects = new Map<string, StoredObject>();
  headCalls = 0;
  getCalls = 0;
  putCalls = 0;
  deleteCalls = 0;
  listCalls = 0;

  private object(key: string, stored: StoredObject): R2Object {
    return {
      key,
      version: 'fixture-version',
      size: stored.bytes.byteLength,
      etag: 'fixture-etag',
      httpEtag: '"fixture-etag"',
      checksums: {},
      uploaded: stored.uploaded,
      httpMetadata: stored.httpMetadata,
      customMetadata: stored.customMetadata,
      range: undefined,
      storageClass: 'Standard',
      writeHttpMetadata(headers: Headers) {
        if (stored.httpMetadata.contentType) {
          headers.set('Content-Type', stored.httpMetadata.contentType);
        }
      },
    } as unknown as R2Object;
  }

  readonly bucket = {
    head: async (key: string) => {
      this.headCalls += 1;
      const stored = this.objects.get(key);
      return stored ? this.object(key, stored) : null;
    },
    get: async (key: string) => {
      this.getCalls += 1;
      const stored = this.objects.get(key);
      if (!stored) return null;
      return {
        ...this.object(key, stored),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(stored.bytes.slice());
            controller.close();
          },
        }),
        bodyUsed: false,
        arrayBuffer: async () => stored.bytes.slice().buffer,
        text: async () => new TextDecoder().decode(stored.bytes),
        json: async <T>() => JSON.parse(new TextDecoder().decode(stored.bytes)) as T,
        blob: async () => new Blob([stored.bytes]),
      } as unknown as R2ObjectBody;
    },
    put: async (key: string, value: ArrayBuffer | ArrayBufferView, options?: R2PutOptions) => {
      this.putCalls += 1;
      if (options?.onlyIf && this.objects.has(key)) return null;
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value.slice(0))
        : new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      const stored: StoredObject = {
        bytes,
        customMetadata: { ...(options?.customMetadata ?? {}) },
        httpMetadata: typeof options?.httpMetadata === 'object'
          ? options.httpMetadata
          : {},
        uploaded: NOW,
      };
      this.objects.set(key, stored);
      return this.object(key, stored);
    },
    delete: async (keys: string | string[]) => {
      this.deleteCalls += 1;
      for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
    },
    list: async (options?: R2ListOptions) => {
      this.listCalls += 1;
      const prefix = options?.prefix ?? '';
      const all = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = options?.cursor ? Number(options.cursor) : 0;
      const limit = Math.max(1, options?.limit ?? 1_000);
      const page = all.slice(start, start + limit);
      const next = start + page.length;
      return {
        objects: page.map((key) => this.object(key, this.objects.get(key)!)),
        truncated: next < all.length,
        cursor: next < all.length ? String(next) : undefined,
        delimitedPrefixes: [],
      } as R2Objects;
    },
  } as unknown as R2Bucket;
}

function uploadRequest(bytes: Uint8Array, filename = 'макет сайта.png'): Request {
  return new Request('https://internal.invalid/media', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      'X-File-Name': encodeURIComponent(filename),
    },
    body: bytes,
  });
}

function mediaError(error: unknown, code: string): boolean {
  return error instanceof TelegramCampaignMediaError && error.code === code;
}

test('private media upload is immutable, tenant scoped and carries only an opaque reference', async () => {
  const r2 = new PrivateR2Fixture();
  const store = new LeadRadarTelegramCampaignMediaStore(r2.bucket);
  const uploaded = await store.upload({
    request: uploadRequest(PNG),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    idempotencyKey: 'media_upload_fixture_0001',
    now: NOW,
  });
  assert.match(uploaded.mediaId, /^lrtgcm_[a-f0-9]{32}$/u);
  assert.match(uploaded.mediaDigest, /^[a-f0-9]{64}$/u);
  assert.equal(uploaded.filename, 'макет сайта.png');
  assert.equal(uploaded.mimeType, 'image/png');
  assert.equal(uploaded.width, 1);
  assert.equal(uploaded.height, 1);
  assert.equal(r2.putCalls, 1);
  const key = [...r2.objects.keys()][0] ?? '';
  assert.equal(key, `lead-radar/campaign-media/${ORG_A}/${uploaded.mediaId}`);
  assert.doesNotMatch(key, /^https?:/u);
  assert.equal(JSON.stringify(r2.objects.get(key)?.customMetadata).includes('https://'), false);

  const replay = await store.upload({
    request: uploadRequest(PNG),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    idempotencyKey: 'media_upload_fixture_0001',
    now: NOW,
  });
  assert.deepEqual(replay, uploaded);
  assert.equal(r2.putCalls, 1);
  const attachment = {
    mediaId: uploaded.mediaId,
    mediaDigest: uploaded.mediaDigest,
  };
  const firstRecipient = await store.read(ORG_A, attachment);
  const secondRecipient = await store.read(ORG_A, attachment);
  assert.equal(firstRecipient.objectKey, key);
  assert.deepEqual(secondRecipient, firstRecipient);
  assert.equal('bytes' in firstRecipient, false);
  assert.equal(JSON.stringify(firstRecipient).includes('base64'), false);
  assert.equal(r2.getCalls, 0, 'dispatch resolves immutable metadata without moving 5MB through Pages');
  assert.equal(r2.deleteCalls, 0, 'two recipients reuse the one source; terminal sends never delete it');
  assert.equal(r2.objects.has(key), true);
  await assert.rejects(
    store.inspect(ORG_B, attachment),
    (error) => mediaError(error, 'telegram_campaign_media_not_found'),
  );
});

test('chunked oversized upload is canceled at the decimal cap before any R2 operation', async () => {
  const r2 = new PrivateR2Fixture();
  const store = new LeadRadarTelegramCampaignMediaStore(r2.bucket);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(2_500_000));
      controller.enqueue(new Uint8Array(2_500_001));
      controller.close();
    },
  });
  const request = new Request('https://internal.invalid/media', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-File-Name': 'oversized.png' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  await assert.rejects(
    store.upload({
      request,
      dataKey: DATA_KEY,
      orgId: ORG_A,
      idempotencyKey: 'media_upload_oversized_0001',
      now: NOW,
    }),
    (error) => mediaError(error, 'telegram_campaign_media_too_large'),
  );
  assert.equal(TELEGRAM_CAMPAIGN_MEDIA_MAX_BYTES, 5_000_000);
  assert.equal(r2.headCalls, 0);
  assert.equal(r2.putCalls, 0);
});

test('dimension, pixel and animation checks reject unsafe images before storage', () => {
  // The structural parser reads dimensions without allocating or decoding
  // the declared 25 million pixels.
  const oversizedPixels = structuralPng(5_000, 5_000);
  assert.throws(
    () => inspectTelegramCampaignImage(oversizedPixels.buffer, 'image/png'),
    (error) => mediaError(error, 'telegram_campaign_media_dimensions_invalid'),
  );

  const animationControl = new Uint8Array(8);
  new DataView(animationControl.buffer).setUint32(0, 1);
  const apng = structuralPng(1, 1, [pngChunk('acTL', animationControl)]);
  assert.throws(
    () => inspectTelegramCampaignImage(apng.buffer, 'image/png'),
    (error) => mediaError(error, 'telegram_campaign_media_animated'),
  );
});

test('structurally incomplete JPEG and corrupt PNG/WebP are rejected before R2 custody', async () => {
  const corruptPng = Uint8Array.from(PNG);
  corruptPng[corruptPng.length - 1] ^= 0xff;
  // SOI + a plausible one-component SOF/SOS + EOI, but no DQT, DHT or
  // entropy-coded scan. A dimensions-only parser would falsely accept it.
  const corruptJpeg = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9,
  ]);
  const corruptWebp = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x12, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  for (const [index, [bytes, mime]] of [
    [corruptPng, 'image/png'],
    [corruptJpeg, 'image/jpeg'],
    [corruptWebp, 'image/webp'],
  ].entries()) {
    const r2 = new PrivateR2Fixture();
    const store = new LeadRadarTelegramCampaignMediaStore(r2.bucket);
    const request = new Request('https://internal.invalid/media', {
      method: 'POST',
      headers: { 'Content-Type': mime, 'X-File-Name': `corrupt-${index}` },
      body: bytes,
    });
    await assert.rejects(
      store.upload({
        request,
        dataKey: DATA_KEY,
        orgId: ORG_A,
        idempotencyKey: `media_corrupt_fixture_${index}`,
        now: NOW,
      }),
      (error) => mediaError(error, 'telegram_campaign_media_invalid'),
    );
    assert.equal(r2.headCalls, 0);
    assert.equal(r2.putCalls, 0);
  }
});

test('bounded sweep never deletes a referenced object and deletes only after a D1 claim', async () => {
  const r2 = new PrivateR2Fixture();
  const store = new LeadRadarTelegramCampaignMediaStore(r2.bucket);
  const uploaded = await store.upload({
    request: uploadRequest(PNG),
    dataKey: DATA_KEY,
    orgId: ORG_A,
    idempotencyKey: 'media_sweep_fixture_0001',
    now: NOW,
  });
  const expiredNow = new Date(NOW.getTime() + 31 * 86_400_000);
  let completed = 0;
  let restored = 0;
  const protectedSweep = await store.sweepExpired({
    cursor: null,
    now: expiredNow,
    claimDeletion: async (orgId, mediaId, digest) => {
      assert.equal(orgId, ORG_A);
      assert.equal(mediaId, uploaded.mediaId);
      assert.equal(digest, uploaded.mediaDigest);
      return 'skip';
    },
    completeDeletion: async () => { completed += 1; },
    restoreDeletion: async () => { restored += 1; },
    limit: 100,
  });
  assert.equal(protectedSweep.scanned, 1);
  assert.equal(protectedSweep.deleted, 0);
  assert.equal(r2.deleteCalls, 0);
  assert.equal(await store.exists(ORG_A, uploaded.mediaId), true);

  const deletedSweep = await store.sweepExpired({
    cursor: null,
    now: expiredNow,
    claimDeletion: async () => 'claimed',
    completeDeletion: async () => { completed += 1; },
    restoreDeletion: async () => { restored += 1; },
    limit: 100,
  });
  assert.equal(deletedSweep.scanned, 1);
  assert.equal(deletedSweep.deleted, 1);
  assert.equal(completed, 1);
  assert.equal(restored, 0);
  assert.equal(await store.exists(ORG_A, uploaded.mediaId), false);
  // Product code clamps even an unsafe requested limit to two objects.
  assert.equal(r2.listCalls, 2);
});
