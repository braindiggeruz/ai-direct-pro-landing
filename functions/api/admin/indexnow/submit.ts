// POST /api/admin/indexnow/submit — admin JWT.
//
// Lightweight bulk-submit path used by /admin-tools/indexnow.
//
// Why a second endpoint: /api/seo/indexnow recomputes the full booster
// report on every call (readContentBulk + buildBoosterReport over the
// entire GitHub content tree). With a 50-URL batch that easily blows
// the Pages Function CPU budget and Cloudflare returns a generic 502.
//
// 2026-06-24 fix: Bing's IndexNow endpoint federates to all engines
// but rate-limits the per-host POSTs aggressively. The previous version
// sent every selected URL in ONE POST and a 30+ URL batch came back as
// HTTP 429 across the board (the /admin-tools/indexnow screenshot from
// 2026-06-24 showed 52/52 URLs marked 429). Now we:
//
//   * partition the selection into ready vs. cooling-down (skip URLs
//     that succeeded within the last 24 h);
//   * chunk the ready set into groups of ≤10 URLs;
//   * wait ≥1.5 s (+ jitter) between chunks;
//   * parse upstream Retry-After on 429 and honour it (up to 30 s);
//   * retry 429 / 5xx up to 2 times per chunk with exponential backoff;
//   * write a per-URL audit row carrying the chunk-level outcome plus
//     a kind tag (ok | rate_limited | http_error | network_error |
//     skipped_duplicate | deferred) encoded in the audit `error` column
//     so the existing /admin-tools/indexnow history reader can colour
//     the badges correctly.
//
// Hard rules unchanged:
//   * Manual only (admin clicks).
//   * Key file probed once per call (HEAD).
//   * Append-only audit log per URL.
//   * No mutation of /content, no GitHub publish.
//   * Walltime capped at 25 s so Cloudflare never kills us mid-batch;
//     any URLs that didn't fit return kind='deferred' and the operator
//     can click "Повторить неуспешные" to continue.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { writeAudit, readLatestPerUrl } from '../../../lib/indexnow/audit';
import { runChunkedSubmit, INDEXNOW_ENDPOINT, type IndexNowKind, type PerUrlResult, type ChunkResult } from '../../../lib/indexnow/submit-engine';

const SITE_HOST = 'gptbot.uz';
const SITE_URL = `https://${SITE_HOST}`;
// Cap per-click submission. With the chunked engine (chunkSize=8,
// interChunkMs=3s, wallBudget=90s) ~200 URLs comfortably fit one click.
// URLs beyond the cap are returned in `rejected` with reason="selection_capped"
// so the operator can submit the rest in a follow-up click.
const SELECTION_HARD_CAP = 200;
const COOL_DOWN_MS = 24 * 60 * 60 * 1000;

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
  // Make selection-cap explicit so the UI shows the user "X URLs не вошли
  // в этот клик — отправь их следующим кликом" rather than silently
  // truncating.
  if (safe.length > SELECTION_HARD_CAP) {
    const overflow = safe.slice(SELECTION_HARD_CAP);
    for (const u of overflow) {
      rejected.push({ url: u, reason: `selection_capped_at_${SELECTION_HARD_CAP}` });
    }
  }
  return { safe: safe.slice(0, SELECTION_HARD_CAP), rejected };
}

function kindForAudit(kind: IndexNowKind): string {
  // Encoded in the audit `error` text column so the existing UI badge
  // logic (last_ok 1/0) doesn't change but operators can grep history.
  switch (kind) {
    case 'ok': return 'ok';
    case 'rate_limited': return 'rate_limited';
    case 'http_error': return 'http_error';
    case 'network_error': return 'network_error';
    case 'skipped_duplicate': return 'skipped_duplicate';
    case 'deferred': return 'deferred';
  }
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

  let body: { urls?: unknown; force?: unknown };
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const rawUrls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string') : [];
  if (rawUrls.length === 0) return json({ ok: false, error: 'urls must be a non-empty string[]' }, 400);
  // `force: true` lets the operator re-submit URLs that are still in the
  // 24h cool-down window. Used by the per-row "повторить" action when an
  // operator wants to push a specific URL again before cool-down expires.
  const force = body.force === true;

  const { safe, rejected } = lightValidate(rawUrls);
  if (safe.length === 0) {
    return json({ ok: false, error: 'No safe URLs to submit after validation.', rejected }, 400);
  }

  // Verify the key file is reachable once per call. HEAD is enough; we
  // never read its body, IndexNow only checks existence.
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

  // 24-hour cool-down lookup. Only count rows with upstream_ok=1 —
  // a stale 429 row should NOT block a retry.
  // When `force` is true we skip the lookup entirely so every URL goes
  // through the engine.
  const nowMs = Date.now();
  const recentSuccess = new Map<string, { submittedAt: string; ageMs: number }>();
  if (!force) {
    const latestMap = await readLatestPerUrl(env, safe).catch(() => new Map());
    for (const url of safe) {
      const row = latestMap.get(url);
      if (!row || row.upstream_ok !== 1) continue;
      const ts = Date.parse(row.submitted_at);
      if (!Number.isFinite(ts)) continue;
      const ageMs = nowMs - ts;
      if (ageMs >= 0 && ageMs < COOL_DOWN_MS) {
        recentSuccess.set(url, { submittedAt: row.submitted_at, ageMs });
      }
    }
  }

  const startedAt = nowMs;
  const submittedAtIso = new Date(startedAt).toISOString();
  const batchId = `bn_${startedAt}_${crypto.randomUUID().slice(0, 8)}`;

  // Run the chunked engine.
  const result = await runChunkedSubmit({
    urls: safe,
    recentSuccess,
    buildPayload: (chunkUrls) => ({ host: SITE_HOST, key, keyLocation, urlList: chunkUrls }),
  });
  const durationMs = Date.now() - startedAt;

  // Per-URL audit. The audit table doesn't have a kind column; we
  // encode it into the `error` text field as `KIND[: detail]`. The
  // existing /admin-tools/indexnow recent reader treats upstream_ok=1
  // as success, so OK rows stay clean.
  const auditRows = result.perUrl.map((r: PerUrlResult) => ({
    submitted_at: submittedAtIso,
    actor_email: auth.email,
    url: r.url,
    upstream_status: r.upstreamStatus,
    upstream_ok: r.kind === 'ok',
    batch_id: batchId,
    duration_ms: durationMs,
    error: r.kind === 'ok' ? null : [kindForAudit(r.kind), r.error].filter(Boolean).join(': ').slice(0, 480),
  }));
  await writeAudit(env, auditRows).catch((e) => console.warn('[indexnow-submit] writeAudit best-effort failure:', (e as Error).message));

  // Aggregate response. Operators see the totals + per-URL list in UI.
  const overallOk = result.succeeded > 0 && result.failed === 0 && result.rateLimited === 0;
  return json({
    ok: overallOk,
    submitted: safe.length,
    succeeded: result.succeeded,
    rateLimited: result.rateLimited,
    failed: result.failed,
    skippedDuplicate: result.skippedDuplicate,
    deferred: result.deferred,
    safeUrls: safe,
    rejected,
    // Back-compat: legacy clients (older code path) read these fields.
    upstreamStatus: result.chunks[0]?.upstreamStatus ?? (result.skippedDuplicate === safe.length ? 200 : 0),
    upstreamBody: result.chunks.map((c: ChunkResult) => `chunk ${c.index}: HTTP ${c.upstreamStatus} (${c.attempts}× attempts)`).join(' | ').slice(0, 800),
    batchId,
    submittedAt: submittedAtIso,
    durationMs,
    chunks: result.chunks,
    perUrl: result.perUrl,
    budgetExhausted: result.budgetExhausted,
    endpoint: INDEXNOW_ENDPOINT,
  }, 200);
};
