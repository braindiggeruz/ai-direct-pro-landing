import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postLeadJson, prepareLeadRequest } from '../src/shared/lead-client';

test('a retry retains its key across field order and refreshed challenge tokens, but edits get a new key', () => {
  const payload = { name: 'Fixture', contactValue: '@fixture_user', budget: '2-5m', intent: 'Telegram bot', utm: { goal: 'leads', estimate_min: '1000' } };
  const first = prepareLeadRequest(payload, null, 'lead');
  assert.match(first.requestId, /^[A-Za-z0-9_-]{16,80}$/);
  const reordered = { utm: { estimate_min: '1000', goal: 'leads' }, intent: payload.intent, budget: payload.budget, contactValue: payload.contactValue, name: payload.name, requestId: 'ignored', turnstileToken: 'refreshed-token' };
  assert.equal(prepareLeadRequest(reordered, first, 'lead'), first);
  for (const edit of [
    { name: 'Updated fixture' }, { contactValue: '@different_fixture' }, { budget: 'gt5m' },
    { intent: 'Updated scope' }, { utm: { goal: 'leads', estimate_min: '2000' } },
  ]) {
    assert.notEqual(prepareLeadRequest({ ...payload, ...edit }, first, 'lead').requestId, first.requestId);
  }
});

test('lead transport aborts a stalled fetch, including implementations which ignore the signal', async () => {
  let signal: AbortSignal | undefined;
  const stalled = ((_url: unknown, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return new Promise<Response>(() => {});
  }) as typeof fetch;
  await assert.rejects(postLeadJson('/api/gpt/lead', { consent: true }, stalled, 5), { name: 'LeadTimeoutError' });
  assert.equal(signal?.aborted, true);
});

test('lead deadline covers the response body and does not treat a late body as success', async () => {
  let resolve!: (value: unknown) => void;
  const lateBody = new Promise((done) => { resolve = done; });
  const stalledBody = (async () => ({ json: () => lateBody })) as typeof fetch;
  await assert.rejects(postLeadJson('/api/gpt/lead', { consent: true }, stalledBody, 5), { name: 'LeadTimeoutError' });
  resolve({ ok: true });
});

test('successful lead transport sends one JSON POST and keeps acknowledgements intact', async () => {
  let count = 0;
  const response = { ok: true, duplicate: true, idempotent: true, id: 'fixture_lead' };
  const fake = (async (url: string, init: RequestInit) => {
    count++;
    assert.equal(url, '/api/gpt/lead');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.body, '{"requestId":"fixture_request_id"}');
    return new Response(JSON.stringify(response));
  }) as typeof fetch;
  assert.deepEqual(await postLeadJson('/api/gpt/lead', { requestId: 'fixture_request_id' }, fake), response);
  assert.equal(count, 1);
});
