// GET /api/admin/indexnow/recent — admin JWT.
//
// Lists every published URL on gptbot.uz (money pages + blog articles)
// joined with each URL's most recent IndexNow submission, so the
// /admin-tools/indexnow panel can render a "submit checklist" with
// live "last submitted" badges.
//
// Filters supported via query string:
//   ?days=N          → only URLs published or updated within last N days
//                      (defaults to 30; max 365)
//   ?onlyUnsubmitted → omit URLs that already have a successful 200/202
//                      submission row in the audit log
//
// Returns:
//   { ok, total, items: [{ url, locale, type, title, published, last_modified,
//                          last_submitted_at?, last_status?, last_ok? }] }
//
// Hard rules: never publishes anything, never calls api.indexnow.org,
// never modifies content. Read-only.

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { readContentBulk } from '../../../lib/github';
import { parseContentBulk } from '../../../lib/content-parse';
import { readLatestPerUrl } from '../../../lib/indexnow/audit';
import { jsonResponse } from '../../../lib/api-errors';

interface IndexNowRecentItem {
  url: string;
  locale: 'ru' | 'uz';
  type: 'money' | 'blog';
  title: string;
  published: boolean;
  last_modified: string | null;
  last_submitted_at: string | null;
  last_status: number | null;
  last_ok: boolean;
}

const SITE_HOST = 'gptbot.uz';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const daysRaw = parseInt(url.searchParams.get('days') || '30', 10);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, daysRaw)) : 30;
    const onlyUnsubmitted = url.searchParams.get('onlyUnsubmitted') === '1';

    // Read content from GitHub. Cached via the existing readContentBulk
    // GraphQL bulk reader → ≤ 1 subrequest.
    const all = await readContentBulk(env);
    const { pages, blog } = parseContentBulk(all);
    const items: IndexNowRecentItem[] = [];
    const cutoffMs = Date.now() - days * 86_400_000;

    for (const parsed of [...pages, ...blog]) {
      const isPage = 'pageType' in parsed;
      if (parsed.status !== 'published') continue;
      if (!parsed.url) continue;
      if (parsed.locale !== 'ru' && parsed.locale !== 'uz') continue;
      if (parsed.url.startsWith('/admin-tools')) continue;

      const lastModified = (parsed as { updatedAt?: string; lastModified?: string; publishedAt?: string }).updatedAt
        || (parsed as { lastModified?: string }).lastModified
        || (parsed as { publishedAt?: string }).publishedAt
        || null;
      const lastModifiedMs = lastModified ? Date.parse(lastModified) : NaN;
      if (Number.isFinite(lastModifiedMs) && lastModifiedMs < cutoffMs) continue;

      items.push({
        url: `https://${SITE_HOST}${parsed.url}`,
        locale: parsed.locale,
        type: isPage ? 'money' : 'blog',
        title: parsed.title || (parsed as { h1?: string }).h1 || parsed.url,
        published: true,
        last_modified: lastModified,
        last_submitted_at: null,
        last_status: null,
        last_ok: false,
      });
    }

    // Join with audit log (best-effort, non-blocking).
    const latestMap = await readLatestPerUrl(env, items.map((i) => i.url)).catch(() => new Map());
    for (const it of items) {
      const a = latestMap.get(it.url);
      if (a) {
        it.last_submitted_at = a.submitted_at;
        it.last_status = a.upstream_status;
        it.last_ok = a.upstream_ok === 1;
      }
    }

    // Filter "only unsubmitted" if requested.
    const filtered = onlyUnsubmitted ? items.filter((i) => !i.last_ok) : items;
    // Sort: never-submitted first, then oldest submission first.
    filtered.sort((a, b) => {
      const aTs = a.last_submitted_at ? Date.parse(a.last_submitted_at) : -Infinity;
      const bTs = b.last_submitted_at ? Date.parse(b.last_submitted_at) : -Infinity;
      return aTs - bTs;
    });

    return jsonResponse({ ok: true, total: filtered.length, days, items: filtered });
  } catch (e) {
    // 2026-06-24 — never let GitHub/D1 transients return a generic
    // Cloudflare 500 page (custom domain replaces the body with
    // text/plain "error code: 500"). Return a JSON envelope the SPA
    // can render so the operator sees a useful message instead of
    // "Не удалось загрузить: 500".
    const err = e as Error;
    console.error(`[indexnow.recent] ${err?.message || String(e)}`);
    return jsonResponse({
      ok: false,
      total: 0,
      items: [],
      error: (err?.message || 'IndexNow listing temporarily unavailable').slice(0, 240),
    }, 200);
  }
};
