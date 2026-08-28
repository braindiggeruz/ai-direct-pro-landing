import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FIRECRAWL_DIRECTORY_DOMAINS, FirecrawlClient, FirecrawlError, firecrawlConfig, firecrawlPublicUrl } from '../functions/platform/lead-radar/firecrawl-client';
import { createFirecrawlQueueDependencies, selectFirecrawlContactPages } from '../functions/platform/lead-radar/firecrawl-enrichment';
import { FirecrawlStore, type FirecrawlJobContext } from '../functions/platform/lead-radar/firecrawl-store';
import type { LeadRadarJob } from '../functions/platform/lead-radar/types';
import { SqliteD1 } from './helpers/sqlite-d1';

const AT = '2026-08-28T12:00:00.000Z';
const ENV = { FIRECRAWL_API_KEY: 'fixture-only-never-log-this-key', LEAD_RADAR_FIRECRAWL_ENABLED: 'true',
  LEAD_RADAR_FIRECRAWL_MODE: 'fallback', LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: 'org_fixture' };
const CTX: FirecrawlJobContext = { orgId: 'org_fixture', searchId: 'search1', jobId: 'job1', companyId: 'company1', leaseOwner: 'lease1', leaseGeneration: 1 };
const EXPECTED = { name: 'Example Dental Clinic', phone: '+998711234567', city: 'Ташкент', address: 'Ташкент' };
const NONE = { facts: null, reason: 'source_unavailable' as const, retryable: true };
const NOW = () => new Date(AT);
const HTML = `<html><header>Example Dental Clinic — Ташкент</header><p>+998711234567</p>
<script type="application/ld+json">{"@type":"Dentist","name":"Example Dental Clinic","sameAs":["https://t.me/example_dental"]}</script>
<footer>Telegram клиники <a href="https://t.me/example_dental">Запись в клинику</a></footer></html>`;

function database() {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE lead_radar_jobs (id TEXT PRIMARY KEY, org_id TEXT, search_id TEXT, company_id TEXT,
    status TEXT, lease_owner TEXT, lease_generation INTEGER, lease_expires_at TEXT);
    CREATE TABLE lead_radar_companies (id TEXT PRIMARY KEY, org_id TEXT, suppressed INTEGER);
    INSERT INTO lead_radar_jobs VALUES ('job1','org_fixture','search1','company1','running','lease1',1,'2030-01-01T00:00:00.000Z');
    INSERT INTO lead_radar_companies VALUES ('company1','org_fixture',0);`);
  db.exec(readFileSync(new URL('../migrations/0049_lead_radar_firecrawl.sql', import.meta.url), 'utf8'));
  return db;
}
function job(): LeadRadarJob {
  return { id: CTX.jobId, orgId: CTX.orgId, searchId: CTX.searchId, companyId: CTX.companyId,
    stage: 'enrichment', status: 'running', attemptCount: 1, maxAttempts: 3, availableAt: AT,
    lastErrorCode: null, leaseOwner: CTX.leaseOwner, leaseGeneration: 1, leaseExpiresAt: '2030-01-01T00:00:00.000Z',
    dispatchStatus: 'sent', dispatchAttemptCount: 1, nextDispatchAt: null, dispatchLeaseOwner: null,
    dispatchLeaseExpiresAt: null, dispatchedAt: AT } as LeadRadarJob;
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
function page(url: string, html = HTML, metadata: Record<string, unknown> = {}) {
  return json({ success: true, data: { html, rawHtml: '', links: [], metadata: { sourceURL: url, statusCode: 200, ...metadata } } });
}
const errorCode = (code: string) => (error: unknown) => error instanceof FirecrawlError && error.code === code;

test('transport is invoked without rebinding the native fetch receiver', async () => {
  const db = database();
  const transport = async function (this: unknown) {
    assert.equal(this, undefined, 'workerd rejects a custom fetch receiver');
    return json({ success: true, links: [] });
  } as typeof fetch;
  const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, new FirecrawlStore(db.asD1()), CTX, transport, NOW);
  assert.deepEqual(await client.request('map', 'clinic.uz', { url: 'https://clinic.uz/' }, () => []), []);
});

test('business directories and their common Telegram are never treated as first-party websites', () => {
  for (const host of FIRECRAWL_DIRECTORY_DOMAINS) {
    assert.equal(firecrawlPublicUrl(`https://${host}/company/clinic`), null);
    assert.equal(firecrawlPublicUrl(`https://www.${host}/`), null);
  }
  assert.ok(firecrawlPublicUrl('https://clinics.uz.example.com/'), 'only exact domain boundaries are excluded');
});

test('generic dentistry name plus city does not establish ownership of a discovered domain', async () => {
  const db = database();
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => null,
    fetch: async (input) => String(input).endsWith('/search')
      ? json({ success: true, data: { web: [{ url: 'https://clinic.uz/' }] } })
      : page('https://clinic.uz/', '<h1>Стоматология в Ташкенте</h1><p>Telegram компании: <a href="https://t.me/directory_owner">Написать</a></p>'),
  });
  const result = await deps.enrichLead!(null, { name: 'Стоматология', phone: null, city: 'Ташкент', address: null }, job());
  assert.equal(result.facts, null);
  assert.equal(db.value('SELECT status FROM lead_radar_firecrawl_reports'), 'identity_unconfirmed');
});

test('html and rawHtml are alternate representations, not concatenated against the size limit', async () => {
  const db = database();
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => null,
    fetch: async (input) => String(input).endsWith('/map') ? json({ success: true, links: [] })
      : json({ success: true, data: { html: HTML + ' '.repeat(310_000), rawHtml: HTML + ' '.repeat(650_000),
        links: [], metadata: { sourceURL: 'https://clinic.uz/', statusCode: 200 } } }),
  });
  const result = await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
  assert.equal(result.reason, 'enriched');
  assert.equal(result.facts?.telegramContact?.type, 'business');
  assert.equal(result.facts?.telegramContact?.messageable, false);
});

test('Firecrawl requires BOTH switches, key, explicit organization and valid nonzero budgets', () => {
  assert.ok(firecrawlConfig(ENV, CTX.orgId));
  for (const env of [{}, { ...ENV, LEAD_RADAR_FIRECRAWL_ENABLED: 'false' }, { ...ENV, FIRECRAWL_API_KEY: '' },
    { ...ENV, LEAD_RADAR_FIRECRAWL_MODE: 'off' }, { ...ENV, LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: '*' },
    { ...ENV, LEAD_RADAR_FIRECRAWL_DAILY_CREDITS: '-1' }]) assert.equal(firecrawlConfig(env, CTX.orgId), null);
  assert.equal(firecrawlConfig(ENV, 'other-org'), null);
  assert.equal(firecrawlConfig({ ...ENV, LEAD_RADAR_FIRECRAWL_DAILY_CREDITS: '99999' }, CTX.orgId)?.limits.dailyCredits, 200);
});

test('disabled provider and missing optional migration do not touch network', async () => {
  const db = new SqliteD1();
  assert.deepEqual(await createFirecrawlQueueDependencies({}, db.asD1(), CTX.orgId, false), {});
  assert.deepEqual(await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false), {});
});

test('public URL policy rejects private IPs, credentials, secrets, logins, downloads and social directories', () => {
  for (const url of ['http://127.0.0.1/', 'http://10.1.2.3/', 'http://foo.local/', 'http://foo.nip.io/',
    'https://a:b@example.org/', 'https://example.org/?token=secret', 'https://example.org/oauth/callback',
    'https://example.org/file.pdf', 'https://t.me/example', 'https://gptbot.uz/']) assert.equal(firecrawlPublicUrl(url), null, url);
  assert.equal(firecrawlPublicUrl('https://clinic.uz/contacts#tel')?.toString(), 'https://clinic.uz/contacts');
});

test('single statement reservations cannot overspend under concurrent requests; tenant search/domain/lease fences hold', async () => {
  const db = database(); const store = new FirecrawlStore(db.asD1());
  const limits = { dailyCredits: 2, searchCredits: 2, domainCredits: 2, companyCredits: 7 };
  const reservations = await Promise.all(Array.from({ length: 20 }, (_, i) => store.reserve(CTX, `key${i}`, 'scrape', 'clinic.uz', 1, limits, AT)));
  assert.equal(reservations.filter(Boolean).length, 2);
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'), 2);
  assert.equal(await store.reserve({ ...CTX, leaseGeneration: 2 }, 'stale', 'scrape', 'new.uz', 1, { ...limits, dailyCredits: 200 }, AT), null);
  assert.equal(await store.reserve({ ...CTX, orgId: 'other' }, 'foreign', 'scrape', 'new.uz', 1, { ...limits, dailyCredits: 200 }, AT), null);
});

test('completed request replays stored result without a second API charge', async () => {
  const db = database(); let calls = 0;
  const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, new FirecrawlStore(db.asD1()), CTX,
    async () => { calls++; return json({ success: true, links: [] }); }, NOW);
  const run = () => client.request('map', 'clinic.uz', { url: 'https://clinic.uz/' }, () => ['result']);
  assert.deepEqual(await run(), ['result']); assert.deepEqual(await run(), ['result']); assert.equal(calls, 1);
});

test('successful null result survives another delivery and is not a missing or expired result', async () => {
  const db=database(), store=new FirecrawlStore(db.asD1()); let calls=0;
  const request=async () => { calls++; return json({success:true}); };
  const run=() => new FirecrawlClient(firecrawlConfig(ENV,CTX.orgId)!,store,CTX,request,NOW)
    .request('scrape','clinic.uz',{url:'https://clinic.uz/'},()=>null);
  assert.equal(await run(),null);
  assert.equal(db.value('SELECT result_json FROM lead_radar_firecrawl_requests'),'null');
  assert.equal(await run(),null);
  assert.equal(calls,1);
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'),1);
});

test('timeout/unknown submission is retained and never automatically resubmitted', async () => {
  const db = database(); let calls = 0;
  const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, new FirecrawlStore(db.asD1()), CTX,
    async () => { calls++; throw new Error('network error with a secret'); }, NOW);
  const run = () => client.request('scrape', 'clinic.uz', { url: 'https://clinic.uz/' }, () => null);
  await assert.rejects(run, errorCode('request_unknown')); await assert.rejects(run, errorCode('request_unknown'));
  assert.equal(calls, 1); assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'), 1);
  assert.equal(db.value('SELECT error_code FROM lead_radar_firecrawl_requests'), 'request_unknown');
});

for (const status of [401, 403, 402]) test(`provider HTTP ${status} trips durable account circuit and never leaks upstream body`, async () => {
  const db = database(); let calls = 0; const store = new FirecrawlStore(db.asD1());
  const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, store, CTX,
    async () => { calls++; return json({ error: ENV.FIRECRAWL_API_KEY }, status); }, NOW);
  await assert.rejects(() => client.request('map', 'clinic.uz', { url: 'one' }, () => null), errorCode(status === 402 ? 'credits_exhausted' : 'authentication_failed'));
  await assert.rejects(() => client.request('map', 'clinic.uz', { url: 'two' }, () => null));
  assert.equal(calls, 1); assert.ok(await store.blocked('2026-08-29T12:00:00.000Z'));
  assert.equal(JSON.stringify(db.rows('SELECT * FROM lead_radar_firecrawl_requests')).includes(ENV.FIRECRAWL_API_KEY), false);
});

test('429 backoff is durable and bounded to two reserved attempts', async () => {
  const db = database(); let calls = 0; let at = new Date(AT);
  const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, new FirecrawlStore(db.asD1()), CTX,
    async () => { calls++; return json({}, 429); }, () => at);
  const run = () => client.request('map', 'clinic.uz', { url: 'one' }, () => null);
  await assert.rejects(run, errorCode('rate_limited')); await assert.rejects(run, errorCode('rate_limited')); assert.equal(calls, 1);
  at = new Date(at.getTime() + 61_000); await assert.rejects(run, errorCode('rate_limited'));
  at = new Date(at.getTime() + 61_000); await assert.rejects(run, errorCode('rate_limited')); assert.equal(calls, 2);
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'), 2);
});

test('result retention erases content without refunding credits or allowing resubmission', async () => {
  const db = database(); const store = new FirecrawlStore(db.asD1()); let calls = 0;
  const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, store, CTX,
    async () => { calls++; return json({ success: true }); }, NOW);
  const run = () => client.request('map', 'clinic.uz', { url: 'one' }, () => ['private-ish fixture']);
  await run(); await store.purgeResults('2026-08-30T00:00:00.000Z');
  await assert.rejects(run, errorCode('result_expired')); assert.equal(calls, 1);
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'), 1);
});

test('bounded contact-page selection dedupes, prioritizes contacts, rejects off-domain and secret URLs', () => {
  const selected = selectFirecrawlContactPages(['/about', '/contacts', '/contacts', '/team', '/doctors',
    '/?secret=1', 'https://evil.com/contacts', '/blog/a'], new URL('https://clinic.uz/'));
  assert.equal(selected.length, 3); assert.equal(selected[0], 'https://clinic.uz/contacts');
  assert.ok(selected.every((url) => url.startsWith('https://clinic.uz/')));
});

test('fallback preserves footer/JSON-LD, stores only compact evidence and never approves sending', async () => {
  const db = database(); const calls: string[] = [];
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => null,
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body)); calls.push(String(input));
      assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${ENV.FIRECRAWL_API_KEY}`);
      if (String(input).endsWith('/map')) return json({ success: true, links: [] });
      assert.equal(body.onlyMainContent, false); assert.equal(body.maxAge, 0); assert.equal(body.skipTlsVerification, false);
      assert.deepEqual(body.parsers, []); assert.equal(body.actions, undefined);
      return page(body.url);
    },
  });
  const result = await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
  assert.equal(result.facts?.telegramContact?.type, 'business');
  assert.equal(result.facts?.telegramContact?.messageable, false);
  assert.equal(result.facts?.telegramContact?.verifiedAt, AT);
  assert.equal(result.facts?.decisionMakers.length, 0); assert.equal(calls.length, 2);
  const saved = JSON.stringify(db.rows('SELECT result_json FROM lead_radar_firecrawl_requests'));
  assert.equal(saved.includes('<html>'), false); assert.equal(saved.includes(ENV.FIRECRAWL_API_KEY), false);
  assert.ok(saved.includes('contentHash')); assert.ok(result.facts?.evidence.some((e) => e.fieldPath === 'web.company_binding'));
});

test('missing site uses Search candidates but rejects same-name company without geography/phone', async () => {
  const db = database(); const calls: string[] = [];
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, { now: NOW,
    robots: async () => null, fetch: async (input, init) => {
      calls.push(String(input)); const body = JSON.parse(String(init?.body));
      if (String(input).endsWith('/search')) return json({ success: true, data: { web: [{ url: 'https://wrong.uz/' }, { url: 'https://clinic.uz/' }] } });
      if (String(input).endsWith('/map')) return json({ success: true, links: [] });
      return page(body.url, body.url.includes('wrong') ? '<h1>Example Dental Clinic</h1><p>London</p><a href="https://t.me/wrong_business">Telegram</a>' : HTML);
    },
  });
  const first = await deps.enrichLead!(null, EXPECTED, job());
  assert.equal(first.retryable, true, 'bounded delivery yields after two new provider calls');
  const result = await deps.enrichLead!(null, EXPECTED, job());
  assert.equal(result.facts?.website, 'https://clinic.uz'); assert.ok(calls[0].endsWith('/search'));
  assert.equal(JSON.stringify(result).includes('wrong_business'), false);
  assert.equal(db.value('SELECT SUM(credits) FROM lead_radar_firecrawl_requests'), 5);
});

test('shadow stores comparison only, never changes the actual lead or sender eligibility', async () => {
  const db = database();
  const deps = await createFirecrawlQueueDependencies({ ...ENV, LEAD_RADAR_FIRECRAWL_MODE: 'shadow' }, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => null,
    fetch: async (input, init) => String(input).endsWith('/map') ? json({ success: true, links: [] }) : page(JSON.parse(String(init?.body)).url),
  });
  assert.deepEqual(await deps.enrichLead!('https://clinic.uz/', EXPECTED, job()), NONE);
  assert.equal(db.value('SELECT contacts FROM lead_radar_firecrawl_reports'), 1);
});

test('robots denial prevents paid scrape/map calls', async () => {
  const db = database(); let calls = 0;
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => 'User-agent: *\nDisallow: /',
    fetch: async () => { calls++; throw new Error('must not call'); },
  });
  assert.equal((await deps.enrichLead!('https://clinic.uz/', EXPECTED, job())).facts, null);
  assert.equal(calls, 0); assert.equal(db.value('SELECT status FROM lead_radar_firecrawl_reports'), 'robots_blocked');
});

for (const metadata of [{ cacheState: 'hit' }, { sourceURL: 'http://127.0.0.1/' }, { url: 'https://other.uz/' }, { statusCode: 403 }]) {
  test(`reject untrusted provider page metadata ${JSON.stringify(metadata)}`, async () => {
    const db = database();
    const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, { now: NOW,
      direct: async () => NONE, robots: async () => null, fetch: async () => page('https://clinic.uz/', HTML, metadata) });
    assert.equal((await deps.enrichLead!('https://clinic.uz/', EXPECTED, job())).facts, null);
  });
}

test('diagnostics are tenant-scoped and contain no API credential or source HTML', async () => {
  const db = database(); const store = new FirecrawlStore(db.asD1());
  await store.report(CTX, 'shadow', 'enriched', 2, 1, 0, AT);
  assert.equal((await store.diagnostics('other-org', CTX.searchId)).reports.length, 0);
  assert.equal((await store.diagnostics(CTX.orgId, CTX.searchId)).reports.length, 1);
});

for (const cap of ['dailyCredits', 'searchCredits', 'domainCredits', 'companyCredits'] as const) {
  test(`${cap} is enforced even when all earlier requests have completed`, async () => {
    const db = database(); const store = new FirecrawlStore(db.asD1());
    const limits = { dailyCredits: 200, searchCredits: 140, domainCredits: 14, companyCredits: 7, [cap]: 2 };
    for (let i = 0; i < 2; i++) {
      const id = await store.reserve(CTX, `sequential${i}`, 'scrape', 'clinic.uz', 1, limits, AT);
      assert.ok(id); await store.finish(id, 'completed', null, null, null, AT);
    }
    assert.equal(await store.reserve(CTX, 'blocked3', 'scrape', 'clinic.uz', 1, limits, AT), null);
  });
}

test('Firecrawl-specific robots denial is respected even if the native reader is allowed', async () => {
  const db = database(); let calls = 0;
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => 'User-agent: FirecrawlAgent\nDisallow: /\nUser-agent: *\nAllow: /',
    fetch: async () => { calls++; return page('https://clinic.uz/'); },
  });
  await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
  assert.equal(calls, 0);
});

for (const badBody of ['not-json', 'x'.repeat(2_000_001)]) {
  test(`malformed/oversized response (${badBody.length} bytes) is rejected without automatic re-charge`, async () => {
    const db = database(); let calls = 0;
    const client = new FirecrawlClient(firecrawlConfig(ENV, CTX.orgId)!, new FirecrawlStore(db.asD1()), CTX,
      async () => { calls++; return new Response(badBody); }, NOW);
    const run = () => client.request('map', 'clinic.uz', { url: 'one' }, () => []);
    await assert.rejects(run); await assert.rejects(run); assert.equal(calls, 1);
  });
}

test('published bot and channel links never become a business recipient', async () => {
  for (const [endpoint, context] of [['example_dental_bot', 'Telegram компании'], ['example_dental', 'Наш официальный канал']]) {
    const db = database();
    const html = `<h1>Example Dental Clinic</h1><p>+998711234567</p><footer>${context}<a href="https://t.me/${endpoint}">Telegram</a></footer>`;
    const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
      now: NOW, direct: async () => NONE, robots: async () => null,
      fetch: async (input, init) => String(input).endsWith('/map') ? json({ success: true, links: [] }) : page(JSON.parse(String(init?.body)).url, html),
    });
    const result = await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
    assert.notEqual(result.facts?.telegramContact?.type, 'business');
    assert.equal(result.facts?.telegramContact?.messageable, false);
    assert.equal(result.facts?.telegramUrl, null);
  }
});

test('a same-name site with a contradictory published phone is not accepted as company evidence', async () => {
  const db = database();
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, { now: NOW,
    direct: async () => NONE, robots: async () => null,
    fetch: async () => page('https://clinic.uz/', HTML.replace('+998711234567', '+998719999999')) });
  const result = await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
  assert.equal(result.facts, null);
  assert.equal(db.value('SELECT status FROM lead_radar_firecrawl_reports'), 'identity_unconfirmed');
});

test('contact page inherits a verified same-origin homepage without needing to repeat the company name', async () => {
  const db = database();
  const deps = await createFirecrawlQueueDependencies(ENV, db.asD1(), CTX.orgId, false, {
    now: NOW, direct: async () => NONE, robots: async () => null,
    fetch: async (input, init) => {
      if (String(input).endsWith('/map')) return json({ success: true, links: [{ url: 'https://clinic.uz/contacts' }] });
      const url = JSON.parse(String(init?.body)).url;
      return page(url, url.endsWith('/contacts')
        ? '<footer>Telegram компании: <a href="https://t.me/example_dental">связаться</a></footer>'
        : '<h1>Example Dental Clinic</h1><p>+998711234567</p>');
    },
  });
  const continuation = await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
  assert.equal(continuation.retryable, true);
  assert.equal(continuation.deferUntil, '2026-08-28T12:00:05.000Z');
  const result = await deps.enrichLead!('https://clinic.uz/', EXPECTED, job());
  assert.equal(result.facts?.telegramContact?.type, 'business');
  assert.equal(result.facts?.telegramContact?.messageable, false);
});
