import assert from 'node:assert/strict';
import test from 'node:test';
import { TgSenderCampaignSender } from '../functions/platform/lead-radar/tg-sender-client';
import { TG_SENDER_SCHEMA, type TgSenderInput, type TgSenderBinding } from '../functions/platform/lead-radar/tg-sender-contract';
const binding:TgSenderBinding={org_id:'test-org',account_id:`lrtgua_${'a'.repeat(32)}`,account_ref:'test_gateway_ref_0001',sender_fingerprint:'b'.repeat(64)};
const now=Date.parse('2026-11-07T00:00:00.000Z');
const input:TgSenderInput={orgId:binding.org_id,accountId:binding.account_id,gatewayAccountRef:binding.account_ref,username:`lrpeer:${'c'.repeat(32)}`,text:'Synthetic question',randomId:'effect_0001',media:null,authorization:{basis:'documented_consent',reference:'authorization_01',expiresAt:'2030-01-01T00:00:00.000Z'}};
function status(){return {schema:TG_SENDER_SCHEMA,binding,ready:true,reason_code:null,provider_verified_at:null,checked_at:new Date(now).toISOString(),masked_label:'Telegram •••• 0001',retry_after_seconds:null,capabilities:{text:true,media:false,durable_idempotency:true,sender_lock:true,persisted_cooldown:true,independent_scheduler:false,opaque_peer_refs:true,username_resolution:true,public_business_inquiry:false}};}
function client(handler:(path:string,init:RequestInit)=>Promise<Response>|Response,extra:Record<string,unknown>={}){return new TgSenderCampaignSender({enabled:true,token:'t'.repeat(48),binding,now:()=>now,service:{fetch:async(url,init)=>handler(new URL(url).pathname,init)},...extra});}
const json=(value:unknown)=>Response.json(value);
test('prepares canonical immutable cross-repository digest and only opaque execution refs',async()=>{
 const api=client(()=>{throw new Error('network must not run');});
 const cmd=await api.prepare(input);assert.equal(cmd?.payload_sha256,'636f1c9af0d8d25bf12883d53469dc020e44a8994172c733eb33ba96709c9dcf');assert.equal(cmd?.recipient,input.username);
 assert.equal(await api.prepare({...input,username:'testcompany'}),null);
 assert.equal(await api.prepare({...input,orgId:'wrong'}),null);
 assert.equal(await api.prepare({...input,authorization:undefined}),null);
 assert.equal(await api.prepare({...input,authorization:{...input.authorization!,expiresAt:'2026-01-01T00:00:00.000Z'}}),null);
});
test('preflight accepts strict capabilities then dispatches once with runtime auth and idempotency key',async()=>{
 const calls:string[]=[];
 const api=client((path,init)=>{calls.push(path);assert.equal((init.headers as Record<string,string>).Authorization,'Bearer '+'t'.repeat(48));assert.equal(init.redirect,'error');
  if(path.endsWith('/status'))return json(status());
  const body=JSON.parse(String(init.body));assert.equal((init.headers as Record<string,string>)['Idempotency-Key'],body.effect_id);
  const {schema,binding,effect_id,payload_sha256}=body;return json({schema,binding,effect_id,payload_sha256,state:'accepted',provider_message_id:'501'});
 });
 assert.deepEqual(await api.send(input),{kind:'sent',providerMessageId:'501'});assert.equal(calls.length,2);
});
test('does not accept a different scope, missing fields or stale remote status',async()=>{
 for(const bad of [{...status(),binding:{...binding,account_id:'other'}},{...status(),checked_at:'2020-01-01T00:00:00.000Z'},{...status(),capabilities:{...status().capabilities,opaque_peer_refs:false}},{...status(),masked_label:undefined}]){
  let calls=0;const api=client(()=>{calls++;return json(bad);});assert.equal((await api.send(input)).kind,'rejected');assert.equal(calls,1);
 }
});
test('ambiguous transport/malformed receipt/timeout never retries dispatch',async()=>{
 for(const mode of ['network','scope','missing-id','timeout','oversize']){
  let posts=0;
  const api=client((path,init)=>{if(path.endsWith('/status'))return json(status());posts++;
   if(mode==='network')throw new Error('lost response');
   if(mode==='timeout')return new Promise<Response>((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
   if(mode==='oversize')return new Response('x'.repeat(20000));
   const body=JSON.parse(String(init.body));const {schema,binding,effect_id,payload_sha256}=body;
   return json({schema,binding:mode==='scope'?{...binding,org_id:'other'}:binding,effect_id,payload_sha256,state:'accepted',...(mode==='missing-id'?{}:{provider_message_id:'501'})});
  },{timeoutMs:30});
  assert.deepEqual(await api.send(input),{kind:'ambiguous'});assert.equal(posts,1);
 }
});
test('resolution validates fresh scoped user proof without raw identities and returns cooldown honestly',async()=>{
 const valid={schema:TG_SENDER_SCHEMA,binding,username:'testcompany',status:'resolved',kind:'user',peer_ref:input.username,verified_at:new Date(now).toISOString(),expires_at:new Date(now+86400000).toISOString(),reason_code:null,retry_after_seconds:null};
 const api=client((_path,init)=>{assert.equal(JSON.parse(String(init.body)).username,'testcompany');return json(valid);});
 assert.deepEqual(await api.resolveContact('@TestCompany'),{status:'resolved',username:'testcompany',kind:'user',peerRef:input.username,verifiedAt:valid.verified_at,expiresAt:valid.expires_at,reason:null,retryAfterSeconds:null});
 for(const bad of [{...valid,kind:'bot'},{...valid,access_hash:'1234'},{...valid,expires_at:new Date(now-1).toISOString()},{...valid,peer_ref:'username:testcompany'}])assert.equal((await client(()=>json(bad)).resolveContact('testcompany')).status,'blocked');
 assert.equal((await api.resolveContact('+998901234567')).reason,'invalid_username');
 const blocked={...valid,status:'blocked',kind:'unknown',peer_ref:null,verified_at:null,expires_at:null,reason_code:'sender_cooldown',retry_after_seconds:900};
 assert.equal((await client(()=>json(blocked)).resolveContact('testcompany')).retryAfterSeconds,900);
});
test('receipt/cancel are read-only or cancellation endpoints and validate identity',async()=>{
 const paths:string[]=[];const api=client((path,init)=>{paths.push(path);const key=init.body?JSON.parse(String(init.body)):{schema:TG_SENDER_SCHEMA,binding,effect_id:input.randomId,payload_sha256:(init.headers as Record<string,string>)['X-Payload-SHA256']};return json({...key,state:'cancelled'});});
 const cmd=await api.prepare(input);assert.ok(cmd);const {schema,binding:scoped,effect_id,payload_sha256}=cmd;const key={schema,binding:scoped,effect_id,payload_sha256};
 assert.equal((await api.receipt(key))?.state,'cancelled');assert.equal((await api.cancel(key))?.state,'cancelled');assert.ok(paths.every(path=>path.includes('/effects/effect_0001')));
 assert.equal(await api.cancel({...key,binding:{...binding,org_id:'wrong'}}),null);assert.equal(paths.length,2);
});
test('public business inquiry preserves proof explicitly and never substitutes consent',async()=>{
 const api=client(()=>json(status()));
 const publicInput:TgSenderInput={...input,authorization:{...input.authorization!,basis:'public_business_inquiry',publicInquiry:{policyVersion:'public-business-inquiry-v1',sourceUrlDigest:'1'.repeat(64),approvalId:`lrtgap_${'2'.repeat(32)}`,selectionDigest:'3'.repeat(64),contentDigest:'4'.repeat(64),recipientId:`lrtgcr_${'5'.repeat(32)}`,firstContactOnly:true}}};
 const cmd=await api.prepare(publicInput);assert.equal(cmd?.authorization.basis,'public_business_inquiry');assert.equal(cmd?.authorization.public_inquiry?.approval_id,publicInput.authorization?.publicInquiry?.approvalId);
 assert.notEqual(cmd?.payload_sha256,(await api.prepare(input))?.payload_sha256);
 assert.equal(await api.prepare({...publicInput,authorization:{...publicInput.authorization!,publicInquiry:undefined}}),null);
});
test('disabled transport makes no requests',async()=>{
 let calls=0;const api=client(()=>{calls++;return json(status());},{enabled:false});
 assert.equal((await api.status()).reason,'tg_sender_not_configured');assert.equal((await api.resolveContact('testcompany')).reason,'tg_sender_not_configured');assert.equal((await api.send(input)).kind,'rejected');assert.equal(calls,0);
});
test('reconstructs only a receipt key from expired frozen authorization and strips command fields on cancel',async()=>{
 let requested:Record<string,unknown>|undefined;
 const expired=client((_path,init)=>{requested=JSON.parse(String(init.body));return json({...requested,state:'cancelled'});},{now:()=>Date.parse('2031-01-01T00:00:00.000Z')});
 assert.equal(await expired.prepare(input),null);
 const key=await expired.effectKey(input);assert.ok(key);assert.equal(key.payload_sha256,'636f1c9af0d8d25bf12883d53469dc020e44a8994172c733eb33ba96709c9dcf');
 assert.equal((await expired.cancel({...key,text:'never sent'} as typeof key))?.state,'cancelled');
 assert.deepEqual(Object.keys(requested!).sort(),['binding','effect_id','payload_sha256','schema']);
});

test('provider verification happens only via explicit session probe, never passive readiness',async()=>{
 const paths:string[]=[];const api=client((path,init)=>{paths.push(path);if(path.endsWith('/session/probe')){assert.equal(init.method,'POST');return json({...status(),provider_verified_at:new Date(now).toISOString()});}return json(status());});
 assert.equal((await api.readiness()).providerVerifiedAt,null);
 assert.equal((await api.probeSession()).providerVerifiedAt,new Date(now).toISOString());
 assert.deepEqual(paths.map(p=>p.split('/').slice(-2).join('/')),['v1/status','session/probe']);
});
