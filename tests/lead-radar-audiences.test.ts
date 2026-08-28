import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudienceStore,audienceSchemaReady } from '../functions/platform/lead-radar/audiences';
import { resolveLeadRadarCapabilities } from '../functions/platform/lead-radar/capabilities';
import { freshAdminDb,migrationFiles,callRoute,platformToken,OWNER_EMAIL } from './helpers/bormi-admin-fixture';
import * as routes from '../functions/api/admin/lead-radar/[[path]]';
import { ownerOrgId } from '../functions/platform/lead-radar';
import type { SqliteD1 } from './helpers/sqlite-d1';

const ORG='org_audience_fixture';
const NOW=new Date('2026-08-28T10:00:00Z');
const A='aud_'+ 'a'.repeat(32);
const CAPS=resolveLeadRadarCapabilities({},ORG);

test('owner API provides safe directory and persisted audiences; non-owner and forged scope are refused',async()=>{
  const db=database();const org=await ownerOrgId(OWNER_EMAIL);company(db,'api_a','ApiClinic','api_a',org);
  const token=await platformToken('platform_owner');const path='/api/admin/lead-radar/audiences/'+A;
  const write={method:'POST',token,params:{path:'audiences/'+A},body:{name:'All niches',version:0,companyIds:['api_a']}};
  const denied=await callRoute(routes.onRequestPost,db,path,{...write,token:await platformToken('support_readonly')});assert.equal(denied.status,403);
  const created=await callRoute(routes.onRequestPost,db,path,write);assert.equal(created.status,200,JSON.stringify(created.body));
  const loaded=await callRoute(routes.onRequestGet,db,path,{token,params:{path:'audiences/'+A}});assert.equal(loaded.status,200);
  assert.equal((loaded.body.leads as unknown[]).length,1);assert.match(loaded.headers.get('Cache-Control') ?? '',/no-store/);
  const directory=await callRoute(routes.onRequestGet,db,'/api/admin/lead-radar/telegram-contacts',{token,params:{path:'telegram-contacts'}});
  assert.equal(directory.status,200,JSON.stringify(directory.body));assert.equal(directory.body.total,1);
  const forged=await callRoute(routes.onRequestPost,db,path,{...write,body:{...write.body,orgId:'other'}});assert.equal(forged.status,400);
  const cross=await callRoute(routes.onRequestGet,db,path,{token:await platformToken('platform_owner','other@example.invalid'),params:{path:'audiences/'+A}});assert.equal(cross.status,404);
});
function database() {
  const db=freshAdminDb();
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT)');
  for(const file of migrationFiles()) db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(file);
  return db;
}
function company(db:SqliteD1,id:string,username:string,canonical=id,org=ORG,type='business') {
  const evidenceId=`evidence_${id}`;
  const stamp=NOW.toISOString();
  db.sqlite.prepare(`INSERT INTO lead_radar_searches(id,org_id,input_json,status,created_at) VALUES (?,?,'{}','ready',?)`).run('search_'+id,org,stamp);
  const contact={username,url:`https://t.me/${username}`,type,confidence:.95,reason:'fixture',evidenceIds:[evidenceId],verifiedAt:stamp,messageable:false};
  db.sqlite.prepare(`INSERT INTO lead_radar_companies(id,org_id,search_id,canonical_key,name,category,city,country,website,score,confidence,priority,
    score_components_json,signals_json,telegram_contact_json,discovered_at,last_verified_at,updated_at,name_city_key)
    VALUES (?,?,?,?,?,'dentist','Tashkent','UZ',?,80,.9,'P1','[]','[]',?,?,?,?,?)`)
    .run(id,org,'search_'+id,canonical,'Company '+id,`https://${id}.example`,JSON.stringify(contact),stamp,stamp,stamp,`company${id}:tashkent`);
  db.sqlite.prepare(`INSERT INTO lead_radar_evidence(id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES (?,?,?,'web.telegram.business',?,?,'company_website',?,.95,'fact')`)
    .run(evidenceId,org,id,`https://t.me/${username}`,`https://${id}.example/contact`,stamp);
}
test('audience schema optional; tenant directory dedupes all historical searches, excludes phones/bots/humans',async()=>{
  const db=database(); const store=new AudienceStore(db.asD1());
  assert.equal(await audienceSchemaReady(db.asD1()),true);
  for(let i=0;i<5;i++)company(db,`same${i}`,i%2?'DentalClinic':'dentalclinic','same-business');
  company(db,'other','ForeignClinic','other','org_other_owner');
  company(db,'bot','DentalBot','bot',ORG,'bot');company(db,'human','PersonalName','human',ORG,'human');
  const result=await store.directory(ORG,{},CAPS,NOW);
  assert.equal(result.total,1);assert.equal(result.rows.length,1);assert.equal(result.rows[0].occurrences,5);
  assert.equal(result.rows[0].status,'verified');assert.equal(result.rows[0].sources.length,5);
  assert.equal(result.rows[0].lead.telegramContact?.username.toLowerCase(),'dentalclinic');
});
test('legacy unknown bot and Bridge-rejected peer never inflate the contact directory',async()=>{
  const db=database(),store=new AudienceStore(db.asD1());
  company(db,'bot_unknown','stomaservice_bot','bot_unknown',ORG,'unknown');
  company(db,'rejected','clinic_channel','rejected',ORG,'unknown');
  db.exec("UPDATE lead_radar_companies SET telegram_contact_json=json_set(telegram_contact_json,'$.reason','bridge_not_regular_user') WHERE id='rejected'");
  const result=await store.directory(ORG,{},CAPS,NOW);assert.equal(result.total,0);
});

test('selection survives reload, is bounded and versioned, duplicate retry is safe',async()=>{
  const db=database();const store=new AudienceStore(db.asD1());company(db,'a','DentalAlpha');company(db,'b','DentalBravo');
  const first=await store.save(ORG,{id:A,name:'All niches',version:0,companyIds:['b','a']},NOW);
  assert.deepEqual(first.companyIds,['a','b']);assert.equal(first.version,1);
  assert.equal((await store.save(ORG,{id:A,name:'All niches',version:0,companyIds:['b','a']},NOW)).version,1);
  await store.save(ORG,{id:A,name:'Changed',version:1,companyIds:['a']},NOW);
  await assert.rejects(store.save(ORG,{id:A,name:'Stale',version:1,companyIds:['b']},NOW),/audience_version_conflict/);
  assert.deepEqual((await new AudienceStore(db.asD1()).get(ORG,A))?.companyIds,['a']);
  assert.equal(await store.get('org_other_owner',A),null);
  await assert.rejects(store.resolveScope(ORG,{audienceId:A,audienceVersion:1},['a']),/audience_version_conflict/);
  await assert.rejects(store.resolveScope(ORG,{audienceId:A,audienceVersion:2},['b']),/audience_members_unavailable/);
});
test('duplicate endpoint and different-company conflicts cannot be saved or hidden by a niche filter',async()=>{
  const db=database();const store=new AudienceStore(db.asD1());company(db,'a','SharedClinic','same');company(db,'b','sharedclinic','same');
  await assert.rejects(store.save(ORG,{id:A,name:'Duplicates',version:0,companyIds:['a','b']},NOW),/audience_duplicate_contact/);
  company(db,'c','SharedClinic','different');
  db.sqlite.prepare("UPDATE lead_radar_companies SET category='salon' WHERE id='c'").run();
  const result=await store.directory(ORG,{category:'dentist'},CAPS,NOW);
  assert.equal(result.total,1);assert.equal(result.rows[0].status,'conflict');
  await assert.rejects(store.save(ORG,{id:A,name:'Conflict',version:0,companyIds:['a']},NOW),/audience_contact_blocked_or_conflicted/);
});
test('global DNC hides the endpoint of all copies and cannot enter an audience',async()=>{
  const db=database();const store=new AudienceStore(db.asD1());company(db,'a','SafeClinic','same');company(db,'b','SafeClinic','same');
  db.sqlite.prepare("UPDATE lead_radar_companies SET suppressed=1,lifecycle='do_not_contact' WHERE id='b'").run();
  const page=await store.directory(ORG,{},CAPS,NOW);assert.equal(page.rows[0].status,'blocked');
  assert.equal(page.rows[0].lead.telegramContact,null);assert.deepEqual(page.rows[0].lead.evidence,[]);
  await assert.rejects(store.save(ORG,{id:A,name:'Blocked',version:0,companyIds:['a']},NOW),/audience_contact_blocked_or_conflicted/);
});
test('stale proof is review only and pagination is deterministic, without losing global totals',async()=>{
  const db=database();const store=new AudienceStore(db.asD1());
  for(let i=0;i<23;i++)company(db,`row${i.toString().padStart(2,'0')}`,`Clinic${i.toString().padStart(2,'0')}`);
  const first=await store.directory(ORG,{},CAPS,new Date('2026-10-01T00:00:00Z'));
  const second=await store.directory(ORG,{offset:20},CAPS,NOW);
  assert.equal(first.total,23);assert.equal(first.rows.length,20);assert.ok(first.rows.every((row)=>row.status==='review'));
  assert.equal(second.rows.length,3);assert.ok(second.rows.every((row)=>!first.rows.some((item)=>item.key===row.key)));
  await assert.rejects(store.save(ORG,{id:A,name:'Too many',version:0,companyIds:Array.from({length:501},(_,i)=>`row${i}`)},NOW),/audience_invalid_input/);
});

test('mobile-only corporate candidates are selectable, fixed lines are not, and selection never verifies Telegram', async()=>{
  const db=database(),store=new AudienceStore(db.asD1());
  company(db,'mobile','UnusedOne');company(db,'fixed','UnusedTwo');
  db.exec("UPDATE lead_radar_companies SET telegram_contact_json='null',phone='+998901234567' WHERE id='mobile'");
  db.exec("UPDATE lead_radar_companies SET telegram_contact_json='null',phone='+998711234567' WHERE id='fixed'");
  const page=await store.directory(ORG,{},CAPS,NOW);
  assert.equal(page.total,1);assert.equal(page.rows[0].lead.id,'mobile');assert.equal(page.rows[0].status,'review');
  assert.equal(page.rows[0].lead.telegramContact,null);
  assert.deepEqual((await store.save(ORG,{id:A,name:'Mobile candidates',version:0,companyIds:['mobile']},NOW)).companyIds,['mobile']);
  await assert.rejects(store.save(ORG,{id:A,name:'Fixed',version:1,companyIds:['fixed']},NOW),/audience_members_unavailable/);
});

test('all-page selection larger than a campaign is durable; legacy writes cannot revive stale full selections',async()=>{
  const db=database(),store=new AudienceStore(db.asD1());
  const ids=Array.from({length:55},(_,i)=>`bulk_${i}`);
  for(const id of ids)company(db,id,`Clinic_${id}`);
  const saved=await store.save(ORG,{id:A,name:'Whole audience',version:0,companyIds:ids},NOW);
  assert.equal(saved.companyIds.length,55);
  assert.equal((await new AudienceStore(db.asD1()).get(ORG,A))?.companyIds.length,55);
  assert.equal(db.sqlite.prepare('SELECT json_array_length(company_ids_json) n FROM lead_radar_audiences').get().n,50);
  db.exec("UPDATE lead_radar_audiences SET version=version+1,company_ids_json='[]'");
  assert.deepEqual((await store.get(ORG,A))?.companyIds,[]);
});
