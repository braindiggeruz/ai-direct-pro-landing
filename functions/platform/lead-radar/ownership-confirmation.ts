import { safePublicHttpUrl } from './validation';
import { parseLeadRadarTelegramLocator } from '../../../src/shared/lead-radar-contacts';
import { extractCompanyPageFacts, readPublicPageHtml, readPublicWebsiteRobots, robotsAllows } from './sources';
import { firecrawlDigest } from './firecrawl-client';

export interface OwnershipConfirmationResult {
  confirmed: boolean;
  reason: 'confirmed' | 'already_confirmed' | 'company_not_found' | 'no_confirmable_endpoint' | 'do_not_contact'
    | 'candidate_required' | 'source_unavailable' | 'classification_unconfirmed' | 'source_changed';
  confirmedEndpoints: number;
}

/** Operator review applies to ONE endpoint. Refetch public evidence; never turn
 * stale/inferred sibling links into new facts simply because a button was hit.
 * This does not resolve Telegram, authorize contact, or send anything. */
export async function confirmCompanyWebsiteOwnership(input: {
  db: D1Database; orgId: string; companyId: string; candidateKey: string; operatorId: string; now?: Date;
  readPage?: typeof readPublicPageHtml; robots?: typeof readPublicWebsiteRobots;
}): Promise<OwnershipConfirmationResult> {
  const no = (reason: OwnershipConfirmationResult['reason']): OwnershipConfirmationResult => ({ confirmed:false,reason,confirmedEndpoints:0 });
  if (!input.candidateKey?.startsWith('telegram:')) return no('candidate_required');
  const target=parseLeadRadarTelegramLocator(input.candidateKey.slice('telegram:'.length));
  if (!target) return no('candidate_required');
  const targetKey=target.kind==='username' ? target.url.toLowerCase() : target.url;
  const sameTarget=(value:string)=>{
    const parsed=parseLeadRadarTelegramLocator(value);
    return parsed && (parsed.kind==='username' ? parsed.url.toLowerCase() : parsed.url)===targetKey;
  };
  const now=(input.now ?? new Date()).toISOString();
  const company=await input.db.prepare('SELECT id,website,suppressed,lifecycle FROM lead_radar_companies WHERE org_id=? AND id=?')
    .bind(input.orgId,input.companyId).first<{id:string;website:string|null;suppressed:number;lifecycle:string}>();
  if (!company) return no('company_not_found');
  if (company.suppressed || company.lifecycle==='do_not_contact') return no('do_not_contact');
  const site=safePublicHttpUrl(company.website);
  if (!site) return no('no_confirmable_endpoint');
  const rows=(await input.db.prepare(`SELECT field_path,value,source_url,source_type,classification,observed_at
    FROM lead_radar_evidence WHERE org_id=? AND company_id=? AND field_path LIKE 'web.telegram.%'
    ORDER BY observed_at DESC,id ASC`).bind(input.orgId,input.companyId)
    .all<{field_path:string;value:string;source_url:string;source_type:string;classification:string;observed_at:string}>()).results ?? [];
  const endpoint=rows.find(row=>['web.telegram.business','web.telegram.unknown'].includes(row.field_path)
    && ['fact','company_data'].includes(row.classification) && row.source_type==='company_website'
    && sameTarget(row.value) && safePublicHttpUrl(row.source_url)?.origin===site.origin);
  if (!endpoint) return no('no_confirmable_endpoint');
  const url=safePublicHttpUrl(endpoint.source_url)!;
  let html:string|null;
  try {
    const policy=await (input.robots ?? readPublicWebsiteRobots)(url);
    if (policy!==null && !robotsAllows(policy,url)) return no('source_unavailable');
    html=await (input.readPage ?? readPublicPageHtml)(url.toString(),{sameOrigin:true,allowRedirects:false});
  } catch { return no('source_unavailable'); }
  if (!html) return no('source_unavailable');
  const facts=extractCompanyPageFacts(url,html,true,now);
  const matches=facts.evidence.filter(e=>e.fieldPath.startsWith('web.telegram.') && sameTarget(e.value));
  if (!matches.length) return no('source_changed');
  if (matches.some(e=>['web.telegram.human','web.telegram.bot','web.telegram.channel','web.telegram.group'].includes(e.fieldPath))
    || !matches.some(e=>e.fieldPath==='web.telegram.business')) return no('classification_unconfirmed');
  const key=await firecrawlDigest(JSON.stringify(['operator-ownership:v2',input.orgId,input.companyId,targetKey,url.toString()]));
  const insert=`INSERT INTO lead_radar_evidence
    (id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    SELECT ?,?,?,?,?,?,'company_website',?,0.9,'fact'
    WHERE EXISTS(SELECT 1 FROM lead_radar_companies WHERE org_id=? AND id=? AND website=? AND suppressed=0 AND lifecycle<>'do_not_contact')
    ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,value=excluded.value
    WHERE excluded.observed_at>lead_radar_evidence.observed_at`;
  const statements=[
    input.db.prepare(insert).bind(`ev_ob_${key.slice(0,32)}`,input.orgId,input.companyId,'web.company_binding',
      `operator_confirmed:${input.operatorId.trim().slice(0,120)}`,site.toString(),now,input.orgId,input.companyId,company.website),
    input.db.prepare(insert).bind(`ev_oc_${key.slice(0,32)}`,input.orgId,input.companyId,'web.telegram.business',
      target.url,url.toString(),now,input.orgId,input.companyId,company.website),
  ];
  const result=await input.db.batch(statements);
  if (Number(result[1]?.meta.changes)===1) return {confirmed:true,reason:'confirmed',confirmedEndpoints:1};
  const existing=await input.db.prepare(`SELECT e.id FROM lead_radar_evidence e JOIN lead_radar_companies c ON c.id=e.company_id AND c.org_id=e.org_id
    WHERE e.org_id=? AND e.company_id=? AND e.id=? AND c.website=? AND c.suppressed=0 AND c.lifecycle<>'do_not_contact'`)
    .bind(input.orgId,input.companyId,`ev_oc_${key.slice(0,32)}`,company.website).first();
  return no(existing ? 'already_confirmed' : 'source_changed');
}
