import { isTelegramPeerRef } from './lead-radar-telegram-endpoint';
export interface TelegramContactTarget { kind: 'username' | 'phone' | 'business_link'; value: string }
export interface TelegramContactResolution {
  status: 'pending' | 'resolved' | 'unresolved' | 'unsupported' | 'limited' | 'failed';
  username: string | null;
  peerRef?: string;
  reason: string;
  retryAfterSeconds: number | null;
}

/** Older Bridge clients used unresolved for transport errors. These are not
 * negative account lookups: keep them retryable without changing privacy results. */
export function normalizeTelegramContactResolution(result: TelegramContactResolution): TelegramContactResolution {
  return result.status === 'unresolved' && ['lookup_unconfirmed', 'telegram_timeout', 'check_expired'].includes(result.reason)
    ? { ...result, status: 'failed' } : result;
}
export function validTelegramContactTarget(value: unknown): value is TelegramContactTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'kind,value' || typeof item.value !== 'string') return false;
  return item.kind === 'username' ? /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(item.value)
    : item.kind === 'phone' ? /^\+[1-9][0-9]{7,14}$/.test(item.value)
      : item.kind === 'business_link' && /^[A-Za-z0-9_-]{4,128}$/.test(item.value);
}
export function validTelegramContactResolution(value: unknown): value is TelegramContactResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ['reason,retryAfterSeconds,status,username','peerRef,reason,retryAfterSeconds,status,username'].includes(Object.keys(item).sort().join(','))
    && ['pending','resolved','unresolved','unsupported','limited','failed'].includes(String(item.status))
    && (item.username === null || typeof item.username === 'string' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(item.username))
    && (item.peerRef === undefined || item.status === 'resolved' && isTelegramPeerRef(item.peerRef))
    && (item.status !== 'resolved' || item.username !== null || isTelegramPeerRef(item.peerRef))
    && (item.status === 'resolved' || item.username === null)
    && typeof item.reason === 'string' && /^[a-z][a-z0-9_]{2,79}$/.test(item.reason)
    && (item.retryAfterSeconds === null || typeof item.retryAfterSeconds === 'number'
      && Number.isSafeInteger(item.retryAfterSeconds) && item.retryAfterSeconds >= 1 && item.retryAfterSeconds <= 2147483647);
}
