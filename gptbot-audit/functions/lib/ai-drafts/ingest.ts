// Shared ingestion service for the AI Draft Inbox.
//
// Two callers reuse this code path:
//   - POST /api/admin/ai-drafts          (direct n8n integration)
//   - background job from /api/seo-autopilot/run (bridge — n8n → bridge → ingest)
//
// Both go through `validateIncomingBundle` (same hard rules) and
// `insertOrReuseDraft` (same idempotency + audit), so safety guarantees
// are byte-for-byte identical.

import type { Env } from '../../_types';
import { insertOrReuseDraft, DraftsDbMissingError } from './store';
import { validateIncomingBundle } from './validators';
import type { AiDraftIngestResponse, AiDraftRecord } from '../../../src/shared/ai-drafts';

export interface IngestSuccess {
  ok: true;
  response: AiDraftIngestResponse;
  record: AiDraftRecord;
}

export interface IngestFailure {
  ok: false;
  http: number;
  body: { error: string; issues?: Array<{ path: string; message: string }>; detail?: string };
}

export type IngestResult = IngestSuccess | IngestFailure;

/**
 * Validate + persist a raw incoming bundle. Always lands a draft as
 * `pending_review`, never auto-publishes, and is idempotent on bundle_id.
 *
 * `raw` is whatever shape the caller has. The shared validator decides
 * if it conforms to the gptbot.article-draft.v1 contract.
 */
export async function ingestRawBundle(env: Env, raw: unknown): Promise<IngestResult> {
  if (!env.GPTBOT_DRAFTS_DB) {
    return { ok: false, http: 503, body: { error: 'Draft storage not configured.' } };
  }
  const result = validateIncomingBundle(raw);
  if (!result.ok || !result.bundle) {
    return { ok: false, http: 400, body: { error: 'Validation failed', issues: result.errors.slice(0, 50) } };
  }
  try {
    const { record, deduplicated } = await insertOrReuseDraft(env, result.bundle);
    return {
      ok: true,
      record,
      response: {
        success: true,
        draft_id: record.id,
        bundle_id: record.bundle_id,
        status: record.status,
        admin_url: `/admin-tools/ai-drafts/${record.id}`,
        deduplicated,
      },
    };
  } catch (e) {
    if (e instanceof DraftsDbMissingError) return { ok: false, http: 503, body: { error: 'Draft storage not configured.' } };
    return { ok: false, http: 500, body: { error: 'Failed to persist draft', detail: (e as Error).message } };
  }
}
