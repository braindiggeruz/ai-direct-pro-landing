import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('real Workers runtime accepts sender requests and refuses redirects without following them', async () => {
  const binding = {org_id:'test-org',account_id:`lrtgua_${'a'.repeat(32)}`,account_ref:'test_gateway_ref_0001',sender_fingerprint:'b'.repeat(64)};
  const source = `
    import { configuredTgSender } from './functions/platform/lead-radar/outreach-transport';
    const binding = ${JSON.stringify(binding)};
    export default {async fetch(request, env) {
      const redirect = new URL(request.url).pathname === '/redirect';
      const client = configuredTgSender({
        LEAD_RADAR_TELEGRAM_TRANSPORT_MODE:'tg_sender',
        LEAD_RADAR_TG_SENDER_ORIGIN:'https://tg-sender-v2.braindigger-uz.workers.dev',
        LEAD_RADAR_TG_SENDER_TOKEN:'t'.repeat(48),
        LEAD_RADAR_TG_SENDER_BINDING_JSON:JSON.stringify(binding),
        LEAD_RADAR_TG_SENDER_SERVICE:redirect ? env.REDIRECT : env.SENDER,
      }, binding.org_id);
      return Response.json(await client.probeSession());
    }};
  `;
  const bundled = await build({stdin:{contents:source,resolveDir:path.resolve(import.meta.dirname,'..'),loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false});
  const provider = `export default {async fetch(request) {
    if(request.redirect!=='manual' || request.headers.get('Authorization')!=='Bearer '+ 't'.repeat(48)) return new Response(null,{status:400});
    const binding=${JSON.stringify(binding)}; const now=new Date().toISOString();
    return Response.json({schema:'gptbot.lead-radar.tg-sender.v1',binding,ready:true,reason_code:null,checked_at:now,retry_after_seconds:null,masked_label:'Telegram •••• 0001',provider_verified_at:now,
      capabilities:{text:true,media:false,durable_idempotency:true,sender_lock:true,persisted_cooldown:true,independent_scheduler:false,opaque_peer_refs:true,username_resolution:true,public_business_inquiry:true}});
  }};`;
  const mf = new Miniflare({workers:[
    {name:'client',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2024-09-23',compatibilityFlags:['global_fetch_strictly_public','enable_request_signal'],serviceBindings:{SENDER:'sender',REDIRECT:'redirector'}},
    {name:'sender',modules:true,script:provider,compatibilityDate:'2024-09-23'},
    {name:'redirector',modules:true,script:`export default {fetch(){return new Response(null,{status:302,headers:{Location:'https://never-follow.invalid/'}})}}`,compatibilityDate:'2024-09-23'},
  ]});
  try {
    const ready = await (await mf.dispatchFetch('https://local.test/')).json() as {ready:boolean;providerVerifiedAt:string};
    assert.equal(ready.ready,true);
    assert.ok(ready.providerVerifiedAt);
    const blocked = await (await mf.dispatchFetch('https://local.test/redirect')).json() as {ready:boolean;reason:string};
    assert.equal(blocked.ready,false);
    assert.equal(blocked.reason,'tg_sender_unavailable');
  } finally { await mf.dispose(); }
});
