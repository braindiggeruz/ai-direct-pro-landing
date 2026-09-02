/**
 * Ф5 — the expandable lead card: full text, why it scored, source link.
 *
 * The card is expanded in place rather than routed to its own page, so the
 * raw post is fetched on demand. That matters for privacy as much as for
 * speed: the post table is the only place a stranger's own words live at
 * length, and it is purged after seven days while the lead survives. Both
 * halves of that are tested here.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runSignalScoutTick, type SignalScoutDeps } from '../functions/platform/lead-radar/signal-scout';
import { SignalRadarStore } from '../functions/platform/lead-radar/signal-store';
import { SqliteD1 } from './helpers/sqlite-d1';
import { applySignalMigrations } from './helpers/signal-schema';
import {
  detectSignalLanguage,
  SIGNAL_LANGUAGE_LABELS,
} from '../src/shared/signal-radar';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG = 'owner_8ee98dc3040f160b308166b0';
const NOW = new Date('2026-09-02T09:00:00.000Z');

const fixture = (name: string): string =>
  readFileSync(path.join(ROOT, 'tests/fixtures/signal-radar', name), 'utf8');

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

function withMessageTexts(html: string, texts: string[]): string {
  const pattern = /(<div class="tgme_widget_message_text[^>]*dir="auto">)([\s\S]*?)(<\/div>)/g;
  let index = 0;
  return html.replace(pattern, (_all, open: string, _body: string, close: string) => {
    const text = texts[index] ?? texts[texts.length - 1] ?? '';
    index += 1;
    return `${open}${text}${close}`;
  });
}

const NO_WAIT: SignalScoutDeps = { sleep: async () => {} };

/** A channel with one real demand post, scouted into a lead. */
async function seeded(db: SqliteD1, text: string): Promise<SignalRadarStore> {
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'toshkent_ish', kind: 'channel', status: 'candidate' });
  await runSignalScoutTick(
    { LEAD_RADAR_SIGNAL_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: ORG } as never,
    db.asD1(), NOW,
    { ...NO_WAIT, fetchText: async (url) => (url.includes('t.me/s/')
      ? withMessageTexts(fixture('fx-channel.html'), [text])
      : null) },
  );
  return store;
}

const DEMAND = 'Ищу исполнителя: нужен чат-бот для записи клиентов в Telegram. Бюджет обсудим. Пишите @alex';

/* ══════════════════════════════════════════════════════════════════ *
 * The raw post behind a lead
 * ══════════════════════════════════════════════════════════════════ */

test('the detail read returns the whole post, not just the quote', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = await seeded(db, DEMAND);

  const leads = await store.listLeads(ORG, { limit: 5 });
  assert.equal(leads.length, 1);
  const post = await store.getPost(ORG, leads[0].postId);

  assert.ok(post, 'the post must still be inside its retention window');
  assert.equal(post.excerpt.startsWith('Ищу исполнителя'), true, post.excerpt);
  assert.equal(post.occurredAt.length > 0, true);
  assert.equal(post.service, 'bots');
  assert.ok(post.score > 0);
  // Reasons are shown so the operator can disagree with the machine.
  assert.ok(post.reasons.length > 0, 'triage reasons must reach the UI');
  assert.ok(post.reasons.every((reason) => typeof reason === 'string'));
});

test('posts are stamped with the tick clock, not the wall clock', async (t) => {
  // This is why the purge test below is deterministic. When the scout wrote
  // `created_at = new Date()`, retention was measured against an injected
  // timestamp and the test silently became a race with the real clock — it
  // passed until the wall clock overtook the fixture, then failed for no
  // reason anyone could see. One tick, one clock, forever.
  const db = signalDb();
  t.after(() => db.sqlite.close());
  await seeded(db, DEMAND);

  const row = db.sqlite
    .prepare('SELECT created_at FROM lead_radar_signal_posts')
    .get() as { created_at: string } | undefined;
  assert.equal(row?.created_at, NOW.toISOString());
});

test('a lead whose post was purged reports null instead of an empty box', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = await seeded(db, DEMAND);
  const leads = await store.listLeads(ORG, { limit: 5 });

  await store.purgePostsOlderThan(ORG, new Date(NOW.getTime() + 1000).toISOString());

  const post = await store.getPost(ORG, leads[0].postId);
  assert.equal(post, null, 'retention must be visible to the UI as absence, not emptiness');
  // The lead itself survives, with its quote intact — that is the point.
  const survivor = (await store.listLeads(ORG, { limit: 5 }))[0];
  assert.equal(survivor.id, leads[0].id);
  assert.equal(survivor.quote.includes('чат-бот'), true);
});

test('a post from another organization is never readable', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = await seeded(db, DEMAND);
  const leads = await store.listLeads(ORG, { limit: 5 });

  const other = 'owner_999999999999999999999999';
  assert.equal(await store.getPost(other, leads[0].postId), null);
  assert.equal(await store.getLead(other, leads[0].id), null);
});

test('a corrupt reasons column degrades to an empty list, not a 500', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = await seeded(db, DEMAND);
  const leads = await store.listLeads(ORG, { limit: 5 });

  // The migration CHECKs reasons_json into a valid array, so this row can only
  // exist if it was written before that constraint or imported by hand. That is
  // exactly the row a JSON.parse in the read path would throw on, so the pragma
  // is how the guard gets exercised rather than assumed.
  db.sqlite.exec('PRAGMA ignore_check_constraints=ON');

  db.exec(`UPDATE lead_radar_signal_posts SET reasons_json = 'not json'
           WHERE id = '${leads[0].postId}'`);
  const post = await store.getPost(ORG, leads[0].postId);
  assert.deepEqual(post?.reasons, []);

  db.exec(`UPDATE lead_radar_signal_posts SET reasons_json = '[1,"ok",null]'
           WHERE id = '${leads[0].postId}'`);
  const filtered = await store.getPost(ORG, leads[0].postId);
  assert.deepEqual(filtered?.reasons, ['ok'], 'non-strings are dropped, not stringified');
});

/* ══════════════════════════════════════════════════════════════════ *
 * Language — derived, never asserted as fact
 * ══════════════════════════════════════════════════════════════════ */

test('Cyrillic reads as Russian, Latin as Uzbek', () => {
  assert.equal(detectSignalLanguage('Нужен чат-бот для записи клиентов в Telegram'), 'ru');
  assert.equal(detectSignalLanguage('Telegram uchun chat-bot kerak, yozing'), 'uz');
});

test('a genuine mix is unknown rather than a coin flip', () => {
  assert.equal(detectSignalLanguage('Нужен chat-bot kerak'), 'unknown');
});

test('too little text to tell is unknown', () => {
  assert.equal(detectSignalLanguage('бот'), 'unknown');
  assert.equal(detectSignalLanguage(''), 'unknown');
});

test('every verdict has a label the UI can print', () => {
  assert.deepEqual(
    ['ru', 'uz', 'unknown'].map((key) => SIGNAL_LANGUAGE_LABELS[key as 'ru' | 'uz' | 'unknown']),
    ['русский', 'узбекский', 'не определён'],
  );
});

/* ══════════════════════════════════════════════════════════════════ *
 * Wiring locks for the expanded card and its endpoint
 * ══════════════════════════════════════════════════════════════════ */

const apiSource = readFileSync(
  path.join(ROOT, 'functions/api/admin/signal-radar/[[path]].ts'), 'utf8');
const pageSource = readFileSync(
  path.join(ROOT, 'src/admin/pages/SignalRadar.tsx'), 'utf8');
const clientSource = readFileSync(path.join(ROOT, 'src/admin/lib/api.ts'), 'utf8');

test('GET /leads/:id joins the post and honours the id contract', () => {
  assert.match(apiSource, /parts\.length === 2 && parts\[0\] === 'leads'/);
  assert.match(apiSource, /if \(!signalLeadId\(parts\[1\]\)\) return ownerError\('invalid_id'/);
  assert.match(apiSource, /store\.getPost\(orgId, lead\.postId\)/);
  assert.match(apiSource, /ownerJson\(\{ lead, post \} satisfies SignalLeadDetail/);
});

test('the card expands in place and fetches the post only when asked', () => {
  for (const id of [
    'signal-lead-expand', 'signal-lead-detail', 'signal-lead-fulltext',
    'signal-lead-reopen', 'signal-lead-language', 'signal-lead-handoff',
  ]) {
    assert.match(pageSource, new RegExp(`data-testid="${id}"`), id);
  }
  assert.match(pageSource, /api\.signalRadarLead\(lead\.id\)/);
  // The raw text is not in the overview payload, so it is not in the list call.
  assert.match(clientSource, /signalRadarLead: \(id: string/);
});

test('a purged post is explained, not rendered as an empty panel', () => {
  assert.match(pageSource, /Полный текст уже удалён по сроку хранения/);
});

test('the card states only the history it actually has', () => {
  // There is no state-history table. Anything beyond created/updated would be
  // invented, so the card must not imply a timeline it cannot produce.
  assert.match(pageSource, /Создано \{new Date\(lead\.createdAt\)/);
  assert.match(pageSource, /lead\.updatedAt !== lead\.createdAt/);
  assert.doesNotMatch(pageSource, /auditTrail|stateHistory|state_history|истори[яи]/i);
});
