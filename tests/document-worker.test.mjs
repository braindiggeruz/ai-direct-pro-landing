import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../apps/document-worker/src/config.mjs';
import { validatePayload, validateJob, DocumentError } from '../apps/document-worker/src/schema.mjs';
import { createDocumentHtml, escapeHtml } from '../apps/document-worker/src/template.mjs';
import { createApiClient, ApiError } from '../apps/document-worker/src/client.mjs';
import { createWorker, backoffMs } from '../apps/document-worker/src/worker.mjs';

const secret = 'test-only-document-worker-secret-00000000';
const config = { ...readConfig({ DOCUMENT_API_BASE_URL: 'https://gptbot.uz', DOCUMENT_WORKER_SECRET: secret }), shutdownMs: 10 };
const proposal = { locale: 'ru', packageId: 'custom', company: 'Тестовая компания', objective: 'Подготовить документ.', scope: ['Дизайн', 'Согласование'], budgetTerms: 'Стоимость согласуется отдельно.' };
const job = () => ({ id: 'document_test_12345', type: 'proposal_pdf', payload: proposal, leaseToken: 'lease-test-only-0000000000000000', leaseExpiresAt: Date.now() + 120000, attempt: 1 });
const pdf = Buffer.from('%PDF-1.7\nfixture');

test('config rejects non-HTTPS, credentials, redirects targets, paths, unlisted hosts and weak secrets', () => {
  for (const url of ['http://gptbot.uz', 'https://gptbot.uz.evil.test', 'https://127.0.0.1', 'https://gptbot.uz/path', 'https://x:pw@gptbot.uz', 'https://gptbot.uz:444', 'https://gptbot.uz/?secret=x']) {
    assert.throws(() => readConfig({ DOCUMENT_API_BASE_URL: url, DOCUMENT_WORKER_SECRET: secret }), /invalid_config/);
  }
  assert.throws(() => readConfig({ DOCUMENT_API_BASE_URL: 'https://gptbot.uz', DOCUMENT_WORKER_SECRET: 'weak' }), /invalid_config/);
  assert.throws(() => readConfig({ DOCUMENT_API_BASE_URL: 'https://gptbot.uz', DOCUMENT_WORKER_SECRET: secret, DOCUMENT_POLL_SECONDS: '1' }), /invalid_config/);
  assert.equal(readConfig({ DOCUMENT_API_BASE_URL: 'https://preview.pages.dev', DOCUMENT_API_ALLOWED_HOSTS: 'preview.pages.dev', DOCUMENT_WORKER_SECRET: secret }).apiBase, 'https://preview.pages.dev');
});

test('strict schema bounds content and accepts only explicit custom proposal terms', () => {
  assert.equal(validatePayload('proposal_pdf', proposal), proposal);
  for (const payload of [{ ...proposal, html: '<script />' }, { ...proposal, locale: 'en' }, { ...proposal, packageId: 'invented-price' }, { ...proposal, objective: 'x'.repeat(5001) }, { ...proposal, scope: Array(31).fill('x') }, { ...proposal, company: '\u0000' }]) {
    assert.throws(() => validatePayload('proposal_pdf', payload), /invalid_payload/);
  }
  assert.throws(() => validatePayload('url_pdf', { url: 'https://example.test' }), /invalid_payload/);
  assert.throws(() => validatePayload('presentation_pdf', { locale: 'uz', title: 'Title', slides: [] }), /invalid_payload/);
  assert.throws(() => validateJob({ ...job(), attempt: 4 }), /invalid_payload/);
  assert.throws(() => validateJob({ ...job(), leaseExpiresAt: 'tomorrow' }), /invalid_payload/);
});

test('templates escape active HTML and embed Cyrillic/Uzbek fonts without remote assets', async () => {
  const attack = '<img src="https://attacker.invalid/x"><script>fetch("/secret")</script>&';
  const html = await createDocumentHtml('proposal_pdf', { ...proposal, objective: attack });
  assert.ok(html.includes(escapeHtml(attack)));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img '));
  assert.ok(html.includes("script-src 'none'"));
  assert.ok(html.includes('data:font/woff2;base64,'));
  assert.ok(!/url\(["']?https?:/i.test(html));
  const uz = await createDocumentHtml('presentation_pdf', { locale: 'uz', title: 'O‘zbekcha', slides: [{ title: 'G‘oya', bullets: ['Ўзбек тили: ғ қ ҳ ў', 'O‘zgartirish'], notes: 'Izoh' }] });
  assert.ok(uz.includes('Ўзбек тили'));
});

test('client sends only worker bearer/lease and refuses redirects', async () => {
  const calls = [];
  const client = createApiClient(config, async (url, init) => {
    calls.push({ url, init });
    return Response.json(url.endsWith('/claim') ? { ok: true, job: null } : { ok: true, status: 'ready' });
  });
  assert.equal(await client.claim(), null);
  await client.complete(job(), pdf);
  await client.fail(job(), 'timeout');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${secret}`);
  assert.equal(calls[1].init.headers['x-document-lease'], job().leaseToken);
  assert.equal(calls[1].init.headers['content-type'], 'application/pdf');
  assert.equal(calls[2].init.body, '{"reason":"timeout"}');
  assert.equal(calls[0].init.headers.cookie, undefined);
});

test('client limits response bytes and rejects malformed success envelopes', async () => {
  const huge = createApiClient(config, async () => new Response('x'.repeat(1024 * 1024 + 16385)));
  await assert.rejects(huge.claim(), ApiError);
  const bad = createApiClient(config, async () => Response.json({ anything: true }));
  await assert.rejects(bad.claim(), ApiError);
  const stale = createApiClient(config, async () => new Response('', { status: 409 }));
  await assert.rejects(stale.complete(job(), pdf), error => error.status === 409);
});

test('backoff is bounded, never busy polls offline, and caps at five minutes', () => {
  assert.equal(backoffMs(1, 20000, () => 0), 20000);
  assert.equal(backoffMs(2, 20000, () => 0), 40000);
  assert.equal(backoffMs(20, 20000, () => 1), 300000);
});

test('worker completes one render and emits only safe metrics', async () => {
  const events = []; const done = [];
  const worker = createWorker({ config, api: { complete: async (...args) => done.push(args), fail: async () => assert.fail('unexpected fail') },
    render: async (_job, options) => { assert.ok(options.timeoutMs <= 75000); return { pdf, pages: 2, renderRssBytes: 123 }; }, log: value => events.push(value) });
  await worker.processJob(job());
  assert.equal(done.length, 1); assert.equal(worker.state.completed, 1); assert.equal(worker.state.busy, false);
  const logs = JSON.stringify(events); assert.ok(!logs.includes(secret)); assert.ok(!logs.includes(proposal.company)); assert.ok(!logs.includes('lease-test'));
});

test('worker rejects invalid payload before renderer and reports terminal reason', async () => {
  const failed = [];
  const worker = createWorker({ config, api: { fail: async (_job, reason) => failed.push(reason) }, render: () => assert.fail('renderer must not run') });
  await worker.processJob({ ...job(), payload: { ...proposal, html: '<h1>no</h1>' } });
  assert.deepEqual(failed, ['invalid_payload']);
});

test('worker treats timeouts as retryable via ledger and does not retry stale leases locally', async () => {
  const failed = [];
  const api = { fail: async (_job, reason) => failed.push(reason), complete: async () => { throw new ApiError(409); } };
  const worker = createWorker({ config, api, render: async () => ({ pdf, pages: 1 }) });
  await worker.processJob({ ...job(), leaseExpiresAt: Date.now() + 1000 });
  assert.deepEqual(failed, ['timeout']);
  failed.length = 0;
  await worker.processJob(job()); assert.deepEqual(failed, []);
});

test('loop processes serially and shutdown interrupts idle polling immediately', async () => {
  let claims = 0; let active = 0; let peak = 0; let completions = 0;
  let resolveDone; const done = new Promise(resolve => { resolveDone = resolve; });
  const worker = createWorker({ config, api: { claim: async () => ++claims <= 2 ? job() : null, complete: async () => { if (++completions === 2) resolveDone(); }, fail: async () => assert.fail('unexpected') },
    render: async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return { pdf, pages: 1 }; } });
  const running = worker.start(); await done; await worker.stop(); await running;
  assert.equal(peak, 1); assert.equal(completions, 2); assert.equal(worker.state.stopping, true);
});

test('shutdown aborts a stuck active render and releases its lease through fail', async () => {
  let started; const ready = new Promise(resolve => { started = resolve; }); const failed = [];
  const worker = createWorker({ config, api: { claim: async () => job(), fail: async (_job, reason) => failed.push(reason) },
    render: async (_job, _options, signal) => new Promise((_, reject) => { started(); signal.addEventListener('abort', () => reject(new DocumentError('timeout')), { once: true }); }) });
  const running = worker.start(); await ready; await worker.stop(); await running;
  assert.deepEqual(failed, ['timeout']); assert.equal(worker.state.busy, false);
});

test('offline API gets one bounded retry wait and remains stoppable', async () => {
  let reached; const ready = new Promise(resolve => { reached = resolve; }); let claims = 0; const events = [];
  const worker = createWorker({ config, api: { claim: async () => { claims++; throw new Error('network secret never logged'); } }, random: () => 0,
    log: event => { events.push(event); reached(); } });
  const running = worker.start(); await ready; await worker.stop(); await running;
  assert.equal(claims, 1); assert.equal(events[0].retryAfterMs, 20000); assert.ok(!JSON.stringify(events).includes('network secret'));
});

test('maintenance client uses bounded cursor envelope and rejects malformed replies', async () => {
  let body;
  const client = createApiClient(config, async (_url, init) => { body = init.body; return Response.json({ ok: true, expired: 1, orphanObjectsDeleted: 2, cursor: 'next-page' }); });
  assert.equal((await client.maintenance('prior-page')).cursor, 'next-page');
  assert.equal(body, '{"cursor":"prior-page"}');
  const bad = createApiClient(config, async () => Response.json({ ok: true, expired: 0, orphanObjectsDeleted: 0, cursor: {} }));
  await assert.rejects(bad.maintenance(), ApiError);
});

test('maintenance preserves cursor, runs one request at a time and does not block rendering', async () => {
  let active = 0; let peak = 0; let claimCount = 0; let completeCount = 0;
  const cursors = []; let reached; const ready = new Promise(resolve => { reached = resolve; });
  const worker = createWorker({ config: { ...config, maintenanceMs: 5 }, api: {
    maintenance: async cursor => {
      cursors.push(cursor); active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 15)); active--;
      if (cursors.length === 2) reached();
      return { cursor: cursors.length === 1 ? 'next-page' : null, expired: 0, orphanObjectsDeleted: 0 };
    }, claim: async () => ++claimCount === 1 ? job() : null,
    complete: async () => { completeCount++; }, fail: async () => assert.fail('unexpected'),
  }, render: async () => ({ pdf, pages: 1 }) });
  const running = worker.start(); await ready; await worker.stop(); await running;
  assert.deepEqual(cursors, [null, 'next-page']); assert.equal(peak, 1); assert.equal(completeCount, 1);
});

test('maintenance outage backs off independently while the job finishes', async () => {
  let reached; const ready = new Promise(resolve => { reached = resolve; }); const events = []; let claims = 0;
  const worker = createWorker({ config, random: () => 0, log: value => events.push(value), api: {
    maintenance: async () => { throw new Error('sensitive-body'); }, claim: async () => ++claims === 1 ? job() : null,
    complete: async () => reached(), fail: async () => assert.fail('unexpected'),
  }, render: async () => ({ pdf, pages: 1 }) });
  const running = worker.start(); await ready; await worker.stop(); await running;
  assert.equal(worker.state.completed, 1); assert.equal(events.find(event => event.event === 'document_maintenance_unavailable').retryAfterMs, 60000);
  assert.ok(!JSON.stringify(events).includes('sensitive-body'));
});
