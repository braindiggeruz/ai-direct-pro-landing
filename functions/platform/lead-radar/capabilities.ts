import type { Env } from '../../_types';
import type {
  LeadRadarApiCapabilities,
  LeadRadarLead,
  LeadRadarOverview,
  LeadRadarSearchResult,
  LeadRadarSearchSummary,
} from '../../../src/shared/lead-radar';
import { resolveLeadRadarTelegramCampaignPolicy } from '../../../src/shared/lead-radar-telegram-campaign-policy';
import { scoreLead } from './scoring';
import { hasPrivateTelegramAccountService } from './telegram-account-service';
import { isTelegramCampaignDataKeyValid } from './telegram-campaign';

const PERSONAL_CONTACT_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

type LeadRadarCapabilityEnv = Pick<Env,
  | 'LEAD_RADAR_ADMISSION_ENABLED'
  | 'LEAD_RADAR_PROCESSING_ENABLED'
  | 'LEAD_RADAR_CONTACT_ENABLED'
  | 'LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED'
  | 'LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED'
  | 'LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED'
  | 'LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED'
  | 'LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY'
  | 'LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE'
  | 'LEAD_RADAR_TELEGRAM_TRANSPORT_MODE'
  | 'LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN'
  | 'LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT'
  | 'LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS'
  | 'LEAD_RADAR_ALLOWED_ORGS'
>;

// 32 random bytes encoded as unpadded base64url. Keep this byte-for-byte
// aligned with the private gateway instead of accepting a locally "ready"
// value the gateway will always reject.
const INTERNAL_SERVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function enabled(value: string | undefined): boolean {
  return value === 'true';
}

function allowedOrganizations(value: string | undefined): Set<string> {
  return new Set((value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/.test(item)));
}

export function isLeadRadarOrganizationAllowed(env: LeadRadarCapabilityEnv, orgId: string): boolean {
  return allowedOrganizations(env.LEAD_RADAR_ALLOWED_ORGS).has(orgId);
}

/**
 * Resolve the public capability contract. Every switch is exact-true and every
 * mutating capability is tenant allowlisted. This deliberately makes an empty
 * allowlist a hard pause even if an operator accidentally toggles a boolean.
 */
export function resolveLeadRadarCapabilities(
  env: LeadRadarCapabilityEnv,
  orgId: string,
): LeadRadarApiCapabilities {
  const tenantAllowed = isLeadRadarOrganizationAllowed(env, orgId);
  const admissionEnabled = tenantAllowed && enabled(env.LEAD_RADAR_ADMISSION_ENABLED);
  const processingEnabled = tenantAllowed && enabled(env.LEAD_RADAR_PROCESSING_ENABLED);
  const contactEnabled = tenantAllowed && enabled(env.LEAD_RADAR_CONTACT_ENABLED);
  const telegramDiscoveryEnabled = tenantAllowed
    && enabled(env.LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED)
    && (admissionEnabled || processingEnabled);
  // Campaigns have their own legal/transport gate. They are restricted to
  // verified corporate endpoints and must not silently unlock personal data or
  // the legacy per-lead Business-bot send path.
  const telegramAccountRequested = tenantAllowed
    && enabled(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED);
  const telegramAccountReadinessBlockers = [
    ...(!tenantAllowed ? ['tenant_not_allowed' as const] : []),
    ...(tenantAllowed && !enabled(env.LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED)
      ? ['feature_disabled' as const]
      : []),
    ...(tenantAllowed
      && !isTelegramCampaignDataKeyValid(env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY)
      ? ['campaign_data_key_missing' as const]
      : []),
    ...(tenantAllowed
      && !hasPrivateTelegramAccountService(env.LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE)
      ? ['gateway_binding_missing' as const]
      : []),
    ...(tenantAllowed && env.LEAD_RADAR_TELEGRAM_TRANSPORT_MODE !== 'local_bridge'
      ? ['bridge_transport_mode_invalid' as const]
      : []),
    ...(tenantAllowed
      && !INTERNAL_SERVICE_TOKEN_PATTERN.test(
        env.LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN ?? '',
      )
      ? ['gateway_internal_token_missing' as const]
      : []),
  ];
  const telegramAccountEnabled = telegramAccountRequested
    && telegramAccountReadinessBlockers.length === 0;
  const campaignOutreachEnabled = telegramAccountEnabled
    && enabled(env.LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED);
  const campaignPolicy = resolveLeadRadarTelegramCampaignPolicy({
    dailyLimit: env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT,
    minimumIntervalSeconds: env.LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS,
  });
  const campaignAutoSendEnabled = campaignOutreachEnabled
    && enabled(env.LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED)
    && campaignPolicy.valid;
  return {
    admissionEnabled,
    processingEnabled,
    contactEnabled,
    telegramDiscoveryEnabled,
    personalContactsEnabled: contactEnabled,
    individualOutreachEnabled: contactEnabled,
    telegramAccountEnabled,
    telegramAccountReadiness: {
      status: telegramAccountReadinessBlockers.length > 0 ? 'blocked' : 'probe_required',
      blockers: telegramAccountReadinessBlockers,
    },
    campaignOutreachEnabled,
    campaignAutoSendEnabled,
    telegramCampaignDailyLimit: campaignPolicy.dailyLimit,
    telegramCampaignMinimumIntervalSeconds: campaignPolicy.minimumIntervalSeconds,
    mode: contactEnabled || campaignOutreachEnabled
      ? 'contact'
      : (admissionEnabled || processingEnabled ? 'research' : 'paused'),
  };
}

export function parseLeadRadarRetentionDays(value: string | undefined): number {
  const parsed = Number(value ?? '30');
  if (!Number.isInteger(parsed)) return 30;
  return Math.max(1, Math.min(30, parsed));
}

export function parseLeadRadarDispatchLimit(value: string | undefined): number {
  const parsed = Number(value ?? '5');
  if (!Number.isInteger(parsed)) return 5;
  // Five reservations leave enough of the Workers Free 50-query budget for
  // stale-dispatch and expired-lease recovery in the same cron invocation.
  return Math.max(1, Math.min(5, parsed));
}

function freshPersonalTimestamp(value: string | null | undefined, nowMs: number): boolean {
  if (!value) return false;
  const observedAt = Date.parse(value);
  return Number.isFinite(observedAt)
    && observedAt >= nowMs - PERSONAL_CONTACT_TTL_MS
    && observedAt <= nowMs + MAX_FUTURE_CLOCK_SKEW_MS;
}

function personalEvidencePath(fieldPath: string): boolean {
  return fieldPath.startsWith('decision_makers.') || fieldPath.startsWith('web.telegram.human');
}

function redactLead(
  lead: LeadRadarLead,
  capabilities: LeadRadarApiCapabilities,
  nowMs: number,
): LeadRadarLead {
  const personalContactsEnabled = capabilities.personalContactsEnabled ?? capabilities.contactEnabled;
  const individualOutreachEnabled = capabilities.individualOutreachEnabled ?? capabilities.contactEnabled;
  const decisionMakers = personalContactsEnabled
    ? lead.decisionMakers.filter((person) => freshPersonalTimestamp(person.verifiedAt, nowMs))
    : [];
  const personalContact = lead.telegramContact?.type === 'human';
  const keepPersonalContact = personalContactsEnabled
    && personalContact
    && freshPersonalTimestamp(lead.telegramContact?.verifiedAt, nowMs);
  const telegramContact = personalContact && !keepPersonalContact
    ? null
    : (lead.telegramContact ? {
        ...lead.telegramContact,
        messageable: individualOutreachEnabled && lead.telegramContact.messageable,
      } : null);
  const personalEvidenceIds = new Set([
    ...(telegramContact?.type === 'human' ? telegramContact.evidenceIds : []),
    ...decisionMakers.flatMap((person) => person.evidenceIds),
  ]);
  const evidence = lead.evidence.filter((item) => (
    !personalEvidencePath(item.fieldPath) || personalEvidenceIds.has(item.id)
  ));
  const telegramUrl = personalContact && !keepPersonalContact ? null : lead.telegramUrl;
  const scored = scoreLead({
    category: lead.category,
    website: lead.website,
    phone: lead.phone,
    genericEmail: lead.genericEmail,
    telegramUrl,
    telegramContact,
    decisionMakers,
    evidence,
    signals: lead.signals,
  });
  return {
    ...lead,
    contactCandidates: lead.contactCandidates?.filter((candidate) => candidate.ownership !== 'personal'
      && candidate.evidenceIds.every((id) => evidence.some((item) => item.id === id))),
    telegramUrl,
    telegramContact,
    decisionMakers,
    evidence,
    score: scored.score,
    confidence: scored.confidence,
    priority: scored.priority,
    scoreComponents: scored.components,
  };
}

function redactSummary(
  summary: LeadRadarSearchSummary,
  capabilities: LeadRadarApiCapabilities,
): LeadRadarSearchSummary {
  const personalContactsEnabled = capabilities.personalContactsEnabled ?? capabilities.contactEnabled;
  if (personalContactsEnabled) return summary;
  return {
    ...summary,
    telegramCount: summary.funnel.companyTelegramCount,
    funnel: {
      ...summary.funnel,
      decisionMakerCount: 0,
      personalTelegramCount: 0,
    },
  };
}

export function presentLeadRadarSearchResult(
  result: LeadRadarSearchResult,
  capabilities: LeadRadarApiCapabilities,
  now = new Date(),
): LeadRadarSearchResult {
  const priorityOrder = { P1: 1, P2: 2, P3: 3 } as const;
  const prioritizeCorporateTelegram = capabilities.telegramDiscoveryEnabled === true
    && result.search.input.telegramRequired;
  const leads = result.leads
    .map((lead) => redactLead(lead, capabilities, now.getTime()))
    .sort((left, right) => (
      (prioritizeCorporateTelegram
        ? Number(right.telegramContact?.type === 'business') - Number(left.telegramContact?.type === 'business')
        : 0)
      || priorityOrder[left.priority] - priorityOrder[right.priority]
      || right.score - left.score
      || left.name.localeCompare(right.name, 'ru')
    ));
  return {
    ...result,
    capabilities,
    search: redactSummary(result.search, capabilities),
    leads,
  };
}

export function presentLeadRadarOverview(
  overview: LeadRadarOverview,
  capabilities: LeadRadarApiCapabilities,
): LeadRadarOverview {
  const personalContactsEnabled = capabilities.personalContactsEnabled ?? capabilities.contactEnabled;
  const companyTelegramTotal = overview.searches.reduce(
    (total, search) => total + search.funnel.companyTelegramCount,
    0,
  );
  return {
    ...overview,
    capabilities,
    searches: overview.searches.map((search) => redactSummary(search, capabilities)),
    totals: {
      ...overview.totals,
      telegram: personalContactsEnabled ? overview.totals.telegram : companyTelegramTotal,
    },
  };
}
