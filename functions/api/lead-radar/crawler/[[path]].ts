import type { Env } from '../../../_types';
import { ownerError, ownerJson } from '../../../platform/admin';
import { CrawlerError, CrawlerStore, crawlerEnabled, crawlerRecord, parseCrawlerResult,
  readCrawlerBody, requireCrawlerSchema } from '../../../platform/lead-radar/crawler';
import { LEAD_RADAR_CRAWLER_SCHEMA } from '../../../../src/shared/lead-radar-crawler';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const requestId = crypto.randomUUID();
  if (request.method !== 'POST') return ownerError('method_not_allowed', requestId, 405);
  const token = request.headers.get('Authorization')?.match(/^Bearer (lrcr_[a-f0-9]{64})$/)?.[1];
  if (!token) return ownerError('crawler_unauthorized', requestId, 401);
  if (!env.GPTBOT_DRAFTS_DB || env.LEAD_RADAR_CRAWLER_ENABLED !== 'true') return ownerError('crawler_disabled', requestId, 503);
  try {
    await requireCrawlerSchema(env.GPTBOT_DRAFTS_DB);
    const store = new CrawlerStore(env.GPTBOT_DRAFTS_DB);
    const worker = await store.authenticate(token);
    if (!worker) return ownerError('crawler_unauthorized', requestId, 401);
    if (!crawlerEnabled(env, worker.org_id)) return ownerError('crawler_disabled', requestId, 503);
    const parts = (Array.isArray(params.path) ? params.path : [params.path ?? '']).flatMap(p => String(p).split('/')).filter(Boolean);
    if (parts.length !== 1 || !['claim', 'heartbeat', 'result'].includes(parts[0])) return ownerError('not_found', requestId, 404);
    const body = crawlerRecord(await readCrawlerBody(request, parts[0] === 'result' ? undefined : 2048));
    const now = new Date().toISOString();
    if (parts[0] === 'claim') {
      if (body.schema !== LEAD_RADAR_CRAWLER_SCHEMA || Object.keys(body).length !== 1) throw new CrawlerError('crawler_invalid_body', 400);
      return ownerJson({ ok: true, job: await store.claim(worker, now), retryAfterSeconds: 30 }, requestId);
    }
    if (parts[0] === 'heartbeat') {
      if (typeof body.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.jobId)
        || !Number.isSafeInteger(body.leaseGeneration) || Number(body.leaseGeneration) < 1) throw new CrawlerError('crawler_invalid_body', 400);
      return ownerJson({ ok: true, leaseExpiresAt: await store.heartbeat(worker, body.jobId, Number(body.leaseGeneration), now) }, requestId);
    }
    return ownerJson(await store.accept(worker, parseCrawlerResult(body), now), requestId);
  } catch (error) {
    if (error instanceof CrawlerError) return ownerError(error.code, requestId, error.status);
    // Source HTML, URLs, tokens and thrown messages must never reach diagnostics.
    console.error(`lead-radar.crawler:internal_error:${requestId}`);
    return ownerError('crawler_internal_error', requestId, 500);
  }
};
