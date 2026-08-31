import { ownerError, ownerJson, type OwnerHandlerContext } from '../../../platform/admin';
import { CrawlerError, CrawlerStore, crawlerEnabled, crawlerRecord, crawlerSchemaReady,
  readCrawlerBody, requireCrawlerSchema } from '../../../platform/lead-radar/crawler';

export function isCrawlerPath(parts: string[]): boolean { return parts[0] === 'crawler'; }
export async function handleCrawlerRequest(ctx: OwnerHandlerContext, parts: string[], orgId: string): Promise<Response> {
  const enabled = crawlerEnabled(ctx.env, orgId);
  const statusRoute = ctx.request.method === 'GET' && parts.length === 2 && parts[1] === 'status';
  // Emergency revocation/cancellation must remain usable after the kill switch.
  const safetyWrite = ctx.request.method === 'POST' && parts.length === 4
    && ((parts[1] === 'workers' && parts[3] === 'revoke') || (parts[1] === 'jobs' && parts[3] === 'cancel'));
  if (!enabled && !safetyWrite) return statusRoute
    ? ownerJson({ enabled: false, ready: false, worker: null, jobs: [], reason: 'crawler_disabled' }, ctx.requestId)
    : ownerError('crawler_disabled', ctx.requestId, 503);
  try {
    if (statusRoute && !await crawlerSchemaReady(ctx.db)) return ownerJson({ enabled: true, ready: false,
      worker: null, jobs: [], reason: 'crawler_schema_unavailable' }, ctx.requestId);
    await requireCrawlerSchema(ctx.db);
    const store = new CrawlerStore(ctx.db);
    const now = new Date().toISOString();
    if (statusRoute) {
      const companyId = ctx.url.searchParams.get('companyId') ?? '';
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(companyId)) return ownerError('crawler_invalid_input', ctx.requestId, 400);
      return ownerJson(await store.status(orgId, companyId, now), ctx.requestId);
    }
    if (ctx.request.method !== 'POST') return ownerError('method_not_allowed', ctx.requestId, 405);
    const body = crawlerRecord(await readCrawlerBody(ctx.request, 2048));
    if (parts.length === 2 && parts[1] === 'jobs') {
      if (Object.keys(body).length !== 1 || typeof body.companyId !== 'string') throw new CrawlerError('crawler_invalid_input', 400);
      return ownerJson(await store.enqueue(orgId, body.companyId, ctx.request.headers.get('Idempotency-Key') ?? '', now), ctx.requestId);
    }
    if (parts.length === 4 && parts[1] === 'jobs' && parts[3] === 'cancel') {
      return ownerJson({ job: await store.cancel(orgId, parts[2], now) }, ctx.requestId);
    }
    // Enrollment carries a locally generated token HASH only. The actual secret
    // is never generated in, returned by, or persisted in the browser/server.
    if (parts.length === 2 && parts[1] === 'workers') {
      if (typeof body.workerId !== 'string' || typeof body.tokenHash !== 'string' || typeof body.name !== 'string') {
        throw new CrawlerError('crawler_invalid_worker', 400);
      }
      await store.registerWorker(orgId, body.workerId, body.tokenHash, body.name, now);
      return ownerJson({ workerId: body.workerId, registered: true }, ctx.requestId);
    }
    if (parts.length === 4 && parts[1] === 'workers' && parts[3] === 'revoke') {
      await ctx.db.prepare('UPDATE lead_radar_crawler_workers SET revoked=1 WHERE org_id=? AND id=?')
        .bind(orgId, parts[2]).run();
      return ownerJson({ revoked: true }, ctx.requestId);
    }
    return ownerError('not_found', ctx.requestId, 404);
  } catch (error) {
    if (error instanceof CrawlerError) return ownerError(error.code, ctx.requestId, error.status);
    throw error;
  }
}
