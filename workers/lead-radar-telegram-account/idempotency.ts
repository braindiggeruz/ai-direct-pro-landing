import type { SafeProviderEnvelope } from './protocol';

export interface EffectLedgerEntry {
  operationId: string;
  payloadDigest: string;
  response: SafeProviderEnvelope | null;
  leaseExpiresAt: string;
}

export interface RetainedEffectLedgerEntry extends EffectLedgerEntry {
  expiresAt: string;
}

export type EffectReservationDecision =
  | { kind: 'reserve' }
  | { kind: 'replay'; response: SafeProviderEnvelope }
  | { kind: 'payload_conflict' }
  | { kind: 'account_busy' };

export function decideEffectReservation(input: {
  operationId: string;
  payloadDigest: string;
  existing: EffectLedgerEntry | null;
  activeOperationId: string | null;
}): EffectReservationDecision {
  if (input.existing) {
    if (input.existing.operationId !== input.operationId
      || input.existing.payloadDigest !== input.payloadDigest) {
      return { kind: 'payload_conflict' };
    }
    return {
      kind: 'replay',
      response: input.existing.response ?? {
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'ambiguous',
      },
    };
  }
  if (input.activeOperationId && input.activeOperationId !== input.operationId) {
    return { kind: 'account_busy' };
  }
  return { kind: 'reserve' };
}

export function recoverExpiredEffect(input: {
  activeOperationId: string | null;
  activeEntry: EffectLedgerEntry | null;
  nowMs: number;
}): {
  clearActive: boolean;
  recoveredEntry: EffectLedgerEntry | null;
  corrupted: boolean;
} {
  if (!input.activeOperationId) {
    return { clearActive: false, recoveredEntry: input.activeEntry, corrupted: false };
  }
  if (!input.activeEntry || input.activeEntry.operationId !== input.activeOperationId) {
    return { clearActive: false, recoveredEntry: input.activeEntry, corrupted: true };
  }
  if (input.activeEntry.response) {
    return { clearActive: true, recoveredEntry: input.activeEntry, corrupted: false };
  }
  const leaseExpiresAt = Date.parse(input.activeEntry.leaseExpiresAt);
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt > input.nowMs) {
    return { clearActive: false, recoveredEntry: input.activeEntry, corrupted: false };
  }
  return {
    clearActive: true,
    recoveredEntry: {
      ...input.activeEntry,
      response: {
        schema: 'gptbot.lead-radar.telegram-account-service.v1',
        status: 'ambiguous',
      },
    },
    corrupted: false,
  };
}

export function expiredTerminalEffectKeys(input: {
  entries: ReadonlyArray<{ key: string; entry: RetainedEffectLedgerEntry }>;
  activeOperationId: string | null;
  nowMs: number;
  limit: number;
}): string[] {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 128) return [];
  const expired: string[] = [];
  for (const candidate of input.entries) {
    if (expired.length >= input.limit) break;
    if (!candidate.key.startsWith('effect:v1:')
      || candidate.entry.operationId === input.activeOperationId
      || candidate.entry.response === null) continue;
    const expiresAt = Date.parse(candidate.entry.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= input.nowMs) expired.push(candidate.key);
  }
  return expired;
}
