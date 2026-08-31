import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as workerRoute from '../functions/api/lead-radar/crawler/[[path]]';
import {
  acceptCrawlerReceipt,
  authenticateCrawlerWorker,
  claimCrawlerJob,
  createCrawlerJob,
  crawlerOwnerStatus,
} from '../functions/platform/lead-radar';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG = 'owner_8ee98dc3040f160b308166b0';
const COMPANY = 'company_crawler_fixture';
const TOKEN = `fixture-${'x'.repeat(32)}`;
const NOW = new Date('2026-08-31T16:00:00.000Z');

function dbFixture(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE);
    CREATE TABLE lead_radar_companies (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, search_id TEXT NOT NULL, name TEXT NOT NULL,
      normalized_name TEXT NOT NULL, category TEXT NOT NULL, city TEXT NOT NULL, country TEXT NOT NULL,
      address TEXT, website TEXT, phone TEXT, generic_email TEXT, telegram_url TEXT,
      lifecycle TEXT NOT NULL, suppressed INTEGER NOT NULL DEFAULT 0,
      discovered_at TEXT NOT NULL, last_verified_at TEXT NOT NULL, UNIQUE(org_id,id)
    );
    CREATE TABLE lead_radar_contact_enrichments (
      org_id TEXT NOT NULL, company_id TEXT NOT NULL, job_id TEXT NOT NULL,
      identity_digest TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
      sources_json TEXT NOT NULL, checked_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      PRIMARY KEY(org_id,company_id)
    );`);
  db.exec(readFileSync(path.join(ROOT, 'migrations/0056_lead_radar_crawler.sql'), 'utf8'));
  db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run('0056_lead_radar_crawler.sql');
  db.sqlite.prepare(`INSERT INTO lead_radar_companies
    (id,org_id,search_id,name,normalized_name,category,city,country,address,website,phone,generic_email,telegram_url,lifecycle,suppressed,discovered_at,last_verified_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'new',0,?,?)`).run(
      COMPANY, ORG, 'search_fixture', 'Clinic Fixture', 'clinic fixture', 'clinic', 'Tashkent', 'UZ',
      'Tashkent', 'https://clinic.example.uz/', '+998901234567', null, null,
      NOW.toISOString(), NOW.toISOString(),
    );
  db.sqlite.prepare(`INSERT INTO lead_radar_crawler_workers
    (id,org_id,token_hash,name,revoked,created_at,last_seen_at) VALUES (?,?,?,?,0,?,?)`).run(
      'worker_fixture', ORG, createHash('sha256').update(TOKEN).digest('hex'), 'Fixture worker',
      NOW.toISOString(), NOW.toISOString(),
    );
  return db;
}

const env = { LEAD_RADAR_CRAWLER_ENABLED: 'true' };

test('crawler owner creates one idempotent job and sees an online worker', async (t) => {
  const db = dbFixture();
  t.after(() => db.sqlite.close());
  const lead = { name: 'Clinic Fixture', phone: '+998901234567', address: 'Tashkent', city: 'Tashkent', website: 'https://clinic.example.uz/' };
  const first = await createCrawlerJob(db.asD1(), env, ORG, COMPANY, 'crawler-request-0001', lead, NOW);
  const replay = await createCrawlerJob(db.asD1(), env, ORG, COMPANY, 'crawler-request-0001', lead, NOW);
  assert.equal(first.job.id, replay.job.id);
  const status = await crawlerOwnerStatus(db.asD1(), env, ORG, COMPANY, new Date(NOW.getTime() + 60_000));
  assert.equal(status.enabled, true);
  assert.equal(status.ready, true);
  assert.equal(status.jobs[0]?.status, 'queued');
});

test('worker bearer claims, heartbeats and completes one bounded public-source job', async (t) => {
  const db = dbFixture();
  t.after(() => db.sqlite.close());
  await createCrawlerJob(db.asD1(), env, ORG, COMPANY, 'crawler-request-0002', {
    name: 'Clinic Fixture', phone: '+998901234567', address: 'Tashkent', city: 'Tashkent', website: 'https://clinic.example.uz/',
  }, NOW);
  const request = new Request('https://gptbot.uz/api/lead-radar/crawler/jobs/claim', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
  const worker = await authenticateCrawlerWorker(db.asD1(), request, NOW);
  const claimed = await claimCrawlerJob(db.asD1(), worker, NOW);
  const job = claimed.job as Record<string, unknown>;
  assert.equal(job.companyId, COMPANY);
  const result = await acceptCrawlerReceipt(db.asD1(), worker, {
    jobId: job.jobId,
    receiptId: 'receipt_fixture_0001',
    generation: job.generation,
    status: 'completed',
    pagesAccepted: 2,
    contactsFound: 1,
    sources: [{
      id: 'source_fixture', kind: 'business_listing', url: 'https://clinic.example.uz/contacts', observedAt: NOW.toISOString(),
      candidates: [{ key: 'telegram:clinic_fixture', kind: 'telegram', value: 'https://t.me/clinic_fixture', ownership: 'company', lookupEligible: true, reason: 'telegram_unverified' }],
    }],
  }, NOW);
  assert.equal((result.job as { status: string }).status, 'completed');
  assert.equal(Number(db.value('SELECT pages_accepted FROM lead_radar_crawler_jobs WHERE company_id=?', COMPANY)), 2);
  assert.equal(Number(db.value('SELECT COUNT(*) FROM lead_radar_crawler_receipts')), 1);
  assert.equal(Number(db.value('SELECT COUNT(*) FROM lead_radar_contact_enrichments')), 1);
});

test('worker API remains auth-first and supports the observed POST aliases', async (t) => {
  const db = dbFixture();
  t.after(() => db.sqlite.close());
  const missing = await workerRoute.onRequestPost!({
    request: new Request('https://gptbot.uz/api/lead-radar/crawler/jobs/claim', { method: 'POST', body: '{}' }),
    env: { GPTBOT_DRAFTS_DB: db.asD1() }, params: { path: ['jobs', 'claim'] },
  } as never);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json() as { error: string }).error, 'crawler_unauthorized');

  const authorized = await workerRoute.onRequestPost!({
    request: new Request('https://gptbot.uz/api/lead-radar/crawler/status', {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: '{}',
    }),
    env: { GPTBOT_DRAFTS_DB: db.asD1() }, params: { path: ['status'] },
  } as never);
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json() as { ok: boolean }).ok, true);
});
