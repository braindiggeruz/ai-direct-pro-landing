// The studio island's browser code (STUDIO-SPEC §5, §6, §7.7, §10.1, §11.3):
// the API client, the lazy /config and /me, Turnstile and the identity, the
// order of calls of a free deck, in-app browsers, attribution, and the
// form's static markup that the browser hydrates.
//
// No browser here: fetch, Turnstile and the DOM bits are fakes. The real
// browser checks (hydration without a request, the whole flow against a stub
// API, the download) are in apps/studio/scripts/check-pages.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {
  JOB_ID,
  STUDIO_API_BASE,
  TIMEOUTS,
  createStudioApi,
  type CreatedJob,
  type Deck,
  type DeckTask,
  type FreeSlides,
  type Result,
  type SignedImagePrompt,
  type StudioApi,
  type StudioMe,
  type StudioPublicConfig,
} from '../apps/studio/src/api';
import {
  LAST_TOUCH_KEY,
  captureLastTouch,
  paidTouchOf,
  readAnalyticsIds,
  readFirstTouch,
  readLastTouch,
  type StorageLike,
} from '../apps/studio/src/attribution';
import { createStudioSession } from '../apps/studio/src/config';
import { obtainIdentity, turnstileToken, type StudioTurnstileAction, type TokenResult } from '../apps/studio/src/identity';
import { INAPP_HEAD_SCRIPT, detectInApp, pageLink } from '../apps/studio/src/inapp';
import {
  FREE_SLIDES,
  FULL_SLIDES_INITIAL,
  OUTLINE_CALLS,
  PART_CALLS,
  PICTURE_DEADLINE_MS,
  SLIDES_CALLS,
  drawPictures,
  fullTask,
  newRequestId,
  normalizeTopic,
  regenerateFullDeck,
  startFreeDeck,
  startFullDeck,
  topicProblem,
  type FullDeps,
  type StartDeps,
} from '../apps/studio/src/tools/presentation/flow';
import { createFullDeckApi, fullUnitsLeft, type OutlineAnswer, type PartAnswer, type RegeneratedJob } from '../apps/studio/src/tools/presentation/api';
import { renderForm } from '../apps/studio/src/tools/presentation/static';
import { FULL_TEXTS, TEXTS, UNIT_BACK, UNTIL_RESET, freeAgainToday, fullMessage, messageKey, pageLocale, tashkentTime } from '../apps/studio/src/tools/presentation/texts';
import { IMAGE_RULES } from '../functions/lib/studio/safety';
import type { TurnstileApi } from '../apps/studio/src/turnstile';
import { cleanTopic } from '../functions/lib/studio/prompts';
import { REQUEST_ID, isJobId, newJobId } from '../functions/lib/studio/ledger';
import { STUDIO_ERRORS } from '../functions/lib/studio/http';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'apps/studio/src');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// --- the copied Turnstile loader ------------------------------------------------------

test('turnstile.ts is a byte-for-byte copy of src/shared/turnstile.ts under its header', () => {
  const copy = read('apps/studio/src/turnstile.ts');
  const original = read('src/shared/turnstile.ts');
  assert.ok(copy.endsWith(original), 'the copy drifted from src/shared/turnstile.ts');
  const header = copy.slice(0, copy.length - original.length);
  assert.match(header, /^\/\/ COPY of src\/shared\/turnstile\.ts/);
  assert.ok(header.split('\n').every((line) => line === '' || line.startsWith('//')), 'the header is comments only');
  // Nothing in the island imports the site's copy (it would pull src/shared into studio edits).
  for (const file of fs.readdirSync(SRC, { recursive: true }) as string[]) {
    if (/\.tsx?$/.test(file)) assert.doesNotMatch(fs.readFileSync(path.join(SRC, file), 'utf8'), /^import[^;]*from ['"][^'"]*(?:src\/shared|shared\/turnstile)/m, file);
  }
});

// --- the API client -------------------------------------------------------------------

interface Recorded {
  url: string;
  init: RequestInit;
  body: unknown;
}

function fakeFetch(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    return answer(url, init);
  };
  return { calls, fetchImpl };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const JOB = `sj_${'a'.repeat(32)}`;
const TASK: DeckTask = { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 6, palette: 1 };

test('api: same-origin relative paths, cookies same-origin, no-store, JSON bodies', async () => {
  const { calls, fetchImpl } = fakeFetch(() => json(200, { ok: true, identity: false, free: {} }));
  const api = createStudioApi(fetchImpl);
  await api.me();
  await api.identity('tok-1');
  api.event({ id: 'e', type: 'studio_tool_started', detail: 'presentation', viewId: 'v' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.map((call) => call.url), ['/api/studio/me', '/api/studio/identity', '/api/studio/event']);
  for (const call of calls) {
    assert.ok(call.url.startsWith(STUDIO_API_BASE) && !/^[a-z]+:/i.test(call.url), 'relative, same origin');
    assert.equal(call.init.credentials, 'same-origin');
    assert.equal(call.init.cache, 'no-store');
  }
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.deepEqual(calls[1].body, { turnstileToken: 'tok-1' });
  assert.equal((calls[1].init.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.equal(calls[2].init.keepalive, true, 'an event sent as the page closes still arrives');
});

test('api: /slides gets exactly the task (the server hashes it), only for a ledger job id', async () => {
  const { calls, fetchImpl } = fakeFetch(() => json(200, { ok: true, part: 1, deck: { slides: [] }, images: [], done: true }));
  const api = createStudioApi(fetchImpl);
  const extra = { ...TASK, requestId: 'r_x', turnstileToken: 't', shape: 'free' } as unknown as DeckTask;
  const answer = await api.freeSlides(JOB, extra);
  assert.ok(answer.ok);
  assert.equal(calls[0].url, `/api/studio/presentations/${JOB}/slides`);
  assert.deepEqual(calls[0].body, TASK);
  assert.deepEqual(Object.keys(calls[0].body as object).sort(), ['audience', 'locale', 'palette', 'slides', 'topic']);
  for (const bad of ['../me', 'sj_123', `${JOB}/x`, '']) {
    const refused = await api.freeSlides(bad, TASK);
    assert.equal(refused.ok, false);
  }
  assert.equal(calls.length, 1, 'a malformed job id is never put in a path');
  // The pattern is the ledger's.
  assert.ok(JOB_ID.test(newJobId()) && isJobId(JOB));
});

test('api: a failure carries the server\'s code and only the contract\'s extra fields', async () => {
  const answers: Response[] = [
    json(429, { ok: false, code: 'free_limit', error: 'free limit', resetsAt: '2026-10-07T00:00:00.000Z' }, { 'Retry-After': '3600' }),
    json(502, { ok: false, code: 'model_failed', error: 'model failed', retry: true }),
    json(422, { ok: false, code: 'topic_refused', error: 'x', category: 'provider' }),
    json(422, { ok: false, code: 'topic_refused', error: 'x', category: 'Amir Temur <b>' }),
    new Response('<html>Bad gateway</html>', { status: 502 }),
    new Response('nope', { status: 404 }),
    json(400, { ok: false, code: 'DROP TABLE x', error: 'x' }),
  ];
  const { fetchImpl } = fakeFetch(() => answers.shift()!);
  const api = createStudioApi(fetchImpl);
  const results = [] as Result<unknown>[];
  for (let i = 0; i < 7; i++) results.push(await api.createPresentation({ ...TASK, requestId: 'r_12345678', shape: 'free', turnstileToken: 't' }));
  assert.deepEqual(results[0], { ok: false, status: 429, code: 'free_limit', resetsAt: '2026-10-07T00:00:00.000Z', retryAfter: 3600 });
  assert.deepEqual(results[1], { ok: false, status: 502, code: 'model_failed', retry: true });
  assert.deepEqual(results[2], { ok: false, status: 422, code: 'topic_refused', category: 'provider' });
  assert.deepEqual(results[3], { ok: false, status: 422, code: 'topic_refused' }, 'a category that is not a code is dropped');
  assert.deepEqual(results[4], { ok: false, status: 502, code: 'studio_busy' });
  assert.deepEqual(results[5], { ok: false, status: 404, code: 'not_found' });
  assert.deepEqual(results[6], { ok: false, status: 400, code: 'invalid' });
});

test('api: no answer is `network`, a slow one `timeout`, a cancelled one `aborted`', async () => {
  const offline = createStudioApi(async () => { throw new TypeError('Failed to fetch'); });
  assert.deepEqual(await offline.config(), { ok: false, status: 0, code: 'network' });

  const hanging = (_: string, init: RequestInit = {}) =>
    new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  const slow = createStudioApi(hanging, { ...TIMEOUTS, read: 20 });
  assert.deepEqual(await slow.config(), { ok: false, status: 0, code: 'timeout' });

  const controller = new AbortController();
  const pending = createStudioApi(hanging).config({ signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, { ok: false, status: 0, code: 'aborted' });
});

test('api: a picture is image/jpeg bytes; anything else is image_failed; errors keep their code', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const answers: Response[] = [
    new Response(jpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
    new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    json(422, { ok: false, code: 'image_refused', error: 'x' }),
    json(409, { ok: false, code: 'image_cap', error: 'x' }),
  ];
  const { calls, fetchImpl } = fakeFetch(() => answers.shift()!);
  const api = createStudioApi(fetchImpl);
  const image: SignedImagePrompt = { index: 2, prompt: 'Green valley', sig: 'abc' };
  const ok = await api.image(JOB, image);
  assert.ok(ok.ok && ok.data.type === 'image/jpeg' && ok.data.size === 4);
  assert.deepEqual(calls[0].body, { index: 2, prompt: 'Green valley', sig: 'abc' });
  assert.equal(((await api.image(JOB, image)) as { code: string }).code, 'image_failed');
  assert.equal(((await api.image(JOB, image)) as { code: string }).code, 'image_refused');
  assert.equal(((await api.image(JOB, image)) as { code: string }).code, 'image_cap');
});

test('api: every server code the island maps is a real one', () => {
  for (const code of ['free_limit', 'ip_ceiling', 'try_later', 'rate_limited', 'topic_refused', 'job_in_progress', 'turnstile_failed', 'turnstile_required', 'studio_busy', 'image_refused', 'image_failed', 'image_cap']) {
    assert.ok(code in STUDIO_ERRORS, code);
  }
});

// --- lazy /config and /me ------------------------------------------------------------

const CONFIG: StudioPublicConfig = {
  tools: { freeDeck: true, fullDeck: false, photo: false },
  payments: { mode: null, providers: ['click'] },
  plans: [],
  free: { presentation: 1, photo: 2, resetsAt: '05:00 Asia/Tashkent' },
  shapes: {
    free: { minSlides: 4, maxSlides: 6, images: 2, notes: false, palettes: 1 },
    full: { minSlides: 6, maxSlides: 12, images: 8, notes: true, palettes: 3 },
  },
  turnstileSiteKey: '1x00000000000000000000AA',
  termsVersion: null,
  aiLabel: true,
};
const ME = (identity: boolean, left = 1): StudioMe => ({
  identity,
  free: { presentation: { left, limit: 1 }, photo: { left: 2, limit: 2 }, resetsAt: '05:00 Asia/Tashkent' },
});
const ok = <T>(data: T): Result<T> => ({ ok: true, status: 200, data });
const no = (code: string, extra: Record<string, unknown> = {}): Result<never> => ({ ok: false, status: 0, code, ...extra }) as Result<never>;

test('session: nothing is asked until warm(); then /config and /me once each; a failure is asked again', async () => {
  const asked: string[] = [];
  let configAnswer: Result<StudioPublicConfig> = no('network');
  const session = createStudioSession({
    config: async () => { asked.push('config'); return configAnswer; },
    me: async () => { asked.push('me'); return ok(ME(false)); },
  });
  assert.deepEqual(asked, [], 'creating the session asks nothing');
  assert.equal(session.knownConfig(), null);
  session.warm();
  session.warm();
  assert.deepEqual(asked, ['config', 'me']);
  assert.equal((await session.config()).ok, false);
  configAnswer = ok(CONFIG);
  assert.equal((await session.config()).ok, true, 'a failed /config is asked again');
  await session.config();
  await session.me();
  assert.deepEqual(asked, ['config', 'me', 'config']);
  assert.equal(session.knownConfig(), CONFIG);
  session.refreshMe();
  await session.me();
  assert.deepEqual(asked, ['config', 'me', 'config', 'me']);
});

// --- Turnstile and the identity -------------------------------------------------------

interface FakeWidget {
  options: Record<string, unknown>;
  removed: boolean;
}

function fakeTurnstile(behaviour: (options: Record<string, unknown>) => void) {
  const widgets: FakeWidget[] = [];
  const api: TurnstileApi = {
    render: (_element, options) => {
      const widget = { options: options as unknown as Record<string, unknown>, removed: false };
      widgets.push(widget);
      setTimeout(() => behaviour(widget.options), 0);
      return String(widgets.length);
    },
    reset: () => {},
    remove: (id) => { widgets[Number(id) - 1].removed = true; },
  };
  return { widgets, load: async () => api };
}

function fakeDom() {
  const slots: { removed: boolean }[] = [];
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const slot = { removed: false, remove() { slot.removed = true; } };
      slots.push(slot);
      return slot;
    },
  };
  (globalThis as { window?: unknown }).window = { innerWidth: 360 };
  const container = { appended: 0, append() { container.appended++; } } as unknown as HTMLElement & { appended: number };
  return { slots, container };
}

test.afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
});

test('turnstile: one fresh widget per token, the action and key passed, interaction-only, removed after', async () => {
  const { slots, container } = fakeDom();
  const turnstile = fakeTurnstile((options) => (options.callback as (token: string) => void)('tok-ok'));
  const result = await turnstileToken({ container, siteKey: 'site-key', action: 'studio_free_deck', load: turnstile.load });
  assert.deepEqual(result, { ok: true, token: 'tok-ok' });
  const [widget] = turnstile.widgets;
  assert.equal(widget.options.sitekey, 'site-key');
  assert.equal(widget.options.action, 'studio_free_deck');
  assert.equal(widget.options.appearance, 'interaction-only');
  assert.equal(widget.options.size, 'compact', 'narrow screens get the compact widget');
  assert.ok(widget.removed && slots[0].removed, 'the widget and its slot are gone after the token');
});

test('turnstile: an error, an expiry, no script or no answer give no token', async () => {
  const { container } = fakeDom();
  for (const event of ['error-callback', 'expired-callback', 'timeout-callback']) {
    const turnstile = fakeTurnstile((options) => (options[event] as () => void)());
    assert.deepEqual(await turnstileToken({ container, siteKey: 'k', action: 'studio_identity', load: turnstile.load }), { ok: false, code: 'turnstile_failed' }, event);
    assert.ok(turnstile.widgets[0].removed);
  }
  const missing = await turnstileToken({ container, siteKey: 'k', action: 'studio_identity', load: async () => { throw new Error('blocked'); } });
  assert.deepEqual(missing, { ok: false, code: 'turnstile_unavailable' });
  const silent = fakeTurnstile(() => {});
  assert.deepEqual(await turnstileToken({ container, siteKey: 'k', action: 'studio_identity', load: silent.load, waitMs: 10 }), { ok: false, code: 'turnstile_failed' });
});

test('identity: a studio_identity token, then POST /identity', async () => {
  const actions: string[] = [];
  const posted: string[] = [];
  const token = async (action: StudioTurnstileAction): Promise<TokenResult> => { actions.push(action); return { ok: true, token: 'tok-id' }; };
  const result = await obtainIdentity({ identity: async (value) => { posted.push(value); return ok({ ok: true as const }); } }, token);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(actions, ['studio_identity']);
  assert.deepEqual(posted, ['tok-id']);
  const refused = await obtainIdentity({ identity: async () => no('turnstile_failed') }, token);
  assert.deepEqual(refused, { ok: false, code: 'turnstile_failed' });
  const noToken = await obtainIdentity({ identity: async () => { throw new Error('not called'); } }, async () => ({ ok: false, code: 'turnstile_unavailable' }));
  assert.deepEqual(noToken, { ok: false, code: 'turnstile_unavailable' });
});

// --- the free deck, call by call ------------------------------------------------------

const DECK: Deck = {
  title: 'Amir Temur',
  subtitle: 'Maktab taqdimoti',
  slides: [1, 2, 3, 4, 5, 6].map((index) => ({ index, title: `Slayd ${index}`, bullets: ['a', 'b', 'c', 'd'], layout: index <= 2 ? 'image-right' as const : 'title-bullets' as const })),
};
const IMAGES: SignedImagePrompt[] = [{ index: 1, prompt: 'Stone walls', sig: 's1' }, { index: 2, prompt: 'Green valley', sig: 's2' }];
const CREATED: CreatedJob = { jobId: JOB, source: 'free', shape: { slides: 6, images: 2, notes: false, palette: 1, parts: 1 }, next: 'slides', expiresAt: '2026-10-06T10:10:00.000Z' };
const SLIDES: FreeSlides = { part: 1, deck: DECK, images: IMAGES, done: true };

interface Script {
  config?: Result<StudioPublicConfig>;
  me?: Result<StudioMe>;
  identity?: Result<{ ok: true }>[];
  create?: Result<CreatedJob>[];
  slides?: Result<FreeSlides>[];
  token?: TokenResult;
}

function harness(script: Script = {}) {
  const log: string[] = [];
  const bodies: unknown[] = [];
  const identity = [...(script.identity ?? [ok({ ok: true as const })])];
  const create = [...(script.create ?? [ok(CREATED)])];
  const slides = [...(script.slides ?? [ok(SLIDES)])];
  const deps: StartDeps = {
    api: {
      identity: async (token) => { log.push(`identity:${token}`); return identity.shift() ?? ok({ ok: true as const }); },
      createPresentation: async (body) => { log.push(`create:${body.requestId}:${body.turnstileToken}`); bodies.push(body); return create.shift() ?? ok(CREATED); },
      freeSlides: async (jobId, task) => { log.push(`slides:${jobId}`); bodies.push(task); return slides.shift() ?? ok(SLIDES); },
    },
    session: {
      config: async () => { log.push('config'); return script.config ?? ok(CONFIG); },
      me: async () => { log.push('me'); return script.me ?? ok(ME(false)); },
    },
    token: async (action, siteKey) => { log.push(`token:${action}:${siteKey}`); return script.token ?? { ok: true, token: `tok-${action}` }; },
    requestId: () => 'r_request01',
    onPhase: (phase) => log.push(`phase:${phase}`),
  };
  return { deps, log, bodies };
}

const INPUT = { topic: '  Amir   Temur. ', audience: 'maktab' as const, slides: 6 };

test('flow: a new browser passes Turnstile twice (identity, then the deck), then gets its deck', async () => {
  const { deps, log, bodies } = harness();
  const outcome = await startFreeDeck(INPUT, 'uz', deps);
  assert.equal(outcome.kind, 'ready');
  assert.deepEqual(log, [
    'phase:check',
    'config',
    'me',
    'token:studio_identity:1x00000000000000000000AA',
    'identity:tok-studio_identity',
    'token:studio_free_deck:1x00000000000000000000AA',
    'create:r_request01:tok-studio_free_deck',
    'phase:write',
    `slides:${JOB}`,
  ]);
  assert.deepEqual(bodies[0], { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 6, palette: 1, requestId: 'r_request01', shape: 'free', turnstileToken: 'tok-studio_free_deck' });
  assert.deepEqual(bodies[1], { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 6, palette: 1 });
  if (outcome.kind === 'ready') {
    assert.deepEqual(outcome.deck, DECK);
    assert.deepEqual(outcome.images, IMAGES);
    assert.equal(outcome.aiLabel, true);
  }
});

test('flow: a browser with an identity skips the identity step', async () => {
  const { deps, log } = harness({ me: ok(ME(true)) });
  assert.equal((await startFreeDeck(INPUT, 'ru', deps)).kind, 'ready');
  assert.ok(!log.some((entry) => entry.startsWith('token:studio_identity') || entry.startsWith('identity:')));
});

test('flow: no free deck left today → the limit at once: no Turnstile, no unit, no model', async () => {
  const { deps, log } = harness({ me: ok(ME(true, 0)) });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', deps), { kind: 'limit', code: 'free_limit' });
  assert.deepEqual(log, ['phase:check', 'config', 'me']);
});

test('flow: the studio off, the free deck off or no Turnstile key → busy, nothing else is called', async () => {
  for (const config of [no('not_found'), ok({ ...CONFIG, tools: { ...CONFIG.tools, freeDeck: false } }), ok({ ...CONFIG, turnstileSiteKey: null })]) {
    const { deps, log } = harness({ config });
    const outcome = await startFreeDeck(INPUT, 'uz', deps);
    assert.equal(outcome.kind, 'error');
    assert.ok(log.every((entry) => !entry.startsWith('token') && !entry.startsWith('create')), log.join(','));
  }
});

test('flow: a topic of the wrong length is refused before any call', async () => {
  for (const topic of ['', 'ab', '  a .  ', 'x'.repeat(201)]) {
    const { deps, log } = harness();
    assert.deepEqual(await startFreeDeck({ ...INPUT, topic }, 'uz', deps), { kind: 'error', code: 'topic_length' });
    assert.deepEqual(log, []);
  }
  assert.equal(topicProblem('abc'), null);
  assert.equal(topicProblem('x'.repeat(200)), null);
});

test('flow: the topic is cleaned exactly as the server cleans it', () => {
  for (const raw of ['  Amir   Temur. ', 'Fotosintez...', 'Kasr​ lar', 'Oddiy\nkasrlar', 'O‘zbekiston\tTarixi .']) {
    assert.equal(normalizeTopic(raw), cleanTopic(raw), JSON.stringify(raw));
  }
});

test('flow: no answer to the start → once more with the same request id and token', async () => {
  const { deps, log } = harness({ create: [no('network'), ok(CREATED)] });
  assert.equal((await startFreeDeck(INPUT, 'uz', deps)).kind, 'ready');
  const creates = log.filter((entry) => entry.startsWith('create:'));
  assert.deepEqual(creates, ['create:r_request01:tok-studio_free_deck', 'create:r_request01:tok-studio_free_deck']);
  assert.equal(log.filter((entry) => entry === 'token:studio_free_deck:1x00000000000000000000AA').length, 1);
});

test('flow: identity_required on the start (the cookie was lost) → a new identity, then the start once more', async () => {
  const { deps, log } = harness({ me: ok(ME(true)), create: [no('identity_required'), ok(CREATED)] });
  assert.equal((await startFreeDeck(INPUT, 'uz', deps)).kind, 'ready');
  assert.deepEqual(log.filter((entry) => /^(token|identity|create)/.test(entry)), [
    'token:studio_free_deck:1x00000000000000000000AA',
    'create:r_request01:tok-studio_free_deck',
    'token:studio_identity:1x00000000000000000000AA',
    'identity:tok-studio_identity',
    'create:r_request01:tok-studio_free_deck',
  ]);
});

test('flow: limits and refusals come back as such, with the reset time and category', async () => {
  const limit = harness({ create: [no('free_limit', { resetsAt: '2026-10-07T00:00:00.000Z' })] });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', limit.deps), { kind: 'limit', code: 'free_limit', resetsAt: '2026-10-07T00:00:00.000Z' });
  for (const code of ['ip_ceiling', 'try_later'] as const) {
    assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ create: [no(code)] }).deps), { kind: 'limit', code });
  }
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ create: [no('topic_refused', { category: 'drugs' })] }).deps), { kind: 'refused', category: 'drugs' });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ slides: [no('topic_refused', { category: 'provider' })] }).deps), { kind: 'refused', category: 'provider' });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ create: [no('job_in_progress')] }).deps), { kind: 'error', code: 'job_in_progress' });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ token: { ok: false, code: 'turnstile_failed' } }).deps), { kind: 'error', code: 'turnstile_failed' });
});

const slideCalls = (log: string[]) => log.filter((entry) => entry.startsWith('slides:'));

test('flow: /slides is asked again after a fault the server marks `retry`, up to SLIDES_CALLS calls; without it, never', async () => {
  assert.equal(SLIDES_CALLS, 3);
  const again = harness({ slides: [no('model_failed', { retry: true }), ok(SLIDES)] });
  assert.equal((await startFreeDeck(INPUT, 'uz', again.deps)).kind, 'ready');
  assert.equal(slideCalls(again.log).length, 2);
  const thrice = harness({ slides: [no('model_failed', { retry: true }), no('studio_busy', { retry: true }), no('model_failed', { retry: true })] });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', thrice.deps), { kind: 'error', code: 'model_failed' });
  assert.equal(slideCalls(thrice.log).length, SLIDES_CALLS, 'the client bound');
  const final = harness({ slides: [no('studio_busy', { retry: false })] });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', final.deps), { kind: 'error', code: 'studio_busy' });
  assert.equal(slideCalls(final.log).length, 1);
});

test('flow: a /slides request that got no answer (a locked phone, a switched app) is sent again for the same job', async () => {
  const dropped = harness({ slides: [no('network'), ok(SLIDES)] });
  assert.equal((await startFreeDeck(INPUT, 'uz', dropped.deps)).kind, 'ready');
  assert.deepEqual(slideCalls(dropped.log), [`slides:${JOB}`, `slides:${JOB}`]);
  assert.equal(dropped.log.filter((entry) => entry.startsWith('create:')).length, 1, 'no second start, no second unit');
  const mixed = harness({ slides: [no('timeout'), no('model_failed', { retry: true }), ok(SLIDES)] });
  assert.equal((await startFreeDeck(INPUT, 'uz', mixed.deps)).kind, 'ready');
  assert.equal(slideCalls(mixed.log).length, 3);
  // The lost request reached the server and its deck went out: the job is closed for this page.
  const lost = harness({ slides: [no('network'), no('job_state')] });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', lost.deps), { kind: 'error', code: 'job_lost' });
  // job_state without a lost answer stays what it is.
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ slides: [no('job_state')] }).deps), { kind: 'error', code: 'job_state' });
});

test('flow: a cancelled run is never sent again; after a failure once the job exists, /me is read again on the next try', async () => {
  const controller = new AbortController();
  const cancelled = harness({ slides: [no('aborted'), ok(SLIDES)] });
  const deps = { ...cancelled.deps, signal: controller.signal };
  controller.abort();
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', deps), { kind: 'error', code: 'aborted' });
  assert.equal(slideCalls(cancelled.log).length, 1);
  let refreshed = 0;
  const failed = harness({ slides: [no('network'), no('network'), no('network')] });
  const outcome = await startFreeDeck(INPUT, 'uz', { ...failed.deps, session: { ...failed.deps.session, refreshMe: () => { refreshed++; } } });
  assert.deepEqual(outcome, { kind: 'error', code: 'network' });
  assert.equal(refreshed, 1);
  // A refusal before any job exists leaves /me as it is.
  let untouched = 0;
  const early = harness({ create: [no('free_limit')] });
  await startFreeDeck(INPUT, 'uz', { ...early.deps, session: { ...early.deps.session, refreshMe: () => { untouched++; } } });
  assert.equal(untouched, 0);
});

test('flow: a unit an open job holds is "try after HH:MM", not "used for today"; a day-long busy carries the reset time', async () => {
  const until = '2026-10-06T10:10:00.000Z';
  const held = harness({ me: ok({ ...ME(true, 0), free: { ...ME(true, 0).free, presentation: { left: 0, limit: 1, openUntil: until } } }) });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', held.deps), { kind: 'error', code: 'job_in_progress', resetsAt: until });
  assert.deepEqual(held.log, ['phase:check', 'config', 'me'], 'no Turnstile, no start');
  // The server's 409 says the same, with the open job's expiry.
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ create: [no('job_in_progress', { resetsAt: until })] }).deps), { kind: 'error', code: 'job_in_progress', resetsAt: until });
  // The ramp or the budget: closed until 05:00, said as a limit with its time.
  const closed = await startFreeDeck(INPUT, 'uz', harness({ create: [no('studio_busy', { resetsAt: '2026-10-07T00:00:00.000Z' })] }).deps);
  assert.deepEqual(closed, { kind: 'limit', code: 'free_closed', resetsAt: '2026-10-07T00:00:00.000Z' });
  assert.deepEqual(await startFreeDeck(INPUT, 'uz', harness({ create: [no('studio_busy')] }).deps), { kind: 'error', code: 'studio_busy' });
  // The messages: "closed for today" with 05:00; "busy" only without a time.
  assert.equal(messageKey('free_closed'), 'free_closed');
  assert.ok(UNTIL_RESET.has('free_closed') && UNTIL_RESET.has('free_limit'));
  assert.equal(TEXTS.uz.messages.free_closed, 'Bugungi bepul taqdimotlar tugadi.');
  assert.equal(TEXTS.uz.resetAt(tashkentTime('2026-10-07T00:00:00.000Z')), 'Yangi bepul taqdimot soat 05:00 da (Toshkent vaqti).');
  assert.equal(TEXTS.uz.jobOpenUntil(tashkentTime(until)), 'Oldingi so‘rov hali yakunlanmagan. Soat 15:10 dan keyin qayta urinib ko‘ring.');
  assert.match(TEXTS.ru.jobOpenUntil('15:10'), /15:10/);
});

test('flow: request ids are ones the ledger accepts', () => {
  for (let i = 0; i < 20; i++) assert.match(newRequestId(() => crypto.randomUUID()), REQUEST_ID);
  assert.equal(FREE_SLIDES.initial, 6);
});

test('pictures: the client deadline is the server\'s, 35 s after the deck', () => {
  assert.equal(PICTURE_DEADLINE_MS, IMAGE_RULES.deadlineAfterOutlineMs);
  assert.equal(PICTURE_DEADLINE_MS, 35_000);
});

test('pictures: past the deadline whatever is still drawing goes without, once; a late answer is ignored', async () => {
  const seen: Array<[number, Blob | null]> = [];
  const signals: AbortSignal[] = [];
  // Picture 1 answers at once; picture 2 never does unless cancelled; picture 3 answers late, ignoring the cancel.
  const api: Pick<StudioApi, 'image'> = {
    image: (_job, image, options) => {
      if (options?.signal) signals.push(options.signal);
      if (image.index === 1) return Promise.resolve(ok(new Blob(['one'])));
      if (image.index === 2) return new Promise((resolve) => options?.signal?.addEventListener('abort', () => resolve(no('aborted')), { once: true }));
      return new Promise((resolve) => setTimeout(() => resolve(ok(new Blob(['late']))), 120));
    },
  };
  const started = Date.now();
  await drawPictures(api, JOB, [1, 2, 3].map((index) => ({ index, prompt: 'p', sig: 's' })), (index, blob) => seen.push([index, blob]), undefined, 40);
  assert.ok(Date.now() - started < 110, 'the deadline, not the slowest picture');
  assert.deepEqual(seen.map(([index, blob]) => [index, blob === null]).sort(), [[1, false], [2, true], [3, true]]);
  assert.ok(signals.every((signal) => signal.aborted), 'what was still drawing is cancelled');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(seen.length, 3, 'the late picture is not added to a deck already settled');
  // A newer deck (the caller's signal) settles the rest the same way, before the deadline.
  const replaced = new AbortController();
  const later: number[] = [];
  const run = drawPictures(api, JOB, [{ index: 2, prompt: 'p', sig: 's' }], (index) => later.push(index), replaced.signal, 60_000);
  replaced.abort();
  await run;
  assert.deepEqual(later, [2]);
});

test('pictures: each is redrawn once after a refusal or failure, then the slide goes without; a cap is final', async () => {
  const answers = new Map<number, Result<Blob>[]>([
    [1, [no('image_refused'), ok(new Blob(['x']))]],
    [2, [no('image_failed'), no('image_failed')]],
    [3, [no('image_cap')]],
    [4, [ok(new Blob(['y']))]],
  ]);
  const calls: number[] = [];
  const api: Pick<StudioApi, 'image'> = { image: async (_job, image) => { calls.push(image.index); return answers.get(image.index)!.shift()!; } };
  const got = new Map<number, Blob | null>();
  await drawPictures(api, JOB, [1, 2, 3, 4].map((index) => ({ index, prompt: 'p', sig: 's' })), (index, blob) => got.set(index, blob));
  assert.deepEqual(calls.sort(), [1, 1, 2, 2, 3, 4]);
  assert.ok(got.get(1) instanceof Blob);
  assert.equal(got.get(2), null);
  assert.equal(got.get(3), null);
  assert.ok(got.get(4) instanceof Blob);
});

// --- in-app browsers --------------------------------------------------------------------

test('in-app: Instagram, Facebook and Telegram are recognised; ordinary browsers are not', () => {
  const ua = {
    instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54',
    facebook: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.98;]',
    messenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/460.0]',
    chrome: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  };
  assert.equal(detectInApp(ua.instagram), 'instagram');
  assert.equal(detectInApp(ua.facebook), 'facebook');
  assert.equal(detectInApp(ua.messenger), 'facebook');
  assert.equal(detectInApp(ua.chrome), null);
  assert.equal(detectInApp(ua.safari), null);
  assert.equal(detectInApp(ua.chrome, { TelegramWebviewProxy: {} }), 'telegram');
  assert.equal(detectInApp(ua.safari, { TelegramWebviewProxyProto: {} }), 'telegram');
  assert.equal(detectInApp(`${ua.chrome} Telegram-Android/11.2.3`), 'telegram');
  assert.equal(detectInApp('Mozilla/5.0 Telegrammatic/1.0'), null, 'a longer word is not Telegram');
  assert.equal(detectInApp('Mozilla/5.0 Telegram/11.2'), 'telegram');
  assert.equal(detectInApp(''), null);
});

test('in-app: the head script marks <html> exactly as detectInApp reads the browser', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54', {}],
    ['Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/ru_RU;FBAV/412.0]', {}],
    ['Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36', { TelegramWebviewProxy: {} }],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Telegram-iOS', {}],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', {}],
    ['', {}],
  ];
  for (const [userAgent, win] of cases) {
    const attributes: Record<string, string> = {};
    const document = { documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
    new Function('navigator', 'window', 'document', INAPP_HEAD_SCRIPT)({ userAgent }, win, document);
    assert.equal(attributes['data-inapp'] ?? null, detectInApp(userAgent, win), userAgent);
  }
  // It never throws, whatever the page gives it.
  assert.doesNotThrow(() => new Function('navigator', 'window', 'document', INAPP_HEAD_SCRIPT)(undefined, undefined, undefined));
  // Every studio page carries it in <head>, before the island's script.
  const page = read('apps/studio/scripts/studio-page.ts');
  assert.ok(page.indexOf('<script>${INAPP_HEAD_SCRIPT}</script>') > 0 && page.indexOf('<script>${INAPP_HEAD_SCRIPT}</script>') < page.indexOf('<script type="module"'));
});

test('in-app: the copied link keeps the campaign tags and drops the fragment', () => {
  assert.equal(pageLink({ origin: 'https://gptbot.uz', pathname: '/uz/taqdimot-ai/', search: '?gclid=abc&utm_source=google' }), 'https://gptbot.uz/uz/taqdimot-ai/?gclid=abc&utm_source=google');
  assert.equal(pageLink({ origin: 'https://gptbot.uz', pathname: '/ru/prezentatsiya-ai/', search: '' }), 'https://gptbot.uz/ru/prezentatsiya-ai/');
});

// --- attribution ---------------------------------------------------------------------------

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

const NOW = Date.parse('2026-10-22T08:00:00.000Z');

test('attribution: a click id or a paid utm_medium is a paid touch; organic, email and fbclid-only visits are not', () => {
  const at = (search: string) => paidTouchOf({ pathname: '/uz/taqdimot-ai/', search }, NOW);
  assert.deepEqual(at('?gclid=Cj0KCQ_abc-1.2&utm_source=google&utm_medium=cpc&utm_campaign=taqdimot'), {
    gclid: 'Cj0KCQ_abc-1.2',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'taqdimot',
    landing: '/uz/taqdimot-ai/',
    at: '2026-10-22T08:00:00.000Z',
  });
  assert.ok(at('?gbraid=0AAAAA'));
  assert.ok(at('?wbraid=CkAB'));
  assert.ok(at('?yclid=123456789'));
  assert.ok(at('?utm_source=telegram&utm_medium=telegram_ads'));
  assert.ok(at('?utm_source=meta&utm_medium=paid_social'));
  assert.equal(at(''), null);
  assert.equal(at('?utm_source=newsletter&utm_medium=email'), null);
  assert.equal(at('?utm_source=blog&utm_medium=referral'), null);
  assert.equal(at('?fbclid=IwAR123'), null, 'fbclid is not kept (Meta is not used before R-B12)');
  assert.equal(at('?gclid=bad%20id%3Cscript%3E'), null, 'a malformed click id is dropped, not cut');
  assert.equal(at(`?gclid=ok1&utm_campaign=${'x'.repeat(150)}`)!.utm_campaign!.length, 100);
  assert.equal((at('?gclid=ok1&fbclid=IwAR') as Record<string, unknown>).fbclid, undefined);
});

test('attribution: the last paid touch is kept 90 days and replaced by the next paid one; an organic visit keeps it', () => {
  const store = memoryStorage();
  assert.equal(captureLastTouch({ pathname: '/uz/taqdimot-ai/', search: '' }, store, NOW), null);
  assert.equal(store.data.size, 0);
  captureLastTouch({ pathname: '/uz/taqdimot-ai/', search: '?gclid=first' }, store, NOW);
  captureLastTouch({ pathname: '/ru/prezentatsiya-ai/', search: '?utm_medium=organic' }, store, NOW + 1000);
  assert.equal(readLastTouch(store, NOW + 2000)!.gclid, 'first');
  captureLastTouch({ pathname: '/ru/prezentatsiya-ai/', search: '?yclid=777' }, store, NOW + 3000);
  const latest = readLastTouch(store, NOW + 4000)!;
  assert.equal(latest.yclid, '777');
  assert.equal(latest.gclid, undefined);
  assert.equal(latest.landing, '/ru/prezentatsiya-ai/');
  assert.ok(readLastTouch(store, NOW + 89 * 86_400_000));
  assert.equal(readLastTouch(store, NOW + 91 * 86_400_000), null);
  assert.equal(store.data.has(LAST_TOUCH_KEY), false, 'an expired touch is removed');
});

test('attribution: a tampered or broken record is cleaned or ignored; storage that throws is harmless', () => {
  const store = memoryStorage({ [LAST_TOUCH_KEY]: JSON.stringify({ gclid: 'ok_1', yclid: 'bad id', utm_source: 'x'.repeat(101), landing: 'https://evil.example/', at: new Date(NOW).toISOString() }) });
  assert.deepEqual(readLastTouch(store, NOW), { gclid: 'ok_1', landing: '/', at: new Date(NOW).toISOString() });
  assert.equal(readLastTouch(memoryStorage({ [LAST_TOUCH_KEY]: '{' }), NOW), null);
  assert.equal(readLastTouch(memoryStorage({ [LAST_TOUCH_KEY]: '[1]' }), NOW), null);
  const throwing: StorageLike = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  assert.equal(readLastTouch(throwing, NOW), null);
  assert.equal(captureLastTouch({ pathname: '/', search: '?gclid=a1' }, throwing, NOW), null);
  assert.equal(captureLastTouch({ pathname: '/', search: '?gclid=a1' }, null, NOW), null);
  assert.deepEqual(readFirstTouch(memoryStorage({ gptbot_ft_v1: '{"landing":"/uz/","gclid":"g1"}' })), { landing: '/uz/', gclid: 'g1' });
});

test('attribution: GA4 client and session ids (GS1 and GS2) and the Metrika id come from the cookies', () => {
  assert.deepEqual(readAnalyticsIds('_ga=GA1.1.1234567890.1700000000; _ga_V87YFL96C7=GS1.1.1700001111.3.1.1700002222.0.0.0; _ym_uid=1700000000123456789'), {
    gaClientId: '1234567890.1700000000',
    gaSessionId: '1700001111',
    ymClientId: '1700000000123456789',
  });
  assert.deepEqual(readAnalyticsIds('_ga_V87YFL96C7=GS2.1.s1759737600$o5$g1$t1759737700$j60$l0$h0'), { gaSessionId: '1759737600' });
  assert.deepEqual(readAnalyticsIds('_ga=garbage; _ga_OTHER=GS1.1.1.1; _ym_uid=abc'), {});
  assert.deepEqual(readAnalyticsIds(''), {});
});

// --- the form's static markup --------------------------------------------------------------

test('form: the static first state is the form only, with Webvisor classes and a disabled submit', () => {
  const html = renderForm('uz');
  assert.equal((html.match(/<form /g) ?? []).length, 1);
  assert.match(html, /<form class="ym-disable-submit [^"]*"[^>]* method="post"/);
  assert.match(html, /<input id="[^"]*-topic"[^>]* class="ym-disable-keys [^>]* name="topic"/);
  assert.match(html, /<button type="submit" disabled=""/, 'disabled until hydrated: a click before the script ran sends nothing');
  assert.match(html, /maxLength="200"/i);
  for (const label of [TEXTS.uz.topicLabel, TEXTS.uz.audienceLabel, TEXTS.uz.slidesLabel, TEXTS.uz.submit, TEXTS.uz.freeNote]) {
    assert.ok(html.includes(label.replace(/&/g, '&amp;')), label);
  }
  assert.ok(!html.includes('ym-hide-content'), 'no preview or download in the first state');
  // The in-app notice is in the markup for everybody, hidden unless the head script marked an in-app browser (styles.css).
  assert.match(html, /<div class="[^"]*" role="note" data-studio-inapp="" data-studio-inapp-slot="">/);
  assert.ok(html.includes(TEXTS.uz.inAppTitle));
  const css = read('apps/studio/src/styles.css');
  assert.match(css, /body\[data-studio\] \[data-studio-inapp-slot\] \{\s*display: none;\s*\}/);
  assert.match(css, /html\[data-inapp\] body\[data-studio\] \[data-studio-inapp-slot\] \{\s*display: block;\s*\}/);
  // A status line for screen readers is there from the first render (empty), so every change is announced.
  assert.match(html, /<p role="status" class="st:sr-only" data-studio-announce=""><\/p>/);
  assert.match(html, /<option value="6" selected="">6<\/option>/);
  const ru = renderForm('ru');
  assert.ok(ru.includes(TEXTS.ru.submit) && !ru.includes(TEXTS.uz.submit));
  assert.equal(renderForm('uz'), html, 'the markup is deterministic');
});

const studioRequire = createRequire(path.join(ROOT, 'apps/studio/package.json'));
const { createElement } = studioRequire('react') as typeof import('react');
const { renderToString } = studioRequire('react-dom/server') as typeof import('react-dom/server');

test('form: the result and the download hide their content from Webvisor; pictures come from object URLs', async () => {
  const { Preview } = await import('../apps/studio/src/tools/presentation/Preview');
  const { Download } = await import('../apps/studio/src/tools/presentation/Download');
  const pictures = new Map([
    [1, { status: 'ready' as const, url: 'blob:https://gptbot.uz/0d6c', blob: new Blob(['x']) }],
    [2, { status: 'loading' as const }],
  ]);
  const preview = renderToString(createElement(Preview, { texts: TEXTS.uz, deck: DECK, pictures }));
  // (renderToString adds a preload <link> for the picture; the browser renders the section alone.)
  const section = preview.slice(preview.indexOf('<section'));
  assert.match(section, /^<section class="ym-hide-content /);
  assert.match(section, /<img src="blob:https:\/\/gptbot\.uz\/0d6c"[^>]*><\/div><\/li>[\s\S]*<\/section>$/);
  assert.ok(!preview.includes('data:image'), 'never a data: URL');
  assert.ok(preview.includes(TEXTS.uz.pictureLoading));
  const download = renderToString(createElement(Download, { texts: TEXTS.uz, state: 'idle', inApp: 'instagram', onDownload: () => {} }));
  assert.match(download, /^<div class="ym-hide-content /);
  assert.ok(download.includes(TEXTS.uz.download) && download.includes(TEXTS.uz.copyLink));
  const waiting = renderToString(createElement(Download, { texts: TEXTS.uz, state: 'waiting', inApp: null, onDownload: () => {} }));
  assert.match(waiting, /disabled=""/);
});

test('download: after the click the line is neutral, never "saved"; in an in-app browser only the guidance', async () => {
  const { Download } = await import('../apps/studio/src/tools/presentation/Download');
  for (const locale of ['uz', 'ru'] as const) {
    const texts = TEXTS[locale];
    const started = renderToString(createElement(Download, { texts, state: 'started', inApp: null, onDownload: () => {} }));
    assert.ok(started.includes(texts.started), locale);
    assert.doesNotMatch(started, /saqlandi|сохранён/);
    assert.doesNotMatch(started, /disabled=""/, 'the button stays enabled for another try');
    const inApp = renderToString(createElement(Download, { texts, state: 'started', inApp: 'instagram', onDownload: () => {} }));
    assert.ok(!inApp.includes(texts.started), `${locale}: no success line in an in-app browser`);
    assert.ok(inApp.includes(texts.inAppDownload.replace(/«/g, '&laquo;').replace(/»/g, '&raquo;')) || inApp.includes(texts.inAppDownload), locale);
    assert.ok(!('saved' in texts), 'no "saved" text left');
  }
  assert.equal(TEXTS.uz.started, 'Yuklab olish boshlandi. Fayl ko‘rinmasa, qayta bosing.');
  // The in-app guidance says the deck has to be made again in the real browser.
  assert.match(TEXTS.uz.inAppDownload, /qayta tayyorlang/);
  assert.match(TEXTS.ru.inAppDownload, /заново/);
  // The funnel names the click, not a save, and says where it happened.
  const form = read('apps/studio/src/tools/presentation/Form.tsx');
  assert.match(form, /funnel\.download\('presentation', encoded\.size, inApp \?\? 'none'\)/);
  assert.match(form, /setDownload\('started'\)/);
});

test('progress: no live region around the clock; the active step is aria-current; the form announces each step and the result', async () => {
  const { Progress } = await import('../apps/studio/src/tools/presentation/Progress');
  const html = renderToString(createElement(Progress, { texts: TEXTS.uz, step: 'write', startedAt: Date.now() - 12_000 }));
  assert.doesNotMatch(html, /aria-live/);
  assert.match(html, /<span class="st:tabular-nums" aria-hidden="true" data-studio-seconds="">12 soniya<\/span>/);
  assert.match(html, /<li class="[^"]*" data-state="active" aria-current="step">/);
  assert.equal((html.match(/aria-current/g) ?? []).length, 1);
  const form = read('apps/studio/src/tools/presentation/Form.tsx');
  assert.match(form, /status\.kind === 'working' \? texts\.steps\[status\.step\] : status\.kind === 'ready' \? texts\.steps\.ready : ''/);
  // The deck's heading takes the focus when it arrives (the submit button was disabled meanwhile).
  const preview = read('apps/studio/src/tools/presentation/Preview.tsx');
  assert.match(preview, /<h2 id="studio-result-title" ref=\{heading\} tabIndex=\{-1\}/);
  assert.match(preview, /heading\.current\?\.focus\(\);\s*\}, \[deck\]\);/);
});

test('preview: a card grows with its bullets (no 16:9 frame that clips them); at most two cards a row', async () => {
  const { Preview } = await import('../apps/studio/src/tools/presentation/Preview');
  const long = { ...DECK, slides: DECK.slides.map((slide) => ({ ...slide, bullets: Array.from({ length: 5 }, (_, i) => `${i + 1}. ${'Uzun matnli band '.repeat(6)}`.slice(0, 110)) })) };
  const html = renderToString(createElement(Preview, { texts: TEXTS.uz, deck: long, pictures: new Map([[1, { status: 'loading' as const }]]) }));
  assert.doesNotMatch(html, /aspect-video/);
  assert.doesNotMatch(html, /<li class="[^"]*overflow-hidden[^"]*" data-slide/);
  assert.doesNotMatch(html, /lg:grid-cols-3/);
  assert.match(html, /st:aspect-\[4\/3\]/);
  for (const slide of long.slides) for (const bullet of slide.bullets) assert.ok(html.includes(bullet), 'every bullet is in the card');
});

test('form: in an in-app browser the notice stands before the submit button', async () => {
  const { InAppNotice } = await import('../apps/studio/src/tools/presentation/InAppNotice');
  const notice = renderToString(createElement(InAppNotice, { texts: TEXTS.uz }));
  assert.ok(notice.includes(TEXTS.uz.inAppTitle) && notice.includes(TEXTS.uz.copyLink));
  // The order in the form's markup: the notice, then the submit button.
  const html = renderForm('uz');
  const noticeAt = html.indexOf('data-studio-inapp-slot');
  const buttonAt = html.indexOf('type="submit"');
  assert.ok(noticeAt > 0 && buttonAt > noticeAt);
  // When the copy fails, the way out is the in-app menu, never an address bar these browsers do not have.
  for (const locale of ['uz', 'ru'] as const) {
    for (const text of [TEXTS[locale].copyFailed, TEXTS[locale].inAppBody, TEXTS[locale].inAppDownload]) {
      assert.match(text, /⋮|…/, `${locale}: ${text}`);
      assert.doesNotMatch(text, /brauzer satri|строки браузера/, `${locale}: ${text}`);
    }
  }
  assert.match(TEXTS.uz.copyFailed, /«Brauzerda ochish»/);
  assert.match(TEXTS.ru.copyFailed, /«Открыть в браузере»/);
});

test('form: typed before the script ran is read into the state on hydration, so it is never wiped', () => {
  const form = read('apps/studio/src/tools/presentation/Form.tsx');
  for (const [field, ref] of [['topic', 'topicField'], ['audience', 'audienceField'], ['slides', 'slidesField']]) {
    assert.match(form, new RegExp(`ref=\\{${ref}\\}\\s*id=\\{\`\\$\\{id\\}-${field}\``), field);
  }
  const effect = form.slice(form.indexOf('useEffect(() => {'), form.indexOf('setHydrated(true);'));
  assert.match(effect, /topicField\.current\?\.value/);
  assert.match(effect, /audienceField\.current\?\.value/);
  assert.match(effect, /slidesField\.current\?\.value/);
});

// --- words -----------------------------------------------------------------------------------

test('words: honest brand, no forbidden tariff words, Uzbek apostrophes as on the site', () => {
  const all = (locale: 'uz' | 'ru') => {
    const values: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') values.push(value);
      else if (typeof value === 'function') values.push(String((value as (n: string | number) => string)(locale === 'uz' ? '05:00' : 7)));
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(TEXTS[locale]);
    return values;
  };
  for (const locale of ['uz', 'ru'] as const) {
    for (const value of all(locale)) {
      assert.doesNotMatch(value, /chatgpt|openai|\bgpt\b|rasmiy|cheksiz|безлимит|официальн|hammasi|to‘liq/i, value);
    }
  }
  for (const value of all('uz')) {
    assert.doesNotMatch(value, /['`ʻʼ]/, `${value}: Uzbek uses ‘ in o‘ and g‘ and ’ elsewhere`);
    assert.doesNotMatch(value, /[og]’/i, `${value}: o‘ and g‘ take U+2018`);
    assert.doesNotMatch(value, /[а-яё]/i, `${value}: Latin script`);
  }
  assert.equal(messageKey('turnstile_required'), 'turnstile');
  assert.equal(messageKey('model_failed'), 'busy');
  assert.equal(messageKey('free_limit'), 'free_limit');
  // A lost answer is a lost connection, not "temporarily down".
  assert.equal(messageKey('network'), 'connection_lost');
  assert.equal(messageKey('timeout'), 'connection_lost');
  assert.equal(messageKey('job_lost'), 'job_lost');
  // The free allowance says "up to", as the code allows (0–2 pictures).
  assert.match(TEXTS.uz.freeNote, /2 tagacha rasm/);
  assert.match(TEXTS.ru.freeNote, /до 2 картинок/);
  assert.equal(tashkentTime('2026-10-07T00:00:00.000Z'), '05:00');
  assert.equal(tashkentTime(undefined), '05:00');
});

// --- the entry ---------------------------------------------------------------------------------

test('entry: main.tsx hydrates the prerendered form, never ships react-dom/server, reads the page language', () => {
  const main = read('apps/studio/src/main.tsx');
  assert.match(main, /hydrateRoot\(root, island/);
  assert.match(main, /from 'react-dom\/client'/);
  assert.doesNotMatch(main, /^import[^;]*(?:react-dom\/server|\/static)/m);
  assert.match(main, /pageLocale\(document\.documentElement\.lang\)/);
  assert.doesNotMatch(main, /studio:download/, 'no test hook in the shipped island');
  assert.equal(pageLocale('ru'), 'ru');
  assert.equal(pageLocale('uz'), 'uz');
  assert.equal(pageLocale('uz-Latn'), 'uz');
  assert.equal(pageLocale(null), 'uz');
});

test('entry: the shipped React packages are named in the notices at their locked versions', () => {
  const lock = JSON.parse(read('apps/studio/package-lock.json')) as { packages: Record<string, { version?: string; license?: string }> };
  const notices = read('apps/studio/THIRD_PARTY_NOTICES.md');
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const locked = lock.packages[`node_modules/${name}`];
    assert.ok(locked?.version, `${name} is locked`);
    assert.equal(locked.license, 'MIT');
    assert.ok(notices.includes(`${name} ${locked.version}`) || notices.includes(`React ${locked.version}`), `${name} ${locked.version} is in the notices`);
  }
});

test('entry: every .tsx sets the automatic JSX runtime, so tsx (prerender, tests) compiles it like Vite does', () => {
  for (const file of fs.readdirSync(SRC, { recursive: true }) as string[]) {
    if (!file.endsWith('.tsx')) continue;
    const first = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n')[0];
    assert.equal(first, '/** @jsxRuntime automatic @jsxImportSource react */', file);
  }
});

// --- the full deck (T3.1) ----------------------------------------------------------------------

const FULL_JOB = `sj_${'f'.repeat(32)}`;
const FULL_CONFIG: StudioPublicConfig = { ...CONFIG, tools: { ...CONFIG.tools, fullDeck: true } };
const FULL_CREATED: CreatedJob = { jobId: FULL_JOB, source: 'entitlement', shape: { slides: 10, images: 8, notes: true, palette: 2, parts: 4 }, next: 'outline', expiresAt: '2026-10-07T10:10:00.000Z' };
const PLAN: OutlineAnswer = {
  outline: { title: 'Amir Temur', subtitle: '7-sinf', slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, title: `Slayd ${i + 1}`, point: 'Asosiy fikr' })) },
  sig: 'outline-sig',
  images: [{ index: 1, prompt: 'Stone walls', sig: 'p1' }, { index: 2, prompt: 'Green valley', sig: 'p2' }],
  parts: 3,
};
const partOf = (part: number, indexes: number[]): PartAnswer => ({
  part,
  deck: {
    ...(part === 1 ? { title: 'Amir Temur (tahrir)', subtitle: '7-sinf' } : {}),
    slides: indexes.map((index) => ({ index, title: `Slayd ${index}`, bullets: ['a', 'b', 'c'], notes: 'Bir. Ikki. Uch.', layout: 'title-bullets' as const })),
  },
  done: part === 3,
});
const PARTS = [partOf(1, [1, 2, 3, 4]), partOf(2, [5, 6, 7, 8]), partOf(3, [9, 10])];
const ENTITLED = (left: number): StudioMe => ({
  ...ME(true),
  account: { signedIn: true },
  entitlements: [{ id: 'se_1', orderId: 'stu_1', plan: 'oylik', startsAt: '2026-10-07T00:00:00.000Z', endsAt: '2026-11-07T00:00:00.000Z', presentationsLeft: left, presentationsLimit: 10, photosLeft: 0, photosLimit: 0, regenAvailable: [] }],
});

interface FullScript {
  config?: Result<StudioPublicConfig>;
  me?: Result<StudioMe>;
  create?: Result<CreatedJob>[];
  outline?: Result<OutlineAnswer>[];
  /** Answers per part number, in order; a part with none left answers its measured part. */
  parts?: Record<number, Result<PartAnswer>[]>;
  regenerate?: Result<RegeneratedJob>[];
}

function fullHarness(script: FullScript = {}) {
  const log: string[] = [];
  const bodies: Record<string, unknown[]> = { create: [], outline: [], part: [], regenerate: [] };
  const progress: string[] = [];
  const pictures: string[] = [];
  const create = [...(script.create ?? [ok(FULL_CREATED)])];
  const outline = [...(script.outline ?? [ok(PLAN)])];
  const parts = Object.fromEntries(Object.entries(script.parts ?? {}).map(([part, answers]) => [part, [...answers]]));
  const regenerate = [...(script.regenerate ?? [ok({ ...FULL_CREATED, jobId: `sj_${'e'.repeat(32)}`, source: 'regen', regenOf: FULL_JOB })])];
  const deps: FullDeps = {
    api: { createPresentation: async (body) => { log.push(`create:${body.shape}:${body.turnstileToken}`); bodies.create.push(body); return create.shift() ?? ok(FULL_CREATED); } },
    full: {
      outline: async (jobId, task) => { log.push(`outline:${jobId}`); bodies.outline.push(task); return outline.shift() ?? ok(PLAN); },
      part: async (jobId, task, part, plan, sig) => {
        log.push(`part:${part}`);
        bodies.part.push({ task, part, plan, sig });
        return parts[part]?.shift() ?? ok(PARTS[part - 1]);
      },
      regenerate: async (jobId, body) => { log.push(`regenerate:${jobId}`); bodies.regenerate.push(body); return regenerate.shift() ?? ok({ ...FULL_CREATED, source: 'regen', regenOf: jobId }); },
    },
    session: {
      config: async () => { log.push('config'); return script.config ?? ok(FULL_CONFIG); },
      me: async () => { log.push('me'); return script.me ?? ok(ENTITLED(3)); },
      refreshMe: () => log.push('refreshMe'),
    },
    requestId: () => 'r_full0001',
    onProgress: (step) => progress.push(`${step.phase}:${step.partsDone}/${step.parts}`),
    onOutline: (jobId, images) => pictures.push(`${jobId}:${images.map((image) => image.index).join(',')}`),
  };
  return { deps, log, bodies, progress, pictures };
}

const FULL_INPUT = { topic: ' Amir  Temur ', audience: 'maktab' as const, slides: 10, palette: 2 };

test('full flow: /config, /me, the start without Turnstile, the outline, then every part at once; pictures start with the outline', async () => {
  const { deps, log, bodies, progress, pictures } = fullHarness();
  const outcome = await startFullDeck(FULL_INPUT, 'uz', deps);
  assert.equal(outcome.kind, 'ready');
  assert.deepEqual(log.slice(0, 5), ['config', 'me', 'create:full:', `outline:${FULL_JOB}`, 'part:1']);
  // All three parts are asked before any answer is awaited.
  assert.deepEqual(log.slice(4, 7), ['part:1', 'part:2', 'part:3']);
  assert.deepEqual(bodies.create[0], { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 10, palette: 2, requestId: 'r_full0001', shape: 'full', turnstileToken: '' });
  assert.deepEqual(bodies.outline[0], { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 10, palette: 2 });
  for (const sent of bodies.part as Array<{ plan: unknown; sig: string }>) {
    assert.deepEqual(sent.plan, PLAN.outline);
    assert.equal(sent.sig, PLAN.sig);
  }
  assert.deepEqual(pictures, [`${FULL_JOB}:1,2`]);
  assert.deepEqual(progress.slice(0, 3), ['check:0/0', 'outline:0/0', 'write:0/3']);
  assert.equal(progress.at(-1), 'write:3/3');
  if (outcome.kind === 'ready') {
    // The cover from part 1 (proofread with it), every slide in plan order, the talk kept.
    assert.equal(outcome.deck.title, 'Amir Temur (tahrir)');
    assert.deepEqual(outcome.deck.slides.map((slide) => slide.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(outcome.deck.slides.every((slide) => slide.notes === 'Bir. Ikki. Uch.'));
    assert.deepEqual(outcome.images, PLAN.images);
    assert.equal(outcome.task.palette, 2);
    assert.ok(!('regenOf' in outcome));
  }
});

test('full flow: the slider and palettes stay inside what /config allows', () => {
  assert.equal(fullTask({ ...FULL_INPUT, slides: 15 }, 'uz', 12).slides, 12);
  assert.equal(fullTask({ ...FULL_INPUT, slides: 3 }, 'uz', 12).slides, 6);
  assert.equal(fullTask({ ...FULL_INPUT, slides: 15 }, 'uz', 15).slides, 15);
  assert.equal(fullTask({ ...FULL_INPUT, palette: 4 }, 'uz', 12).palette, 1);
  assert.equal(fullTask({ ...FULL_INPUT, palette: 3 }, 'ru', 12).palette, 3);
  assert.equal(FULL_SLIDES_INITIAL, 12);
});

test('full flow: no full deck left → the tariffs at once, nothing started; 402 from the server too; the full deck off → busy', async () => {
  const none = fullHarness({ me: ok(ENTITLED(0)) });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', none.deps), { kind: 'no_units' });
  assert.deepEqual(none.log, ['config', 'me']);
  const neverBought = fullHarness({ me: ok({ ...ME(true), account: null, entitlements: [] }) });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', neverBought.deps), { kind: 'no_units' });
  // /me without the paid part: the server decides.
  const server = fullHarness({ me: ok(ME(true)), create: [no('no_units')] });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', server.deps), { kind: 'no_units' });
  const off = fullHarness({ config: ok(CONFIG) });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', off.deps), { kind: 'error', code: 'studio_busy' });
  assert.deepEqual(off.log, ['config']);
  const short = fullHarness();
  assert.deepEqual(await startFullDeck({ ...FULL_INPUT, topic: 'ab' }, 'uz', short.deps), { kind: 'error', code: 'topic_length' });
  assert.deepEqual(short.log, []);
  const refused = fullHarness({ create: [no('topic_refused', { category: 'drugs' })] });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', refused.deps), { kind: 'refused', category: 'drugs' });
});

test('full flow: a part the server marks `retry` is asked again on its own; one that still fails ends the run, its unit coming back', async () => {
  const again = fullHarness({ parts: { 2: [no('invalid_output', { retry: true })] } });
  const outcome = await startFullDeck(FULL_INPUT, 'uz', again.deps);
  assert.equal(outcome.kind, 'ready');
  assert.equal(again.log.filter((line) => line === 'part:2').length, 2);
  assert.equal(again.log.filter((line) => line === 'part:1').length, 1);

  const lost = fullHarness({ parts: { 3: [no('timeout'), no('job_state')] } });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', lost.deps), { kind: 'error', code: 'job_lost', afterJob: true });

  const failing = fullHarness({ parts: { 1: Array.from({ length: PART_CALLS + 1 }, () => no('model_failed', { retry: true })) } });
  const failed = await startFullDeck(FULL_INPUT, 'uz', failing.deps);
  assert.deepEqual(failed, { kind: 'error', code: 'model_failed', afterJob: true });
  assert.equal(failing.log.filter((line) => line === 'part:1').length, PART_CALLS);
  assert.ok(failing.log.includes('refreshMe'), '/me is read again: the unit comes back');
  assert.ok(UNIT_BACK.has('model_failed') && UNIT_BACK.has('studio_busy') && !UNIT_BACK.has('job_state'));

  // Without `retry` a failed part is never asked again; the outline the same.
  const final = fullHarness({ parts: { 2: [no('invalid_output', { retry: false })] } });
  assert.equal((await startFullDeck(FULL_INPUT, 'uz', final.deps)).kind, 'error');
  assert.equal(final.log.filter((line) => line === 'part:2').length, 1);
  const plan = fullHarness({ outline: Array.from({ length: OUTLINE_CALLS + 1 }, () => no('studio_busy', { retry: true })) });
  assert.deepEqual(await startFullDeck(FULL_INPUT, 'uz', plan.deps), { kind: 'error', code: 'studio_busy', afterJob: true });
  assert.equal(plan.log.filter((line) => line.startsWith('outline:')).length, OUTLINE_CALLS);
  assert.ok(!plan.log.some((line) => line.startsWith('part:')), 'no part before the outline');
});

test('full flow: a regeneration posts /regenerate of the original with the same task, then the same steps; no /me units needed', async () => {
  const { deps, log, bodies } = fullHarness({ me: ok(ENTITLED(0)) });
  const task: DeckTask = { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 10, palette: 2 };
  const outcome = await regenerateFullDeck({ jobId: FULL_JOB, task }, deps);
  assert.equal(outcome.kind, 'ready');
  assert.deepEqual(log.slice(0, 3), ['config', `regenerate:${FULL_JOB}`, `outline:sj_${'e'.repeat(32)}`]);
  assert.deepEqual(bodies.regenerate[0], { ...task, requestId: 'r_full0001', shape: 'full' });
  if (outcome.kind === 'ready') assert.equal(outcome.regenOf, FULL_JOB);
  const used = fullHarness({ regenerate: [no('regen_used')] });
  assert.deepEqual(await regenerateFullDeck({ jobId: FULL_JOB, task }, used.deps), { kind: 'error', code: 'regen_used' });
  assert.equal(fullMessage('uz', 'regen_mismatch'), 'Qayta yaratish faqat o‘sha mavzu uchun.');
  assert.equal(fullMessage('uz', 'free_limit'), null);
});

test('full api: same-origin paths, exactly the task (and the part, outline and sig) in the body, only for a ledger job id', async () => {
  const { calls, fetchImpl } = fakeFetch((url) => {
    if (url.endsWith('/outline')) return json(200, { ok: true, ...PLAN });
    if (url.endsWith('/slides')) return json(200, { ok: true, ...PARTS[0] });
    if (url.endsWith('/regenerate')) return json(201, { ok: true, ...FULL_CREATED, source: 'regen', regenOf: FULL_JOB });
    return json(404, { ok: false, code: 'not_found' });
  });
  const full = createFullDeckApi(fetchImpl);
  const task = { ...TASK, slides: 10, palette: 2, extra: 'dropped' } as DeckTask;
  const plan = await full.outline(FULL_JOB, task);
  assert.ok(plan.ok);
  const part = await full.part(FULL_JOB, task, 1, PLAN.outline, PLAN.sig);
  assert.ok(part.ok && part.data.deck.title === 'Amir Temur (tahrir)');
  const regen = await full.regenerate(FULL_JOB, { ...task, requestId: 'r_full0002', shape: 'full' });
  assert.ok(regen.ok && regen.data.regenOf === FULL_JOB);
  assert.deepEqual(calls.map((call) => call.url), [
    `${STUDIO_API_BASE}presentations/${FULL_JOB}/outline`,
    `${STUDIO_API_BASE}presentations/${FULL_JOB}/slides`,
    `${STUDIO_API_BASE}presentations/${FULL_JOB}/regenerate`,
  ]);
  const plain = { topic: 'Amir Temur', locale: 'uz', audience: 'maktab', slides: 10, palette: 2 };
  assert.deepEqual(calls[0].body, plain);
  assert.deepEqual(calls[1].body, { ...plain, part: 1, outline: PLAN.outline, sig: PLAN.sig });
  assert.deepEqual(calls[2].body, { ...plain, requestId: 'r_full0002', shape: 'full' });
  for (const call of calls) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.credentials, 'same-origin');
    assert.equal(call.init.cache, 'no-store');
  }
  assert.deepEqual(await full.outline('../me', task), { ok: false, status: 0, code: 'invalid' });
  assert.equal(calls.length, 3);
  // A failure carries the server's code and `retry`.
  const failing = createFullDeckApi(async () => json(422, { ok: false, code: 'invalid_output', retry: true }));
  assert.deepEqual(await failing.part(FULL_JOB, task, 2, PLAN.outline, PLAN.sig), { ok: false, status: 422, code: 'invalid_output', retry: true });
  // Units left from /me: the sum over running tariffs; nothing said → null (the server decides).
  assert.equal(fullUnitsLeft(ENTITLED(3)), 3);
  assert.equal(fullUnitsLeft({ ...ENTITLED(3), entitlements: [...ENTITLED(3).entitlements!, ...ENTITLED(2).entitlements!] }), 5);
  assert.equal(fullUnitsLeft(ME(true)), null);
});

test('full words: the unit line before the submit, the free line first on the limit card; honest, no call to buy, nothing asks a parent', () => {
  assert.equal(FULL_TEXTS.uz.unitNote(4), 'Bu to‘liq taqdimot: 1 ta birlik yechiladi (qoldi: 4)');
  assert.equal(FULL_TEXTS.uz.freeAgain('05:00', false), 'Ertaga soat 05:00 da yana bepul.');
  assert.equal(FULL_TEXTS.uz.freeAgain('05:00', true), 'Bugun soat 05:00 da yana bepul.');
  // The free day restarts at 00:00 UTC (05:00 in Tashkent).
  assert.equal(freeAgainToday(Date.UTC(2026, 9, 7, 23, 30)), true); // 04:30 Tashkent
  assert.equal(freeAgainToday(Date.UTC(2026, 9, 7, 1, 0)), false); // 06:00 Tashkent
  for (const locale of ['uz', 'ru'] as const) {
    const values: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') values.push(value);
      else if (typeof value === 'function') values.push(String((value as (...args: unknown[]) => string)('05:00', 12)));
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(FULL_TEXTS[locale]);
    for (const value of values) {
      assert.doesNotMatch(value, /chatgpt|openai|\bgpt\b|rasmiy|cheksiz|безлимит|официальн/i, value);
      assert.doesNotMatch(value, /sotib ol|xarid qil|купи|ota-ona|родител|so‘m|сум|chegirma|скидк/i, value);
    }
    if (locale === 'uz') {
      for (const value of values) {
        assert.doesNotMatch(value, /['`ʻʼ]/, value);
        assert.doesNotMatch(value, /[og]’/i, value);
        assert.doesNotMatch(value, /[а-яё]/i, value);
      }
    }
  }
  // The full deck's own words never leak into the free tool's (TEXTS has no «to‘liq»: see 'words').
  assert.match(FULL_TEXTS.uz.shapeFullNote(15), /15 slaydgacha, 8 tagacha rasm, qisqa ma’ruza matni/);
});

test('full form: the static first state never carries the picker; the preview folds each talk; the parts count', async () => {
  for (const locale of ['uz', 'ru'] as const) {
    const html = renderForm(locale);
    assert.ok(!html.includes(FULL_TEXTS[locale].shapeLabel), 'the picker appears only once /config says the full deck is on');
    assert.ok(!html.includes('data-studio-shape'));
  }
  const { Preview } = await import('../apps/studio/src/tools/presentation/Preview');
  const deck: Deck = { ...DECK, slides: DECK.slides.map((slide) => ({ ...slide, notes: `Gap ${slide.index}. Ikki. Uch.` })) };
  const withNotes = renderToString(createElement(Preview, { texts: TEXTS.uz, deck, pictures: new Map(), notesLabel: FULL_TEXTS.uz.notesLabel }));
  assert.equal((withNotes.match(/<details /g) ?? []).length, 6);
  assert.ok(withNotes.includes(FULL_TEXTS.uz.notesLabel));
  const free = renderToString(createElement(Preview, { texts: TEXTS.uz, deck, pictures: new Map() }));
  assert.ok(!free.includes('<details'), 'no talk without the label (the free deck has none)');
  const { PartsProgress } = await import('../apps/studio/src/tools/presentation/PartsProgress');
  const parts = renderToString(createElement(PartsProgress, { done: 2, total: 3, label: FULL_TEXTS.uz.parts }));
  assert.match(parts, /data-studio-parts="2\/3"/);
  assert.ok(parts.includes('3 qismdan 2 tasi tayyor'));
  assert.equal(renderToString(createElement(PartsProgress, { done: 0, total: 0, label: FULL_TEXTS.uz.parts })), '');
  // The paid stage's slots are the Build-0 contract, and the form calls them only after hydration.
  const form = read('apps/studio/src/tools/presentation/Form.tsx');
  assert.match(form, /import type \{ IslandSlots \} from '\.\.\/\.\.\/slots';/);
  assert.match(form, /hydrated && !!slots\?\.tariffs/);
  assert.match(form, /slots\.tariffs\('after_result'\)/);
  assert.match(form, /slots\?\.tariffs\?\.\('limit'\)/);
});
