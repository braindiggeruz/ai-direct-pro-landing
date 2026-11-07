import { ensureDocumentSchema } from './schema';
import { DocumentStore } from './store';
import { DOCUMENT_MAX_BODY, DOCUMENT_MAX_PDF, DOCUMENT_ORG, DOCUMENT_TTL_MS, DocumentError, type DocumentEnv, type DocumentFailure, type DocumentJob } from './types';
import { documentId, hashDocument, idempotencyKey, validateDocumentCreate } from './validation';

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
export function documentJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
}
export function documentFailure(error: unknown): Response {
  const known = error instanceof DocumentError ? error : new DocumentError('documents_unavailable', 503);
  return documentJson({ ok: false, error: known.code }, known.status);
}
export function documentGate(env: DocumentEnv): void {
  if (!['1', 'true'].includes(env.DOCUMENT_JOBS_ENABLED ?? '') || !env.GPTBOT_DRAFTS_DB || !env.DOCUMENT_ARTIFACTS || (env.DOCUMENT_WORKER_SECRET?.length ?? 0) < 32)
    throw new DocumentError('documents_unavailable', 503);
}
const schemaReady = new WeakMap<D1Database, Promise<void>>();
async function storage(env: DocumentEnv): Promise<{ store: DocumentStore; bucket: R2Bucket }> {
  documentGate(env);
  const db = env.GPTBOT_DRAFTS_DB!;
  if (!schemaReady.has(db)) schemaReady.set(db, ensureDocumentSchema(db).catch(error => { schemaReady.delete(db); throw error; }));
  await schemaReady.get(db);
  return { store: new DocumentStore(db), bucket: env.DOCUMENT_ARTIFACTS! };
}
export async function readDocumentBytes(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) throw new DocumentError('payload_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new DocumentError('payload_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function readJson(request: Request, max = DOCUMENT_MAX_BODY): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new DocumentError('invalid_payload', 400);
  const bytes = await readDocumentBytes(request, max);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new DocumentError('invalid_payload', 400); }
}
function quota(value: string | undefined, fallback: number, ceiling: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= ceiling ? parsed : fallback;
}
export function publicDocument(job: DocumentJob, base: string, now: number): Record<string, unknown> {
  const status = job.expires_at <= now ? 'expired' : job.status;
  return { id: job.id, type: job.type, status, createdAt: job.created_at, updatedAt: job.updated_at, expiresAt: job.expires_at,
    attempts: job.attempts, errorCode: job.error_code,
    ...(status === 'ready' ? { downloadUrl: `${base}/${job.id}/download` } : {}) };
}
/** Receives only an already authenticated, server-derived subject. */
export async function handlePublicDocuments(request: Request, env: DocumentEnv, subject: string, owner: boolean): Promise<Response> {
  try {
    const base = owner ? '/api/admin/documents' : '/api/studio/documents';
    const path = new URL(request.url).pathname.slice(base.length).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (path.length > 2) throw new DocumentError('not_found', 404);
    const { store, bucket } = await storage(env);
    const now = Date.now();
    if (path.length === 0) {
      if (request.method === 'GET') return documentJson({ ok: true, jobs: (await store.list(DOCUMENT_ORG, subject)).map(job => publicDocument(job, base, now)), retentionHours: 24,
        limits: { subjectDaily: quota(env.DOCUMENT_JOBS_DAILY_SUBJECT_LIMIT, 3, 100), globalDaily: quota(env.DOCUMENT_JOBS_DAILY_GLOBAL_LIMIT, 20, 1000) } });
      if (request.method !== 'POST') throw new DocumentError('method_not_allowed', 405);
      const key = idempotencyKey(request);
      const input = validateDocumentCreate(await readJson(request), owner);
      const hash = await hashDocument(JSON.stringify(input));
      const created = await store.create(DOCUMENT_ORG, subject, key, hash, input, now,
        quota(env.DOCUMENT_JOBS_DAILY_SUBJECT_LIMIT, 3, 100), quota(env.DOCUMENT_JOBS_DAILY_GLOBAL_LIMIT, 20, 1000));
      return documentJson({ ok: true, job: publicDocument(created.job, base, now), replay: created.replay }, created.replay ? 200 : 201);
    }
    const id = documentId(path[0]);
    const job = await store.get(DOCUMENT_ORG, subject, id);
    if (!job) throw new DocumentError('not_found', 404);
    if (path.length === 1 && request.method === 'GET') return documentJson({ ok: true, job: publicDocument(job, base, now) });
    if (path[1] === 'cancel' && request.method === 'POST') {
      if (job.status !== 'cancelled' && !(await store.cancel(DOCUMENT_ORG, subject, job, now))) throw new DocumentError('job_conflict', 409);
      const cancelled = await store.get(DOCUMENT_ORG, subject, id);
      return documentJson({ ok: true, job: publicDocument(cancelled!, base, Date.now()) });
    }
    if (path[1] === 'download' && request.method === 'GET') {
      if (job.expires_at <= now) throw new DocumentError('not_found', 404);
      if (job.status !== 'ready' || !job.artifact_key) throw new DocumentError('job_not_ready', 409);
      const artifact = await bucket.get(job.artifact_key);
      if (!artifact || job.expires_at <= Date.now()) throw new DocumentError('not_found', 404);
      return new Response(artifact.body, { headers: { ...HEADERS, 'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${job.type}-${job.id}.pdf"`, 'Content-Length': String(artifact.size),
        'Content-Security-Policy': "sandbox; default-src 'none'" } });
    }
    throw new DocumentError(path.length === 1 || ['cancel', 'download'].includes(path[1]) ? 'method_not_allowed' : 'not_found', path.length === 1 || ['cancel', 'download'].includes(path[1]) ? 405 : 404);
  } catch (error) { return documentFailure(error); }
}
function lease(request: Request): string {
  const token = request.headers.get('X-Document-Lease') ?? '';
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new DocumentError('lease_conflict', 409);
  return token;
}
async function authorizeWorker(request: Request, env: DocumentEnv): Promise<void> {
  documentGate(env);
  const authorization = request.headers.get('Authorization') ?? '';
  if (authorization.length > 1024) throw new DocumentError('forbidden', 403);
  const actual = await hashDocument(authorization);
  const expected = await hashDocument(`Bearer ${env.DOCUMENT_WORKER_SECRET}`);
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  if (mismatch) throw new DocumentError('forbidden', 403);
}
function metric(job: DocumentJob, status: string, bytes?: number): void {
  console.info(JSON.stringify({ event: 'document_job', type: job.type, status, attempt: job.attempts, ...(bytes === undefined ? {} : { bytes }) }));
}
export async function handleInternalDocuments(request: Request, env: DocumentEnv): Promise<Response> {
  try {
    await authorizeWorker(request, env);
    if (request.method !== 'POST') throw new DocumentError('method_not_allowed', 405);
    const path = new URL(request.url).pathname.slice('/api/internal/documents'.length).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const { store, bucket } = await storage(env);
    const now = Date.now();
    if (path.length === 1 && path[0] === 'claim') {
      const job = await store.claim(DOCUMENT_ORG, now);
      if (!job) return documentJson({ ok: true, job: null });
      metric(job, 'running');
      return documentJson({ ok: true, job: { id: job.id, type: job.type, payload: JSON.parse(job.payload_json!),
        leaseToken: job.lease_token, leaseExpiresAt: job.lease_expires_at, attempt: job.attempts } });
    }
    if (path.length === 1 && path[0] === 'maintenance') {
      let cursor: string | undefined;
      if (request.body) {
        const body = await readJson(request, 4096);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'cursor')) throw new DocumentError('invalid_payload', 400);
        const value = (body as { cursor?: unknown }).cursor;
        if (value !== undefined && (typeof value !== 'string' || value.length > 2000)) throw new DocumentError('invalid_payload', 400);
        cursor = value as string | undefined;
      }
      const expired = await store.expired(DOCUMENT_ORG, now);
      for (const job of expired) {
        if (job.artifact_key) await bucket.delete(job.artifact_key);
        await store.expire(DOCUMENT_ORG, job.id, now);
      }
      // An upload may outlive a crash before DB commit. Its unique key is never reused.
      const objects = await bucket.list({ prefix: 'documents/', limit: 50, ...(cursor ? { cursor } : {}) });
      let orphans = 0;
      for (const object of objects.objects) if (object.uploaded.getTime() <= now - DOCUMENT_TTL_MS) { await bucket.delete(object.key); orphans++; }
      await store.prune(DOCUMENT_ORG, now);
      return documentJson({ ok: true, expired: expired.length, orphanObjectsDeleted: orphans, cursor: objects.truncated ? objects.cursor : null });
    }
    if (path.length !== 2 || !['complete', 'fail'].includes(path[1])) throw new DocumentError('not_found', 404);
    const id = documentId(path[0]);
    const token = lease(request);
    const job = await store.workerGet(DOCUMENT_ORG, id);
    if (!job) throw new DocumentError('not_found', 404);
    // Idempotent successful acknowledgement cannot replace bytes or resurrect expired jobs.
    if (path[1] === 'complete' && job.status === 'ready' && job.lease_token === token && job.expires_at > now) return documentJson({ ok: true, status: 'ready', replay: true });
    if (job.status !== 'running' || job.lease_token !== token || (job.lease_expires_at ?? 0) <= now || job.expires_at <= now) throw new DocumentError('lease_conflict', 409);
    if (path[1] === 'fail') {
      const body = await readJson(request, 1024);
      const reason = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 ? (body as { reason?: unknown }).reason : null;
      if (typeof reason !== 'string' || !['render_failed', 'invalid_payload', 'timeout'].includes(reason)) throw new DocumentError('invalid_payload', 400);
      if (!(await store.fail(DOCUMENT_ORG, id, token, reason as DocumentFailure, Date.now()))) throw new DocumentError('lease_conflict', 409);
      metric(job, String(reason));
      return documentJson({ ok: true });
    }
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/pdf') throw new DocumentError('invalid_payload', 400);
    const bytes = await readDocumentBytes(request, DOCUMENT_MAX_PDF);
    if (bytes.length < 12 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' || !new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF')) throw new DocumentError('invalid_payload', 400);
    const key = `documents/${id}/${crypto.randomUUID()}.pdf`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' } });
    let committed: boolean;
    try { committed = await store.complete(DOCUMENT_ORG, id, token, key, bytes.length, Date.now()); }
    catch {
      // A lost DB acknowledgement is ambiguous: never delete a possibly committed PDF.
      // A non-committed upload is reclaimed by the 24h orphan sweep.
      throw new DocumentError('documents_unavailable', 503);
    }
    if (!committed) { await bucket.delete(key); throw new DocumentError('lease_conflict', 409); }
    metric(job, 'ready', bytes.length);
    return documentJson({ ok: true, status: 'ready', replay: false });
  } catch (error) { return documentFailure(error); }
}
