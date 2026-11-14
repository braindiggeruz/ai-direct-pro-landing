import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { test, type TestContext } from 'node:test';
import { onRequestPost as leadPost } from '../functions/api/gpt/lead';
import { onRequestPost as maintenance } from '../functions/api/internal/gpt-billing-maintenance';
import { onRequestPost as manualDrain } from '../functions/api/internal/gpt/salesdesk-outbox';
import { SALESDESK_ENDPOINT } from '../functions/lib/gpt-chat/salesdesk-outbox';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(t: TestContext) {
  const f = await billingFixture();
  Object.assign(f.env, { GPT_BILLING_MODE: 'off', GPT_BILLING_MAINTENANCE_SECRET: randomBytes(32).toString('hex') });
  t.mock.method(console, 'warn', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const calls: string[] = [];
  let crmStatus = 200, telegramStatus = 200;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(url);
    if (url === SALESDESK_ENDPOINT) {
      const body = JSON.parse(String(init?.body));
      return Response.json(crmStatus === 200 ? { accepted: true, state: 'completed', requestId: body.requestId, operationId: 'in_' + body.leadId, leadId: 123, notifications: false, duplicate: false } : { accepted: false, error: 'offline_fixture_failure' }, { status: crmStatus });
    }
    if (url.startsWith('https://api.telegram.org/')) return Response.json(telegramStatus === 200 ? { ok: true, result: { message_id: 123 } } : { ok: false, error_code: telegramStatus }, { status: telegramStatus });
    if (url.startsWith('https://openrouter.ai/')) return Response.json({ data: { endpoints: [{ pricing: { prompt: '0', completion: '0' } }] } });
    throw new Error('Unexpected offline test host');
  });
  return { ...f, calls, crmStatus: (status: number) => { crmStatus = status; }, telegramStatus: (status: number) => { telegramStatus = status; } };
}
function body(overrides: Record<string, unknown> = {}) {
  return { consent: true, source: 'page_form', service: 'target', pageUrl: '/uz/instagram-target-yoqish/', locale: 'uz', requestId: randomUUID(), contactValue: '@private_fixture',
    utm: { utm_source: 'ig', utm_campaign: 'active_fixture', campaign_id: '120254633671730181', adset_id: '120254633672190181', ad_id: '120254633673790181', landing_variant: 'target_cro_20261113' }, ...overrides };
}
function submit(f: Fixture, payload = body(), origin = 'https://gptbot.uz') {
  return leadPost(f.ctx(new Request(origin + '/api/gpt/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })) as never);
}

test('migration and runtime bootstrap agree; target acceptance persists its independent frozen delivery atomically', async t => {
  const f = await fixture(t), input = body();
  const accepted = await submit(f, input);
  assert.equal(accepted.status, 200);
  const ack = await accepted.json() as {id: string};
  await Promise.all(f.background);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_leads'), 1);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_lead_outbox'), 1);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_salesdesk_outbox'), 1);
  const payload = JSON.parse(String(f.db.value('SELECT payload_json FROM gpt_salesdesk_outbox')));
  assert.equal(payload.leadId, ack.id); assert.equal(payload.requestId, input.requestId);
  assert.equal(payload.acceptedAt, f.db.value('SELECT created_at FROM gpt_leads'));
  assert.equal(payload.attribution.adId, input.utm.ad_id);
  assert.equal(payload.mode, 'live'); assert.equal(payload.contact.type, 'telegram');
  assert.equal(f.calls.length, 0, 'unconfigured CRM queues instead of networking');
  const migrated = new SqliteD1();
  migrated.exec(fs.readFileSync(new URL('../migrations/0084_gpt_salesdesk_outbox.sql', import.meta.url), 'utf8'));
  assert.deepEqual(migrated.rows('PRAGMA table_info(gpt_salesdesk_outbox)'), f.db.rows('PRAGMA table_info(gpt_salesdesk_outbox)'));
});

test('a CRM enqueue failure rolls back lead, audit and both outboxes rather than acknowledging partial intake', async t => {
  const f = await fixture(t);
  f.db.exec("CREATE TRIGGER fixture_crm_fail BEFORE INSERT ON gpt_salesdesk_outbox BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  const response = await submit(f);
  assert.equal(response.status, 503);
  for (const table of ['gpt_leads', 'gpt_events', 'gpt_lead_outbox', 'gpt_salesdesk_outbox']) assert.equal(f.db.value(`SELECT COUNT(*) FROM ${table}`), 0, table);
  assert.equal(f.calls.length, 0); assert.equal(f.background.length, 0);
});

test('other pages, sources, services and preview origins preserve old intake and never enqueue CRM', async t => {
  for (const [overrides, origin] of [[{pageUrl:'/ru/other/'},'https://gptbot.uz'],[{source:'calculator'},'https://gptbot.uz'],[{service:'ai-bot'},'https://gptbot.uz'],[{},'https://preview.pages.dev']] as const) {
    const f = await fixture(t);
    assert.equal((await submit(f, body(overrides), origin)).status, 200);
    await Promise.all(f.background);
    assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_leads'), 1);
    assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_lead_outbox'), 1);
    assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_salesdesk_outbox'), 0);
  }
});

test('idempotent/contact retries keep one CRM entity; a missing client key is generated once and stored', async t => {
  const f = await fixture(t), input = body();
  await submit(f, input); await Promise.all(f.background);
  const frozen = f.db.value('SELECT payload_json FROM gpt_salesdesk_outbox');
  const retried = await (await submit(f, {...input, intent:'different retry detail'})).json() as {idempotent: boolean};
  assert.equal(retried.idempotent, true);
  await submit(f, {...input, requestId:randomUUID()}); await Promise.all(f.background);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_salesdesk_outbox'), 1);
  assert.equal(f.db.value('SELECT payload_json FROM gpt_salesdesk_outbox'), frozen);
  const noKey = await fixture(t); await submit(noKey, body({requestId:undefined})); await Promise.all(noKey.background);
  const stored = String(noKey.db.value('SELECT request_id FROM gpt_leads'));
  assert.match(stored, /^[A-Za-z0-9_-]{16,80}$/);
  assert.equal(noKey.db.value('SELECT request_id FROM gpt_salesdesk_outbox'), stored);
});

test('CRM and Telegram are independent: failure in either does not stop the other', async t => {
  for (const crmFails of [true, false]) {
    const f = await fixture(t);
    Object.assign(f.env, { GPT_SALESDESK_INGRESS_SECRET:randomBytes(32).toString('hex'), GPT_CAMPAIGN_NOTIFY_BOT_TOKEN:randomBytes(32).toString('hex'), GPT_NOTIFY_CHAT_ID:'424242' });
    f.crmStatus(crmFails ? 500 : 200); f.telegramStatus(crmFails ? 200 : 403);
    assert.equal((await submit(f)).status, 200); await Promise.all(f.background);
    assert.equal(f.db.value('SELECT status FROM gpt_salesdesk_outbox'), crmFails ? 'pending' : 'completed');
    assert.equal(f.db.value('SELECT status FROM gpt_lead_outbox'), crmFails ? 'sent' : 'failed');
  }
});

test('manual retry denies invalid authorization before touching storage or network', async t => {
  const db = new SqliteD1();
  const prepare = t.mock.method(db, 'prepare', () => { throw new Error('must not touch database'); });
  const net = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  for (const secret of [undefined, 'short', 'fixture-secret-'.repeat(4)]) {
    const response = await manualDrain({request:new Request('https://gptbot.uz/api/internal/gpt/salesdesk-outbox',{method:'POST',headers:{Authorization:'Bearer wrong'}}),env:{GPTBOT_DRAFTS_DB:db.asD1(),GPT_BILLING_MAINTENANCE_SECRET:secret}} as never);
    assert.equal(response.status, 403);
  }
  assert.equal(prepare.mock.callCount(), 0); assert.equal(net.mock.callCount(), 0);
});

test('existing authenticated maintenance cron recovers one pending CRM item each tick with no new lead', async t => {
  const f = await fixture(t);
  await submit(f, body({contactValue:'@fixture_one'})); await submit(f, body({contactValue:'@fixture_two'})); await Promise.all(f.background);
  f.env.GPT_SALESDESK_INGRESS_SECRET = randomBytes(32).toString('hex');
  f.db.exec("UPDATE gpt_salesdesk_outbox SET status='pending',available_at='2026-01-01T00:00:00.000Z'");
  const tick = () => maintenance(f.ctx(new Request('https://gptbot.uz/api/internal/gpt-billing-maintenance',{method:'POST',headers:{Authorization:'Bearer '+f.env.GPT_BILLING_MAINTENANCE_SECRET}})) as never);
  for (const completed of [1, 2]) {
    const response = await tick(); const result = await response.json() as {salesdeskDelivery:unknown};
    assert.equal(response.status, 200);
    assert.deepEqual(result.salesdeskDelivery, {attempted:1,completed:1,pending:0,blocked:0,failed:0,queue:{pending:2-completed,sending:0,blocked:0,failed:0,completed}});
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_salesdesk_outbox WHERE status='completed'"), completed);
    assert.doesNotMatch(JSON.stringify(result), /private_fixture|fixture_one|fixture_two/);
  }
  await Promise.all(f.background);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_leads'), 2);
});

test('authenticated manual hook safely reports an empty queue', async () => {
  const db = new SqliteD1(); await ensureSchema(db.asD1());
  const secret = 'internal-fixture-'.repeat(3);
  const response = await manualDrain({request:new Request('https://gptbot.uz/api/internal/gpt/salesdesk-outbox',{method:'POST',headers:{Authorization:'Bearer '+secret}}),env:{GPTBOT_DRAFTS_DB:db.asD1(),GPT_BILLING_MAINTENANCE_SECRET:secret}} as never);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok:true,attempted:0,completed:0,pending:0,blocked:0,failed:0,queue:{pending:0,sending:0,blocked:0,failed:0,completed:0}});
});

test('terminal rejection stays visible in subsequent cron and manual reconciliation without resending', async t => {
  const f = await fixture(t); f.env.GPT_SALESDESK_INGRESS_SECRET = randomBytes(32).toString('hex'); f.crmStatus(422);
  await submit(f); await Promise.all(f.background);
  assert.equal(f.db.value('SELECT status FROM gpt_salesdesk_outbox'), 'failed');
  const request = () => new Request('https://gptbot.uz/api/internal/gpt-billing-maintenance',{method:'POST',headers:{Authorization:'Bearer '+f.env.GPT_BILLING_MAINTENANCE_SECRET}});
  for (let i=0;i<2;i++) {
    const response = await maintenance(f.ctx(request()) as never);
    assert.equal(response.status, 503);
    assert.ok(((await response.json()) as {failed:string[]}).failed.includes('salesdeskDelivery'));
  }
  const manual = await manualDrain(f.ctx(request()) as never);
  assert.equal(manual.status, 503); assert.equal(((await manual.json()) as {queue:{failed:number}}).queue.failed,1);
  assert.equal(f.calls.filter(url=>url===SALESDESK_ENDPOINT).length,1);
});
