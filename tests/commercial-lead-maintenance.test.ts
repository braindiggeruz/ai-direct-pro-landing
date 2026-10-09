// Actual SQLite and the existing outbox. All Telegram/provider traffic is stubbed.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { onRequestPost as maintenance } from '../functions/api/internal/gpt-billing-maintenance';
import { TelegramClient } from '../functions/channels/telegram/api';
import { billingFixture } from './helpers/gpt-billing-fixture';

type Fixture = Awaited<ReturnType<typeof billingFixture>>;

async function fixture() {
  const f = await billingFixture();
  Object.assign(f.env, {
    GPT_BILLING_MODE: 'off',
    GPT_BILLING_MAINTENANCE_SECRET: randomBytes(32).toString('hex'),
    GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString('hex'),
    GPT_NOTIFY_CHAT_ID: '424242',
  });
  return f;
}

function pendingLead(f: Fixture, ageSeconds = 60): string {
  const id = randomUUID();
  const at = new Date(Date.now() - ageSeconds * 1000).toISOString();
  f.db.prepare('INSERT INTO gpt_leads(id,contact_type,contact_value,intent,source,page_url,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(id, 'telegram', '@offline_fixture', 'Учебная задача', 'page_form', 'https://gpt.test/ru/service/', at).runSync();
  f.db.prepare('INSERT INTO gpt_lead_outbox(id,lead_id,available_at,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(`outbox_${id}`, id, at, at, at).runSync();
  return id;
}

function tick(f: Fixture, authorized = true) {
  const request = new Request('https://gpt.test/api/internal/gpt-billing-maintenance', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authorized ? f.env.GPT_BILLING_MAINTENANCE_SECRET : 'wrong'}` },
  });
  return maintenance(f.ctx(request) as never);
}

function network(t: TestContext, send: (init?: RequestInit) => Response | Promise<Response> = () => Response.json({ ok: true, result: { message_id: 1 } })) {
  const telegram: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host === 'api.telegram.org') {
      assert.ok(url.pathname.endsWith('/sendMessage'));
      telegram.push(String(init?.body));
      return send(init);
    }
    if (url.host === 'openrouter.ai') return Response.json({ data: { endpoints: [{ pricing: { prompt: '0', completion: '0' } }] } });
    throw new Error(`Unexpected offline-test host: ${url.host}`);
  });
  t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  return telegram;
}

test('existing cron delivers one waiting lead per tick without a new lead, and never resends a sent row', async (t) => {
  const f = await fixture();
  const firstId = pendingLead(f, 120);
  pendingLead(f, 60);
  const sent = network(t);
  const first = await tick(f);
  const body = await first.json() as { leadDelivery: unknown };
  assert.equal(first.status, 200);
  assert.deepEqual(body.leadDelivery, { attempted: 1, sent: 1, pending: 0, blocked: 0 });
  assert.equal(sent.length, 1);
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE lead_id=?', firstId), 'sent');
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_lead_outbox WHERE status='pending'"), 1);
  assert.doesNotMatch(JSON.stringify(body), /offline_fixture|Учебная задача|outbox_/);
  assert.deepEqual((await (await tick(f)).json() as { leadDelivery: unknown }).leadDelivery, { attempted: 1, sent: 1, pending: 0, blocked: 0 });
  assert.deepEqual((await (await tick(f)).json() as { leadDelivery: unknown }).leadDelivery, { attempted: 0, sent: 0, pending: 0, blocked: 0 });
  assert.equal(sent.length, 2);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_leads'), 2, 'maintenance does not manufacture leads');
  await Promise.all(f.background);
});

test('bad bearer returns 403 before any database or network operation', async (t) => {
  const f = await fixture();
  pendingLead(f);
  const db = t.mock.method(f.binding, 'prepare', () => { throw new Error('Forbidden request touched DB'); });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Forbidden request fetched'); });
  assert.equal((await tick(f, false)).status, 403);
  assert.equal(db.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(f.background.length, 0);
});

test('provider-step failure is isolated and does not block the lead queue', async (t) => {
  const f = await fixture();
  pendingLead(f);
  const prepare = f.binding.prepare.bind(f.binding);
  t.mock.method(f.binding, 'prepare', (sql: string) => {
    if (sql.includes("VALUES(?,'catalogue',?)")) throw new Error('Synthetic provider step failure');
    return prepare(sql);
  });
  const sent = network(t);
  const response = await tick(f);
  const body = await response.json() as { failed: string[]; leadDelivery: unknown };
  assert.equal(response.status, 503);
  assert.deepEqual(body.failed, ['providers']);
  assert.deepEqual(body.leadDelivery, { attempted: 1, sent: 1, pending: 0, blocked: 0 });
  assert.equal(sent.length, 1);
  await Promise.all(f.background);
});

test('Telegram failure makes one attempt then keeps durable backoff; an immediate tick does not retry', async (t) => {
  const f = await fixture();
  const id = pendingLead(f);
  const sent = network(t, () => Response.json({ ok: false, error_code: 503 }, { status: 503 }));
  const before = Date.now();
  const response = await tick(f);
  const body = await response.json() as { leadDelivery: unknown };
  assert.equal(response.status, 200, 'delivery failure is represented by the aggregate and the durable queue');
  assert.deepEqual(body.leadDelivery, { attempted: 1, sent: 0, pending: 1, blocked: 0 });
  const row = f.db.rows<{ status: string; attempt_count: number; available_at: string }>('SELECT status,attempt_count,available_at FROM gpt_lead_outbox WHERE lead_id=?', id)[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt_count, 1);
  assert.ok(new Date(row.available_at).getTime() >= before + 59_000);
  assert.equal(sent.length, 1, 'cron opted out of transport retries');
  assert.deepEqual((await (await tick(f)).json() as { leadDelivery: unknown }).leadDelivery, { attempted: 0, sent: 0, pending: 0, blocked: 0 });
  assert.equal(sent.length, 1);
  await Promise.all(f.background);
});

test('a concurrent tick cannot reclaim the active lease or send a second alert', async (t) => {
  const f = await fixture();
  const id = pendingLead(f);
  let release: ((response: Response) => void) | undefined;
  const sent = network(t, () => new Promise<Response>((resolve) => { release = resolve; }));
  const pending = tick(f);
  for (let i = 0; i < 100 && !release; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(release);
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE lead_id=?', id), 'sending');
  const second = await tick(f);
  assert.equal(second.status, 200);
  assert.equal(sent.length, 1);
  release(Response.json({ ok: true, result: { message_id: 1 } }));
  assert.equal((await pending).status, 200);
  await Promise.all(f.background);
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE lead_id=?', id), 'sent');
  assert.equal(sent.length, 1);
});

test('the 4-second transport deadline aborts one request without starving maintenance', async (t) => {
  const f = await fixture();
  pendingLead(f);
  let aborted = false;
  const sent = network(t, (init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('Synthetic abort', 'AbortError')); }, { once: true });
  }));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = tick(f);
  for (let i = 0; i < 100 && sent.length === 0; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1);
  t.mock.timers.tick(4_000);
  const response = await pending;
  const body = await response.json() as { leadDelivery: unknown; failed: string[] };
  assert.equal(aborted, true);
  assert.equal(response.status, 200);
  assert.deepEqual(body.failed, []);
  assert.deepEqual(body.leadDelivery, { attempted: 1, sent: 0, pending: 1, blocked: 0 });
  assert.equal(sent.length, 1);
  await Promise.all(f.background);
});

test('a step timeout retains the raw completion task and does not release an in-flight lease', async (t) => {
  const f = await fixture();
  const id = pendingLead(f);
  const prepare = f.binding.prepare.bind(f.binding);
  let completeWrite: (() => void) | undefined;
  t.mock.method(f.binding, 'prepare', (sql: string) => {
    const statement = prepare(sql);
    if (sql.includes('UPDATE gpt_lead_outbox') && sql.includes("SET status = 'sent'")) {
      const run = statement.run.bind(statement);
      statement.run = () => new Promise((resolve, reject) => {
        completeWrite = () => { void run().then(resolve, reject); };
      });
    }
    return statement;
  });
  const sent = network(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = tick(f);
  for (let i = 0; i < 100 && !completeWrite; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(completeWrite, 'provider replied but its durable completion write is delayed');
  assert.equal(f.background.length, 1, 'the raw outbox completion was registered with waitUntil');
  t.mock.timers.tick(8_000);
  const response = await pending;
  const body = await response.json() as { leadDelivery: unknown; failed: string[] };
  assert.equal(response.status, 503);
  assert.deepEqual(body.failed, ['leadDelivery']);
  assert.equal(body.leadDelivery, null, 'timeout cannot claim the notification is sent');
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE lead_id=?', id), 'sending');
  assert.equal((await tick(f)).status, 200);
  assert.equal(sent.length, 1, 'another tick does not repeat the in-flight notification');
  completeWrite();
  await Promise.all(f.background);
  assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox WHERE lead_id=?', id), 'sent');
});

test('sendMessage preserves legacy call options and gives all chunks one opt-in deadline', async (t) => {
  const calls: Array<{ timeoutMs?: number; maxRetries?: number }> = [];
  let now = 10_000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(TelegramClient.prototype, 'call', async (_method: string, _body: unknown, options: { timeoutMs?: number; maxRetries?: number }) => {
    calls.push(options);
    now += 2_000;
    return { ok: true, result: { message_id: calls.length } };
  });
  const client = new TelegramClient(randomBytes(32).toString('hex'));
  await client.sendMessage(424242, 'Legacy fixture');
  assert.deepEqual(calls.shift(), { timeoutMs: undefined, maxRetries: undefined });
  const result = await client.sendMessage(424242, 'fixture '.repeat(1800), { budgetMs: 4_000, timeoutMs: 4_000, maxRetries: 0 });
  assert.deepEqual(calls, [{ timeoutMs: 4_000, maxRetries: 0 }, { timeoutMs: 2_000, maxRetries: 0 }]);
  assert.equal(result.ok, false, 'no new chunk starts after the overall deadline');
});
