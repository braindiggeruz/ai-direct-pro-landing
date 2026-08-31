import type { LeadRadarTelegramContact } from '../../../src/shared/lead-radar';
import { recipientContactChoices } from '../../../src/shared/lead-radar-recipient-contacts';
import { contactSourceSchemaReady } from './contact-source-store';

export class RecipientDirectoryLimitError extends Error {}
export interface DirectoryCompany {
  id: string; search_id: string; canonical_key: string; name: string; category: string; city: string;
  country: string; phone: string | null; telegram_url: string | null; telegram_contact_json: string | null;
  last_verified_at: string; blocked: number; contacted: number; phones_json: string; sources_json: string | null;
}
export interface DirectoryGroup {
  key: string; companyId: string; members: DirectoryCompany[]; keys: string[];
  blocked: boolean; conflict: boolean; contacted: boolean; hasBusinessContact: boolean;
}
const MAX_DIRECTORY_CONTACT_CANDIDATES_PER_COMPANY = 256;
const MAX_DIRECTORY_PHONE_EVIDENCE_PER_COMPANY = 128;
function parse<T>(value: string | null, fallback: T): T { try { return JSON.parse(value ?? 'null') ?? fallback; } catch { return fallback; } }

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
  const businessById = new Map<string, boolean>();
  for (const row of rows) {
    // Parse each persisted contact representation once. Directory reads may scan
    // thousands of rows, so status filters and sorting must reuse this projection.
    const telegramContact = parse<LeadRadarTelegramContact | null>(row.telegram_contact_json, null);
    const sources = parse<Array<{ candidates?: unknown[] }>>(row.sources_json, []);
    const candidates: NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number][] = [];
    sourceLoop: for (const source of Array.isArray(sources) ? sources : []) {
      if (!Array.isArray(source?.candidates)) continue;
      for (const candidate of source.candidates) {
        if (!candidate || typeof candidate !== 'object' || typeof (candidate as { value?: unknown }).value !== 'string'
          || !['phone','telegram'].includes((candidate as { kind?: unknown }).kind as string)) continue;
        if (candidates.length >= MAX_DIRECTORY_CONTACT_CANDIDATES_PER_COMPANY) break sourceLoop;
        candidates.push(candidate as NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number]);
      }
    }
    const phoneEvidence = parse<unknown[]>(row.phones_json, [])
      .filter((value): value is string => typeof value === 'string')
      .slice(0, MAX_DIRECTORY_PHONE_EVIDENCE_PER_COMPANY);
    const choices = recipientContactChoices({ phone: row.phone, country: row.country, telegramUrl: row.telegram_url,
      telegramContact,
      evidence: phoneEvidence.map((value) => ({
        id: '', fieldPath: 'company_contacts.phone', value, sourceUrl: '', sourceType: 'openstreetmap', observedAt: '', confidence: 0, classification: 'fact',
      })),
      contactCandidates: candidates,
    });
    keysById.set(row.id, choices.keys);
    businessById.set(row.id, telegramContact?.type === 'business');
    const identity = root(`company:${row.canonical_key}`);
    for (const key of choices.keys) parent.set(root(key), root(identity));
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
    eligibleMembers.sort((a,b) => Number(businessById.get(b.id)) - Number(businessById.get(a.id))
      || b.last_verified_at.localeCompare(a.last_verified_at) || a.id.localeCompare(b.id));
    return [{ key, keys, companyId: eligibleMembers[0].id, members,
      blocked: members.some((row) => Boolean(row.blocked)), conflict: new Set(members.map((row) => row.canonical_key)).size>1,
      contacted: members.some((row) => Boolean(row.contacted)),
      hasBusinessContact: members.some((row) => businessById.get(row.id) === true) }];
  }).sort((a,b) => a.keys[0].localeCompare(b.keys[0]) || a.companyId.localeCompare(b.companyId));
}
