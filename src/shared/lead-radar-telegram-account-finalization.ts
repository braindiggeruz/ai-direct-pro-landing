export const LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_SCHEMA =
  'gptbot.lead-radar.telegram-account-finalization.v1' as const;

export const LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_RETRY_SECONDS = 5;
export const LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_MAX_ATTEMPTS = 64;

const ORG_ID_PATTERN = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;
const AUTH_ID_PATTERN = /^[A-Za-z0-9:_-]{16,160}$/u;

export interface LeadRadarTelegramAccountFinalizationQueueMessage {
  schema: typeof LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_SCHEMA;
  org_id: string;
  auth_id: string;
  attempt: number;
  not_after: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseLeadRadarTelegramAccountFinalizationQueueMessage(
  value: unknown,
): LeadRadarTelegramAccountFinalizationQueueMessage | null {
  const message = record(value);
  if (!message
    || Object.keys(message).sort().join(',') !== 'attempt,auth_id,not_after,org_id,schema'
    || message.schema !== LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_SCHEMA
    || typeof message.org_id !== 'string'
    || !ORG_ID_PATTERN.test(message.org_id)
    || typeof message.auth_id !== 'string'
    || !AUTH_ID_PATTERN.test(message.auth_id)
    || typeof message.attempt !== 'number'
    || !Number.isSafeInteger(message.attempt)
    || message.attempt < 0
    || message.attempt >= LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_MAX_ATTEMPTS
    || typeof message.not_after !== 'string'
    || message.not_after.length < 20
    || message.not_after.length > 64
    || !Number.isFinite(Date.parse(message.not_after))) return null;
  return message as unknown as LeadRadarTelegramAccountFinalizationQueueMessage;
}

export function leadRadarTelegramAccountFinalizationQueueMessage(input: {
  orgId: string;
  authId: string;
  notAfter: string;
  attempt?: number;
}): LeadRadarTelegramAccountFinalizationQueueMessage {
  const candidate = {
    schema: LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_SCHEMA,
    org_id: input.orgId,
    auth_id: input.authId,
    attempt: input.attempt ?? 0,
    not_after: input.notAfter,
  };
  const parsed = parseLeadRadarTelegramAccountFinalizationQueueMessage(candidate);
  if (!parsed) throw new Error('invalid_telegram_account_finalization_message');
  return parsed;
}

export function nextLeadRadarTelegramAccountFinalizationQueueMessage(
  message: LeadRadarTelegramAccountFinalizationQueueMessage,
  nowMs = Date.now(),
): LeadRadarTelegramAccountFinalizationQueueMessage | null {
  if (Date.parse(message.not_after) <= nowMs
    || message.attempt + 1 >= LEAD_RADAR_TELEGRAM_ACCOUNT_FINALIZATION_MAX_ATTEMPTS) return null;
  return { ...message, attempt: message.attempt + 1 };
}
