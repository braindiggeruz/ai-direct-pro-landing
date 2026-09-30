// WP-07 (D7): chat message retention, built and OFF by default.
// Run: node --import tsx --test tests/gpt-retention.test.ts
//
// Real SQLite behind the billing fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { billingFixture } from './helpers/gpt-billing-fixture';
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  PURGE_BATCH,
  purgeChatMessages,
  retentionDays,
} from '../functions/lib/gpt-chat/retention-store';
import { onRequestPost as maintenance } from '../functions/api/internal/gpt-billing-maintenance';

type Fixture = Awaited<ReturnType<typeof billingFixture>>;

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20, 9);
const iso = (ms: number) => new Date(ms).toISOString();

function seed(f: Fixture) {
  const message = f.db.prepare('INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)');
  // 600 messages 40 days old, 5 from yesterday, 3 six days old.
  for (let i = 0; i < 600; i++) message.bind(`old${i}`, 's-old', 'user', 'eski', iso(NOW - 40 * DAY + i)).runSync();
  for (let i = 0; i < 5; i++) message.bind(`new${i}`, 's-new', 'user', 'yangi', iso(NOW - DAY + i)).runSync();
  for (let i = 0; i < 3; i++) message.bind(`six${i}`, 's-new', 'user', 'olti', iso(NOW - 6 * DAY + i)).runSync();
  const session = f.db.prepare('INSERT INTO gpt_sessions (id, anon_token, hashed_ip, locale, created_at) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 3; i++) session.bind(`s-old${i}`, `t${i}`, `ip${i}`, 'uz', iso(NOW - 40 * DAY)).runSync();
  session.bind('s-new', 'tn', 'ipn', 'ru', iso(NOW - DAY)).runSync();
  const usage = f.db.prepare('INSERT INTO gpt_usage_daily (date_utc, hashed_ip, message_count) VALUES (?,?,?)');
  usage.bind(iso(NOW - 40 * DAY).slice(0, 10), 'ip0', 3).runSync();
  usage.bind(iso(NOW - 39 * DAY).slice(0, 10), 'ip1', 1).runSync();
  usage.bind(iso(NOW - DAY).slice(0, 10), 'ipn', 2).runSync();
}

function counts(f: Fixture) {
  return {
    messages: f.db.value('SELECT COUNT(*) FROM gpt_messages'),
    sessions: f.db.value('SELECT COUNT(*) FROM gpt_sessions'),
    sessionIps: f.db.value('SELECT COUNT(*) FROM gpt_sessions WHERE hashed_ip IS NOT NULL'),
    usageDaily: f.db.value('SELECT COUNT(*) FROM gpt_usage_daily'),
  };
}

test('retention is off unless GPT_MESSAGES_RETENTION_DAYS is a positive whole number; it is clamped to 7..3650', () => {
  for (const value of [undefined, '', ' ', '0', '00', 'abc', '-5', '7.5', '30d'])
    assert.equal(retentionDays({ GPT_MESSAGES_RETENTION_DAYS: value }), null, String(value));
  assert.equal(MIN_RETENTION_DAYS, 7);
  assert.equal(MAX_RETENTION_DAYS, 3650);
  assert.equal(retentionDays({ GPT_MESSAGES_RETENTION_DAYS: '1' }), 7);
  assert.equal(retentionDays({ GPT_MESSAGES_RETENTION_DAYS: ' 30 ' }), 30);
  assert.equal(retentionDays({ GPT_MESSAGES_RETENTION_DAYS: '99999' }), 3650);
});

test('off by default: nothing is deleted, and the maintenance tick says so', async (t) => {
  const f = await billingFixture();
  seed(f);
  const before = counts(f);
  assert.deepEqual(await purgeChatMessages(f.env, NOW), { enabled: false });
  assert.deepEqual(await purgeChatMessages({ ...f.env, GPT_MESSAGES_RETENTION_DAYS: '0' }, NOW), { enabled: false });
  assert.deepEqual(counts(f), before);

  const secret = randomBytes(32).toString('hex');
  Object.assign(f.env, { GPT_BILLING_MAINTENANCE_SECRET: secret });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: { endpoints: [{ pricing: { prompt: '0', completion: '0' } }] } }),
  );
  const response = await maintenance({
    request: new Request('https://gptbot.uz/api/internal/gpt-billing-maintenance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    }),
    env: f.env,
  } as never);
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { retention: unknown }).retention, { enabled: false });
  assert.deepEqual(counts(f), before);
});

test('on: each pass deletes at most PURGE_BATCH old rows of each kind and keeps everything newer', async () => {
  const f = await billingFixture();
  seed(f);
  const env = { ...f.env, GPT_MESSAGES_RETENTION_DAYS: '30' };
  assert.equal(PURGE_BATCH, 500);

  assert.deepEqual(await purgeChatMessages(env, NOW), {
    enabled: true,
    days: 30,
    deleted: { messages: 500, sessionIps: 3, usageDaily: 2 },
  });
  assert.deepEqual(await purgeChatMessages(env, NOW), {
    enabled: true,
    days: 30,
    deleted: { messages: 100, sessionIps: 0, usageDaily: 0 },
  });
  assert.deepEqual(await purgeChatMessages(env, NOW), {
    enabled: true,
    days: 30,
    deleted: { messages: 0, sessionIps: 0, usageDaily: 0 },
  });
  // Old sessions stay (a lead may name them), only their IP hash is gone.
  assert.deepEqual(counts(f), { messages: 8, sessions: 4, sessionIps: 1, usageDaily: 1 });
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_messages WHERE session_id='s-old'"), 0);
});

test('a period below the minimum keeps a week: six-day-old messages survive', async () => {
  const f = await billingFixture();
  seed(f);
  const run = await purgeChatMessages({ ...f.env, GPT_MESSAGES_RETENTION_DAYS: '1' }, NOW);
  assert.equal(run.enabled && run.days, 7);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_messages WHERE id LIKE 'six%'"), 3);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_messages WHERE id LIKE 'new%'"), 5);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_messages WHERE id LIKE 'old%'"), 100);
});
