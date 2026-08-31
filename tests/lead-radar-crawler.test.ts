import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CrawlerError, CrawlerStore, crawlerEnabled, crawlerSchemaReady, crawlerSchemaFingerprint,
  CRAWLER_SCHEMA_FINGERPRINT, parseCrawlerResult, readCrawlerBody } from '../functions/platform/lead-radar/crawler';
import { LEAD_RADAR_CRAWLER_SCHEMA, type LeadRadarCrawlerClaim, type LeadRadarCrawlerResult } from '../src/shared/lead-radar-crawler';
import { firecrawlDigest } from '../functions/platform/lead-radar/firecrawl-client';
import { extractCompanyPageFacts } from '../functions/platform/lead-radar/sources';
import { extractCrawlerResult } from '../tools/lead-radar-crawler/extractor';
import { contactCandidatesForLead } from '../functions/platform/lead-radar/contact-candidates';
import { auditLeadRadarD1Schema } from '../functions/platform/lead-radar/schema-contract';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { SqliteD1 } from './helpers/sqlite-d1';
import { onRequest } from '../functions/api/lead-radar/crawler/[[path]]';
import type { Env } from '../functions/_types';
import { handleCrawlerRequest } from '../functions/api/admin/lead-radar/crawler-control';
import type { OwnerHandlerContext } from '../functions/platform/admin';

const NOW = '2026-08-31T12:00:00.000Z';
const ORG = 'org_crawler_a';
const WORKER = { id: `lrcw_${'a'.repeat(32)}`, org_id: ORG };
const TOKEN = `lrcr_${'a'.repeat(64)}`;
const HTML = '<html><title>Aksu Dental Clinic</title><h1>Aksu Dental Clinic</h1><p>Телефон клиники</p><a href="tel:+998901234567">+998 90 123 45 67</a><p>Напишите нам в Telegram: <a href="https://t.me/AksuDentalClinic">Записаться</a></p></html>';
const migrations = ['0036_lead_radar.sql','0041_lead_radar_search_leases.sql','0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql','0044_lead_radar_telegram_business.sql'];
function migration(db: SqliteD1, name: string): void {
  db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);
}
function database(crawler = true): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations(id TEXT PRIMARY KEY);
    INSERT INTO organizations VALUES ('org_crawler_a'),('org_crawler_b');
    CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  for (const name of migrations) migration(db, name);
  if (crawler) migration(db, '0056_lead_radar_crawler.sql');
  return db;
}
function seed(db: SqliteD1, id = 'company_a', url = 'https://clinic.uz/', orgId = ORG): void {
  const search = `search_${id}`;
  db.sqlite.prepare(`INSERT INTO lead_radar_searches(id,org_id,input_json,status,created_at,phase)
    VALUES(?,?,'{}','ready',?,'completed')`).run(search, orgId, NOW);
  db.sqlite.prepare(`INSERT INTO lead_radar_companies(id,org_id,search_id,canonical_key,name,category,city,country,
    website,phone,score,confidence,priority,score_components_json,signals_json,discovered_at,last_verified_at,updated_at,
    domain,phone_digits,name_city_key,enrichment_status,enrichment_reason)
    VALUES(?,?,?,?,'Aksu Dental Clinic','dentist','Tashkent','Uzbekistan',?,'+998901234567',50,0.8,'P2','[]','[]',?,?,?,?,?,'aksu-dental-clinic:tashkent','enriched','enriched')`)
    .run(id, orgId, search, `domain:${id}.uz`, url, NOW, NOW, NOW, new URL(url).hostname, '998901234567');
}
async function setup(db: SqliteD1): Promise<CrawlerStore> {
  // Production owner_* scopes do not exist in the commerce organizations table.
  db.sqlite.prepare('DELETE FROM organizations WHERE id=?').run(ORG);
  const store = new CrawlerStore(db.asD1());
  await store.registerWorker(ORG, WORKER.id, await firecrawlDigest(TOKEN), 'Fixture collector', NOW);
  return store;
}
async function claimed(store: CrawlerStore, companyId = 'company_a', key = 'request_0001'): Promise<LeadRadarCrawlerClaim> {
  await store.enqueue(ORG, companyId, key, NOW);
  const job = await store.claim(WORKER, NOW); assert.ok(job); return job;
}
type RawPage = Omit<LeadRadarCrawlerResult['pages'][number], 'bytes'> & { html: string };
type RawResult = Omit<LeadRadarCrawlerResult, 'pages' | 'binding' | 'evidence' | 'extractorVersion'> & { pages: RawPage[] };
async function result(job: LeadRadarCrawlerClaim, patch: Partial<RawResult> = {}): Promise<LeadRadarCrawlerResult> {
  return extractCrawlerResult(job, { schema: LEAD_RADAR_CRAWLER_SCHEMA, jobId: job.id, leaseGeneration: job.leaseGeneration,
    identityDigest: job.identityDigest, receiptId: 'receipt_0001', status: 'completed', reason: 'ok',
    pages: [{ requestedUrl: job.url, url: job.url, html: HTML, status: 200, fetchedAt: NOW, sha256: await firecrawlDigest(HTML) }],
    retryAt: null, resumeUrls: [], ...patch });
}
function rejectsCode(code: string) { return (error: unknown) => error instanceof CrawlerError && error.code === code; }

test('crawler schema is independently pinned; additive migration preserves base contract', async t => {
  const db = database(false); t.after(() => db.sqlite.close());
  assert.equal(await crawlerSchemaReady(db.asD1()), false);
  const before = await auditLeadRadarD1Schema(db.asD1(), 'target');
  assert.equal(before.status, 'pass', JSON.stringify(before.issues));
  migration(db, '0056_lead_radar_crawler.sql');
  const after = await auditLeadRadarD1Schema(db.asD1(), 'target');
  assert.deepEqual(after, before);
  assert.equal(await crawlerSchemaFingerprint(db.asD1()), CRAWLER_SCHEMA_FINGERPRINT);
  assert.equal(await crawlerSchemaReady(db.asD1()), true);
  // Wrangler actually removes inline SQL comments before remote D1 execution.
  // Match that real parser, not a hand-written approximation of its behavior.
  const { unstable_splitSqlQuery } = await import('wrangler');
  const source = readFileSync(new URL('../migrations/0056_lead_radar_crawler.sql', import.meta.url), 'utf8');
  const split = unstable_splitSqlQuery(source);
  assert.equal(source.includes('-- Lead Radar uses owner-scoped IDs'), true);
  assert.equal(split.join('\n').includes('-- Lead Radar uses owner-scoped IDs'), false);
  const fromStatements = (statements: string[]): SqliteD1 => {
    const variant = database(false); t.after(() => variant.sqlite.close());
    for (const statement of statements) variant.exec(statement);
    variant.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run('0056_lead_radar_crawler.sql');
    return variant;
  };
  const remoteShape = fromStatements(split);
  assert.equal(await crawlerSchemaFingerprint(remoteShape.asD1()), CRAWLER_SCHEMA_FINGERPRINT);
  assert.equal(await crawlerSchemaReady(remoteShape.asD1()), true);
  const formatted = fromStatements(split.map(statement => statement.replace(/CREATE TABLE/g, 'create table')
    .replace(/CHECK\(/g, 'CHECK ( ').replace(/,\n/g, ',\n\n    ')));
  assert.equal(await crawlerSchemaFingerprint(formatted.asD1()), CRAWLER_SCHEMA_FINGERPRINT);
  for (const [label, changed] of [
    ['quoted case', source.replace("'queued'", "'Queued'")],
    ['quoted whitespace', source.replace("'queued'", "'queued  '")],
    ['quoted comment marker', source.replace("'queued'", "'queued--not-a-comment'")],
    ['CHECK semantics', source.replace('attempts BETWEEN 0 AND 12', 'attempts BETWEEN 0 AND 11')],
  ]) {
    const drift = fromStatements(unstable_splitSqlQuery(changed));
    assert.notEqual(await crawlerSchemaFingerprint(drift.asD1()), CRAWLER_SCHEMA_FINGERPRINT, label);
    assert.equal(await crawlerSchemaReady(drift.asD1()), false, label);
  }
  db.exec('DROP INDEX idx_lr_crawler_jobs_ready');
  assert.equal(await crawlerSchemaReady(db.asD1()), false);
});

test('contact-only parsing preserves canonical contacts, named-person and footer guards without sales signals', () => {
  const pages = [HTML,
    `${HTML}<p>Ищем администратора. Оставьте заявку. Онлайн-запись.</p>`,
    '<h1>Aksu Dental Clinic</h1><script type="application/ld+json">{"@type":"Person","name":"Ivan Petrov","jobTitle":"Директор","sameAs":"https://t.me/ivan_petrov"}</script>',
    '<h1>Aksu Dental Clinic</h1><footer>Сайт разработан студией Web Vendor <a href="tel:+998909999999">+998909999999</a><a href="https://t.me/vendor_bot">Разработка сайтов</a></footer>',
  ];
  const expected = { name: 'Aksu Dental Clinic', phone: '+998901234567' };
  const projection = (facts: ReturnType<typeof extractCompanyPageFacts>) => ({
    phone: facts.phone, genericEmail: facts.genericEmail, telegramUrl: facts.telegramUrl,
    telegram: facts.telegramContacts.map(c => [c.url, c.type, c.messageable]),
    people: facts.decisionMakers.map(p => [p.name, p.role, p.telegramUrl, p.contactType]),
    facts: facts.evidence.filter(f => !f.fieldPath.startsWith('signals.'))
      .map(f => [f.fieldPath, f.value, f.sourceUrl, f.classification, f.confidence]),
  });
  for (const html of pages) for (const bound of [true, false]) {
    const full = extractCompanyPageFacts(new URL('https://clinic.uz/'), html, bound, NOW, expected);
    const contacts = extractCompanyPageFacts(new URL('https://clinic.uz/'), html, bound, NOW, expected, { includeSignals: false });
    assert.deepEqual(projection(contacts), projection(full));
    assert.deepEqual(contacts.signals, []);
  }
});
test('feature and token are separate and tenant scoped; registration is replayable but cannot reactivate', async t => {
  const db = database(); t.after(() => db.sqlite.close()); const store = await setup(db);
  assert.equal(crawlerEnabled({ LEAD_RADAR_CRAWLER_ENABLED: 'true' }, ORG), false);
  assert.equal(crawlerEnabled({ LEAD_RADAR_CRAWLER_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: ORG }, ORG), true);
  assert.equal(await store.authenticate('owner-admin-token'), null);
  assert.deepEqual({ ...await store.authenticate(TOKEN) }, WORKER);
  await setup(db);
  db.exec('UPDATE lead_radar_crawler_workers SET revoked=1');
  assert.equal(await store.authenticate(TOKEN), null);
  await assert.rejects(setup(db), rejectsCode('crawler_worker_conflict'));
});
test('owner enqueue is idempotent, uses saved website, rejects busy and cross-tenant companies', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); seed(db, 'company_b', 'https://other.uz/');
  const store = await setup(db);
  const first = await store.enqueue(ORG, 'company_a', 'request_0001', NOW);
  assert.equal(first.replayed, false);
  assert.deepEqual(await store.enqueue(ORG, 'company_a', 'request_0001', NOW), { ...first, replayed: true });
  await assert.rejects(store.enqueue(ORG, 'company_b', 'request_0001', NOW), rejectsCode('crawler_idempotency_conflict'));
  await assert.rejects(store.enqueue(ORG, 'company_a', 'request_0002', NOW), rejectsCode('crawler_busy'));
  await assert.rejects(store.enqueue('org_crawler_b', 'company_a', 'request_0003', NOW), rejectsCode('crawler_company_unavailable'));
});
test('claim fences one host, leaves independent domains available, and increments expired generation', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); seed(db, 'company_b'); seed(db, 'company_c', 'https://other.uz/');
  const store = await setup(db);
  await store.enqueue(ORG, 'company_a', 'request_0001', NOW);
  await store.enqueue(ORG, 'company_b', 'request_0002', NOW);
  await store.enqueue(ORG, 'company_c', 'request_0003', NOW);
  const a = await store.claim(WORKER, NOW); assert.ok(a);
  const b = await store.claim(WORKER, NOW); assert.ok(b); assert.notEqual(new URL(a.url).hostname, new URL(b.url).hostname);
  assert.equal(await store.claim(WORKER, NOW), null);
  const resumed = await store.claim(WORKER, '2026-08-31T12:04:00.000Z'); assert.ok(resumed);
  assert.ok(resumed.leaseGeneration >= 1);
  await assert.rejects(store.heartbeat(WORKER, a.id, 0, NOW), rejectsCode('crawler_lease_lost'));
});
test('isolated parser observations create candidates, not sender permission; receipt replays after lease expiry', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
  const job = await claimed(store); const payload = await result(job);
  const ack = await store.accept(WORKER, payload, NOW);
  assert.equal(ack.replayed, false); assert.ok(ack.job.contactsFound >= 1);
  const stored = await new LeadRadarStore(db.asD1()).getLeadForEnrichment(ORG, 'company_a'); assert.ok(stored);
  const candidates = contactCandidatesForLead({ ...stored.lead, country: 'Uzbekistan', suppressed: false });
  assert.ok(candidates.some(c => c.kind === 'phone' && c.ownership === 'company' && c.lookupEligible));
  assert.equal(stored.lead.telegramContact, null);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_jobs').get()!.n, 0);
  const replay = await store.accept(WORKER, payload, '2026-09-01T12:00:00.000Z');
  assert.equal(replay.replayed, true); assert.deepEqual(replay.job, ack.job);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_crawler_receipts').get()!.n, 1);
  await assert.rejects(store.accept(WORKER, { ...payload, reason: 'partial_result' }, NOW), rejectsCode('crawler_receipt_conflict'));
});
test('changed identity, DNC, revoked worker and cancelled lease cannot admit results', async t => {
  for (const sql of ["UPDATE lead_radar_companies SET phone='+998909999999'",
    "UPDATE lead_radar_companies SET lifecycle='do_not_contact'", 'UPDATE lead_radar_crawler_workers SET revoked=1']) {
    const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
    const job = await claimed(store); db.exec(sql);
    await assert.rejects(store.accept(WORKER, await result(job), NOW), CrawlerError);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_evidence').get()!.n, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_crawler_receipts').get()!.n, 0);
  }
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
  const job = await claimed(store); await store.cancel(ORG, job.id, NOW);
  await assert.rejects(store.accept(WORKER, await result(job), NOW), rejectsCode('crawler_lease_lost'));
});
test('suppression ledger added after claim prevents evidence even when company flag is unchanged', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db); const job = await claimed(store);
  db.sqlite.prepare(`INSERT INTO lead_radar_suppressions(org_id,canonical_key,suppressed_at,reason)
    VALUES(?,?,?,'do_not_contact')`).run(ORG, 'domain:company_a.uz', NOW);
  await assert.rejects(store.accept(WORKER, await result(job), NOW), rejectsCode('crawler_identity_changed'));
});
test('one-hour source pause survives new Store, preserves partial evidence and does not block another host', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); seed(db, 'company_b', 'https://other.uz/');
  const store = await setup(db); const job = await claimed(store);
  const retryAt = '2026-08-31T13:00:00.000Z';
  const ack = await store.accept(WORKER, await result(job, { status: 'deferred', reason: 'source_rate_limited',
    retryAt, resumeUrls: ['https://clinic.uz/contacts'] }), NOW);
  assert.ok(ack.job.contactsFound > 0); assert.equal(ack.job.status, 'deferred');
  await store.enqueue(ORG, 'company_b', 'request_0002', NOW);
  const restarted = new CrawlerStore(db.asD1());
  const independent = await restarted.claim(WORKER, '2026-08-31T12:01:00.000Z'); assert.ok(independent);
  assert.equal(independent.companyId, 'company_b');
  await restarted.cancel(ORG, independent.id, NOW);
  assert.equal(await restarted.claim(WORKER, '2026-08-31T12:59:59.999Z'), null);
  assert.equal((await restarted.claim(WORKER, retryAt))?.id, job.id);
});
test('foreign pages, unsupported extractor, stale generation and fake trust fields cannot grant contacts', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db); const job = await claimed(store);
  const payload = await result(job);
  const untrusted = parseCrawlerResult({ ...payload, ready_to_send: true, ownership: 'company' });
  assert.equal('ready_to_send' in untrusted, false);
  await assert.rejects(store.accept(WORKER, { ...payload, pages: [{ ...payload.pages[0], url: 'https://evil.uz/' }] }, NOW), rejectsCode('crawler_invalid_result'));
  assert.throws(() => parseCrawlerResult({ ...payload, extractorVersion: 'unknown' }), rejectsCode('crawler_invalid_result'));
  assert.throws(() => parseCrawlerResult({ ...payload, pages: [{ ...payload.pages[0], html: HTML }] }), rejectsCode('crawler_invalid_result'));
  await assert.rejects(store.accept(WORKER, { ...payload, leaseGeneration: 2 }, NOW), rejectsCode('crawler_lease_lost'));
  const html = '<html><h1>Unrelated Auto Company</h1><a href="tel:+998909999999">Phone</a></html>';
  const negative = await store.accept(WORKER, await result(job, { pages: [{ requestedUrl: job.url,
    url: job.url, status: 200, fetchedAt: NOW, html, sha256: await firecrawlDigest(html) }] }), NOW);
  assert.equal(negative.job.contactsFound, 0); assert.equal(negative.job.reason, 'no_relevant_evidence');
});
test('dense evidence uses one fenced insert and keeps complete route below the free D1 query budget', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db); const job = await claimed(store);
  const pages = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
    const url = new URL(`/contacts-${index}`, job.url).href;
    const phones = Array.from({ length: 8 }, (_, n) => `<p>Clinic phone <a href="tel:+99890${1234567 + n}">+99890${1234567 + n}</a></p>`).join('');
    const contacts = Array.from({ length: 12 }, (_, n) => `<div><p>Напишите нам в Telegram: <a href="https://t.me/AksuClinic${index}_${n}">Записаться в клинику</a></p></div>`).join('');
    const html = `<html><h1>Aksu Dental Clinic</h1>${phones}${contacts}</html>`;
    return { url, requestedUrl: url, status: 200 as const, fetchedAt: NOW, html, sha256: await firecrawlDigest(html) };
  }));
  const payload = await result(job, { pages, status: 'deferred', reason: 'source_rate_limited',
    retryAt: '2026-08-31T13:00:00.000Z', resumeUrls: [job.url] });
  const d1 = db.asD1(); const prepare = d1.prepare.bind(d1); const batch = d1.batch.bind(d1);
  let prepared = 0; let batchStatements = 0;
  d1.prepare = sql => { prepared++; return prepare(sql); };
  d1.batch = (async statements => { batchStatements += statements.length; return batch(statements); }) as D1Database['batch'];
  const response = await onRequest({ request: new Request('https://gptbot.uz/api/lead-radar/crawler/result', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(payload),
  }), env: { GPTBOT_DRAFTS_DB: d1, LEAD_RADAR_CRAWLER_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: ORG } as Env,
  params: { path: ['result'] } } as Parameters<typeof onRequest>[0]);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(db.value('SELECT COUNT(*) FROM lead_radar_evidence'), 60, 'exercise every admitted evidence slot');
  assert.equal(batchStatements, 4, 'receipt, grouped evidence, host deadline and terminal state');
  assert.ok(prepared <= 12, `complete authenticated route prepared ${prepared} queries`);
  t.diagnostic(`Crawler dense result: 60 evidence rows, ${prepared} statements including schema/auth, ${batchStatements} in atomic batch`);
});

test('v2 admits only bounded compact observations and never worker-supplied permissions', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
  const job = await claimed(store); const payload = await result(job);
  assert.equal(job.identity.name, 'Aksu Dental Clinic');
  assert.equal(job.identityDigest, await firecrawlDigest(JSON.stringify(job.identity)));
  const fact = { pageIndex: 0, fieldPath: 'company_contacts.phone', value: '+998901234567', confidence: 0.9 };
  for (const patch of [
    { schema: 'gptbot.lead-radar.crawler.v1' },
    { status: 'failed' },
    { status: 'completed', pages: [], binding: null, evidence: [] },
    { status: 'partial', pages: [], binding: null, evidence: [] },
    { binding: null, evidence: [fact] },
    { binding: { method: 'phone', pageIndex: 5 } },
    { evidence: Array.from({ length: 56 }, () => fact) },
    { evidence: [{ ...fact, pageIndex: -1 }] },
    { evidence: [{ ...fact, confidence: 2 }] },
    { evidence: [{ ...fact, fieldPath: 'ready_to_send', value: 'true' }] },
    { evidence: [{ ...fact, fieldPath: 'company_contacts.generic_email', value: 'ivan@clinic.uz' }] },
    { evidence: [{ ...fact, fieldPath: 'web.telegram.business', value: 'https://t.me/example_bot' }] },
    { evidence: [{ ...fact, fieldPath: 'web.telegram.business', value: 'https://t.me/share' }] },
    { pages: [{ ...payload.pages[0], bytes: 131073 }] },
    { pages: [{ ...payload.pages[0], sha256: 'invalid' }] },
  ]) assert.throws(() => parseCrawlerResult({ ...payload, ...patch }), CrawlerError);
  assert.doesNotThrow(() => parseCrawlerResult({ ...payload, evidence: [{ ...fact,
    fieldPath: 'web.telegram.business', value: 'https://t.me/m/opaque-token-endingbot' }] }));
  const clean = parseCrawlerResult({ ...payload, authorized: true, evidence: [{ ...fact, ready: true,
    sourceType: 'manual', classification: 'owner_approved', id: 'forged' }] });
  assert.deepEqual(Object.keys(clean.evidence[0]).sort(), ['confidence', 'fieldPath', 'pageIndex', 'value']);
  const ack = await store.accept(WORKER, clean, NOW); assert.equal(ack.accepted, true);
  const admitted = db.sqlite.prepare('SELECT field_path,source_type,classification,id FROM lead_radar_evidence').all();
  assert.ok(admitted.every(f => f.source_type === 'company_website'
    && f.classification === (f.field_path === 'web.website' ? 'fact' : 'company_data') && String(f.id).startsWith('ev_crc_')));
  assert.ok(Buffer.byteLength(JSON.stringify(clean)) < 65536);
});

test('Pages admission does not import or run the full HTML or phone metadata parser', () => {
  const source = readFileSync(new URL('../functions/platform/lead-radar/crawler.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/(sources|firecrawl-client)['"]|libphonenumber|extractCompanyPageFacts|page\.html/);
});

test('receipt and evidence roll back together on DB failure', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db); const job = await claimed(store);
  db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON lead_radar_evidence BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  await assert.rejects(store.accept(WORKER, await result(job), NOW));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_crawler_receipts').get()!.n, 0);
  assert.equal((await store.job(ORG, job.id))?.status, 'running');
});

test('a delayed immutable deferred receipt remains valid after its source pause expires', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
  const job = await claimed(store); const payload = await result(job, { status: 'deferred',
    reason: 'source_rate_limited', retryAt: '2026-08-31T12:00:20.000Z', resumeUrls: [job.url] });
  const delayed = '2026-08-31T12:00:30.000Z';
  const ack = await store.accept(WORKER, payload, delayed);
  assert.equal(ack.accepted, true); assert.ok(ack.job.contactsFound > 0);
  assert.equal(ack.job.availableAt, delayed);
  assert.equal((await store.accept(WORKER, payload, delayed)).replayed, true);
  const next = await store.claim(WORKER, delayed);
  assert.equal(next?.id, job.id); assert.equal(next?.leaseGeneration, 2);
});
test('duplicate in-flight receipt cannot reinsert evidence deleted after first acceptance', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
  const job = await claimed(store); const payload = await result(job);
  const d1 = db.asD1(); const originalBatch = d1.batch.bind(d1); let intercepted = false;
  d1.batch = (async statements => {
    if (!intercepted) {
      intercepted = true;
      await store.accept(WORKER, payload, NOW);
      db.exec("UPDATE lead_radar_companies SET lifecycle='do_not_contact'; DELETE FROM lead_radar_evidence;");
    }
    return originalBatch(statements);
  }) as D1Database['batch'];
  const replay = await store.accept(WORKER, payload, NOW);
  assert.equal(replay.replayed, true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lead_radar_evidence').get()!.n, 0);
});
test('the live twelfth attempt survives another collector poll', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db);
  await store.enqueue(ORG, 'company_a', 'request_0012', NOW);
  db.exec('UPDATE lead_radar_crawler_jobs SET attempts=11');
  const job = await store.claim(WORKER, NOW); assert.ok(job);
  assert.equal(await store.claim(WORKER, '2026-08-31T12:00:01.000Z'), null);
  assert.equal((await store.job(ORG, job.id))?.status, 'running');
  assert.equal((await store.accept(WORKER, await result(job), NOW)).accepted, true);
});
test('owner can revoke and cancel with acquisition disabled; registration stays blocked', async t => {
  const db = database(); t.after(() => db.sqlite.close()); seed(db); const store = await setup(db); const job = await claimed(store);
  const ctx = { db: db.asD1(), env: { LEAD_RADAR_CRAWLER_ENABLED: 'false' }, requestId: 'test',
    request: new Request('https://gptbot.uz/api/admin/lead-radar/crawler/jobs', { method: 'POST', body: '{}',
      headers: { 'content-type': 'application/json' } }) } as OwnerHandlerContext;
  assert.equal((await handleCrawlerRequest(ctx, ['crawler','workers',WORKER.id,'revoke'], ORG)).status, 200);
  assert.equal(await store.authenticate(TOKEN), null);
  ctx.request = new Request(ctx.request.url, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  assert.equal((await handleCrawlerRequest(ctx, ['crawler','jobs',job.id,'cancel'], ORG)).status, 200);
  assert.equal((await store.job(ORG, job.id))?.status, 'cancelled');
  assert.equal((await handleCrawlerRequest(ctx, ['crawler','workers'], ORG)).status, 503);
});
test('input body is bounded during stream, validates JSON and rejects unsupported encoding', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(2048)); }, cancel() { cancelled = true; } });
  await assert.rejects(readCrawlerBody(new Request('https://gptbot.uz/api/fixture', { method: 'POST', body,
    headers: { 'content-type': 'application/json' }, duplex: 'half' } as RequestInit), 1024), rejectsCode('crawler_payload_too_large'));
  assert.equal(cancelled, true);
  await assert.rejects(readCrawlerBody(new Request('https://gptbot.uz', { method: 'POST', body: '{}',
    headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } })), rejectsCode('crawler_invalid_body'));
  assert.deepEqual(await readCrawlerBody(new Request('https://gptbot.uz', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })), {});
});
test('collector route rejects owner tokens, disabled configuration and wrong tenant without network calls', async t => {
  const db = database(); t.after(() => db.sqlite.close()); await setup(db);
  const env = { GPTBOT_DRAFTS_DB: db.asD1(), LEAD_RADAR_CRAWLER_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: ORG } as Env;
  async function call(token: string, overrides: Partial<Env> = {}) {
    return onRequest({ request: new Request('https://gptbot.uz/api/lead-radar/crawler/claim', { method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ schema: LEAD_RADAR_CRAWLER_SCHEMA }) }),
      env: { ...env, ...overrides }, params: { path: 'claim' } } as Parameters<typeof onRequest>[0]);
  }
  assert.equal((await call('owner-token')).status, 401);
  assert.equal((await call(`lrcr_${'b'.repeat(64)}`)).status, 401);
  assert.equal((await call(TOKEN, { LEAD_RADAR_CRAWLER_ENABLED: 'false' })).status, 503);
  assert.equal((await call(TOKEN, { LEAD_RADAR_ALLOWED_ORGS: 'org_crawler_b' })).status, 503);
  const response = await call(TOKEN); assert.equal(response.status, 200); assert.equal((await response.json() as { job: unknown }).job, null);
});

test('real Python engine fixtures pass TypeScript validation and fenced acceptance, including deferred resume', async t => {
  const fixture = JSON.parse(readFileSync(new URL('../tools/lead-radar-crawler/tests/fixtures/crawler-protocol.json', import.meta.url), 'utf8')) as {
    company: { id: string; name: string; website: string; phone: string; city: string; address: string };
    cases: Array<{ name: string; job: LeadRadarCrawlerClaim; result: LeadRadarCrawlerResult }>;
  };
  for (const item of fixture.cases) assert.doesNotThrow(() => parseCrawlerResult(item.result), item.name);
  for (const item of fixture.cases.filter(c => c.name !== 'resumed_with_fresh_root')) {
    const db = database(); t.after(() => db.sqlite.close()); seed(db, fixture.company.id, fixture.company.website);
    db.sqlite.prepare('UPDATE lead_radar_companies SET name=?,address=?,phone=?,city=?').run(
      fixture.company.name, fixture.company.address, fixture.company.phone, fixture.company.city);
    const store = await setup(db);
    const start = new Date(Date.parse(item.job.deadlineAt) - 120_000).toISOString();
    await store.enqueue(ORG, fixture.company.id, `request_${item.name}`, start);
    const job = await store.claim(WORKER, start); assert.ok(job);
    const body = parseCrawlerResult({ ...item.result, jobId: job.id, identityDigest: job.identityDigest, leaseGeneration: job.leaseGeneration });
    const ack = await store.accept(WORKER, body, new Date(Date.parse(start) + 5_000).toISOString());
    assert.equal(ack.accepted, true, item.name);
    if (item.name === 'deferred_with_pages') {
      assert.ok(ack.job.contactsFound > 0); assert.equal(ack.job.status, 'deferred');
      const resumed = fixture.cases.find(c => c.name === 'resumed_with_fresh_root')!;
      const resumeAt = new Date(Date.parse(resumed.job.deadlineAt) - 120_000).toISOString();
      const next = await store.claim(WORKER, resumeAt); assert.ok(next);
      assert.equal(next.id, job.id); assert.equal(next.leaseGeneration, 2);
      const nextBody = parseCrawlerResult({ ...resumed.result, jobId: next.id,
        identityDigest: next.identityDigest, leaseGeneration: next.leaseGeneration });
      const final = await store.accept(WORKER, nextBody, new Date(Date.parse(resumeAt) + 5_000).toISOString());
      assert.equal(final.job.status, 'completed');
      assert.ok(final.job.contactsFound > ack.job.contactsFound, 'new contact survives fresh root binding on resume');
    }
  }
});
