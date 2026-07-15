// Unit tests for the SEO Mission Control aggregator: Next Best Actions
// engine + structured error response helper.

import { buildNextBestActions } from '../src/shared/next-actions';
import { newRequestId, classifyError, humanMessageFor, errorResponse } from '../functions/lib/api-errors';

interface T { name: string; passed: boolean; detail?: string }
const results: T[] = [];
const expect = (name: string, cond: boolean, detail?: string): void => { results.push({ name, passed: cond, detail }); };

// ─── Next Best Actions ───────────────────────────────────────────────

// 1. Clean slate → no actions.
{
  const r = buildNextBestActions({
    audit: { totalPages: 5, publishedPages: 5, draftPages: 0, noindexPages: 0,
      pagesInSitemap: 5, missingTitle: 0, missingDescription: 0, missingH1: 0,
      missingCanonical: 0, missingJsonLd: 0, duplicateTitle: 0, duplicateDescription: 0,
      orphanPages: 0, brokenInternalLinks: 0, missingFaq: 0, missingHreflang: 0,
      missingOg: 0, ruUzPairsOk: 5, ruUzPairsMissing: 0, avgMoneyScore: 100, avgBlogScore: 100,
      mojibakePages: 0, pages: [] },
    content: { pages: [], blog: [] },
    drafts: { pending_review: 0, needs_revision: 0, last_pending_id: null, last_pending_admin_url: null, last_pending_title: null },
    autopilot: { active_failed: 0, failed_24h: 0, failed_total: 0, in_flight: 0, stale_swept: 0, last_failed: null, n8n_webhook_secret_configured: true, schedule_mode: 'weekly' },
    health: { sitemap200Xml: true, randomUrl404: true, adminNoindex: true, robots200: true, faviconLive: true, sampleImageLive: true },
    sectionsFailed: [],
  });
  expect('clean state → 0 actions', r.length === 0, `got ${r.length}`);
}

// 2. Pending draft → action card.
{
  const r = buildNextBestActions({
    audit: null, content: null,
    drafts: { pending_review: 1, needs_revision: 0, last_pending_id: 'draft_xyz', last_pending_admin_url: '/admin-tools/ai-drafts/draft_xyz', last_pending_title: 'GPT-боты для бизнеса в Узбекистане' },
    autopilot: { active_failed: 0, failed_24h: 0, failed_total: 0, in_flight: 0, stale_swept: 0, last_failed: null, n8n_webhook_secret_configured: true, schedule_mode: 'disabled' },
    health: null, sectionsFailed: [],
  });
  const pending = r.find((a) => a.id.startsWith('drafts-pending'));
  expect('pending draft surfaced', !!pending, pending && `path=${pending.action_path}`);
  expect('pending draft deep-links to draft', pending?.action_path === '/admin-tools/ai-drafts/draft_xyz');
  expect('pending draft tagged drafts category', pending?.category === 'drafts');
}

// 3. Section-failed → top of the list.
{
  const r = buildNextBestActions({
    audit: null, content: null, drafts: null, autopilot: null, health: null,
    sectionsFailed: ['drafts', 'autopilot'],
  });
  expect('section-failed action exists for each failed section', r.filter((a) => a.id.startsWith('section-failed')).length === 2);
  expect('section-failed has high weight (top)', r[0].weight >= 800 && r[0].id.startsWith('section-failed'));
}

// 3b. Audit/content section failure → CRITICAL weight (≥ 950).
{
  const r = buildNextBestActions({
    audit: null, content: null, drafts: null, autopilot: null, health: null,
    sectionsFailed: ['audit'],
  });
  const a = r.find((x) => x.id === 'section-failed-audit');
  expect('audit section failure is critical', a?.risk === 'critical' && (a?.weight ?? 0) >= 950, `weight=${a?.weight} risk=${a?.risk}`);
}

// 4. Mojibake → critical.
{
  const r = buildNextBestActions({
    audit: { totalPages: 1, publishedPages: 0, draftPages: 0, noindexPages: 0,
      pagesInSitemap: 0, missingTitle: 0, missingDescription: 0, missingH1: 0,
      missingCanonical: 0, missingJsonLd: 0, duplicateTitle: 0, duplicateDescription: 0,
      orphanPages: 0, brokenInternalLinks: 0, missingFaq: 0, missingHreflang: 0,
      missingOg: 0, ruUzPairsOk: 0, ruUzPairsMissing: 0, avgMoneyScore: 0, avgBlogScore: 0,
      mojibakePages: 3, pages: [] },
    content: null, drafts: null, autopilot: null, health: null, sectionsFailed: [],
  });
  const m = r.find((a) => a.id === 'audit-mojibake');
  expect('mojibake action surfaces', !!m);
  expect('mojibake has high weight', (m?.weight ?? 0) >= 900);
}

// 5. Top-7 cap.
{
  const r = buildNextBestActions({
    audit: { totalPages: 30, publishedPages: 20, draftPages: 5, noindexPages: 5,
      pagesInSitemap: 15, missingTitle: 3, missingDescription: 5, missingH1: 2,
      missingCanonical: 4, missingJsonLd: 6, duplicateTitle: 3, duplicateDescription: 2,
      orphanPages: 4, brokenInternalLinks: 7, missingFaq: 8, missingHreflang: 0,
      missingOg: 0, ruUzPairsOk: 5, ruUzPairsMissing: 3, avgMoneyScore: 70, avgBlogScore: 60,
      mojibakePages: 1, pages: [] },
    content: null,
    drafts: { pending_review: 2, needs_revision: 1, last_pending_id: 'd', last_pending_admin_url: '/admin-tools/ai-drafts/d', last_pending_title: 't' },
    autopilot: { active_failed: 0, failed_24h: 0, failed_total: 0, in_flight: 1, stale_swept: 0, last_failed: { id: 'job_1', error_code: 'n8n_http_400', error_message: 'boom', }, n8n_webhook_secret_configured: true, schedule_mode: 'weekly' },
    health: { sitemap200Xml: false, randomUrl404: true, adminNoindex: true, robots200: true, faviconLive: true, sampleImageLive: true },
    sectionsFailed: [],
  });
  expect('top-7 cap', r.length === 7);
  expect('descending weight order', r.every((a, i) => i === 0 || a.weight <= r[i-1].weight));
}

// ─── Error helpers ───────────────────────────────────────────────────

// 6. classifyError on known shapes.
{
  expect('classify github 401', classifyError(new Error('GitHub getFile foo failed: 401 Bad credentials')) === 'GITHUB_AUTH_FAILED');
  expect('classify github 500', classifyError(new Error('GitHub getFile foo failed: 500 internal')) === 'GITHUB_UNAVAILABLE');
  expect('classify github rate limit', classifyError(new Error('GitHub graphql errors: rate limit exceeded')) === 'GITHUB_RATE_LIMITED');
  expect('classify d1', classifyError(new Error('D1_ERROR: no such table: foo')) === 'D1_QUERY_FAILED');
  expect('classify timeout', classifyError(new Error('Operation timed out')) === 'INTEGRATION_TIMEOUT');
  expect('classify unknown', classifyError(new Error('Wat')) === 'INTERNAL_ERROR');
}

// 7. humanMessageFor never throws + appends original tail.
{
  expect('human message GH auth includes hint', /Rotate GITHUB_TOKEN/.test(humanMessageFor('GITHUB_AUTH_FAILED', new Error('Bad credentials'))));
  expect('human message D1 has friendly text', /D1/.test(humanMessageFor('D1_QUERY_FAILED', new Error('boom'))));
  expect('human message INTERNAL has fallback', humanMessageFor('INTERNAL_ERROR', undefined).length > 0);
}

// 8. errorResponse returns the structured envelope.
{
  // Direct sync check (newRequestId behavior is exercised below).
}

// Async tests below.
const asyncTests = (async () => {
  const r = errorResponse('test.endpoint', 'GITHUB_AUTH_FAILED', 'PAT expired', { requestId: 'req_test456' });
  expect('errorResponse status maps from code', r.status === 502, `got ${r.status}`);
  const body = await r.json() as { success: boolean; error: { code: string; message: string; request_id: string; endpoint: string; retryable: boolean } };
  expect('errorResponse body success=false', body.success === false);
  expect('errorResponse body has code', body.error.code === 'GITHUB_AUTH_FAILED');
  expect('errorResponse body has request_id', body.error.request_id === 'req_test456');
  expect('errorResponse body has endpoint', body.error.endpoint === 'test.endpoint');
  expect('errorResponse body retryable correct', body.error.retryable === false);

  // newRequestId is a UUID-ish string
  const id = newRequestId();
  expect('newRequestId starts with req_', id.startsWith('req_'));
  expect('newRequestId uniqueness', newRequestId() !== newRequestId());
})();

await asyncTests;

// ─── Report ───────────────────────────────────────────────────────────
let fail = 0;
for (const r of results) {
  const ok = r.passed ? 'PASS' : 'FAIL';
  console.log(`${ok}  ${r.name}${r.detail && !r.passed ? `  — ${r.detail}` : ''}`);
  if (!r.passed) fail++;
}
console.log(`\nTotal: ${results.length}, passed: ${results.length - fail}, failed: ${fail}`);
if (fail > 0) process.exit(1);
