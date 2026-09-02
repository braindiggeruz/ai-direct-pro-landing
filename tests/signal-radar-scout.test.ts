/**
 * Signal Radar scout — the network half of the radar.
 *
 * `fetch` is injected rather than stubbed globally, so every assertion here
 * describes what the scout does with a *response*, not with a mock framework.
 * The HTML is cut from live Telegram and tgstat pages (see fixtures/), and only
 * the message bodies are swapped when a test needs a post that triages to a
 * real lead — the surrounding markup stays exactly as Telegram served it.
 *
 * The most important test in this file is the last one: it proves the scout
 * never executes a join. Everything else is only as safe as that guarantee.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  runSignalScoutTick,
  signalRadarEnabled,
  SIGNAL_SCOUT_LIMITS,
  type SignalScoutDeps,
  type SignalScoutEnv,
} from '../functions/platform/lead-radar/signal-scout';
import { SignalRadarStore } from '../functions/platform/lead-radar/signal-store';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG = 'owner_8ee98dc3040f160b308166b0';
const NOW = new Date('2026-09-02T09:00:00.000Z');

const fixture = (name: string): string =>
  readFileSync(path.join(ROOT, 'tests/fixtures/signal-radar', name), 'utf8');

/** A database with migration 0057 applied and recorded in the ledger. */
function signalDb(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(readFileSync(path.join(ROOT, 'migrations/0057_lead_radar_signal.sql'), 'utf8'));
  db.exec("INSERT INTO d1_migrations(name) VALUES ('0057_lead_radar_signal.sql')");
  return db;
}

/** A database that has NOT been migrated — the pre-deploy production state. */
function bareDb(): SqliteD1 {
  return new SqliteD1();
}

function env(overrides: Partial<SignalScoutEnv> = {}): SignalScoutEnv {
  return {
    LEAD_RADAR_SIGNAL_ENABLED: 'true',
    LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'discover',
    LEAD_RADAR_ALLOWED_ORGS: ORG,
    ...overrides,
  };
}

/** Route by URL fragment; anything unrouted returns null, like a dead host. */
function stubFetch(
  routes: Record<string, string | null>,
  calls: string[] = [],
): NonNullable<SignalScoutDeps['fetchText']> {
  return async (url: string) => {
    calls.push(url);
    for (const [fragment, body] of Object.entries(routes)) {
      if (url.includes(fragment)) return body;
    }
    return null;
  };
}

const NO_WAIT: SignalScoutDeps = { sleep: async () => {} };

/**
 * Swap the visible text of every message block, keeping Telegram's markup
 * exactly as served. Without this we would be testing our own invented HTML.
 */
function withMessageTexts(html: string, texts: string[]): string {
  const pattern = /(<div class="tgme_widget_message_text[^>]*dir="auto">)([\s\S]*?)(<\/div>)/g;
  let index = 0;
  return html.replace(pattern, (_all, open: string, _body: string, close: string) => {
    const text = texts[index] ?? texts[texts.length - 1] ?? '';
    index += 1;
    return `${open}${text}${close}`;
  });
}

test('the scout switch is exact-true; anything else means no network at all', () => {
  assert.equal(signalRadarEnabled({ LEAD_RADAR_SIGNAL_ENABLED: 'true' }), true);
  for (const value of ['false', 'TRUE', '1', '', undefined]) {
    assert.equal(signalRadarEnabled({ LEAD_RADAR_SIGNAL_ENABLED: value }), false, String(value));
  }
});

test('a disabled scout performs no requests', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const calls: string[] = [];
  const report = await runSignalScoutTick(
    { ...env(), LEAD_RADAR_SIGNAL_ENABLED: 'false' },
    db.asD1(), NOW, { ...NO_WAIT, fetchText: stubFetch({}, calls) },
  );
  assert.equal(calls.length, 0);
  assert.equal(report.scouted, 0);
  assert.equal(report.orgs, 0);
});

test('an un-migrated database is a silent no-op, not a crash', async (t) => {
  const db = bareDb();
  t.after(() => db.sqlite.close());
  const calls: string[] = [];
  const report = await runSignalScoutTick(env(), db.asD1(), NOW,
    { ...NO_WAIT, fetchText: stubFetch({}, calls) });
  assert.equal(calls.length, 0);
  assert.equal(report.orgs, 0);
});

test('discovery fills the candidate pool from the tgstat country ranking', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 'uz.tgstat.com/ratings/channels': fixture('fx-tgstat.html') }),
  });

  assert.equal(report.discovered > 0, true, 'the tgstat fixture must yield Uzbek entities');
  const targets = await store.listTargets(ORG, { limit: 200 });
  assert.equal(targets.length, report.discovered);

  // Every discovered slug must be a plausible Telegram entity, or the first
  // preview fetch would 404 and we would waste the tick on garbage.
  for (const target of targets) {
    assert.match(target.slug, /^[A-Za-z0-9_]{5,32}$/, target.slug);
    assert.equal(target.source, 'tgstat:uz');
  }
  // The fixture carries both shapes; groups are flagged, never auto-joined.
  const groups = targets.filter((target) => target.kind === 'group');
  assert.equal(groups.length > 0, true);
  assert.equal(groups.every((target) => target.status === 'candidate'), true);
});

test('discovery does not duplicate channels it has already seen', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  const deps: SignalScoutDeps = {
    ...NO_WAIT,
    fetchText: stubFetch({ 'uz.tgstat.com/ratings/channels': fixture('fx-tgstat.html') }),
  };

  const first = await runSignalScoutTick(env(), db.asD1(), NOW, deps);
  const afterFirst = (await store.listTargets(ORG, { limit: 200 })).length;
  assert.equal(afterFirst, first.discovered);

  // Reset the pacing gate so the second tick would re-discover if it could.
  for (const target of await store.listTargets(ORG, { limit: 200 })) {
    await store.updateTarget(ORG, target.id, { next_action_at: null });
  }
  const second = await runSignalScoutTick(env(), db.asD1(), NOW, deps);
  assert.equal(second.discovered, 0, 'the same ranking must not re-insert slugs');
  assert.equal((await store.listTargets(ORG, { limit: 200 })).length, afterFirst);
});

test('a real request for a service becomes a lead, quoted in the customer\'s words', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'toshkent_ish', kind: 'channel', status: 'candidate' });

  const demand = 'Ищу исполнителя: нужен чат-бот для записи клиентов в Telegram. Бюджет обсудим. Пишите @alex';
  const html = withMessageTexts(fixture('fx-channel.html'), [demand]);

  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/toshkent_ish': html }),
  });

  assert.equal(report.scouted, 1);
  assert.equal(report.posts, 1);
  assert.equal(report.leads, 1);

  const leads = await store.listLeads(ORG, { limit: 10 });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].state, 'new');
  assert.equal(leads[0].service, 'bots');
  // The operator replies to a person, so the quote must be their own text.
  assert.equal(leads[0].quote.includes('чат-бот'), true, leads[0].quote);

  const target = (await store.getTargetBySlug(ORG, 'toshkent_ish'))!;
  // Producing a lead is the strongest possible signal — promote it to watching.
  assert.equal(target.status, 'watching');
  assert.equal(target.leadsSeen, 1);
  assert.equal(target.messagesSeen, 1);
  assert.equal(target.nextActionAt !== null, true, 'a watched channel must be given a polling date');
});

test('the same request pasted again yields exactly one lead', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'ish_toshkent', kind: 'channel', status: 'watching' });

  const demand = 'Требуется настроить таргетированную рекламу в Instagram, бюджет от 300$';
  const html = withMessageTexts(fixture('fx-channel2.html'), [demand]);
  const deps: SignalScoutDeps = {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/ish_toshkent': html }),
  };

  const first = await runSignalScoutTick(env(), db.asD1(), NOW, deps);
  assert.equal(first.leads, 1);

  // Same channel, same text, next tick. Cross-post spam is the single most
  // common way this product could annoy the operator into turning it off.
  await store.updateTarget(ORG, (await store.getTargetBySlug(ORG, 'ish_toshkent'))!.id,
    { next_action_at: null });
  const second = await runSignalScoutTick(env(), db.asD1(), NOW, deps);
  assert.equal(second.leads, 0);
  assert.equal(second.posts, 0);

  const leads = await store.listLeads(ORG, { limit: 10 });
  assert.equal(leads.length, 1, 'one post, one lead, ever');
});

test('a channel that asks not to be indexed is dropped, not scraped', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'digitalcapitalpro', status: 'candidate' });

  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/digitalcapitalpro': fixture('fx-dead.html') }),
  });

  const target = (await store.getTargetBySlug(ORG, 'digitalcapitalpro'))!;
  assert.equal(target.status, 'ignored');
  assert.equal((await store.listLeads(ORG, { limit: 10 })).length, 0);
});

test('a group has no web preview, so the scout reads nothing and invents nothing', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'freetekn0', kind: 'group', status: 'watching' });

  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/freetekn0': fixture('fx-page.html') }),
  });

  assert.equal(report.leads, 0);
  assert.equal(report.posts, 0);
  assert.equal((await store.listLeads(ORG, { limit: 10 })).length, 0);
  // It stays a candidate for the join queue rather than being silently dropped.
  const target = (await store.getTargetBySlug(ORG, 'freetekn0'))!;
  assert.equal(target.kind, 'group');
  assert.equal(target.status, 'watching');
});

test('a dead host backs off instead of hammering the slug every tick', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'vanished_channel', status: 'candidate' });

  // Unrouted URL -> null, exactly like a timeout or an NXDOMAIN.
  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({}),
  });

  assert.equal(report.scouted, 0);
  assert.equal(report.skipped.length, 0, 'a network miss is normal, not an error to report');
  const target = (await store.getTargetBySlug(ORG, 'vanished_channel'))!;
  assert.equal(target.nextActionAt !== null, true);
  const delayHours = (Date.parse(target.nextActionAt!) - NOW.getTime()) / 3_600_000;
  assert.ok(delayHours >= 5, `expected a multi-hour backoff, got ${delayHours}h`);
});

test('the scout never executes a join, even for a fully qualified group', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  // Everything the join policy could ask for: a big, high-scoring, due group.
  await store.upsertTarget(ORG, {
    slug: 'uzbek_digital_market',
    kind: 'group',
    status: 'watching',
    score: 95,
    members: 25_000,
  });
  await store.updateTarget(ORG,
    (await store.getTargetBySlug(ORG, 'uzbek_digital_market'))!.id,
    { next_action_at: NOW.toISOString() });

  const calls: string[] = [];
  await runSignalScoutTick(env(), db.asD1(), NOW, { ...NO_WAIT, fetchText: stubFetch({}, calls) });

  const target = (await store.getTargetBySlug(ORG, 'uzbek_digital_market'))!;
  // The decisive evidence: no join was recorded, so the group is untouched.
  assert.equal(target.joinedAt, null);
  assert.equal(target.joinAttempts, 0);
  assert.equal(target.status, 'watching');
  // And no Telegram API surface was reached — the scout only ever reads the web.
  assert.equal(calls.some((url) => !url.startsWith('https://t.me/s/') && !url.includes('tgstat')), false);
});

test('a tick stays inside its bounded envelope', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  const html = withMessageTexts(fixture('fx-channel.html'), ['Нужен сайт-визитка под ключ, писать в личку']);

  // Far more due candidates than one tick is allowed to fetch.
  for (let i = 0; i < SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick + 12; i += 1) {
    await store.upsertTarget(ORG, { slug: `channel_number_${i}`, kind: 'channel', status: 'candidate' });
  }

  let fetches = 0;
  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: async (url) => {
      fetches += 1;
      return url.includes('t.me/s/') ? html : null;
    },
  });

  assert.equal(report.scouted, SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick);
  assert.ok(fetches <= SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick + 2,
    `expected a bounded tick, saw ${fetches} fetches`);
});
