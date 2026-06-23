// POST /api/seo/indexnow
//
// Safe IndexNow submitter. Triple-validated:
//   1. Caller must be authenticated (admin JWT).
//   2. Every URL is matched against /content/* and filtered through
//      filterSafeForIndexNow() — admin/api/draft/noindex/mojibake/duplicate/host-mismatch
//      URLs are rejected client-side AND server-side.
//   3. INDEXNOW_KEY env binding must be set in Cloudflare Pages → Settings.
//      Without it we abort: keys must NEVER be hardcoded in the repo.
//
// This endpoint never auto-submits. It is invoked only when an operator
// clicks "Submit to IndexNow" in /admin-tools/seo-booster, and only for
// the URLs they explicitly selected.
//
// Spec: https://www.indexnow.org/documentation
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { readContentBulk } from '../../lib/github';
import { buildBoosterReport, filterSafeForIndexNow } from '../../../src/shared/booster';
import type { Page, BlogArticle, GlobalSEO } from '../../../src/shared/types';
import { writeAudit } from '../../lib/indexnow/audit';

const SITE_HOST = 'gptbot.uz';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';
// Server-side key location. Returned by functions/api/indexnow/key.ts.
// Bing/Yandex/Seznam fetch this URL to verify the submission.
const KEY_LOCATION = `https://${SITE_HOST}/api/indexnow/key`;

interface IndexNowEnv extends Env {
  INDEXNOW_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost: PagesFunction<IndexNowEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const key = env.INDEXNOW_KEY;
  if (!key || !/^[A-Za-z0-9-]{8,64}$/.test(key)) {
    return json({
      ok: false,
      error: 'INDEXNOW_KEY env binding not configured. Set it in Cloudflare Pages → Settings → Environment to the same value as the public key file at /<key>.txt.',
    }, 400);
  }

  let body: { urls?: unknown };
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const rawUrls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string') : [];
  if (rawUrls.length === 0) return json({ ok: false, error: 'urls must be a non-empty string[]' }, 400);

  // Recompute the booster report so we validate against the **current** content.
  // This is one extra GH subrequest but it is the only way to guarantee the
  // server is not tricked into pushing a URL that just became noindex/draft
  // between the time the SPA loaded and the operator clicked submit.
  const all = await readContentBulk(env);
  const pages: Page[] = [];
  const blog: BlogArticle[] = [];
  let globalObj: GlobalSEO | undefined;
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path.startsWith('content/pages/')) pages.push(parsed as Page);
      else if (path.startsWith('content/blog/')) blog.push(parsed as BlogArticle);
      else if (path === 'content/global/site.json') globalObj = parsed as GlobalSEO;
    } catch { /* skip */ }
  }
  const report = buildBoosterReport(pages, blog, globalObj);
  const { safe, rejected } = filterSafeForIndexNow(rawUrls, report.items);

  if (safe.length === 0) {
    return json({ ok: false, error: 'No safe URLs to submit after validation.', rejected }, 400);
  }

  // Verify the key file is reachable. We do a HEAD; if it 404s we ABORT
  // because IndexNow will reject the whole batch with "key not found".
  const keyLocation = KEY_LOCATION;
  try {
    const keyProbe = await fetch(keyLocation, { method: 'HEAD' });
    if (keyProbe.status !== 200) {
      return json({
        ok: false,
        error: `Key file at ${keyLocation} returned HTTP ${keyProbe.status}. Verify INDEXNOW_KEY env binding is set.`,
      }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: `Key file probe failed: ${(e as Error).message}` }, 502);
  }

  // Submit. IndexNow accepts up to 10k URLs; we cap at 1k in the validator.
  const payload = { host: SITE_HOST, key, keyLocation, urlList: safe };
  const startedAt = Date.now();
  const submittedAtIso = new Date(startedAt).toISOString();
  const batchId = `bn_${startedAt}_${crypto.randomUUID().slice(0, 8)}`;
  let upstreamStatus = 0;
  let upstreamBody = '';
  let networkError: string | null = null;
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    upstreamStatus = res.status;
    upstreamBody = (await res.text()).slice(0, 1000);
  } catch (e) {
    networkError = (e as Error).message;
  }
  const durationMs = Date.now() - startedAt;
  const ok = upstreamStatus === 200 || upstreamStatus === 202;

  // Write per-URL audit rows so /admin-tools/indexnow can show
  // "last submitted" badges. Best-effort: any D1 error is swallowed.
  await writeAudit(
    env,
    safe.map((url) => ({
      submitted_at: submittedAtIso,
      actor_email: auth.email,
      url,
      upstream_status: upstreamStatus,
      upstream_ok: ok,
      batch_id: batchId,
      duration_ms: durationMs,
      error: networkError ?? (ok ? null : (upstreamBody || `HTTP ${upstreamStatus}`).slice(0, 240)),
    })),
  ).catch(() => undefined);

  if (networkError) {
    return json({ ok: false, error: `IndexNow fetch failed: ${networkError}`, submitted: safe.length, rejected, batchId }, 502);
  }

  return json({
    ok,
    submitted: safe.length,
    safeUrls: safe,
    rejected,
    upstreamStatus,
    upstreamBody,
    batchId,
    submittedAt: submittedAtIso,
    durationMs,
  }, ok ? 200 : 502);
};
