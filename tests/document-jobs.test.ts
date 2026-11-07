import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import { SqliteD1 } from './helpers/sqlite-d1';
import { DocumentStore } from '../functions/platform/documents/store';
import { ensureDocumentSchema } from '../functions/platform/documents/schema';
import { handleInternalDocuments, handlePublicDocuments, readDocumentBytes } from '../functions/platform/documents/http';
import { DOCUMENT_LEASE_MS, DOCUMENT_ORG, DOCUMENT_TTL_MS, DocumentError, type DocumentCreate, type DocumentEnv } from '../functions/platform/documents/types';
import { hashDocument, validateDocumentCreate } from '../functions/platform/documents/validation';
import { onRequest as studioRoute } from '../functions/api/studio/documents/[[path]]';
import { onRequest as ownerRoute } from '../functions/api/admin/documents/[[path]]';
import { mintIdentity } from '../functions/lib/studio/identity';

const NOW = 1_799_000_000_000;
const INPUT: DocumentCreate = { type: 'presentation_pdf', payload: { locale: 'ru', title: 'Документ', slides: [{ title: 'Слайд', bullets: ['Текст'] }] } };
const SECRET = 'test-only-document-worker-secret-32-characters';
const PDF = new TextEncoder().encode('%PDF-1.7\nfixture\n%%EOF');
class Bucket {
  objects = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  onPut?: () => Promise<void>;
  async put(key: string, bytes: Uint8Array) {
    this.objects.set(key, { bytes, uploaded: new Date() });
    await this.onPut?.();
    return {};
  }
  async get(key: string) {
    const row = this.objects.get(key);
    return row ? { body: row.bytes, size: row.bytes.length } : null;
  }
  async delete(key: string) { this.objects.delete(key); }
  async list() { return { objects: Array.from(this.objects, ([key, row]) => ({ key, uploaded: row.uploaded })), truncated: false }; }
}
async function fixture() {
  const db = new SqliteD1();
  await ensureDocumentSchema(db.asD1());
  const bucket = new Bucket();
  const store = new DocumentStore(db.asD1());
  const env: DocumentEnv = { DOCUMENT_JOBS_ENABLED: 'true', DOCUMENT_WORKER_SECRET: SECRET, GPTBOT_DRAFTS_DB: db.asD1(), DOCUMENT_ARTIFACTS: bucket as unknown as R2Bucket };
  return { db, bucket, store, env };
}
function internal(path: string, body?: unknown, token?: string): Request {
  const bytes = body instanceof Uint8Array;
  return new Request(`https://gptbot.uz/api/internal/documents/${path}`, { method: 'POST', headers: {
    Authorization: `Bearer ${SECRET}`, ...(body === undefined ? {} : { 'Content-Type': bytes ? 'application/pdf' : 'application/json' }), ...(token ? { 'X-Document-Lease': token } : {}),
  }, body: body === undefined ? undefined : bytes ? body : JSON.stringify(body) });
}
function publicRequest(path = '', method = 'GET', body?: unknown, key = 'idempotency-key-0001') {
  return new Request(`https://gptbot.uz/api/studio/documents${path}`, { method, headers: { Origin: 'https://gptbot.uz', 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const make = (store: DocumentStore, key = 'idempotency-key-0001', subject = 'subject-a', now = NOW, org = DOCUMENT_ORG, subjectLimit = 3, globalLimit = 20) =>
  store.create(org, subject, key, 'hash-of-input', INPUT, now, subjectLimit, globalLimit);

test('bootstrap and migration create the same schema and are safely repeatable', async () => {
  const { db } = await fixture();
  await ensureDocumentSchema(db.asD1());
  const migrated = new SqliteD1();
  migrated.exec(readFileSync(new URL('../migrations/0079_document_jobs.sql', import.meta.url), 'utf8'));
  const columns = (d: SqliteD1) => d.rows('PRAGMA table_info(document_jobs)');
  assert.deepEqual(columns(db), columns(migrated));
  assert.deepEqual(db.rows('PRAGMA index_list(document_jobs)'), migrated.rows('PRAGMA index_list(document_jobs)'));
});
test('idempotency returns one ledger job, while payload mismatch is a closed409', async () => {
  const { store, db } = await fixture();
  const first = await make(store);
  const again = await make(store);
  assert.equal(first.job.id, again.job.id);
  assert.equal(again.replay, true);
  await assert.rejects(store.create(DOCUMENT_ORG, 'subject-a', 'idempotency-key-0001', 'different', INPUT, NOW, 3, 20), (error: unknown) => error instanceof DocumentError && error.code === 'idempotency_conflict');
  assert.equal(db.value('SELECT COUNT(*) FROM document_jobs'), 1);
});
test('org and subject isolation cover reads, lists, cancellation, and idempotency keys', async () => {
  const { store } = await fixture();
  const { job } = await make(store);
  assert.equal(await store.get('org-b', 'subject-a', job.id), null);
  assert.equal(await store.get(DOCUMENT_ORG, 'subject-b', job.id), null);
  assert.deepEqual(await store.list('org-b', 'subject-a'), []);
  assert.deepEqual(await store.list(DOCUMENT_ORG, 'subject-b'), []);
  assert.equal(await store.cancel('org-b', 'subject-a', job, NOW), false);
  assert.equal(await store.cancel(DOCUMENT_ORG, 'subject-b', job, NOW), false);
  const second = await make(store, 'idempotency-key-0001', 'subject-b');
  assert.notEqual(second.job.id, job.id);
});
test('atomic daily quota counts cancelled jobs and serializes concurrent creates', async () => {
  const { store } = await fixture();
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => make(store, `idempotency-key-${index}`, 'subject-a')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  const job = (await store.list(DOCUMENT_ORG, 'subject-a'))[0];
  await store.cancel(DOCUMENT_ORG, 'subject-a', job, NOW);
  await assert.rejects(make(store, 'another-unique-key'), /quota_exceeded/);
  assert.ok(await make(store, 'tomorrow-unique-key', 'subject-a', NOW + DOCUMENT_TTL_MS));
});
test('global daily quota spans subjects and orgs', async () => {
  const { store } = await fixture();
  await make(store, 'idempotency-key-0001', 'a', NOW, 'a', 3, 2);
  await make(store, 'idempotency-key-0001', 'b', NOW, 'b', 3, 2);
  await assert.rejects(make(store, 'idempotency-key-0001', 'c', NOW, 'c', 3, 2), /quota_exceeded/);
});
test('one job has one current lease; crash retry changes token and rejects stale completion', async () => {
  const { store } = await fixture();
  await make(store);
  const [a, b] = await Promise.all([store.claim(DOCUMENT_ORG, NOW), store.claim(DOCUMENT_ORG, NOW)]);
  const first = a ?? b;
  assert.ok(first);
  assert.equal(Number(Boolean(a)) + Number(Boolean(b)), 1);
  assert.equal(await store.claim(DOCUMENT_ORG, NOW + 1), null);
  const retry = await store.claim(DOCUMENT_ORG, NOW + DOCUMENT_LEASE_MS);
  assert.ok(retry);
  assert.equal(retry.attempts, 2);
  assert.notEqual(retry.lease_token, first.lease_token);
  assert.equal(await store.complete(DOCUMENT_ORG, first.id, first.lease_token!, 'stale.pdf', 20, NOW + DOCUMENT_LEASE_MS), false);
  assert.equal(await store.fail(DOCUMENT_ORG, first.id, first.lease_token!, 'render_failed', NOW + DOCUMENT_LEASE_MS), false);
  assert.equal(await store.complete(DOCUMENT_ORG, retry.id, retry.lease_token!, 'ready.pdf', 20, NOW + DOCUMENT_LEASE_MS), true);
  assert.equal(await store.fail(DOCUMENT_ORG, retry.id, retry.lease_token!, 'render_failed', NOW + DOCUMENT_LEASE_MS), false);
  assert.equal((await store.workerGet(DOCUMENT_ORG, retry.id))?.status, 'ready');
});
test('three crashed attempts become failed with payload removed; no fourth lease', async () => {
  const { store } = await fixture();
  const { job } = await make(store);
  for (let i = 0; i < 3; i++) assert.equal((await store.claim(DOCUMENT_ORG, NOW + i * DOCUMENT_LEASE_MS))?.attempts, i + 1);
  assert.equal(await store.claim(DOCUMENT_ORG, NOW + 3 * DOCUMENT_LEASE_MS), null);
  const failed = await store.workerGet(DOCUMENT_ORG, job.id);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.payload_json, null);
});
test('cancelled running job cannot complete, fail or be claimed again', async () => {
  const { store } = await fixture();
  await make(store);
  const job = (await store.claim(DOCUMENT_ORG, NOW))!;
  assert.equal(await store.cancel(DOCUMENT_ORG, 'subject-a', job, NOW), true);
  assert.equal(await store.complete(DOCUMENT_ORG, job.id, job.lease_token!, 'cancelled.pdf', 20, NOW), false);
  assert.equal(await store.fail(DOCUMENT_ORG, job.id, job.lease_token!, 'timeout', NOW), false);
  assert.equal(await store.claim(DOCUMENT_ORG, NOW + DOCUMENT_LEASE_MS), null);
  assert.equal((await store.workerGet(DOCUMENT_ORG, job.id))?.payload_json, null);
});
test('invalid render payload is terminal; transient errors retry at most three times', async () => {
  const { store } = await fixture();
  await make(store);
  let job = (await store.claim(DOCUMENT_ORG, NOW))!;
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal(await store.fail(DOCUMENT_ORG, job.id, job.lease_token!, 'render_failed', NOW), true);
    if (attempt < 3) job = (await store.claim(DOCUMENT_ORG, NOW))!;
  }
  assert.equal((await store.workerGet(DOCUMENT_ORG, job.id))?.status, 'failed');
  await make(store, 'second-job-unique-key');
  job = (await store.claim(DOCUMENT_ORG, NOW))!;
  await store.fail(DOCUMENT_ORG, job.id, job.lease_token!, 'invalid_payload', NOW);
  assert.equal((await store.workerGet(DOCUMENT_ORG, job.id))?.payload_json, null);
  assert.equal(await store.claim(DOCUMENT_ORG, NOW), null);
});
test('validation forbids URL/assets/template fields, unknown types and consumer proposals', () => {
  const attacks = [
    { ...INPUT, payload: { ...INPUT.payload, url: 'http://169.254.169.254/latest/meta-data' } },
    { ...INPUT, payload: { ...INPUT.payload, html: '<img src="file:///etc/passwd">' } },
    { ...INPUT, type: 'html_pdf' },
    { ...INPUT, payload: { ...INPUT.payload, locale: ['ru'] } },
    { ...INPUT, payload: { ...INPUT.payload, slides: [{ title: 'x', bullets: [], imageUrl: 'http://localhost/' }] } },
    { ...INPUT, payload: { ...INPUT.payload, slides: Array.from({ length: 31 }, () => ({ title: 'x', bullets: [] })) } },
  ];
  for (const input of attacks) assert.throws(() => validateDocumentCreate(input, true), /invalid_payload/);
  const proposal = { type: 'proposal_pdf', payload: { locale: 'uz', company: 'Firma', objective: 'Vazifa', packageId: 'custom', budgetTerms: 'Owner supplied terms' } };
  assert.equal(validateDocumentCreate(proposal, true).type, 'proposal_pdf');
  assert.throws(() => validateDocumentCreate(proposal, false), /invalid_payload/);
  assert.throws(() => validateDocumentCreate({ ...proposal, payload: { ...proposal.payload, packageId: 'invented-tariff' } }, true), /invalid_payload/);
});
test('canonical validation yields the same hash independent of incoming object key order', async () => {
  const a = validateDocumentCreate(INPUT, false);
  const b = validateDocumentCreate({ payload: { slides: [{ bullets: ['Текст'], title: 'Слайд' }], title: 'Документ', locale: 'ru' }, type: 'presentation_pdf' }, false);
  assert.equal(await hashDocument(JSON.stringify(a)), await hashDocument(JSON.stringify(b)));
});
test('bounded body reader rejects oversized streamed input without trusting Content-Length', async () => {
  const request = new Request('https://gptbot.uz/', { method: 'POST', body: 'a'.repeat(1025) });
  await assert.rejects(readDocumentBytes(request, 1024), /payload_too_large/);
});
test('disabled routes and missing worker configuration fail closed before D1', async () => {
  const env = { GPTBOT_DRAFTS_DB: { prepare() { throw new Error('must not read'); } } };
  for (const route of [studioRoute, ownerRoute]) {
    const response = await route({ request: publicRequest(), env } as never);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'documents_unavailable');
  }
  const { env: configured } = await fixture();
  const response = await handleInternalDocuments(internal('claim'), { ...configured, DOCUMENT_WORKER_SECRET: 'short' });
  assert.equal(response.status, 503);
});
test('Studio route requires signed identity and exact same origin for mutation', async () => {
  const { env } = await fixture();
  const identityEnv = { ...env, GPT_IDENTITY_SECRET: 'test-only-studio-identity-secret-32-characters' };
  let response = await studioRoute({ request: publicRequest(), env: identityEnv } as never);
  assert.equal(response.status, 401);
  const identity = await mintIdentity(identityEnv);
  assert.ok(identity);
  const create = publicRequest('', 'POST', INPUT);
  create.headers.set('Cookie', identity.cookie.split(';')[0]);
  create.headers.set('Origin', 'https://evil.example');
  response = await studioRoute({ request: create, env: identityEnv } as never);
  assert.equal(response.status, 403);
  create.headers.set('Origin', 'https://gptbot.uz');
  response = await studioRoute({ request: create, env: identityEnv } as never);
  assert.equal(response.status, 201);
});
test('owner route honors signed owner/admin roles and rejects support role for documents', async () => {
  const { env } = await fixture();
  const ownerEnv = { ...env, JWT_SECRET: 'test-only-owner-jwt-secret-for-signature-checks' };
  const proposal = { type: 'proposal_pdf', payload: { locale: 'ru', company: 'Example', objective: 'Owner task', packageId: 'custom', budgetTerms: 'Owner manual terms' } };
  for (const role of ['support_readonly', 'platform_owner', 'admin']) {
    const token = await new SignJWT({ role, email: 'owner@example.test' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('gptbot-seo-admin').setExpirationTime('1h').sign(new TextEncoder().encode(ownerEnv.JWT_SECRET));
    const request = new Request('https://gptbot.uz/api/admin/documents', { method: 'POST', headers: {
      Origin: 'https://gptbot.uz', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': `owner-${role}-unique-key`,
    }, body: JSON.stringify(proposal) });
    const response = await ownerRoute({ request, env: ownerEnv, params: {}, waitUntil() {} } as never);
    assert.equal(response.status, role === 'support_readonly' ? 403 : 201);
  }
});
test('public read/list/download never reveal another subject or payload and have private headers', async () => {
  const { env, store } = await fixture();
  const { job } = await make(store, 'unique-key-for-http', 'subject-a', Date.now());
  for (const suffix of ['', '/download', '/cancel']) {
    const response = await handlePublicDocuments(publicRequest(`/${job.id}${suffix}`, suffix === '/cancel' ? 'POST' : 'GET'), env, 'subject-b', false);
    assert.equal(response.status, 404);
  }
  const response = await handlePublicDocuments(publicRequest(), env, 'subject-a', false);
  const body = await response.json();
  assert.equal(body.jobs.length, 1);
  assert.equal(body.retentionHours, 24);
  for (const field of ['subject', 'payload_json', 'payload_hash', 'lease_token', 'artifact_key']) assert.equal(field in body.jobs[0], false);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
test('worker authentication and failure vocabulary are closed', async () => {
  const { env, store } = await fixture();
  const denied = internal('claim');
  denied.headers.set('Authorization', 'Bearer wrong');
  assert.equal((await handleInternalDocuments(denied, env)).status, 403);
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const claim = await (await handleInternalDocuments(internal('claim'), env)).json();
  assert.equal((await handleInternalDocuments(internal(`${claim.job.id}/fail`, { reason: 'raw private exception' }, claim.job.leaseToken), env)).status, 400);
  assert.equal((await handleInternalDocuments(internal(`${claim.job.id}/fail`, { reason: 'timeout', stack: 'secret' }, claim.job.leaseToken), env)).status, 400);
  assert.equal((await handleInternalDocuments(internal(`${claim.job.id}/fail`, { reason: ['timeout'] }, claim.job.leaseToken), env)).status, 400);
});
test('PDF complete/download works and duplicate completion cannot replace committed bytes', async () => {
  const { env, store, bucket } = await fixture();
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const { job } = await (await handleInternalDocuments(internal('claim'), env)).json();
  const response = await handleInternalDocuments(internal(`${job.id}/complete`, PDF, job.leaseToken), env);
  assert.equal(response.status, 200);
  const duplicate = await handleInternalDocuments(internal(`${job.id}/complete`, new TextEncoder().encode('%PDF-1.7\nchanged\n%%EOF'), job.leaseToken), env);
  assert.equal((await duplicate.json()).replay, true);
  assert.equal(bucket.objects.size, 1);
  const download = await handlePublicDocuments(publicRequest(`/${job.id}/download`), env, 'subject-a', false);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('Content-Type'), 'application/pdf');
  assert.match(download.headers.get('Content-Disposition')!, /^attachment;/);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), PDF);
});
test('invalid and oversized PDF uploads leave the lease and artifact ledger untouched', async () => {
  const { env, store, bucket } = await fixture();
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const { job } = await (await handleInternalDocuments(internal('claim'), env)).json();
  assert.equal((await handleInternalDocuments(internal(`${job.id}/complete`, new TextEncoder().encode('not a PDF'), job.leaseToken), env)).status, 400);
  const large = internal(`${job.id}/complete`, PDF, job.leaseToken);
  large.headers.set('Content-Length', String(10 * 1024 * 1024 + 1));
  assert.equal((await handleInternalDocuments(large, env)).status, 413);
  assert.equal((await store.workerGet(DOCUMENT_ORG, job.id))?.status, 'running');
  assert.equal(bucket.objects.size, 0);
});
test('lost acknowledgement after DB commit preserves the winning object for a safe retry', async () => {
  const { env, store, bucket, db } = await fixture();
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const { job } = await (await handleInternalDocuments(internal('claim'), env)).json();
  const prepare = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const statement = prepare(sql);
    if (sql.includes("SET status='ready'")) {
      const run = statement.run.bind(statement);
      statement.run = async () => { await run(); throw new Error('simulated lost acknowledgement'); };
    }
    return statement;
  };
  assert.equal((await handleInternalDocuments(internal(`${job.id}/complete`, PDF, job.leaseToken), env)).status, 503);
  const ready = (await store.workerGet(DOCUMENT_ORG, job.id))!;
  assert.equal(ready.status, 'ready');
  assert.ok(bucket.objects.has(ready.artifact_key!));
  const retry = await handleInternalDocuments(internal(`${job.id}/complete`, PDF, job.leaseToken), env);
  assert.equal((await retry.json()).replay, true);
});
test('cancellation racing an upload rejects completion and deletes only that upload', async () => {
  const { env, store, bucket } = await fixture();
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const { job } = await (await handleInternalDocuments(internal('claim'), env)).json();
  bucket.onPut = async () => { const current = (await store.workerGet(DOCUMENT_ORG, job.id))!; await store.cancel(DOCUMENT_ORG, 'subject-a', current, Date.now()); };
  assert.equal((await handleInternalDocuments(internal(`${job.id}/complete`, PDF, job.leaseToken), env)).status, 409);
  assert.equal(bucket.objects.size, 0);
  assert.equal((await handlePublicDocuments(publicRequest(`/${job.id}/download`), env, 'subject-a', false)).status, 409);
});
test('concurrent duplicate uploads cannot delete or overwrite the winning artifact', async () => {
  const { env, store, bucket } = await fixture();
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const { job } = await (await handleInternalDocuments(internal('claim'), env)).json();
  let count = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  bucket.onPut = async () => { count++; if (count === 2) release(); await barrier; };
  const responses = await Promise.all([1, 2].map(() => handleInternalDocuments(internal(`${job.id}/complete`, PDF, job.leaseToken), env)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(bucket.objects.size, 1);
  const ready = (await store.workerGet(DOCUMENT_ORG, job.id))!;
  assert.ok(bucket.objects.has(ready.artifact_key!));
});
test('TTL denies download before physical cleanup; maintenance removes payload, PDF and old orphans', async () => {
  const { env, store, bucket, db } = await fixture();
  await make(store, 'unique-worker-job', 'subject-a', Date.now());
  const { job } = await (await handleInternalDocuments(internal('claim'), env)).json();
  assert.equal((await handleInternalDocuments(internal(`${job.id}/complete`, PDF, job.leaseToken), env)).status, 200);
  db.exec(`UPDATE document_jobs SET expires_at=0`);
  bucket.objects.set('documents/orphan.pdf', { bytes: PDF, uploaded: new Date(Date.now() - DOCUMENT_TTL_MS - 1) });
  assert.equal((await handlePublicDocuments(publicRequest(`/${job.id}/download`), env, 'subject-a', false)).status, 404);
  const cleanup = await (await handleInternalDocuments(internal('maintenance'), env)).json();
  assert.equal(cleanup.expired, 1);
  assert.equal(cleanup.orphanObjectsDeleted, 1);
  assert.equal(bucket.objects.size, 0);
  const expired = (await store.workerGet(DOCUMENT_ORG, job.id))!;
  assert.equal(expired.status, 'expired');
  assert.equal(expired.payload_json, null);
  assert.equal(expired.artifact_key, null);
});
