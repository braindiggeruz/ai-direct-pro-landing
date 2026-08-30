import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyContactCheckProgress, restartContactCheckProgress, runSelectedContactChecks } from '../src/admin/lib/campaign-contact-checks';

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
