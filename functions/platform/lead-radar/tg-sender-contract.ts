import type { TelegramCampaignSender } from './telegram-campaign';

export const TG_SENDER_SCHEMA = 'gptbot.lead-radar.tg-sender.v1' as const;
export const TG_SENDER_ORIGIN = 'https://tg-sender.internal';
export const TG_SENDER_PREFIX = '/api/integrations/lead-radar/v1';
export interface TgSenderBinding {
  org_id: string;
  account_id: string;
  account_ref: string;
  sender_fingerprint: string;
}
export interface TgSenderAuthorization {
  basis: 'documented_consent' | 'inbound_request' | 'existing_relationship' | 'contractual_relationship' | 'public_business_inquiry';
  reference: string;
  expires_at: string;
  public_inquiry?: {
    policy_version: 'public-business-inquiry-v1'; source_url_digest: string; approval_id: string;
    selection_digest: string; content_digest: string; recipient_id: string; first_contact_only: true;
  };
}
export interface TgSenderEffectKey {
  schema: typeof TG_SENDER_SCHEMA;
  binding: TgSenderBinding;
  effect_id: string;
  payload_sha256: string;
}
export interface TgSenderCommand extends TgSenderEffectKey {
  recipient: string;
  text: string;
  authorization: TgSenderAuthorization;
  paid_message_policy: 'reject';
  allow_paid_floodskip: false;
  parse_mode: 'None';
}
export type TgSenderReceipt = TgSenderEffectKey & {
  state: 'accepted' | 'rejected' | 'unknown' | 'inflight' | 'cancelled' | 'not_found';
  code?: string;
  provider_message_id?: string;
  retry_after_seconds?: number;
};
export type TgSenderInput = Parameters<TelegramCampaignSender['send']>[0];
const BASES = new Set(['documented_consent', 'inbound_request', 'existing_relationship', 'contractual_relationship','public_business_inquiry']);
export function isTgSenderBinding(value: TgSenderBinding): boolean {
  return /^[A-Za-z0-9:_-]{1,80}$/u.test(value.org_id)
    && /^lrtgua_[a-f0-9]{32}$/u.test(value.account_id)
    && /^[A-Za-z0-9:_-]{16,160}$/u.test(value.account_ref)
    && /^[a-f0-9]{64}$/u.test(value.sender_fingerprint);
}
export function isTgSenderAuthorization(value: TgSenderAuthorization | null | undefined, now: number): value is TgSenderAuthorization {
  const proof = value?.public_inquiry;
  if (value?.basis === 'public_business_inquiry') {
    if (!proof || proof.policy_version !== 'public-business-inquiry-v1' || proof.first_contact_only !== true
      || !/^lrtgap_[a-f0-9]{32}$/u.test(proof.approval_id) || !/^lrtgcr_[a-f0-9]{32}$/u.test(proof.recipient_id)
      || ![proof.source_url_digest,proof.selection_digest,proof.content_digest].every(v => /^[a-f0-9]{64}$/u.test(v))) return false;
  } else if (proof) return false;
  return Boolean(value && BASES.has(value.basis) && /^[A-Za-z0-9:_-]{8,160}$/u.test(value.reference)
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value.expires_at)
    && Number.isFinite(Date.parse(value.expires_at)) && Date.parse(value.expires_at) > now);
}
export function sameTgSenderBinding(a: unknown, b: TgSenderBinding): boolean {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
  const record = a as Record<string,unknown>;
  return Object.keys(record).length === 4 && Object.entries(b).every(([key,value]) => record[key] === value);
}
/** Kept in byte-for-byte canonical order with TG Sender's commandDigest. */
export async function tgSenderCommandDigest(command: Omit<TgSenderCommand,'payload_sha256'> | TgSenderCommand): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([
    TG_SENDER_SCHEMA, command.binding.org_id, command.binding.account_id, command.binding.account_ref,
    command.binding.sender_fingerprint, command.effect_id, command.recipient, command.text,
    command.authorization.basis, command.authorization.reference, command.authorization.expires_at,
    command.paid_message_policy, command.allow_paid_floodskip, command.parse_mode,
    command.authorization.public_inquiry ? [
      command.authorization.public_inquiry.policy_version, command.authorization.public_inquiry.source_url_digest,
      command.authorization.public_inquiry.approval_id, command.authorization.public_inquiry.selection_digest,
      command.authorization.public_inquiry.content_digest, command.authorization.public_inquiry.recipient_id,
      command.authorization.public_inquiry.first_contact_only,
    ] : null,
  ]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
