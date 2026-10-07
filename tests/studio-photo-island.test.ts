// The photo island's browser code (apps/studio/src/tools/photo; T3.3): the
// static first state the page carries and the browser hydrates, the texts,
// the consent kept in localStorage, the shrink plan, the multipart call and
// what it accepts back. No browser: fetch, storage and the canvas are fakes.
// Run: node --import tsx --test tests/studio-photo-island.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { STUDIO_API_BASE } from '../apps/studio/src/api';
import {
  PHOTO_CONSENT_KEY,
  PHOTO_CONSENT_VERSION,
  PHOTO_MAX_SIDE,
  PHOTO_QUALITIES,
  PHOTO_TARGET_BYTES,
  PHOTO_TYPES,
  acceptedPhoto,
  consentStored,
  createPhotoApi,
  photoFormData,
  readPhotoResult,
  shrinkPhoto,
  shrinkPlan,
  storeConsent,
  type ShrinkDeps,
  type StorageLike,
} from '../apps/studio/src/tools/photo/api';
import { POLICY_HREF, newPhotoRequestId } from '../apps/studio/src/tools/photo/Island';
import { renderPhotoForm } from '../apps/studio/src/tools/photo/static';
import { PHOTO_TEXTS, PHOTO_UNIT_BACK, PHOTO_UNTIL_RESET, nextFreeReset, photoMessageKey, tashkentClock } from '../apps/studio/src/tools/photo/texts';
import { PHOTO_CONSENT_VERSION as SERVER_CONSENT, PHOTO_TURNSTILE_ACTION } from '../functions/lib/studio/photo';
import { REQUEST_ID } from '../functions/lib/studio/ledger';
import { STUDIO_ERRORS } from '../functions/lib/studio/http';
import { FORBIDDEN_WORDS } from '../apps/studio/scripts/studio-page';

const ANSWER = {
  ok: true,
  jobId: `sj_${'0123456789abcdef'.repeat(2)}`,
  source: 'free',
  answer: { subject: 'fizika', given: 'Massa 0,5 kg, tezlik 10 m/s.', steps: ['E = m · v² / 2', 'E = 0,5 · 100 / 2 = 25 J'], answer: '25 J', check: 'Birliklarni tekshiring.', confidence: 'high' },
  regenAvailable: false,
  consentVersion: 'photo-v1',
};

class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

// ── The static first state ──────────────────────────────────────────────────

test('static: the same markup twice, a file input with accept and capture, the disabled submit, the beta mark, the in-app row, no consent, no storage read', () => {
  for (const locale of ['uz', 'ru'] as const) {
    const html = renderPhotoForm(locale);
    assert.equal(html, renderPhotoForm(locale), 'deterministic');
    assert.match(html, /<div class="[^"]*" data-studio-tool="photo">/);
    assert.match(html, /<form class="ym-disable-submit[^"]*" noValidate="" aria-busy="false" encType="multipart\/form-data" method="post">/);
    assert.match(html, /<input id="[^"]+" type="file" accept="image\/jpeg,image\/png,image\/webp" capture="environment"[^>]* name="image"\/>/);
    assert.match(html, /<button type="submit" disabled="" class="/);
    assert.match(html, /data-studio-beta=""/);
    assert.match(html, /data-studio-inapp="" data-studio-inapp-slot=""/);
    assert.match(html, /data-studio-turnstile=""/);
    assert.match(html, /data-studio-announce=""/);
    assert.ok(!html.includes('data-studio-consent'), 'the consent is asked after a file is chosen, not in the static page');
    assert.ok(!html.includes('data-studio-answer'));
    assert.ok(!html.includes('data-studio-slot'), 'nothing of the paid slots renders before hydration');
    assert.ok(html.includes(PHOTO_TEXTS[locale].submit));
    assert.ok(html.includes(PHOTO_TEXTS[locale].beta));
    assert.ok(!/getUserMedia/.test(html));
    const radios = html.match(/type="radio"[^>]*name="mode"/g) ?? [];
    assert.equal(radios.length, 2);
  }
});

// ── Texts ───────────────────────────────────────────────────────────────────

test('texts: Uzbek Latin as on the site, no forbidden word, the consent names Z.ai (Singapur), the disclaimer and the beta mark are there', () => {
  const strings = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : typeof value === 'function' ? [String((value as (n: never) => string)(5 as never))] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
  const uz = strings(PHOTO_TEXTS.uz);
  assert.ok(uz.length > 40);
  for (const value of uz) {
    assert.doesNotMatch(value, /['ʻʼ`]/, `uz: ASCII or modifier apostrophe in «${value}»`);
    assert.doesNotMatch(value, /[OoGg]’/, `uz: o’/g’ in «${value}»`);
    assert.doesNotMatch(value, /[Ѐ-ӿ]/, `uz: Cyrillic in «${value}»`);
  }
  for (const value of [...uz, ...strings(PHOTO_TEXTS.ru)]) {
    for (const word of FORBIDDEN_WORDS) assert.doesNotMatch(value, word, `forbidden word in «${value}»`);
    assert.doesNotMatch(value, /ChatGPT|OpenAI/, value);
  }
  assert.equal(PHOTO_TEXTS.uz.consentBody.includes('Z.ai (Singapur)'), true);
  assert.equal(PHOTO_TEXTS.uz.consentBody.includes('saqlanmaydi'), true);
  assert.equal(PHOTO_TEXTS.ru.consentBody.includes('Z.ai (Сингапур)'), true);
  assert.equal(PHOTO_TEXTS.uz.disclaimer, 'Bu tushuntirish — ko‘chirish uchun emas. Javobni tekshiring.');
  assert.equal(PHOTO_TEXTS.uz.beta, 'Sinov rejimi (beta)');
  // «tushuntiradi», never «yechib beradi».
  assert.ok(!uz.some((value) => /yechib ber/i.test(value)));
  assert.ok(PHOTO_TEXTS.uz.freeNote.includes('kuniga 2 ta'));
  // Every message key is a studio code or one of the island's own.
  const own = new Set(['file_type', 'file_large', 'turnstile', 'photo_closed', 'connection_lost', 'job_lost', 'busy']);
  for (const key of Object.keys(PHOTO_TEXTS.uz.messages)) assert.ok(own.has(key) || key in STUDIO_ERRORS, key);
  assert.equal(photoMessageKey('turnstile_required'), 'turnstile');
  assert.equal(photoMessageKey('unreadable'), 'unreadable');
  assert.equal(photoMessageKey('not_found'), 'photo_closed');
  assert.equal(photoMessageKey('timeout'), 'connection_lost');
  assert.equal(photoMessageKey('job_state'), 'job_lost');
  assert.equal(photoMessageKey('unsupported_media'), 'file_type');
  assert.equal(photoMessageKey('something_else'), 'busy');
  assert.deepEqual([...PHOTO_UNTIL_RESET].sort(), ['free_limit', 'ip_ceiling', 'try_later']);
  assert.deepEqual([...PHOTO_UNIT_BACK].sort(), ['invalid_output', 'model_failed', 'model_unavailable', 'studio_busy']);
  assert.equal(tashkentClock('2026-10-14T00:00:00.000Z'), '05:00');
  assert.equal(tashkentClock(undefined), '');
  assert.equal(nextFreeReset(Date.UTC(2026, 9, 14, 23, 30)), '2026-10-15T00:00:00.000Z');
  assert.deepEqual(POLICY_HREF, { uz: '/uz/maxfiylik-siyosati/', ru: '/ru/politika-konfidentsialnosti/' });
});

// ── The consent and the file ────────────────────────────────────────────────

test('consent: the island\'s version is the server\'s; kept in localStorage under its key; absent or blocked storage means not given', () => {
  assert.equal(PHOTO_CONSENT_VERSION, SERVER_CONSENT);
  assert.equal(PHOTO_TURNSTILE_ACTION, 'studio_free_photo');
  const storage = new FakeStorage();
  assert.equal(consentStored(storage), false);
  storeConsent(storage);
  assert.equal(storage.getItem(PHOTO_CONSENT_KEY), 'photo-v1');
  assert.equal(consentStored(storage), true);
  storage.setItem(PHOTO_CONSENT_KEY, 'photo-v0');
  assert.equal(consentStored(storage), false, 'an older consent is asked again');
  assert.equal(consentStored(null), false);
  const throwing: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(consentStored(throwing), false);
  assert.doesNotThrow(() => storeConsent(throwing));
});

test('files: JPEG, PNG and WebP by type, or by extension when the browser declares none; the shrink plan keeps the ratio under 1 600 px and never enlarges', () => {
  assert.deepEqual([...PHOTO_TYPES], ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(acceptedPhoto({ type: 'image/jpeg', name: 'a.jpg' }), true);
  assert.equal(acceptedPhoto({ type: 'image/heic', name: 'a.heic' }), false);
  assert.equal(acceptedPhoto({ type: '', name: 'IMG_0001.JPG' }), true);
  assert.equal(acceptedPhoto({ type: '', name: 'scan.pdf' }), false);
  assert.equal(acceptedPhoto({ type: 'image/svg+xml', name: 'x.svg' }), false);
  assert.equal(PHOTO_MAX_SIDE, 1600);
  assert.deepEqual(shrinkPlan(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(shrinkPlan(3000, 4000), { width: 1200, height: 1600 });
  assert.deepEqual(shrinkPlan(800, 600), { width: 800, height: 600 });
  assert.deepEqual(shrinkPlan(0, 0), { width: 1, height: 1 });
  assert.deepEqual(PHOTO_QUALITIES, [0.8, 0.7, 0.6, 0.5]);
  assert.equal(PHOTO_TARGET_BYTES, 600_000);
});

test('shrink: drawn at the plan\'s size on a white canvas, encoded as JPEG at 0.8 and lower until ≤ 600 KB; a picture that cannot be decoded is null', async () => {
  const drawn: Array<{ width: number; height: number }> = [];
  const qualities: number[] = [];
  const sizes = [900_000, 650_000, 400_000];
  const deps: ShrinkDeps = {
    decode: async () => ({ width: 3200, height: 2400, draw: (_context, width, height) => drawn.push({ width, height }) }),
    canvas: (width, height) =>
      ({
        width,
        height,
        getContext: () => ({ fillRect() {}, set fillStyle(_value: string) {} }),
        convertToBlob: async ({ quality }: { quality: number }) => {
          qualities.push(quality);
          return new Blob([new Uint8Array(sizes[qualities.length - 1] ?? 100)], { type: 'image/jpeg' });
        },
      }) as unknown as OffscreenCanvas,
  };
  const blob = await shrinkPhoto(new Blob([new Uint8Array(10)]), deps);
  assert.ok(blob);
  assert.equal(blob.size, 400_000);
  assert.equal(blob.type, 'image/jpeg');
  assert.deepEqual(drawn, [{ width: 1600, height: 1200 }]);
  assert.deepEqual(qualities, [0.8, 0.7, 0.6]);

  const undecodable: ShrinkDeps = { ...deps, decode: async () => Promise.reject(new Error('not an image')) };
  assert.equal(await shrinkPhoto(new Blob([new Uint8Array(10)]), undecodable), null);

  // Never under the target even at 0.5: the smallest is taken when it fits the server's 1 MB, else null.
  const big: ShrinkDeps = {
    ...deps,
    canvas: (width, height) =>
      ({ width, height, getContext: () => ({ fillRect() {}, set fillStyle(_value: string) {} }), convertToBlob: async () => new Blob([new Uint8Array(2_000_000)]) }) as unknown as OffscreenCanvas,
  };
  assert.equal(await shrinkPhoto(new Blob([new Uint8Array(10)]), big), null);
});

// ── The call ────────────────────────────────────────────────────────────────

test('api: one multipart POST to /api/studio/photo with exactly the server\'s fields, same-origin cookies, no-store, no Content-Type of its own', async () => {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const api = createPhotoApi(async (url, init) => {
    sent.push({ url, init: init ?? {} });
    return Response.json(ANSWER);
  });
  const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
  const result = await api.explain({ image, requestId: 'ph_abcdef0123', mode: 'explain', locale: 'uz', turnstileToken: 'tok' });
  assert.ok(result.ok);
  assert.deepEqual(result.data, { jobId: ANSWER.jobId, source: 'free', answer: ANSWER.answer, regenAvailable: false });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, `${STUDIO_API_BASE}photo`);
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(sent[0].init.credentials, 'same-origin');
  assert.equal(sent[0].init.cache, 'no-store');
  assert.deepEqual(sent[0].init.headers, { Accept: 'application/json' });
  const form = sent[0].init.body as FormData;
  assert.ok(form instanceof FormData);
  assert.deepEqual([...form.keys()].sort(), ['consent', 'image', 'locale', 'mode', 'requestId', 'turnstileToken']);
  assert.equal(form.get('consent'), 'photo-v1');
  assert.equal(form.get('requestId'), 'ph_abcdef0123');
  assert.equal((form.get('image') as File).size, 3);

  const regen = photoFormData({ image, requestId: 'ph_abcdef0123', mode: 'math', locale: 'ru', regenOf: ANSWER.jobId });
  assert.deepEqual([...regen.keys()].sort(), ['consent', 'image', 'locale', 'mode', 'regenOf', 'requestId']);
  assert.equal(regen.get('mode'), 'math');
});

test('api: a failure carries the server\'s code, retry and resetsAt; no answer is network, a slow one timeout; a body that is not the contract is invalid_output', async () => {
  const image = new Blob([new Uint8Array(3)], { type: 'image/jpeg' });
  const call = { image, requestId: 'ph_abcdef0123', mode: 'explain' as const, locale: 'uz' as const };
  const limited = createPhotoApi(async () => new Response(JSON.stringify({ ok: false, code: 'free_limit', error: 'free limit', resetsAt: '2026-10-15T00:00:00.000Z' }), { status: 429, headers: { 'Retry-After': '120' } }));
  const limit = await limited.explain(call);
  assert.deepEqual(limit, { ok: false, status: 429, code: 'free_limit', resetsAt: '2026-10-15T00:00:00.000Z', retryAfter: 120 });
  const faulted = createPhotoApi(async () => new Response(JSON.stringify({ ok: false, code: 'model_failed', error: 'model failed', retry: true }), { status: 502 }));
  assert.deepEqual(await faulted.explain(call), { ok: false, status: 502, code: 'model_failed', retry: true });
  const proxy = createPhotoApi(async () => new Response('<html>413</html>', { status: 413 }));
  assert.equal((await proxy.explain(call)).code, 'payload_too_large');
  const down = createPhotoApi(async () => Promise.reject(new TypeError('Failed to fetch')));
  assert.deepEqual(await down.explain(call), { ok: false, status: 0, code: 'network' });
  const slow = createPhotoApi(() => new Promise(() => undefined), 20);
  assert.deepEqual(await slow.explain(call), { ok: false, status: 0, code: 'timeout' });
  const odd = createPhotoApi(async () => Response.json({ ok: true, jobId: 'nope', answer: {} }));
  assert.equal((await odd.explain(call)).code, 'invalid_output');
  assert.equal(readPhotoResult({ ...ANSWER, source: 'gift' }), null);
  assert.equal(readPhotoResult({ ...ANSWER, answer: { ...ANSWER.answer, steps: 'one' } }), null);
  const loose = readPhotoResult({ ...ANSWER, source: 'entitlement', entitlementId: 'se_1', regenAvailable: true, answer: { ...ANSWER.answer, subject: 'tarix', confidence: 'sure' } });
  assert.equal(loose?.answer.subject, 'boshqa');
  assert.equal(loose?.answer.confidence, 'medium');
  assert.equal(loose?.regenAvailable, true);
  assert.equal(loose?.entitlementId, 'se_1');
});

test('request ids: ones the ledger accepts', () => {
  for (let i = 0; i < 20; i++) assert.match(newPhotoRequestId(), REQUEST_ID);
  assert.match(newPhotoRequestId(() => 'a-b_c!!d'), REQUEST_ID);
});
