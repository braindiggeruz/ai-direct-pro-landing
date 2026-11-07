import type { Env } from '../../_types';
import type { TelegramContactResolution, TelegramContactTarget } from '../../../src/shared/lead-radar-contact-resolution';
import {
  completeTelegramUserAccountConnection, createTelegramUserAccountPending,
  getTelegramCampaignDataKeyIdentityState, getTelegramUserAccount, getTelegramUserAccountGatewayBinding,
  getTelegramUserAccountByAuthRequest,
  stageTelegramUserAccountConnection, type TelegramAccountReadModel,
} from './telegram-campaign';
import { configuredTgSender, tgSenderConfiguration } from './outreach-transport';
import { OutreachAccountStore } from './outreach-account-store';
import { telegramIdentifierDigest } from './telegram-business';
import { LeadRadarTelegramCampaignStore } from './telegram-campaign-store';

export class OutreachAccountError extends Error {
  constructor(public readonly code: 'tg_sender_not_configured' | 'tg_sender_unavailable' | 'tg_sender_binding_mismatch'
    | 'campaign_data_key_mismatch' | 'legacy_binding_required' | 'tg_sender_active_campaign') { super(code); }
}

export async function probeOutreachAccount(input: {env: Env; db: D1Database; orgId: string; dataKey: string; account: TelegramAccountReadModel}) {
  const config = tgSenderConfiguration(input.env, input.orgId);
  const client = configuredTgSender(input.env, input.orgId);
  if (!config || !client) throw new OutreachAccountError('tg_sender_not_configured');
  if (input.account.id !== config.binding.account_id) throw new OutreachAccountError('tg_sender_binding_mismatch');
  const pinned = await getTelegramUserAccountByAuthRequest({...input, authRequestReference: `tgs-${config.binding.sender_fingerprint}`});
  if (pinned?.id !== input.account.id) throw new OutreachAccountError('tg_sender_binding_mismatch');
  const binding = await getTelegramUserAccountGatewayBinding({...input, accountId: input.account.id});
  if (input.account.status !== 'connected' || binding?.gatewayAccountRef !== config.binding.account_ref) {
    throw new OutreachAccountError('tg_sender_binding_mismatch');
  }
  const status = await client.readiness();
  if (!status.ready || !status.providerVerifiedAt) throw new OutreachAccountError('tg_sender_unavailable');
  return status;
}

/** Connects only the exact server-pinned session. Never silently replaces a legacy account. */
export async function connectOutreachAccount(input: {env: Env; db: D1Database; orgId: string; dataKey: string; idempotencyKey: string; replaceAccountId?: string}) {
  const config = tgSenderConfiguration(input.env, input.orgId);
  const client = configuredTgSender(input.env, input.orgId);
  if (!config || !client) throw new OutreachAccountError('tg_sender_not_configured');
  const identity = await getTelegramCampaignDataKeyIdentityState(input);
  if (identity === 'mismatch') throw new OutreachAccountError('campaign_data_key_mismatch');
  if (identity === 'legacy_unbound') throw new OutreachAccountError('legacy_binding_required');
  const status = await client.probeSession();
  if (!status.ready || !status.providerVerifiedAt || Date.now() - Date.parse(status.providerVerifiedAt) > 60_000) throw new OutreachAccountError('tg_sender_unavailable');
  let account = await getTelegramUserAccount(input.db, input.orgId);
  if (input.replaceAccountId !== undefined && !/^lrtgua_[a-f0-9]{32}$/u.test(input.replaceAccountId)) {
    throw new OutreachAccountError('tg_sender_binding_mismatch');
  }
  if (input.replaceAccountId !== undefined) {
    const cutovers = new OutreachAccountStore(input.db);
    const requestDigest = await telegramIdentifierDigest(input.dataKey, 'outreach-account-cutover',
      JSON.stringify([input.orgId, input.replaceAccountId, config.binding.account_id, input.idempotencyKey]));
    if (account && account.id !== config.binding.account_id && input.replaceAccountId === account.id) {
      if (!await cutovers.retireUnusedAccount(input.orgId, account.id, account.stateVersion,
        config.binding.account_id, requestDigest, new Date().toISOString())) {
        throw new OutreachAccountError('tg_sender_active_campaign');
      }
      account = null;
    } else if (!await cutovers.hasCutover(input.orgId, input.replaceAccountId, config.binding.account_id, requestDigest)) {
      throw new OutreachAccountError('tg_sender_binding_mismatch');
    }
  }
  if (account && account.id !== config.binding.account_id) throw new OutreachAccountError('tg_sender_binding_mismatch');
  if (account && (await getTelegramUserAccountByAuthRequest({...input,
    authRequestReference: `tgs-${config.binding.sender_fingerprint}`}))?.id !== account.id) {
    throw new OutreachAccountError('tg_sender_binding_mismatch');
  }
  if (!account) {
    account = (await createTelegramUserAccountPending({...input,
      requestedAccountId: config.binding.account_id,
      authRequestReference: `tgs-${config.binding.sender_fingerprint}`,
      maskedLabel: status.maskedLabel ?? 'TG Sender',
    })).account;
  }
  if (account.status === 'connected') {
    await probeOutreachAccount({...input, account});
    return account;
  }
  if (account.status !== 'pending') throw new OutreachAccountError('tg_sender_binding_mismatch');
  const staged = await new LeadRadarTelegramCampaignStore(input.db).getPendingAccountFinalization(input.orgId, account.id);
  if (staged && staged.gateway_account_ref !== config.binding.account_ref) {
    throw new OutreachAccountError('tg_sender_binding_mismatch');
  }
  const providerConnectedAt = staged?.provider_connected_at ?? status.providerVerifiedAt;
  const maskedLabel = staged?.masked_label ?? status.maskedLabel ?? 'TG Sender';
  account = await stageTelegramUserAccountConnection({...input, accountId: account.id,
    gatewayAccountRef: config.binding.account_ref, expectedVersion: account.stateVersion,
    providerConnectedAt, maskedLabel,
  });
  // A second fresh attestation closes the cross-system finalize window.
  const finalizedStatus = await client.readiness();
  if (!finalizedStatus.ready || !finalizedStatus.providerVerifiedAt) throw new OutreachAccountError('tg_sender_unavailable');
  return completeTelegramUserAccountConnection({...input, accountId: account.id,
    gatewayAccountRef: config.binding.account_ref, expectedVersion: account.stateVersion,
    maskedLabel,
  });
}

export async function resolveOutreachContact(env: Env, orgId: string, target: TelegramContactTarget): Promise<TelegramContactResolution> {
  if (target.kind !== 'username') return {status: 'unsupported', username: null, reason: 'public_username_required', retryAfterSeconds: null};
  const client = configuredTgSender(env, orgId);
  if (!client) return {status: 'failed', username: null, reason: 'tg_sender_not_configured', retryAfterSeconds: null};
  const result = await client.resolveContact(target.value);
  if (result.status === 'resolved' && result.kind === 'user' && result.peerRef) {
    return {status: 'resolved', username: result.username, peerRef: result.peerRef, reason: 'telegram_user_resolved', retryAfterSeconds: null};
  }
  return {status: result.retryAfterSeconds ? 'limited' : result.status === 'unresolved' ? 'unresolved' : 'failed',
    username: null, reason: result.reason ?? 'telegram_lookup_unavailable', retryAfterSeconds: result.retryAfterSeconds};
}
