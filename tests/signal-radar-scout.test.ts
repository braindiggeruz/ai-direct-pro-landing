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
import { applySignalMigrations } from './helpers/signal-schema';

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
  applySignalMigrations(db);
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

/**
 * Rewrite the subscriber counter. Not decoration: the member count is worth up
 * to 20 points of the 40 that promote a candidate, so a small number here is
 * the difference between a channel the scout watches and one it keeps waiting.
 */
function withSubscribers(html: string, value: string): string {
  // A function, not `$1${value}$2`: with a numeric value that string reads as
  // a group reference two digits long and silently replaces nothing.
  return html.replace(
    /(<span class="counter_value">)[^<]*(<\/span> <span class="counter_type">subscribers<)/g,
    (_all, open: string, close: string) => `${open}${value}${close}`,
  );
}

const NO_WAIT: SignalScoutDeps = { sleep: async () => {} };

/**
 * Give every message block a different author. The fixture is a real broadcast
 * and carries one owner name throughout, which is the whole thing we are
 * measuring — so a room has to be built, not found.
 */
function withAuthors(html: string, authors: string[]): string {
  // Anchored on the owner-name link: a bare `<span dir="auto">` also appears
  // in the page header, and matching there eats the first message with it.
  const pattern = /(<a class="tgme_widget_message_owner_name"[^>]*><span dir="auto">)([\s\S]*?)(<\/span><\/a>)/g;
  let index = 0;
  return html.replace(pattern, (_all, open: string, _name: string, close: string) => {
    const author = authors[index] ?? authors[authors.length - 1] ?? 'Someone';
    index += 1;
    return `${open}${author}${close}`;
  });
}

/** Ordinary posts: real words, no request in them, three different texts. */
const CHATTER = [
  'Salom, hammaga yaxshi kun',
  'Bugun ob-havo yaxshi boladi',
  'Kanalimizga obuna boling',
];

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

test('due work outranks good-looking work when slotting a tick', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  // Same status, three different obligations: never checked, late, and not
  // even owed yet. Ranking these by score would always reward the channel we
  // already understand and starve the one we have never read.
  for (const [slug, nextActionAt] of [
    ['polled_recently', new Date(NOW.getTime() + 3_600_000).toISOString()],
    ['polled_late', new Date(NOW.getTime() - 3_600_000).toISOString()],
    ['never_checked', null],
  ] as const) {
    await store.upsertTarget(ORG, { slug, kind: 'channel', status: 'candidate', score: 42 });
    if (nextActionAt) {
      await store.updateTarget(ORG, (await store.getTargetBySlug(ORG, slug))!.id,
        { next_action_at: nextActionAt });
    }
  }

  const order = await store.listTargets(ORG, { limit: 10, orderBy: 'due', now: NOW.toISOString() });
  assert.deepEqual(order.map((target) => target.slug),
    ['never_checked', 'polled_late', 'polled_recently']);
});

test('a never-scored candidate is reconnoitred before a high-scoring watched channel', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  const html = withMessageTexts(fixture('fx-channel.html'), ['Нужен сайт-визитка под ключ, писать в личку']);

  // The production shape that locked discovery for a whole day: eight watched
  // channels are due and score 48-55, while a freshly discovered candidate
  // scores 0 and has never been read. Under `ORDER BY score DESC` the watched
  // channels take every slot, so the candidate is never returned, never read,
  // never scored — and never leaves the pool to make room for another.
  for (let i = 0; i < SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick; i += 1) {
    const slug = `watched_channel_${i}`;
    await store.upsertTarget(ORG, { slug, kind: 'channel', status: 'watching', score: 48 + i });
    await store.updateTarget(ORG, (await store.getTargetBySlug(ORG, slug))!.id,
      { next_action_at: NOW.toISOString() });
  }
  await store.upsertTarget(ORG, { slug: 'fresh_candidate', kind: 'channel', status: 'candidate' });

  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: async (url) => (url.includes('t.me/s/') ? html : null),
  });

  const fresh = (await store.getTargetBySlug(ORG, 'fresh_candidate'))!;
  assert.equal(fresh.messagesSeen > 0, true, 'the new channel must be read, not starved');
  assert.equal(fresh.nextActionAt !== null, true, 'after recon it owns a revisit date');
  assert.equal(fresh.score > 0, true, 'and it carries a score, so it stops looking unexplored');
});

test('discovery refills a pool that is full of channels we have already read', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  // Twenty-five candidates, every single one reconnoitered and rejected in an
  // earlier tick. A trigger that counts *candidates* sees a comfortable pool
  // above the refill threshold and stays silent forever; only the count of
  // never-checked channels tells the truth, and it is zero.
  for (let i = 0; i < SIGNAL_SCOUT_LIMITS.discoverWhenCandidatesBelow + 5; i += 1) {
    const slug = `reconnoitred_${i}`;
    await store.upsertTarget(ORG, { slug, kind: 'channel', status: 'candidate', score: 3 });
    await store.updateTarget(ORG, (await store.getTargetBySlug(ORG, slug))!.id,
      { next_action_at: new Date(NOW.getTime() + 3_600_000).toISOString() });
  }
  assert.equal(await store.countFreshCandidates(ORG, 50), 0);

  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 'uz.tgstat.com/ratings/channels': fixture('fx-tgstat.html') }),
  });

  assert.equal(report.discovered > 0, true, 'a pool we have already read is not a full pool');
  assert.equal(await store.countFreshCandidates(ORG, 50) > 0, true);
});

test('a candidate with no posts is retired; a quiet one is not, and notes survive', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  await store.upsertTarget(ORG, { slug: 'silent_channel', kind: 'channel', status: 'candidate' });
  await store.upsertTarget(ORG, {
    slug: 'quiet_channel',
    kind: 'channel',
    status: 'candidate',
    note: 'проверить вручную',
  });

  const calls: string[] = [];
  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({
      // Empty bodies: the parser drops a message with no text, so the preview
      // yields zero posts without the page being a noindex dead end.
      't.me/s/silent_channel': withMessageTexts(fixture('fx-channel.html'), []),
      // A channel with real posts, none of them a request, and too few
      // subscribers to earn the promotion bonus.
      't.me/s/quiet_channel': withSubscribers(
        withMessageTexts(fixture('fx-channel.html'),
          ['Hello everyone and welcome to the channel']),
        '42',
      ),
    }, calls),
  });
  assert.equal(calls.filter((url) => url.includes('silent_channel')).length, 1);

  // An empty preview is dead weight that competes for preview slots with
  // channels nobody has ever looked at. Retire it, and say why.
  const silent = (await store.getTargetBySlug(ORG, 'silent_channel'))!;
  assert.equal(silent.status, 'ignored');
  assert.equal(silent.note, 'пусто: ни одного поста в превью');

  // A low score is not emptiness. Language detection on a short preview is
  // unreliable, so dropping a real Uzbek channel we failed to classify would
  // cost more than re-reading it — and the operator's note is not ours to wipe.
  const quiet = (await store.getTargetBySlug(ORG, 'quiet_channel'))!;
  assert.equal(quiet.status, 'candidate');
  assert.equal(quiet.note, 'проверить вручную');
  assert.ok(quiet.score < 40, `expected a low score, got ${quiet.score}`);
  assert.equal(quiet.nextActionAt !== null, true);
});

test('a channel that has stopped paying out is read less often, then retired', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  // Three *different* neutral posts, so the dedup key does not collapse them:
  // the counter has to move by what the preview actually handed over.
  const html = withMessageTexts(fixture('fx-channel.html'), CHATTER);

  // A watched channel one preview short of the quiet threshold. It has given
  // us nothing and it is about to be given one more chance to be interesting.
  await store.upsertTarget(ORG, {
    slug: 'loud_but_empty',
    kind: 'channel',
    status: 'watching',
    score: 55,
    members: 500_000,
  });
  await store.updateTarget(ORG, (await store.getTargetBySlug(ORG, 'loud_but_empty'))!.id, {
    messages_seen: SIGNAL_SCOUT_LIMITS.quietAfterMessages - 3,
    next_action_at: NOW.toISOString(),
  });

  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: async (url) => (url.includes('t.me/s/') ? html : null),
  });
  assert.equal(report.scouted, 1);
  assert.equal(report.leads, 0);

  const loud = (await store.getTargetBySlug(ORG, 'loud_but_empty'))!;
  assert.equal(loud.status, 'watching', 'not thrown away on one bad read');
  // But no longer polled every half hour: it keeps its place in the queue and
  // drifts to the back of it, so a real request months from now is still found
  // without costing every tick in the meantime.
  const delayHours = (Date.parse(loud.nextActionAt!) - NOW.getTime()) / 3_600_000;
  assert.ok(delayHours >= 3, `expected a multi-hour backoff, got ${delayHours}h`);
});

test('a channel that has given everything it has and none of it was a request is retired', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  const html = withMessageTexts(fixture('fx-channel.html'), CHATTER);

  await store.upsertTarget(ORG, {
    slug: 'spent_channel',
    kind: 'channel',
    status: 'watching',
    score: 55,
    members: 500_000,
  });
  await store.updateTarget(ORG, (await store.getTargetBySlug(ORG, 'spent_channel'))!.id, {
    messages_seen: SIGNAL_SCOUT_LIMITS.retireAfterMessages - 3,
    next_action_at: NOW.toISOString(),
  });

  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: async (url) => (url.includes('t.me/s/') ? html : null),
  });

  const spent = (await store.getTargetBySlug(ORG, 'spent_channel'))!;
  assert.equal(spent.status, 'ignored');
  assert.match(spent.note ?? '', /ни одной заявки/, spent.note ?? '(no note)');
});

test('one request in one read is not enough to start polling a channel', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  // One request buried in a broadcast feed, with two ordinary posts either
  // side of it. This is the exact shape that promoted eight news channels:
  // a single match in a half-million-subscriber feed, promoted on the spot.
  const html = withMessageTexts(fixture('fx-channel.html'),
    ['Menga sayt kerak, yordam bera olasizmi?', ...CHATTER.slice(0, 2)]);
  await store.upsertTarget(ORG, { slug: 'one_hit_wonder', kind: 'channel', status: 'candidate' });

  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/one_hit_wonder': withSubscribers(html, '500000') }),
  });
  assert.equal(report.leads, 1, 'the lead is still written — the inbox loses nothing');

  const target = (await store.getTargetBySlug(ORG, 'one_hit_wonder'))!;
  assert.equal(target.status, 'candidate', 'but the channel does not earn a slot yet');
  assert.ok(target.score < 40, `expected below the promote bar, got ${target.score}`);

  // And the mirror image: a small channel where people actually talk is
  // promoted on its first read, because there is no reason to wait.
  await store.upsertTarget(ORG, { slug: 'small_room', kind: 'channel', status: 'candidate' });
  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({
      't.me/s/small_room': withAuthors(
        withSubscribers(
          withMessageTexts(fixture('fx-channel.html'),
            ['Menga sayt kerak, yordam bera olasizmi?', ...CHATTER.slice(0, 2)]),
          '500',
        ),
        ['Alisher', 'Dilnoza', 'Jasur'],
      ),
    }),
  });
  const room = (await store.getTargetBySlug(ORG, 'small_room'))!;
  assert.equal(room.status, 'watching', 'one request in a real room is worth a slot');
});

// ---------------------------------------------------------------------------
// Discovery has to survive the ranking going away. tgstat started answering
// /ratings/channels with HTTP 200 and an "authorization required" page on
// 2026-09-02, which parses to zero entities and used to look exactly like a
// healthy quiet tick.
// ---------------------------------------------------------------------------

test('an empty ranking page is reported, not mistaken for a quiet country', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());

  // A page that arrives, says nothing, and is not an error in any HTTP sense.
  const report = await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 'uz.tgstat.com/ratings/channels': '<html><body>Kirish</body></html>' }),
  });

  assert.equal(report.discovered, 0);
  assert.ok(report.skipped.includes('discovery:tgstat:empty'), report.skipped.join(','));
});

test('when the ranking is silent, a good channel recommends its neighbours', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  // A room worth watching whose posts point at two other channels. The link
  // graph is the only discovery source left that costs no extra request.
  const html = withMessageTexts(
    fixture('fx-channel.html'),
    ['Menga sayt kerak, yordam bera olasizmi?', ...CHATTER.slice(0, 2)],
  ).replace(
    '</body>',
    '<div>см. также https://t.me/uzb_dev и https://t.me/tashkent_work</div></body>',
  );
  const good = withAuthors(withSubscribers(html, '500'), ['Alisher', 'Dilnoza', 'Jasur']);
  await store.upsertTarget(ORG, { slug: 'small_room', kind: 'channel', status: 'candidate' });

  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/small_room': good }),
  });

  // The recommendation only counts if we decided the channel was worth it.
  const room = (await store.getTargetBySlug(ORG, 'small_room'))!;
  assert.equal(room.status, 'watching', `${room.status} @ ${room.score}`);

  const neighbourhood = (await store.listTargets(ORG, { limit: 100 })).map((target) => target.slug);
  assert.ok(neighbourhood.includes('uzb_dev'), neighbourhood.join(','));
  assert.ok(neighbourhood.includes('tashkent_work'), neighbourhood.join(','));
});

test('a channel we did not promote is not allowed to recommend anything', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());

  // Same links, same page, but the channel is a half-million broadcast: it
  // links to other broadcasts, and letting it seed the pool is how a radar
  // ends up reading nothing but news.
  const html = withMessageTexts(fixture('fx-channel.html'), CHATTER).replace(
    '</body>',
    '<div>https://t.me/uzb_dev и https://t.me/tashkent_work</div></body>',
  );
  await store.upsertTarget(ORG, { slug: 'big_feed', kind: 'channel', status: 'candidate' });

  await runSignalScoutTick(env(), db.asD1(), NOW, {
    ...NO_WAIT,
    fetchText: stubFetch({ 't.me/s/big_feed': withSubscribers(html, '500000') }),
  });

  const feed = (await store.getTargetBySlug(ORG, 'big_feed'))!;
  assert.ok(feed.score < 40, `expected below the promote bar, got ${feed.score}`);
  const slugs = (await store.listTargets(ORG, { limit: 100 })).map((target) => target.slug);
  assert.equal(slugs.includes('uzb_dev'), false, slugs.join(','));
  assert.equal(slugs.includes('tashkent_work'), false, slugs.join(','));
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
