import { contactCandidatesForLead } from './contact-candidates';
import { checkCorporateTelegramContact } from './contact-resolution';
import { getTelegramUserAccount, getTelegramUserAccountGatewayBinding, isTelegramCampaignDataKeyValid } from './telegram-campaign';
import { resolveTelegramContact } from './telegram-account-service';
import type { LeadRadarQueueDependencies } from './queue';

export function createContactResolutionQueueDependencies(env: {
  LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED?: string;
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY?: string;
  LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN?: string;
  LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE?: Fetcher;
}, db: D1Database): LeadRadarQueueDependencies {
  if (env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED !== 'true' || !env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE
    || !isTelegramCampaignDataKeyValid(env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY)) return {};
  return { resolveLeadContacts: async (job, lead) => {
    if (!job.companyId || lead.suppressed || lead.lifecycle === 'do_not_contact') return { pending: false };
    const candidates = contactCandidatesForLead(lead).filter((c) => c.lookupEligible)
      .sort((a,b) => Number(b.kind === 'telegram') - Number(a.kind === 'telegram')).slice(0,2);
    if (!candidates.length) return { pending: false };
    const account = await getTelegramUserAccount(db,job.orgId);
    if (!account || account.status !== 'connected') return { pending: false };
    const binding = await getTelegramUserAccountGatewayBinding({ db, orgId: job.orgId, accountId: account.id,
      dataKey: env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY! });
    if (!binding) return { pending: false };
    for (const candidate of candidates) {
      const result = await checkCorporateTelegramContact({ db, orgId: job.orgId, searchId: job.searchId,
        companyId: job.companyId, candidateKey: candidate.key, accountId: account.id,
        resolve: (target, operationId) => resolveTelegramContact({ service: env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE,
          internalServiceToken: env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN, orgId: job.orgId,
          gatewayAccountRef: binding.gatewayAccountRef, target, operationId }),
      });
      if (result.status === 'pending') return { pending: true };
      // Concurrent companies share one Bridge rate gate. A short local cooldown
      // is a continuation, not a terminal negative contact result.
      if (result.status === 'limited') return { pending: (result.retryAfterSeconds ?? 60) <= 120 };
      if (['resolved','failed'].includes(result.status)) return { pending: false };
    }
    return { pending: false };
  } };
}
