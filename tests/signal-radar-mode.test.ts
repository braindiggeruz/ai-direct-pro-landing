/**
 * Signal Radar Ф3 — runtime mode and manual scan.
 *
 * The whole point of this file is one guarantee: the admin UI and the cron
 * worker read the mode from the same resolver, so they can never disagree.
 * Before this existed the API parsed the env var inline and the worker parsed
 * it again in `planJoins` — two copies that could drift, on the one knob that
 * controls whether a real Telegram account joins stranger groups.
 *
 * The second guarantee is that a manual scan is a *message*, not a network
 * call: Pages functions get ~30 ms of CPU, a Telegram preview costs seconds.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSignalMode,
  readSignalScanCursor,
  resolveSignalMode,
  signalScanStatusFor,
  writeSignalMode,
  writeSignalScanCursor,
} from '../functions/platform/lead-radar/signal-mode';
import { runSignalScoutTick, type SignalScoutDeps } from '../functions/platform/lead-radar/signal-scout';
import { SignalRadarStore } from '../functions/platform/lead-radar/signal-store';
import { SqliteD1 } from './helpers/sqlite-d1';
import { applySignalMigrations } from './helpers/signal-schema';
import {
  parseSignalScanQueueMessage,
  signalScanCursorKey,
  signalScanQueueMessage,
  signalScanStatus,
  SIGNAL_MODE_SETTING_KEY,
  SIGNAL_SCAN_COOLDOWN_MS,
  SIGNAL_SCAN_QUEUE_SCHEMA,
  type SignalScanCursor,
} from '../src/shared/signal-radar';

const ORG = 'owner_8ee98dc3040f160b308166b0';
const OTHER_ORG = 'owner_111111111111111111111111';
const NOW = new Date('2026-09-02T09:00:00.000Z');
const NOW_MS = NOW.getTime();

/** Migration 0057 (Signal Radar) plus migration 0003's `system_settings`. */
function signalDb(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    updated_by  TEXT
  )`);
  applySignalMigrations(db);
  return db;
}

/** Migration 0057 only — the state of a tenant that never ran 0003's table. */
function dbWithoutSettings(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  applySignalMigrations(db);
  return db;
}

/** Writes a mode row the way an older deploy or a human hand-edit might. */
function seedMode(db: SqliteD1, valueJson: string, updatedAt = '2026-09-01T10:00:00.000Z'): void {
  db.exec(`INSERT INTO system_settings(key, value_json, updated_at, updated_by)
           VALUES ('${SIGNAL_MODE_SETTING_KEY}', '${valueJson.replace(/'/g, "''")}',
                   '${updatedAt}', 'owner@gptbot.uz')`);
}

/* ══════════════════════════════════════════════════════════════════ *
 * resolveSignalMode — the precedence ladder
 * ══════════════════════════════════════════════════════════════════ */

test('the database setting outranks the deploy-time env var', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  seedMode(db, '{"mode":"off"}');

  const state = await resolveSignalMode(db.asD1(), { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'join' });
  assert.equal(state.mode, 'off', 'the operator word must win over the config');
  assert.equal(state.source, 'setting');
  assert.equal(state.updatedAt, '2026-09-01T10:00:00.000Z');
});

test('with no setting the env var decides, and says so', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());

  const state = await resolveSignalMode(db.asD1(), { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'channels' });
  assert.deepEqual(state, { mode: 'channels', source: 'env', updatedAt: null });
});

test('with neither, the built-in default is `discover`', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());

  const state = await resolveSignalMode(db.asD1(), {});
  assert.deepEqual(state, { mode: 'discover', source: 'default', updatedAt: null });
});

test('a missing `system_settings` table falls through instead of throwing', async (t) => {
  const db = dbWithoutSettings();
  t.after(() => db.sqlite.close());

  // A pre-0003 tenant must not lose its radar because of a mode lookup.
  const state = await resolveSignalMode(db.asD1(), { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'join' });
  assert.deepEqual(state, { mode: 'join', source: 'env', updatedAt: null });
});

test('a missing database binding still resolves', async () => {
  const state = await resolveSignalMode(undefined, { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'off' });
  assert.deepEqual(state, { mode: 'off', source: 'env', updatedAt: null });
});

test('a corrupt setting is ignored rather than coerced into a real mode', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  // "maybe" is not a mode. Guessing `discover` here would silently un-stop a
  // radar the operator may have meant to stop.
  for (const bad of ['"maybe"', '{"mode":"sometimes"}', 'not json at all', '42', 'null', '[]']) {
    db.exec('DELETE FROM system_settings');
    seedMode(db, bad);
    const state = await resolveSignalMode(db.asD1(), { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'channels' });
    assert.equal(state.mode, 'channels', bad);
    assert.equal(state.source, 'env', bad);
  }
});

test('a bare string setting is accepted for backwards compatibility', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  seedMode(db, '"join"');

  const state = await resolveSignalMode(db.asD1(), {});
  assert.deepEqual(state, { mode: 'join', source: 'setting', updatedAt: '2026-09-01T10:00:00.000Z' });
});

test('writing the mode makes it the authority, and clearing hands it back', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());

  const written = await writeSignalMode(db.asD1(), 'channels', 'owner@gptbot.uz');
  assert.equal(written.mode, 'channels');
  assert.equal(written.source, 'setting');
  assert.ok(written.updatedAt);

  let state = await resolveSignalMode(db.asD1(), { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'off' });
  assert.equal(state.mode, 'channels');

  await clearSignalMode(db.asD1());
  state = await resolveSignalMode(db.asD1(), { LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'off' });
  assert.deepEqual(state, { mode: 'off', source: 'env', updatedAt: null });
});

test('the stored row records who changed it', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  await writeSignalMode(db.asD1(), 'join', 'owner@gptbot.uz');

  const row = db.rows<{ key: string; value_json: string; updated_by: string | null }>(
    'SELECT key, value_json, updated_by FROM system_settings WHERE key = ?',
    SIGNAL_MODE_SETTING_KEY,
  )[0];
  assert.equal(row.key, SIGNAL_MODE_SETTING_KEY);
  assert.deepEqual(JSON.parse(row.value_json), { mode: 'join' });
  assert.equal(row.updated_by, 'owner@gptbot.uz');
});

/* ══════════════════════════════════════════════════════════════════ *
 * The scout obeys the resolved mode — the drift guard
 * ══════════════════════════════════════════════════════════════════ */

const NO_WAIT: SignalScoutDeps = { sleep: async () => {} };

async function scoutCalls(
  db: SqliteD1,
  env: Record<string, string>,
  options: Parameters<typeof runSignalScoutTick>[4] = {},
): Promise<string[]> {
  const calls: string[] = [];
  await runSignalScoutTick(
    { LEAD_RADAR_SIGNAL_ENABLED: 'true', ...env } as never,
    db.asD1(), NOW,
    { ...NO_WAIT, fetchText: async (url: string) => { calls.push(url); return null; } },
    options,
  );
  return calls;
}

test('mode `off` is a hard stop even when the module itself is enabled', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  seedMode(db, '{"mode":"off"}');
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'toshkent_ish', kind: 'channel', status: 'candidate' });

  const calls = await scoutCalls(db, { LEAD_RADAR_ALLOWED_ORGS: ORG, LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'join' });
  assert.deepEqual(calls, [], 'off must beat both ENABLED=true and the env var');
});

test('the worker reads the same setting the UI writes, not the env var', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  // The env says `discover`; the operator flipped it to `off` from the page.
  seedMode(db, '{"mode":"off"}');
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'toshkent_ish', kind: 'channel', status: 'candidate' });

  const calls = await scoutCalls(db, {
    LEAD_RADAR_ALLOWED_ORGS: ORG,
    LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'discover',
  });
  assert.deepEqual(calls, [], 'the worker must never re-parse the env var on its own');
});

test('mode `off` set from the UI survives an env var that says otherwise', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  await writeSignalMode(db.asD1(), 'off', 'owner@gptbot.uz');
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'toshkent_ish', kind: 'channel', status: 'candidate' });

  const calls = await scoutCalls(db, {
    LEAD_RADAR_ALLOWED_ORGS: ORG,
    LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: 'channels',
  });
  assert.deepEqual(calls, []);
});

test('a manual scan ignores the polling date, which is what makes the button useful', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  // Due only tomorrow: a cron tick would skip it, a human asked for it now.
  const target = await store.upsertTarget(ORG, { slug: 'toshkent_ish', kind: 'channel', status: 'watching' });
  await store.updateTarget(ORG, target.id, {
    next_action_at: new Date(NOW_MS + 86_400_000).toISOString(),
  });

  const cronCalls = await scoutCalls(db, { LEAD_RADAR_ALLOWED_ORGS: ORG });
  assert.equal(cronCalls.some((url) => url.includes('toshkent_ish')), false,
    'cron must stay polite');

  const forced = await scoutCalls(db, { LEAD_RADAR_ALLOWED_ORGS: ORG }, { force: true });
  assert.equal(forced.some((url) => url.includes('toshkent_ish')), true,
    'the button must do something');
});

test('a manual scan is scoped to the requesting organization', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'mine_channel', kind: 'channel', status: 'watching' });
  await store.upsertTarget(OTHER_ORG, { slug: 'theirs_channel', kind: 'channel', status: 'watching' });

  const calls = await scoutCalls(
    db,
    { LEAD_RADAR_ALLOWED_ORGS: `${ORG},${OTHER_ORG}` },
    { force: true, orgId: ORG },
  );
  assert.equal(calls.some((url) => url.includes('mine_channel')), true);
  assert.equal(calls.some((url) => url.includes('theirs_channel')), false,
    'one operator pressing a button must not scan another tenant');
});

test('a manual scan for an org outside the allowlist does nothing', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(OTHER_ORG, { slug: 'theirs_channel', kind: 'channel', status: 'watching' });

  const report = await runSignalScoutTick(
    { LEAD_RADAR_SIGNAL_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: ORG } as never,
    db.asD1(), NOW, NO_WAIT,
    { force: true, orgId: OTHER_ORG },
  );
  assert.deepEqual(report.skipped, ['org_not_allowed']);
  assert.equal(report.scouted, 0);
});

test('in `channels` mode already-watched channels are read before new ones', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  seedMode(db, '{"mode":"channels"}');
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'watched_one', kind: 'channel', status: 'watching', score: 10 });
  await store.upsertTarget(ORG, { slug: 'fresh_candidate', kind: 'channel', status: 'candidate', score: 99 });

  const calls = await scoutCalls(db, { LEAD_RADAR_ALLOWED_ORGS: ORG }, { force: true });
  assert.equal(calls[0].includes('watched_one'), true,
    'polling outranks recon when the operator asked for channel reading');
});

test('in `discover` mode new candidates are reconnoitred first', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  seedMode(db, '{"mode":"discover"}');
  const store = new SignalRadarStore(db.asD1());
  await store.upsertTarget(ORG, { slug: 'watched_one', kind: 'channel', status: 'watching', score: 99 });
  await store.upsertTarget(ORG, { slug: 'fresh_candidate', kind: 'channel', status: 'candidate', score: 10 });

  const calls = await scoutCalls(db, { LEAD_RADAR_ALLOWED_ORGS: ORG }, { force: true });
  assert.equal(calls[0].includes('fresh_candidate'), true);
});

/* ══════════════════════════════════════════════════════════════════ *
 * Manual-scan cooldown and the queue envelope
 * ══════════════════════════════════════════════════════════════════ */

test('the cooldown cursor is per organization', () => {
  assert.equal(signalScanCursorKey(ORG), `signal_radar_scan_cursor:${ORG}`);
  assert.notEqual(signalScanCursorKey(ORG), signalScanCursorKey(OTHER_ORG));
});

test('a cursor round-trips through D1 and paces the next request', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const at = new Date(NOW_MS).toISOString();
  await writeSignalScanCursor(db.asD1(), ORG, { at, by: 'owner@gptbot.uz' });

  const stored = await readSignalScanCursor(db.asD1(), ORG);
  assert.deepEqual(stored, { at, by: 'owner@gptbot.uz' });

  const mine = await signalScanStatusFor(db.asD1(), ORG, NOW_MS);
  const theirs = await signalScanStatusFor(db.asD1(), OTHER_ORG, NOW_MS);
  assert.equal(mine.queued, true, 'a fresh request is inside its own cooldown');
  assert.equal(theirs.queued, false, 'one tenant must not block another');
});

test('the cooldown expires exactly on schedule', () => {
  const at = new Date(NOW_MS).toISOString();
  const cursor: SignalScanCursor = { at, by: null };
  assert.equal(signalScanStatus(cursor, NOW_MS + SIGNAL_SCAN_COOLDOWN_MS - 1).queued, true);
  assert.equal(signalScanStatus(cursor, NOW_MS + SIGNAL_SCAN_COOLDOWN_MS).queued, false);
  assert.equal(signalScanStatus(null, NOW_MS).queued, false);
  assert.equal(signalScanStatus(null, NOW_MS).nextAvailableAt, null);
});

test('an idle scan status carries the window the UI counts down with', async (t) => {
  const db = signalDb();
  t.after(() => db.sqlite.close());
  const status = await signalScanStatusFor(db.asD1(), ORG, NOW_MS);
  assert.deepEqual(status, {
    queued: false,
    lastRequestedAt: null,
    nextAvailableAt: null,
    cooldownMs: SIGNAL_SCAN_COOLDOWN_MS,
  });
});

test('the scan envelope is self-validating and refuses a bad org id', () => {
  const message = signalScanQueueMessage({
    orgId: ORG,
    requestedBy: 'owner@gptbot.uz',
    requestedAt: new Date(NOW_MS).toISOString(),
  });
  assert.deepEqual(message, {
    schema: SIGNAL_SCAN_QUEUE_SCHEMA,
    org_id: ORG,
    requested_by: 'owner@gptbot.uz',
    requested_at: new Date(NOW_MS).toISOString(),
  });
  assert.throws(
    () => signalScanQueueMessage({ orgId: 'not-an-org', requestedBy: 'x', requestedAt: '' }),
    /invalid_signal_scan_message/,
  );
});

test('the worker rejects anything that is not an exact scan envelope', () => {
  const good = signalScanQueueMessage({
    orgId: ORG, requestedBy: 'owner@gptbot.uz', requestedAt: new Date(NOW_MS).toISOString(),
  });
  assert.ok(parseSignalScanQueueMessage(good));
  // An extra key is a different contract, not a superset of this one.
  assert.equal(parseSignalScanQueueMessage({ ...good, extra: 1 }), null);
  assert.equal(parseSignalScanQueueMessage({ ...good, schema: 'gptbot.signal-radar.scan.v2' }), null);
  assert.equal(parseSignalScanQueueMessage({ ...good, org_id: 'nope' }), null);
  assert.equal(parseSignalScanQueueMessage({ ...good, requested_at: 'yesterday' }), null);
  assert.equal(parseSignalScanQueueMessage({ ...good, requested_at: undefined }), null);
  assert.equal(parseSignalScanQueueMessage(null), null);
  assert.equal(parseSignalScanQueueMessage([]), null);
});
