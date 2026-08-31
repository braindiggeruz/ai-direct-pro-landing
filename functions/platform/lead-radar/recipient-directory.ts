import type { LeadRadarEvidence, LeadRadarTelegramContact } from '../../../src/shared/lead-radar';
import { parseLeadRadarTelegramLocator } from '../../../src/shared/lead-radar-contacts';
import { recipientContactChoices } from '../../../src/shared/lead-radar-recipient-contacts';
import { contactSourceSchemaReady } from './contact-source-store';

export class RecipientDirectoryLimitError extends Error {}
export interface DirectoryCompany {
  id: string; search_id: string; canonical_key: string; name: string; category: string; city: string;
  country: string; phone: string | null; telegram_url: string | null; telegram_contact_json: string | null;
  last_verified_at: string; blocked: number; contacted: number; phones_json: string; sources_json: string | null;
  telegram_evidence_json: string;
}
export interface DirectoryGroup {
  key: string; companyId: string; members: DirectoryCompany[]; keys: string[];
  blocked: boolean; conflict: boolean; contacted: boolean;
}
function parse<T>(value: string | null, fallback: T): T { try { return JSON.parse(value ?? 'null') ?? fallback; } catch { return fallback; } }
type TelegramDirectoryEvidence = Pick<LeadRadarEvidence, 'fieldPath' | 'value' | 'observedAt'>;

/** Selection projection only: retain contact types, never manufacture Bridge proof.
 * A newer personal/unsupported classification must not be revived by an older
 * unknown observation of the same case-insensitive username on another page. */
function directoryTelegramEvidence(value: string, contact: LeadRadarTelegramContact | null,
  locate: typeof parseLeadRadarTelegramLocator): {
  evidence: TelegramDirectoryEvidence[]; blockedKeys: Set<string>;
} {
  const input = parse<TelegramDirectoryEvidence[]>(value, []);
  const blockedKeys = new Set<string>();
  const block = (url: string) => {
    const locator = locate(url);
    if (locator?.kind === 'username') blockedKeys.add(`username:${locator.value.toLowerCase()}`);
    if (locator?.kind === 'phone') blockedKeys.add(`phone:${locator.value}`);
  };
  const unsupported = (type: string) => ['human','bot','channel','group'].includes(type);
  const key = (url: string) => {
    const locator = locate(url);
    return locator ? locator.kind === 'username' ? locator.url.toLowerCase() : locator.url : null;
  };
  const knownUnsupported = contact && unsupported(contact.type)
    ? key(contact.url || `@${contact.username}`) : null;
  if (knownUnsupported) block(knownUnsupported);
  const latest = new Map<string, TelegramDirectoryEvidence>();
  for (const evidence of Array.isArray(input) ? input : []) {
    if (!evidence || typeof evidence.value !== 'string' || typeof evidence.fieldPath !== 'string'
      || !/^web\.telegram\.(business|unknown|human|bot|channel|group)$/.test(evidence.fieldPath)) continue;
    const locatorKey = key(evidence.value);
    if (!locatorKey || locatorKey === knownUnsupported) continue;
    const previous = latest.get(locatorKey);
    const stamp = Date.parse(evidence.observedAt) || 0;
    const previousStamp = previous ? Date.parse(previous.observedAt) || 0 : -Infinity;
    if (!previous || stamp > previousStamp || stamp === previousStamp
      && unsupported(evidence.fieldPath.split('.')[2]) && !unsupported(previous.fieldPath.split('.')[2])) {
      latest.set(locatorKey, evidence);
    }
  }
  const evidence = [...latest.values()];
  for (const item of evidence) if (unsupported(item.fieldPath.split('.')[2])) block(item.value);
  // An old stored URL or enrichment candidate must not resurrect the exact
  // locator that fresh typed evidence has identified as an unsupported peer.
  const contactLocator = contact ? locate(contact.url || `@${contact.username}`) : null;
  if (contact?.peerRef && contactLocator?.kind === 'username'
    && blockedKeys.has(`username:${contactLocator.value.toLowerCase()}`)) blockedKeys.add(contact.peerRef);
  return { evidence, blockedKeys };
}

/** One bounded tenant read, followed by the SAME phone parser used by the UI.
 * SQL prefixes must never guess whether an international phone is mobile.
 * All duplicates are joined BEFORE filters, so DNC cannot be hidden by a niche.
 */
export async function recipientDirectoryGroups(db: D1Database, orgId: string): Promise<DirectoryGroup[]> {
  const hasSources = await contactSourceSchemaReady(db);
  const rows = (await db.prepare(`SELECT c.id,c.search_id,c.canonical_key,c.name,c.category,c.city,c.country,c.phone,
    c.telegram_url,c.telegram_contact_json,c.last_verified_at,
    ${hasSources ? '(SELECT sources_json FROM lead_radar_contact_enrichments x WHERE x.org_id=c.org_id AND x.company_id=c.id)' : 'NULL'} AS sources_json,
    (SELECT json_group_array(e.value) FROM lead_radar_evidence e WHERE e.org_id=c.org_id AND e.company_id=c.id
      AND e.field_path='company_contacts.phone') AS phones_json,
    (SELECT json_group_array(json_object('fieldPath',e.field_path,'value',e.value,'observedAt',e.observed_at))
      FROM lead_radar_evidence e
      WHERE e.org_id=c.org_id AND e.company_id=c.id
        AND e.field_path IN ('web.telegram.business','web.telegram.unknown','web.telegram.human',
          'web.telegram.bot','web.telegram.channel','web.telegram.group')) AS telegram_evidence_json,
    CASE WHEN c.suppressed=1 OR c.lifecycle='do_not_contact' OR EXISTS (
      SELECT 1 FROM lead_radar_suppressions s WHERE s.org_id=c.org_id AND (s.canonical_key=c.canonical_key
        OR (s.domain IS NOT NULL AND s.domain=c.domain) OR (s.phone_digits IS NOT NULL AND s.phone_digits=c.phone_digits)
        OR (s.name_city_key IS NOT NULL AND s.name_city_key=c.name_city_key))) THEN 1 ELSE 0 END AS blocked,
    CASE WHEN c.lifecycle IN ('contacted','replied','qualified','meeting','won') OR EXISTS (
      SELECT 1 FROM lead_radar_tg_campaign_recipients r JOIN lead_radar_companies h ON h.org_id=r.org_id AND h.id=r.company_id
      WHERE r.org_id=c.org_id AND r.status IN ('sent','dispatching','ambiguous') AND (h.canonical_key=c.canonical_key
        OR (h.domain IS NOT NULL AND h.domain=c.domain) OR (h.phone_digits IS NOT NULL AND h.phone_digits=c.phone_digits)
        OR (json_valid(h.telegram_contact_json) AND json_valid(c.telegram_contact_json)
          AND (nullif(lower(json_extract(h.telegram_contact_json,'$.username')),'')=nullif(lower(json_extract(c.telegram_contact_json,'$.username')),'')
            OR nullif(json_extract(h.telegram_contact_json,'$.peerRef'),'')=nullif(json_extract(c.telegram_contact_json,'$.peerRef'),'')))))
      THEN 1 ELSE 0 END AS contacted
    FROM lead_radar_companies c WHERE c.org_id=? ORDER BY c.id LIMIT 5001`).bind(orgId).all<DirectoryCompany>()).results ?? [];
  if (rows.length > 5000) throw new RecipientDirectoryLimitError('directory_scan_limit');
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    if (!parent.has(key)) parent.set(key, key);
    let current = key;
    while (parent.get(current) !== current) current = parent.get(current)!;
    parent.set(key, current); return current;
  };
  const keysById = new Map<string, string[]>();
  // Historical searches repeat the same contact fields. Parse each exact input
  // once per invocation, but still merge EVERY row's fresh DNC/history flags.
  // This is not a cache of verification, ownership or audience eligibility.
  const parsedKeys = new Map<string, string[]>();
  const locators = new Map<string, ReturnType<typeof parseLeadRadarTelegramLocator>>();
  const locate: typeof parseLeadRadarTelegramLocator = (value) => {
    const cached = locators.get(value);
    if (cached !== undefined) return cached;
    const locator = parseLeadRadarTelegramLocator(value);
    if (locators.size < 4096) locators.set(value, locator);
    return locator;
  };
  for (const row of rows) {
    // Compact typed observations are part of the exact input key. Check before
    // parsing repeated historical JSON or normalizing its locators. Timestamps
    // and contact classifications remain inputs, so changed facts cannot reuse
    // an older decision. All caches are bounded by this invocation's row limit.
    const contactInput = JSON.stringify([row.phone,row.country,row.telegram_url,
      row.telegram_contact_json,row.phones_json,row.sources_json,row.telegram_evidence_json]);
    let keys = parsedKeys.get(contactInput);
    if (keys === undefined) {
      const contact = parse<LeadRadarTelegramContact | null>(row.telegram_contact_json, null);
      const telegram = directoryTelegramEvidence(row.telegram_evidence_json, contact, locate);
      const sources = parse<Array<{ candidates?: unknown[] }>>(row.sources_json, []);
      const candidates = Array.isArray(sources) ? sources.flatMap((source) => Array.isArray(source?.candidates) ? source.candidates : []) : [];
      const choices = recipientContactChoices({ phone: row.phone, country: row.country, telegramUrl: row.telegram_url,
        telegramContact: contact,
        evidence: [...telegram.evidence,
          ...parse<string[]>(row.phones_json, []).filter((value) => typeof value === 'string')
            .map((value) => ({ fieldPath: 'company_contacts.phone', value }))],
        contactCandidates: candidates.filter((value): value is NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number] =>
          Boolean(value) && typeof value === 'object' && typeof (value as {value?: unknown}).value === 'string'
          && ['phone','telegram'].includes((value as {kind: string}).kind)),
      });
      keys = choices.keys.filter((key) => !telegram.blockedKeys.has(key));
      parsedKeys.set(contactInput, keys);
    }
    keysById.set(row.id, keys);
    const identity = root(`company:${row.canonical_key}`);
    for (const key of keys) parent.set(root(key), root(identity));
  }
  const groups = new Map<string, DirectoryCompany[]>();
  for (const row of rows) {
    const key = root(`company:${row.canonical_key}`);
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, members]) => {
    const keys = [...new Set(members.flatMap((row) => keysById.get(row.id) ?? []))].sort();
    if (!keys.length) return [];
    const eligibleMembers = members.filter((row) => keysById.get(row.id)?.length);
    eligibleMembers.sort((a,b) => Number(parse<LeadRadarTelegramContact | null>(b.telegram_contact_json,null)?.type==='business')
      - Number(parse<LeadRadarTelegramContact | null>(a.telegram_contact_json,null)?.type==='business')
      || b.last_verified_at.localeCompare(a.last_verified_at) || a.id.localeCompare(b.id));
    return [{ key, keys, companyId: eligibleMembers[0].id, members,
      blocked: members.some((row) => Boolean(row.blocked)), conflict: new Set(members.map((row) => row.canonical_key)).size>1,
      contacted: members.some((row) => Boolean(row.contacted)) }];
  }).sort((a,b) => a.keys[0].localeCompare(b.keys[0]) || a.companyId.localeCompare(b.companyId));
}
