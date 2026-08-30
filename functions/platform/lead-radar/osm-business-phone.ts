import type { LeadRadarEvidence } from '../../../src/shared/lead-radar';
import { extractLeadRadarPhones } from '../../../src/shared/lead-radar-contacts';
import type { TelegramContactResolution } from '../../../src/shared/lead-radar-contact-resolution';

interface Business { name?: string; address?: string | null; phone: string | null; country: string; evidence: LeadRadarEvidence[] }
const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

export function osmBusinessRecord(raw: string): { type: string; id: string; url: string } | null {
  try {
    const url=new URL(raw);
    const match=/^\/(node|way|relation)\/([1-9]\d{0,15})\/?$/.exec(url.pathname);
    if (!match || url.protocol!=='https:' || !['openstreetmap.org','www.openstreetmap.org'].includes(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash) return null;
    return {type:match[1],id:match[2],url:`https://www.openstreetmap.org/${match[1]}/${match[2]}`};
  } catch { return null; }
}

/** Public business association, NOT a Telegram receipt or outreach consent. */
export function osmBusinessPhoneProof(lead: Business, phone: LeadRadarEvidence): LeadRadarEvidence[] | null {
  const record=osmBusinessRecord(phone.sourceUrl);
  if (!record || !lead.name || phone.sourceType!=='openstreetmap' || phone.fieldPath!=='company_contacts.phone'
    || !['company_data','fact'].includes(phone.classification) || phone.confidence<0.7) return null;
  const current=new Set(extractLeadRadarPhones(lead.phone ?? '',lead.country).map(p=>p.e164));
  if (!extractLeadRadarPhones(phone.value,lead.country).some(p=>p.mobileLookupCandidate && current.has(p.e164))) return null;
  const facts=lead.evidence.filter(e=>e.sourceType==='openstreetmap' && e.classification==='fact'
    && osmBusinessRecord(e.sourceUrl)?.url===record.url);
  const name=facts.find(e=>e.fieldPath==='company.name' && e.confidence>=0.8 && normalized(e.value)===normalized(lead.name!));
  const category=facts.find(e=>e.fieldPath==='company.category' && e.confidence>=0.7 && e.value.trim()
    && !/^(residential|house|apartments|private|person|yes|no|unknown)$/i.test(e.value.trim()));
  const place=facts.find(e=>e.fieldPath==='locations.address' && e.confidence>=0.8 && lead.address
    && normalized(e.value)===normalized(lead.address)) ?? facts.find(e=> {
      if (e.fieldPath!=='locations.coordinates' || e.confidence<0.8) return false;
      const match=/^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(e.value);
      return Boolean(match && Math.abs(Number(match[1]))<=90 && Math.abs(Number(match[2]))<=180);
    });
  return name && category && place ? [phone,name,category,place] : null;
}

/** Legacy OSM observed_at contains the map edit date. Re-read that exact record
 * before refreshing it; never substitute the local clock for a source check. */
export async function refreshOsmBusinessPhone(input: {
  db: D1Database; orgId: string; companyId: string; lead: Business; candidateKey: string; now: string; fetch?: typeof fetch;
}): Promise<{ evidence: LeadRadarEvidence[]; failure?: TelegramContactResolution }> {
  const {lead,now}=input;
  const phone=lead.evidence.find(e=>extractLeadRadarPhones(e.fieldPath==='company_contacts.phone'?e.value:'',lead.country)
    .some(p=>`phone:${p.e164}`===input.candidateKey) && osmBusinessPhoneProof(lead,e));
  const proof=phone ? osmBusinessPhoneProof(lead,phone) : null;
  const unchanged={evidence:lead.evidence};
  if (!phone || !proof) return unchanged;
  const fresh=proof.every(e=>Date.parse(e.observedAt)>=Date.parse(now)-30*86400_000 && Date.parse(e.observedAt)<=Date.parse(now)+300_000);
  if (fresh) return unchanged;
  const failure=(reason: string, temporary=false, retry=900) => ({...unchanged,failure:{status:temporary?'limited' as const:'unresolved' as const,
    username:null,reason,retryAfterSeconds:temporary?retry:null}});
  const record=osmBusinessRecord(phone.sourceUrl)!;
  // Old discovery stored the map EDIT time as observed_at. Recover the actual
  // collection time only from an exact, successfully completed discovery ledger.
  // No current-clock stamping, imported rows, retries or merely recent searches.
  let collectedAt: string | null = null;
  let collectionJobId: string | null = null;
  try {
    const receipt=await input.db.prepare(`SELECT c.discovered_at AS collected_at,j.id AS job_id FROM lead_radar_companies c
      JOIN lead_radar_jobs j ON j.org_id=c.org_id AND j.search_id=c.search_id
      JOIN lead_radar_searches s ON s.org_id=c.org_id AND s.id=c.search_id
      WHERE c.org_id=? AND c.id=? AND c.suppressed=0 AND c.lifecycle<>'do_not_contact'
        AND j.stage='discovery' AND j.status='completed' AND j.attempt_count=1 AND j.last_error_code IS NULL
        AND j.completed_at=c.discovered_at AND j.created_at=s.created_at
        AND julianday(j.completed_at)>=julianday(j.created_at)
        AND julianday(j.completed_at)-julianday(j.created_at)<=15.0/1440
        AND NOT EXISTS (SELECT 1 FROM lead_radar_contact_checks ch WHERE ch.org_id=c.org_id
          AND ch.company_id=c.id AND ch.reason='business_listing_changed')
        AND c.name=? AND c.phone IS ? AND c.address IS ? LIMIT 1`)
      .bind(input.orgId,input.companyId,lead.name,lead.phone,lead.address??null).first<{collected_at:string;job_id:string}>();
    const at=Date.parse(receipt?.collected_at??'');
    if (Number.isFinite(at) && at>=Date.parse(now)-30*86400_000 && at<=Date.parse(now)
      && proof.every(e=>e.observedAt===phone.observedAt && Number.isFinite(Date.parse(e.observedAt)) && Date.parse(e.observedAt)<at)) {
      collectedAt=receipt!.collected_at;collectionJobId=receipt!.job_id;
    }
  } catch { /* An unavailable discovery ledger is not proof of collection time. */ }
  try {
    if (!collectedAt) {
    // Exact constant host/path; no redirects, credentials, arbitrary URLs or paid provider.
    const response=await (input.fetch ?? fetch)(`https://api.openstreetmap.org/api/0.6/${record.type}/${record.id}.json`,{
      redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json','User-Agent':'GPTBotLeadRadar/1.0 (+https://gptbot.uz)'},
    });
    if (response.status===404 || response.status===410) {await response.body?.cancel();return failure('business_listing_changed');}
    if (!response.ok || response.status!==200 || !response.headers.get('content-type')?.includes('application/json')) {
      const raw=response.headers.get('retry-after');
      const seconds=raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw)-Date.parse(now))/1000) : 900;
      const retry=Number.isFinite(seconds)?Math.min(2147483647,Math.max(900,seconds)):900;
      await response.body?.cancel(); return failure('business_listing_unavailable',true,retry);
    }
    const reader=response.body?.getReader(); if (!reader) return failure('business_listing_unavailable',true);
    let size=0;const parts:Uint8Array[]=[];
    for (;;) {const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
      if(size>262144){await reader.cancel();return failure('business_listing_unavailable',true);}parts.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const body=JSON.parse(new TextDecoder().decode(bytes)) as {elements?:Array<Record<string,unknown>>};
    if (!Array.isArray(body.elements) || body.elements.length!==1) return failure('business_listing_changed');
    const element=body.elements[0],tags=element.tags as Record<string,unknown> | undefined;
    if (element.type!==record.type || String(element.id)!==record.id || element.visible===false || !tags || typeof tags!=='object') return failure('business_listing_changed');
    if (Object.entries(tags).some(([key,value])=>/^(disused|abandoned|demolished|removed|razed|was)(:|$)/.test(key)
      && !['no','false','0'].includes(String(value).trim().toLowerCase()))) return failure('business_listing_changed');
    const names=Object.entries(tags).filter(([key])=>key==='name' || key.startsWith('name:') || key==='brand').map(([,v])=>String(v));
    const currentPhones=extractLeadRadarPhones(String(tags['contact:phone']??tags.phone??''),lead.country);
    const storedPhones=extractLeadRadarPhones(phone.value,lead.country);
    const category=String(tags['healthcare:speciality']??tags.healthcare??tags.amenity??tags.shop??tags.office??'');
    const place=proof[3];
    const coordinates=`${Number(element.lat).toFixed(6)},${Number(element.lon).toFixed(6)}`;
    const address=String(tags['addr:full']??[tags['addr:street'],tags['addr:housenumber'],tags['addr:district']].filter(Boolean).join(', '));
    if (!names.some(n=>normalized(n)===normalized(lead.name!)) || normalized(category)!==normalized(proof[2].value)
      || !currentPhones.some(p=>p.mobileLookupCandidate && `phone:${p.e164}`===input.candidateKey)
      || !storedPhones.every(old=>currentPhones.some(p=>p.e164===old.e164 && (!old.mobileLookupCandidate || p.mobileLookupCandidate)))
      || (place.fieldPath==='locations.coordinates' ? normalized(coordinates)!==normalized(place.value) : normalized(address)!==normalized(place.value))) return failure('business_listing_changed');
    }
    const observedAt=collectedAt??now;
    // Only exact previously read facts are refreshed. Concurrent edits, DNC and
    // changed company identity cannot inherit this check.
    const result=await input.db.prepare(`UPDATE lead_radar_evidence SET observed_at=?
      WHERE org_id=? AND company_id=? AND EXISTS (SELECT 1 FROM json_each(?) p
        WHERE json_extract(p.value,'$.id')=lead_radar_evidence.id AND json_extract(p.value,'$.value')=lead_radar_evidence.value
          AND json_extract(p.value,'$.observedAt')=lead_radar_evidence.observed_at AND json_extract(p.value,'$.sourceUrl')=lead_radar_evidence.source_url)
      AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM lead_radar_contact_checks ch
        WHERE ch.org_id=lead_radar_evidence.org_id AND ch.company_id=lead_radar_evidence.company_id AND ch.reason='business_listing_changed'))
      AND EXISTS (SELECT 1 FROM lead_radar_companies c WHERE c.id=? AND c.org_id=? AND c.suppressed=0 AND c.lifecycle<>'do_not_contact'
        AND c.name=? AND c.phone IS ? AND c.address IS ? AND (? IS NULL OR (c.discovered_at=?
          AND EXISTS(SELECT 1 FROM lead_radar_jobs j WHERE j.id=? AND j.org_id=c.org_id AND j.search_id=c.search_id
            AND j.status='completed' AND j.stage='discovery' AND j.completed_at=c.discovered_at AND j.attempt_count=1 AND j.last_error_code IS NULL))))`)
      .bind(observedAt,input.orgId,input.companyId,JSON.stringify(proof),collectedAt,input.companyId,input.orgId,lead.name,lead.phone,lead.address??null,collectedAt,collectedAt,collectionJobId).run();
    if (Number(result.meta.changes)!==proof.length) return failure('business_listing_changed');
    const ids=new Set(proof.map(e=>e.id));
    return {evidence:lead.evidence.map(e=>ids.has(e.id)?{...e,observedAt}:e)};
  } catch {return failure('business_listing_unavailable',true);}
}
