import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  checkTelegramHandlesPublicly,
  classifyPublicTelegramCard,
  readTelegramHandleVerdicts,
  telegramHandleCacheKey,
  writeTelegramHandleVerdict,
} from '../functions/platform/lead-radar/telegram-handle-check';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/lead-radar-tme/${name}.html`, import.meta.url), 'utf8');
const signalFixture = (name: string) => readFileSync(new URL(`./fixtures/signal-radar/${name}.html`, import.meta.url), 'utf8');

/** In-memory stand-in for the one cache table the verdict store touches. */
function fakeCacheDb(options: { failReads?: boolean; failWrites?: boolean } = {}) {
  const rows = new Map<string, { bounds_json: string; observed_at: string; expires_at: string }>();
  let writes = 0;
  const db = {
    rows,
    get writes() { return writes; },
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all<T>() {
              if (options.failReads) throw new Error('no such table');
              assert.match(sql, /FROM lead_radar_geocode_cache/);
              const keys = JSON.parse(String(args[0])) as string[];
              const now = String(args[1]);
              const results = keys
                .filter((key) => rows.has(key) && rows.get(key)!.expires_at > now)
                .map((key) => ({ cache_key: key, bounds_json: rows.get(key)!.bounds_json }));
              return { results: results as T[] };
            },
            async run() {
              if (options.failWrites) throw new Error('read only');
              assert.match(sql, /INSERT INTO lead_radar_geocode_cache[\s\S]*json_each/);
              const observed = String(args[0]);
              const batch = JSON.parse(String(args[1])) as Array<{ k: string; b: string; e: string }>;
              for (const item of batch) rows.set(item.k, { bounds_json: item.b, observed_at: observed, expires_at: item.e });
              writes += 1;
              return { meta: { changes: batch.length } };
            },
          };
        },
      };
    },
  };
  return db as unknown as D1Database & { rows: typeof rows; writes: number };
}

function fakeFetch(pages: Record<string, { status?: number; html?: string }>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const handle = url.replace('https://t.me/', '');
    const page = pages[handle] ?? { status: 404, html: '' };
    return new Response(page.html ?? '', { status: page.status ?? 200 });
  }) as typeof fetch;
}

// ── Page classification on real t.me markup ─────────────────────────────────

test('a public t.me page tells a bot, a channel, a group, a dead handle and a person apart', () => {
  assert.deepEqual(classifyPublicTelegramCard(fixture('bot')).kind, 'bot');
  assert.deepEqual(classifyPublicTelegramCard(fixture('channel')).kind, 'channel');
  assert.deepEqual(classifyPublicTelegramCard(fixture('group')).kind, 'group');
  assert.deepEqual(classifyPublicTelegramCard(fixture('dead')).kind, 'not_found');
  assert.deepEqual(classifyPublicTelegramCard(fixture('user')).kind, 'user');
});

test('older captured channel and dead pages classify the same way', () => {
  assert.equal(classifyPublicTelegramCard(signalFixture('fx-channel')).kind, 'channel');
  assert.equal(classifyPublicTelegramCard(signalFixture('fx-page')).kind, 'channel');
  assert.equal(classifyPublicTelegramCard(signalFixture('fx-dead')).kind, 'not_found');
});

test('unrecognised markup is unknown, never guessed', () => {
  assert.equal(classifyPublicTelegramCard('<html><body>maintenance</body></html>').kind, 'unknown');
  assert.equal(classifyPublicTelegramCard(signalFixture('fx-tgstat')).kind, 'unknown');
});

// ── Verdict cache ───────────────────────────────────────────────────────────

test('a verdict is cached under a namespaced key and read back until it expires', async () => {
  const db = fakeCacheDb();
  const now = new Date('2026-11-22T00:00:00.000Z');
  await writeTelegramHandleVerdict(db, 'Smile_Dent', 'bot', 'public_card', now);
  assert.ok(db.rows.has(telegramHandleCacheKey('smile_dent')));
  assert.equal(telegramHandleCacheKey('Smile_Dent'), 'tg-handle:v1:smile_dent');
  const fresh = await readTelegramHandleVerdicts(db, ['SMILE_DENT', 'other_clinic'], now);
  assert.deepEqual([...fresh], [['smile_dent', 'bot']]);
  const later = await readTelegramHandleVerdicts(db, ['smile_dent'], new Date('2027-03-01T00:00:00.000Z'));
  assert.equal(later.size, 0, 'a 60-day bot verdict has expired by March');
});

test('malformed cache rows and invalid usernames are ignored, and a missing table means nothing known', async () => {
  const db = fakeCacheDb();
  db.rows.set(telegramHandleCacheKey('broken_row'), { bounds_json: '{oops', observed_at: '', expires_at: '2099-01-01T00:00:00.000Z' });
  db.rows.set(telegramHandleCacheKey('odd_kind'), { bounds_json: '{"kind":"admin"}', observed_at: '', expires_at: '2099-01-01T00:00:00.000Z' });
  const verdicts = await readTelegramHandleVerdicts(db, ['broken_row', 'odd_kind', 'x', '1abc_def']);
  assert.equal(verdicts.size, 0);
  await writeTelegramHandleVerdict(db, 'bad name', 'bot', 'public_card');
  assert.equal(db.rows.size, 2, 'an invalid username is never written');
  assert.equal((await readTelegramHandleVerdicts(fakeCacheDb({ failReads: true }), ['smile_dent'])).size, 0);
  await writeTelegramHandleVerdict(fakeCacheDb({ failWrites: true }), 'smile_dent', 'bot', 'public_card');
});

// ── Bounded public check ────────────────────────────────────────────────────

test('the public check classifies, caches and returns only new verdicts', async () => {
  const db = fakeCacheDb();
  const calls: string[] = [];
  const found = await checkTelegramHandlesPublicly(db, ['clinic_bot_page', 'clinic_news', 'Clinic_Owner', 'clinic_gone', 'clinic_odd'], {
    fetch: fakeFetch({
      clinic_bot_page: { html: fixture('bot') },
      clinic_news: { html: fixture('channel') },
      clinic_owner: { html: fixture('user') },
      clinic_gone: { html: fixture('dead') },
      clinic_odd: { html: '<html></html>' },
      telegram: { html: fixture('channel') },
    }, calls),
    concurrency: 1,
    canaryCacheMs: 0,
  });
  assert.deepEqual(Object.fromEntries(found), {
    clinic_bot_page: 'bot', clinic_news: 'channel', clinic_owner: 'user', clinic_gone: 'not_found',
  });
  assert.equal(calls.length, 6, 'one canary plus five handles');
  assert.equal(calls[0], 'https://t.me/telegram');
  assert.equal(db.rows.size, 4, 'an unknown page is not cached');
  assert.equal(db.writes, 1, 'all verdicts in one D1 statement');
  assert.equal(JSON.parse(db.rows.get(telegramHandleCacheKey('clinic_news'))!.bounds_json).source, 'public_card');
});

test('the public check stops on 429, respects its cap and never fetches an invalid handle', async () => {
  const db = fakeCacheDb();
  const calls: string[] = [];
  await checkTelegramHandlesPublicly(db, ['first_clinic', 'second_clinic', 'third_clinic'], {
    fetch: fakeFetch({ first_clinic: { status: 429 }, telegram: { html: fixture('channel') } }, calls),
    concurrency: 1,
    canaryCacheMs: 0,
  });
  assert.deepEqual(calls, ['https://t.me/telegram', 'https://t.me/first_clinic'], 'rate limited: stop at once');

  const capped: string[] = [];
  await checkTelegramHandlesPublicly(db, ['aaaaa1', 'bbbbb2', 'ccccc3', 'bad handle', '../etc'], {
    fetch: fakeFetch({ telegram: { html: fixture('channel') } }, capped), limit: 2, concurrency: 1, canaryCacheMs: 0,
  });
  assert.deepEqual(capped, ['https://t.me/telegram', 'https://t.me/aaaaa1', 'https://t.me/bbbbb2']);
});

test('a failed canary writes nothing and reads no handle', async () => {
  const db = fakeCacheDb();
  const calls: string[] = [];
  const found = await checkTelegramHandlesPublicly(db, ['clinic_gone'], {
    fetch: fakeFetch({ telegram: { html: '<html>consent wall</html>' }, clinic_gone: { html: fixture('dead') } }, calls),
    canaryCacheMs: 0,
  });
  assert.equal(found.size, 0);
  assert.equal(db.rows.size, 0);
  assert.deepEqual(calls, ['https://t.me/telegram']);
});
