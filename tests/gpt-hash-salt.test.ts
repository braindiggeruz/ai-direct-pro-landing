// WP-07, decision L8: salted v2 hashes of IPs and bot pseudonyms from
// GPT_HASH_SALT_SINCE on, the rekey of everything stored before it, and
// session tokens that never depend on the salt.
// Run: node --import tsx --test tests/gpt-hash-salt.test.ts
//
// Real SQLite (tests/helpers/sqlite-d1.ts) behind the billing fixture. The
// expected hashes are computed with node:crypto, independently of hash.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { billingFixture } from './helpers/gpt-billing-fixture';
import type { SqliteD1 } from './helpers/sqlite-d1';
import { BILLING_ORG } from '../functions/lib/gpt-chat/billing-config';
import { maintainBilling } from '../functions/lib/gpt-chat/billing-maintenance-store';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { hashIp, hashToken, MIN_SALT_BYTES, resolveHashSalt, sha256Hex } from '../functions/lib/gpt-chat/hash';
import { IdentityStore } from '../functions/lib/gpt-chat/identity-store';
import { REKEY_BATCH, rekeySaltedHashes, TICK_ROWS } from '../functions/lib/gpt-chat/salt-rekey-store';
import { TurnStore } from '../functions/lib/gpt-chat/turn-store';
import { resolveTelegramConfig } from '../functions/lib/telegram/config';
import { ensureTelegramSchema } from '../functions/lib/telegram/schema';
import { pseudoUser } from '../functions/lib/telegram/store';
import { onRequestPost as sessionPost } from '../functions/api/gpt/session';
import { onRequestGet as historyGet } from '../functions/api/gpt/history';
import { onRequestPost as maintenance } from '../functions/api/internal/gpt-billing-maintenance';

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
type Env = Parameters<typeof resolveConfig>[0];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 2026-10-03 00:00 UTC (05:00 in Tashkent): the kind of instant the release picks. */
const SINCE = Date.UTC(2026, 9, 3);
const SINCE_ISO = '2026-10-03T00:00:00Z';
// Runtime-only, like every fixture secret here; never a deployed value.
const SALT = randomBytes(32).toString('hex');
const OTHER = 'other-org';
const IP = '203.0.113.7';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (value: string) => createHmac('sha256', SALT).update(value).digest('hex');
/** v2 of a legacy IP hash and of a legacy 32-char pseudonym. */
const v2Ip = (legacy: string) => `h2_${hmac(legacy)}`;
const v2Pseudo = (legacy: string) => `h2_${hmac(legacy).slice(0, 29)}`;
const legacyPseudo = (id: number) => sha(`tg:${id}`).slice(0, 32);
const iso = (ms: number) => new Date(ms).toISOString();
const salted = (since = SINCE_ISO) => ({ GPT_HASH_SALT: SALT, GPT_HASH_SALT_SINCE: since });
/** Rows as plain objects (node:sqlite returns null-prototype ones). */
const rows = (f: Fixture, sql: string, ...args: Array<string | number>) =>
  f.db.rows<Record<string, unknown>>(sql, ...args).map((row) => ({ ...row }));

test('a salt counts only with 32 bytes and an explicit UTC SINCE; a salt without SINCE warns once and stays legacy', async (t) => {
  // First test of the file: the warning is once per isolate.
  const warn = t.mock.method(console, 'warn', () => undefined);
  assert.deepEqual(resolveHashSalt({}), { hashSalt: '', hashSaltSince: null });
  assert.equal(resolveHashSalt({ GPT_HASH_SALT: 'x'.repeat(MIN_SALT_BYTES - 1) }).hashSalt, '');
  assert.equal(resolveHashSalt({ GPT_HASH_SALT: ` ${SALT}\n` }).hashSalt, SALT);
  for (const since of ['', '2026-10-03', '2026-10-03T00:00:00', '2026-10-03T05:00:00+05:00', 'tomorrow'])
    assert.equal(resolveHashSalt({ GPT_HASH_SALT: SALT, GPT_HASH_SALT_SINCE: since }).hashSaltSince, null, since);
  assert.equal(resolveHashSalt(salted()).hashSaltSince, SINCE);
  assert.equal(resolveHashSalt(salted('2026-10-03T00:00:00.000Z')).hashSaltSince, SINCE);

  const legacy = sha(IP);
  const noSince = resolveHashSalt({ GPT_HASH_SALT: SALT });
  assert.equal(await hashIp(IP, noSince, SINCE + DAY), legacy);
  assert.equal(await hashIp(IP, noSince, SINCE + 2 * DAY), legacy);
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments[0]),
    [JSON.stringify({ event: 'gpt_hash_salt_since_missing' })],
  );
  // A short salt is no salt at all: legacy, silently.
  const short = resolveHashSalt({ GPT_HASH_SALT: 'salt', GPT_HASH_SALT_SINCE: SINCE_ISO });
  assert.equal(await hashIp(IP, short, SINCE + DAY), legacy);
});

test('an IP hash is legacy sha256 before SINCE and h2_ + HMAC(salt, legacy) from SINCE on', async () => {
  const cfg = resolveConfig(salted() as Env);
  const legacy = sha(IP);
  assert.equal(await hashIp(IP, cfg, SINCE - 1), legacy);
  assert.equal(await hashIp(IP, cfg, SINCE), v2Ip(legacy));
  assert.equal(await hashIp(IP, cfg, SINCE + DAY), v2Ip(legacy));
  assert.match(v2Ip(legacy), /^h2_[0-9a-f]{64}$/);
  assert.equal(await hashIp(undefined, cfg, SINCE - 1), sha('unknown'));
  // Without a salt nothing changes: what production stored before WP-07.
  assert.equal(await hashIp(IP, resolveConfig({} as Env), SINCE + DAY), legacy);
});

test('a session token hash ignores the salt: sha256(token), byte for byte the pre-salt scheme', async () => {
  const token = `anon_${randomBytes(16).toString('hex')}`;
  assert.equal(await hashToken(token), sha(`${token}${''}`));
  assert.equal(await hashToken(token), await sha256Hex(token));
});

test('the bot pseudonym keeps 32 chars: legacy sha256("tg:"+id)[0:32], then h2_ + 29 hex of HMAC(salt, legacy)', async () => {
  const cfg = resolveTelegramConfig(salted() as Env);
  assert.equal(await pseudoUser(19, cfg, SINCE - 1), legacyPseudo(19));
  const v2 = await pseudoUser(19, cfg, SINCE);
  assert.equal(v2, v2Pseudo(legacyPseudo(19)));
  assert.equal(v2.length, 32);
  assert.notEqual(v2, await pseudoUser(20, cfg, SINCE));
  assert.equal(await pseudoUser(19, resolveTelegramConfig({} as Env), SINCE), legacyPseudo(19));
});

// ── The rekey ──────────────────────────────────────────────────────────────

const TABLES = [
  'gpt_turn_reservations',
  'gpt_limit_hits',
  'gpt_sessions',
  'telegram_events',
  'gpt_handoffs',
  'gpt_events',
  'gpt_usage_daily',
];

function dump(db: SqliteD1) {
  return Object.fromEntries(TABLES.map((table) => [table, db.rows(`SELECT * FROM ${table} ORDER BY rowid`)]));
}

function turn(f: Fixture, id: string, subject: string, ip: string, at: number, org = BILLING_ORG) {
  f.db
    .prepare(
      "INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,?,NULL,'done',?,?)",
    )
    .bind(org, id, subject, ip, at, at + 120_000)
    .runSync();
}

function session(f: Fixture, id: string, hashedIp: string | null, at: number) {
  f.db
    .prepare('INSERT INTO gpt_sessions (id, anon_token, hashed_ip, locale, created_at) VALUES (?,?,?,?,?)')
    .bind(id, sha(id), hashedIp, 'uz', iso(at))
    .runSync();
}

function limitHit(f: Fixture, day: string, reason: string, subject: string, n: number, at: number, org = BILLING_ORG) {
  f.db
    .prepare('INSERT INTO gpt_limit_hits(org_id,day,reason,tier,subject,n,first_at) VALUES(?,?,?,?,?,?,?)')
    .bind(org, day, reason, 'free', subject, n, at)
    .runSync();
}

/** Legacy acceptance query of the release, per table (plan WP-07). */
function legacyLeft(f: Fixture): Record<string, unknown> {
  const h2 = "NOT LIKE 'h2\\_%' ESCAPE '\\'";
  return {
    turnsIp: f.db.value(`SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND created_at<? AND ip_hash ${h2}`, BILLING_ORG, SINCE),
    turnsSubject: f.db.value(
      `SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND created_at<? AND subject ${h2} AND subject NOT LIKE 'acct\\_%' ESCAPE '\\'`,
      BILLING_ORG,
      SINCE,
    ),
    limitHits: f.db.value(
      `SELECT COUNT(*) FROM gpt_limit_hits WHERE org_id=? AND first_at<? AND subject ${h2} AND subject NOT LIKE 'acct\\_%' ESCAPE '\\'`,
      BILLING_ORG,
      SINCE,
    ),
    sessions: f.db.value(`SELECT COUNT(*) FROM gpt_sessions WHERE created_at<? AND hashed_ip ${h2}`, SINCE_ISO),
    telegram: f.db.value(`SELECT COUNT(*) FROM telegram_events WHERE created_at<? AND pseudo_user ${h2}`, SINCE_ISO),
    handoffs: f.db.value(`SELECT COUNT(*) FROM gpt_handoffs WHERE claimed_at<? AND claimed_by ${h2}`, SINCE_ISO),
    events: f.db.value(
      `SELECT COUNT(*) FROM gpt_events WHERE event_name='GPTChatHandoffClaimed' AND created_at<? AND json_extract(payload_json,'$.claimedBy') ${h2}`,
      SINCE_ISO,
    ),
    usage: f.db.value('SELECT COUNT(*) FROM gpt_usage_daily'),
  };
}

test('the rekey converts every legacy key written before SINCE exactly once, newest first, in bounded ticks; a rerun changes nothing', async () => {
  const f = await billingFixture();
  await ensureTelegramSchema(f.binding);
  const ips = Array.from({ length: 7 }, (_, i) => sha(`198.51.100.${i}`));

  // Turns: 250 anonymous (subject = IP hash) and one account turn, all before
  // SINCE; one v2 turn after it; one of another org.
  const seededTurns: Array<{ id: string; subject: string; ip: string; at: number }> = [];
  for (let i = 0; i < 250; i++) {
    const row = { id: `t${i}`, subject: ips[i % 7], ip: ips[i % 7], at: SINCE - (i + 1) * MIN };
    seededTurns.push(row);
    turn(f, row.id, row.subject, row.ip, row.at);
  }
  turn(f, 'acct-turn', f.user, ips[0], SINCE - 300 * MIN);
  turn(f, 'after', v2Ip(ips[0]), v2Ip(ips[0]), SINCE + MIN);
  turn(f, 'other', ips[1], ips[1], SINCE - MIN, OTHER);

  limitHit(f, '2026-10-02', 'hourly', ips[1], 2, SINCE - 2 * HOUR);
  limitHit(f, '2026-10-02', 'daily', f.user, 1, SINCE - 3 * HOUR);
  limitHit(f, '2026-10-02', 'hourly', ips[1], 4, SINCE - 2 * HOUR, OTHER);

  for (let i = 0; i < 250; i++) session(f, `s${i}`, ips[i % 7], SINCE - (i + 1) * MIN);
  session(f, 's-null', null, SINCE - 5 * MIN);
  session(f, 's-after', v2Ip(ips[2]), SINCE + MIN);

  const tgEvent = f.db.prepare('INSERT INTO telegram_events (id, event, pseudo_user, meta_json, created_at) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 3; i++) tgEvent.bind(`e${i}`, 'javob_reply_generated', legacyPseudo(100 + i), '{}', iso(SINCE - (i + 1) * HOUR)).runSync();
  tgEvent.bind('e-null', 'javob_bot_start', null, '{}', iso(SINCE - HOUR)).runSync();
  tgEvent.bind('e-after', 'javob_bot_start', v2Pseudo(legacyPseudo(100)), '{}', iso(SINCE + MIN)).runSync();

  const handoff = f.db.prepare(
    'INSERT INTO gpt_handoffs (token_hash, session_id, locale, created_at, expires_at, claimed_at, claimed_by) VALUES (?,?,?,?,?,?,?)',
  );
  handoff.bind('h-claimed', 's0', 'uz', iso(SINCE - 2 * HOUR), iso(SINCE + DAY), iso(SINCE - HOUR), legacyPseudo(100)).runSync();
  handoff.bind('h-open', 's1', 'ru', iso(SINCE - 2 * HOUR), iso(SINCE + DAY), null, null).runSync();

  const gptEvent = f.db.prepare('INSERT INTO gpt_events (id, session_id, user_id, event_name, payload_json, created_at) VALUES (?,?,?,?,?,?)');
  gptEvent
    .bind('g-claimed', 's0', null, 'GPTChatHandoffClaimed', JSON.stringify({ locale: 'uz', messageCount: 2, claimedBy: legacyPseudo(100) }), iso(SINCE - HOUR))
    .runSync();
  gptEvent.bind('g-other', 's0', null, 'GPTChatHandoffNotifySkipped', JSON.stringify({ reason: 'muted' }), iso(SINCE - HOUR)).runSync();

  const usage = f.db.prepare('INSERT INTO gpt_usage_daily (date_utc, hashed_ip, message_count) VALUES (?,?,?)');
  usage.bind('2026-09-01', ips[0], 3).runSync();
  usage.bind('2026-10-02', ips[1], 1).runSync();

  // Before SINCE, and without a salt, the rekey does not even take its lease.
  const original = dump(f.db);
  assert.deepEqual(await rekeySaltedHashes(f.env, SINCE + MIN), { status: 'off', rows: {}, pending: [] });
  Object.assign(f.env, salted());
  const waiting = await rekeySaltedHashes(f.env, SINCE - 1);
  assert.equal(waiting.status, 'waiting');
  assert.deepEqual(dump(f.db), original);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_ops WHERE task GLOB 'salt_rekey*'"), 0);

  // Tick 1: a batch per table, newest first, until TICK_ROWS rows.
  assert.equal(REKEY_BATCH, 200);
  assert.equal(TICK_ROWS, 400);
  const first = await rekeySaltedHashes(f.env, SINCE + MIN);
  assert.deepEqual(first, {
    status: 'ran',
    rows: { gpt_turn_reservations: 200, gpt_limit_hits: 1, gpt_sessions: 199, gpt_usage_daily: 2 },
    pending: ['gpt_turn_reservations', 'gpt_sessions', 'telegram_events', 'gpt_handoffs', 'gpt_events'],
  });
  const converted = "ip_hash LIKE 'h2\\_%' ESCAPE '\\'";
  assert.equal(
    f.db.value(`SELECT MIN(created_at) FROM gpt_turn_reservations WHERE org_id=? AND created_at<? AND ${converted}`, BILLING_ORG, SINCE),
    SINCE - 200 * MIN,
    'the 200 newest turns went first',
  );
  assert.equal(
    f.db.value(`SELECT MAX(created_at) FROM gpt_turn_reservations WHERE org_id=? AND NOT ${converted}`, BILLING_ORG),
    SINCE - 201 * MIN,
  );

  // Tick 2 finishes; tick 3 finds nothing to do and touches nothing.
  const second = await rekeySaltedHashes(f.env, SINCE + 16 * MIN);
  assert.deepEqual(second, {
    status: 'done',
    rows: { gpt_turn_reservations: 51, gpt_sessions: 51, telegram_events: 3, gpt_handoffs: 1, gpt_events: 1 },
    pending: [],
  });
  const finished = dump(f.db);
  assert.deepEqual(await rekeySaltedHashes(f.env, SINCE + 31 * MIN), { status: 'done', rows: {}, pending: [] });
  assert.deepEqual(dump(f.db), finished);
  // Counts only: no hash, id or payload in what the tick reports.
  assert.doesNotMatch(JSON.stringify([first, second]), /[0-9a-f]{16}|h2_/);

  // Every legacy value became exactly v2(legacy); nothing was keyed twice.
  const turns = new Map(
    f.db.rows<{ id: string; org_id: string; subject: string; ip_hash: string }>('SELECT id, org_id, subject, ip_hash FROM gpt_turn_reservations').map((r) => [r.id, r]),
  );
  for (const seeded of seededTurns) {
    assert.equal(turns.get(seeded.id)?.ip_hash, v2Ip(seeded.ip));
    assert.equal(turns.get(seeded.id)?.subject, v2Ip(seeded.subject));
  }
  assert.deepEqual(
    { subject: turns.get('acct-turn')?.subject, ip: turns.get('acct-turn')?.ip_hash },
    { subject: f.user, ip: v2Ip(ips[0]) },
  );
  assert.equal(turns.get('after')?.ip_hash, v2Ip(ips[0]), 'a v2 value is never salted again');
  assert.deepEqual([turns.get('other')?.subject, turns.get('other')?.ip_hash], [ips[1], ips[1]], 'another org is untouched');

  assert.deepEqual(
    rows(f, 'SELECT org_id, reason, subject, n FROM gpt_limit_hits ORDER BY org_id, reason'),
    [
      { org_id: BILLING_ORG, reason: 'daily', subject: f.user, n: 1 },
      { org_id: BILLING_ORG, reason: 'hourly', subject: v2Ip(ips[1]), n: 2 },
      { org_id: OTHER, reason: 'hourly', subject: ips[1], n: 4 },
    ],
  );
  const sessions = new Map(f.db.rows<{ id: string; hashed_ip: string | null }>('SELECT id, hashed_ip FROM gpt_sessions').map((r) => [r.id, r.hashed_ip]));
  for (let i = 0; i < 250; i++) assert.equal(sessions.get(`s${i}`), v2Ip(ips[i % 7]));
  assert.equal(sessions.get('s-null'), null);
  assert.equal(sessions.get('s-after'), v2Ip(ips[2]));

  assert.deepEqual(
    rows(f, 'SELECT id, pseudo_user FROM telegram_events ORDER BY id'),
    [
      { id: 'e-after', pseudo_user: v2Pseudo(legacyPseudo(100)) },
      { id: 'e-null', pseudo_user: null },
      { id: 'e0', pseudo_user: v2Pseudo(legacyPseudo(100)) },
      { id: 'e1', pseudo_user: v2Pseudo(legacyPseudo(101)) },
      { id: 'e2', pseudo_user: v2Pseudo(legacyPseudo(102)) },
    ],
  );
  assert.deepEqual(rows(f, 'SELECT token_hash, claimed_by FROM gpt_handoffs ORDER BY token_hash'), [
    { token_hash: 'h-claimed', claimed_by: v2Pseudo(legacyPseudo(100)) },
    { token_hash: 'h-open', claimed_by: null },
  ]);
  const payloads = new Map(f.db.rows<{ id: string; payload_json: string }>('SELECT id, payload_json FROM gpt_events').map((r) => [r.id, JSON.parse(r.payload_json)]));
  assert.deepEqual(payloads.get('g-claimed'), { locale: 'uz', messageCount: 2, claimedBy: v2Pseudo(legacyPseudo(100)) });
  assert.deepEqual(payloads.get('g-other'), { reason: 'muted' });

  // The release's acceptance query reads 0 legacy rows in every table.
  assert.deepEqual(legacyLeft(f), {
    turnsIp: 0,
    turnsSubject: 0,
    limitHits: 0,
    sessions: 0,
    telegram: 0,
    handoffs: 0,
    events: 0,
    usage: 0,
  });
});

test('a legacy limit-hit row merges into the v2 row of the same day when SINCE falls inside it', async () => {
  const f = await billingFixture();
  const noon = Date.UTC(2026, 9, 3, 12);
  Object.assign(f.env, salted('2026-10-03T12:00:00Z'));
  const legacy = sha(IP);
  limitHit(f, '2026-10-03', 'hourly', legacy, 2, noon - HOUR);
  limitHit(f, '2026-10-03', 'hourly', v2Ip(legacy), 1, noon + 10 * MIN);
  await ensureTelegramSchema(f.binding);
  const run = await rekeySaltedHashes(f.env, noon + 20 * MIN);
  assert.equal(run.rows.gpt_limit_hits, 1);
  const merged = rows(f, 'SELECT subject, n, first_at FROM gpt_limit_hits');
  assert.deepEqual(merged, [{ subject: v2Ip(legacy), n: 3, first_at: noon - HOUR }]);
  await rekeySaltedHashes(f.env, noon + 40 * MIN);
  assert.deepEqual(rows(f, 'SELECT subject, n, first_at FROM gpt_limit_hits'), merged);
});

test('one rekey at a time: a held lease waits, a finished tick frees it', async () => {
  const f = await billingFixture();
  Object.assign(f.env, salted());
  session(f, 's-old', sha(IP), SINCE - MIN);
  const now = SINCE + MIN;
  f.db.prepare("INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES(?,'salt_rekey',?)").bind(BILLING_ORG, now + MIN).runSync();
  const busy = await rekeySaltedHashes(f.env, now);
  assert.equal(busy.status, 'busy');
  assert.equal(f.db.value('SELECT hashed_ip FROM gpt_sessions'), sha(IP));
  // A database without the bot's tables (never bootstrapped) has nothing to rekey there.
  const ran = await rekeySaltedHashes(f.env, now + 2 * MIN);
  assert.equal(ran.status, 'done');
  assert.equal(ran.rows.gpt_sessions, 1);
  assert.equal(ran.rows.telegram_events, 0);
  assert.equal(f.db.value('SELECT hashed_ip FROM gpt_sessions'), v2Ip(sha(IP)));
  assert.equal(f.db.value("SELECT next_at FROM gpt_billing_ops WHERE org_id=? AND task='salt_rekey'", BILLING_ORG), now + 2 * MIN);
});

test('anti-abuse windows (IP-hash subjects, never rekeyed) that started over two days ago are swept', async () => {
  const f = await billingFixture();
  const now = SINCE + 3 * DAY;
  const window = f.db.prepare('INSERT INTO gpt_rate_limits (action, subject, window_start, count) VALUES (?,?,?,?)');
  window.bind('lead_day', sha(IP), iso(now - 3 * DAY), 2).runSync();
  window.bind('handoff', sha(IP), iso(now - 2 * DAY - HOUR), 1).runSync();
  window.bind('lead_day', v2Ip(sha(IP)), iso(now - DAY), 1).runSync();
  window.bind('service_alert', 'global', iso(now - HOUR), 1).runSync();
  await maintainBilling(f.env, now);
  assert.deepEqual(rows(f, 'SELECT action, subject FROM gpt_rate_limits ORDER BY window_start'), [
    { action: 'lead_day', subject: v2Ip(sha(IP)) },
    { action: 'service_alert', subject: 'global' },
  ]);
});

// ── Quotas, history and chat ownership across the switch-over ───────────────

function sessionRequest(f: Fixture, env: Env) {
  return sessionPost({
    request: new Request('https://gptbot.uz/api/gpt/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP },
      body: JSON.stringify({ locale: 'uz', source: 'test' }),
    }),
    env,
  } as never);
}

async function createSession(f: Fixture, env: Env) {
  const response = await sessionRequest(f, env);
  const { sessionId } = (await response.json()) as { sessionId: string };
  const token = /gpt_sat=([^;,]+)/.exec(response.headers.get('set-cookie') || '')?.[1] ?? '';
  return { sessionId, token, cookie: `gpt_sid=${sessionId}; gpt_sat=${token}` };
}

function history(env: Env, sessionId: string, cookie: string) {
  return historyGet({
    request: new Request(`https://gptbot.uz/api/gpt/history?sessionId=${sessionId}`, { headers: { Cookie: cookie } }),
    env,
  } as never);
}

test('quotas, history and chat ownership carry over the switch-over', async () => {
  const f = await billingFixture();
  // SINCE an hour ahead of the real clock: the session route hashes with Date.now().
  const since = Math.ceil((Date.now() + HOUR) / 1000) * 1000;
  Object.assign(f.env, salted(iso(since)));
  const env = f.env as Env;
  const cfg = resolveConfig(env);

  const before = await createSession(f, env);
  const stored = rows(f, 'SELECT anon_token, hashed_ip FROM gpt_sessions')[0];
  assert.deepEqual(stored, { anon_token: sha(before.token), hashed_ip: sha(IP) });
  f.db
    .prepare('INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)')
    .bind('m1', before.sessionId, 'user', 'Salom', iso(since - HOUR))
    .runSync();
  const owns = () =>
    new IdentityStore(f.binding, BILLING_ORG).ownsChat(
      new Request('https://gptbot.uz/api/gpt/chat', { headers: { cookie: before.cookie } }),
      before.sessionId,
    );
  assert.equal(await owns(), true);
  assert.equal((await history(env, before.sessionId, before.cookie)).status, 200);

  // Three answered turns of this IP ten minutes before SINCE.
  for (let i = 0; i < 3; i++) turn(f, `q${i}`, sha(IP), sha(IP), since - 10 * MIN + i);
  const after = since + MIN;
  const key = await hashIp(IP, cfg, after);
  assert.equal(key, v2Ip(sha(IP)));
  const turns = new TurnStore(f.binding, BILLING_ORG);
  // The window the plan accepts: until the first tick the v2 key sees none of them.
  assert.equal((await turns.allowance(key, key, null, cfg, after)).hourRemaining, cfg.freeHourlyLimit);
  assert.equal((await rekeySaltedHashes(f.env, after)).status, 'done');
  assert.equal((await turns.allowance(key, key, null, cfg, after)).hourRemaining, cfg.freeHourlyLimit - 3);

  // The session keeps its token hash; ownership and history do not notice.
  assert.deepEqual(rows(f, 'SELECT anon_token, hashed_ip FROM gpt_sessions'), [{ anon_token: sha(before.token), hashed_ip: key }]);
  assert.equal(await owns(), true);
  const read = await history(env, before.sessionId, before.cookie);
  assert.equal(read.status, 200);
  assert.deepEqual(((await read.json()) as { messages: Array<{ content: string }> }).messages.map((m) => m.content), ['Salom']);

  // A session created after SINCE stores the v2 IP hash and the same token hash.
  const past = { ...env, ...salted('2026-01-01T00:00:00Z') } as Env;
  const later = await createSession(f, past);
  assert.deepEqual(
    rows(f, 'SELECT anon_token, hashed_ip FROM gpt_sessions WHERE id=?', later.sessionId),
    [{ anon_token: sha(later.token), hashed_ip: key }],
  );
  assert.equal((await history(past, later.sessionId, later.cookie)).status, 200);
});

test('the maintenance tick runs the rekey and reports counts only', async (t) => {
  const f = await billingFixture();
  const secret = randomBytes(32).toString('hex');
  Object.assign(f.env, { GPT_BILLING_MAINTENANCE_SECRET: secret });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: { endpoints: [{ pricing: { prompt: '0', completion: '0' } }] } }),
  );
  const tick = async () => {
    const response = await maintenance({
      request: new Request('https://gptbot.uz/api/internal/gpt-billing-maintenance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      }),
      env: f.env,
    } as never);
    return { status: response.status, text: await response.text() };
  };
  session(f, 's-old', sha(IP), Date.UTC(2025, 11, 31));

  const off = await tick();
  assert.equal(off.status, 200);
  assert.deepEqual(JSON.parse(off.text).rekey, { status: 'off', rows: {}, pending: [] });

  Object.assign(f.env, salted('2026-01-01T00:00:00Z'));
  const ran = await tick();
  const body = JSON.parse(ran.text) as { ok: boolean; failed: string[]; rekey: { status: string; rows: Record<string, number> } };
  assert.equal(ran.status, 200);
  assert.deepEqual([body.ok, body.failed], [true, []]);
  assert.equal(body.rekey.status, 'done');
  assert.equal(body.rekey.rows.gpt_sessions, 1);
  assert.equal(f.db.value('SELECT hashed_ip FROM gpt_sessions'), v2Ip(sha(IP)));
  assert.ok(!ran.text.includes(sha(IP)) && !ran.text.includes(v2Ip(sha(IP))), 'no hash in the response');
});
