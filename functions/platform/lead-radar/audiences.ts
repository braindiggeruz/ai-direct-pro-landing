import type { LeadRadarApiCapabilities } from '../../../src/shared/lead-radar';
import { AUDIENCE_ID_PATTERN, AUDIENCE_LIMIT, type AudienceScope, type LeadRadarAudience,
  type ContactDirectoryPage, type ContactDirectoryRow } from '../../../src/shared/lead-radar-audiences';
import { redactLead } from './capabilities';
import { LeadRadarStore } from './store';
import { verifiedResolvedCorporateCompanies } from './contact-resolution';
import type { LeadRadarTelegramContact } from './types';
import { normalizeCompanyKey } from './validation';
import { recipientDirectoryGroups, RecipientDirectoryLimitError, type DirectoryGroup } from './recipient-directory';

/** Directory status must match the strict campaign gate (includeBridgeVerification). */
async function strictVerifiedDirectoryCompanyIds(input: {
  db: D1Database; orgId: string; now: Date;
  companies: ReadonlyArray<{ companyId: string; contact: LeadRadarTelegramContact }>;
}): Promise<Set<string>> {
  return verifiedResolvedCorporateCompanies({
    db: input.db, orgId: input.orgId, now: input.now,
    companies: input.companies,
  });
}

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
    await db.prepare(`SELECT a.id,a.org_id,a.name,a.version,a.company_ids_json,a.selection_ids_json,a.selection_version,a.created_at,a.updated_at,
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
  selection_ids_json?: string | null; selection_version?: number | null;
}
function present(row: AudienceRow): LeadRadarAudience {
  return { id: row.id, name: row.name, version: row.version,
    companyIds: JSON.parse(row.selection_version===row.version && row.selection_ids_json ? row.selection_ids_json : row.company_ids_json),
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export function validAudienceScope(value: AudienceScope): boolean {
  return AUDIENCE_ID_PATTERN.test(value.audienceId)
    && Number.isSafeInteger(value.audienceVersion) && value.audienceVersion > 0;
}

export class AudienceStore {
  constructor(private readonly db: D1Database) {}
  private async groups(orgId: string): Promise<DirectoryGroup[]> {
    try { return await recipientDirectoryGroups(this.db, orgId); }
    catch (error) {
      if (error instanceof RecipientDirectoryLimitError) throw new AudienceError('directory_scan_limit', 422);
      throw error;
    }
  }
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
    const legacyIds = JSON.stringify([...input.companyIds].sort().slice(0,50));
    const name = input.name.trim();
    const stamp = now.toISOString();
    const existing = await this.get(orgId, input.id);
    // A lost response can be retried with the same client-generated id/version.
    if (existing && existing.name === name && JSON.stringify([...existing.companyIds].sort()) === ids
      && (existing.version === input.version || existing.version === input.version + 1)) return existing;
    if (input.version === 0) {
      await this.db.prepare(`INSERT INTO lead_radar_audiences
        (org_id,id,name,version,company_ids_json,selection_ids_json,selection_version,created_at,updated_at)
        SELECT ?,?,?,1,?,?,1,?,? WHERE (SELECT COUNT(*) FROM lead_radar_audiences WHERE org_id=?) < 100
        ON CONFLICT(org_id,id) DO NOTHING`).bind(orgId,input.id,name,legacyIds,ids,stamp,stamp,orgId).run();
    } else {
      await this.db.prepare(`UPDATE lead_radar_audiences SET name=?,company_ids_json=?,selection_ids_json=?,selection_version=version+1,version=version+1,updated_at=?
        WHERE org_id=? AND id=? AND version=?`).bind(name,legacyIds,ids,stamp,orgId,input.id,input.version).run();
    }
    const saved = await this.get(orgId,input.id);
    if (!saved || saved.version !== input.version+1 || saved.name !== name
      || JSON.stringify(saved.companyIds) !== ids) throw new AudienceError('audience_version_conflict',409);
    return saved;
  }
  async validateMembers(orgId: string, ids: readonly string[]): Promise<string> {
    if (ids.length < 1 || ids.length > AUDIENCE_LIMIT || new Set(ids).size !== ids.length) throw new AudienceError('audience_invalid_input');
    const groups = await this.groups(orgId);
    const selected = ids.map((id) => groups.find((group) => group.members.some((row) => row.id === id)));
    if (selected.some((group) => !group)) throw new AudienceError('audience_members_unavailable',409);
    if (new Set(selected.map((group) => group!.key)).size !== ids.length) throw new AudienceError('audience_duplicate_contact',409);
    if (selected.some((group) => group!.blocked || group!.conflict)) throw new AudienceError('audience_contact_blocked_or_conflicted',409);
    return selected[0]!.members.find((row) => row.id === ids[0])!.search_id;
  }
  async resolveScope(orgId: string, scope: AudienceScope, ids: readonly string[]): Promise<string> {
    if (!validAudienceScope(scope)) throw new AudienceError('audience_invalid_input');
    const audience = await this.get(orgId,scope.audienceId);
    if (!audience) throw new AudienceError('audience_not_found',404);
    if (audience.version !== scope.audienceVersion) throw new AudienceError('audience_version_conflict',409);
    if (ids.some((id) => !audience.companyIds.includes(id))) throw new AudienceError('audience_members_unavailable',409);
    return this.validateMembers(orgId,ids);
  }
  async excludedRecipientIds(orgId:string,ids:readonly string[]):Promise<string[]> {
    const excluded=new Set((await this.groups(orgId)).filter((group)=>group.blocked || group.conflict || group.contacted)
      .flatMap((group)=>group.members.map((row)=>row.id)));
    return ids.filter((id)=>excluded.has(id));
  }
  async directory(orgId: string, filters: { q?: string; category?: string; city?: string; offset?: number; status?: string }, capabilities: LeadRadarApiCapabilities, now = new Date()): Promise<ContactDirectoryPage> {
    const offset = Math.max(0,Math.min(100_000,Math.trunc(filters.offset ?? 0)));
    const limit = 20;
    const q = normalizeCompanyKey((filters.q ?? '').slice(0,100));
    const category = (filters.category ?? '').slice(0,100);
    const city = (filters.city ?? '').slice(0,100);
    let matches = (await this.groups(orgId)).filter((group) => group.members.some((row) =>
      (!q || normalizeCompanyKey(`${row.name} ${row.city} ${group.keys.join(' ')}`).includes(q))
      && (!category || row.category === category) && (!city || row.city === city)));
    const requestedStatus = filters.status ?? 'all';
    if (!['all','verified','review','blocked','conflict','contacted'].includes(requestedStatus)) throw new AudienceError('audience_invalid_input');
    const baseStatus = (group: DirectoryGroup) => group.blocked ? 'blocked' : group.conflict ? 'conflict' : group.contacted ? 'contacted' : null;
    let globalVerified: Set<string> | null = null;
    if (requestedStatus==='verified' || requestedStatus==='review') {
      matches=matches.filter((group)=>baseStatus(group)===null);
      const potential=matches.filter((group)=>group.hasBusinessContact);
      if(potential.length>200)throw new AudienceError('directory_narrow_verification_filter',422);
      globalVerified=new Set<string>();
      for(let start=0;start<potential.length;start+=50){
        const candidates=await new LeadRadarStore(this.db).getLeadsByIds(orgId,potential.slice(start,start+50).map((group)=>group.companyId));
        const checked=await strictVerifiedDirectoryCompanyIds({db:this.db,orgId,now,
          companies:candidates.flatMap((lead)=>lead.telegramContact?[{companyId:lead.id,contact:lead.telegramContact}]:[])});
        checked.forEach((id)=>globalVerified!.add(id));
      }
      matches=matches.filter((group)=>globalVerified!.has(group.companyId)===(requestedStatus==='verified'));
    } else if(requestedStatus!=='all') matches=matches.filter((group)=>baseStatus(group)===requestedStatus);
    const rows = matches.slice(offset, offset+limit);
    const leads = await new LeadRadarStore(this.db).getLeadsByIds(orgId,rows.map((row) => row.companyId));
    const verified = globalVerified ?? await strictVerifiedDirectoryCompanyIds({ db:this.db,orgId,now,
      companies:leads.flatMap((lead) => lead.telegramContact ? [{companyId:lead.id,contact:lead.telegramContact}] : []) });
    const output: ContactDirectoryRow[] = [];
    for (const row of rows) {
      const lead = leads.find((item) => item.id === row.companyId);
      if (!lead) continue;
      const status = row.blocked ? 'blocked' : row.conflict ? 'conflict' : row.contacted ? 'contacted' : verified.has(lead.id) ? 'verified' : 'review';
      const redacted = redactLead(lead,capabilities,now.getTime());
      if (row.blocked) {
        redacted.phone=null; redacted.telegramUrl=null; redacted.telegramContact=null;
        redacted.contactCandidates=[]; redacted.decisionMakers=[]; redacted.evidence=[];
        redacted.genericEmail=null; redacted.suppressed=true;
      }
      output.push({key:row.companyId,lead:redacted,status,
        sources:row.members.slice(0,50).map((member) => ({ companyId:member.id,searchId:member.search_id,name:member.name,category:member.category,city:member.city })),
        occurrences:row.members.length,memberIds:row.members.map((member)=>member.id)});
    }
    return {rows:output,total:matches.length,offset,limit};
  }
}
