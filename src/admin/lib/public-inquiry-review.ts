import type { LeadRadarLead } from '../../shared/lead-radar';
import { isValidCampaignRecipientAuthorization, type LeadRadarTelegramContactAuthorizationInput, type LeadRadarTelegramContactAuthorizationReadModel } from './lead-radar-campaign';

export interface PublicInquiryReviewRow { companyId:string;searchId:string;name:string;username:string|null;sources:string[];reason:string|null }
const AGE=30*86_400_000;
function sourceUrl(value:string):string|null {
  if(value.length<8 || value.length>200 || /\s/u.test(value)
    || [...value].some((character)=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))return null;
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash
    &&url.hostname.includes('.')&&!/^(?:\[|\d{1,3}(?:\.\d{1,3}){3}$)/u.test(url.hostname)
    &&!/(?:^|\.)(?:localhost|local|internal|test)$/iu.test(url.hostname)?url.toString():null;}catch{return null;}
}
function host(value:string|null):string|null {try{return new URL(value??'').hostname.toLowerCase().replace(/^www\./u,'');}catch{return null;}}
function usernameMatches(value:string,username:string):boolean {
  if(value.trim().toLowerCase()===username||value.trim().toLowerCase()==='@'+username)return true;
  try{const url=new URL(value);return url.protocol==='https:'&&['t.me','telegram.me'].includes(url.hostname)&&url.pathname.replace(/\/$/u,'').toLowerCase()==='/'+username&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}
}

/** Conservative presentation of already saved evidence. The server remains the
 * authority for identity, current resolution, permission, first-contact and DNC. */
export function publicInquiryReviewRows(leads:readonly LeadRadarLead[],now=Date.now()):PublicInquiryReviewRow[] {
  return leads.map((lead)=>{
    const contact=lead.telegramContact,username=contact?.username.toLowerCase()??null;
    let reason:string|null=null,sources:string[]=[];
    if(lead.suppressed||['do_not_contact','contacted','replied','qualified','meeting','won'].includes(lead.lifecycle))reason='Уже связывались или действует запрет';
    else if(!contact||contact.type!=='business'||!username||!/^[a-z][a-z0-9_]{4,31}$/u.test(username)
      ||!usernameMatches(contact.url,username)||!Number.isFinite(contact.confidence)||contact.confidence<.8||contact.confidence>1
      ||!Number.isFinite(Date.parse(contact.verifiedAt))||Date.parse(contact.verifiedAt)<now-AGE||Date.parse(contact.verifiedAt)>now+300_000
      ||contact.evidenceIds.length<1||contact.evidenceIds.length>10||new Set(contact.evidenceIds).size!==contact.evidenceIds.length)reason='Сначала подтвердите корпоративный Telegram';
    else {
      const evidence=lead.evidence.filter((item)=>contact.evidenceIds.includes(item.id)),websiteHost=host(lead.website);
      if(!websiteHost||evidence.length!==contact.evidenceIds.length)reason='Недостаточно доказательств опубликованного контакта';
      else for(const item of evidence) {
        const source=sourceUrl(item.sourceUrl),observed=Date.parse(item.observedAt);
        if(!source||host(source)!==websiteHost||item.sourceType!=='company_website'||item.classification!=='fact'
          ||!Number.isFinite(item.confidence)||item.confidence<.8||item.confidence>1||!/(?:^|\.)telegram(?:\.|$)/iu.test(item.fieldPath)
          ||!usernameMatches(item.value,username)||!Number.isFinite(observed)||observed<now-AGE||observed>now+300_000) {reason='Проверьте свежий источник на сайте компании';break;}
        sources.push(source);
      }
    }
    if(reason)sources=[];
    return {companyId:lead.id,searchId:lead.searchId,name:lead.name,username,sources:[...new Set(sources)].sort(),reason};
  });
}

export interface PublicInquiryReviewOperation {input:LeadRadarTelegramContactAuthorizationInput;key:string}
export async function runPublicInquiryReview(input:{operations:readonly PublicInquiryReviewOperation[];confirmed:readonly string[];
  authorize:(payload:LeadRadarTelegramContactAuthorizationInput,key:string)=>Promise<LeadRadarTelegramContactAuthorizationReadModel>;
  cancelled:()=>boolean;progress:(confirmed:string[])=>void;now?:()=>number}):Promise<{confirmed:string[];complete:boolean;failedCompanyId:string|null}> {
  const done=new Set(input.confirmed),ids=input.operations.map((operation)=>operation.input.leadId);
  if(!ids.length||ids.length>50||new Set(ids).size!==ids.length)throw new Error('public_inquiry_review_invalid');
  if(input.operations.some((operation)=>operation.input.contactBasis!=='public_business_inquiry'||!sourceUrl(operation.input.evidenceReference)))throw new Error('public_inquiry_review_invalid');
  for(const operation of input.operations) {
    if(input.cancelled())return {confirmed:[...done],complete:false,failedCompanyId:null};
    if(done.has(operation.input.leadId))continue;
    try {
      const result=await input.authorize(operation.input,operation.key);
      if(result.companyId!==operation.input.leadId||!isValidCampaignRecipientAuthorization(result,'public_business_inquiry',input.now?.()??Date.now()))throw new Error('public_inquiry_authorization_unconfirmed');
      done.add(result.companyId);input.progress([...done]);
    } catch {return {confirmed:[...done],complete:false,failedCompanyId:operation.input.leadId};}
  }
  return {confirmed:[...done],complete:!input.cancelled()&&ids.every((id)=>done.has(id)),failedCompanyId:null};
}
