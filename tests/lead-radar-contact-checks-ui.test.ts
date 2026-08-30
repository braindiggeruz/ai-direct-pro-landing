import assert from 'node:assert/strict';
import test from 'node:test';
import { contactCheckExplanation, emptyContactCheckProgress, restartContactCheckProgress, runSelectedContactChecks, selectedContactCheckJobs } from '../src/admin/lib/campaign-contact-checks';
import type { LeadRadarLead } from '../src/shared/lead-radar';
import { contactCandidatesForLead } from '../functions/platform/lead-radar/contact-candidates';

test('mapped public mobile enters the same UI checker without a website or Telegram username',()=>{
  const lead={id:'mapped',searchId:'search',name:'Example Clinic',country:'UZ',phone:'+998901234567',address:null,
    suppressed:false,lifecycle:'new',telegramContact:null,evidence:[
      ['name','company.name','Example Clinic',0.82,'fact'],['category','company.category','dentist',0.78,'fact'],
      ['place','locations.coordinates','41.300000,69.200000',0.9,'fact'],['phone','company_contacts.phone','+998901234567',0.74,'company_data'],
    ].map(([id,fieldPath,value,confidence,classification])=>({id,fieldPath,value,confidence,classification,
      sourceUrl:'https://www.openstreetmap.org/node/123456',sourceType:'openstreetmap',observedAt:'2026-03-07T19:11:44Z'}))} as LeadRadarLead;
  lead.contactCandidates=contactCandidatesForLead(lead);
  assert.deepEqual(selectedContactCheckJobs([lead]),[{companyId:'mapped',searchId:'search',candidateKeys:['phone:+998901234567'],sourceByCandidate:{'phone:+998901234567':'openstreetmap'}}]);
  assert.match(contactCheckExplanation(lead,emptyContactCheckProgress())!,/ещё не завершена/);
  assert.match(contactCheckExplanation(lead,{...emptyContactCheckProgress(),completed:['mapped'],outcomes:{mapped:{reason:'privacy_or_missing',status:'unresolved'}}})!,/приватности/);
});

test('UI contact checker continues after an ownership-unconfirmed username to the corporate candidate', async () => {
  const calls: string[]=[];
  const result=await runSelectedContactChecks({jobs:[{companyId:'company',searchId:'search',candidateKeys:['unowned','unsupported','corporate']}],
    progress:emptyContactCheckProgress(),cancelled:()=>false,save:()=>{},wait:async()=>{},now:()=>1000,
    resolve:async(_job,key)=>{
      calls.push(key);
      return key==='unsupported'
        ? {status:'unsupported',username:null,reason:'bot_not_supported',retryAfterSeconds:null}
        : {status:'resolved',username:'fixture_contact',reason:key==='unowned'?'username_exists_ownership_unconfirmed':'regular_user_resolved',retryAfterSeconds:null};
    }});
  assert.deepEqual(calls,['unowned','unsupported','corporate']);
  assert.deepEqual(result.resolved,['company']);
});

test('recheck clears only UI completion markers and preserves account cooldown', async () => {
  const progress=restartContactCheckProgress({completed:['company'],resolved:['company'],pausedUntil:5000,reason:'flood_wait'});
  assert.deepEqual(progress,{completed:[],resolved:[],pausedUntil:5000,reason:'flood_wait'});
  const result=await runSelectedContactChecks({jobs:[{companyId:'company',searchId:'search',candidateKeys:['corporate']}],progress,
    cancelled:()=>false,save:()=>{},wait:async()=>{},now:()=>1000,resolve:async()=>{throw new Error('cooldown_must_not_be_bypassed');}});
  assert.deepEqual(result,progress);
});

test('an ownership-only result never becomes a resolved corporate UI result', async () => {
  const result=await runSelectedContactChecks({jobs:[{companyId:'company',searchId:'search',candidateKeys:['unowned']}],
    progress:emptyContactCheckProgress(),cancelled:()=>false,save:()=>{},wait:async()=>{},now:()=>1000,
    resolve:async()=>({status:'resolved',username:'fixture_contact',reason:'username_exists_ownership_unconfirmed',retryAfterSeconds:null})});
  assert.deepEqual(result.completed,['company']);assert.deepEqual(result.resolved,[]);
});

test('a new mobile candidate reopens a previously completed company check',async()=>{
  const calls:string[]=[];
  const result=await runSelectedContactChecks({jobs:[{companyId:'company',searchId:'search',candidateKeys:['old','mobile']}],
    progress:{...emptyContactCheckProgress(),completed:['company'],checkedKeys:{company:['old']}},
    cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(_job,key)=>{
      calls.push(key);return key==='old'?{status:'unresolved',username:null,reason:'privacy_or_missing',retryAfterSeconds:null}
        :{status:'resolved',username:'clinic_contact',reason:'regular_user_resolved',retryAfterSeconds:null};
    }});
  assert.deepEqual(calls,['old','mobile']);assert.deepEqual(result.resolved,['company']);assert.deepEqual(result.completed,['company']);
});

test('one unavailable source defers its other phones but continues independent company contacts',async()=>{
  const calls:string[]=[];
  const jobs=[{companyId:'map1',searchId:'s',candidateKeys:['phone'],sourceByCandidate:{phone:'openstreetmap' as const}},
    {companyId:'map2',searchId:'s',candidateKeys:['phone'],sourceByCandidate:{phone:'openstreetmap' as const}},
    {companyId:'official',searchId:'s',candidateKeys:['username']}];
  const progress=await runSelectedContactChecks({jobs,progress:emptyContactCheckProgress(),now:()=>1000,
    cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(job)=>{
      calls.push(job.companyId);return job.companyId==='map1'
        ? {status:'limited',reason:'business_listing_unavailable',username:null,retryAfterSeconds:900}
        : {status:'resolved',reason:'regular_user_resolved',username:'official_company',retryAfterSeconds:null};
    }});
  assert.deepEqual(calls,['map1','official']);assert.deepEqual(progress.completed,['official']);
  assert.deepEqual(progress.resolved,['official']);assert.equal(progress.reason,'source_checks_deferred');
  assert.equal(progress.pausedUntil,0);assert.equal(progress.sourcePauses?.openstreetmap?.until,901000);
  calls.length=0;
  await runSelectedContactChecks({jobs,progress,now:()=>2000,cancelled:()=>false,save:()=>{},wait:async()=>{},
    resolve:async()=>{throw new Error('source cooldown must survive restart');}});
  const resumed=await runSelectedContactChecks({jobs,progress,now:()=>902000,cancelled:()=>false,save:()=>{},wait:async()=>{},
    resolve:async(job)=>{calls.push(job.companyId);return {status:'unresolved',reason:'privacy_or_missing',username:null,retryAfterSeconds:null};}});
  assert.deepEqual(calls,['map1','map2']);assert.equal(resumed.reason,null);assert.equal(resumed.completed.length,3);
});

test('source failure does not prevent an independent candidate of the same company',async()=>{
  const calls:string[]=[];
  const result=await runSelectedContactChecks({jobs:[{companyId:'a',searchId:'s',candidateKeys:['phone','username'],sourceByCandidate:{phone:'openstreetmap'}}],
    progress:emptyContactCheckProgress(),now:()=>1000,cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(_job,key)=>{
      calls.push(key);return key==='phone'?{status:'limited',reason:'business_listing_unavailable',username:null,retryAfterSeconds:60}
        :{status:'resolved',reason:'regular_user_resolved',username:'official_company',retryAfterSeconds:null};}});
  assert.deepEqual(calls,['phone','username']);assert.deepEqual(result.resolved,['a']);assert.equal(result.reason,null);
});

test('legacy source pause remains scoped, while Telegram FloodWait still stops all sources',async()=>{
  const jobs=[{companyId:'a',searchId:'s',candidateKeys:['phone'],sourceByCandidate:{phone:'openstreetmap' as const}},
    {companyId:'b',searchId:'s',candidateKeys:['username']}];
  const calls:string[]=[];
  const result=await runSelectedContactChecks({jobs,progress:{...emptyContactCheckProgress(),reason:'business_listing_unavailable',pausedUntil:5000},
    now:()=>1000,cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(job)=>{calls.push(job.companyId);
      return {status:'limited',reason:'flood_wait',username:null,retryAfterSeconds:120};}});
  assert.deepEqual(calls,['b']);assert.equal(result.reason,'flood_wait');assert.equal(result.pausedUntil,121000);
  assert.equal(result.sourcePauses?.openstreetmap?.until,5000);
});
