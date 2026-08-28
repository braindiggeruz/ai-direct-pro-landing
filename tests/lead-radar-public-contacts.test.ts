import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPublicBusinessContacts, publicContactSearchQueries, publicContactSourceUrl } from '../functions/platform/lead-radar/public-contact-discovery';
import { createContactSourceQueueDependencies } from '../functions/platform/lead-radar/contact-source-worker';
import { freshAdminDb, migrationFiles } from './helpers/bormi-admin-fixture';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { loadContactEnrichments } from '../functions/platform/lead-radar/contact-source-store';
import { FirecrawlStore } from '../functions/platform/lead-radar/firecrawl-store';

const at=new Date('2026-08-28T11:00:00.000Z');
const identity={name:'Dental Example',city:'Tashkent',phone:'+998711234567',address:'Amir Temur 123'};
const url='https://clinics.uz/catalog/dental-example';
const listing=(phone=identity.phone) => `<script type="application/ld+json">${JSON.stringify({'@type':'Dentist',name:identity.name,telephone:phone,sameAs:['https://t.me/clinic_booking','https://t.me/clinic_bot']})}</script><footer>Запись в Telegram @directory_support</footer>`;

test('matched public listing finds corporate contact without fabricating a website or taking directory footer',async()=>{
  const result=await extractPublicBusinessContacts(url,listing(),identity,at.toISOString());
  assert.equal(result?.kind,'business_listing');
  assert.deepEqual(result?.candidates.map((c)=>c.value),['https://t.me/clinic_booking']);
  assert.equal(result?.candidates[0].ownership,'company');
  assert.equal(await extractPublicBusinessContacts(url,listing('+998901234567'),identity,at.toISOString()),null);
  assert.equal(await extractPublicBusinessContacts(url,listing(),{...identity,name:'Another Clinic'},at.toISOString()),null);
});

test('unstructured listing requires a same-entity name/phone and excludes vendor and sidebar contacts',async()=>{
  const html=`<main><h1>${identity.name}</h1><p>${identity.phone}</p><p>Записаться: @clinic_booking</p>
    <aside>Напишите @sidebar_contact</aside><footer>Website by @vendor_contact</footer></main>`;
  assert.deepEqual((await extractPublicBusinessContacts(url,html,identity,at.toISOString()))?.candidates.map((c)=>c.value),['https://t.me/clinic_booking']);
  assert.equal(await extractPublicBusinessContacts(url,html.replace('</h1>','</h1><h1>Other clinic</h1>'),identity,at.toISOString()),null);
  assert.equal(await extractPublicBusinessContacts(url,html.replace(identity.phone,'+998901234567'),identity,at.toISOString()),null);
  assert.equal(await extractPublicBusinessContacts(url,'<p>'+identity.name+identity.phone+' @directory_support</p>',identity,at.toISOString()),null);
});

test('a matched listing can supply mobile lookup candidates, but fixed lines never enter lookup',async()=>{
  const mobile={...identity,phone:'+998901234567'};
  const html=`<script type="application/ld+json">${JSON.stringify({'@type':'Dentist',name:mobile.name,telephone:[mobile.phone,'+998711234567']})}</script>`;
  const source=await extractPublicBusinessContacts(url,html,mobile,at.toISOString());
  assert.deepEqual(source?.candidates.map((c)=>[c.kind,c.value]),[['phone',mobile.phone]]);
  assert.equal(source?.candidates[0].resolution,undefined,'a mobile number is not a resolved Telegram user');
});

test('public Telegram bio is matched by name and phone; only published booking contact is followed',async()=>{
  const html=`<div class="tgme_page_title"><span>${identity.name}</span></div><div class="tgme_page_description">${identity.phone}<p>Записаться: @clinic_booking</p></div>`;
  const result=await extractPublicBusinessContacts('https://t.me/clinic_news',html,identity,at.toISOString());
  assert.deepEqual(result?.candidates.map((c)=>c.value),['https://t.me/clinic_news','https://t.me/clinic_booking']);
  assert.equal(await extractPublicBusinessContacts('https://t.me/clinic_news',html,{...identity,phone:'+998901234567'},at.toISOString()),null);
});

test('contact source allowlist rejects private, login, query, member and arbitrary URLs',()=>{
  for (const raw of ['http://127.0.0.1/test','https://evil.test/clinic','https://t.me/+InviteToken','https://t.me/clinic_name/123',
    'https://clinics.uz/login','https://clinics.uz/test?token=secret','https://clinics.uz/','https://t.me/clinic_name?start=token']) assert.equal(publicContactSourceUrl(raw),null,raw);
  assert.ok(publicContactSourceUrl(url));
  assert.ok(publicContactSearchQueries(identity).every((q)=>q.toLowerCase().includes(identity.name.toLowerCase())&&q.includes(identity.phone)));
});

test('Russian/Uzbek company-name variants match only with a public phone or address anchor',async()=>{
  const html='<script type="application/ld+json">{"@type":"Dentist","name":"Sadaf — стоматологическая клиника","telephone":"+998711234567","sameAs":"https://t.me/sadaf_booking"}</script>';
  assert.ok(await extractPublicBusinessContacts(url,html,{...identity,name:'Садаф'},at.toISOString()));
  assert.equal(await extractPublicBusinessContacts(url,html,{...identity,name:'Садаф',phone:null},at.toISOString()),null);
  assert.equal(await extractPublicBusinessContacts(url,html,{...identity,name:'Sadaf Smile'},at.toISOString()),null);
  assert.ok(publicContactSearchQueries({...identity,name:'Садаф'})[1].includes('"sadaf"'));
});

test('disabled source discovery does not query optional schema or request the provider',async()=>{
  const db={prepare:()=>{throw new Error('must not query');}} as unknown as D1Database;
  assert.deepEqual(await createContactSourceQueueDependencies({},db,'org'),{});
});

test('contact-first provider persists proof with no site, then resumes from receipt without rebilling',async()=>{
  const db=freshAdminDb();
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(name TEXT UNIQUE)');
  for (const file of migrationFiles()) db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(file);
  const store=new LeadRadarStore(db.asD1());
  const searchId=await store.createSearch('org',{niche:'dentist',city:'Tashkent',country:'UZ',offer:'demo',desiredCount:5,telegramRequired:true,languages:['ru']},at.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_companies(id,org_id,search_id,canonical_key,name,category,city,country,address,phone,score,confidence,priority,score_components_json,signals_json,discovered_at,last_verified_at,updated_at)
    VALUES ('company','org',?,'fixture',?,'dentist',?,'UZ',?,?,50,.8,'P3','[]','[]',?,?,?)`).run(searchId,identity.name,identity.city,identity.address,identity.phone,at.toISOString(),at.toISOString(),at.toISOString());
  const created=await store.createJob('org',searchId,'company','enrichment','contact-resolve:fixture',at.toISOString());
  db.sqlite.prepare("UPDATE lead_radar_jobs SET status='running',lease_owner='owner',lease_expires_at=?,lease_generation=1 WHERE id=?")
    .run(new Date(at.getTime()+600_000).toISOString(),created.id);
  const job=(await store.getJob(created.id))!;
  const lead=(await store.getLeadForEnrichment('org','company'))!.lead;
  let calls=0;
  const deps=await createContactSourceQueueDependencies({FIRECRAWL_API_KEY:'fixture-only',LEAD_RADAR_FIRECRAWL_ENABLED:'true',LEAD_RADAR_FIRECRAWL_MODE:'fallback',LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS:'org'},db.asD1(),'org',{
    now:()=>at,robots:async()=>null,fetch:async(input,init)=>{
      calls++; const body=JSON.parse(String(init?.body));
      assert.equal(body.scrapeOptions,undefined,'search must not auto-scrape paid results');
      return new Response(JSON.stringify(String(input).endsWith('/search') ? {success:true,data:{web:[{url,description:'A snippet is not proof'}]}}
        : {success:true,data:{rawHtml:listing(),metadata:{statusCode:200,sourceURL:url}}}));
    },
  });
  assert.equal((await deps.discoverLeadContactSources!(job,lead)).pending,true);
  assert.equal(calls,2);
  assert.equal((await deps.discoverLeadContactSources!(job,lead)).pending,false);
  assert.equal(calls,2);
  assert.equal(db.value("SELECT website FROM lead_radar_companies WHERE id='company'"),null);
  const proof=(await loadContactEnrichments(db.asD1(),'org',[{id:'company',...identity}],at.toISOString())).get('company');
  assert.equal(proof?.sources[0].candidates[0].value,'https://t.me/clinic_booking');
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'),3);
  assert.equal((await loadContactEnrichments(db.asD1(),'other',[{id:'company',...identity}],at.toISOString())).size,0);
  assert.equal((await loadContactEnrichments(db.asD1(),'org',[{id:'company',...identity,phone:'+998901234567'}],at.toISOString())).size,0);
  // A different job for the SAME company does not receive another seven credits.
  const second=await store.createJob('org',searchId,'company','enrichment','budget-second-job',at.toISOString());
  db.sqlite.prepare("UPDATE lead_radar_jobs SET status='running',lease_owner='owner',lease_expires_at=?,lease_generation=1 WHERE id=?")
    .run(new Date(at.getTime()+600_000).toISOString(),second.id);
  const ledger=new FirecrawlStore(db.asD1());
  const ctx={orgId:'org',searchId,companyId:'company',jobId:second.id,leaseOwner:'owner',leaseGeneration:1};
  for (const key of ['a','b']) {
    const reserved=await ledger.reserve(ctx,key.repeat(64),'search','budget-fixture',1,{dailyCredits:100,searchCredits:100,domainCredits:14,companyCredits:7},at.toISOString());
    assert.ok(reserved);await ledger.finish(reserved,'completed',[],null,null,at.toISOString());
  }
  assert.equal(await ledger.reserve(ctx,'c'.repeat(64),'search','budget-fixture',1,{dailyCredits:100,searchCredits:100,domainCredits:14,companyCredits:7},at.toISOString()),null);
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'),7);
});
