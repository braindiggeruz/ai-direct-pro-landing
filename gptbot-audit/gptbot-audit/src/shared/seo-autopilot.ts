// Types shared between the admin SPA and Pages Functions for the
// SEO Autopilot Control Center.

export type AutopilotJobStatus =
  | 'pending'
  | 'forwarding'
  | 'normalising'
  | 'ingesting'
  | 'completed'
  | 'failed';

export type AutopilotJobSource = 'admin' | 'schedule' | 'external';

export interface AutopilotJobRow {
  id: string;
  /** request_id used by the launcher; quick-launch polls by this. */
  request_id?: string | null;
  source: AutopilotJobSource | string;
  requested_by: string | null;
  status: AutopilotJobStatus;
  n8n_status: number | null;
  n8n_execution_id: string | null;
  generation_status: string | null;
  validation_status: string | null;
  validation_issue_count: number | null;
  draft_id: string | null;
  bundle_id: string | null;
  admin_url: string | null;
  deduplicated: boolean;
  ingestion_success: boolean;
  error_code: string | null;
  error_message: string | null;
  error_detail: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  /** LLM provider that finally produced the bundle. Server-side fact, not UI choice. */
  llm_provider: string | null;
  llm_model: string | null;
  llm_fallback_used: boolean;
}

export interface AutopilotJobDetail extends AutopilotJobRow {
  is_terminal: boolean;
  manual_approval_required: boolean;
  ready_for_publish: boolean;
  validation_passed: boolean | null;
  error_detail: Record<string, unknown> | null;
  next_action: string;
  success: boolean;
  job_id: string;
  request_id: string | null;
}

/** New synchronous-launch response shape from POST /api/admin/seo-autopilot/run. */
export interface AutopilotLaunchResult {
  success: boolean;
  accepted: boolean;
  job_id: string;
  run_id: string;
  status: AutopilotJobStatus;
  status_url: string;
  source: 'admin' | 'schedule' | 'external' | string;
  requested_by: string;
  manual_approval_required: boolean;
  ready_for_publish: boolean;
  draft_id: string | null;
  bundle_id: string | null;
  admin_url: string | null;
  n8n_status: number | null;
  n8n_execution_id: string | null;
  generation_status: string | null;
  validation_status: string | null;
  validation_passed: boolean | null;
  validation_issue_count: number | null;
  ingestion_success: boolean;
  deduplicated: boolean;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  error_detail: Record<string, unknown> | null;
  note: string;
}

export interface AutopilotSystemFlags {
  n8n_webhook_secret_configured: boolean;
  cron_secret_configured: boolean;
  drafts_db_configured: boolean;
  external_trigger_enabled: boolean;
  /** True when SEO_AUTOPILOT_USE_DIRECT_AI=true and a Workers AI binding is available. */
  direct_ai_enabled?: boolean;
  ai_binding_configured?: boolean;
  stale_jobs_swept?: number;
  pending_drafts?: number;
  last_completed?: { draft_id: string | null; admin_url: string | null; finished_at: string | null } | null;
  /** Multi-provider LLM router — list of providers and whether each key is set. */
  llm_providers?: Array<{ provider: string; configured: boolean }>;
}
