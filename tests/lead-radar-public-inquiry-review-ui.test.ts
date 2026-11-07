import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicInquiryReviewRows, runPublicInquiryReview, type PublicInquiryReviewOperation } from '../src/admin/lib/public-inquiry-review';
import type { LeadRadarLead } from '../src/shared/lead-radar';
const NOW=Date.parse('2026-11-07T12:00:00.000Z');
function lead(id='one'):LeadRadarLead {
  return {id,searchId:'search_'+id,name:'Clinic '+id,website:'https://clinic.uz',lifecycle:'new',suppressed:false,
    telegramContact:{url:'https://t.me/clinic_public',username:'clinic_public',type:'business',confidence:.95,verifiedAt:new Date(NOW).toISOString(),evidenceIds:['evidence_'+id],messageable:false,reason:'verified'},
    evidence:[{id:'evidence_'+id,fieldPath:'web.telegram.business',value:'https://t.me/clinic_public',sourceUrl:'https://clinic.uz/contacts',sourceType:'company_website',observedAt:new Date(NOW).toISOString(),confidence:.95,classification:'fact'}],
  } as LeadRadarLead;
}
const operations:PublicInquiryReviewOperation[]=['one','two','three'].map((id)=>({key:'stable-review-'+id,input:{searchId:'search_'+id,leadId:id,contactBasis:'public_business_inquiry',evidenceReference:'https://clinic.uz/contacts',expiresAt:new Date(NOW+7*86_400_000).toISOString()}}));
const approved=(id:string)=>({companyId:id,basis:'public_business_inquiry' as const,reviewer:'owner_verified' as const,evidenceVersion:'public-business-inquiry-v1',verifiedAt:new Date(NOW).toISOString(),expiresAt:new Date(NOW+7*86_400_000).toISOString()});

test('batch review presents only exact fresh evidence for the same public corporate Telegram',()=>{
  const item=lead();assert.deepEqual(publicInquiryReviewRows([item],NOW)[0].sources,['https://clinic.uz/contacts']);
  for(const changed of [
    {...item,suppressed:true},{...item,lifecycle:'contacted' as const},
    {...item,telegramContact:{...item.telegramContact!,type:'human' as const}},
    {...item,telegramContact:{...item.telegramContact!,confidence:NaN}},
    {...item,telegramContact:{...item.telegramContact!,verifiedAt:new Date(NOW-31*86_400_000).toISOString()}},
    {...item,evidence:[{...item.evidence[0],sourceUrl:'https://other.uz/contacts'}]},
    {...item,evidence:[{...item.evidence[0],value:'https://t.me/some_other_company'}]},
    {...item,evidence:[{...item.evidence[0],classification:'model_inference' as const}]},
    {...item,evidence:[{...item.evidence[0],observedAt:new Date(NOW-31*86_400_000).toISOString()}]},
  ]){const row=publicInquiryReviewRows([changed],NOW)[0];assert.equal(row.sources.length,0);assert.ok(row.reason);}
});

test('batch requires every referenced source; unsafe or incomplete sources never get prefilled',()=>{
  const item=lead();
  for(const sourceUrl of ['http://clinic.uz/contacts','https://clinic.uz/contacts#injected','https://u:p@clinic.uz/contacts','https://127.0.0.1/contacts'])assert.equal(publicInquiryReviewRows([{...item,evidence:[{...item.evidence[0],sourceUrl}]}],NOW)[0].sources.length,0);
  assert.equal(publicInquiryReviewRows([{...item,telegramContact:{...item.telegramContact!,evidenceIds:['evidence_one','missing']}}],NOW)[0].sources.length,0);
});

test('one batch confirmation uses sequential writes, stops at uncertainty and resumes exact stable keys',async()=>{
  const calls:string[]=[],progress:string[][]=[];let failure=true,active=0,maxActive=0;
  const authorize=async(payload:PublicInquiryReviewOperation['input'],key:string)=>{active++;maxActive=Math.max(active,maxActive);calls.push(key);await Promise.resolve();active--;if(payload.leadId==='two'&&failure){failure=false;throw new Error('lost response');}return approved(payload.leadId);};
  const first=await runPublicInquiryReview({operations,confirmed:[],authorize,cancelled:()=>false,progress:(ids)=>progress.push(ids),now:()=>NOW});
  assert.deepEqual(first,{confirmed:['one'],complete:false,failedCompanyId:'two'});assert.deepEqual(calls,['stable-review-one','stable-review-two']);assert.equal(maxActive,1);
  const next=await runPublicInquiryReview({operations,confirmed:first.confirmed,authorize,cancelled:()=>false,progress:(ids)=>progress.push(ids),now:()=>NOW});
  assert.deepEqual(next,{confirmed:['one','two','three'],complete:true,failedCompanyId:null});
  assert.deepEqual(calls,['stable-review-one','stable-review-two','stable-review-two','stable-review-three']);
  assert.equal(progress.at(-1)?.length,3);
});

test('changed audience cancellation and wrong authorization never mark whole batch ready',async()=>{
  let count=0;
  const cancelled=await runPublicInquiryReview({operations,confirmed:[],authorize:async(payload)=>{count++;return approved(payload.leadId);},cancelled:()=>count>0,progress:()=>{},now:()=>NOW});
  assert.equal(count,1);assert.equal(cancelled.complete,false);
  const invalid=await runPublicInquiryReview({operations,confirmed:[],authorize:async()=>({...approved('one'),evidenceVersion:'campaign-contact-eligibility-v1'}),cancelled:()=>false,progress:()=>{},now:()=>NOW});
  assert.equal(invalid.complete,false);assert.deepEqual(invalid.confirmed,[]);assert.equal(invalid.failedCompanyId,'one');
  await assert.rejects(runPublicInquiryReview({operations:[...operations,operations[0]],confirmed:[],authorize:async()=>approved('one'),cancelled:()=>false,progress:()=>{}}),/invalid/);
});
