// GET /api/seo/ai/patch?runId=<runId>
//
// Returns the approved-fields snapshot for a single AI patch run so the
// Page/Blog editor can prefill its local draft state (Editor Bridge).
//
// Source of truth: content/seo/ai-runs.json (the AI Autopilot ledger).
// This endpoint is read-only — it never mutates content/* or live URLs.
//
// Security:
//   - Requires admin JWT (same as the rest of /api/seo/ai/*).
//   - Maps the approved-field snapshot through ai-seo-bridge.ts so we never
//     return slug/canonical/robots changes even if some legacy ledger entry
//     somehow contained them.
//   - Field schema is unchanged from validate-patch / apply-patch.
//
// Response shape:
//   200  { ok: true, runId, url, target, locale, slug, applied, approvedFields, skipped, createdAt }
//   404  { ok: false, error: 'run not found' }
//   400  { ok: false, error: '...' }

import type { Env } from '../../../_types';
import { requireAuth } from '../../../lib/jwt';
import { jsonResponse } from '../../../lib/api-errors';
import { findRun } from '../../../lib/ai-seo/store';
import {
  parseEditorRoute,
  mapApprovedFieldsToEditorDraft,
} from '../../../../src/shared/ai-seo-bridge';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const runId = url.searchParams.get('runId') || '';
  if (!runId) return jsonResponse({ ok: false, error: 'runId required' }, 400);

  const run = await findRun(env, runId);
  if (!run) return jsonResponse({ ok: false, error: 'run not found' }, 404);
  if (run.status !== 'applied') {
    return jsonResponse({ ok: false, error: 'run is not in applied status' }, 409);
  }

  const route = parseEditorRoute(run.url);
  if (!route) {
    return jsonResponse({ ok: false, error: 'run URL is not editable (admin/api/non-content URL)' }, 422);
  }

  const { patch, skipped } = mapApprovedFieldsToEditorDraft(run.applied || {}, route.target);

  return jsonResponse({
    ok: true,
    runId: run.runId,
    url: run.url,
    target: route.target,
    locale: route.locale,
    slug: route.slug,
    action: run.action,
    provider: run.provider,
    model: run.model,
    createdAt: run.createdAt,
    approvedFields: run.approvedFields,
    applied: patch,
    skipped,
  });
};
