import type { LeadRadarLead } from './lead-radar';
import { assessLeadRadarPhone, extractLeadRadarPhones, parseLeadRadarTelegramLocator } from './lead-radar-contacts';
import { isTelegramPeerRef } from './lead-radar-telegram-endpoint';

/** Selection is research intent, NEVER an authorization or a sendable endpoint. */
export interface RecipientContactChoices {
  mobilePhones: string[];
  usernames: string[];
  keys: string[];
  selectable: boolean;
}
export type RecipientContactInput = Pick<LeadRadarLead, 'phone' | 'country' | 'telegramContact' | 'telegramUrl'>
  & Partial<Pick<LeadRadarLead, 'suppressed' | 'lifecycle' | 'contactCandidates' | 'evidence' | 'contactEnrichment'>>;

export function recipientContactChoices(lead: RecipientContactInput): RecipientContactChoices {
  const phones = new Set<string>(), usernames = new Set<string>();
  if (lead.suppressed || lead.lifecycle === 'do_not_contact') return { mobilePhones: [], usernames: [], keys: [], selectable: false };
  const addPhone = (value: string) => {
    for (const phone of extractLeadRadarPhones(value, lead.country)) {
      if (phone.mobileLookupCandidate && phone.e164) phones.add(phone.e164);
    }
  };
  const addTelegram = (value: string, knownType?: string, reason?: string) => {
    if (['bot', 'group', 'channel', 'human'].includes(knownType ?? '') || reason === 'bridge_not_regular_user') return;
    const locator = parseLeadRadarTelegramLocator(value);
    if (locator?.kind === 'phone') addPhone(locator.value);
    if (locator?.kind === 'username' && (!locator.value.toLowerCase().endsWith('bot') || reason === 'bridge_resolved_corporate')) usernames.add(locator.value.toLowerCase());
  };
  if (lead.phone) addPhone(lead.phone);
  const contact = lead.telegramContact;
  if (contact?.username) addTelegram(`@${contact.username}`, contact.type, contact.reason);
  if (lead.telegramUrl) addTelegram(lead.telegramUrl, contact?.type, contact?.reason);
  for (const evidence of lead.evidence ?? []) {
    if (evidence.fieldPath === 'company_contacts.phone') addPhone(evidence.value);
    if (evidence.fieldPath.startsWith('web.telegram.')) addTelegram(evidence.value, evidence.fieldPath.split('.')[2], contact?.reason);
  }
  const candidates = [...(lead.contactCandidates ?? []), ...(lead.contactEnrichment?.sources ?? []).flatMap((source) => source.candidates)];
  for (const candidate of candidates) {
    if (candidate.ownership === 'personal' || candidate.reason === 'extension') continue;
    if (candidate.kind === 'phone' && assessLeadRadarPhone(candidate.value, lead.country).mobileLookupCandidate) addPhone(candidate.value);
    if (candidate.kind === 'telegram' && candidate.reason !== 'unsupported_telegram') addTelegram(candidate.value, undefined, contact?.reason);
  }
  const mobilePhones = [...phones].sort(), handles = [...usernames].sort();
  const peer = contact?.type==='business' && contact.reason==='bridge_resolved_corporate' && isTelegramPeerRef(contact.peerRef) ? contact.peerRef : null;
  return { mobilePhones, usernames: handles, keys: [...(peer ? [peer] : []), ...handles.map((name) => `username:${name}`), ...mobilePhones.map((phone) => `phone:${phone}`)], selectable: Boolean(peer) || mobilePhones.length > 0 || handles.length > 0 };
}

export function mobileOrUsernameLeadIds(leads: readonly LeadRadarLead[]): string[] {
  return [...new Set(leads.filter((lead) => recipientContactChoices(lead).selectable).map((lead) => lead.id))];
}

export function recipientContactSummary(lead: RecipientContactInput): string {
  const contacts = recipientContactChoices(lead);
  return [...contacts.usernames.map((name) => `@${name}`), ...contacts.mobilePhones].join(' · ')
    || (contacts.keys.some(isTelegramPeerRef) ? 'Telegram без публичного username' : '');
}
