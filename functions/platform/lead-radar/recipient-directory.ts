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
  blocked: boolean; conflict: boolean; contacted: boolean;
}
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
  for (const row of rows) {
    const sources = parse<Array<{ candidates?: unknown[] }>>(row.sources_json, []);
    const candidates = Array.isArray(sources) ? sources.flatMap((source) => Array.isArray(source?.candidates) ? source.candidates : []) : [];
    const choices = recipientContactChoices({ phone: row.phone, country: row.country, telegramUrl: row.telegram_url,
      telegramContact: parse<LeadRadarTelegramContact | null>(row.telegram_contact_json, null),
      evidence: parse<string[]>(row.phones_json, []).filter((value) => typeof value === 'string').map((value) => ({
        id: '', fieldPath: 'company_contacts.phone', value, sourceUrl: '', sourceType: 'openstreetmap', observedAt: '', confidence: 0, classification: 'fact',
      })),
      contactCandidates: candidates.filter((value): value is NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number] =>
        Boolean(value) && typeof value === 'object' && typeof (value as {value?: unknown}).value === 'string'
        && ['phone','telegram'].includes((value as {kind: string}).kind)),
    });
    keysById.set(row.id, choices.keys);
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
    eligibleMembers.sort((a,b) => Number(parse<LeadRadarTelegramContact | null>(b.telegram_contact_json,null)?.type==='business')
      - Number(parse<LeadRadarTelegramContact | null>(a.telegram_contact_json,null)?.type==='business')
      || b.last_verified_at.localeCompare(a.last_verified_at) || a.id.localeCompare(b.id));
    return [{ key, keys, companyId: eligibleMembers[0].id, members,
      blocked: members.some((row) => Boolean(row.blocked)), conflict: new Set(members.map((row) => row.canonical_key)).size>1,
      contacted: members.some((row) => Boolean(row.contacted)) }];
  }).sort((a,b) => a.keys[0].localeCompare(b.keys[0]) || a.companyId.localeCompare(b.companyId));
}
