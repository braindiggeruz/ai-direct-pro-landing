// POST /api/admin/indexnow/submit — admin JWT.
//
// Lightweight bulk-submit path used by /admin-tools/indexnow.
//
// Why a second endpoint: /api/seo/indexnow recomputes the full booster
// report on every call (readContentBulk + buildBoosterReport over the
// entire GitHub content tree). With a 50-URL batch that easily blows
// the Pages Function CPU budget and Cloudflare returns a generic 502.
//
// This endpoint trusts that the operator picked URLs from
// /api/admin/indexnow/recent — which itself only ever returns
// published URLs from /content/blog and /content/pages. We just
// cheap-check that every URL belongs to gptbot.uz and isn't an admin
// or API path before calling api.indexnow.org.
//
// Hard rules unchanged:
//   * Manual only (admin clicks).
//   * Key file probed every time.
//   * Append-only audit log per URL.
//   * No mutation of /content, no GitHub publish.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { writeAudit } from '../../../lib/indexnow/audit';

const SITE_HOST = 'gptbot.uz';
const SITE_URL = `https://${SITE_HOST}`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';

interface IndexNowEnv extends Env {
  INDEXNOW_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const FORBIDDEN_PREFIXES: readonly string[] = ['/admin-tools', '/api/', '/assets/', '/content/'];

function lightValidate(urls: string[]): { safe: string[]; rejected: { url: string; reason: string }[] } {
  const safe: string[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = (raw || '').trim();
    if (!u) { rejected.push({ url: raw, reason: 'empty' }); continue; }
    if (!u.startsWith('https://')) { rejected.push({ url: u, reason: 'must be absolute https://' }); continue; }
    let parsed: URL;
    try { parsed = new URL(u); } catch { rejected.push({ url: u, reason: 'invalid URL' }); continue; }
    if (parsed.host !== SITE_HOST) { rejected.push({ url: u, reason: `host mismatch (got ${parsed.host})` }); continue; }
    const p = parsed.pathname;
    if (FORBIDDEN_PREFIXES.some((pref) => p.startsWith(pref))) {
      rejected.push({ url: u, reason: 'forbidden path prefix' });
      continue;
    }
    if (seen.has(u)) { rejected.push({ url: u, reason: 'duplicate' }); continue; }
    seen.add(u);
    safe.push(u);
  }
  // IndexNow allows up to 10k; we keep the same 1k cap as the legacy path.
  return { safe: safe.slice(0, 1000), rejected };
}

export const onRequestPost: PagesFunction<IndexNowEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const key = env.INDEXNOW_KEY;
  if (!key || !/^[A-Za-z0-9-]{8,64}$/.test(key)) {
    return json({
      ok: false,
      error: 'INDEXNOW_KEY env binding not configured. Set it in Cloudflare Pages → Settings → Environment.',
    }, 400);
  }

  let body: { urls?: unknown };
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const rawUrls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string') : [];
  if (rawUrls.length === 0) return json({ ok: false, error: 'urls must be a non-empty string[]' }, 400);

  const { safe, rejected } = lightValidate(rawUrls);
  if (safe.length === 0) {
    return json({ ok: false, error: 'No safe URLs to submit after validation.', rejected }, 400);
  }

  // Verify the key file is reachable. HEAD is enough; we never read its body.
  const keyLocation = `${SITE_URL}/${key}.txt`;
  try {
    const probe = await fetch(keyLocation, { method: 'HEAD' });
    if (probe.status !== 200) {
      return json({
        ok: false,
        error: `Key file at ${keyLocation} returned HTTP ${probe.status}. Verify public/${key}.txt is committed and deployed.`,
      }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: `Key file probe failed: ${(e as Error).message}` }, 502);
  }

  // Submit to api.indexnow.org. The endpoint federates to Bing, Yandex,
  // Seznam, Naver and Yep so a single POST is enough.
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

  // Per-URL audit. Best-effort: any D1 error is swallowed so the
  // operator still sees the upstream status in the response.
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
    return json({
      ok: false,
      error: `IndexNow fetch failed: ${networkError}`,
      submitted: safe.length,
      rejected,
      batchId,
    }, 502);
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
