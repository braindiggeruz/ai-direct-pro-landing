import type { LeadRadarEvidence, LeadRadarLead } from '../../../src/shared/lead-radar';
import { assessLeadRadarPhone, extractLeadRadarPhones, parseLeadRadarTelegramLocator, type LeadRadarContactCandidate, type LeadRadarPhoneAssessment } from '../../../src/shared/lead-radar-contacts';

type ContactLead = Pick<LeadRadarLead, 'phone' | 'country' | 'evidence' | 'telegramContact' | 'suppressed'>;

function sameOrigin(a: string, b: string): boolean {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}

function firstParty(evidence: LeadRadarEvidence, all: LeadRadarEvidence[]): boolean {
  return evidence.sourceType === 'company_website'
    && evidence.classification !== 'model_inference' && evidence.confidence >= 0.8
    && all.some((binding) => ['web.company_binding', 'web.website'].includes(binding.fieldPath)
      && binding.sourceType === 'company_website' && binding.classification === 'fact'
      && binding.confidence >= 0.8 && sameOrigin(evidence.sourceUrl, binding.sourceUrl));
}

/** A derived read model: ordinary phone numbers never become sendable Telegram endpoints. */
export function contactCandidatesForLead(lead: ContactLead): LeadRadarContactCandidate[] {
  if (lead.suppressed) return [];
  const candidates = new Map<string, LeadRadarContactCandidate>();
  const addPhone = (phone: LeadRadarPhoneAssessment, evidence?: LeadRadarEvidence) => {
    if (!phone.e164) return;
    const ownership = evidence && firstParty(evidence, lead.evidence) ? 'company' : 'unconfirmed';
    const key = `phone:${phone.e164}`;
    const existing = candidates.get(key);
    if (existing?.ownership === 'company' && ownership !== 'company') return;
    candidates.set(key, {
      key, kind: 'phone', value: phone.e164, phoneType: phone.type, ownership,
      lookupEligible: ownership === 'company' && phone.mobileLookupCandidate,
      reason: !phone.mobileLookupCandidate ? phone.reason : ownership === 'company' ? 'mobile_unverified' : 'ownership_unconfirmed',
      sourceUrl: evidence?.sourceUrl ?? null,
      evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), ...(evidence ? [evidence.id] : [])])],
      observedAt: evidence?.observedAt ?? null,
    });
  };
  if (lead.phone) for (const phone of extractLeadRadarPhones(lead.phone, lead.country)) addPhone(phone);
  for (const evidence of lead.evidence) {
    if (evidence.fieldPath === 'company_contacts.phone') {
      for (const phone of extractLeadRadarPhones(evidence.value, lead.country)) addPhone(phone, evidence);
    }
    if (!evidence.fieldPath.startsWith('web.telegram.')) continue;
    const kind = evidence.fieldPath.split('.')[2];
    const company = kind === 'business' && firstParty(evidence, lead.evidence);
    const locator = parseLeadRadarTelegramLocator(evidence.value);
    if (!locator) continue;
    const value = locator.url;
    const key = `telegram:${locator.kind === 'username' ? value.toLowerCase() : value}`;
    const existing = candidates.get(key);
    if (existing?.ownership === 'company' && !company) continue;
    candidates.set(key, {
      key, kind: 'telegram', value, phoneType: null,
      ownership: company ? 'company' : kind === 'human' ? 'personal' : 'unconfirmed',
      lookupEligible: company && (locator.kind !== 'phone' || assessLeadRadarPhone(locator.value).mobileLookupCandidate)
        || kind === 'unknown' && locator.kind === 'username' && evidence.confidence >= 0.4,
      reason: company ? 'telegram_unverified' : ['bot', 'channel', 'group', 'human'].includes(kind) ? 'unsupported_telegram' : 'ownership_unconfirmed',
      sourceUrl: evidence.sourceUrl, evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), evidence.id])], observedAt: evidence.observedAt,
    });
  }
  return [...candidates.values()].slice(0, 40);
}
