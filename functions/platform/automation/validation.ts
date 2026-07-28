import {
  AUTOMATION_JOB_TYPES,
  type AutomationJobType,
  type AutomationQueueMessage,
} from './types';

export const AUTOMATION_LIMITS = Object.freeze({
  queueMessageBytes: 2_048,
  tenantKeyLength: 120,
  idempotencyKeyLength: 200,
  requestRefLength: 240,
  leaseOwnerLength: 120,
  resultRefLength: 240,
  errorCodeLength: 80,
});

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]*$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9._-]*$/;
const JOB_TYPES = new Set<string>(AUTOMATION_JOB_TYPES);
const MESSAGE_KEYS = ['delivery_id', 'job_id', 'job_type', 'schema'];

export class AutomationValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AutomationValidationError';
  }
}

function boundedString(
  value: unknown,
  maxLength: number,
  pattern: RegExp,
  code: string,
): string {
  if (typeof value !== 'string') throw new AutomationValidationError(code);
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > maxLength
    || !pattern.test(normalized)
  ) {
    throw new AutomationValidationError(code);
  }
  return normalized;
}

export function requireAutomationJobType(value: unknown): AutomationJobType {
  if (typeof value !== 'string' || !JOB_TYPES.has(value)) {
    throw new AutomationValidationError('invalid_job_type');
  }
  return value as AutomationJobType;
}

export function requireTenantKey(value: unknown): string {
  return boundedString(
    value,
    AUTOMATION_LIMITS.tenantKeyLength,
    SAFE_REFERENCE,
    'invalid_tenant',
  );
}

export function requireIdempotencyKey(value: unknown): string {
  return boundedString(
    value,
    AUTOMATION_LIMITS.idempotencyKeyLength,
    SAFE_REFERENCE,
    'invalid_idempotency_key',
  );
}

export function requireRequestRef(value: unknown): string {
  return boundedString(
    value,
    AUTOMATION_LIMITS.requestRefLength,
    SAFE_REFERENCE,
    'invalid_request_ref',
  );
}

export function requireLeaseOwner(value: unknown): string {
  return boundedString(
    value,
    AUTOMATION_LIMITS.leaseOwnerLength,
    SAFE_REFERENCE,
    'invalid_lease_owner',
  );
}

export function requireResultRef(value: unknown): string {
  return boundedString(
    value,
    AUTOMATION_LIMITS.resultRefLength,
    SAFE_REFERENCE,
    'invalid_result_ref',
  );
}

export function requireErrorCode(value: unknown): string {
  return boundedString(
    value,
    AUTOMATION_LIMITS.errorCodeLength,
    SAFE_CODE,
    'invalid_error_code',
  );
}

export function parseAutomationQueueMessage(
  value: unknown,
): AutomationQueueMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AutomationValidationError('invalid_queue_message');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== MESSAGE_KEYS.length
    || keys.some((key, index) => key !== MESSAGE_KEYS[index])
  ) {
    throw new AutomationValidationError('invalid_queue_message');
  }
  if (record.schema !== 'gptbot.automation.job.v1') {
    throw new AutomationValidationError('invalid_queue_message');
  }
  const message: AutomationQueueMessage = {
    schema: 'gptbot.automation.job.v1',
    job_id: boundedString(record.job_id, 120, SAFE_REFERENCE, 'invalid_queue_message'),
    job_type: requireAutomationJobType(record.job_type),
    delivery_id: boundedString(record.delivery_id, 120, SAFE_REFERENCE, 'invalid_queue_message'),
  };
  if (
    new TextEncoder().encode(JSON.stringify(message)).byteLength
    > AUTOMATION_LIMITS.queueMessageBytes
  ) {
    throw new AutomationValidationError('queue_message_too_large');
  }
  return message;
}

export function requireMaxAttempts(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10) {
    throw new AutomationValidationError('invalid_max_attempts');
  }
  return Number(value);
}
