export const AUTOMATION_JOB_TYPES = ['seo_draft_generation'] as const;
export type AutomationJobType = (typeof AUTOMATION_JOB_TYPES)[number];

export const AUTOMATION_JOB_STATUSES = [
  'queued',
  'leased',
  'running',
  'retry_wait',
  'awaiting_review',
  'completed',
  'dead_letter',
  'cancelled',
] as const;
export type AutomationJobStatus = (typeof AUTOMATION_JOB_STATUSES)[number];

export const AUTOMATION_TERMINAL_STATUSES = [
  'awaiting_review',
  'completed',
  'dead_letter',
  'cancelled',
] as const;

export interface AutomationJob {
  jobId: string;
  jobType: AutomationJobType;
  tenantKey: string;
  idempotencyKey: string;
  requestRef: string;
  status: AutomationJobStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  enqueuedAt: string | null;
  cancelRequested: boolean;
  resultRef: string | null;
  lastErrorCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AutomationQueueMessage {
  schema: 'gptbot.automation.job.v1';
  job_id: string;
  job_type: AutomationJobType;
  delivery_id: string;
}

export interface CreateAutomationJobInput {
  tenantKey: string;
  jobType: AutomationJobType;
  idempotencyKey: string;
  requestRef: string;
  maxAttempts?: number;
  availableAt?: string;
}

export type AutomationEventType =
  | 'created'
  | 'enqueued'
  | 'leased'
  | 'started'
  | 'retry_scheduled'
  | 'awaiting_review'
  | 'completed'
  | 'dead_lettered'
  | 'cancelled'
  | 'dlq_replayed';

export interface AutomationQueueSender {
  send(message: AutomationQueueMessage, options?: { delaySeconds?: number }): Promise<void>;
}

export interface AutomationClock {
  now(): Date;
}

export interface AutomationStepResult {
  status: 'awaiting_review' | 'completed';
  resultRef: string;
}

export type AutomationJobHandler = (
  job: AutomationJob,
) => Promise<AutomationStepResult>;

export class AutomationStepError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'AutomationStepError';
  }
}
