import type { LeadRadarEvidence, LeadRadarTelegramContact } from '../../../src/shared/lead-radar';
import type { LeadRadarContactCandidate } from '../../../src/shared/lead-radar-contacts';
import { assessLeadRadarPhone, parseLeadRadarTelegramLocator } from '../../../src/shared/lead-radar-contacts';
import { normalizeTelegramContactResolution, validTelegramContactResolution, type TelegramContactResolution, type TelegramContactTarget } from '../../../src/shared/lead-radar-contact-resolution';
import { contactCandidatesForLead } from './contact-candidates';
import { contactDiscoverySchemaReady } from './contact-discovery-store';
import { loadContactEnrichments } from './contact-source-store';
import type { LeadRadarContactEnrichment } from '../../../src/shared/lead-radar-contact-sources';
import { publicContactSourceUrl } from './public-contact-discovery';
import { isTelegramPeerRef } from '../../../src/shared/lead-radar-telegram-endpoint';
import { osmBusinessRecord, refreshOsmBusinessPhone } from './osm-business-phone';

const RESOLVED_REASON = 'bridge_resolved_corporate';
interface CompanyRow { id: string; search_id: string; name:string; city:string; address:string|null; country: string; phone: string | null; suppressed: number; lifecycle: string; website: string | null }
interface EvidenceRow { id: string; company_id: string; field_path: string; value: string; source_url: string; source_type: LeadRadarEvidence['sourceType']; observed_at: string; confidence: number; classification: LeadRadarEvidence['classification'] }
interface CheckRow { id: string; company_id: string; candidate_digest: string; proof_digest: string; account_digest: string; status: string; result_json: string | null; created_at: string; expires_at: string; checked_at: string | null }
async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function evidenceFromRow(row: EvidenceRow): LeadRadarEvidence {
  return { id: row.id, fieldPath: row.field_path, value: row.value, sourceUrl: row.source_url, sourceType: row.source_type, observedAt: row.observed_at, confidence: row.confidence, classification: row.classification };
}
function candidates(company: CompanyRow, evidence: EvidenceRow[], now: string, enrichment?: LeadRadarContactEnrichment): LeadRadarContactCandidate[] {
  if (company.suppressed || company.lifecycle === 'do_not_contact') return [];
  const newest = Date.parse(now) + 5 * 60_000, oldest = Date.parse(now) - 30 * 86400_000;
  const websiteCandidates=contactCandidatesForLead({ name:company.name,address:company.address,phone: company.phone, country: company.country, suppressed: false, telegramContact: null,
    evidence: evidence.filter((e) => e.company_id === company.id && Date.parse(e.observed_at) >= oldest && Date.parse(e.observed_at) <= newest).map(evidenceFromRow),
  }).filter((c) => {
    if (c.kind==='phone' && c.lookupEligible && c.ownership==='company' && c.sourceUrl && osmBusinessRecord(c.sourceUrl)) return true;
    if (c.lookupEligible && c.ownership==='unconfirmed' && c.kind==='telegram'
      && parseLeadRadarTelegramLocator(c.value)?.kind==='username') return true; // Type-only, never ownership approval.
    try { return c.lookupEligible && c.ownership === 'company' && company.website && c.sourceUrl
      && new URL(company.website).origin === new URL(c.sourceUrl).origin; } catch { return false; }
  });
  const publicCandidates=(enrichment?.sources ?? []).flatMap((source) => source.candidates.filter((c) =>
    (c.ownership==='company' || c.ownership==='unconfirmed' && c.kind==='telegram' && parseLeadRadarTelegramLocator(c.value)?.kind==='username')
    && c.lookupEligible && c.sourceUrl===source.url
    && c.evidenceIds.includes(source.id) && publicContactSourceUrl(source.url)
    && (c.kind==='phone' ? assessLeadRadarPhone(c.value).mobileLookupCandidate : c.kind==='telegram' && parseLeadRadarTelegramLocator(c.value))
    && Date.parse(source.observedAt)>=oldest && Date.parse(source.observedAt)<=newest));
  const unique=new Map<string,LeadRadarContactCandidate>();
  for (const c of [...websiteCandidates,...publicCandidates]) if (!unique.has(c.key) || c.ownership==='company') unique.set(c.key,c);
  return [...unique.values()].sort((a,b) => Number(b.ownership==='company')-Number(a.ownership==='company') || Number(b.kind==='telegram')-Number(a.kind==='telegram')).slice(0,40);
}
async function proof(candidate: LeadRadarContactCandidate, evidence: EvidenceRow[], enrichment?: LeadRadarContactEnrichment): Promise<string> {
  // Include first-party binding as well as contact evidence: a site reassignment
  // or changed phone invalidates the check without modifying historical records.
  const sourceProof=(enrichment?.sources ?? []).filter((s) => candidate.evidenceIds.includes(s.id));
  const base=[candidate.key, candidate.sourceUrl, evidence.filter((e) => candidate.evidenceIds.includes(e.id)
    || ['web.website','web.company_binding'].includes(e.field_path)).sort((a,b) => a.id.localeCompare(b.id))];
  // Preserve existing first-party hashes. New/type-only proofs cannot collide
  // with the historical corporate proof format.
  return hash(sourceProof.length ? [...base,'public-source:v1',sourceProof] : candidate.ownership==='company' ? base : [...base,'type-only:v1']);
}
function parseResult(row: CheckRow): TelegramContactResolution | null {
  try { const result: unknown = JSON.parse(row.result_json ?? 'null'); return validTelegramContactResolution(result) ? normalizeTelegramContactResolution(result) : null; } catch { return null; }
}
export async function countResolvedCorporateContacts(db: D1Database, orgId: string, searchId: string, now: string): Promise<number> {
  // Research-only installations may not have the optional Telegram account schema.
  let account: { id: string } | null;
  try { account = await db.prepare("SELECT id FROM lead_radar_tg_user_accounts WHERE org_id=? AND status='connected' LIMIT 1").bind(orgId).first<{id:string}>(); }
  catch { return 0; }
  if (!account) return 0;
  const row = await db.prepare(`SELECT COUNT(DISTINCT COALESCE(json_extract(c.result_json,'$.peerRef'),lower(json_extract(c.result_json,'$.username')))) AS count
    FROM lead_radar_contact_checks c JOIN lead_radar_companies p ON p.org_id=c.org_id AND p.id=c.company_id
    WHERE c.org_id=? AND c.search_id=? AND c.status='resolved' AND c.expires_at>? AND c.account_digest=?
      AND c.result_json IS NOT NULL AND p.suppressed=0 AND p.lifecycle<>'do_not_contact'
      AND json_extract(p.telegram_contact_json,'$.reason')='bridge_resolved_corporate'
      AND COALESCE(json_extract(p.telegram_contact_json,'$.peerRef'),lower(json_extract(p.telegram_contact_json,'$.username')))=COALESCE(json_extract(c.result_json,'$.peerRef'),lower(json_extract(c.result_json,'$.username')))`)
    .bind(orgId,searchId,now,await hash(account.id)).first<{count:number}>();
  return Number(row?.count ?? 0);
}
export async function checkCorporateTelegramContact(input: {
  db: D1Database; orgId: string; searchId: string; companyId: string; candidateKey: string; accountId: string; now?: string;
  resolve: (target: TelegramContactTarget, operationId: string) => Promise<TelegramContactResolution>;
  fetch?: typeof fetch;
}): Promise<TelegramContactResolution> {
  const { db, orgId, companyId } = input;
  const now = input.now ?? new Date().toISOString();
  const reject = (reason: string): TelegramContactResolution => ({ status: 'failed', username: null, reason, retryAfterSeconds: null });
  if (!await contactDiscoverySchemaReady(db)) return reject('contact_schema_unavailable');
  const company = await db.prepare('SELECT id,search_id,name,city,address,country,phone,suppressed,lifecycle,website FROM lead_radar_companies WHERE org_id=? AND id=? AND search_id=?')
    .bind(orgId,companyId,input.searchId).first<CompanyRow>();
  if (!company) return reject('contact_not_found');
  if (company.suppressed === 1 || company.lifecycle === 'do_not_contact') return reject('do_not_contact');
  let evidence = (await db.prepare('SELECT id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification FROM lead_radar_evidence WHERE org_id=? AND company_id=?').bind(orgId,companyId).all<EvidenceRow>()).results ?? [];
  const enrichment=(await loadContactEnrichments(db,orgId,[company],now)).get(company.id);
  let candidate = candidates(company,evidence,now,enrichment).find((c) => c.key === input.candidateKey);
  if (!candidate) {
    const old=contactCandidatesForLead({...company,telegramContact:null,suppressed:false,evidence:evidence.map(evidenceFromRow)})
      .find(c=>c.key===input.candidateKey && c.kind==='phone' && c.lookupEligible && c.ownership==='company' && c.sourceUrl && osmBusinessRecord(c.sourceUrl));
    if (!old) return reject('corporate_source_required');
    const [candidateDigest,proofDigest,accountDigest]=await Promise.all([hash(old.key),proof(old,evidence,enrichment),hash(input.accountId)]);
    const sourceId=`lrcc_${(await hash([orgId,companyId,candidateDigest,proofDigest,accountDigest])).slice(0,32)}`;
    const cached=await db.prepare('SELECT * FROM lead_radar_contact_checks WHERE org_id=? AND id=? AND expires_at>?').bind(orgId,sourceId,now).first<CheckRow>();
    const cachedResult=cached && parseResult(cached);
    if (cachedResult?.reason.startsWith('business_listing_')) return cachedResult.status==='limited'
      ? {...cachedResult,retryAfterSeconds:Math.max(1,Math.ceil((Date.parse(cached!.expires_at)-Date.parse(now))/1000))} : cachedResult;
    const allowed=await db.prepare(`SELECT id FROM lead_radar_tg_user_accounts WHERE org_id=? AND id=? AND status='connected'
      AND (SELECT COALESCE(SUM(attempts_today),0) FROM lead_radar_contact_checks WHERE org_id=? AND attempt_day=?)<200`)
      .bind(orgId,input.accountId,orgId,now.slice(0,10)).first<{id:string}>();
    if (!allowed) return reject('daily_check_limit');
    const refreshed=await refreshOsmBusinessPhone({db,orgId,companyId,lead:{...company,evidence:evidence.map(evidenceFromRow)},
      candidateKey:input.candidateKey,now,fetch:input.fetch});
    if (refreshed.failure) {
      // Source failures are negative checks, never Telegram receipts. Persist
      // their expiry so reloads and queue redelivery cannot bypass Retry-After.
      const failure=refreshed.failure;
      const expiry=new Date(Date.parse(now)+(failure.retryAfterSeconds??86400)*1000).toISOString();
      await db.prepare(`INSERT INTO lead_radar_contact_checks
        (id,org_id,search_id,company_id,candidate_digest,proof_digest,account_digest,status,result_json,reason,attempt_day,created_at,checked_at,expires_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM lead_radar_companies WHERE org_id=? AND id=? AND suppressed=0 AND lifecycle<>'do_not_contact')
          AND EXISTS (SELECT 1 FROM lead_radar_tg_user_accounts WHERE org_id=? AND id=? AND status='connected')
          AND (SELECT COALESCE(SUM(attempts_today),0) FROM lead_radar_contact_checks WHERE org_id=? AND attempt_day=?)<200
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,result_json=excluded.result_json,reason=excluded.reason,
          checked_at=excluded.checked_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at,
          attempt_day=excluded.attempt_day,attempts_today=CASE WHEN lead_radar_contact_checks.attempt_day=excluded.attempt_day
            THEN min(200,lead_radar_contact_checks.attempts_today+1) ELSE 1 END
        WHERE lead_radar_contact_checks.expires_at<=excluded.updated_at`)
        .bind(sourceId,orgId,input.searchId,companyId,candidateDigest,proofDigest,accountDigest,failure.status,JSON.stringify(failure),failure.reason,
          now.slice(0,10),now,now,expiry,now,orgId,companyId,orgId,input.accountId,orgId,now.slice(0,10)).run();
      return failure;
    }
    evidence=evidence.map(e=>({...e,observed_at:refreshed.evidence.find(item=>item.id===e.id)?.observedAt??e.observed_at}));
    candidate=candidates(company,evidence,now,enrichment).find(c=>c.key===input.candidateKey);
  }
  if (!candidate) return reject('corporate_source_required');
  if (!candidate.lookupEligible) return reject('corporate_source_required');
  const target = candidate.kind === 'phone' ? { kind: 'phone' as const, value: candidate.value } : parseLeadRadarTelegramLocator(candidate.value);
  if (!target) return reject('invalid_target');
  const [candidateDigest, proofDigest, accountDigest] = await Promise.all([hash(candidate.key),proof(candidate,evidence,enrichment),hash(input.accountId)]);
  const id = `lrcc_${(await hash([orgId,companyId,candidateDigest,proofDigest,accountDigest])).slice(0,32)}`;
  // A stable row/operation survives tab closure and retries. Negative checks are
  // cached too. Expiry permits a fresh generation, never replay of a sent effect.
  await db.prepare(`INSERT INTO lead_radar_contact_checks
    (id,org_id,search_id,company_id,candidate_digest,proof_digest,account_digest,status,attempt_day,created_at,expires_at,updated_at)
    SELECT ?,?,?,?,?,?,?,'pending',?,?,?,? WHERE EXISTS (SELECT 1 FROM lead_radar_tg_user_accounts WHERE org_id=? AND id=? AND status='connected')
      AND (SELECT COALESCE(SUM(attempts_today),0) FROM lead_radar_contact_checks WHERE org_id=? AND attempt_day=?)<200
    ON CONFLICT(id) DO UPDATE SET status='pending',result_json=NULL,checked_at=NULL,created_at=excluded.created_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at,
      attempt_day=excluded.attempt_day,attempts_today=CASE WHEN lead_radar_contact_checks.attempt_day=excluded.attempt_day THEN lead_radar_contact_checks.attempts_today+1 ELSE 1 END
    WHERE lead_radar_contact_checks.expires_at<=excluded.created_at`).bind(id,orgId,input.searchId,companyId,candidateDigest,proofDigest,accountDigest,
      now.slice(0,10),now,new Date(Date.parse(now)+86400_000).toISOString(),now,orgId,input.accountId,orgId,now.slice(0,10)).run();
  const row = await db.prepare('SELECT * FROM lead_radar_contact_checks WHERE org_id=? AND id=?').bind(orgId,id).first<CheckRow>();
  if (!row || row.expires_at <= now) return reject('daily_check_limit');
  const previous = parseResult(row);
  let result = previous && previous.status !== 'pending' ? previous : Date.parse(now) - Date.parse(row.created_at) > 3 * 60_000
    ? { status: 'unresolved' as const, username: null, reason: 'check_expired', retryAfterSeconds: null }
    : await input.resolve({ kind: target.kind, value: target.value }, `contact:${id}:${Date.parse(row.created_at)}`);
  if (!validTelegramContactResolution(result)) return reject('invalid_bridge_response');
  result = normalizeTelegramContactResolution(result);
  if (result.status==='resolved' && candidate.ownership!=='company') result={...result,reason:'username_exists_ownership_unconfirmed'};
  const ttl = result.status === 'limited' ? Math.max(3,result.retryAfterSeconds ?? 60) * 1000
    : result.status === 'failed' || ['lookup_unconfirmed','telegram_timeout','check_expired'].includes(result.reason) ? 60_000 : 86400_000;
  const updated = await db.prepare(`UPDATE lead_radar_contact_checks SET status=?,result_json=?,reason=?,checked_at=?,updated_at=?,expires_at=?
    WHERE org_id=? AND id=? AND status='pending' AND created_at=? RETURNING *`).bind(result.status,JSON.stringify(result),result.reason,
      result.status === 'pending' ? null : now,now,result.status === 'pending' ? row.expires_at : new Date(Date.parse(now)+ttl).toISOString(),orgId,id,row.created_at).first<CheckRow>();
  // A late callback cannot replace a terminal result or a new generation.
  const settled = updated ?? (previous && previous.status !== 'pending' ? row
    : await db.prepare('SELECT * FROM lead_radar_contact_checks WHERE org_id=? AND id=?').bind(orgId,id).first<CheckRow>());
  const authoritative = settled && settled.created_at === row.created_at && settled.expires_at > now ? parseResult(settled) : null;
  if (!authoritative) return reject('check_superseded');
  result = authoritative;
  if (result.status === 'resolved' && (result.username || isTelegramPeerRef(result.peerRef))) {
    const corporate=candidate.ownership==='company';
    const contact: LeadRadarTelegramContact = { url: result.username ? `https://t.me/${result.username}` : '', username: result.username ?? '',
      ...(result.peerRef ? {peerRef:result.peerRef} : {}), ...(corporate ? {sourceKey:candidate.key} : {}), type: corporate ? 'business' : 'unknown',
      reason: corporate ? RESOLVED_REASON : 'bridge_resolved_unconfirmed', confidence: corporate ? 0.9 : 0.5, verifiedAt: now, evidenceIds: candidate.evidenceIds, messageable: false };
    // No consent/authorization is created. Every sender check revalidates the
    // stored result, account, current source proof and DNC before using this link.
    await db.prepare(`UPDATE lead_radar_companies SET telegram_url=?,telegram_contact_json=?,updated_at=?
      WHERE org_id=? AND id=? AND suppressed=0 AND lifecycle<>'do_not_contact'
      AND (?=1 OR COALESCE(json_extract(telegram_contact_json,'$.reason'),'')<>'bridge_resolved_corporate')
      AND EXISTS (SELECT 1 FROM lead_radar_tg_user_accounts WHERE org_id=? AND id=? AND status='connected')
      AND EXISTS (SELECT 1 FROM lead_radar_contact_checks WHERE org_id=? AND id=? AND status='resolved'
        AND result_json=? AND created_at=? AND expires_at>?)`)
      .bind(contact.url,JSON.stringify(contact),now,orgId,companyId,corporate ? 1 : 0,orgId,input.accountId,
        orgId,id,JSON.stringify(result),row.created_at,now).run();
  } else if (result.status==='unsupported' && result.reason==='not_regular_user' && target.kind==='username') {
    // Older OSM candidates were all tagged unknown, including bots. Hide the
    // exact rejected endpoint, never a different successful contact on the lead.
    await db.prepare(`UPDATE lead_radar_companies SET telegram_contact_json=json_set(telegram_contact_json,'$.reason','bridge_not_regular_user','$.messageable',json('false')),updated_at=?
      WHERE org_id=? AND id=? AND lower(json_extract(telegram_contact_json,'$.username'))=? AND suppressed=0`)
      .bind(now,orgId,companyId,target.value.toLowerCase()).run();
  }
  return result;
}

/** Bounded shared verifier used by single and batch sender guards, not UI trust. */
export async function verifiedResolvedCorporateCompanies(input: {
  db: D1Database; orgId: string; companies: ReadonlyArray<{ companyId: string; contact: LeadRadarTelegramContact }>; now: Date;
}): Promise<Set<string>> {
  const ids = input.companies.filter((c) => c.contact.reason === RESOLVED_REASON).map((c) => c.companyId).slice(0,50);
  const valid = new Set<string>();
  if (!ids.length || !await contactDiscoverySchemaReady(input.db)) return valid;
  const marks = ids.map(() => '?').join(',');
  const account = await input.db.prepare("SELECT id FROM lead_radar_tg_user_accounts WHERE org_id=? AND status='connected' LIMIT 1").bind(input.orgId).first<{id:string}>();
  if (!account) return valid;
  const accountDigest = await hash(account.id), now = input.now.toISOString();
  const checks = (await input.db.prepare(`SELECT * FROM lead_radar_contact_checks WHERE org_id=? AND company_id IN (${marks}) AND status='resolved' AND expires_at>? AND account_digest=?`).bind(input.orgId,...ids,now,accountDigest).all<CheckRow>()).results ?? [];
  if (!checks.length) return valid;
  const companies = (await input.db.prepare(`SELECT id,search_id,name,city,address,country,phone,suppressed,lifecycle,website FROM lead_radar_companies WHERE org_id=? AND id IN (${marks})`).bind(input.orgId,...ids).all<CompanyRow>()).results ?? [];
  const evidence = (await input.db.prepare(`SELECT id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification FROM lead_radar_evidence WHERE org_id=? AND company_id IN (${marks})`).bind(input.orgId,...ids).all<EvidenceRow>()).results ?? [];
  const enrichments=await loadContactEnrichments(input.db,input.orgId,companies,now);
  for (const company of companies) {
    const expected = input.companies.find((c) => c.companyId === company.id)!.contact;
    const companyEvidence = evidence.filter((e) => e.company_id === company.id);
    const enrichment=enrichments.get(company.id);
    for (const candidate of candidates(company,companyEvidence,now,enrichment).filter((c) => c.ownership==='company')) {
      const [candidateDigest,proofDigest] = await Promise.all([hash(candidate.key),proof(candidate,companyEvidence,enrichment)]);
      if (checks.some((row) => row.company_id === company.id && row.candidate_digest === candidateDigest && row.proof_digest === proofDigest
        && (expected.peerRef ? isTelegramPeerRef(expected.peerRef) && parseResult(row)?.peerRef === expected.peerRef
          : Boolean(expected.username) && parseResult(row)?.username?.toLowerCase() === expected.username.toLowerCase()))) valid.add(company.id);
    }
  }
  return valid;
}

/** Durable progress is derived from proof-bound checks, not an in-memory slice.
 * One new check per delivery keeps even large candidate sets inside D1 limits. */
export async function nextTelegramContactCandidate(input: {db:D1Database;orgId:string;companyId:string;accountId:string;now:string}): Promise<{candidateKey?:string;pending:boolean;retryAfterSeconds?:number}> {
  const {db,orgId,companyId,now}=input;
  if (!await contactDiscoverySchemaReady(db)) return {pending:false};
  const company=await db.prepare('SELECT id,search_id,name,city,address,country,phone,suppressed,lifecycle,website FROM lead_radar_companies WHERE org_id=? AND id=?').bind(orgId,companyId).first<CompanyRow>();
  if (!company) return {pending:false};
  const evidence=(await db.prepare('SELECT id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification FROM lead_radar_evidence WHERE org_id=? AND company_id=?').bind(orgId,companyId).all<EvidenceRow>()).results ?? [];
  const enrichment=(await loadContactEnrichments(db,orgId,[company],now)).get(companyId);
  const checks=(await db.prepare('SELECT * FROM lead_radar_contact_checks WHERE org_id=? AND company_id=? AND account_digest=? AND expires_at>?')
    .bind(orgId,companyId,await hash(input.accountId),now).all<CheckRow>()).results ?? [];
  let retryAfterSeconds:number|undefined;
  const current=candidates(company,evidence,now,enrichment);
  // A legacy map edit timestamp must not prevent the checker from re-reading
  // that business record. Only the check path refreshes it; sender guards never do.
  const refreshable=contactCandidatesForLead({...company,telegramContact:null,suppressed:false,evidence:evidence.map(evidenceFromRow)})
    .filter(c=>!company.suppressed && company.lifecycle!=='do_not_contact' && c.kind==='phone' && c.ownership==='company'
      && c.lookupEligible && c.sourceUrl && osmBusinessRecord(c.sourceUrl) && !current.some(v=>v.key===c.key));
  for (const candidate of [...current,...refreshable]) {
    const [candidateDigest,proofDigest]=await Promise.all([hash(candidate.key),proof(candidate,evidence,enrichment)]);
    const row=checks.find((r) => r.candidate_digest===candidateDigest && r.proof_digest===proofDigest);
    const result=row ? parseResult(row) : null;
    if (!result || result.status==='pending') return {candidateKey:candidate.key,pending:true};
    if (result.status==='resolved' && candidate.ownership==='company') return {pending:false};
    if (result.status==='limited') return {pending:true,retryAfterSeconds:Math.max(3,Math.ceil((Date.parse(row!.expires_at)-Date.parse(now))/1000))};
    if (result.status==='failed') retryAfterSeconds=Math.max(retryAfterSeconds ?? 0,Math.ceil((Date.parse(row!.expires_at)-Date.parse(now))/1000));
  }
  return retryAfterSeconds===undefined ? {pending:false} : {pending:true,retryAfterSeconds};
}
