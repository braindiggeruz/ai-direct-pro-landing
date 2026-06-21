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
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  duration_ms: number | null;
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
