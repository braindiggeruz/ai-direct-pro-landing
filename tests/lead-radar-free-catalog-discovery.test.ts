import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createContactSourceQueueDependencies } from '../functions/platform/lead-radar/contact-source-worker';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = new Date('2026-08-25T12:00:00.000Z');
const REAL_FETCH = globalThis.fetch;
const DNS = { Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] };

test('free Tier-1: top.uz catalog sourcing works with no Firecrawl config and zero paid calls', async (t) => {
  const db = new SqliteD1();
  t.after(() => { db.sqlite.close(); globalThis.fetch = REAL_FETCH; });
  db.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  for (const filename of ['0036_lead_radar.sql', '0041_lead_radar_search_leases.sql', '0042_lead_radar_decision_makers.sql', '0043_lead_radar_async_funnel.sql', '0052_lead_radar_contact_sources.sql']) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
      return new Response(JSON.stringify(DNS), { headers: { 'Content-Type': 'application/json' } });
    }
    calls.push(new URL(url).host + new URL(url).pathname);
    if (url.startsWith('https://top.uz/robots.txt')) {
      return new Response('User-agent: *\nDisallow: /bitrix/\n', { headers: { 'Content-Type': 'text/plain' } });
    }
    if (url.startsWith('https://top.uz/search/')) {
      return new Response('<html><body><a href="/company/aksumed-stomatologiya">Клиника</a>'
        + '<a href="/company/other-firm#schema">Другая</a></body></html>', { headers: { 'Content-Type': 'text/html' } });
    }
    if (url === 'https://top.uz/company/aksumed-stomatologiya') {
      return new Response(`<html><body><script type="application/ld+json">`
        + `{"@type":"LocalBusiness","name":"Стоматология AksuMed","telephone":"+998901234567","url":"https://clinic.uz","sameAs":["https://t.me/AksuMedClinic"]}`
        + `</script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }
    return new Response('nf', { status: 404 });
  }) as typeof globalThis.fetch;

  db.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, phase, created_at)
    VALUES ('search_fixture', 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{}', 'running', 'enriching', ?)`)
    .run(NOW.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country,
    score, confidence, priority, score_components_json, signals_json,
    discovered_at, last_verified_at, updated_at, website,
    telegram_contact_json, lifecycle, suppressed
  ) VALUES ('company_fixture', 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'search_fixture',
    'aksumed', 'Стоматология AksuMed', 'dentist', 'Ташкент', 'UZ',
    80, 0.9, 'P1', '[]', '[]', ?, ?, ?, 'https://clinic.uz', '{}', 'new', 0)`)
    .run(NOW.toISOString(), NOW.toISOString(), NOW.toISOString());
  db.sqlite.prepare(`INSERT INTO lead_radar_jobs (id,org_id,search_id,company_id,idempotency_key,stage,status,
    attempt_count,max_attempts,available_at,dispatch_status,next_dispatch_at,created_at,updated_at,
    lease_owner,lease_expires_at)
    VALUES ('lrjob_ffffffffffffffffffffffffffffffff','org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','search_fixture','company_fixture',
    'enrichment:company_fixture','enrichment','running',1,3,?,'pending',?,?,?,'owner',?)`)
    .run(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString());
  // No FIRECRAWL_API_KEY, no LEAD_RADAR_FIRECRAWL_* env at all.
  const deps = await createContactSourceQueueDependencies({}, db.asD1(), 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.ok(deps.discoverLeadContactSources, 'free path must wire contact sourcing without a provider');
  const job = {
    id: 'lrjob_fixture', orgId: 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', searchId: 'search_fixture',
    companyId: 'company_fixture', leaseOwner: 'owner', leaseGeneration: 1,
    stage: 'enrichment', status: 'running', attemptCount: 1, maxAttempts: 3,
    availableAt: NOW.toISOString(), createdAt: NOW.toISOString(), lastErrorCode: null,
    leaseExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    dispatchStatus: 'sent', dispatchAttemptCount: 0, nextDispatchAt: null,
    dispatchLeaseOwner: null, dispatchLeaseExpiresAt: null, dispatchedAt: null, purpose: 'contact_resolution',
  } as Parameters<NonNullable<typeof deps.discoverLeadContactSources>>[0];
  const lead = {
    id: 'company_fixture', name: 'Стоматология AksuMed', phone: '+998901234567', country: 'UZ',
    city: 'Ташкент', address: 'Ташкент', website: null, suppressed: false, lifecycle: 'new',
    telegramContact: null, telegramUrl: null, evidence: [],
  } as Parameters<NonNullable<typeof deps.discoverLeadContactSources>>[1];
  const outcome = await deps.discoverLeadContactSources(job, lead);
  // Sources discovered through the free path (the Firecrawl loop was skipped).
  assert.equal(outcome.reason, 'contact_sources_public_contact_candidates');
  assert.ok(!calls.some((c) => c.includes('firecrawl')), 'zero provider calls must happen on the free path');
});
