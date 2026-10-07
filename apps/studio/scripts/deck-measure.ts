/**
 * The full deck's local measurement (BUILD-PLAN 07.10.2026, stream A
 * acceptance; DECISIONS §11): N paid full decks of S slides with the Uzbek
 * proofreading pass, through the real endpoint handlers, with the real models.
 * Its report decides the slider: p90 of «the file can be saved» ≤ 60 s →
 * STUDIO_MAX_SLIDES=15, otherwise 12.
 *
 *   npx tsx apps/studio/scripts/deck-measure.ts --out <dir> [--decks 10] [--slides 15]
 *     [--concurrency 1] [--label proof-on] [--proofread on|off] [--no-images]
 *
 * How it runs, and why not against `wrangler pages dev`:
 *   - the handlers of functions/api/studio/presentations/** run in this
 *     process, called the way Pages calls them (the request on
 *     https://gptbot.uz, same origin, the buyer's __Host-studio_account
 *     cookie), in the order the island calls them (flow.ts startFullDeck):
 *     the start, the outline, every part at once, the pictures from the
 *     outline on (≤ 4 at a time, one redraw, 35 s after the outline);
 *   - Z.ai is the real one (the key is read from STUDIO_MEASURE_ZAI_KEY_FILE,
 *     by default the owner's local key file; it is never printed or written);
 *   - Workers AI (Flux, Llama Guard, the picture check) is the real one, via
 *     wrangler getPlatformProxy with a config that holds the AI binding only
 *     (AI always runs remotely, also in `wrangler pages dev`);
 *   - D1 is an in-memory SQLite with the real schema (tests/helpers/
 *     sqlite-d1.ts): never a remote database, nothing left behind;
 *   - the proofreading pass is seen from both sides of the same text: the
 *     part as the part step wrote it (the pass's own input) and as it went
 *     out. A `wrangler pages dev` run would need a built site, a copy of the
 *     key in .dev.vars and a second run with the pass off, and would still
 *     compare two different texts.
 * One buyer per deck (an account and an entitlement of one full deck), so
 * the person's pace of 6 starts in 10 minutes never shapes the timings.
 *
 * The shared Z.ai key also serves the live chat: one deck makes at most 4
 * streams at once (its parts, then their proofreading). Keep --concurrency
 * at 1–3 and out of the chat's busy hours (MEASURE-30 §8).
 *
 * Output (in --out, outside the repository): deck-measure-<label>.json (per
 * deck: the phases, every model call's time, the steps and cost from the
 * ledger, the proofreading codes and every change it made) and
 * decks-<label>.json (the decks as delivered, for the language review).
 * Logs: the summary only; never the key, never a deck's text.
 *
 * The functions and the test helper are loaded with import() of a computed
 * path: this script is checked with the studio's Node config, which knows
 * neither Workers types nor the functions' tsconfig.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SITE = 'https://gptbot.uz';
const ZAI_HOST = 'api.z.ai';
const DEFAULT_KEY_FILE = 'C:/Users/Borinio/.config/gptbot-private/zai-api-key.txt';
/** The island's own numbers (flow.ts): calls per step, pictures at once, the picture deadline. */
const OUTLINE_CALLS = 3;
const PART_CALLS = 3;
const PICTURES_AT_ONCE = 4;
const PICTURE_DEADLINE_MS = 35_000;
const GATE_P90_MS = 60_000;
/** The root install's wrangler (getPlatformProxy); a computed name, so the studio's typecheck never reads its types. */
const WRANGLER: string = 'wrangler';

// ── Arguments ───────────────────────────────────────────────────────────────

export interface MeasureOptions {
  readonly out: string;
  readonly decks: number;
  readonly slides: number;
  readonly concurrency: number;
  readonly label: string;
  readonly proofread: boolean;
  readonly images: boolean;
}

export function parseArgs(argv: readonly string[]): MeasureOptions {
  const value = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const whole = (name: string, fallback: number, min: number, max: number): number => {
    const raw = value(name);
    const parsed = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`--${name}: a whole number ${min}–${max}`);
    return parsed;
  };
  const out = value('out');
  if (!out) throw new Error('--out <directory outside the repository> is required');
  const resolved = path.resolve(out);
  if (resolved.startsWith(ROOT + path.sep) || resolved === ROOT) throw new Error('--out must be outside the repository');
  const proofread = (value('proofread') ?? 'on') !== 'off';
  return {
    out: resolved,
    decks: whole('decks', 10, 1, 30),
    slides: whole('slides', 15, 6, 15),
    concurrency: whole('concurrency', 1, 1, 3),
    label: (value('label') ?? (proofread ? 'proof-on' : 'proof-off')).replace(/[^a-z0-9-]/gi, '-'),
    proofread,
    images: !argv.includes('--no-images'),
  };
}

// ── Small statistics and the word diff ──────────────────────────────────────

/** The q-quantile (0–1) of `values`, nearest rank. */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

export interface WordChange {
  readonly from: string;
  readonly to: string;
}

/** The spans of words that differ between two texts (LCS over whitespace-separated words). */
export function wordChanges(before: string, after: string): WordChange[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const changes: WordChange[] = [];
  let from: string[] = [];
  let to: string[] = [];
  const flush = () => {
    if (from.length || to.length) changes.push({ from: from.join(' '), to: to.join(' ') });
    from = [];
    to = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      to.push(b[j++]);
    } else {
      from.push(a[i++]);
    }
  }
  flush();
  return changes;
}

// ── Records ─────────────────────────────────────────────────────────────────

interface CallRecord {
  readonly step: string;
  readonly ms: number;
  readonly status: number;
}

interface SlideText {
  readonly index: number;
  readonly title: string;
  readonly bullets: readonly string[];
  readonly notes?: string;
}

interface DeckRecord {
  readonly id: string;
  readonly topic: string;
  ok: boolean;
  code?: string;
  times: { create?: number; outline?: number; text?: number; pictures?: number; ready?: number };
  parts: Array<{ part: number; ms: number; calls: number; code: string }>;
  pictures: { asked: number; drawn: number; none: number };
  ledger?: { state: string; steps: number; costUzs: number; tokensIn: number; tokensOut: number };
  zai: CallRecord[];
  logs: Record<string, number>;
  proof: { inputs: number; changes: Array<{ index: number; field: string } & WordChange> };
  deck?: { title: string; subtitle: string; slides: SlideText[] };
}

interface Context {
  readonly deck: DeckRecord;
  readonly proofInputs: Map<number, SlideText>;
}

const context = new AsyncLocalStorage<Context>();

function stepOf(body: unknown): string {
  const messages = (body as { messages?: Array<{ content?: string }> })?.messages;
  const system = messages?.[0]?.content ?? '';
  if (system.startsWith('You are an editor of Uzbek school texts')) return 'proof';
  if (system.includes('Step 1 of 2')) return 'outline';
  if (system.includes('Step 2 of 2')) return 'part';
  return 'other';
}

/**
 * fetch for this process: Z.ai calls are timed to the end of their stream
 * and, for the proofreading pass, their input (the part as written) is kept
 * for the comparison; anything else passes through untouched.
 */
function instrumentFetch(original: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const own = context.getStore();
    if (!own || !url.includes(ZAI_HOST)) return original(input, init);
    let body: unknown = null;
    try {
      body = JSON.parse(String(init?.body ?? 'null'));
    } catch {
      // not JSON: timed only
    }
    const step = stepOf(body);
    if (step === 'proof') {
      const content = (body as { messages: Array<{ content: string }> }).messages[1].content;
      for (const slide of (JSON.parse(content) as { slides: SlideText[] }).slides) own.proofInputs.set(slide.index, slide);
      own.deck.proof.inputs++;
    }
    const started = performance.now();
    const response = await original(input, init);
    const record = (status: number) => own.deck.zai.push({ step, ms: Math.round(performance.now() - started), status });
    if (!response.body) {
      record(response.status);
      return response;
    }
    // The call ends when its stream ends, or when the reader stops early (llm.ts cancels after [DONE]).
    const reader = response.body.getReader();
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      record(response.status);
    };
    const timed = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const part = await reader.read();
        if (part.done) {
          end();
          controller.close();
        } else {
          controller.enqueue(part.value);
        }
      },
      cancel(reason) {
        end();
        return reader.cancel(reason);
      },
    });
    return new Response(timed, { status: response.status, statusText: response.statusText, headers: response.headers });
  }) as typeof fetch;
}

/** console.log of the handlers: {event, code} lines, counted per deck; anything else is printed. */
function captureLogs(original: typeof console.log): typeof console.log {
  return (...args: unknown[]) => {
    const own = context.getStore();
    if (own && args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('{"event"')) {
      try {
        const { event, code } = JSON.parse(args[0]) as { event: string; code: string };
        const key = `${event}.${code}`;
        own.deck.logs[key] = (own.deck.logs[key] ?? 0) + 1;
        return;
      } catch {
        // print it below
      }
    }
    original(...args);
  };
}

// ── The run ─────────────────────────────────────────────────────────────────

interface Topic {
  readonly id: string;
  readonly topic: string;
  readonly audience: 'maktab' | 'talaba';
}

/** The Uzbek topics of the 30-topic measurement written at 15 slides (MEASURE-30), in its order. */
function topicsOf(count: number): Topic[] {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/studio/measure30.json'), 'utf8')) as {
    decks: Array<{ id: string; lang: string; slides: number; topic: string; level: string }>;
  };
  const uz = fixture.decks.filter((deck) => deck.lang === 'uz' && deck.slides === 15);
  return uz.slice(0, count).map((deck) => ({
    id: deck.id,
    topic: deck.topic,
    audience: /universitet|talaba|kurs/i.test(deck.level) ? 'talaba' : 'maktab',
  }));
}

type Handler = (context: unknown) => Promise<Response>;

interface Runtime {
  readonly env: Record<string, unknown>;
  readonly db: { asD1(): unknown; rows<T>(sql: string, ...params: unknown[]): T[]; sqlite: { prepare(sql: string): { run(...params: unknown[]): unknown } } };
  readonly handlers: { create: Handler; outline: Handler; slides: Handler; images: Handler };
  readonly identity: { syntheticLogin(prefix: string, ttl: number, now?: number): Promise<{ id: string; token: string }> };
  readonly org: string;
  readonly microToUzs: (micro: number) => number;
  readonly waits: Promise<unknown>[];
}

async function call(runtime: Runtime, handler: Handler, pathname: string, body: unknown, cookie: string, params: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown>; bytes?: number }> {
  const request = new Request(`${SITE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, Cookie: cookie, 'CF-Connecting-IP': '203.0.113.50' },
    body: JSON.stringify(body),
  });
  const response = await handler({
    request,
    env: runtime.env,
    params,
    data: {},
    waitUntil: (promise: Promise<unknown>) => runtime.waits.push(promise),
    next: () => {
      throw new Error('next() called');
    },
    passThroughOnException: () => undefined,
    functionPath: pathname,
  });
  if ((response.headers.get('content-type') ?? '').startsWith('image/')) return { status: response.status, json: {}, bytes: (await response.arrayBuffer()).byteLength };
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function withRetries(once: () => Promise<{ status: number; json: Record<string, unknown> }>, calls: number) {
  let result = await once();
  let made = 1;
  while (result.status !== 200 && result.json.retry === true && made < calls) {
    result = await once();
    made++;
  }
  return { result, made };
}

async function buyer(runtime: Runtime): Promise<string> {
  const now = Date.now();
  const { id, token } = await runtime.identity.syntheticLogin('acct_studio_', 86_400_000, now);
  const entitlement = `se_measure_${randomBytes(6).toString('hex')}`;
  runtime.db.sqlite
    .prepare(
      `INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit)
       VALUES(?,?,?,?,'live','kunlik','studio-2026-10-decks-v1',?,?,1,0)`,
    )
    .run(runtime.org, entitlement, entitlement, id, now - 60_000, now + 86_400_000);
  return `__Host-studio_account=${token}`;
}

async function measureDeck(runtime: Runtime, topic: Topic, options: MeasureOptions): Promise<DeckRecord> {
  const deck: DeckRecord = { id: topic.id, topic: topic.topic, ok: false, times: {}, parts: [], pictures: { asked: 0, drawn: 0, none: 0 }, zai: [], logs: {}, proof: { inputs: 0, changes: [] } };
  const own: Context = { deck, proofInputs: new Map() };
  return context.run(own, async () => {
    const cookie = await buyer(runtime);
    const task = { topic: topic.topic, locale: 'uz', audience: topic.audience, slides: options.slides, palette: 2 };
    const t0 = performance.now();
    const since = () => Math.round(performance.now() - t0);
    const created = await call(runtime, runtime.handlers.create, '/api/studio/presentations', { requestId: `measure_${randomBytes(8).toString('hex')}`, ...task, shape: 'full' }, cookie);
    deck.times.create = since();
    if (created.status !== 201) {
      deck.code = `create:${String(created.json.code)}`;
      return deck;
    }
    const jobId = created.json.jobId as string;
    const at = (step: string) => `/api/studio/presentations/${jobId}/${step}`;
    const outline = await withRetries(() => call(runtime, runtime.handlers.outline, at('outline'), task, cookie, { job: jobId }), OUTLINE_CALLS);
    deck.times.outline = since();
    if (outline.result.status !== 200) {
      deck.code = `outline:${String(outline.result.json.code)}`;
      return deck;
    }
    const plan = outline.result.json as { outline: { title: string; subtitle: string }; sig: string; images: Array<{ index: number; prompt: string; sig: string }>; parts: number };

    // The pictures from now on, as the island draws them.
    const pictureStart = performance.now();
    const queue = options.images ? [...plan.images] : [];
    deck.pictures.asked = queue.length;
    const draw = async () => {
      for (let image = queue.shift(); image; image = queue.shift()) {
        if (performance.now() - pictureStart > PICTURE_DEADLINE_MS) {
          deck.pictures.none++;
          continue;
        }
        let drawn = await call(runtime, runtime.handlers.images, at('images'), image, cookie, { job: jobId });
        if (drawn.status !== 200 && ['image_refused', 'image_failed', 'studio_busy'].includes(String(drawn.json.code))) drawn = await call(runtime, runtime.handlers.images, at('images'), image, cookie, { job: jobId });
        if (drawn.status === 200 && performance.now() - pictureStart <= PICTURE_DEADLINE_MS) deck.pictures.drawn++;
        else deck.pictures.none++;
      }
    };
    const pictures = Promise.all(Array.from({ length: Math.min(PICTURES_AT_ONCE, queue.length) }, draw)).then(() => {
      deck.times.pictures = Math.min(since(), Math.round(pictureStart - t0) + PICTURE_DEADLINE_MS);
    });

    const parts = await Promise.all(
      Array.from({ length: plan.parts }, async (_, i) => {
        const started = performance.now();
        const run = await withRetries(() => call(runtime, runtime.handlers.slides, at('slides'), { ...task, part: i + 1, outline: plan.outline, sig: plan.sig }, cookie, { job: jobId }), PART_CALLS);
        deck.parts.push({ part: i + 1, ms: Math.round(performance.now() - started), calls: run.made, code: run.result.status === 200 ? 'ok' : String(run.result.json.code) });
        return run.result;
      }),
    );
    deck.times.text = since();
    await pictures;
    deck.times.pictures ??= since();
    deck.times.ready = Math.max(deck.times.text, deck.times.pictures);
    const failed = parts.find((part) => part.status !== 200);
    if (failed) deck.code = `part:${String(failed.json.code)}`;
    deck.ok = !failed;

    // The deck as it went out, and what the proofreading pass changed in it.
    const slides: SlideText[] = parts
      .filter((part) => part.status === 200)
      .flatMap((part) => (part.json.deck as { slides: SlideText[] }).slides)
      .sort((a, b) => a.index - b.index);
    const first = parts[0]?.status === 200 ? (parts[0].json.deck as { title?: string; subtitle?: string }) : {};
    deck.deck = { title: first.title ?? plan.outline.title, subtitle: first.subtitle ?? plan.outline.subtitle, slides };
    for (const after of slides) {
      const before = own.proofInputs.get(after.index);
      if (!before) continue;
      const fields: Array<[string, string, string]> = [
        ['title', before.title, after.title],
        ['notes', before.notes ?? '', after.notes ?? ''],
        ...before.bullets.map((bullet, i): [string, string, string] => [`bullet${i + 1}`, bullet, after.bullets[i] ?? '']),
      ];
      for (const [field, from, to] of fields) for (const change of wordChanges(from, to)) deck.proof.changes.push({ index: after.index, field, ...change });
    }

    const row = runtime.db.rows<{ state: string; steps: number; cost_micro: number; tokens_in: number | null; tokens_out: number | null }>(
      'SELECT state, steps, cost_micro, tokens_in, tokens_out FROM studio_unit_ledger WHERE org_id=? AND id=?',
      runtime.org,
      jobId,
    )[0];
    if (row) {
      deck.ledger = {
        state: row.state,
        steps: Number(row.steps),
        costUzs: Math.round(runtime.microToUzs(Number(row.cost_micro)) * 100) / 100,
        tokensIn: Number(row.tokens_in ?? 0),
        tokensOut: Number(row.tokens_out ?? 0),
      };
    }
    return deck;
  });
}

export interface MeasureSummary {
  readonly decks: number;
  readonly ok: number;
  readonly failures: Record<string, number>;
  readonly readyMs: { readonly p50: number; readonly p90: number; readonly max: number };
  readonly textMs: { readonly p50: number; readonly p90: number; readonly max: number };
  readonly outlineMs: { readonly p50: number; readonly p90: number };
  readonly partRetries: number;
  readonly pictures: { readonly asked: number; readonly drawn: number; readonly none: number };
  readonly costUzs: { readonly mean: number; readonly max: number };
  readonly proof: { readonly calls: number; readonly codes: Record<string, number>; readonly changes: number; readonly changesPerDeck: number };
  readonly recommendation: 15 | 12;
}

export function summarize(decks: readonly DeckRecord[]): MeasureSummary {
  const ok = decks.filter((deck) => deck.ok);
  const stats = (values: number[]) => ({ p50: quantile(values, 0.5), p90: quantile(values, 0.9), max: Math.max(...values) });
  const failures: Record<string, number> = {};
  for (const deck of decks) if (!deck.ok) failures[deck.code ?? 'unknown'] = (failures[deck.code ?? 'unknown'] ?? 0) + 1;
  const codes: Record<string, number> = {};
  for (const deck of decks) for (const [key, n] of Object.entries(deck.logs)) if (key.startsWith('studio_proof.')) codes[key.slice('studio_proof.'.length)] = (codes[key.slice('studio_proof.'.length)] ?? 0) + n;
  const costs = decks.flatMap((deck) => (deck.ledger ? [deck.ledger.costUzs] : []));
  const ready = stats(ok.map((deck) => deck.times.ready ?? 0));
  const changes = decks.reduce((sum, deck) => sum + deck.proof.changes.length, 0);
  return {
    decks: decks.length,
    ok: ok.length,
    failures,
    readyMs: ready,
    textMs: stats(ok.map((deck) => deck.times.text ?? 0)),
    outlineMs: (({ p50, p90 }) => ({ p50, p90 }))(stats(ok.map((deck) => deck.times.outline ?? 0))),
    partRetries: decks.reduce((sum, deck) => sum + deck.parts.reduce((n, part) => n + part.calls - 1, 0), 0),
    pictures: decks.reduce((sum, deck) => ({ asked: sum.asked + deck.pictures.asked, drawn: sum.drawn + deck.pictures.drawn, none: sum.none + deck.pictures.none }), { asked: 0, drawn: 0, none: 0 }),
    costUzs: { mean: costs.length ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 100) / 100 : Number.NaN, max: costs.length ? Math.max(...costs) : Number.NaN },
    proof: { calls: decks.reduce((sum, deck) => sum + deck.proof.inputs, 0), codes, changes, changesPerDeck: decks.length ? Math.round((changes / decks.length) * 10) / 10 : 0 },
    recommendation: ok.length === decks.length && ready.p90 <= GATE_P90_MS ? 15 : 12,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const keyFile = process.env.STUDIO_MEASURE_ZAI_KEY_FILE ?? DEFAULT_KEY_FILE;
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  if (!/^[A-Za-z0-9._-]{20,200}$/.test(key)) throw new Error('the Z.ai key file does not hold one key');

  const load = (relative: string) => import(pathToFileURL(path.join(ROOT, relative)).href);
  const [{ SqliteD1 }, chatSchema, billingSchema, studioSchema, identityStore, pricing, create, outline, slides, images, wrangler] = await Promise.all([
    load('tests/helpers/sqlite-d1.ts'),
    load('functions/lib/gpt-chat/schema.ts'),
    load('functions/lib/gpt-chat/billing-schema.ts'),
    load('functions/lib/studio/schema.ts'),
    load('functions/lib/gpt-chat/identity-store.ts'),
    load('functions/lib/studio/pricing.ts'),
    load('functions/api/studio/presentations/index.ts'),
    load('functions/api/studio/presentations/[job]/outline.ts'),
    load('functions/api/studio/presentations/[job]/slides.ts'),
    load('functions/api/studio/presentations/[job]/images.ts'),
    import(WRANGLER),
  ]);

  fs.mkdirSync(options.out, { recursive: true });
  let proxy: { env: Record<string, unknown>; dispose(): Promise<void> } | null = null;
  if (options.images) {
    const config = path.join(options.out, 'wrangler.ai-only.toml');
    fs.writeFileSync(config, 'name = "studio-deck-measure"\ncompatibility_date = "2026-09-01"\n[ai]\nbinding = "AI"\n');
    proxy = await wrangler.getPlatformProxy({ configPath: config, persist: false });
  }

  const db = new SqliteD1();
  await chatSchema.ensureSchema(db.asD1());
  await billingSchema.ensureBillingSchema(db.asD1());
  await studioSchema.ensureStudioSchema(db.asD1());
  const runtime: Runtime = {
    db,
    env: {
      STUDIO_RUNTIME_CONFIG_JSON: JSON.stringify({
        STUDIO_API: 'on',
        STUDIO_PAID_SERVICE: 'on',
        STUDIO_FULL_DECK: 'true',
        STUDIO_MAX_SLIDES: String(options.slides),
        STUDIO_JOB_GLOBAL_PER_MIN: '60',
        STUDIO_PAID_PROOFREAD: options.proofread ? 'true' : 'false',
      }),
      GPT_IDENTITY_SECRET: randomBytes(32).toString('hex'),
      STUDIO_TURNSTILE_SECRET_KEY: 'measure-only-no-turnstile-on-paid-paths',
      ZAI_API_KEY: key,
      GPTBOT_DRAFTS_DB: db.asD1(),
      AI: proxy?.env.AI ?? { run: async () => ({ response: '\n\nunsafe\nS1' }) },
    },
    handlers: { create: create.onRequest, outline: outline.onRequest, slides: slides.onRequest, images: images.onRequest },
    identity: new identityStore.IdentityStore(db.asD1(), studioSchema.STUDIO_ORG),
    org: studioSchema.STUDIO_ORG,
    microToUzs: pricing.microToUzs,
    waits: [],
  };

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  globalThis.fetch = instrumentFetch(originalFetch);
  console.log = captureLogs(originalLog);
  const topics = topicsOf(options.decks);
  const decks: DeckRecord[] = [];
  const startedAt = new Date().toISOString();
  try {
    const queue = [...topics];
    await Promise.all(
      Array.from({ length: options.concurrency }, async () => {
        for (let topic = queue.shift(); topic; topic = queue.shift()) {
          const deck = await measureDeck(runtime, topic, options);
          decks.push(deck);
          originalLog(JSON.stringify({ deck: deck.id, ok: deck.ok, code: deck.code ?? null, readyMs: deck.times.ready ?? null, textMs: deck.times.text ?? null, costUzs: deck.ledger?.costUzs ?? null, proofChanges: deck.proof.changes.length }));
        }
      }),
    );
    await Promise.allSettled(runtime.waits);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    await proxy?.dispose();
  }

  const summary = summarize(decks);
  const texts = decks.map((deck) => ({ id: deck.id, topic: deck.topic, deck: deck.deck ?? null }));
  const records = decks.map(({ deck: _text, ...rest }) => rest);
  fs.writeFileSync(path.join(options.out, `deck-measure-${options.label}.json`), `${JSON.stringify({ startedAt, options: { ...options, out: undefined }, summary, decks: records }, null, 2)}\n`);
  fs.writeFileSync(path.join(options.out, `decks-${options.label}.json`), `${JSON.stringify(texts, null, 2)}\n`);
  originalLog(JSON.stringify({ status: 'deck-measure', label: options.label, ...summary }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
