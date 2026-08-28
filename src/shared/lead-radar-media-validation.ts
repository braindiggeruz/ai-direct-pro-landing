/** Closed, browser-safe state. It contains neither R2 addresses nor Bridge credentials. */
export type LeadRadarMediaValidation =
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'pending'; reason: 'media_validation_pending' | 'bridge_offline'; retryAfterSeconds: number };

export function isLeadRadarMediaValidation(value: unknown): value is LeadRadarMediaValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.status === 'valid' || row.status === 'invalid') return Object.keys(row).length === 1;
  return row.status === 'pending' && Object.keys(row).length === 3
    && (row.reason === 'media_validation_pending' || row.reason === 'bridge_offline')
    && typeof row.retryAfterSeconds === 'number' && Number.isInteger(row.retryAfterSeconds)
    && row.retryAfterSeconds >= 1 && row.retryAfterSeconds <= 30;
}
