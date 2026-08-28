import type { LeadRadarTelegramContact } from './lead-radar';

/** Opaque, account-bound handle. Never a public username, phone or Telegram id. */
export const TELEGRAM_PEER_REF = /^lrpeer:[a-f0-9]{32}$/u;
export function isTelegramPeerRef(value: unknown): value is string {
  return typeof value === 'string' && TELEGRAM_PEER_REF.test(value);
}
export function isCampaignEndpoint(value: unknown): value is string {
  return typeof value === 'string' && (/^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(value) || isTelegramPeerRef(value));
}
/** This extracts identity only. Server source/account/TTL/authorization checks are mandatory. */
export function telegramContactEndpoint(contact: LeadRadarTelegramContact | null): string | null {
  if (!contact || contact.type !== 'business') return null;
  if (contact.reason === 'bridge_resolved_corporate' && isTelegramPeerRef(contact.peerRef)) return contact.peerRef;
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(contact.username) ? contact.username.toLowerCase() : null;
}
