import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPublicBusinessContacts } from '../functions/platform/lead-radar/public-contact-discovery';
import { extractCompanyPageFacts, verifyCompanyWebsiteBinding } from '../functions/platform/lead-radar/sources';
import { createContactSourceQueueDependencies } from '../functions/platform/lead-radar/contact-source-worker';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { consumeLeadRadarQueueMessage } from '../functions/platform/lead-radar/queue';
import { freshAdminDb, migrationFiles } from './helpers/bormi-admin-fixture';

const at = new Date('2026-08-29T08:00:00.000Z');
const mobile = '+998901234567', landline = '+998711234567';
const identity = { name: 'Audit Example Dental', city: 'Tashkent', phone: mobile, address: 'Amir Temur 123' };
const url = 'https://clinics.uz/catalog/audit-example';
const structured = (entity: object) => `<script type="application/ld+json">${JSON.stringify(entity)}</script>`;

test('matched unstructured business listing retains its published mobile, not sidebar phones', async () => {
  const source = await extractPublicBusinessContacts(url,
    `<main><h1>${identity.name}</h1><p>Phone: ${mobile}</p><aside>Other: +998911234567</aside></main>`, identity, at.toISOString());
  assert.deepEqual(source?.candidates.map(c => c.value), [mobile]);
  assert.equal(source?.candidates[0].ownership, 'company');
  assert.equal(source?.candidates[0].resolution, undefined);
});

test('matched JSON-LD includes corporate contactPoint telephone but excludes personal points and other entities', async () => {
  const source = await extractPublicBusinessContacts(url, structured({ '@graph': [
    { '@type': 'Dentist', name: identity.name, telephone: landline, contactPoint: [
      { '@type': 'ContactPoint', contactType: 'booking', telephone: mobile },
      { '@type': 'ContactPoint', contactType: 'personal owner', telephone: '+998911234567' },
    ] },
    { '@type': 'Dentist', name: 'Other Brand', telephone: '+998931234567' },
  ] }), { ...identity, phone: landline }, at.toISOString());
  assert.deepEqual(source?.candidates.map(c => c.value), [mobile]);
});

test('contactPoint can provide the independent phone anchor for structured identity', async () => {
  const source = await extractPublicBusinessContacts(url, structured({ '@type': 'Dentist', name: identity.name,
    contactPoint: { '@type': 'ContactPoint', contactType: 'booking', telephone: mobile, url: 'https://t.me/audit_booking' },
  }), identity, at.toISOString());
  assert.ok(source?.candidates.some(c => c.value === mobile));
  assert.ok(source?.candidates.some(c => c.value === 'https://t.me/audit_booking'));
});

test('bound first-party JSON-LD-only corporate phone is extracted with evidence, never auto-approved', () => {
  const html = structured({ '@type': 'Dentist', name: identity.name, contactPoint: { contactType: 'booking', telephone: mobile } });
  const facts = extractCompanyPageFacts(new URL('https://audit-clinic.example/'), html, true, at.toISOString());
  assert.equal(facts.phone, mobile);
  assert.ok(facts.evidence.some(e => e.fieldPath === 'company_contacts.phone' && e.value === mobile));
  assert.equal(extractCompanyPageFacts(new URL('https://audit-clinic.example/'), html, false, at.toISOString()).phone, null);
});

test('generic company names and conflicting published phones cannot establish a website binding', () => {
  for (const name of ['Стоматология', 'Семейная стоматология', 'Dental Clinic', identity.name]) {
    const binding = verifyCompanyWebsiteBinding({ ...identity, name, phone: landline }, [{
      url: new URL('https://unrelated-clinic.example/'), html: `<h1>${name}</h1><p>+998911234567</p>`,
    }]);
    assert.equal(binding.verified, false, name);
  }
  for (const name of ['Стоматология', 'Dental Clinic']) {
    assert.equal(verifyCompanyWebsiteBinding({ name, phone: null }, [{
      url: new URL('https://unrelated-clinic.example/'), html: `<h1>${name}</h1>`,
    }]).verified, false, name);
  }
});

test('name-only mention in unrelated body and script-only phone do not verify another business', () => {
  assert.equal(verifyCompanyWebsiteBinding(identity, [{ url: new URL('https://unrelated-clinic.example/'),
    html: `<h1>Another Brand</h1><p>Competitor: ${identity.name}</p><script>const phone = '${mobile}'</script>`,
  }]).verified, false);
});

test('website binding handles multiple published expected phones without concatenating them', () => {
  const binding = verifyCompanyWebsiteBinding({ ...identity, phone: `${landline}, ${mobile}` }, [{
    url: new URL('https://audit-clinic.example/contact'),
    html: `<h1>${identity.name}</h1><a href="tel:${mobile}">${mobile}</a>`,
  }]);
  assert.deepEqual(binding, {
    verified: true,
    method: 'phone',
    sourceUrl: 'https://audit-clinic.example/contact',
  });
});

function providerFixture(mode: 'representations' | 'third-result' | 'budget') {
  const db = freshAdminDb();
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(name TEXT UNIQUE)');
  for (const file of migrationFiles()) db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(file);
  return (async () => {
    const store = new LeadRadarStore(db.asD1());
    const searchId = await store.createSearch('audit', { niche: 'dentist', city: 'Tashkent', country: 'UZ', offer: 'audit',
      desiredCount: 5, telegramRequired: true, languages: ['ru'] }, at.toISOString());
    db.sqlite.prepare(`INSERT INTO lead_radar_companies(id,org_id,search_id,canonical_key,name,category,city,country,address,phone,score,confidence,priority,score_components_json,signals_json,discovered_at,last_verified_at,updated_at)
      VALUES ('company','audit',?,'fixture',?,'dentist',?,'UZ',?,?,50,.8,'P3','[]','[]',?,?,?)`)
      .run(searchId, identity.name, identity.city, identity.address, mobile, at.toISOString(), at.toISOString(), at.toISOString());
    const created = await store.createJob('audit', searchId, 'company', 'enrichment', `contact-resolve:${mode}`, at.toISOString());
    db.sqlite.prepare("UPDATE lead_radar_jobs SET status='running',lease_owner='owner',lease_expires_at=?,lease_generation=1 WHERE id=?")
      .run(new Date(at.getTime() + 600_000).toISOString(), created.id);
    const job = (await store.getJob(created.id))!;
    const lead = (await store.getLeadForEnrichment('audit', 'company'))!.lead;
    const calls: string[] = [];
    const valid = structured({ '@type': 'Dentist', name: identity.name, telephone: mobile, sameAs: 'https://t.me/audit_booking' });
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body));
      const search = String(input).endsWith('/search');
      calls.push(search ? 'search' : body.url);
      const web = mode === 'third-result' ? [
        { url: 'https://clinics.uz/catalog/wrong-one' }, { url: 'https://clinics.uz/catalog/wrong-two' }, { url },
      ] : [{ url }];
      const html = body.url === url ? valid : '<main><h1>Unrelated company</h1></main>';
      return new Response(JSON.stringify(search ? { success: true, data: { web } } : { success: true, data: {
        rawHtml: mode === 'representations' ? '<html><div id="app"></div></html>' : html,
        html, metadata: { statusCode: 200, sourceURL: body.url },
      } }));
    };
    const environment = { FIRECRAWL_API_KEY: 'synthetic-no-real-key', LEAD_RADAR_FIRECRAWL_ENABLED: 'true',
      LEAD_RADAR_FIRECRAWL_MODE: 'fallback', LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: 'audit', LEAD_RADAR_FIRECRAWL_DAILY_CREDITS: mode === 'budget' ? '1' : '200' };
    const create = (dailyCredits = environment.LEAD_RADAR_FIRECRAWL_DAILY_CREDITS) => createContactSourceQueueDependencies(
      { ...environment, LEAD_RADAR_FIRECRAWL_DAILY_CREDITS: dailyCredits }, db.asD1(), 'audit', { now: () => at, robots: async () => null, fetch });
    return { db, job, lead, calls, create, store, searchId };
  })();
}

for (const mode of ['representations', 'third-result'] as const) test(`source discovery retains contacts: ${mode}`, async () => {
  const f = await providerFixture(mode), deps = await f.create();
  for (let i = 0; i < 5; i++) if (!(await deps.discoverLeadContactSources!(f.job, f.lead)).pending) break;
  const sources = String(f.db.value('SELECT sources_json FROM lead_radar_contact_enrichments'));
  assert.ok(sources.includes('https://t.me/audit_booking'), sources);
  assert.ok(f.calls.includes(url));
  const count = f.calls.length;
  assert.equal((await deps.discoverLeadContactSources!(f.job, f.lead)).pending, false);
  assert.equal(f.calls.length, count, 'a completed receipt is reused without rebilling');
});

test('budget shortage stays pending and can resume once authorized capacity is available', async () => {
  const f = await providerFixture('budget'), limited = await f.create();
  assert.equal((await limited.discoverLeadContactSources!(f.job, f.lead)).pending, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.value('SELECT status FROM lead_radar_contact_enrichments'), 'limited');
  const restored = await f.create('200');
  for (let i = 0; i < 5; i++) if (!(await restored.discoverLeadContactSources!(f.job, f.lead)).pending) break;
  assert.ok(f.calls.includes(url));
  assert.equal(f.db.value('SELECT status FROM lead_radar_contact_enrichments'), 'complete');
});

test('daily source budget waiting survives the Telegram-check 30-minute timeout', async () => {
  const f = await providerFixture('budget');
  f.db.sqlite.prepare("UPDATE lead_radar_jobs SET status='queued',lease_owner=NULL,lease_expires_at=NULL,created_at=? WHERE id=?")
    .run(new Date(at.getTime() - 60 * 60_000).toISOString(), f.job.id);
  let checked = 0;
  const result = await consumeLeadRadarQueueMessage(f.db.asD1(), { schema: 'gptbot.lead-radar.job.v1', job_id: f.job.id },
    { send: async () => {} }, { now: () => at, discoverLeadContactSources: async () => ({ pending: true,
      reason: 'contact_sources_daily_budget_exhausted', retryAfterSeconds: 900 }),
    resolveLeadContacts: async () => { checked++; return { pending: false }; } });
  assert.equal(result.outcome, 'retry_wait');
  assert.equal(f.db.value('SELECT status FROM lead_radar_jobs WHERE id=?', f.job.id), 'retry_wait');
  assert.equal(f.db.value('SELECT last_error_code FROM lead_radar_jobs WHERE id=?', f.job.id), 'contact_sources_daily_budget_exhausted');
  assert.equal(checked, 0);
});

test('exhausted provider budget is not reported as exhausted public sources', async () => {
  const f = await providerFixture('budget');
  f.db.sqlite.prepare("UPDATE lead_radar_searches SET input_json=json_set(input_json,'$.searchGoal','telegram_contacts') WHERE id=?").run(f.searchId);
  assert.equal(await f.store.deadLetterJob('audit', f.job.id, 'owner', 'contact_sources_company_budget_exhausted', at.toISOString(), 1), true);
  f.db.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools(org_id,search_id,candidates_json,candidate_count,cursor,target,created_at,expires_at,updated_at)
    VALUES ('audit',?,'[]',1,1,5,?,?,?)`).run(f.searchId, at.toISOString(), new Date(at.getTime()+3_600_000).toISOString(), at.toISOString());
  await f.store.refreshSearchFunnel('audit', f.searchId, at.toISOString());
  assert.equal(f.db.value('SELECT stop_reason FROM lead_radar_candidate_pools'), 'provider_budget');
});
