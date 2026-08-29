/** Read-only audit reproductions: synthetic inputs, in-memory SQLite, mocked providers.
 * These assertions confirm CURRENT defects, not desired production behaviour.
 * No network, credentials, real Telegram lookup or message is used.
 */
import assert from 'node:assert/strict';
import { extractPublicBusinessContacts } from '../../functions/platform/lead-radar/public-contact-discovery';
import { extractCompanyPageFacts, verifyCompanyWebsiteBinding } from '../../functions/platform/lead-radar/sources';
import { contactCandidatesForLead } from '../../functions/platform/lead-radar/contact-candidates';
import { recipientContactChoices } from '../../src/shared/lead-radar-recipient-contacts';
import { createContactSourceQueueDependencies } from '../../functions/platform/lead-radar/contact-source-worker';
import { LeadRadarStore } from '../../functions/platform/lead-radar/store';
import { freshAdminDb, migrationFiles } from '../../tests/helpers/bormi-admin-fixture';

const at = new Date('2026-08-29T08:00:00.000Z');
const mobile = '+998901234567';
const landline = '+998711234567';
const identity = { name: 'Audit Example Dental', city: 'Tashkent', phone: mobile, address: 'Amir Temur 123' };
const url = 'https://clinics.uz/catalog/audit-example';
const structured = (entity: object) => `<script type="application/ld+json">${JSON.stringify(entity)}</script>`;
const cases: Array<{ id: string; defect: string; expected: unknown; actual: unknown }> = [];

const plain = await extractPublicBusinessContacts(url,
  `<main><h1>${identity.name}</h1><p>Phone: ${mobile}</p></main>`, identity, at.toISOString());
assert.equal(plain, null);
cases.push({ id: 'P01', defect: 'Matched unstructured listing loses its mobile phone', expected: [mobile], actual: plain });

const point = await extractPublicBusinessContacts(url, structured({
  '@type': 'Dentist', name: identity.name, telephone: landline,
  contactPoint: { '@type': 'ContactPoint', contactType: 'booking', telephone: mobile },
}), { ...identity, phone: landline }, at.toISOString());
assert.equal(point, null);
cases.push({ id: 'P02', defect: 'Matched JSON-LD contactPoint.telephone is ignored', expected: [mobile], actual: point });

const firstParty = extractCompanyPageFacts(new URL('https://audit-clinic.example/'),
  structured({ '@type': 'Dentist', name: identity.name, telephone: mobile }), true, at.toISOString());
assert.equal(firstParty.phone, null);
cases.push({ id: 'P03', defect: 'Bound first-party JSON-LD-only telephone is ignored', expected: mobile, actual: firstParty.phone });

const mixed = `${mobile}; +998911234567`;
const selectable = recipientContactChoices({ phone: mixed, country: 'UZ', telegramContact: null, telegramUrl: null });
const lookup = contactCandidatesForLead({ phone: mixed, country: 'UZ', telegramContact: null, evidence: [], suppressed: false });
assert.equal(selectable.mobilePhones.length, 2);
assert.equal(lookup.filter((c) => c.lookupEligible).length, 0);
cases.push({ id: 'P04', defect: 'Selected mobile candidates do not imply ownership or lookup eligibility',
  expected: 'Explicit separate selectable / ownership / checkable states',
  actual: { selectedPhones: selectable.mobilePhones.length, eligibleChecks: 0, reasons: lookup.map((c) => c.reason) } });

const wrongPage = '<h1>Стоматология</h1><p>Другая клиника</p><p>+998911234567</p><p>Записаться в Telegram: @other_clinic</p>';
const wrongBinding = verifyCompanyWebsiteBinding({ name: 'Стоматология', phone: landline, city: 'Ташкент', address: null },
  [{ url: new URL('https://unrelated-clinic.example/'), html: wrongPage }]);
assert.equal(wrongBinding.verified, true);
cases.push({ id: 'P05', defect: 'Generic Russian category binds an unrelated website despite a conflicting phone',
  expected: { verified: false }, actual: wrongBinding });

async function providerScenario(mode: 'raw-versus-rendered' | 'third-result' | 'budget-cache') {
  const db = freshAdminDb();
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(name TEXT UNIQUE)');
  for (const file of migrationFiles()) db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(file);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch('audit', { niche: 'dentist', city: 'Tashkent', country: 'UZ', offer: 'audit', desiredCount: 5, telegramRequired: true, languages: ['ru'] }, at.toISOString());
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
  const fakeFetch: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(String(input).endsWith('/search') ? 'search' : body.url);
    const web = mode === 'third-result' ? [
      { url: 'https://clinics.uz/catalog/wrong-one' }, { url: 'https://clinics.uz/catalog/wrong-two' }, { url },
    ] : [{ url }];
    return new Response(JSON.stringify(String(input).endsWith('/search') ? { success: true, data: { web } } : {
      success: true, data: {
        rawHtml: mode === 'raw-versus-rendered' ? '<html><div id="app"></div></html>' : body.url === url ? valid : '<main><h1>Unrelated company</h1></main>',
        html: valid, metadata: { statusCode: 200, sourceURL: body.url },
      },
    }));
  };
  const environment = { FIRECRAWL_API_KEY: 'synthetic-no-real-key', LEAD_RADAR_FIRECRAWL_ENABLED: 'true', LEAD_RADAR_FIRECRAWL_MODE: 'fallback', LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: 'audit',
    LEAD_RADAR_FIRECRAWL_DAILY_CREDITS: mode === 'budget-cache' ? '1' : '200' };
  const deps = await createContactSourceQueueDependencies(environment, db.asD1(), 'audit', { now: () => at, robots: async () => null, fetch: fakeFetch });
  for (let i = 0; i < 8; i++) if (!(await deps.discoverLeadContactSources!(job, lead)).pending) break;
  const before = db.sqlite.prepare('SELECT status,reason,sources_json FROM lead_radar_contact_enrichments').get();
  if (mode === 'budget-cache') {
    const restored = await createContactSourceQueueDependencies({ ...environment, LEAD_RADAR_FIRECRAWL_DAILY_CREDITS: '200' }, db.asD1(), 'audit', { now: () => at, robots: async () => null, fetch: fakeFetch });
    assert.equal((await restored.discoverLeadContactSources!(job, lead)).pending, false);
    assert.equal(calls.length, 0);
  }
  return { report: before, calls };
}

const representations = await providerScenario('raw-versus-rendered');
assert.equal((representations.report as { reason: string }).reason, 'no_matching_public_contact');
cases.push({ id: 'P06', defect: 'Non-empty rawHtml shell hides a contact present in html',
  expected: 'audit_booking candidate', actual: representations });

const third = await providerScenario('third-result');
assert.equal((third.report as { reason: string }).reason, 'no_matching_public_contact');
assert.equal(third.calls.includes(url), false);
cases.push({ id: 'P07', defect: 'Valid third search result is discarded and never fetched', expected: 'Inspect next allowed result', actual: third });

const limited = await providerScenario('budget-cache');
assert.equal((limited.report as { reason: string }).reason, 'daily_budget_exhausted');
cases.push({ id: 'P08', defect: 'Cached budget failure prevents resuming after capacity is available',
  expected: 'Resume bounded unfinished source search', actual: limited });

console.log(JSON.stringify({ synthetic: true, networkCalls: 0, productionWrites: 0, reproducedCases: cases.length, cases }, null, 2));
