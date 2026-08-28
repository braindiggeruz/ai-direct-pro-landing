import type { LeadRadarApiCapabilities } from '../../../src/shared/lead-radar';
import { AUDIENCE_ID_PATTERN, AUDIENCE_LIMIT, type AudienceScope, type LeadRadarAudience,
  type ContactDirectoryPage, type ContactDirectoryRow } from '../../../src/shared/lead-radar-audiences';
import { redactLead } from './capabilities';
import { LeadRadarStore } from './store';
import { verifiedTelegramCampaignBusinessCompanyIds } from './telegram-business';
import { normalizeCompanyKey } from './validation';

export class AudienceError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export async function audienceSchemaReady(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN
        ('lead_radar_audiences','lead_radar_audience_campaigns')) AS tables,
      (SELECT COUNT(*) FROM d1_migrations WHERE name='0051_lead_radar_audiences.sql') AS ledger`)
      .first<{ tables: number; ledger: number }>();
    if (row?.tables !== 2 || row.ledger !== 1) return false;
    await db.prepare(`SELECT a.id,a.org_id,a.name,a.version,a.company_ids_json,a.created_at,a.updated_at,
      c.campaign_id,c.audience_id,c.audience_version,c.company_ids_json FROM lead_radar_audiences a
      LEFT JOIN lead_radar_audience_campaigns c ON a.org_id=c.org_id AND a.id=c.audience_id LIMIT 0`).all();
    return true;
  } catch { return false; }
}
export async function requireAudienceSchema(db: D1Database): Promise<void> {
  if (!await audienceSchemaReady(db)) throw new AudienceError('audience_schema_unavailable', 503);
}

interface AudienceRow {
  id: string; name: string; version: number; company_ids_json: string; created_at: string; updated_at: string;
}
function present(row: AudienceRow): LeadRadarAudience {
  return { id: row.id, name: row.name, version: row.version, companyIds: JSON.parse(row.company_ids_json),
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export function validAudienceScope(value: AudienceScope): boolean {
  return AUDIENCE_ID_PATTERN.test(value.audienceId)
    && Number.isSafeInteger(value.audienceVersion) && value.audienceVersion > 0;
}

// Corporate and unknown PUBLIC usernames only. A phone, bot, group or human
// profile is never converted into an automatic recipient by this read model.
const CONTACTS = `WITH contacts AS (
  SELECT c.*, lower(json_extract(c.telegram_contact_json,'$.username')) AS endpoint,
    CASE WHEN c.suppressed=1 OR c.lifecycle='do_not_contact' OR EXISTS (
      SELECT 1 FROM lead_radar_suppressions s WHERE s.org_id=c.org_id AND (
        s.canonical_key=c.canonical_key OR (s.domain IS NOT NULL AND s.domain=c.domain)
        OR (s.phone_digits IS NOT NULL AND s.phone_digits=c.phone_digits)
        OR (s.name_city_key IS NOT NULL AND s.name_city_key=c.name_city_key)
      )) THEN 1 ELSE 0 END AS blocked
  FROM lead_radar_companies c WHERE c.org_id=?
    AND json_valid(c.telegram_contact_json)
    AND json_extract(c.telegram_contact_json,'$.type') IN ('business','unknown')
    AND COALESCE(json_extract(c.telegram_contact_json,'$.reason'),'')<>'bridge_not_regular_user'
    AND (lower(substr(json_extract(c.telegram_contact_json,'$.username'),-3))<>'bot'
      OR json_extract(c.telegram_contact_json,'$.reason')='bridge_resolved_corporate')
    AND length(json_extract(c.telegram_contact_json,'$.username')) BETWEEN 5 AND 32
    AND json_extract(c.telegram_contact_json,'$.username') NOT GLOB '*[^a-zA-Z0-9_]*'
    AND json_extract(c.telegram_contact_json,'$.username') GLOB '[a-zA-Z]*'
)`;
interface GroupRow {
  endpoint: string; company_id: string; occurrences: number; identities: number; blocked: number;
  contacted: number; sources_json: string;
}
const GROUP_SELECT = `SELECT endpoint, COUNT(*) AS occurrences,
  COUNT(DISTINCT canonical_key) AS identities, MAX(blocked) AS blocked,
  (SELECT id FROM contacts chosen WHERE chosen.endpoint=contacts.endpoint
    ORDER BY blocked ASC, CASE json_extract(telegram_contact_json,'$.type') WHEN 'business' THEN 0 ELSE 1 END,
      last_verified_at DESC, id ASC LIMIT 1) AS company_id,
  MAX(CASE WHEN lifecycle IN ('contacted','replied','qualified','meeting','won') OR EXISTS (
    SELECT 1 FROM lead_radar_tg_campaign_recipients r
    JOIN lead_radar_companies historical ON historical.org_id=r.org_id AND historical.id=r.company_id
    WHERE r.org_id=contacts.org_id AND r.status IN ('sent','dispatching','ambiguous')
      AND (historical.canonical_key=contacts.canonical_key
        OR (historical.domain IS NOT NULL AND historical.domain=contacts.domain)
        OR (historical.phone_digits IS NOT NULL AND historical.phone_digits=contacts.phone_digits)
        OR (json_valid(historical.telegram_contact_json)
          AND lower(json_extract(historical.telegram_contact_json,'$.username'))=contacts.endpoint))
  ) THEN 1 ELSE 0 END) AS contacted,
  (SELECT json_group_array(json_object('companyId',id,'searchId',search_id,'name',name,'category',category,'city',city))
    FROM (SELECT id,search_id,name,category,city FROM contacts source WHERE source.endpoint=contacts.endpoint
      ORDER BY last_verified_at DESC,id LIMIT 50)) AS sources_json
  FROM contacts`;

export class AudienceStore {
  constructor(private readonly db: D1Database) {}
  async list(orgId: string): Promise<LeadRadarAudience[]> {
    const rows = await this.db.prepare(`SELECT * FROM lead_radar_audiences WHERE org_id=?
      ORDER BY updated_at DESC,id LIMIT 100`).bind(orgId).all<AudienceRow>();
    return (rows.results ?? []).map(present);
  }
  async get(orgId: string, id: string): Promise<LeadRadarAudience | null> {
    const row = await this.db.prepare('SELECT * FROM lead_radar_audiences WHERE org_id=? AND id=?')
      .bind(orgId,id).first<AudienceRow>();
    return row ? present(row) : null;
  }
  async save(orgId: string, input: { id: string; name: string; version: number; companyIds: string[] }, now = new Date()): Promise<LeadRadarAudience> {
    if (!AUDIENCE_ID_PATTERN.test(input.id) || typeof input.name !== 'string' || !input.name.trim()
      || input.name.trim().length > 100 || !Number.isSafeInteger(input.version) || input.version < 0
      || !Array.isArray(input.companyIds) || input.companyIds.length > AUDIENCE_LIMIT
      || input.companyIds.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/u.test(id))
      || new Set(input.companyIds).size !== input.companyIds.length) throw new AudienceError('audience_invalid_input');
    if (input.companyIds.length) await this.validateMembers(orgId, input.companyIds);
    const ids = JSON.stringify([...input.companyIds].sort());
    const name = input.name.trim();
    const stamp = now.toISOString();
    const existing = await this.get(orgId, input.id);
    // A lost response can be retried with the same client-generated id/version.
    if (existing && existing.name === name && JSON.stringify([...existing.companyIds].sort()) === ids
      && (existing.version === input.version || existing.version === input.version + 1)) return existing;
    if (input.version === 0) {
      await this.db.prepare(`INSERT INTO lead_radar_audiences
        (org_id,id,name,version,company_ids_json,created_at,updated_at)
        SELECT ?,?,?,1,?,?,? WHERE (SELECT COUNT(*) FROM lead_radar_audiences WHERE org_id=?) < 100
        ON CONFLICT(org_id,id) DO NOTHING`).bind(orgId,input.id,name,ids,stamp,stamp,orgId).run();
    } else {
      await this.db.prepare(`UPDATE lead_radar_audiences SET name=?,company_ids_json=?,version=version+1,updated_at=?
        WHERE org_id=? AND id=? AND version=?`).bind(name,ids,stamp,orgId,input.id,input.version).run();
    }
    const saved = await this.get(orgId,input.id);
    if (!saved || saved.version !== input.version+1 || saved.name !== name
      || JSON.stringify(saved.companyIds) !== ids) throw new AudienceError('audience_version_conflict',409);
    return saved;
  }
  async validateMembers(orgId: string, ids: readonly string[]): Promise<string> {
    if (ids.length < 1 || ids.length > AUDIENCE_LIMIT || new Set(ids).size !== ids.length) throw new AudienceError('audience_invalid_input');
    const selected = await this.db.prepare(`${CONTACTS} SELECT id,search_id,endpoint FROM contacts
      WHERE id IN (SELECT value FROM json_each(?))`).bind(orgId,JSON.stringify(ids))
      .all<{ id: string; search_id: string; endpoint: string }>();
    const rows = selected.results ?? [];
    if (rows.length !== ids.length) throw new AudienceError('audience_members_unavailable',409);
    if (new Set(rows.map((row) => row.endpoint)).size !== ids.length) throw new AudienceError('audience_duplicate_contact',409);
    // Global, before filtering by niche/search. A blocked duplicate must not be hidden by a filter.
    const groups = await this.db.prepare(`${CONTACTS} SELECT endpoint,MAX(blocked) AS blocked,
      COUNT(DISTINCT canonical_key) AS identities FROM contacts
      WHERE endpoint IN (SELECT value FROM json_each(?)) GROUP BY endpoint`)
      .bind(orgId,JSON.stringify(rows.map((row) => row.endpoint))).all<{ blocked: number; identities: number }>();
    if ((groups.results ?? []).some((row) => row.blocked || row.identities > 1)) throw new AudienceError('audience_contact_blocked_or_conflicted',409);
    return rows.sort((a,b) => a.id.localeCompare(b.id))[0].search_id;
  }
  async resolveScope(orgId: string, scope: AudienceScope, ids: readonly string[]): Promise<string> {
    if (!validAudienceScope(scope)) throw new AudienceError('audience_invalid_input');
    const audience = await this.get(orgId,scope.audienceId);
    if (!audience) throw new AudienceError('audience_not_found',404);
    if (audience.version !== scope.audienceVersion) throw new AudienceError('audience_version_conflict',409);
    if (ids.some((id) => !audience.companyIds.includes(id))) throw new AudienceError('audience_members_unavailable',409);
    return this.validateMembers(orgId,ids);
  }
  async directory(orgId: string, filters: { q?: string; category?: string; city?: string; offset?: number }, capabilities: LeadRadarApiCapabilities, now = new Date()): Promise<ContactDirectoryPage> {
    const offset = Math.max(0,Math.min(100_000,Math.trunc(filters.offset ?? 0)));
    const limit = 20;
    const q = normalizeCompanyKey((filters.q ?? '').slice(0,100));
    const category = (filters.category ?? '').slice(0,100);
    const city = (filters.city ?? '').slice(0,100);
    const where = `WHERE endpoint IN (SELECT endpoint FROM contacts matched WHERE
      (?='' OR instr(COALESCE(name_city_key,''),?)>0 OR instr(endpoint,?)>0)
      AND (?='' OR category=?) AND (?='' OR city=?))`;
    const bindings = [orgId,q,q,q,category,category,city,city];
    const count = await this.db.prepare(`${CONTACTS} SELECT COUNT(DISTINCT endpoint) AS total FROM contacts ${where}`)
      .bind(...bindings).first<{ total: number }>();
    const groups = await this.db.prepare(`${CONTACTS} ${GROUP_SELECT} ${where} GROUP BY endpoint ORDER BY endpoint LIMIT ? OFFSET ?`)
      .bind(...bindings,limit,offset).all<GroupRow>();
    const rows = groups.results ?? [];
    const leads = await new LeadRadarStore(this.db).getLeadsByIds(orgId,rows.map((row) => row.company_id));
    const verified = await verifiedTelegramCampaignBusinessCompanyIds({ db:this.db,orgId,now,
      companies:leads.flatMap((lead) => lead.telegramContact ? [{companyId:lead.id,website:lead.website,contact:lead.telegramContact}] : []) });
    const output: ContactDirectoryRow[] = [];
    for (const row of rows) {
      const lead = leads.find((item) => item.id === row.company_id);
      if (!lead) continue;
      const status = row.blocked ? 'blocked' : row.identities>1 ? 'conflict' : row.contacted ? 'contacted' : verified.has(lead.id) ? 'verified' : 'review';
      const redacted = redactLead(lead,capabilities,now.getTime());
      if (row.blocked) {
        redacted.phone=null; redacted.telegramUrl=null; redacted.telegramContact=null;
        redacted.contactCandidates=[]; redacted.decisionMakers=[]; redacted.evidence=[];
        redacted.genericEmail=null; redacted.suppressed=true;
      }
      output.push({key:row.company_id,lead:redacted,status,sources:JSON.parse(row.sources_json),occurrences:row.occurrences});
    }
    return {rows:output,total:count?.total ?? 0,offset,limit};
  }
}
