import type { Env } from '../../_types';
import type {
  LeadRadarApiCapabilities,
  LeadRadarLead,
  LeadRadarOverview,
  LeadRadarSearchResult,
  LeadRadarSearchSummary,
} from '../../../src/shared/lead-radar';
import { scoreLead } from './scoring';

const PERSONAL_CONTACT_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

type LeadRadarCapabilityEnv = Pick<Env,
  | 'LEAD_RADAR_ADMISSION_ENABLED'
  | 'LEAD_RADAR_PROCESSING_ENABLED'
  | 'LEAD_RADAR_CONTACT_ENABLED'
  | 'LEAD_RADAR_ALLOWED_ORGS'
>;

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
  return {
    admissionEnabled,
    processingEnabled,
    contactEnabled,
    mode: contactEnabled ? 'contact' : (admissionEnabled || processingEnabled ? 'research' : 'paused'),
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
  const decisionMakers = capabilities.contactEnabled
    ? lead.decisionMakers.filter((person) => freshPersonalTimestamp(person.verifiedAt, nowMs))
    : [];
  const personalContact = lead.telegramContact?.type === 'human';
  const keepPersonalContact = capabilities.contactEnabled
    && personalContact
    && freshPersonalTimestamp(lead.telegramContact?.verifiedAt, nowMs);
  const telegramContact = personalContact && !keepPersonalContact
    ? null
    : (lead.telegramContact ? {
        ...lead.telegramContact,
        messageable: capabilities.contactEnabled && lead.telegramContact.messageable,
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
  if (capabilities.contactEnabled) return summary;
  return {
    ...summary,
    telegramCount: 0,
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
  const leads = result.leads
    .map((lead) => redactLead(lead, capabilities, now.getTime()))
    .sort((left, right) => (
      priorityOrder[left.priority] - priorityOrder[right.priority]
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
  return {
    ...overview,
    capabilities,
    searches: overview.searches.map((search) => redactSummary(search, capabilities)),
    totals: {
      ...overview.totals,
      telegram: capabilities.contactEnabled ? overview.totals.telegram : 0,
    },
  };
}
