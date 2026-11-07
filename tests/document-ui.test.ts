import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentAttempt, createDocumentReadGate, createDocumentsApi, documentActive, documentExpired, presentationDocument, type DocumentJob } from '../apps/studio/src/tools/presentation/document-api';

const job: DocumentJob = { id: 'doc_example0000000000001', type: 'presentation_pdf', status: 'queued', createdAt: 1000, updatedAt: 1000, expiresAt: 86_401_000, attempts: 0, errorCode: null };
const input = presentationDocument({ title: 'Тема', subtitle: 'Обложка', slides: [{ index: 1, title: 'Слайд', bullets: ['Факт'], layout: 'image-right', notes: 'Заметки' }] }, 'ru');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('document export preserves cover, subtitle and notes without uploading image prompts or layout metadata', () => {
  assert.deepEqual(input, { type: 'presentation_pdf', payload: { locale: 'ru', title: 'Тема', slides: [{ title: 'Тема', bullets: ['Обложка'] }, { title: 'Слайд', bullets: ['Факт'], notes: 'Заметки' }] } });
  const emptySubtitle = presentationDocument({ title: 'Sarlavha', subtitle: '', slides: [] }, 'uz');
  assert.deepEqual(emptySubtitle.payload.slides, [{ title: 'Sarlavha', bullets: [] }]);
});

test('lost create response and explicit retry reuse one idempotency key; confirmed create starts a fresh attempt', async () => {
  const requests: RequestInit[] = [];
  let generated = 0;
  const attempt = createDocumentAttempt(() => `attempt_${String(++generated).padStart(16, '0')}`);
  const api = createDocumentsApi({ fetch: async (_url, init) => {
    requests.push(init);
    if (requests.length === 1) throw new TypeError('Network lost after acceptance');
    return json({ ok: true, job, replay: true });
  } });
  const firstKey = attempt.key(input);
  assert.deepEqual(await api.create(input, firstKey), { ok: false, status: 0, code: 'network' });
  assert.equal(requests.length, 1, 'no automatic mutation retry');
  const retryKey = attempt.key(structuredClone(input));
  assert.equal(retryKey, firstKey);
  const retry = await api.create(input, retryKey);
  assert.equal(retry.ok, true);
  if (retry.ok) attempt.accepted(retryKey);
  assert.notEqual(attempt.key(input), firstKey);
  assert.equal((requests[0].headers as Record<string, string>)['Idempotency-Key'], (requests[1].headers as Record<string, string>)['Idempotency-Key']);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].credentials, 'same-origin');
  assert.equal(requests[0].cache, 'no-store');
});

test('changed document gets a different attempt; stale response cannot clear the current retry key', () => {
  let next = 0;
  const attempt = createDocumentAttempt(() => `attempt_${String(++next).padStart(16, '0')}`);
  const original = attempt.key(input);
  const edited = { ...input, payload: { ...input.payload, title: 'Правка' } };
  const current = attempt.key(edited);
  assert.notEqual(current, original);
  attempt.accepted(original);
  assert.equal(attempt.key(edited), current);
});

test('slow status reads remain single-flight across repeated poll ticks and cannot starve the response', async () => {
  const gate = createDocumentReadGate();
  let resolveRead!: () => void;
  const deferred = new Promise<void>(resolve => { resolveRead = resolve; });
  let reads = 0, applied = 0;
  const refresh = () => gate.run(async () => { reads++; await deferred; applied++; });
  const first = refresh();
  await Promise.resolve();
  assert.equal(reads, 1);
  for (let tick = 0; tick < 5; tick++) assert.equal(refresh(), first);
  assert.equal(reads, 1, 'poll ticks never issue overlapping GETs or invalidate the pending read');
  resolveRead();
  await first;
  assert.equal(applied, 1, 'the slow response is applied exactly once');
  await refresh();
  assert.equal(reads, 2, 'next refresh starts normally after settlement');
  const rejected = gate.run(async () => { throw new Error('offline'); });
  await assert.rejects(rejected, /offline/);
  await refresh();
  assert.equal(reads, 3, 'rejected reads do not leave the gate locked');
});

test('capability/list restores server jobs with GET only and disabled service remains an error', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const api = createDocumentsApi({ fetch: async (url, init) => { calls.push({ url, init }); return json({ ok: true, jobs: [job], retentionHours: 24 }); } });
  assert.deepEqual(await api.list(), { ok: true, data: [job] });
  assert.deepEqual(calls.map(call => [call.url, call.init.method, call.init.body]), [['/api/studio/documents', 'GET', undefined]]);
  const disabled = createDocumentsApi({ fetch: async () => json({ ok: false, error: 'documents_unavailable' }, 503) });
  assert.deepEqual(await disabled.list(), { ok: false, status: 503, code: 'documents_unavailable' });
});

test('malformed success cannot become a ready job, and error messages are bounded contract codes', async () => {
  for (const bad of [{ ok: true, job: { ...job, status: 'done' } }, { ok: true, job: { ...job, expiresAt: 'tomorrow' } }, { ok: false, job }]) {
    const api = createDocumentsApi({ fetch: async () => json(bad) });
    assert.deepEqual(await api.get(job.id), { ok: false, status: 200, code: 'invalid_response' });
  }
  const html = createDocumentsApi({ fetch: async () => new Response('<html>login</html>', { status: 200 }) });
  assert.deepEqual(await html.list(), { ok: false, status: 200, code: 'invalid_response' });
  const denied = createDocumentsApi({ fetch: async () => json({ error: 'Sensitive arbitrary server message' }, 403) });
  assert.deepEqual(await denied.list(), { ok: false, status: 403, code: 'forbidden' });
});

test('owner download sends existing Bearer auth in header and only accepts actual PDF bytes', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const api = createDocumentsApi({ base: '/api/admin/documents', token: () => 'test-owner-token', fetch: async (url, init) => {
    seen.push({ url, init });
    return new Response('%PDF-1.7\nfixture', { headers: { 'Content-Type': 'application/pdf' } });
  } });
  const result = await api.download(job.id);
  assert.ok(result.ok && result.data.type === 'application/pdf');
  assert.equal(seen[0].url, `/api/admin/documents/${job.id}/download`);
  assert.equal((seen[0].init.headers as Record<string, string>).Authorization, 'Bearer test-owner-token');
  for (const [body, mime] of [['<html>Login</html>', 'text/html'], ['not pdf', 'application/pdf'], ['', 'application/pdf']]) {
    const invalid = createDocumentsApi({ fetch: async () => new Response(body, { headers: { 'Content-Type': mime } }) });
    assert.deepEqual(await invalid.download(job.id), { ok: false, status: 200, code: 'invalid_response' });
  }
});

test('cancel is explicit POST, follows server state, and unsafe IDs never reach fetch', async () => {
  const calls: RequestInit[] = [];
  const api = createDocumentsApi({ fetch: async (_url, init) => { calls.push(init); return json({ ok: true, job: { ...job, status: 'cancelled' } }); } });
  const result = await api.cancel(job.id);
  assert.ok(result.ok && result.data.status === 'cancelled');
  assert.equal(calls[0].method, 'POST');
  for (const id of ['../me', 'https://example.com', `${job.id}/other`]) {
    assert.equal((await api.download(id)).ok, false);
    assert.equal((await api.cancel(id)).ok, false);
    assert.equal((await api.get(id)).ok, false);
  }
  assert.equal(calls.length, 1);
});

test('timeout is an uncertain failure and terminal or expired jobs are not active work', async () => {
  const api = createDocumentsApi({ timeout: 10, fetch: async (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.deepEqual(await api.create(input, 'attempt_0000000000000001'), { ok: false, status: 0, code: 'timeout' });
  assert.equal(documentActive(job), true);
  assert.equal(documentActive({ ...job, status: 'running' }), true);
  for (const status of ['ready', 'failed', 'cancelled', 'expired'] as const) assert.equal(documentActive({ ...job, status }), false);
  assert.equal(documentExpired(job, job.expiresAt - 1), false);
  assert.equal(documentExpired(job, job.expiresAt), true);
});
