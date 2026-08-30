import assert from 'node:assert/strict';
import test from 'node:test';

import { JinaReaderClient, JinaReaderError, jinaReaderConfig } from '../functions/platform/lead-radar/jina-reader-client';
import { createContactSourceQueueDependencies } from '../functions/platform/lead-radar/contact-source-worker';
import { loadContactEnrichments } from '../functions/platform/lead-radar/contact-source-store';
import { LeadRadarStore } from '../functions/platform/lead-radar/store';
import { SqliteD1 } from './helpers/sqlite-d1';
import { freshAdminDb, migrationFiles } from './helpers/bormi-admin-fixture';

const at = new Date('2026-08-29T11:00:00.000Z');
const identity = { name: 'Dental Example', city: 'Tashkent', phone: '+998711234567', address: 'Amir Temur 123' };
const url = 'https://clinics.uz/catalog/dental-example';
/** Golden fixture: a typical directory catalog page with JSON-LD identity + social links. */
const catalogPage = `<!DOCTYPE html><html><head><title>${identity.name} — clinics.uz</title></head><body>`
  + `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Dentist', name: identity.name, telephone: identity.phone,
    sameAs: ['https://t.me/clinic_booking', 'https://t.me/clinic_bot'],
  })}</script>`
  + `<h1>${identity.name}</h1><footer>Запись в Telegram @directory_support</footer></body></html>`;

function throttleDb(): SqliteD1 {
  const db = new SqliteD1();
  db.exec('CREATE TABLE lead_radar_source_throttles (source_key TEXT PRIMARY KEY, next_allowed_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  return db;
}

const abortError = (): Error => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

test('jina config is gated by the feature flag and trims the optional key', () => {
  assert.equal(jinaReaderConfig({}), null);
  assert.equal(jinaReaderConfig({ LEAD_RADAR_JINA_ENABLED: 'false' }), null);
  assert.deepEqual(jinaReaderConfig({ LEAD_RADAR_JINA_ENABLED: 'true' }), { key: null });
  assert.deepEqual(jinaReaderConfig({ LEAD_RADAR_JINA_ENABLED: 'true', JINA_API_KEY: ' fixture-only ' }), { key: 'fixture-only' });
});

test('availability follows the shared throttle table (no new migration)', async () => {
  const empty = new SqliteD1();
  assert.equal(await new JinaReaderClient({ key: null }, empty.asD1()).available(), false);
  assert.equal(await new JinaReaderClient({ key: null }, throttleDb().asD1()).available(), true);
});

test('fetchHtml requests raw HTML through the reader endpoint and returns it', async () => {
  const calls: Array<{ target: string; init?: RequestInit }> = [];
  const transport: typeof fetch = async (input, init) => {
    calls.push({ target: String(input), init });
    return new Response(catalogPage);
  };
  const client = new JinaReaderClient({ key: null }, throttleDb().asD1(), transport, () => at);
  const html = await client.fetchHtml(url);
  assert.equal(html, catalogPage);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, `https://r.jina.ai/${url}`);
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers['X-Respond-With'], 'html');
  assert.equal(headers.Authorization, undefined, 'no credential is sent without JINA_API_KEY');
});

test('fetchHtml sends the bearer credential only when a key is configured', async () => {
  let seen: string | null = null;
  const transport: typeof fetch = async (_input, init) => {
    seen = (init?.headers as Record<string, string>).Authorization ?? null;
    return new Response('<html><body>ok</body></html>');
  };
  const client = new JinaReaderClient({ key: 'fixture-only' }, throttleDb().asD1(), transport, () => at);
  await client.fetchHtml(url);
  assert.equal(seen, 'Bearer fixture-only');
});

test('429 is a retryable rate limit honouring retry-after', async () => {
  const transport: typeof fetch = async () => new Response('slow down', { status: 429, headers: { 'retry-after': '60' } });
  const client = new JinaReaderClient({ key: null }, throttleDb().asD1(), transport, () => at);
  const error = await client.fetchHtml(url).then(() => null, (e: unknown) => e);
  assert.ok(error instanceof JinaReaderError);
  assert.equal(error.code, 'rate_limited');
  assert.equal(error.retryable, true);
  assert.equal(error.retryAt, new Date(at.getTime() + 60_000).toISOString());
});

test('timeout maps to source_timeout and network failure to source_unavailable, both retryable', async () => {
  const timeout = new JinaReaderClient({ key: null }, throttleDb().asD1(), async () => { throw abortError(); }, () => at);
  const first = await timeout.fetchHtml(url).then(() => null, (e: unknown) => e);
  assert.ok(first instanceof JinaReaderError && first.code === 'source_timeout' && first.retryable);
  const network = new JinaReaderClient({ key: null }, throttleDb().asD1(), async () => { throw new TypeError('fetch failed'); }, () => at);
  const second = await network.fetchHtml(url).then(() => null, (e: unknown) => e);
  assert.ok(second instanceof JinaReaderError && second.code === 'source_unavailable' && second.retryable);
});

test('empty or non-HTML (blocked/markdown) content is a non-retryable invalid page', async () => {
  for (const body of ['', '   ', 'Title: blocked\n\nMarkdown Content:\nAccess denied']) {
    const client = new JinaReaderClient({ key: null }, throttleDb().asD1(), async () => new Response(body), () => at);
    const error = await client.fetchHtml(url).then(() => null, (e: unknown) => e);
    assert.ok(error instanceof JinaReaderError && error.code === 'invalid_page' && !error.retryable, JSON.stringify(body));
  }
});

test('the 21st free-tier request within a minute must wait for a pacing slot', async () => {
  let clock = at.getTime();
  let fetches = 0;
  const transport: typeof fetch = async () => {
    fetches += 1;
    return new Response('<html><body>ok</body></html>');
  };
  const client = new JinaReaderClient({ key: null }, throttleDb().asD1(), transport,
    () => new Date(clock), async (ms) => { clock += ms; });
  const elapsed: number[] = [];
  for (let n = 1; n <= 21; n += 1) {
    await client.fetchHtml(url);
    elapsed.push(clock - at.getTime());
  }
  assert.equal(fetches, 21);
  assert.equal(elapsed[19], 57_000, 'requests 1-20 fit one per 3s slot inside the minute');
  assert.ok(elapsed[20] >= 60_000, `request 21 must wait past the minute, got ${elapsed[20]}ms`);
});

test('contended slots beyond the wait bound surface a retryable rate limit', async () => {
  const db = throttleDb();
  // A neighbouring worker holds the slot far beyond MAX_SLOT_WAIT_MS.
  db.sqlite.prepare('INSERT INTO lead_radar_source_throttles (source_key, next_allowed_at, updated_at) VALUES (?, ?, ?)')
    .run('jina_reader', new Date(at.getTime() + 120_000).toISOString(), at.toISOString());
  const client = new JinaReaderClient({ key: null }, db.asD1(), async () => new Response('<html>x</html>'), () => at, async () => {});
  const error = await client.fetchHtml(url).then(() => null, (e: unknown) => e);
  assert.ok(error instanceof JinaReaderError && error.code === 'rate_limited' && error.retryable);
});

const firecrawlEnv = {
  FIRECRAWL_API_KEY: 'fixture-only',
  LEAD_RADAR_FIRECRAWL_ENABLED: 'true',
  LEAD_RADAR_FIRECRAWL_MODE: 'fallback',
  LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: 'org',
};

async function contactSourceFixture(env: Record<string, string>, fetchImpl: typeof fetch) {
  const db = freshAdminDb();
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(name TEXT UNIQUE)');
  for (const file of migrationFiles()) db.sqlite.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES (?)').run(file);
  const store = new LeadRadarStore(db.asD1());
  const searchId = await store.createSearch('org', {
    niche: 'dentist', city: 'Tashkent', country: 'UZ', offer: 'demo', desiredCount: 5, telegramRequired: true, languages: ['ru'],
  }, at.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_companies(id,org_id,search_id,canonical_key,name,category,city,country,address,phone,score,confidence,priority,score_components_json,signals_json,discovered_at,last_verified_at,updated_at)
    VALUES ('company','org',?,'fixture',?,'dentist',?,'UZ',?,?,50,.8,'P3','[]','[]',?,?,?)`)
    .run(searchId, identity.name, identity.city, identity.address, identity.phone, at.toISOString(), at.toISOString(), at.toISOString());
  const created = await store.createJob('org', searchId, 'company', 'enrichment', 'contact-resolve:jina-fixture', at.toISOString());
  db.sqlite.prepare("UPDATE lead_radar_jobs SET status='running',lease_owner='owner',lease_expires_at=?,lease_generation=1 WHERE id=?")
    .run(new Date(at.getTime() + 600_000).toISOString(), created.id);
  const job = (await store.getJob(created.id))!;
  const lead = (await store.getLeadForEnrichment('org', 'company'))!.lead;
  const deps = await createContactSourceQueueDependencies(env, db.asD1(), 'org', {
    now: () => at, robots: async () => null, sleep: async () => {}, fetch: fetchImpl,
  });
  return { db, deps, job, lead };
}

/** Firecrawl search finds the catalog URL; the scrape hits a blocked origin (HTTP 521). */
function blockedOriginFetch(jina: (target: string, init?: RequestInit) => Response): { transport: typeof fetch; jinaCalls: string[] } {
  const jinaCalls: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const target = String(input);
    if (target.startsWith('https://r.jina.ai/')) {
      jinaCalls.push(target);
      return jina(target, init);
    }
    return new Response(JSON.stringify(target.endsWith('/search')
      ? { success: true, data: { web: [{ url, description: 'A snippet is not proof' }] } }
      : { success: true, data: { rawHtml: '', metadata: { statusCode: 521, sourceURL: url } } }));
  };
  return { transport, jinaCalls };
}

test('blocked origin fetch falls back to Jina Reader and extracts the golden catalog contacts', async () => {
  const { transport, jinaCalls } = blockedOriginFetch((target, init) => {
    assert.equal(target, `https://r.jina.ai/${url}`);
    assert.equal((init?.headers as Record<string, string>)['X-Respond-With'], 'html');
    return new Response(catalogPage);
  });
  const { db, deps, job, lead } = await contactSourceFixture({ ...firecrawlEnv, LEAD_RADAR_JINA_ENABLED: 'true' }, transport);
  const result = await deps.discoverLeadContactSources!(job, lead);
  assert.equal(result.pending, true);
  assert.equal(jinaCalls.length, 1, 'one reader request replaces the blocked scrape');
  const proof = (await loadContactEnrichments(db.asD1(), 'org', [{ id: 'company', ...identity }], at.toISOString())).get('company');
  assert.equal(proof?.status, 'complete');
  assert.deepEqual(proof?.sources[0]?.candidates.map((c) => c.value), ['https://t.me/clinic_booking']);
});

test('with the flag disabled a blocked origin never calls Jina (byte-identical behaviour)', async () => {
  const { transport, jinaCalls } = blockedOriginFetch(() => {
    throw new Error('jina must not be called while disabled');
  });
  const { db, deps, job, lead } = await contactSourceFixture({ ...firecrawlEnv }, transport);
  const result = await deps.discoverLeadContactSources!(job, lead);
  assert.equal(jinaCalls.length, 0);
  // The second identity query hits the client's bounded-submission guard, so
  // the delivery defers without saving — the pre-Jina behaviour, unchanged.
  assert.deepEqual(result, { pending: true, reason: 'contact_sources_continuation', retryAfterSeconds: 15 });
  const proof = (await loadContactEnrichments(db.asD1(), 'org', [{ id: 'company', ...identity }], at.toISOString())).get('company');
  assert.equal(proof, undefined);
});

test('a Jina 429 keeps the queue retryable with the rate-limited reason code', async () => {
  const { transport } = blockedOriginFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': '60' } }));
  const { deps, job, lead } = await contactSourceFixture({ ...firecrawlEnv, LEAD_RADAR_JINA_ENABLED: 'true' }, transport);
  const result = await deps.discoverLeadContactSources!(job, lead);
  assert.deepEqual(result, { pending: true, reason: 'contact_sources_rate_limited', retryAfterSeconds: 60 });
});
