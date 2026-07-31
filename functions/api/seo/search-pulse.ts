// GET/POST /api/seo/search-pulse
//
// One-click, white-hat discovery workflow:
//   1. recompute published content quality server-side;
//   2. select only new/significantly updated URLs;
//   3. announce them through IndexNow with the shared resilient engine;
//   4. re-submit sitemap.xml through the Google Search Console Sitemap API.
//
// This endpoint deliberately does NOT use Google's restricted Indexing API,
// which is only supported for JobPosting and BroadcastEvent pages.

import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { readContentBulk } from '../../lib/github';
import { readLatestSuccessfulPerUrl, writeAudit } from '../../lib/indexnow/audit';
import { INDEXNOW_ENDPOINT, runChunkedSubmit } from '../../lib/indexnow/submit-engine';
import { DEFAULT_SITEMAP_URL, isGscConfigured, submitSitemapToGsc } from '../../lib/gsc/sitemap';
import { buildBoosterReport } from '../../../src/shared/booster';
import {
  SEARCH_PULSE_FRESH_DAYS,
  SEARCH_PULSE_HARD_CAP,
  SEARCH_PULSE_QUALITY_THRESHOLD,
  selectSearchPulseCandidates,
  type SearchPulsePreview,
  type SearchPulseRunResult,
  type SearchPulseSelection,
} from '../../../src/shared/search-pulse';
import type { BlogArticle, GlobalSEO, Page } from '../../../src/shared/types';

const SITE_HOST = 'gptbot.uz';
const SITE_URL = `https://${SITE_HOST}`;
const MANUAL_QUEUE_LIMIT = 10;

interface SearchPulseEnv extends Env {
  INDEXNOW_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function buildSelection(env: Env): Promise<SearchPulseSelection> {
  if (!env.GPTBOT_DRAFTS_DB) {
    throw new Error('Search Pulse requires the GPTBOT_DRAFTS_DB audit binding.');
  }
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
    } catch {
      // A malformed content file is already excluded by the quality gate.
    }
  }
  const report = buildBoosterReport(pages, blog, globalObj);
  const absoluteUrls = report.items.map((item) => `${SITE_URL}${item.url}`);
  // Fail closed if the audit lookup fails. Treating a transient D1 error as
  // "nothing was ever submitted" would turn every fresh page into a repeat.
  const latestRows = await readLatestSuccessfulPerUrl(env, absoluteUrls);
  const latestSuccessful = new Map<string, { submittedAt: string }>();
  for (const [url, row] of latestRows) {
    latestSuccessful.set(url, { submittedAt: row.submitted_at });
  }
  return selectSearchPulseCandidates(report.items, latestSuccessful);
}

function manualQueue(selection: SearchPulseSelection): string[] {
  return selection.ready.slice(0, MANUAL_QUEUE_LIMIT).map((candidate) => candidate.url);
}

async function submitIndexNow(
  env: SearchPulseEnv,
  actorEmail: string,
  selection: SearchPulseSelection,
): Promise<SearchPulseRunResult['indexNow']> {
  const urls = selection.ready.map((candidate) => candidate.url);
  if (urls.length === 0) {
    return {
      status: 'not_run',
      attempted: 0,
      succeeded: 0,
      skipped: selection.coolingDown.length + selection.alreadyCurrent,
      failed: 0,
      deferred: selection.deferredCount,
      message: 'Нет новых безопасных URL для отправки.',
    };
  }

  const key = env.INDEXNOW_KEY;
  if (!key || !/^[A-Za-z0-9-]{8,64}$/.test(key)) {
    return {
      status: 'not_configured',
      attempted: 0,
      succeeded: 0,
      skipped: selection.coolingDown.length + selection.alreadyCurrent,
      failed: 0,
      deferred: selection.deferredCount,
      message: 'INDEXNOW_KEY не настроен.',
    };
  }

  const keyLocation = `${SITE_URL}/${key}.txt`;
  try {
    const probe = await fetch(keyLocation, { method: 'HEAD' });
    if (probe.status !== 200) {
      return {
        status: 'failed',
        attempted: 0,
        succeeded: 0,
        skipped: selection.coolingDown.length + selection.alreadyCurrent,
        failed: urls.length,
        deferred: selection.deferredCount,
        message: `Файл ключа IndexNow недоступен (HTTP ${probe.status}).`,
      };
    }
  } catch {
    return {
      status: 'failed',
      attempted: 0,
      succeeded: 0,
      skipped: selection.coolingDown.length + selection.alreadyCurrent,
      failed: urls.length,
      deferred: selection.deferredCount,
      message: 'Не удалось проверить файл ключа IndexNow.',
    };
  }

  const startedAt = Date.now();
  const submittedAt = new Date(startedAt).toISOString();
  const batchId = `sp_${startedAt}_${crypto.randomUUID().slice(0, 8)}`;
  const result = await runChunkedSubmit({
    urls,
    // The selector already handled the version-aware 24-hour cooldown.
    recentSuccess: new Map(),
    buildPayload: (urlList) => ({ host: SITE_HOST, key, keyLocation, urlList }),
  });
  const durationMs = Date.now() - startedAt;
  await writeAudit(env, result.perUrl.map((row) => ({
    submitted_at: submittedAt,
    actor_email: actorEmail,
    url: row.url,
    upstream_status: row.upstreamStatus,
    upstream_ok: row.kind === 'ok',
    batch_id: batchId,
    duration_ms: durationMs,
    error: row.kind === 'ok'
      ? null
      : `search_pulse:${row.kind}${row.error ? `: ${row.error}` : ''}`.slice(0, 480),
  }))).catch(() => undefined);

  const failures = result.failed + result.rateLimited;
  return {
    status: failures === 0 && result.deferred === 0 ? 'success' : result.succeeded > 0 ? 'partial' : 'failed',
    attempted: urls.length,
    succeeded: result.succeeded,
    skipped: result.skippedDuplicate + selection.coolingDown.length + selection.alreadyCurrent,
    failed: failures,
    deferred: result.deferred + selection.deferredCount,
    message: result.succeeded > 0
      ? `IndexNow принял ${result.succeeded} URL через ${INDEXNOW_ENDPOINT}.`
      : 'IndexNow не принял URL; детали сохранены в журнале.',
  };
}

export const onRequestGet: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const selection = await buildSelection(env);
  const preview: SearchPulsePreview = {
    generatedAt: new Date().toISOString(),
    qualityThreshold: SEARCH_PULSE_QUALITY_THRESHOLD,
    freshDays: SEARCH_PULSE_FRESH_DAYS,
    hardCap: SEARCH_PULSE_HARD_CAP,
    gscConfigured: isGscConfigured(env),
    selection,
    manualGoogleQueue: manualQueue(selection),
  };
  return json(preview);
};

export const onRequestPost: PagesFunction<SearchPulseEnv> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const selection = await buildSelection(env);
  if (selection.ready.length === 0) {
    const result: SearchPulseRunResult = {
      ok: true,
      generatedAt: new Date().toISOString(),
      selection,
      indexNow: await submitIndexNow(env, auth.email, selection),
      google: {
        status: 'not_run',
        sitemapUrl: env.GSC_SITEMAP_URL || DEFAULT_SITEMAP_URL,
        message: 'Sitemap не отправлялся: новых URL нет.',
      },
      manualGoogleQueue: [],
    };
    return json(result);
  }

  const googlePromise = submitSitemapToGsc(env);
  const [indexNow, google] = await Promise.all([
    submitIndexNow(env, auth.email, selection),
    googlePromise,
  ]);
  const ok = indexNow.status !== 'failed' && google.status !== 'failed';
  const result: SearchPulseRunResult = {
    ok,
    generatedAt: new Date().toISOString(),
    selection,
    indexNow,
    google,
    manualGoogleQueue: google.status === 'success' ? [] : manualQueue(selection),
  };
  return json(result);
};
