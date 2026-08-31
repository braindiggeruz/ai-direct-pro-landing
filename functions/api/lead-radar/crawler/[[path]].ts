import type { Env } from '../../../_types';
import {
  acceptCrawlerReceipt,
  authenticateCrawlerWorker,
  claimCrawlerJob,
  crawlerErrorResponse,
  crawlerHeartbeat,
  readCrawlerBody,
} from '../../../platform/lead-radar';

function pathParts(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => item.split('/')).filter(Boolean);
  return (value ?? '').split('/').filter(Boolean);
}

function json(value: unknown, requestId: string, status = 200): Response {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { result: value };
  return Response.json({ ...record, request_id: requestId }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const requestId = crypto.randomUUID();
  try {
    const worker = await authenticateCrawlerWorker(env.GPTBOT_DRAFTS_DB, request);
    const parts = pathParts(params.path);
    const body = await readCrawlerBody(request);
    const tail = parts.at(-1) ?? '';

    if (tail === 'heartbeat' || tail === 'status') {
      return json(await crawlerHeartbeat(env.GPTBOT_DRAFTS_DB, worker, body), requestId);
    }
    if (tail === 'claim'
      || (parts.length === 1 && parts[0] === 'jobs')
      || (parts.length === 2 && parts[0] === 'jobs' && parts[1] === 'next')) {
      return json(await claimCrawlerJob(env.GPTBOT_DRAFTS_DB, worker), requestId);
    }
    if (tail === 'receipt' || tail === 'receipts' || tail === 'complete' || tail === 'result') {
      const record = body !== null && typeof body === 'object' && !Array.isArray(body)
        ? { ...body as Record<string, unknown> }
        : {};
      if (!record.jobId && !record.job_id && parts[0] === 'jobs' && parts[1]) record.jobId = parts[1];
      return json(await acceptCrawlerReceipt(env.GPTBOT_DRAFTS_DB, worker, record), requestId);
    }
    return json({ error: 'route_not_found' }, requestId, 404);
  } catch (error) {
    return crawlerErrorResponse(error, requestId);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => new Response(null, {
  status: 405,
  headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' },
});
export const onRequestPatch = onRequestGet;
export const onRequestPut = onRequestGet;
export const onRequestDelete = onRequestGet;
export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, {
  status: 204,
  headers: {
    Allow: 'POST, OPTIONS',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
  },
});
