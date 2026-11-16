// Real SQLite, production projection/delivery code, exclusively local transports.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, test } from 'node:test';
import {
  buildSalesdeskPayload,
  salesdeskOutboxStatement,
  deliverSalesdeskOutboxItem,
  drainSalesdeskOutbox,
} from '../functions/lib/gpt-chat/salesdesk-outbox';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { validateLead, type LeadInput, type LeadValidation } from '../functions/lib/gpt-chat/validate';
import { SqliteD1 } from './helpers/sqlite-d1';

const ENDPOINT = 'https://gptbot-salesdesk.braindigger-uz.workers.dev/integrations/website/leads';
const PATH = '/uz/instagram-target-yoqish/';
const SECRET = 'offline-salesdesk-fixture-secret-with-32-plus-characters-xxxxxxxx';
const NOW = new Date('2026-11-14T06:00:00.000Z');
const META = {
  leadId: 'lead_offline_fixture',
  requestId: 'offline_request_fixture_0001',
  acceptedAt: NOW.toISOString(),
  locale: 'uz' as const,
};
const ENV = { GPT_SALESDESK_INGRESS_SECRET: SECRET };
type Lead = NonNullable<LeadValidation['value']>;
type Payload = NonNullable<ReturnType<typeof buildSalesdeskPayload>>;
type OutboxRow = {
  id: string; lead_id: string; request_id: string; payload_json: string;
  status: string; attempt_count: number; available_at: string;
  lease_token: string | null; lease_expires_at: string | null;
  delivered_at: string | null; crm_operation_id: string | null;
  crm_lead_id: number | null; last_error_code: string | null;
};

beforeEach((t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('External network is forbidden in Salesdesk runtime tests');
  });
});

function lead(overrides: Partial<LeadInput> = {}): Lead {
  const result = validateLead({
    consent: true, contactType: 'telegram', contactValue: '@offline_fixture',
    source: 'page_form', service: 'target', pageUrl: PATH,
    requestId: META.requestId, ...overrides,
  });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.value);
  return result.value;
}

function payload(overrides: Partial<LeadInput> = {}, suffix = '0001'): Payload {
  const result = buildSalesdeskPayload(lead(overrides), {
    ...META, leadId: `lead_offline_${suffix}`, requestId: `offline_request_${suffix}`,
  });
  assert.ok(result);
  return result;
}

async function fixture(p = payload()) {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  await db.prepare('INSERT INTO gpt_leads(id, request_id, created_at) VALUES(?,?,?)')
    .bind(p.leadId, p.requestId, p.acceptedAt).run();
  await salesdeskOutboxStatement(db.asD1(), p).run();
  return { db, p, id: `crm_${p.leadId}` };
}

function row(db: SqliteD1, id: string): OutboxRow {
  const value = db.rows<OutboxRow>('SELECT * FROM gpt_salesdesk_outbox WHERE id = ?', id)[0];
  assert.ok(value);
  return value;
}

function ack(p: Payload, overrides: Record<string, unknown> = {}) {
  return {
    accepted: true, state: 'completed', requestId: p.requestId,
    operationId: 'in_offline_operation', leadId: 314, duplicate: false,
    notifications: false, ...overrides,
  };
}

function transport(handler: (request: Request) => Promise<Response> | Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.url, ENDPOINT, 'only the fixed CRM ingress can be called');
    return handler(request);
  }) as typeof fetch;
}

function completed(p: Payload): typeof fetch {
  return transport(() => Response.json(ack(p)));
}

test('projection only accepts the exact target page, service and form source', () => {
  assert.ok(buildSalesdeskPayload(lead(), META));
  const negatives: Array<Partial<Lead>> = [
    { source: 'gpt_chat' }, { source: 'chat_b2b' }, { source: 'calculator' }, { source: 'unknown' },
    { service: null }, { service: 'ai-bot' },
    { pageUrl: null }, { pageUrl: '/ru/instagram-target-yoqish/' },
    { pageUrl: '/uz/instagram-target-yoqish' },
    { pageUrl: '/uz/instagram-target-yoqish/extra/' },
    { pageUrl: 'https://other.example/uz/instagram-target-yoqish/' },
    { pageUrl: '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/' },
  ];
  for (const change of negatives) {
    assert.equal(buildSalesdeskPayload({ ...lead(), ...change }, META), null, JSON.stringify(change));
  }
});

for (const item of [
  { type: 'phone', input: '+998 90 123 45 67', normalized: '+998901234567' },
  { type: 'telegram', input: 'https://t.me/offline_fixture', normalized: '@offline_fixture' },
  { type: 'email', input: 'fixture@example.com', normalized: 'fixture@example.com' },
]) test(`projection preserves the validated ${item.type} contact`, () => {
  const p = payload({ contactType: item.type, contactValue: item.input });
  assert.deepEqual(p.contact, { type: item.type, value: item.normalized });
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.origin, 'https://gptbot.uz');
  assert.equal(p.pagePath, PATH);
  assert.equal(p.source, 'page_form');
  assert.equal(p.service, 'target');
  assert.equal(p.mode, 'live');
  assert.equal(p.acceptedAt, META.acceptedAt);
  assert.equal(p.locale, 'uz');
});

test('projection carries observed numeric IDs, UTM, variant and permitted private CRM fields', () => {
  const p = payload({
    name: 'Offline private name', intent: 'Нужен таргет\nдля магазина', budget: '1-2m',
    phone: '+998901234567', telegram: '@offline_fixture',
    attribution: { fbclid: 'offline_click_id', referrerHost: 'instagram.com' },
    utm: {
      campaign_id: '120254633671730181', adset_id: '120254633672190181', ad_id: '120254633673790181',
      landing_variant: 'target_cro_20261113', utm_source: 'ig', utm_medium: 'paid_social',
      utm_campaign: 'gptbot_target_xizmati_uz_20261113', utm_content: 'creative_1',
      utm_term: 'target', utm_id: 'observed_utm_id', arbitrary: 'must_not_escape',
    },
  });
  assert.deepEqual(p.attribution, {
    campaignId: '120254633671730181', adsetId: '120254633672190181', adId: '120254633673790181',
    landingVariant: 'target_cro_20261113', fbclid: 'offline_click_id',
    utm: {
      utm_source: 'ig', utm_medium: 'paid_social', utm_campaign: 'gptbot_target_xizmati_uz_20261113',
      utm_content: 'creative_1', utm_term: 'target', utm_id: 'observed_utm_id',
    },
  });
  assert.equal(p.name, 'Offline private name');
  assert.equal(p.intent, 'Нужен таргет\nдля магазина');
  assert.equal(p.budget, '1-2m');
  assert.equal(p.phone, '+998901234567');
  assert.equal(p.telegram, '@offline_fixture');
  assert.equal(JSON.stringify(p).includes('must_not_escape'), false);
});

test('legacy UTM and missing attribution never acquire inferred IDs or variant', () => {
  const p = payload({ utm: { utm_campaign: 'gptbot_target_xizmati_uz_20261113', utm_source: 'ig' } });
  assert.deepEqual(p.attribution, { utm: { utm_campaign: 'gptbot_target_xizmati_uz_20261113', utm_source: 'ig' } });
  assert.deepEqual(payload().attribution, {});
  for (const key of ['name', 'intent', 'budget', 'phone', 'telegram']) {
    assert.equal(Object.hasOwn(payload(), key), false, `${key} omitted rather than null`);
  }
  const backfill = buildSalesdeskPayload(lead(), { ...META, mode: 'backfill' });
  assert.equal(backfill?.mode, 'backfill');
});

test('invalid or dynamic numeric attribution is dropped without inventing fallback values', () => {
  const p = payload({ utm: {
    campaign_id: '{{campaign.id}}', adset_id: '42', ad_id: Number('120254633673790181'),
    landing_variant: 'invalid variant', utm_source: 'ig',
  } });
  assert.deepEqual(p.attribution, { utm: { utm_source: 'ig' } });
});

test('delivery signs the exact frozen UTF-8 body and route, and forbids redirect following', async () => {
  const f = await fixture(payload({ name: 'Тестовый владелец', intent: 'Do‘kon uchun reklama' }));
  const frozenBody = row(f.db, f.id).payload_json;
  let calls = 0;
  const fetcher = transport(async (request) => {
    calls++;
    const raw = await request.text();
    const timestamp = request.headers.get('X-GPTBot-Timestamp');
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'manual');
    assert.equal(request.headers.get('User-Agent'), 'GPTBot-Website-Bridge/1.0');
    assert.match(request.headers.get('Content-Type') ?? '', /^application\/json/);
    assert.equal(timestamp, String(Math.floor(NOW.getTime() / 1000)));
    assert.equal(raw, frozenBody);
    const expected = createHmac('sha256', SECRET)
      .update(`POST\n/integrations/website/leads\n${timestamp}\n${raw}`, 'utf8').digest('hex');
    assert.equal(request.headers.get('X-GPTBot-Signature'), `sha256=${expected}`);
    return Response.json(ack(f.p));
  });
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher), 'completed');
  assert.equal(calls, 1);
  const saved = row(f.db, f.id);
  assert.equal(saved.status, 'completed');
  assert.equal(saved.crm_operation_id, 'in_offline_operation');
  assert.equal(Number(saved.crm_lead_id), 314);
  assert.equal(saved.delivered_at, NOW.toISOString());
  assert.equal(saved.lease_token, null);
  assert.equal(saved.last_error_code, null);
});

for (const secret of [undefined, '', 'too-short', ' '.repeat(40)]) test(`unconfigured/short secret is blocked before transport (${JSON.stringify(secret)})`, async () => {
  const f = await fixture();
  let called = false;
  const result = await deliverSalesdeskOutboxItem({ GPT_SALESDESK_INGRESS_SECRET: secret }, f.db.asD1(), f.id, NOW,
    transport(() => { called = true; return Response.json(ack(f.p)); }));
  assert.equal(result, 'blocked');
  assert.equal(called, false);
  assert.equal(row(f.db, f.id).status, 'blocked');
  assert.equal(row(f.db, f.id).delivered_at, null);
});

test('wrong ingress secret receives 401 and never acknowledges delivery', async () => {
  const f = await fixture();
  const result = await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW,
    transport(() => Response.json({ accepted: false, error: 'invalid_authentication' }, { status: 401 })));
  assert.equal(result, 'blocked');
  assert.equal(row(f.db, f.id).status, 'blocked');
  assert.equal(row(f.db, f.id).delivered_at, null);
});

test('202 remains pending; retries preserve the frozen entity and use a fresh signature', async () => {
  const f = await fixture();
  const calls: Array<{ raw: string; timestamp: string | null; signature: string | null }> = [];
  const fetcher = transport(async (request) => {
    calls.push({ raw: await request.text(), timestamp: request.headers.get('X-GPTBot-Timestamp'), signature: request.headers.get('X-GPTBot-Signature') });
    return calls.length === 1
      ? Response.json(ack(f.p, { state: 'pending', leadId: null }), { status: 202 })
      : Response.json(ack(f.p, { duplicate: true }));
  });
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher), 'pending');
  assert.equal(row(f.db, f.id).delivered_at, null);
  assert.equal(row(f.db, f.id).crm_operation_id, 'in_offline_operation');
  f.db.prepare('UPDATE gpt_leads SET contact_value = ?, utm_json = ? WHERE id = ?')
    .bind('@changed_source_contact', '{"ad_id":"999999999"}', f.p.leadId).runSync();
  const later = new Date(NOW.getTime() + 2 * 60 * 60_000);
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, later, fetcher), 'completed');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].raw, calls[1].raw);
  assert.equal(JSON.parse(calls[1].raw).acceptedAt, META.acceptedAt);
  assert.notEqual(calls[0].timestamp, calls[1].timestamp);
  assert.notEqual(calls[0].signature, calls[1].signature);
  assert.equal(row(f.db, f.id).attempt_count, 2);
});

for (const badAck of [
  { accepted: false }, { state: 'pending' }, { requestId: 'unrelated_request_0001' },
  { operationId: '' }, { leadId: null }, { leadId: -1 }, { leadId: 1.5 }, { notifications: true },
]) test(`HTTP 200 does not acknowledge an invalid receipt ${JSON.stringify(badAck)}`, async () => {
  const f = await fixture();
  const result = await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW,
    transport(() => Response.json(ack(f.p, badAck))));
  assert.notEqual(result, 'completed');
  assert.notEqual(row(f.db, f.id).status, 'completed');
  assert.equal(row(f.db, f.id).delivered_at, null);
});

test('a retry cannot replace the CRM operation identity received with 202', async () => {
  const f = await fixture();
  await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW,
    transport(() => Response.json(ack(f.p, { state: 'pending', leadId: null }), { status: 202 })));
  const result = await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 7_200_000),
    transport(() => Response.json(ack(f.p, { operationId: 'in_different_operation' }))));
  assert.notEqual(result, 'completed');
  assert.equal(row(f.db, f.id).crm_operation_id, 'in_offline_operation');
  assert.equal(row(f.db, f.id).delivered_at, null);
});

for (const status of [409, 422]) test(`HTTP ${status} is terminal and is excluded from later drains`, async () => {
  const f = await fixture();
  let calls = 0;
  const fetcher = transport(() => {
    calls++;
    return status === 409
      ? Response.json({ accepted: false, error: 'idempotency_payload_conflict' }, { status })
      : Response.json(ack(f.p, { state: 'failed', leadId: null }), { status });
  });
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher), 'failed');
  assert.equal(row(f.db, f.id).status, 'failed');
  assert.equal(row(f.db, f.id).delivered_at, null);
  const result = await drainSalesdeskOutbox(ENV, f.db.asD1(), 3, new Date(NOW.getTime() + 86_400_000), fetcher);
  assert.equal(result.attempted, 0);
  assert.equal(calls, 1);
});

for (const failure of ['http500', 'network', 'malformed-json'] as const) test(`${failure} stays retryable without an acknowledgement`, async () => {
  const f = await fixture();
  const fetcher = transport(() => {
    if (failure === 'network') throw new Error('offline transport interruption');
    if (failure === 'malformed-json') return new Response('<html>provider unavailable</html>', { status: 200 });
    return Response.json({ error: 'upstream_unavailable' }, { status: 500 });
  });
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher), 'pending');
  const saved = row(f.db, f.id);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.delivered_at, null);
  assert.ok(Date.parse(saved.available_at) > NOW.getTime());
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 7_200_000), completed(f.p)), 'completed');
});

test('manual redirects never follow a 302 Location or acknowledge its delivery', async () => {
  const f = await fixture();
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.url);
    assert.equal(request.redirect, 'manual', 'Cloudflare-compatible redirect policy');
    return new Response(null, { status: 302, headers: { Location: 'https://evil.example/leads' } });
  }) as typeof fetch;
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher), 'pending');
  assert.deepEqual(requests, [ENDPOINT], 'the redirect destination is never requested');
  const saved = row(f.db, f.id);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.delivered_at, null);
  assert.equal(saved.crm_operation_id, null);
  assert.equal(saved.crm_lead_id, null);
  assert.ok(Date.parse(saved.available_at) > NOW.getTime());
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 7_200_000), completed(f.p)), 'completed');
});

for (const stalledPhase of ['response', 'body'] as const) test(`the 4-second deadline aborts a stalled ${stalledPhase} and ignores its late valid receipt`, async (t) => {
  const f = await fixture();
  let entered!: () => void;
  const transportEntered = new Promise<void>((resolve) => { entered = resolve; });
  let releaseResponse!: (response: Response) => void;
  const delayedResponse = new Promise<Response>((resolve) => { releaseResponse = resolve; });
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  const delayedBody = new Response(new ReadableStream<Uint8Array>({
    start(controller) { bodyController = controller; },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let aborted = false;
  let calls = 0;
  let settled = false;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, transport((request) => {
    calls++;
    request.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
    entered();
    // Deliberately ignore abort to exercise the Promise.race boundary itself.
    return stalledPhase === 'response' ? delayedResponse : delayedBody;
  }));
  void pending.then(() => { settled = true; });
  await transportEntered;
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (stalledPhase === 'body') assert.equal(delayedBody.body?.locked, true, 'response body is being read');
  assert.equal(row(f.db, f.id).status, 'sending');
  t.mock.timers.tick(3_999);
  await Promise.resolve();
  assert.equal(aborted, false);
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.equal(await pending, 'pending');
  assert.equal(aborted, true);
  assert.equal(calls, 1);
  const saved = row(f.db, f.id);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.delivered_at, null);
  assert.equal(saved.crm_operation_id, null);
  assert.equal(saved.crm_lead_id, null);
  assert.equal(saved.attempt_count, 1);
  assert.equal(saved.lease_token, null);
  assert.equal(saved.lease_expires_at, null);
  assert.ok(Date.parse(saved.available_at) > NOW.getTime());
  const frozenState = JSON.stringify(saved);
  if (stalledPhase === 'response') releaseResponse(Response.json(ack(f.p)));
  else bodyController.enqueue(new TextEncoder().encode(JSON.stringify(ack(f.p))));
  bodyController.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(row(f.db, f.id)), frozenState, 'a valid receipt arriving after the deadline cannot acknowledge the row');
});

test('completed delivery and duplicate enqueue never resend or replace the frozen payload', async () => {
  const f = await fixture();
  let calls = 0;
  const fetcher = transport(() => { calls++; return Response.json(ack(f.p)); });
  await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher);
  const before = JSON.stringify(row(f.db, f.id));
  await assert.rejects(salesdeskOutboxStatement(f.db.asD1(), { ...f.p, name: 'Changed duplicate' }).run(), /UNIQUE constraint/);
  await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 86_400_000), fetcher);
  assert.equal(JSON.stringify(row(f.db, f.id)), before);
  assert.equal(calls, 1);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_salesdesk_outbox'), 1);
});

test('active lease prevents concurrent send and an expired lease can be reclaimed', async () => {
  const f = await fixture();
  f.db.prepare("UPDATE gpt_salesdesk_outbox SET status='sending', lease_token=?, lease_expires_at=? WHERE id=?")
    .bind('active_fixture_lease', new Date(NOW.getTime() + 60_000).toISOString(), f.id).runSync();
  let calls = 0;
  const fetcher = transport(() => { calls++; return Response.json(ack(f.p)); });
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW, fetcher), 'busy');
  assert.equal(calls, 0);
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 600_000), fetcher), 'completed');
  assert.equal(calls, 1);
});

test('late response from an expired lease cannot overwrite a newer completed receipt', async () => {
  const f = await fixture();
  let entered!: () => void;
  const firstEntered = new Promise<void>((resolve) => { entered = resolve; });
  let release!: (response: Response) => void;
  const delayedResponse = new Promise<Response>((resolve) => { release = resolve; });
  const first = deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW,
    transport(() => { entered(); return delayedResponse; }));
  await firstEntered;
  assert.equal(await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 600_000), completed(f.p)), 'completed');
  const finalReceipt = JSON.stringify(row(f.db, f.id));
  release(Response.json({ error: 'late_failure' }, { status: 500 }));
  await first;
  assert.equal(JSON.stringify(row(f.db, f.id)), finalReceipt);
});

test('drain reports bounded outcome counts and excludes work not yet due', async () => {
  const f = await fixture(payload({}, 'first'));
  for (const suffix of ['second', 'third', 'future']) {
    const p = payload({}, suffix);
    await f.db.prepare('INSERT INTO gpt_leads(id, request_id, created_at) VALUES(?,?,?)')
      .bind(p.leadId, p.requestId, p.acceptedAt).run();
    await salesdeskOutboxStatement(f.db.asD1(), p).run();
  }
  f.db.prepare('UPDATE gpt_salesdesk_outbox SET available_at=? WHERE lead_id=?')
    .bind(new Date(NOW.getTime() + 86_400_000).toISOString(), 'lead_offline_future').runSync();
  let calls = 0;
  const result = await drainSalesdeskOutbox(ENV, f.db.asD1(), 3, NOW, transport(async (request) => {
    calls++;
    const p = await request.json() as Payload;
    if (p.leadId.endsWith('first')) return Response.json(ack(p));
    if (p.leadId.endsWith('second')) return Response.json(ack(p, { state: 'pending', leadId: null }), { status: 202 });
    return Response.json({ accepted: false, error: 'idempotency_payload_conflict' }, { status: 409 });
  }));
  assert.deepEqual(result, { attempted: 3, completed: 1, pending: 1, blocked: 0, failed: 1 });
  assert.equal(calls, 3);
  assert.equal(row(f.db, 'crm_lead_offline_future').attempt_count, 0);
});

test('provider errors cannot copy private payloads, secrets or arbitrary response text into logs or analytics', async (t) => {
  const f = await fixture(payload({ name: 'Private Fixture Name', intent: 'Private fixture business brief', phone: '+998901234567' }));
  const captured: string[] = [];
  for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    t.mock.method(console, method, (...args: unknown[]) => { captured.push(args.map(String).join(' ')); });
  }
  const injected = `${SECRET} Private Fixture Name Private fixture business brief +998901234567 @offline_fixture`;
  await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, NOW,
    transport(() => Response.json({ error: injected }, { status: 500 })));
  await deliverSalesdeskOutboxItem(ENV, f.db.asD1(), f.id, new Date(NOW.getTime() + 7_200_000),
    transport(() => { throw new Error(injected); }));
  const diagnostics = JSON.stringify({
    logs: captured,
    error: row(f.db, f.id).last_error_code,
    events: f.db.rows('SELECT payload_json FROM gpt_events'),
  });
  for (const privateValue of [SECRET, 'Private Fixture Name', 'Private fixture business brief', '+998901234567', '@offline_fixture']) {
    assert.equal(diagnostics.includes(privateValue), false, 'private value escaped into diagnostics');
  }
});
