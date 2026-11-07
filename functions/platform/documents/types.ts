export const DOCUMENT_ORG = 'gptbot-documents';
export const DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;
export const DOCUMENT_LEASE_MS = 120_000;
export const DOCUMENT_MAX_ATTEMPTS = 3;
export const DOCUMENT_MAX_BODY = 1024 * 1024;
export const DOCUMENT_MAX_PDF = 10 * 1024 * 1024;
export type DocumentType = 'presentation_pdf' | 'proposal_pdf';
export type DocumentStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';
export type DocumentFailure = 'render_failed' | 'invalid_payload' | 'timeout';
export type DocumentErrorCode = 'documents_unavailable' | 'identity_required' | 'forbidden' | 'invalid_payload' | 'payload_too_large' | 'idempotency_required' | 'idempotency_conflict' | 'quota_exceeded' | 'not_found' | 'job_not_ready' | 'job_conflict' | 'lease_conflict' | 'method_not_allowed';
export class DocumentError extends Error {
  constructor(readonly code: DocumentErrorCode, readonly status: number) { super(code); }
}
export interface DocumentEnv {
  DOCUMENT_JOBS_ENABLED?: string;
  DOCUMENT_WORKER_SECRET?: string;
  DOCUMENT_ARTIFACTS?: R2Bucket;
  DOCUMENT_JOBS_DAILY_SUBJECT_LIMIT?: string;
  DOCUMENT_JOBS_DAILY_GLOBAL_LIMIT?: string;
  GPTBOT_DRAFTS_DB?: D1Database;
}
export interface PresentationPayload {
  locale: 'ru' | 'uz'; title: string;
  slides: { title: string; bullets: string[]; notes?: string }[];
}
export interface ProposalPayload {
  locale: 'ru' | 'uz'; company: string; contact?: string; objective: string;
  packageId: string; scope?: string[]; budgetTerms?: string;
}
export type DocumentPayload = PresentationPayload | ProposalPayload;
export interface DocumentCreate { type: DocumentType; payload: DocumentPayload }
export interface DocumentJob {
  id: string; org_id: string; subject: string; type: DocumentType; status: DocumentStatus;
  payload_json: string | null; payload_hash: string; idempotency_key: string;
  attempts: number; lease_token: string | null; lease_expires_at: number | null;
  artifact_key: string | null; artifact_bytes: number | null; error_code: DocumentFailure | null;
  created_at: number; updated_at: number; expires_at: number;
}
