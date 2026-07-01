// GET /api/admin/cockpit
//
// SEO Mission Control aggregator. Loads ALL data the cockpit needs in
// a single authenticated request, BUT each data source is fetched
// independently and reported with its own status:
//
//   {
//     "success": true,                       // always true unless auth failed
//     "request_id": "req_...",
//     "generated_at": "2026-06-21T...",
//     "audit":    { ok: true,  data: { ... }, error: null },
//     "content":  { ok: true,  data: { ... }, error: null },
//     "drafts":   { ok: true,  data: { ... }, error: null },
//     "autopilot":{ ok: false, data: null,    error: {...} },
//     "health":   { ok: true,  data: { ... }, error: null }
//   }
//
// This is what lets the new Cockpit UI render even when ONE source is
// down — the legacy `Promise.all([audit, content])` rendered the whole
// page as "Failed: 500" if either source threw.
//
// The endpoint also computes the "Next Best Actions" queue server-side
// (sorted by impact) so the SPA does not have to re-aggregate.

import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { readContentBulk, checkGitHubHealth, type GitHubHealth, ghOwner, ghRepo, ghBranch } from '../../lib/github';
import { parseContentBulk } from '../../lib/content-parse';
import { buildCockpit } from '../../../src/shared/audit';
import type { Page, BlogArticle, GlobalSEO, CockpitStats } from '../../../src/shared/types';
import { markStaleJobsAsFailed } from '../../lib/seo-autopilot/jobs';
import {
  newRequestId, jsonResponse, classifyError, humanMessageFor, withErrorHandler,
  type ErrorCode,
} from '../../lib/api-errors';
import { buildNextBestActions, type NextBestAction } from '../../../src/shared/next-actions';

const SITE_BASE = 'https://gptbot.uz';
const STALE_AUTOPILOT_AGE_MS = 6 * 60 * 1000;

interface Section<T> {
  ok: boolean;
  data: T | null;
  error: { code: ErrorCode; message: string } | null;
  duration_ms: number;
}

async function timeit<T>(load: () => Promise<T>): Promise<Section<T>> {
  const t0 = Date.now();
  try {
    const data = await load();
    return { ok: true, data, error: null, duration_ms: Date.now() - t0 };
  } catch (e) {
    const code = classifyError(e);
    const message = humanMessageFor(code, e);
    // Log so the operator can correlate request_id from response headers
    // with the actual stack. `withErrorHandler` adds a top-level request_id
    // header; section-level errors are also logged here.
    console.error(`[cockpit.section] ${code}: ${message} — ${(e as Error)?.message || String(e)}`);
    return { ok: false, data: null, error: { code, message }, duration_ms: Date.now() - t0 };
  }
}

interface ContentSection {
  pages: Page[];
  blog: BlogArticle[];
  global: GlobalSEO | null;
  redirects: unknown[];
  internalLinks: unknown[];
}

async function loadContentAndAudit(env: Env): Promise<{
  content: ContentSection;
  audit: CockpitStats & {
    totalBlog: number; publishedBlog: number; blogInSitemap: number;
    blogMissingFaq: number; blogMissingTitle: number; blogMissingDescription: number;
    blogDuplicateTitle: number;
  };
}> {
  const all = await readContentBulk(env);
  const { pages, blog, global: globalObj } = parseContentBulk(all);
  let redirects: unknown[] = [];
  let internalLinks: unknown[] = [];
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(text);
      if (path === 'content/seo/redirects.json') redirects = (parsed as unknown[]) || [];
      else if (path === 'content/seo/internal-links.json') internalLinks = (parsed as unknown[]) || [];
    } catch { /* skip unparseable */ }
  }
  const cockpit = buildCockpit(pages, globalObj);
  const publishedBlog = blog.filter((a) => a.status === 'published');
  return {
    content: { pages, blog, global: globalObj ?? null, redirects, internalLinks },
    audit: {
      ...cockpit,
      totalBlog: blog.length,
      publishedBlog: publishedBlog.length,
      blogInSitemap: publishedBlog.filter((a) => a.robotsIndex !== false).length,
      blogMissingFaq: publishedBlog.filter((a) => !a.faq || a.faq.length < 3).length,
      blogMissingTitle: publishedBlog.filter((a) => !a.title).length,
      blogMissingDescription: publishedBlog.filter((a) => !a.description).length,
      blogDuplicateTitle: publishedBlog.length - new Set(publishedBlog.map((a) => a.title)).size,
    },
  };
}

interface HealthProbe {
  randomUrl404: boolean; randomUrlStatus: number;
  adminNoindex: boolean; adminStatus: number;
  sitemap200Xml: boolean; sitemapStatus: number;
  robots200: boolean; robotsStatus: number;
  faviconLive: boolean; faviconStatus: number;
  sampleImageLive: boolean; sampleImageStatus: number;
  probedAt: string;
}

async function runLiveProbes(): Promise<HealthProbe> {
  async function probe(url: string): Promise<{ status: number; xRobots: string | null; contentType: string | null }> {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
      return { status: res.status, xRobots: res.headers.get('x-robots-tag'), contentType: res.headers.get('content-type') };
    } catch { return { status: 0, xRobots: null, contentType: null }; }
  }
  const [random, admin, sitemap, robots, fav, blog1] = await Promise.all([
    probe(`${SITE_BASE}/random-test-url-${Date.now()}`),
    probe(`${SITE_BASE}/admin-tools/`),
    probe(`${SITE_BASE}/sitemap.xml`),
    probe(`${SITE_BASE}/robots.txt`),
    probe(`${SITE_BASE}/favicon.svg`),
    probe(`${SITE_BASE}/assets/blog/1.png`),
  ]);
  return {
    randomUrl404: random.status === 404,
    randomUrlStatus: random.status,
    adminNoindex: (admin.xRobots || '').toLowerCase().includes('noindex'),
    adminStatus: admin.status,
    sitemap200Xml: sitemap.status === 200 && /(application|text)\/xml/.test(sitemap.contentType || ''),
    sitemapStatus: sitemap.status,
    robots200: robots.status === 200,
    robotsStatus: robots.status,
    faviconLive: fav.status === 200,
    faviconStatus: fav.status,
    sampleImageLive: blog1.status === 200,
    sampleImageStatus: blog1.status,
    probedAt: new Date().toISOString(),
  };
}

interface DraftsSummary {
  pending_review: number;
  needs_revision: number;
  rejected: number;
  imported: number;
  last_pending_id: string | null;
  last_pending_admin_url: string | null;
  last_pending_title: string | null;
}

async function loadDraftsSummary(env: Env): Promise<DraftsSummary> {
  if (!env.GPTBOT_DRAFTS_DB) throw new Error('D1 binding GPTBOT_DRAFTS_DB missing');
  const counts = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT status, COUNT(*) AS cnt FROM ai_drafts GROUP BY status`)
    .all<{ status: string; cnt: number }>();
  const tally: Record<string, number> = {};
  for (const row of counts.results || []) tally[row.status] = Number(row.cnt) || 0;
  const lastPending = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT id, primary_title FROM ai_drafts WHERE status='pending_review' ORDER BY created_at DESC LIMIT 1`)
    .first<{ id: string; primary_title: string | null }>();
  return {
    pending_review: tally.pending_review ?? 0,
    needs_revision: tally.needs_revision ?? 0,
    rejected: tally.rejected ?? 0,
    imported: tally.imported ?? 0,
    last_pending_id: lastPending?.id ?? null,
    last_pending_admin_url: lastPending ? `/admin-tools/ai-drafts/${lastPending.id}` : null,
    last_pending_title: lastPending?.primary_title ?? null,
  };
}

interface AutopilotSummary {
  total: number;
  in_flight: number;
  completed: number;
  /** Active failure: most recent run is failed AND younger than 24h. */
  active_failed: number;
  /** Failures within the rolling 24h window (active + recent terminal). */
  failed_24h: number;
  /** All failures ever recorded. */
  failed_total: number;
  stale_swept: number;
  last_completed: { id: string; draft_id: string | null; admin_url: string | null; finished_at: string | null } | null;
  last_failed: { id: string; error_code: string | null; error_message: string | null; created_at: string } | null;
  last_run: { id: string; status: string; created_at: string } | null;
  schedule_mode: 'disabled' | 'weekly' | 'twice_weekly';
  n8n_webhook_secret_configured: boolean;
  cron_secret_configured: boolean;
}

async function loadAutopilotSummary(env: Env): Promise<AutopilotSummary> {
  if (!env.GPTBOT_DRAFTS_DB) throw new Error('D1 binding GPTBOT_DRAFTS_DB missing');
  let staleSwept = 0;
  try { staleSwept = await markStaleJobsAsFailed(env, STALE_AUTOPILOT_AGE_MS); } catch { /* best-effort */ }
  const counts = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT status, COUNT(*) AS cnt FROM seo_autopilot_jobs GROUP BY status`)
    .all<{ status: string; cnt: number }>();
  const tally: Record<string, number> = {};
  for (const row of counts.results || []) tally[row.status] = Number(row.cnt) || 0;
  const failed24Row = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT COUNT(*) AS cnt FROM seo_autopilot_jobs WHERE status='failed' AND datetime(created_at) > datetime('now','-24 hours')`)
    .first<{ cnt: number }>();
  const lastCompleted = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT id, draft_id, admin_url, finished_at FROM seo_autopilot_jobs WHERE status='completed' AND draft_id IS NOT NULL ORDER BY finished_at DESC LIMIT 1`)
    .first<{ id: string; draft_id: string | null; admin_url: string | null; finished_at: string | null }>();
  const lastFailed = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT id, error_code, error_message, created_at FROM seo_autopilot_jobs WHERE status='failed' ORDER BY created_at DESC LIMIT 1`)
    .first<{ id: string; error_code: string | null; error_message: string | null; created_at: string }>();
  const lastRun = await env.GPTBOT_DRAFTS_DB
    .prepare(`SELECT id, status, created_at FROM seo_autopilot_jobs ORDER BY created_at DESC LIMIT 1`)
    .first<{ id: string; status: string; created_at: string }>();
  let scheduleMode: 'disabled' | 'weekly' | 'twice_weekly' = 'disabled';
  try {
    const setting = await env.GPTBOT_DRAFTS_DB
      .prepare(`SELECT value_json FROM system_settings WHERE key='seo_autopilot_schedule'`)
      .first<{ value_json: string }>();
    if (setting) {
      const parsed = JSON.parse(setting.value_json) as { mode?: string };
      const m = parsed.mode;
      if (m === 'weekly' || m === 'twice_weekly' || m === 'disabled') scheduleMode = m;
    }
  } catch { /* default disabled */ }
  const inFlight = (tally.pending ?? 0) + (tally.forwarding ?? 0) + (tally.normalising ?? 0) + (tally.ingesting ?? 0);
  // "Active failure" = the most recent run is a failed run AND it happened
  // recently (within 24h). This is the count the operator cares about; a
  // historical failure from a previous fix iteration must NOT inflate it.
  const activeFailed =
    lastRun?.status === 'failed'
    && new Date(lastRun.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
      ? 1 : 0;
  return {
    total: Object.values(tally).reduce((a, b) => a + b, 0),
    in_flight: inFlight,
    completed: tally.completed ?? 0,
    active_failed: activeFailed,
    failed_24h: Number(failed24Row?.cnt ?? 0),
    failed_total: tally.failed ?? 0,
    stale_swept: staleSwept,
    last_completed: lastCompleted
      ? { id: lastCompleted.id, draft_id: lastCompleted.draft_id, admin_url: lastCompleted.admin_url, finished_at: lastCompleted.finished_at }
      : null,
    last_failed: lastFailed
      ? { id: lastFailed.id, error_code: lastFailed.error_code, error_message: lastFailed.error_message, created_at: lastFailed.created_at }
      : null,
    last_run: lastRun
      ? { id: lastRun.id, status: lastRun.status, created_at: lastRun.created_at }
      : null,
    schedule_mode: scheduleMode,
    n8n_webhook_secret_configured: !!env.N8N_WEBHOOK_SECRET,
    cron_secret_configured: !!env.CRON_SECRET,
  };
}

export interface CockpitResponse {
  success: true;
  request_id: string;
  generated_at: string;
  audit: Section<Awaited<ReturnType<typeof loadContentAndAudit>>['audit']>;
  content: Section<ContentSection>;
  drafts: Section<DraftsSummary>;
  autopilot: Section<AutopilotSummary>;
  health: Section<HealthProbe>;
  github_health: GitHubHealth;
  next_best_actions: NextBestAction[];
  system: {
    github_token_configured: boolean;
    jwt_secret_configured: boolean;
    drafts_db_configured: boolean;
    n8n_webhook_secret_configured: boolean;
    serper_configured: boolean;
    openrouter_configured: boolean;
    gemini_configured: boolean;
    github: { owner: string; repo: string; branch: string };
  };
}

export const onRequestGet = withErrorHandler('admin.cockpit', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const requestId = newRequestId();
  // Run every section in parallel; partial failures are reported per-section.
  const [contentAudit, drafts, autopilot, health, githubHealth] = await Promise.all([
    timeit(() => loadContentAndAudit(env)),
    timeit(() => loadDraftsSummary(env)),
    timeit(() => loadAutopilotSummary(env)),
    timeit(() => runLiveProbes()),
    // Functional GitHub probe — auth + repo + branch + read one real blob.
    checkGitHubHealth(env).catch((e) => ({
      ok: false, level: 'failed' as const,
      owner: ghOwner(env), repo: ghRepo(env), branch: ghBranch(env),
      details: { token_present: !!env.GITHUB_TOKEN, auth_ok: null, repo_reachable: null,
                 branch_reachable: null, content_readable: null, sample_file: null,
                 sample_bytes: null, error: (e as Error)?.message?.slice(0, 240) || 'probe failed' },
    } as GitHubHealth)),
  ]);

  // Split the merged content+audit into two presented sections.
  const contentSection: Section<ContentSection> = contentAudit.ok
    ? { ok: true, data: contentAudit.data!.content, error: null, duration_ms: contentAudit.duration_ms }
    : { ok: false, data: null, error: contentAudit.error, duration_ms: contentAudit.duration_ms };
  const auditSection: Section<Awaited<ReturnType<typeof loadContentAndAudit>>['audit']> = contentAudit.ok
    ? { ok: true, data: contentAudit.data!.audit, error: null, duration_ms: contentAudit.duration_ms }
    : { ok: false, data: null, error: contentAudit.error, duration_ms: contentAudit.duration_ms };

  const next = buildNextBestActions({
    audit: auditSection.data,
    content: contentSection.data,
    drafts: drafts.data,
    autopilot: autopilot.data,
    health: health.data,
    sectionsFailed: [
      ...(auditSection.ok ? [] : ['audit']),
      ...(contentSection.ok ? [] : ['content']),
      ...(drafts.ok ? [] : ['drafts']),
      ...(autopilot.ok ? [] : ['autopilot']),
      ...(health.ok ? [] : ['health']),
    ],
  });

  const body: CockpitResponse = {
    success: true,
    request_id: requestId,
    generated_at: new Date().toISOString(),
    audit: auditSection,
    content: contentSection,
    drafts,
    autopilot,
    health,
    github_health: githubHealth,
    next_best_actions: next,
    system: {
      github_token_configured: !!env.GITHUB_TOKEN,
      jwt_secret_configured: !!env.JWT_SECRET,
      drafts_db_configured: !!env.GPTBOT_DRAFTS_DB,
      n8n_webhook_secret_configured: !!env.N8N_WEBHOOK_SECRET,
      serper_configured: !!env.SERPER_API_KEY,
      openrouter_configured: !!env.OPENROUTER_API_KEY,
      gemini_configured: !!env.GEMINI_API_KEY,
      github: { owner: ghOwner(env), repo: ghRepo(env), branch: ghBranch(env) },
    },
  };

  const res = jsonResponse(body);
  res.headers.set('x-request-id', requestId);
  return res;
});
