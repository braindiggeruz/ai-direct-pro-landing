import { checkCorporateTelegramContact, nextTelegramContactCandidate } from './contact-resolution';
import { getTelegramUserAccount, getTelegramUserAccountGatewayBinding, isTelegramCampaignDataKeyValid } from './telegram-campaign';
import { resolveTelegramContact } from './telegram-account-service';
import type { LeadRadarQueueDependencies } from './queue';
import type { Env } from '../../_types';
import { tgSenderConfiguration, tgSenderMode } from './outreach-transport';
import { resolveOutreachContact } from './outreach-account';

export function createContactResolutionQueueDependencies(env: Partial<Env>, db: D1Database): LeadRadarQueueDependencies {
  if (env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED !== 'true' || (!tgSenderMode(env) && !env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)
    || !isTelegramCampaignDataKeyValid(env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY)) return {};
  return { resolveLeadContacts: async (job, lead) => {
    if (!job.companyId || lead.suppressed || lead.lifecycle === 'do_not_contact') return { pending: false };
    const account = await getTelegramUserAccount(db,job.orgId);
    if (!account || account.status !== 'connected') return { pending: true, reason:'waiting_for_account', retryAfterSeconds:60 };
    const next=await nextTelegramContactCandidate({db,orgId:job.orgId,companyId:job.companyId,accountId:account.id,now:new Date().toISOString()});
    if (!next.candidateKey) return next;
    const binding = await getTelegramUserAccountGatewayBinding({ db, orgId: job.orgId, accountId: account.id,
      dataKey: env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY! });
    if (!binding) return { pending: true, reason:'waiting_for_binding', retryAfterSeconds:60 };
    if (tgSenderMode(env)) {
      const configuration = tgSenderConfiguration(env, job.orgId);
      if (!configuration || configuration.binding.account_id !== account.id || configuration.binding.account_ref !== binding.gatewayAccountRef) {
        return {pending: true, reason: 'tg_sender_binding_mismatch', retryAfterSeconds: 300};
      }
    }
      const result = await checkCorporateTelegramContact({ db, orgId: job.orgId, searchId: job.searchId,
        companyId: job.companyId, candidateKey: next.candidateKey, accountId: account.id,
        resolve: (target, operationId) => tgSenderMode(env) ? resolveOutreachContact(env as Env, job.orgId, target) : resolveTelegramContact({ service: env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN, orgId: job.orgId,
          gatewayAccountRef: binding.gatewayAccountRef, target, operationId }),
      });
      if (result.status === 'pending') return { pending: true, reason:'waiting_for_bridge' };
      // Concurrent companies share one Bridge rate gate. A short local cooldown
      // is a continuation, not a terminal negative contact result.
      if (result.status === 'limited' || ['daily_check_limit','contact_schema_unavailable','bridge_offline','account_not_connected'].includes(result.reason)) return { pending: true, reason:result.reason, retryAfterSeconds:result.retryAfterSeconds ?? 60 };
      if (['contact_not_found','corporate_source_required'].includes(result.reason)) return {pending:false};
      if (result.status==='resolved' && result.reason!=='username_exists_ownership_unconfirmed') return {pending:false};
      // Next delivery skips fresh negative/type-only results and advances, even
      // when the successful corporate endpoint is candidate 3, 4, or later.
      return {pending:true};
  } };
}
