import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTrackLead, type LeadConversionScope } from '../src/shared/lead-conversion';
import { sendLead, type LeadPayload } from '../src/gpt-chat/api';
import { readFirstTouch, leadAttribution, leadUtm } from '../src/shared/lead-attribution';
import { onRequestPost } from '../functions/api/gpt/lead';
import { SqliteD1 } from './helpers/sqlite-d1';

const RID = 'request_fixture_000001';
const KEY = 'gptbot_lead_conversions_v1';
function storage(seed: Record<string, string> = {}) {
  return {
    data: { ...seed },
    getItem(key: string) { return this.data[key] ?? null; },
    setItem(key: string, value: string) { this.data[key] = value; },
  };
}

test('only a literal acknowledgement counts; new receipt counts once across all sources', () => {
  const scope = {};
  for (const ok of [false, undefined, 1, 'true']) assert.equal(shouldTrackLead({ ok }, RID, scope), false);
  assert.equal(shouldTrackLead({ ok: true, id: 'lead_new', delivery: 'pending' }, RID, scope), true);
  assert.equal(shouldTrackLead({ ok: true, id: 'lead_new' }, 'other_request_000001', scope), false);
  assert.equal(shouldTrackLead({ ok: true, id: 'lead_another' }, 'other_request_000001', scope), true);
});

test('contact dedupe is not a new conversion, while lost-response idempotency can be counted once', () => {
  const scope = {};
  assert.equal(shouldTrackLead({ ok: true, id: 'lead_existing', duplicate: true }, RID, scope), false);
  const ack = { ok: true, id: 'lead_retry', duplicate: true, idempotent: true };
  assert.equal(shouldTrackLead(ack, RID, scope), true);
  assert.equal(shouldTrackLead(ack, RID, scope), false);
});

test('reload and a second form share only bounded opaque receipt keys, with a session fallback', () => {
  const local = storage(), session = storage();
  const first: LeadConversionScope = { localStorage: local, sessionStorage: session };
  const ack = { ok: true, id: 'lead_reload' };
  assert.equal(shouldTrackLead(ack, RID, first), true);
  assert.equal(shouldTrackLead(ack, RID, { localStorage: local }), false);
  assert.equal(shouldTrackLead(ack, RID, { sessionStorage: session }), false);
  assert.deepEqual(JSON.parse(local.data[KEY]).map((row: unknown[]) => row[0]), ['id:lead_reload']);
  for (let i = 0; i < 140; i++) shouldTrackLead({ ok: true, id: `lead_${i}` }, RID, first);
  assert.equal(JSON.parse(local.data[KEY]).length, 100);
  assert.equal(Object.keys(first.__gptbotLeadConversions ?? {}).length, 100);
});

test('storage getter/read/write failures preserve intake and suppress repeats in the current page', () => {
  const blocked: LeadConversionScope = {};
  Object.defineProperty(blocked, 'localStorage', { get() { throw new Error('SecurityError'); } });
  Object.defineProperty(blocked, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
  const ack = { ok: true, id: 'lead_no_storage', duplicate: true, idempotent: true };
  assert.equal(shouldTrackLead(ack, RID, blocked), true);
  assert.equal(shouldTrackLead(ack, RID, blocked), false);
  const malformed = { localStorage: storage({ [KEY]: '{broken' }) };
  assert.equal(shouldTrackLead(ack, RID, malformed), true);
  const quota = { localStorage: { getItem() { return null; }, setItem() { throw new Error('QuotaExceeded'); } } };
  assert.equal(shouldTrackLead(ack, RID, quota), true);
  assert.equal(shouldTrackLead(ack, RID, quota), false);
});

test('old ok:true without id remains compatible and uses request id only for local dedupe', () => {
  const local = storage();
  assert.equal(shouldTrackLead({ ok: true }, RID, { localStorage: local }), true);
  assert.equal(shouldTrackLead({ ok: true }, RID, { localStorage: local }), false);
  assert.equal(shouldTrackLead({ ok: true, duplicate: true }, RID, {}), false);
  assert.equal(shouldTrackLead({ ok: true }, '', {}), false);
});

test('expired and malformed ledger records cannot suppress a newly acknowledged lead', () => {
  const local = storage({ [KEY]: JSON.stringify([
    ['id:lead_old', Date.now() - 31 * 86400000], ['id:lead_future', Date.now() + 86400000], ['private@example.com', Date.now()],
  ]) });
  assert.equal(shouldTrackLead({ ok: true, id: 'lead_old' }, RID, { localStorage: local }), true);
  assert.equal(JSON.parse(local.data[KEY]).length, 1);
});

test('chat adapter preserves acknowledgement metadata and first-touch payload, including old acknowledgements', async () => {
  const original = globalThis.fetch;
  const payload: LeadPayload = {
    requestId: RID, consent: true, source: 'chat_b2b', service: 'crm-integration', locale: 'uz',
    contactType: 'telegram', contactValue: '@fixture_contact',
    attribution: { landing: '/uz/chat-bot-narxi/', referrerHost: 'google.com' },
    utm: { utm_source: 'google', utm_medium: 'organic' },
  };
  try {
    for (const response of [{ ok: true }, { ok: true, id: 'lead_ack', delivery: 'pending' }, { ok: true, id: 'lead_ack', duplicate: true, idempotent: true }]) {
      globalThis.fetch = (async (url, init) => {
        assert.equal(url, '/api/gpt/lead');
        assert.deepEqual(JSON.parse(String(init?.body)), payload);
        return Response.json(response);
      }) as typeof fetch;
      assert.deepEqual(await sendLead('', payload), response);
    }
    globalThis.fetch = (async () => Response.json({ ok: false, code: 'rate_limited', message: 'Private server detail' }, { status: 429 })) as typeof fetch;
    assert.deepEqual(await sendLead('', payload), { ok: false, code: 'rate_limited' });
    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    assert.deepEqual(await sendLead('', payload), { ok: false, code: 'network' });
  } finally { globalThis.fetch = original; }
});

test('shared attribution uses first touch after navigation and current campaign when present', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const first = { landing: '/uz/chat-bot-narxi/', referrerHost: 'google.com', utm_source: 'google', utm_medium: 'organic', gclid: 'fixture_click' };
  const local = storage({ gptbot_ft_v1: JSON.stringify(first) });
  try {
    globalThis.window = { localStorage: local, location: { pathname: '/ru/gpt-chat/', search: '', hostname: 'gptbot.uz' } } as unknown as Window & typeof globalThis;
    globalThis.document = { referrer: 'https://gptbot.uz/uz/chat-bot-narxi/' } as Document;
    const record = readFirstTouch();
    assert.deepEqual(leadAttribution(record), { landing: first.landing, referrerHost: first.referrerHost, gclid: first.gclid });
    assert.deepEqual(leadUtm(record), { utm_source: 'google', utm_medium: 'organic' });
    window.location.search = '?utm_source=telegram&utm_medium=social&phone=private';
    assert.deepEqual(leadUtm(record), { utm_source: 'telegram', utm_medium: 'social' });
    assert.deepEqual(leadAttribution({}), { landing: '/ru/gpt-chat/' });
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

test('local endpoint stores task privately, preserves durable dedupe, and rate limit never claims storage', async () => {
  const db = new SqliteD1();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('No external calls allowed'); }) as typeof fetch;
  const pending: Promise<unknown>[] = [];
  async function submit(requestId: string, contact: string) {
    const response = await onRequestPost({
      request: new Request('https://gptbot.uz/api/gpt/lead', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.17', 'Content-Type': 'application/json' }, body: JSON.stringify({
        requestId, consent: true, contactValue: contact, source: 'page_form', service: 'lead-bot', intent: 'Private task: call Ali before Friday',
      }) }),
      env: { GPTBOT_DRAFTS_DB: db.asD1(), GPT_HASH_SALT: 'fixture-salt' },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as never);
    await Promise.all(pending.splice(0));
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
  try {
    const created = await submit(RID, '901234567');
    assert.equal(created.status, 200);
    assert.equal(created.body.delivery, 'pending');
    assert.equal(db.value('SELECT intent FROM gpt_leads'), 'Private task: call Ali before Friday');
    assert.doesNotMatch(String(db.value("SELECT payload_json FROM gpt_events WHERE event_name='GPTChatLeadSubmitted'")), /Private|Ali|Friday/);
    const retry = await submit(RID, '901234567');
    assert.equal(retry.body.idempotent, true);
    assert.equal(retry.body.id, created.body.id);
    const duplicate = await submit('request_contact_000002', '901234567');
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.idempotent, undefined);
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_leads'), 1);
    assert.equal(db.value('SELECT COUNT(*) FROM gpt_lead_outbox'), 1);
    let refusal: Awaited<ReturnType<typeof submit>> | undefined;
    for (let i = 0; i < 6; i++) {
      const response = await submit(`request_rate_limit_000${i}`, `90123456${i}`);
      if (response.status === 429) { refusal = response; break; }
    }
    assert.ok(refusal);
    assert.equal(refusal.body.ok, false);
    assert.equal(refusal.body.code, 'rate_limited');
    assert.match(String(refusal.body.message), /не сохранена/);
    assert.doesNotMatch(String(refusal.body.message), /уже получили/);
    assert.ok(Number(refusal.body.retryAfterSeconds) > 0);
  } finally { globalThis.fetch = original; }
});
