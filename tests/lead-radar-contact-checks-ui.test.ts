import assert from 'node:assert/strict';
import test from 'node:test';
import { contactCheckExplanation, emptyContactCheckProgress, planContactSourceRetry, readContactCheckProgress, restartContactCheckProgress, runSelectedContactChecks, saveContactCheckProgress, scheduleContactSourceRetry, selectedContactCheckJobs } from '../src/admin/lib/campaign-contact-checks';
import type { LeadRadarLead } from '../src/shared/lead-radar';
import { contactCandidatesForLead } from '../functions/platform/lead-radar/contact-candidates';
import { contactResolutionCopy, ownershipConfirmationCopy } from '../src/admin/lib/contact-candidate-feedback';
import { normalizeTelegramContactResolution } from '../src/shared/lead-radar-contact-resolution';

test('legacy transport errors pause the checker without completing or excluding a company', async () => {
  for (const reason of ['telegram_timeout','lookup_unconfirmed','check_expired']) {
    const result=await runSelectedContactChecks({jobs:[{companyId:'company',searchId:'search',candidateKeys:['corporate']}],
      progress:emptyContactCheckProgress(),cancelled:()=>false,save:()=>{},wait:async()=>{},now:()=>1000,
      resolve:async()=>normalizeTelegramContactResolution({status:'unresolved',username:null,reason,retryAfterSeconds:null})});
    assert.deepEqual(result.completed,[]);assert.deepEqual(result.resolved,[]);
    assert.equal(result.reason,reason);assert.equal(result.pausedUntil,61_000);
  }
  const privacy={status:'unresolved' as const,username:null,reason:'privacy_or_missing',retryAfterSeconds:null};
  assert.deepEqual(normalizeTelegramContactResolution(privacy),privacy);
});

test('contact feedback distinguishes source outages, Telegram privacy and transport failures', () => {
  const result={status:'limited' as const,username:null,reason:'business_listing_unavailable',retryAfterSeconds:900};
  assert.match(contactResolutionCopy(result),/источнике временно недоступна/);
  assert.doesNotMatch(contactResolutionCopy(result),/Telegram ограничил/);
  assert.match(contactResolutionCopy({...result,reason:'business_listing_rate_limited'}),/OpenStreetMap.*429/);
  assert.match(contactResolutionCopy({...result,status:'unresolved',reason:'privacy_or_missing'}),/может быть скрыт/);
  assert.match(contactResolutionCopy({...result,status:'failed',reason:'telegram_timeout'}),/Результат неизвестен/);
  assert.match(contactResolutionCopy({...result,status:'resolved',reason:'regular_user_resolved',peerRef:'lrpeer:fixture'}),/без публичного username/);
  assert.doesNotMatch(contactResolutionCopy({...result,status:'resolved',reason:'username_exists_ownership_unconfirmed'}),/@null/);
  assert.match(ownershipConfirmationCopy('source_unavailable'),/Не удалось прочитать/);
  assert.match(ownershipConfirmationCopy('source_changed'),/больше не публикует/);
  assert.match(ownershipConfirmationCopy('classification_unconfirmed'),/не обозначает/);
  assert.match(ownershipConfirmationCopy('already_confirmed'),/не разрешение на рассылку/);
});

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
  const now=Date.parse('2026-08-31T00:00:00Z');
  for(const item of lead.evidence)item.observedAt=new Date(now).toISOString();
  assert.equal(selectedContactCheckJobs([lead],[],now)[0].sourceByCandidate,undefined,'fresh proof still checked on server but needs no OSM request');
  lead.evidence[0].observedAt=new Date(now-31*86400_000).toISOString();
  assert.equal(selectedContactCheckJobs([lead],[],now)[0].sourceByCandidate?.['phone:+998901234567'],'openstreetmap','one stale proof requires a source read');
  lead.evidence[0].observedAt=new Date(now+301_000).toISOString();
  assert.ok(selectedContactCheckJobs([lead],[],now)[0].sourceByCandidate,'future proof cannot bypass scheduling');
  lead.evidence.shift();
  assert.ok(selectedContactCheckJobs([lead],[],now)[0].sourceByCandidate,'missing proof remains source-dependent');
});

test('source continuation is bounded to two attempts and never auto-retries Telegram/account failures',()=>{
  const progress={...emptyContactCheckProgress(),reason:'source_checks_deferred',sourcePauses:{openstreetmap:{until:901000,reason:'business_listing_rate_limited'}}};
  const first=planContactSourceRetry(progress,2,1000);assert.deepEqual(first,{deadline:901000,remainingAttempts:1});
  const second=planContactSourceRetry({...progress,sourcePauses:{openstreetmap:{until:1801000,reason:'business_listing_unavailable'}}},first!.remainingAttempts,902000);
  assert.deepEqual(second,{deadline:1801000,remainingAttempts:0});
  assert.equal(planContactSourceRetry(progress,second!.remainingAttempts,1802000),null);
  assert.equal(planContactSourceRetry({...progress,pausedUntil:2000},2,1000),null);
  for(const reason of ['flood_wait','account_safety_cooldown','waiting_for_bridge','invalid_bridge_response',null])
    assert.equal(planContactSourceRetry({...progress,reason},2,1000),null);
  assert.equal(planContactSourceRetry({...progress,sourcePauses:undefined},2,1000),null);
  assert.equal(planContactSourceRetry(progress,Infinity,1000),null);
});

test('source timer respects retry-after, waits for idle and fires only once; cancel/unmount prevents resume',()=>{
  let now=1000,ready=true,callback=()=>{},cleared=0,resumed=0;
  const start=()=>scheduleContactSourceRetry({retry:{deadline:5000,remainingAttempts:1},now:()=>now,ready:()=>ready,tick:()=>{},
    resume:attempts=>{assert.equal(attempts,1);resumed++;},interval:cb=>{callback=cb;return 1;},clear:()=>{cleared++;}});
  start();now=4999;callback();assert.equal(resumed,0);
  ready=false;now=5000;callback();assert.equal(resumed,0);
  ready=true;callback();callback();assert.equal(resumed,1);assert.equal(cleared,1);
  const stop=start();stop();callback();assert.equal(resumed,1,'cleanup for cancel, scope change and unmount cannot dispatch');
});

test('rate-limited source persists separately and cached independent contacts still reach server verification',async()=>{
  const store=new Map<string,string>();
  const original=globalThis.sessionStorage;
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{setItem:(key:string,value:string)=>store.set(key,value),getItem:(key:string)=>store.get(key)??null}});
  try {
    const progress={...emptyContactCheckProgress(),reason:'source_checks_deferred',sourcePauses:{openstreetmap:{until:Date.now()+900_000,reason:'business_listing_rate_limited'}}};
    saveContactCheckProgress('fixture',progress);
    const stored=readContactCheckProgress('fixture');assert.deepEqual(stored.sourcePauses,progress.sourcePauses);
    const calls:string[]=[];
    const result=await runSelectedContactChecks({jobs:[{companyId:'stale',searchId:'s',candidateKeys:['p'],sourceByCandidate:{p:'openstreetmap'}},
      {companyId:'fresh',searchId:'s',candidateKeys:['p']}],progress:stored,cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async job=>{
        calls.push(job.companyId);return {status:'unresolved',reason:'privacy_or_missing',username:null,retryAfterSeconds:null};}});
    assert.deepEqual(calls,['fresh']);assert.deepEqual(result.completed,['fresh']);assert.deepEqual(result.resolved,[]);
    assert.equal(result.reason,'source_checks_deferred');
  } finally {Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:original});}
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

for(const reason of ['business_listing_unavailable','business_listing_rate_limited'])test(`${reason} defers source phones but continues independent company contacts`,async()=>{
  const calls:string[]=[];
  const jobs=[{companyId:'map1',searchId:'s',candidateKeys:['phone'],sourceByCandidate:{phone:'openstreetmap' as const}},
    {companyId:'map2',searchId:'s',candidateKeys:['phone'],sourceByCandidate:{phone:'openstreetmap' as const}},
    {companyId:'official',searchId:'s',candidateKeys:['username']}];
  const progress=await runSelectedContactChecks({jobs,progress:emptyContactCheckProgress(),now:()=>1000,
    cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(job)=>{
      calls.push(job.companyId);return job.companyId==='map1'
        ? {status:'limited',reason,username:null,retryAfterSeconds:900}
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

test('a rejected source excludes only that candidate and continues the same company and following companies',async()=>{
  const calls:string[]=[];
  const result=await runSelectedContactChecks({jobs:[{companyId:'a',searchId:'s',candidateKeys:['rejected','valid']},
    {companyId:'b',searchId:'s',candidateKeys:['rejected']}],progress:emptyContactCheckProgress(),now:()=>1000,
    cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(job,key)=>{calls.push(`${job.companyId}:${key}`);
      return key==='rejected'?{status:'failed',reason:'corporate_source_required',username:null,retryAfterSeconds:null}
        :{status:'resolved',reason:'regular_user_resolved',username:'company_fixture',retryAfterSeconds:null};}});
  assert.deepEqual(calls,['a:rejected','a:valid','b:rejected']);
  assert.deepEqual(result.completed,['a','b']);assert.deepEqual(result.resolved,['a']);
  assert.equal(result.pausedUntil,0);assert.equal(result.reason,null);
  assert.equal(result.outcomes?.b.reason,'corporate_source_required');
  assert.match(contactCheckExplanation({id:'b'} as LeadRadarLead,result)!,/принадлежность/);
});

for(const reason of ['contact_not_found','do_not_contact'])test(`${reason} ends only that company and does not try its other candidates`,async()=>{
  const calls:string[]=[];
  const result=await runSelectedContactChecks({jobs:[{companyId:'a',searchId:'s',candidateKeys:['one','two']},
    {companyId:'b',searchId:'s',candidateKeys:['one']}],progress:emptyContactCheckProgress(),now:()=>1000,
    cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(job,key)=>{calls.push(`${job.companyId}:${key}`);
      return job.companyId==='a'?{status:'failed',reason,username:null,retryAfterSeconds:null}
        :{status:'unresolved',reason:'privacy_or_missing',username:null,retryAfterSeconds:null};}});
  assert.deepEqual(calls,['a:one','b:one']);assert.deepEqual(result.completed,['a','b']);assert.deepEqual(result.resolved,[]);
});

test('unknown failures, account limits and explicit retry-after still pause the entire checker',async()=>{
  for(const [reason,retryAfterSeconds] of [['daily_check_limit',null],['invalid_bridge_response',null],['corporate_source_required',300]] as const){
    const calls:string[]=[];
    const result=await runSelectedContactChecks({jobs:[{companyId:'a',searchId:'s',candidateKeys:['one']},
      {companyId:'b',searchId:'s',candidateKeys:['one']}],progress:emptyContactCheckProgress(),now:()=>1000,
      cancelled:()=>false,save:()=>{},wait:async()=>{},resolve:async(job)=>{calls.push(job.companyId);
        return {status:'failed',reason,username:null,retryAfterSeconds};}});
    assert.deepEqual(calls,['a']);assert.deepEqual(result.completed,[]);assert.equal(result.reason,reason);
    assert.equal(result.pausedUntil,1000+(retryAfterSeconds??60)*1000);
  }
});
