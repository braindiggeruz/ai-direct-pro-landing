import type { LeadRadarEvidence, LeadRadarLead } from './lead-radar';
import { assessLeadRadarPhone, extractLeadRadarPhones, parseLeadRadarTelegramLocator, type LeadRadarPhoneAssessment } from './lead-radar-contacts';

/**
 * Outreach export read model (owner audit 22.11.2026).
 *
 * One function decides what reaches the CSV/vCard file, what the admin shows
 * as "contacts in the file" and why everything else was left out. It never
 * marks anything as contacted, never sends, and never widens DNC rules: a
 * suppressed or do-not-contact lead yields no contact at all.
 *
 * Telegram handles are kept only when nothing says they are a bot, channel,
 * group, personal account, a third party's handle (web-studio footer) or a
 * dead username. Phones are split into mobile (Telegram/WhatsApp-capable) and
 * landline (calls only); placeholder, foreign and call-centre numbers shared by
 * several businesses are excluded with a reason instead of silently dropped.
 */

export type TelegramHandleKind = 'user' | 'bot' | 'channel' | 'group' | 'not_found';

/** Verdicts from the public t.me card check or a TG Sender lookup, by lowercase username. */
export type TelegramHandleVerdicts = ReadonlyMap<string, TelegramHandleKind>;

export const EXPORT_PHONE_EXCLUSIONS = ['invalid', 'extension', 'personal', 'placeholder', 'foreign', 'shared'] as const;
export type ExportPhoneExclusion = (typeof EXPORT_PHONE_EXCLUSIONS)[number];
export const EXPORT_TELEGRAM_EXCLUSIONS = ['bot', 'channel', 'group', 'personal', 'not_found', 'vendor', 'low_confidence', 'shared', 'invalid'] as const;
export type ExportTelegramExclusion = (typeof EXPORT_TELEGRAM_EXCLUSIONS)[number];
export const EXPORT_LEAD_EXCLUSIONS = ['suppressed', 'no_contact', 'landline_only', 'duplicate'] as const;
export type ExportLeadExclusion = (typeof EXPORT_LEAD_EXCLUSIONS)[number];

export interface ExportPhone {
  e164: string;
  type: LeadRadarPhoneAssessment['type'];
  ownership: 'company' | 'unconfirmed';
  source: ExportSource;
  sourceUrl: string | null;
  observedAt: string | null;
}

export interface ExportTelegram {
  username: string;
  type: 'business' | 'user' | 'unknown';
  verified: boolean;
  source: ExportSource;
  sourceUrl: string | null;
  observedAt: string | null;
}

export type ExportSource = 'company_website' | 'openstreetmap' | 'catalog' | 'telegram_check' | 'unknown';

export interface LeadExportContacts {
  mobiles: ExportPhone[];
  landlines: ExportPhone[];
  telegrams: ExportTelegram[];
  phoneExclusions: Partial<Record<ExportPhoneExclusion, number>>;
  telegramExclusions: Partial<Record<ExportTelegramExclusion, number>>;
}

export interface ExportRowV2 {
  company: string;
  niche: string;
  city: string;
  phoneMobile1: string | null;
  phoneMobile2: string | null;
  phoneLandline: string | null;
  telegramUsername: string | null;
  telegramUrl: string | null;
  telegramType: 'business' | 'user' | 'unknown' | null;
  contactStatus: 'verified' | 'unverified';
  source: ExportSource;
  sourceUrl: string | null;
  sourceDate: string | null;
  stale: boolean;
  website: string | null;
  address: string | null;
  priority: string;
  score: number;
}

export interface ExportSummary {
  leads: number;
  rows: number;
  withMobile: number;
  withLandline: number;
  withTelegram: number;
  withVerifiedTelegram: number;
  /** Rows whose Telegram handle is still of unknown type (not yet checked). */
  unclassifiedTelegram: number;
  excludedLeads: Partial<Record<ExportLeadExclusion, number>>;
  excludedPhones: Partial<Record<ExportPhoneExclusion, number>>;
  excludedTelegram: Partial<Record<ExportTelegramExclusion, number>>;
}

/** What the export route sends in `X-Export-Summary`. */
export interface ExportSummaryWire extends ExportSummary {
  /** Public t.me pages read during this export (free check, bounded). */
  publicChecks: number;
}

export interface ExportOptions {
  niche?: string;
  /** Include landline-only businesses as rows (for calls). Default true. */
  includeLandlineOnly?: boolean;
  verdicts?: TelegramHandleVerdicts;
  /** Freshness boundary for the `stale` flag; default two years. */
  staleAfterDays?: number;
  now?: Date;
}

const COUNTRY_CALLING_CODE: Record<string, string> = {
  UZ: '+998', KZ: '+7', RU: '+7', KG: '+996', TJ: '+992', TM: '+993', AZ: '+994', TR: '+90', AE: '+971',
};

const SOURCE_RANK: Record<ExportSource, number> = {
  telegram_check: 5, company_website: 4, openstreetmap: 3, catalog: 2, unknown: 1,
};

const SHARED_THRESHOLD = 3;

function bump<K extends string>(counts: Partial<Record<K, number>>, key: K, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

function sourceOf(evidence: Pick<LeadRadarEvidence, 'sourceType'> | null | undefined, sourceUrl?: string | null): ExportSource {
  if (evidence?.sourceType === 'company_website') return 'company_website';
  if (evidence?.sourceType === 'openstreetmap') return 'openstreetmap';
  if (evidence?.sourceType === 'official_open_data') return 'catalog';
  if (sourceUrl && /openstreetmap\.org\//.test(sourceUrl)) return 'openstreetmap';
  if (sourceUrl) return 'catalog';
  return 'unknown';
}

/** A national number made of one repeated digit run is a form placeholder, not a business line. */
export function isPlaceholderPhone(e164: string): boolean {
  const digits = e164.replace(/\D/g, '');
  const national = digits.length > 9 ? digits.slice(-9) : digits;
  return /(\d)\1{5,}/.test(national) || /^(\d{2})\1{3,}/.test(national.slice(-8));
}

export function isForeignPhone(e164: string, country: string): boolean {
  const code = COUNTRY_CALLING_CODE[(country || '').toUpperCase()];
  return Boolean(code) && !e164.startsWith(code);
}

/** Lexical bot markers that need no account lookup: Telegram reserves the `bot` suffix for bots. */
export function isBotUsername(username: string): boolean {
  return /bot$/i.test(username);
}

function evidenceTelegramKind(fieldPath: string): string {
  return fieldPath.split('.')[2] ?? 'unknown';
}

interface TelegramSighting {
  username: string;
  kind: string;
  confidence: number;
  verifiedBusiness: boolean;
  source: ExportSource;
  sourceUrl: string | null;
  observedAt: string | null;
  invalid?: boolean;
}

function companyKey(lead: Pick<LeadRadarLead, 'name' | 'city'>): string {
  return `${lead.name}|${lead.city}`.toLowerCase().replace(/[^\p{L}\p{N}|]+/gu, '');
}

function collectPhones(lead: LeadRadarLead): Array<{ phone: LeadRadarPhoneAssessment; ownership: 'company' | 'unconfirmed' | 'personal'; source: ExportSource; sourceUrl: string | null; observedAt: string | null; extension: boolean }> {
  const out: Array<{ phone: LeadRadarPhoneAssessment; ownership: 'company' | 'unconfirmed' | 'personal'; source: ExportSource; sourceUrl: string | null; observedAt: string | null; extension: boolean }> = [];
  const push = (value: string, ownership: 'company' | 'unconfirmed' | 'personal', source: ExportSource, sourceUrl: string | null, observedAt: string | null) => {
    for (const phone of extractLeadRadarPhones(value, lead.country)) {
      out.push({ phone, ownership, source, sourceUrl, observedAt, extension: phone.reason === 'extension' });
    }
  };
  for (const candidate of [...(lead.contactCandidates ?? []), ...(lead.contactEnrichment?.sources ?? []).flatMap((source) => source.candidates)]) {
    if (candidate.kind !== 'phone') continue;
    const evidence = lead.evidence.find((item) => candidate.evidenceIds.includes(item.id));
    const assessed = assessLeadRadarPhone(candidate.value, lead.country);
    out.push({
      phone: assessed, ownership: candidate.ownership, source: sourceOf(evidence, candidate.sourceUrl),
      sourceUrl: candidate.sourceUrl, observedAt: candidate.observedAt, extension: candidate.reason === 'extension' || assessed.reason === 'extension',
    });
  }
  for (const evidence of lead.evidence) {
    if (evidence.fieldPath === 'company_contacts.phone') push(evidence.value, 'unconfirmed', sourceOf(evidence), evidence.sourceUrl, evidence.observedAt);
  }
  if (lead.phone) push(lead.phone, 'unconfirmed', 'unknown', null, null);
  return out;
}

function collectTelegram(lead: LeadRadarLead): TelegramSighting[] {
  const out: TelegramSighting[] = [];
  const contact = lead.telegramContact;
  const add = (value: string, declaredKind: string, confidence: number, source: ExportSource, sourceUrl: string | null, observedAt: string | null) => {
    // A channel preview link (t.me/s/<name>) names a channel; a deep link with
    // ?start= / ?startapp= / ?startgroup= opens a bot. Neither can take a DM.
    const preview = /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/s\/([A-Za-z][A-Za-z0-9_]{4,31})\/?(?:[?#].*)?$/i.exec(value.trim());
    if (preview) { add(`@${preview[1]}`, 'channel', confidence, source, sourceUrl, observedAt); return; }
    const kind = /[?&]start(?:app|group)?=/i.test(value) ? 'bot' : declaredKind;
    const locator = parseLeadRadarTelegramLocator(value);
    if (!locator) { out.push({ username: value, kind, confidence, verifiedBusiness: false, source, sourceUrl, observedAt, invalid: true }); return; }
    if (locator.kind !== 'username') return;
    const username = locator.value.toLowerCase();
    const verifiedBusiness = Boolean(contact && contact.type === 'business' && contact.reason === 'bridge_resolved_corporate'
      && contact.username.toLowerCase() === username);
    out.push({ username, kind, confidence, verifiedBusiness, source, sourceUrl, observedAt });
  };
  if (contact?.username) {
    const kind = contact.reason === 'bridge_not_regular_user' ? 'not_user' : contact.type;
    add(`@${contact.username}`, kind, contact.confidence, contact.reason === 'bridge_resolved_corporate' ? 'telegram_check' : 'unknown', contact.url || null, contact.verifiedAt || null);
  }
  if (lead.telegramUrl) add(lead.telegramUrl, contact?.type ?? 'unknown', contact?.confidence ?? 0.4, 'unknown', null, null);
  for (const evidence of lead.evidence) {
    if (!evidence.fieldPath.startsWith('web.telegram.')) continue;
    add(evidence.value, evidenceTelegramKind(evidence.fieldPath), evidence.confidence, sourceOf(evidence), evidence.sourceUrl, evidence.observedAt);
  }
  for (const candidate of [...(lead.contactCandidates ?? []), ...(lead.contactEnrichment?.sources ?? []).flatMap((source) => source.candidates)]) {
    if (candidate.kind !== 'telegram') continue;
    const evidence = lead.evidence.find((item) => candidate.evidenceIds.includes(item.id));
    const kind = candidate.ownership === 'personal' ? 'human' : candidate.reason === 'unsupported_telegram' ? 'unsupported' : 'unknown';
    add(candidate.value, kind, evidence?.confidence ?? 0.45, sourceOf(evidence, candidate.sourceUrl), candidate.sourceUrl, candidate.observedAt);
  }
  return out;
}

interface PhoneCounts { byNumber: Map<string, Set<string>> }
interface HandleCounts { byHandle: Map<string, Set<string>> }

/** Shared numbers and handles across distinct businesses in the export set (call-centres, studios, chains). */
export function exportSharingCounts(leads: readonly LeadRadarLead[]): { phones: PhoneCounts; handles: HandleCounts } {
  const byNumber = new Map<string, Set<string>>(), byHandle = new Map<string, Set<string>>();
  for (const lead of leads) {
    if (lead.suppressed || lead.lifecycle === 'do_not_contact') continue;
    // One OSM object is one business even when searches saw it under
    // different names (name:ru, name:uz, brand); name+city is the fallback.
    const key = osmObjectKey(lead) ?? companyKey(lead);
    for (const item of collectPhones(lead)) {
      if (!item.phone.e164) continue;
      const set = byNumber.get(item.phone.e164) ?? new Set<string>();
      set.add(key); byNumber.set(item.phone.e164, set);
    }
    for (const item of collectTelegram(lead)) {
      if (item.invalid) continue;
      const set = byHandle.get(item.username) ?? new Set<string>();
      set.add(key); byHandle.set(item.username, set);
    }
  }
  return { phones: { byNumber }, handles: { byHandle } };
}

function better<T extends { source: ExportSource; ownership?: string; observedAt: string | null }>(left: T, right: T): number {
  const owned = Number(right.ownership === 'company') - Number(left.ownership === 'company');
  if (owned) return owned;
  const rank = SOURCE_RANK[right.source] - SOURCE_RANK[left.source];
  if (rank) return rank;
  return (Date.parse(right.observedAt ?? '') || 0) - (Date.parse(left.observedAt ?? '') || 0);
}

export function leadExportContacts(
  lead: LeadRadarLead,
  sharing: ReturnType<typeof exportSharingCounts> | null,
  verdicts?: TelegramHandleVerdicts,
): LeadExportContacts {
  const result: LeadExportContacts = { mobiles: [], landlines: [], telegrams: [], phoneExclusions: {}, telegramExclusions: {} };
  if (lead.suppressed || lead.lifecycle === 'do_not_contact') return result;

  const phones = new Map<string, ExportPhone>();
  const rejectedPhones = new Map<string, ExportPhoneExclusion>();
  for (const item of collectPhones(lead)) {
    const e164 = item.phone.e164;
    if (!e164 || !['mobile', 'fixed_line', 'fixed_or_mobile'].includes(item.phone.type)) {
      if (!e164 || !phones.has(e164)) bump(result.phoneExclusions, 'invalid');
      continue;
    }
    let reason: ExportPhoneExclusion | null = null;
    if (item.ownership === 'personal') reason = 'personal';
    else if (item.extension) reason = 'extension';
    else if (isPlaceholderPhone(e164)) reason = 'placeholder';
    else if (isForeignPhone(e164, lead.country)) reason = 'foreign';
    else if ((sharing?.phones.byNumber.get(e164)?.size ?? 0) >= SHARED_THRESHOLD) reason = 'shared';
    if (reason) { if (!phones.has(e164)) rejectedPhones.set(e164, reason); continue; }
    rejectedPhones.delete(e164);
    const candidate: ExportPhone = {
      e164, type: item.phone.type, ownership: item.ownership === 'company' ? 'company' : 'unconfirmed',
      source: item.source, sourceUrl: item.sourceUrl, observedAt: item.observedAt,
    };
    const existing = phones.get(e164);
    if (!existing || better(existing, candidate) > 0) phones.set(e164, candidate);
  }
  for (const reason of rejectedPhones.values()) bump(result.phoneExclusions, reason);
  const ranked = [...phones.values()].sort(better);
  result.mobiles = ranked.filter((phone) => phone.type === 'mobile');
  result.landlines = ranked.filter((phone) => phone.type === 'fixed_line' || phone.type === 'fixed_or_mobile');

  const sightings = collectTelegram(lead);
  const byHandle = new Map<string, TelegramSighting[]>();
  for (const sighting of sightings) {
    if (sighting.invalid) { bump(result.telegramExclusions, 'invalid'); continue; }
    const list = byHandle.get(sighting.username) ?? [];
    list.push(sighting); byHandle.set(sighting.username, list);
  }
  for (const [username, list] of byHandle) {
    const verified = list.some((item) => item.verifiedBusiness);
    const verdict = verdicts?.get(username);
    const kinds = new Set(list.map((item) => item.kind));
    let reason: ExportTelegramExclusion | null = null;
    if (verdict === 'bot' || kinds.has('bot') || (isBotUsername(username) && !verified)) reason = 'bot';
    else if (verdict === 'channel' || kinds.has('channel')) reason = 'channel';
    else if (verdict === 'group' || kinds.has('group')) reason = 'group';
    else if (kinds.has('human')) reason = 'personal';
    else if (verdict === 'not_found') reason = 'not_found';
    else if (kinds.has('not_user') || kinds.has('unsupported')) reason = 'bot';
    else if (!verified && list.every((item) => item.confidence < 0.4)) reason = list.some((item) => item.confidence <= 0.2) ? 'vendor' : 'low_confidence';
    else if (!verified && (sharing?.handles.byHandle.get(username)?.size ?? 0) >= SHARED_THRESHOLD) reason = 'shared';
    if (reason) { bump(result.telegramExclusions, reason); continue; }
    const best = [...list].sort((a, b) => better(a, b))[0]!;
    result.telegrams.push({
      username,
      type: verified || kinds.has('business') ? 'business' : verdict === 'user' ? 'user' : 'unknown',
      verified,
      source: verified ? 'telegram_check' : best.source,
      sourceUrl: best.sourceUrl,
      observedAt: best.observedAt,
    });
  }
  result.telegrams.sort((a, b) => Number(b.verified) - Number(a.verified)
    || Number(b.type === 'business') - Number(a.type === 'business')
    || SOURCE_RANK[b.source] - SOURCE_RANK[a.source]
    || a.username.localeCompare(b.username));
  return result;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(key: string): string {
    let root = this.parent.get(key) ?? key;
    if (root !== key) { root = this.find(root); this.parent.set(key, root); }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function osmObjectKey(lead: LeadRadarLead): string | null {
  for (const evidence of lead.evidence) {
    const match = /openstreetmap\.org\/(node|way|relation)\/(\d+)/.exec(evidence.sourceUrl);
    if (match) return `osm:${match[1]}:${match[2]}`;
  }
  return null;
}

/**
 * Builds the export rows and a reason-by-reason summary. Leads that are the
 * same business (same OSM object, same mobile or same Telegram handle) are
 * merged into one row, so a niche export across many searches has no repeats.
 */
export function buildLeadExport(leads: readonly LeadRadarLead[], options: ExportOptions = {}): { rows: ExportRowV2[]; summary: ExportSummary } {
  const includeLandlineOnly = options.includeLandlineOnly ?? true;
  const now = options.now ?? new Date();
  const staleBefore = now.getTime() - (options.staleAfterDays ?? 730) * 86400_000;
  const sharing = exportSharingCounts(leads);
  const summary: ExportSummary = {
    leads: leads.length, rows: 0, withMobile: 0, withLandline: 0, withTelegram: 0, withVerifiedTelegram: 0,
    unclassifiedTelegram: 0, excludedLeads: {}, excludedPhones: {}, excludedTelegram: {},
  };
  const groups = new UnionFind();
  const prepared: Array<{ lead: LeadRadarLead; contacts: LeadExportContacts; id: string; order: number }> = [];
  for (const [order, lead] of leads.entries()) {
    if (lead.suppressed || lead.lifecycle === 'do_not_contact') { bump(summary.excludedLeads, 'suppressed'); continue; }
    const contacts = leadExportContacts(lead, sharing, options.verdicts);
    for (const [reason, count] of Object.entries(contacts.phoneExclusions)) bump(summary.excludedPhones, reason as ExportPhoneExclusion, count ?? 0);
    for (const [reason, count] of Object.entries(contacts.telegramExclusions)) bump(summary.excludedTelegram, reason as ExportTelegramExclusion, count ?? 0);
    const reachable = contacts.mobiles.length > 0 || contacts.telegrams.length > 0;
    if (!reachable && !(includeLandlineOnly && contacts.landlines.length > 0)) {
      bump(summary.excludedLeads, contacts.landlines.length > 0 ? 'landline_only' : 'no_contact');
      continue;
    }
    // Ids repeat when one company is exported from several searches.
    const id = `${order}:${lead.id}`;
    groups.find(id);
    const keys = [
      osmObjectKey(lead),
      ...contacts.mobiles.map((phone) => `phone:${phone.e164}`),
      ...contacts.telegrams.map((handle) => `tg:${handle.username}`),
      ...(contacts.mobiles.length === 0 && contacts.telegrams.length === 0 ? contacts.landlines.map((phone) => `phone:${phone.e164}`) : []),
    ].filter((key): key is string => Boolean(key));
    for (const key of keys) groups.union(`key:${key}`, id);
    prepared.push({ lead, contacts, id, order });
  }

  const merged = new Map<string, Array<{ lead: LeadRadarLead; contacts: LeadExportContacts; order: number }>>();
  for (const item of prepared) {
    const root = groups.find(item.id);
    const list = merged.get(root) ?? [];
    list.push(item); merged.set(root, list);
  }

  const rows: ExportRowV2[] = [];
  for (const list of merged.values()) {
    if (list.length > 1) bump(summary.excludedLeads, 'duplicate', list.length - 1);
    // Highest score names the row; on a tie the first occurrence wins.
    const primary = [...list].sort((a, b) => b.lead.score - a.lead.score || a.order - b.order)[0]!;
    const mobiles = new Map<string, ExportPhone>(), landlines = new Map<string, ExportPhone>(), telegrams = new Map<string, ExportTelegram>();
    for (const { contacts } of list) {
      for (const phone of contacts.mobiles) if (!mobiles.has(phone.e164)) mobiles.set(phone.e164, phone);
      for (const phone of contacts.landlines) if (!landlines.has(phone.e164)) landlines.set(phone.e164, phone);
      for (const handle of contacts.telegrams) {
        const existing = telegrams.get(handle.username);
        if (!existing || Number(handle.verified) > Number(existing.verified)) telegrams.set(handle.username, handle);
      }
    }
    const rankedMobiles = [...mobiles.values()].sort(better);
    const rankedLandlines = [...landlines.values()].sort(better);
    const rankedTelegrams = [...telegrams.values()].sort((a, b) => Number(b.verified) - Number(a.verified)
      || Number(b.type === 'business') - Number(a.type === 'business') || SOURCE_RANK[b.source] - SOURCE_RANK[a.source]);
    const telegram = rankedTelegrams[0] ?? null;
    const primarySource = telegram?.verified ? telegram : rankedMobiles[0] ?? telegram ?? rankedLandlines[0] ?? null;
    const sourceDate = primarySource?.observedAt ?? null;
    const lead = primary.lead;
    rows.push({
      company: lead.name,
      niche: options.niche ?? lead.category,
      city: lead.city,
      phoneMobile1: rankedMobiles[0]?.e164 ?? null,
      phoneMobile2: rankedMobiles[1]?.e164 ?? null,
      phoneLandline: rankedLandlines[0]?.e164 ?? null,
      telegramUsername: telegram?.username ?? null,
      telegramUrl: telegram ? `https://t.me/${telegram.username}` : null,
      telegramType: telegram?.type ?? null,
      contactStatus: telegram?.verified ? 'verified' : 'unverified',
      source: primarySource?.source ?? 'unknown',
      sourceUrl: primarySource?.sourceUrl ?? null,
      sourceDate,
      stale: Boolean(sourceDate && Date.parse(sourceDate) < staleBefore),
      website: list.map((item) => item.lead.website).find(Boolean) ?? null,
      address: list.map((item) => item.lead.address).find(Boolean) ?? null,
      priority: lead.priority,
      score: lead.score,
    });
    if (rankedMobiles.length) summary.withMobile += 1;
    if (rankedLandlines.length) summary.withLandline += 1;
    if (telegram) summary.withTelegram += 1;
    if (telegram?.verified) summary.withVerifiedTelegram += 1;
    if (telegram && telegram.type === 'unknown') summary.unclassifiedTelegram += 1;
  }
  rows.sort((a, b) => Number(Boolean(b.telegramUsername)) - Number(Boolean(a.telegramUsername))
    || Number(Boolean(b.phoneMobile1)) - Number(Boolean(a.phoneMobile1))
    || b.score - a.score || a.company.localeCompare(b.company));
  summary.rows = rows.length;
  return { rows, summary };
}

/** Lowercase usernames whose type is still unknown: candidates for the free public t.me card check. */
export function exportHandlesNeedingCheck(leads: readonly LeadRadarLead[], verdicts?: TelegramHandleVerdicts): string[] {
  const out = new Set<string>();
  const sharing = exportSharingCounts(leads);
  for (const lead of leads) {
    for (const handle of leadExportContacts(lead, sharing, verdicts).telegrams) {
      if (!handle.verified && !verdicts?.has(handle.username)) out.add(handle.username);
    }
  }
  return [...out];
}

export const EXPORT_EXCLUSION_COPY: Record<string, string> = {
  suppressed: 'стоп-лист',
  no_contact: 'нет контакта',
  landline_only: 'только городской',
  duplicate: 'повтор',
  invalid: 'невалидный',
  extension: 'добавочный',
  personal: 'личный',
  placeholder: 'номер-заглушка',
  foreign: 'иностранный',
  shared: 'общий для нескольких компаний',
  bot: 'бот',
  channel: 'канал',
  group: 'группа',
  not_found: 'не существует',
  vendor: 'хэндл разработчика сайта',
  low_confidence: 'слабое доказательство',
};
