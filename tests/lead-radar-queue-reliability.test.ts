import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  consumeLeadRadarQueueMessage,
  enqueueDueLeadRadarJobs,
  enqueueLeadRadarSearch,
  LeadRadarRequestConflictError,
  LeadRadarStore,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
  type SourceCandidate,
  type StoredLeadInput,
} from '../functions/platform/lead-radar';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import { SqliteD1 } from './helpers/sqlite-d1';
import { createFirecrawlQueueDependencies } from '../functions/platform/lead-radar/firecrawl-enrichment';

const SEARCH_INPUT: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'AI-бот для заявок',
  desiredCount: 5,
  telegramRequired: false,
  languages: ['ru', 'uz'],
};

function database(): SqliteD1 {
  const fixture = new SqliteD1();
  for (const migration of [
    '0036_lead_radar.sql',
    '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql',
  ]) {
    fixture.exec(readFileSync(resolve(import.meta.dirname, `../migrations/${migration}`), 'utf8'));
  }
  return fixture;
}

class RecordingQueue implements LeadRadarQueueSender {
  readonly messages: LeadRadarQueueMessage[] = [];
  readonly delays: number[] = [];
  failures = 0;

  constructor(private readonly recordBeforeFailure = false) {}

  async send(message: LeadRadarQueueMessage, options?: { delaySeconds?: number }): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      if (this.recordBeforeFailure) this.messages.push(structuredClone(message));
      throw new Error('fixture_queue_send_failed');
    }
    this.messages.push(structuredClone(message));
    this.delays.push(options?.delaySeconds ?? 0);
  }
}

function candidate(website: string | null, key = 'fixture-company'): SourceCandidate {
  return {
    sourceId: key,
    sourceUrl: 'https://www.openstreetmap.org/node/42',
    name: `Example Clinic ${key}`,
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: 'Ташкент',
    website,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: website ? 'pending' : 'terminal',
    enrichmentReason: website ? null : 'no_website',
    enrichmentAttempts: 0,
    evidence: [{
      id: `${key}-name`,
      fieldPath: 'company.name',
      value: `Example Clinic ${key}`,
      sourceUrl: 'https://www.openstreetmap.org/node/42',
      sourceType: 'openstreetmap',
      observedAt: '2026-08-25T10:00:00.000Z',
      confidence: 0.9,
      classification: 'company_data',
    }],
    signals: [],
  };
}

function storedLead(canonicalKey: string, website: string | null): StoredLeadInput {
  return {
    canonicalKey,
    name: canonicalKey,
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: 'Ташкент',
    website,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: website ? 'pending' : 'terminal',
    enrichmentReason: website ? null : 'no_website',
    enrichmentAttempts: 0,
    score: 10,
    confidence: 0.8,
    priority: 'P3',
    lifecycle: 'new',
    suppressed: false,
    scoreComponents: [],
    signals: [],
    evidence: [],
    discoveredAt: '2026-08-25T10:00:00.000Z',
    lastVerifiedAt: '2026-08-25T10:00:00.000Z',
  };
}

test('contact target replenishes from a fenced persisted pool and stops at its bound without claiming ready', async () => {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0050_lead_radar_contact_discovery.sql'), 'utf8'));
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0054_lead_radar_candidate_pool_resume.sql'), 'utf8'));
  fixture.exec("CREATE TABLE d1_migrations (name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');");
  const store = new LeadRadarStore(fixture.asD1());
  const queue = new RecordingQueue();
  const at = new Date('2026-08-28T12:00:00.000Z');
  const result = await enqueueLeadRadarSearch(store, 'org-a', { ...SEARCH_INPUT, searchGoal: 'telegram_contacts', maxCandidates: 25 }, queue, at, 'contact-request-001');
  let discoveries = 0;
  const deps = { now: () => at, discover: async () => {
    discoveries++;
    return { candidates: Array.from({ length: 30 }, (_, i) => candidate(null, `clinic-${i}`)), sourceWarnings: [] };
  } };
  for (let i = 0; i < 4; i++) {
    const next = queue.messages.shift();
    if (next) {
      await consumeLeadRadarQueueMessage(fixture.asD1(), next, queue, deps);
      // Duplicate delivery must not consume the next batch or duplicate companies.
      await consumeLeadRadarQueueMessage(fixture.asD1(), next, queue, deps);
    }
    await enqueueDueLeadRadarJobs(fixture.asD1(), queue, at);
  }
  const final = await store.getSearch('org-a', result.search.id);
  assert.equal(discoveries, 1);
  assert.equal(final?.leads.length, 25);
  assert.equal(final?.search.status, 'partial');
  assert.equal(final?.search.funnel?.companyTelegramCount, 0);
  assert.equal(fixture.value('SELECT cursor FROM lead_radar_candidate_pools'), 25);
  assert.equal(fixture.value('SELECT stop_reason FROM lead_radar_candidate_pools'), 'candidate_limit');
  assert.equal(fixture.value('SELECT candidates_json FROM lead_radar_candidate_pools'), null);
});

test('contact-mode enrichment schedules a durable lookup job and resumes it without fetching the website again', async () => {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0050_lead_radar_contact_discovery.sql'), 'utf8'));
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0054_lead_radar_candidate_pool_resume.sql'), 'utf8'));
  fixture.exec("CREATE TABLE d1_migrations (name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');");
  const db = fixture.asD1(), store = new LeadRadarStore(db), queue = new RecordingQueue();
  let at = new Date('2026-08-28T12:00:00.000Z'), websites = 0, lookups = 0;
  const result = await enqueueLeadRadarSearch(store,'org-a',{ ...SEARCH_INPUT,searchGoal:'telegram_contacts',maxCandidates:5 },queue,at,'lookup-queue-test');
  const deps = { now: () => at, discover: async () => ({ candidates:[candidate('https://clinic.uz')],sourceWarnings:[] }),
    enrichWebsite: async () => { websites++; return { facts: { website:'https://clinic.uz',phone:'+998901234567',genericEmail:null,telegramUrl:null,telegramContact:null,decisionMakers:[],signals:[],evidence:[] },reason:'enriched' as const,retryable:false }; },
    resolveLeadContacts: async () => ({ pending: ++lookups < 2 }),
  };
  for (let iteration=0; iteration<8; iteration++) {
    const next = queue.messages.shift();
    if (next) await consumeLeadRadarQueueMessage(db,next,queue,deps);
    at = new Date(at.getTime()+16_000);
    await enqueueDueLeadRadarJobs(db,queue,at);
  }
  assert.equal(websites,1);
  assert.equal(lookups,2);
  assert.equal(fixture.value("SELECT COUNT(*) FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),1);
  assert.equal(fixture.value("SELECT status FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),'completed');
  assert.equal((await store.getSearch('org-a',result.search.id))?.search.status,'partial');
});

test('request idempotency replays the same fingerprint and rejects key reuse with a different body', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  const queue = new RecordingQueue();
  const at = new Date('2026-08-25T10:00:00.000Z');

  const first = await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, at, 'request-001');
  const replay = await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, at, 'request-001');

  assert.equal(replay.search.id, first.search.id);
  assert.equal(queue.messages.length, 1);
  assert.equal(fixture.value("SELECT COUNT(*) FROM lead_radar_searches WHERE org_id = 'org-a'"), 1);
  assert.equal(fixture.value("SELECT COUNT(*) FROM lead_radar_jobs WHERE org_id = 'org-a'"), 1);
  await assert.rejects(
    enqueueLeadRadarSearch(
      store,
      'org-a',
      { ...SEARCH_INPUT, desiredCount: 6 },
      queue,
      at,
      'request-001',
    ),
    LeadRadarRequestConflictError,
  );
});

test('unavailable Bridge waits durably then requires attention instead of completing an unperformed check',async()=>{
  const fixture=database();
  fixture.exec(readFileSync(resolve(import.meta.dirname,'../migrations/0050_lead_radar_contact_discovery.sql'),'utf8'));
  fixture.exec(readFileSync(resolve(import.meta.dirname,'../migrations/0054_lead_radar_candidate_pool_resume.sql'),'utf8'));
  fixture.exec("CREATE TABLE d1_migrations (name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');");
  const db=fixture.asD1(),queue=new RecordingQueue();
  let at=new Date('2026-08-28T12:00:00.000Z');
  await enqueueLeadRadarSearch(new LeadRadarStore(db),'org-a',SEARCH_INPUT,queue,at,'waiting-bridge-fixture');
  const deps={now:()=>at,discover:async()=>({candidates:[candidate(null)],sourceWarnings:[]}),
    resolveLeadContacts:async()=>({pending:true,reason:'waiting_for_account',retryAfterSeconds:60})};
  for(let i=0;i<5;i++){
    const message=queue.messages.shift();if(message)await consumeLeadRadarQueueMessage(db,message,queue,deps);
    at=new Date(at.getTime()+61_000);await enqueueDueLeadRadarJobs(db,queue,at);
  }
  assert.equal(fixture.value("SELECT status FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),'retry_wait');
  at=new Date(at.getTime()+31*60_000);
  await enqueueDueLeadRadarJobs(db,queue,at);
  for(let i=0;i<3;i++){const message=queue.messages.shift();if(message)await consumeLeadRadarQueueMessage(db,message,queue,deps);}
  // Regeneration (audit-2026-08-30 QR-1): an expired wait window returns the
  // job to the queue on the same idempotency row instead of dead-lettering the
  // company while its check is still performable.
  assert.equal(fixture.value("SELECT status FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),'queued');
  assert.equal(fixture.value("SELECT attempt_count FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),0);
  assert.equal(fixture.value("SELECT last_error_code FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),'waiting_for_account');
  assert.equal(fixture.value("SELECT COUNT(*) FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),1);
  assert.equal(fixture.value("SELECT enrichment_reason FROM lead_radar_companies"),'no_website');
  // The whole-job lifetime bound still ends in a visible terminal trace.
  at=new Date(at.getTime()+49*60*60_000);
  await enqueueDueLeadRadarJobs(db,queue,at);
  for(let i=0;i<3;i++){const message=queue.messages.shift();if(message)await consumeLeadRadarQueueMessage(db,message,queue,deps);}
  assert.equal(fixture.value("SELECT status FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),'dead_letter');
  assert.equal(fixture.value("SELECT last_error_code FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'"),'waiting_for_account');
});

test('optional Firecrawl discovery queues missing sites and completes enrichment through the real queue/store', async () => {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0049_lead_radar_firecrawl.sql'), 'utf8'));
  const db = fixture.asD1(); const store = new LeadRadarStore(db); const queue = new RecordingQueue();
  const at = new Date('2026-08-28T12:00:00.000Z'); let calls = 0;
  const provider = await createFirecrawlQueueDependencies({ FIRECRAWL_API_KEY: 'fixture-only', LEAD_RADAR_FIRECRAWL_ENABLED: 'true',
    LEAD_RADAR_FIRECRAWL_MODE: 'fallback', LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: 'org-a' }, db, 'org-a', false, {
    now: () => at, robots: async () => null,
    fetch: async (input) => {
      calls++;
      const response = String(input).endsWith('/search') ? { success: true, data: { web: [{ url: 'https://clinic.uz/' }] } }
        : String(input).endsWith('/map') ? { success: true, links: [] }
          : { success: true, data: { html: '<h1>Example Clinic missing-site</h1><p>Ташкент</p><footer>+998711234567</footer>',
            links: [], metadata: { sourceURL: 'https://clinic.uz/', statusCode: 200 } } };
      return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const result = await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, at, 'firecrawl-fixture');
  assert.equal((await consumeLeadRadarQueueMessage(db, queue.messages[0], queue, {
    ...provider, now: () => at, discover: async () => ({ candidates: [candidate(null, 'missing-site')], sourceWarnings: [] }),
  })).outcome, 'completed');
  const child = fixture.rows<{ id: string }>("SELECT id FROM lead_radar_jobs WHERE stage = 'enrichment'")[0];
  assert.ok(child, 'domain discovery must not stop at no_website before creating a child job');
  const envelope = { schema: 'gptbot.lead-radar.job.v1' as const, job_id: child.id };
  assert.equal((await consumeLeadRadarQueueMessage(db, envelope, queue, { ...provider, now: () => at })).outcome, 'retry_wait');
  at.setTime(at.getTime() + 121_000);
  assert.equal((await consumeLeadRadarQueueMessage(db, envelope, queue, { ...provider, now: () => at })).outcome, 'completed');
  assert.equal(fixture.value('SELECT website FROM lead_radar_companies WHERE search_id = ?', result.search.id), 'https://clinic.uz');
  assert.equal(fixture.value('SELECT enrichment_status FROM lead_radar_companies'), 'enriched');
  assert.equal(calls, 3);
  assert.equal((await consumeLeadRadarQueueMessage(db, envelope, queue, { ...provider, now: () => at })).outcome, 'duplicate');
  assert.equal(calls, 3, 'queue replay must not repeat paid requests');
});

test('without provider opt-in missing sites remain terminal and create no extra jobs', async () => {
  const fixture = database(); const db = fixture.asD1(); const store = new LeadRadarStore(db); const queue = new RecordingQueue();
  const at = new Date('2026-08-28T12:00:00.000Z');
  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, at, 'disabled-fixture');
  await consumeLeadRadarQueueMessage(db, queue.messages[0], queue, { now: () => at,
    discover: async () => ({ candidates: [candidate(null)], sourceWarnings: [] }),
  });
  assert.equal(fixture.value("SELECT COUNT(*) FROM lead_radar_jobs WHERE stage = 'enrichment'"), 0);
  assert.equal(fixture.value('SELECT enrichment_reason FROM lead_radar_companies'), 'no_website');
});

for (const mode of ['no_site','robots_denied','retry_exhausted'] as const) test(`contact phase survives ${mode}, independently of website enrichment`,async()=>{
  const fixture=database(),db=fixture.asD1(),store=new LeadRadarStore(db),queue=new RecordingQueue();
  const at=new Date('2026-08-28T12:00:00.000Z');let checked=0;
  const deps={now:()=>at,resolveLeadContacts:async()=>{checked++;return {pending:false};},
    enrichWebsite:async()=>mode==='retry_exhausted' ? {facts:null,reason:'source_unavailable' as const,retryable:true}
      : {facts:null,reason:'robots_blocked' as const,retryable:false}};
  await enqueueLeadRadarSearch(store,'org-a',SEARCH_INPUT,queue,at,`contacts-${mode}`);
  await consumeLeadRadarQueueMessage(db,queue.messages[0],queue,{...deps,discover:async()=>({candidates:[candidate(mode==='no_site' ? null : 'https://clinic.example/')],sourceWarnings:[]})});
  const site=fixture.rows<{id:string}>("SELECT id FROM lead_radar_jobs WHERE stage='enrichment'")[0];assert.ok(site);
  if (mode==='retry_exhausted') fixture.exec("UPDATE lead_radar_jobs SET max_attempts=1 WHERE stage='enrichment'");
  await consumeLeadRadarQueueMessage(db,{schema:'gptbot.lead-radar.job.v1',job_id:site.id},queue,deps);
  const contact=fixture.rows<{id:string}>("SELECT id FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-resolve:%'")[0];assert.ok(contact,'terminal website outcome must still create the independent contact job');
  assert.equal((await consumeLeadRadarQueueMessage(db,{schema:'gptbot.lead-radar.job.v1',job_id:contact.id},queue,deps)).outcome,'completed');
  assert.equal(checked,1);
});

test('provider capacity waits preserve failure attempts, but stop deferring after 30 minutes', async () => {
  const fixture = database(); const db = fixture.asD1(); const store = new LeadRadarStore(db); const queue = new RecordingQueue();
  const start = new Date('2026-08-28T12:00:00.000Z'); let at = new Date(start);
  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, start, 'bounded-provider-wait');
  await consumeLeadRadarQueueMessage(db, queue.messages[0], queue, { now: () => at,
    discover: async () => ({ candidates: [candidate('https://clinic.uz')], sourceWarnings: [] }),
  });
  const child = fixture.rows<{ id: string }>("SELECT id FROM lead_radar_jobs WHERE stage = 'enrichment'")[0];
  const envelope = { schema: 'gptbot.lead-radar.job.v1' as const, job_id: child.id };
  const deps = { now: () => at, enrichLead: async () => ({ facts: null, reason: 'source_timeout' as const,
    retryable: true, deferUntil: new Date(at.getTime() + 60_000).toISOString() }) };
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await consumeLeadRadarQueueMessage(db, envelope, queue, deps), {
      outcome: 'retry_wait', delaySeconds: 60,
    });
    const deferred = await store.getJob(child.id);
    assert.equal(deferred?.attemptCount, 0, 'a capacity wait is not a failed network attempt');
    assert.equal(deferred?.createdAt, start.toISOString(), 'deadline is not extended by retry');
    at = new Date(at.getTime() + 61_000);
  }
  assert.ok(queue.delays.filter((delay) => delay === 60).length >= 5,
    'each continuation gets a fresh delayed envelope, not Queue retry exhaustion');
  queue.failures = 1;
  const failedDispatch = await consumeLeadRadarQueueMessage(db, envelope, queue, deps);
  assert.equal(failedDispatch.outcome, 'retry_wait');
  assert.ok(failedDispatch.outcome === 'retry_wait' && failedDispatch.retryDelivery,
    'a failed delayed send retains the delivery retry plus durable pending outbox');
  assert.equal((await store.getJob(child.id))?.dispatchStatus, 'pending');
  assert.equal((await store.getJob(child.id))?.attemptCount, 0);
  at = new Date(start.getTime() + 31 * 60_000);
  // Once the defer window closes, transient source failures back off
  // 15 minutes, then 1 hour, inside the job before going terminal.
  const transientBackoffMs = [15 * 60_000 + 1_000, 60 * 60_000 + 1_000, 0];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const outcome = await consumeLeadRadarQueueMessage(db, envelope, queue, deps);
    assert.equal((await store.getJob(child.id))?.attemptCount, attempt);
    assert.equal(outcome.outcome, attempt === 3 ? 'dead_letter' : 'retry_wait');
    if (attempt < 3 && outcome.outcome === 'retry_wait') {
      assert.equal(outcome.delaySeconds, [15 * 60, 60 * 60][attempt - 1]);
    }
    at = new Date(at.getTime() + transientBackoffMs[attempt - 1]);
  }
  const terminal = await store.getJob(child.id);
  assert.equal(await store.retryJob('org-a', child.id, 'stale-owner', 'source_timeout',
    at.toISOString(), at.toISOString(), terminal?.leaseGeneration, true), false);
  assert.equal((await store.getJob(child.id))?.status, 'dead_letter');
});

test('crash after Queue accepted a send produces a safe duplicate instead of a duplicate effect', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue(true);
  queue.failures = 1;
  const start = new Date('2026-08-25T11:00:00.000Z');

  const created = await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, start);
  assert.equal(queue.messages.length, 1, 'the transport accepted the message before the sender observed failure');
  assert.equal((await store.getJob(queue.messages[0].job_id))?.dispatchStatus, 'pending');

  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date(start.getTime() + 6_000), 5,
  ), 1);
  assert.equal(queue.messages.length, 2);
  assert.deepEqual(queue.messages[1], queue.messages[0]);

  const first = await consumeLeadRadarQueueMessage(db, queue.messages[0], queue, {
    now: () => new Date(start.getTime() + 7_000),
    discover: async () => ({ candidates: [], sourceWarnings: [], rawDiscoveredCount: 0 }),
  });
  const duplicate = await consumeLeadRadarQueueMessage(db, queue.messages[1], queue, {
    now: () => new Date(start.getTime() + 8_000),
  });
  assert.equal(first.outcome, 'completed');
  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_jobs WHERE search_id = ? AND status = ?',
    created.search.id,
    'completed',
  ), 1);
});

test('send failure remains pending and the durable dispatcher recovers it without a business attempt', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue(false);
  queue.failures = 1;
  const start = new Date('2026-08-25T12:00:00.000Z');

  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, start);
  const jobId = String(fixture.value("SELECT id FROM lead_radar_jobs WHERE org_id = 'org-a'"));
  let job = await store.getJob(jobId);
  assert.equal(queue.messages.length, 0);
  assert.equal(job?.status, 'queued');
  assert.equal(job?.attemptCount, 0);
  assert.equal(job?.dispatchAttemptCount, 1);
  assert.equal(job?.dispatchStatus, 'pending');

  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date(start.getTime() + 6_000), 5,
  ), 1);
  job = await store.getJob(jobId);
  assert.equal(queue.messages.length, 1);
  assert.equal(job?.status, 'queued');
  assert.equal(job?.attemptCount, 0);
  assert.equal(job?.dispatchAttemptCount, 2);
  assert.equal(job?.dispatchStatus, 'sent');
});

test('a sent but unobserved delivery returns to the outbox after its visibility timeout', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const start = new Date('2026-08-25T12:30:00.000Z');

  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, start);
  assert.equal(queue.messages.length, 1);
  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date(start.getTime() + 4 * 60_000), 5,
  ), 0);
  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date(start.getTime() + 6 * 60_000), 5,
  ), 1);
  assert.equal(queue.messages.length, 2);
  assert.deepEqual(queue.messages[1], queue.messages[0]);
  const job = await store.getJob(queue.messages[0].job_id);
  assert.equal(job?.status, 'queued');
  assert.equal(job?.dispatchAttemptCount, 2);
});

test('D1 owns retry timing and a completed job cannot regress', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const start = new Date('2026-08-25T13:00:00.000Z');

  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, start);
  const firstMessage = queue.messages.shift();
  assert.ok(firstMessage);
  const retry = await consumeLeadRadarQueueMessage(db, firstMessage, queue, {
    now: () => start,
    discover: async () => { throw new Error('source timeout'); },
  });
  assert.deepEqual(retry, {
    outcome: 'retry_wait', delaySeconds: 45, retryDelivery: true,
  });
  let job = await store.getJob(firstMessage.job_id);
  assert.equal(job?.status, 'retry_wait');
  assert.equal(job?.dispatchStatus, 'pending');
  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date(start.getTime() + 44_000), 5,
  ), 0);
  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date(start.getTime() + 46_000), 5,
  ), 1);

  const retryMessage = queue.messages.shift();
  assert.ok(retryMessage);
  assert.equal((await consumeLeadRadarQueueMessage(db, retryMessage, queue, {
    now: () => new Date(start.getTime() + 46_000),
    discover: async () => ({ candidates: [], sourceWarnings: [], rawDiscoveredCount: 0 }),
  })).outcome, 'completed');
  job = await store.getJob(firstMessage.job_id);
  assert.equal(job?.status, 'completed');
  assert.equal(job?.attemptCount, 2);
  assert.equal(await store.retryJob(
    job?.orgId ?? '', job?.id ?? '', job?.leaseOwner ?? '', 'source_timeout',
    new Date(start.getTime() + 100_000).toISOString(),
    new Date(start.getTime() + 50_000).toISOString(),
    job?.leaseGeneration,
  ), false);
  assert.equal((await store.getJob(firstMessage.job_id))?.status, 'completed');
});

test('lease generation fences a stale worker and terminal state is monotonic', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-25T14:00:00.000Z');
  const job = await store.createJob(
    'org-a', searchId, null, 'discovery', 'stale-worker-fixture', '2026-08-25T14:00:00.000Z', 3,
  );
  const first = await store.claimJob(
    'org-a', job.id, '2026-08-25T14:00:00.000Z', '2026-08-25T14:01:00.000Z',
  );
  const second = await store.claimJob(
    'org-a', job.id, '2026-08-25T14:02:00.000Z', '2026-08-25T14:03:00.000Z',
  );
  assert.ok(first?.leaseOwner);
  assert.ok(second?.leaseOwner);
  assert.equal(second?.leaseGeneration, (first?.leaseGeneration ?? 0) + 1);
  assert.equal(await store.completeJob(
    'org-a', job.id, second?.leaseOwner ?? '', '2026-08-25T14:02:01.000Z', first?.leaseGeneration,
  ), false, 'even the current owner cannot use an old fencing generation');
  assert.equal(await store.extendJobLease(
    'org-a', job.id, first?.leaseOwner ?? '', first?.leaseGeneration ?? 0,
    '2026-08-25T14:02:01.000Z', '2026-08-25T14:04:00.000Z',
  ), false);
  assert.equal(await store.completeJob(
    'org-a', job.id, second?.leaseOwner ?? '', '2026-08-25T14:02:01.000Z', second?.leaseGeneration,
  ), true);
  assert.equal(await store.claimJob(
    'org-a', job.id, '2026-08-25T14:05:00.000Z', '2026-08-25T14:06:00.000Z',
  ), null);
  assert.equal((await store.getJob(job.id))?.status, 'completed');
});

test('bulk discovery fan-out is tenant-scoped, suppression-safe, replay-safe, and parent-fenced', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const now = '2026-08-25T14:30:00.000Z';
  const leaseExpiresAt = '2026-08-25T14:35:00.000Z';
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, now);
  const parent = await store.createJob(
    'org-a', searchId, null, 'discovery', 'bulk-fanout-parent', now, 3,
  );
  const claimed = await store.claimJob('org-a', parent.id, now, leaseExpiresAt);
  assert.ok(claimed?.leaseOwner);

  await db.prepare(`INSERT INTO lead_radar_suppressions (
    org_id, canonical_key, domain, phone_digits, name_city_key, suppressed_at, reason
  ) VALUES (?, ?, ?, NULL, NULL, ?, 'do_not_contact')`).bind(
    'org-a', 'blocked-alias', 'blocked.example', now,
  ).run();
  await db.prepare(`INSERT INTO lead_radar_suppressions (
    org_id, canonical_key, domain, phone_digits, name_city_key, suppressed_at, reason
  ) VALUES (?, ?, ?, NULL, NULL, ?, 'do_not_contact')`).bind(
    'org-b', 'other-tenant-alias', 'allowed.example', now,
  ).run();

  const blocked = storedLead('blocked-company', 'https://blocked.example');
  const allowed = storedLead('allowed-company', 'https://allowed.example');
  allowed.evidence = [{
    id: 'bulk-allowed-name',
    fieldPath: 'company.name',
    value: 'allowed-company',
    sourceUrl: 'https://www.openstreetmap.org/node/100',
    sourceType: 'openstreetmap',
    observedAt: now,
    confidence: 0.9,
    classification: 'company_data',
  }];
  const persist = () => store.persistDiscoveryFanout(
    'org-a', searchId, parent.id, claimed?.leaseOwner ?? '',
    claimed?.leaseGeneration ?? 0, [blocked, allowed], now,
    '9999-12-31T23:59:59.999Z',
  );

  assert.equal(await persist(), true);
  assert.equal(await persist(), true, 'replaying the same active parent is idempotent');
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_companies WHERE org_id = ? AND search_id = ?',
    'org-a', searchId,
  ), 1);
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_companies WHERE org_id = ? AND search_id = ? AND canonical_key = ?',
    'org-a', searchId, 'allowed-company',
  ), 1, 'another tenant\'s suppression must not leak into org-a');
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_evidence WHERE org_id = ?', 'org-a',
  ), 1);
  assert.equal(fixture.value(
    "SELECT COUNT(*) FROM lead_radar_jobs WHERE org_id = ? AND search_id = ? AND stage = 'enrichment'",
    'org-a', searchId,
  ), 1);
  assert.equal(fixture.value(
    'SELECT excluded_count FROM lead_radar_searches WHERE org_id = ? AND id = ?',
    'org-a', searchId,
  ), 1);

  assert.equal(await store.persistDiscoveryFanout(
    'org-a', searchId, parent.id, claimed?.leaseOwner ?? '',
    (claimed?.leaseGeneration ?? 0) - 1, [blocked, allowed], now,
    '9999-12-31T23:59:59.999Z',
  ), false, 'a stale fencing generation cannot mutate the fan-out');
  assert.equal(await store.completeDiscoveryJobAndReleaseFanout(
    'org-a', searchId, parent.id, claimed?.leaseOwner ?? '', now,
    claimed?.leaseGeneration ?? 0,
  ), true);
  assert.equal(fixture.value(
    "SELECT next_dispatch_at FROM lead_radar_jobs WHERE org_id = ? AND search_id = ? AND stage = 'enrichment'",
    'org-a', searchId,
  ), now, 'child dispatch is released only with durable parent completion');
  assert.equal(await persist(), false, 'a terminal parent cannot replay fan-out writes');
  assert.equal(fixture.value(
    "SELECT COUNT(*) FROM lead_radar_jobs WHERE org_id = ? AND search_id = ? AND stage = 'enrichment'",
    'org-a', searchId,
  ), 1);
});

test('enrichment effect ledger records one digest across duplicate delivery', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const at = new Date('2026-08-25T15:00:00.000Z');
  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, at);
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);
  assert.equal((await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, {
    now: () => at,
    discover: async () => ({
      candidates: [candidate('https://example.uz')],
      sourceWarnings: [],
      rawDiscoveredCount: 1,
    }),
  })).outcome, 'completed');
  const enrichmentMessage = queue.messages.shift();
  assert.ok(enrichmentMessage);
  const enrich = async () => ({
    facts: {
      website: 'https://example.uz',
      phone: '+998901234567',
      genericEmail: 'sales@example.uz',
      telegramUrl: null,
      telegramContact: null,
      decisionMakers: [],
      evidence: [{
        id: 'fixture-site-phone',
        fieldPath: 'web.phone',
        value: '+998901234567',
        sourceUrl: 'https://example.uz/contact',
        sourceType: 'company_website' as const,
        observedAt: at.toISOString(),
        confidence: 0.95,
        classification: 'fact' as const,
      }],
      signals: [],
    },
    reason: 'enriched' as const,
    retryable: false,
  });
  assert.equal((await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => at,
    enrichWebsite: enrich,
  })).outcome, 'completed');
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_job_effects WHERE job_id = ?', enrichmentMessage.job_id,
  ), 1);
  const digest = String(fixture.value(
    'SELECT payload_digest FROM lead_radar_job_effects WHERE job_id = ?', enrichmentMessage.job_id,
  ));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal((await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => new Date(at.getTime() + 1_000),
    enrichWebsite: enrich,
  })).outcome, 'duplicate');
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_job_effects WHERE job_id = ?', enrichmentMessage.job_id,
  ), 1);
});

test('each released enrichment slot dispatches one next due child without waiting for cron', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const at = new Date('2026-08-25T15:15:00.000Z');
  const input = { ...SEARCH_INPUT, desiredCount: 7 };

  await enqueueLeadRadarSearch(store, 'org-a', input, queue, at);
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);
  const discovered = await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, {
    now: () => at,
    discover: async () => ({
      candidates: Array.from({ length: 7 }, (_, index) => (
        candidate(`https://example-${index}.uz`, `fixture-company-${index}`)
      )),
      sourceWarnings: [],
      rawDiscoveredCount: 7,
    }),
  });
  assert.equal(discovered.outcome, 'completed');
  assert.equal(queue.messages.length, 5, 'the discovery tick primes a bounded five-job window');

  const firstChild = queue.messages.shift();
  assert.ok(firstChild);
  const completed = await consumeLeadRadarQueueMessage(db, firstChild, queue, {
    now: () => at,
    enrichWebsite: async () => ({
      facts: null,
      reason: 'no_relevant_evidence',
      retryable: false,
    }),
  });
  assert.equal(completed.outcome, 'completed');
  assert.equal(queue.messages.length, 5, 'completion immediately replaces exactly one released slot');
  assert.equal(fixture.value(
    "SELECT COUNT(*) FROM lead_radar_jobs WHERE search_id = ? AND stage = 'enrichment' AND dispatch_status = 'sent' AND status = 'queued'",
    String(fixture.value("SELECT id FROM lead_radar_searches WHERE org_id = 'org-a'")),
  ), 5);
  assert.equal(fixture.value(
    "SELECT COUNT(*) FROM lead_radar_jobs WHERE search_id = ? AND stage = 'enrichment' AND dispatch_status = 'pending' AND status = 'queued'",
    String(fixture.value("SELECT id FROM lead_radar_searches WHERE org_id = 'org-a'")),
  ), 1);

  const beforeDuplicate = queue.messages.length;
  assert.equal((await consumeLeadRadarQueueMessage(db, firstChild, queue, {
    now: () => at,
  })).outcome, 'duplicate');
  assert.equal(queue.messages.length, beforeDuplicate, 'a duplicate completion cannot release another slot');
});

test('an expired final-attempt lease with a committed effect completes instead of dead-lettering', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const startedAt = '2026-08-25T15:30:00.000Z';
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, startedAt);
  const leadId = await store.insertLead(
    'org-a', searchId, storedLead('effect-crash-company', 'https://example.uz'),
  );
  assert.ok(leadId);
  const job = await store.createJob(
    'org-a', searchId, leadId, 'enrichment', 'effect-crash-job', startedAt, 1,
  );
  const claimed = await store.claimJob(
    'org-a', job.id, startedAt, '2026-08-25T15:31:00.000Z',
  );
  assert.ok(claimed?.leaseOwner);
  assert.equal(await store.markLeadEnrichmentProcessing(
    'org-a', leadId, job.id, claimed?.leaseOwner ?? '', 1, startedAt,
    claimed?.leaseGeneration,
  ), true);
  const enriched = {
    ...storedLead('effect-crash-company', 'https://example.uz'),
    phone: '+998901234567',
    enrichmentStatus: 'enriched' as const,
    enrichmentReason: 'enriched' as const,
    enrichmentAttempts: 1,
    lastVerifiedAt: '2026-08-25T15:30:30.000Z',
  };
  assert.equal(await store.applyLeadEnrichment(
    'org-a',
    leadId,
    job.id,
    claimed?.leaseOwner ?? '',
    enriched,
    '2026-08-25T15:30:30.000Z',
    claimed?.leaseGeneration,
    { effectKey: 'company_enrichment:v1', payloadDigest: 'a'.repeat(64) },
  ), true);

  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date('2026-08-25T15:32:00.000Z'), 5,
  ), 0);
  assert.equal((await store.getJob(job.id))?.status, 'completed');
  assert.equal(fixture.value(
    'SELECT enrichment_status FROM lead_radar_companies WHERE id = ?', leadId,
  ), 'enriched');
  assert.equal(queue.messages.length, 0);
});

test('a terminal discovery crash closes its undispatched child fan-out', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const startedAt = '2026-08-25T15:45:00.000Z';
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, startedAt);
  const parent = await store.createJob(
    'org-a', searchId, null, 'discovery', 'crashed-parent', startedAt, 1,
  );
  const leadId = await store.insertLead(
    'org-a', searchId, storedLead('blocked-child-company', 'https://example.uz'),
  );
  assert.ok(leadId);
  const child = await store.createJob(
    'org-a', searchId, leadId, 'enrichment', 'blocked-child', startedAt, 3,
    '9999-12-31T23:59:59.999Z',
  );
  assert.ok(await store.claimJob(
    'org-a', parent.id, startedAt, '2026-08-25T15:46:00.000Z',
  ));

  assert.equal(await enqueueDueLeadRadarJobs(
    db, queue, new Date('2026-08-25T15:47:00.000Z'), 5,
  ), 0);
  assert.equal((await store.getJob(parent.id))?.status, 'dead_letter');
  assert.equal((await store.getJob(child.id))?.status, 'dead_letter');
  assert.equal(fixture.value(
    'SELECT enrichment_status FROM lead_radar_companies WHERE id = ?', leadId,
  ), 'terminal');
  assert.equal(queue.messages.length, 0);
});

test('bounded dispatcher gives each tenant a turn and balances stages within a tenant', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const now = '2026-08-25T16:00:00.000Z';
  const searchA = await store.createSearch('org-a', SEARCH_INPUT, now);
  const searchB = await store.createSearch('org-b', SEARCH_INPUT, now);
  const companyA = await store.insertLead(
    'org-a', searchA, storedLead('org-a-enrichment', 'https://example.uz'),
  );
  assert.ok(companyA);
  const jobs = [
    await store.createJob('org-a', searchA, null, 'discovery', 'org-a-discovery', now),
    await store.createJob('org-a', searchA, companyA, 'enrichment', 'org-a-enrichment', now),
    await store.createJob('org-b', searchB, null, 'discovery', 'org-b-discovery', now),
  ];
  const byId = new Map(jobs.map((job) => [job.id, { orgId: job.orgId, stage: job.stage }]));

  assert.equal(await enqueueDueLeadRadarJobs(db, queue, new Date(now), 3), 3);
  assert.deepEqual(queue.messages.map((message) => byId.get(message.job_id)), [
    { orgId: 'org-a', stage: 'discovery' },
    { orgId: 'org-b', stage: 'discovery' },
    { orgId: 'org-a', stage: 'enrichment' },
  ]);
});

const CONTACT_POOL_INPUT: LeadRadarSearchInput = {
  ...SEARCH_INPUT,
  searchGoal: 'telegram_contacts',
  desiredCount: 5,
  maxCandidates: 25,
};

function contactPoolDatabase(): SqliteD1 {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0050_lead_radar_contact_discovery.sql'), 'utf8'));
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0054_lead_radar_candidate_pool_resume.sql'), 'utf8'));
  fixture.exec("CREATE TABLE d1_migrations (name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');");
  return fixture;
}

async function runningDiscoveryJob(
  store: LeadRadarStore,
  fixture: SqliteD1,
  searchId: string,
  at: Date,
  key: string,
) {
  const created = await store.createJob('org-a', searchId, null, 'discovery', key, at.toISOString());
  fixture.sqlite.prepare(
    "UPDATE lead_radar_jobs SET status='running', lease_owner='owner', lease_generation=1, lease_expires_at=? WHERE id=?",
  ).run(new Date(at.getTime() + 600_000).toISOString(), created.id);
  const job = await store.getJob(created.id);
  assert.ok(job);
  return job;
}

test('a time-limited pool resumes with a bounded rediscovery round instead of staying partial', async () => {
  const fixture = contactPoolDatabase();
  const store = new LeadRadarStore(fixture.asD1());
  const at = new Date('2026-08-28T12:00:00.000Z');
  const now = at.toISOString();
  const searchId = await store.createSearch('org-a', CONTACT_POOL_INPUT, now);
  const leadId = await store.insertLead('org-a', searchId, storedLead('resume-company', null));
  assert.ok(leadId);
  const initial = await store.createJob('org-a', searchId, null, 'discovery', `contact-pool:${searchId}:0`, now);
  fixture.sqlite.prepare("UPDATE lead_radar_jobs SET status='completed', completed_at=?, updated_at=? WHERE id=?").run(now, now, initial.id);
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,target,stop_reason,created_at,expires_at,updated_at)
    VALUES ('org-a',?,NULL,25,25,5,'time_limit',?,?,?)`)
    .run(searchId, new Date(at.getTime() - 2 * 60 * 60_000).toISOString(), new Date(at.getTime() - 60_000).toISOString(), now);
  await store.refreshSearchFunnel('org-a', searchId, now);
  assert.equal(fixture.value('SELECT resume_count FROM lead_radar_candidate_pools'), 1);
  assert.equal(fixture.value('SELECT stop_reason FROM lead_radar_candidate_pools'), null);
  assert.equal(fixture.value('SELECT candidate_count FROM lead_radar_candidate_pools'), 0);
  assert.equal(fixture.value('SELECT cursor FROM lead_radar_candidate_pools'), 0);
  assert.equal(
    fixture.value('SELECT status FROM lead_radar_jobs WHERE idempotency_key=?', `contact-pool:${searchId}:resume:1`),
    'queued',
  );
  const summary = await store.getSearch('org-a', searchId);
  assert.equal(summary?.search.status, 'running');
  assert.equal(summary?.search.phase, 'discovering');
});

test('a pool that already used both resume rounds stops at the time limit for good', async () => {
  const fixture = contactPoolDatabase();
  const store = new LeadRadarStore(fixture.asD1());
  const at = new Date('2026-08-28T12:00:00.000Z');
  const now = at.toISOString();
  const searchId = await store.createSearch('org-a', CONTACT_POOL_INPUT, now);
  const leadId = await store.insertLead('org-a', searchId, storedLead('exhausted-resume-company', null));
  assert.ok(leadId);
  const initial = await store.createJob('org-a', searchId, null, 'discovery', `contact-pool:${searchId}:0`, now);
  fixture.sqlite.prepare("UPDATE lead_radar_jobs SET status='completed', completed_at=?, updated_at=? WHERE id=?").run(now, now, initial.id);
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,target,stop_reason,resume_count,created_at,expires_at,updated_at)
    VALUES ('org-a',?,NULL,25,25,5,NULL,2,?,?,?)`)
    .run(searchId, new Date(at.getTime() - 3 * 60 * 60_000).toISOString(), new Date(at.getTime() - 60_000).toISOString(), now);
  await store.refreshSearchFunnel('org-a', searchId, now);
  assert.equal(fixture.value('SELECT stop_reason FROM lead_radar_candidate_pools'), 'time_limit');
  assert.equal(fixture.value('SELECT resume_count FROM lead_radar_candidate_pools'), 2);
  assert.equal(
    fixture.value("SELECT COUNT(*) FROM lead_radar_jobs WHERE idempotency_key LIKE 'contact-pool:%:resume:%'"),
    0,
  );
  const summary = await store.getSearch('org-a', searchId);
  assert.equal(summary?.search.status, 'partial');
  assert.ok(
    String(fixture.value('SELECT warnings_json FROM lead_radar_searches WHERE id=?', searchId)).includes('contact_time_limit'),
  );
});

test('oversized candidate sets are capped during discovery with a visible warning instead of silent loss', async () => {
  const fixture = contactPoolDatabase();
  const store = new LeadRadarStore(fixture.asD1());
  const queue = new RecordingQueue();
  const at = new Date('2026-08-28T12:00:00.000Z');
  const result = await enqueueLeadRadarSearch(
    store, 'org-a', { ...CONTACT_POOL_INPUT, maxCandidates: 250 }, queue, at, 'capped-pool-test',
  );
  const fatCandidate = (key: string): SourceCandidate => ({
    ...candidate(null, key),
    evidence: Array.from({ length: 16 }, (_, i) => ({
      id: `${key}-ev-${i}`,
      fieldPath: 'company.name',
      value: 'x'.repeat(2000),
      sourceUrl: 'https://www.openstreetmap.org/node/42',
      sourceType: 'openstreetmap' as const,
      observedAt: '2026-08-25T10:00:00.000Z',
      confidence: 0.9,
      classification: 'company_data' as const,
    })),
  });
  const deps = {
    now: () => at,
    discover: async () => ({
      candidates: Array.from({ length: 250 }, (_, i) => fatCandidate(`fat-${i}`)),
      sourceWarnings: [] as string[],
    }),
  };
  const message = queue.messages.shift();
  assert.ok(message);
  await consumeLeadRadarQueueMessage(fixture.asD1(), message, queue, deps);
  const kept = Number(fixture.value('SELECT candidate_count FROM lead_radar_candidate_pools'));
  assert.ok(kept > 0 && kept < 250, `kept=${kept}`);
  const warnings = String(fixture.value('SELECT warnings_json FROM lead_radar_searches WHERE id=?', result.search.id));
  assert.ok(warnings.includes('contact_candidates_capped'), warnings);
});

test('pool re-initialization replaces candidates and reopens the pool without touching resume history', async () => {
  const fixture = contactPoolDatabase();
  const store = new LeadRadarStore(fixture.asD1());
  const at = new Date('2026-08-28T12:00:00.000Z');
  const now = at.toISOString();
  const searchId = await store.createSearch('org-a', CONTACT_POOL_INPUT, now);
  const job = await runningDiscoveryJob(store, fixture, searchId, at, `contact-pool:${searchId}:0`);
  const first = await store.contactDiscovery.initialize(job, [storedLead('lead-a', null)], 5, now);
  assert.deepEqual(first, { kept: 1, dropped: 0 });
  await store.contactDiscovery.stop('org-a', searchId, 'time_limit', now);
  assert.equal(await store.contactDiscovery.markForResume('org-a', searchId, now), true);
  const second = await store.contactDiscovery.initialize(
    job, [storedLead('lead-b', null), storedLead('lead-c', null)], 5, now,
  );
  assert.deepEqual(second, { kept: 2, dropped: 0 });
  const pool = await store.contactDiscovery.getPool('org-a', searchId);
  assert.ok(pool);
  assert.equal(pool.candidate_count, 2);
  assert.equal(pool.cursor, 0);
  assert.equal(pool.batch_start, 0);
  assert.equal(pool.batch_job_id, null);
  assert.equal(pool.stop_reason, null);
  assert.equal(pool.resume_count, 1);
  assert.ok(pool.candidates_json);
  assert.ok(pool.candidates_json.includes('lead-c'));
  assert.ok(!pool.candidates_json.includes('lead-a'));
});

test('pool initialization reports candidates dropped by the byte budget', async () => {
  const fixture = contactPoolDatabase();
  const store = new LeadRadarStore(fixture.asD1());
  const at = new Date('2026-08-28T12:00:00.000Z');
  const now = at.toISOString();
  const searchId = await store.createSearch('org-a', CONTACT_POOL_INPUT, now);
  const job = await runningDiscoveryJob(store, fixture, searchId, at, `contact-pool:${searchId}:0`);
  const fatLead = (key: string): StoredLeadInput => ({
    ...storedLead(key, null),
    evidence: Array.from({ length: 16 }, (_, i) => ({
      id: `${key}-ev-${i}`,
      fieldPath: 'company.name',
      value: 'x'.repeat(2000),
      sourceUrl: 'https://www.openstreetmap.org/node/42',
      sourceType: 'openstreetmap' as const,
      observedAt: now,
      confidence: 0.9,
      classification: 'company_data' as const,
    })),
  });
  const fat = Array.from({ length: 250 }, (_, i) => fatLead(`fat-${i}`));
  const { kept, dropped } = await store.contactDiscovery.initialize(job, fat, 5, now);
  assert.ok(kept > 0 && kept < 250, `kept=${kept}`);
  assert.equal(dropped, 250 - kept);
  assert.equal(Number(fixture.value('SELECT candidate_count FROM lead_radar_candidate_pools')), kept);
});

test('a budget-parked contact job does not block pool resume after a time limit', async () => {
  const fixture = contactPoolDatabase();
  const store = new LeadRadarStore(fixture.asD1());
  const at = new Date('2026-08-28T12:00:00.000Z');
  const now = at.toISOString();
  const searchId = await store.createSearch('org-a', CONTACT_POOL_INPUT, now);
  const leadId = await store.insertLead('org-a', searchId, storedLead('parked-budget-company', null));
  assert.ok(leadId);
  const initial = await store.createJob('org-a', searchId, null, 'discovery', `contact-pool:${searchId}:0`, now);
  fixture.sqlite.prepare("UPDATE lead_radar_jobs SET status='completed', completed_at=?, updated_at=? WHERE id=?").run(now, now, initial.id);
  // Prod state (2026-08-28): a domain-budget retry_wait job parked for its
  // cooldown plus per-company budget dead letters froze the pool "running".
  const parked = await store.createJob('org-a', searchId, leadId, 'enrichment', `contact-resolve:${searchId}:${leadId}`, now);
  const parkedUntil = new Date(at.getTime() + 900_000).toISOString();
  fixture.sqlite.prepare("UPDATE lead_radar_jobs SET status='retry_wait', last_error_code=?, available_at=?, next_dispatch_at=?, updated_at=? WHERE id=?")
    .run('contact_sources_domain_budget_exhausted', parkedUntil, parkedUntil, now, parked.id);
  const earlier = await store.createJob('org-a', searchId, leadId, 'enrichment', `contact-resolve:${searchId}:${leadId}:earlier`, now);
  fixture.sqlite.prepare("UPDATE lead_radar_jobs SET status='dead_letter', last_error_code=?, completed_at=?, updated_at=? WHERE id=?")
    .run('contact_sources_company_budget_exhausted', now, now, earlier.id);
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,target,stop_reason,created_at,expires_at,updated_at)
    VALUES ('org-a',?,NULL,127,10,5,'time_limit',?,?,?)`)
    .run(searchId, new Date(at.getTime() - 2 * 60 * 60_000).toISOString(), new Date(at.getTime() - 60_000).toISOString(), now);
  await store.refreshSearchFunnel('org-a', searchId, now);
  assert.equal(fixture.value('SELECT resume_count FROM lead_radar_candidate_pools'), 1);
  assert.equal(
    fixture.value('SELECT status FROM lead_radar_jobs WHERE idempotency_key=?', `contact-pool:${searchId}:resume:1`),
    'queued',
  );
  assert.equal(
    fixture.value('SELECT status FROM lead_radar_jobs WHERE id=?', parked.id),
    'retry_wait',
    'the parked budget job waits out its cooldown untouched',
  );
  const summary = await store.getSearch('org-a', searchId);
  assert.equal(summary?.search.status, 'running');
  assert.equal(summary?.search.phase, 'discovering');
});

test('transient source_unavailable backs off 15m then 1h and only the third failure goes terminal', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const start = new Date('2026-08-28T12:00:00.000Z');
  let at = new Date(start);
  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, start, 'transient-backoff');
  await consumeLeadRadarQueueMessage(db, queue.messages[0], queue, {
    now: () => at,
    discover: async () => ({ candidates: [candidate('https://clinic.example/')], sourceWarnings: [] }),
  });
  const child = fixture.rows<{ id: string }>("SELECT id FROM lead_radar_jobs WHERE stage = 'enrichment'")[0];
  assert.ok(child);
  const envelope = { schema: 'gptbot.lead-radar.job.v1' as const, job_id: child.id };
  const deps = {
    now: () => at,
    enrichWebsite: async () => ({ facts: null, reason: 'source_unavailable' as const, retryable: true }),
  };
  assert.deepEqual(await consumeLeadRadarQueueMessage(db, envelope, queue, deps), {
    outcome: 'retry_wait', delaySeconds: 15 * 60, retryDelivery: true,
  });
  assert.equal(fixture.value('SELECT enrichment_status FROM lead_radar_companies'), 'queued');
  at = new Date(at.getTime() + 15 * 60_000 + 1_000);
  assert.deepEqual(await consumeLeadRadarQueueMessage(db, envelope, queue, deps), {
    outcome: 'retry_wait', delaySeconds: 60 * 60, retryDelivery: true,
  });
  at = new Date(at.getTime() + 60 * 60_000 + 1_000);
  assert.deepEqual(await consumeLeadRadarQueueMessage(db, envelope, queue, deps), {
    outcome: 'dead_letter', errorCode: 'source_unavailable',
  });
  assert.equal(fixture.value('SELECT enrichment_status FROM lead_radar_companies'), 'terminal');
  assert.equal(fixture.value('SELECT enrichment_reason FROM lead_radar_companies'), 'retry_exhausted');
});

test('robots_blocked stays an immediate terminal outcome without consuming retries', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const at = new Date('2026-08-28T12:00:00.000Z');
  await enqueueLeadRadarSearch(store, 'org-a', SEARCH_INPUT, queue, at, 'robots-regression');
  await consumeLeadRadarQueueMessage(db, queue.messages[0], queue, {
    now: () => at,
    discover: async () => ({ candidates: [candidate('https://clinic.example/')], sourceWarnings: [] }),
  });
  const child = fixture.rows<{ id: string }>("SELECT id FROM lead_radar_jobs WHERE stage = 'enrichment'")[0];
  assert.ok(child);
  const envelope = { schema: 'gptbot.lead-radar.job.v1' as const, job_id: child.id };
  const deps = {
    now: () => at,
    enrichWebsite: async () => ({ facts: null, reason: 'robots_blocked' as const, retryable: false }),
  };
  assert.deepEqual(await consumeLeadRadarQueueMessage(db, envelope, queue, deps), { outcome: 'completed' });
  assert.equal(fixture.value('SELECT status FROM lead_radar_jobs WHERE id = ?', child.id), 'completed');
  assert.equal(fixture.value('SELECT enrichment_status FROM lead_radar_companies'), 'terminal');
  assert.equal(fixture.value('SELECT enrichment_reason FROM lead_radar_companies'), 'robots_blocked');
  assert.equal(
    (await consumeLeadRadarQueueMessage(db, envelope, queue, deps)).outcome,
    'duplicate',
    'a terminal robots decision is never retried',
  );
});
