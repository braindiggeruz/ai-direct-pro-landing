import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  consumeLeadRadarQueueMessage,
  enqueueDueLeadRadarJobs,
  enqueueLeadRadarSearch,
  LeadRadarStore,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
  type SourceCandidate,
  type StoredLeadInput,
} from '../functions/platform/lead-radar';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import { SqliteD1 } from './helpers/sqlite-d1';
import { createFirecrawlQueueDependencies } from '../functions/platform/lead-radar/firecrawl-enrichment';
import { checkCorporateTelegramContact, nextTelegramContactCandidate } from '../functions/platform/lead-radar/contact-resolution';
import { createContactSourceQueueDependencies } from '../functions/platform/lead-radar/contact-source-worker';

const SAMPLE_SIZES = [1, 5, 10, 50] as const;
const FIXED_NOW = new Date('2026-08-25T10:00:00.000Z');
// Cloudflare D1 limit verified 2026-08-25. Discovery is a hard Free-plan gate:
// 50 queries per Worker invocation, including statements inside a batch.
// https://developers.cloudflare.com/d1/platform/limits/
const FREE_D1_QUERIES_PER_INVOCATION = 50;

for (const missingWebsite of [false, true]) test(`Firecrawl four-page enrichment (${missingWebsite ? 'missing' : 'known'} site) stays within the Free D1 budget`, async (context) => {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0049_lead_radar_firecrawl.sql'), 'utf8'));
  const counted = new CountingD1(fixture.asD1()); const db = counted.asD1();
  const store = new LeadRadarStore(db); const queue = new RecordingQueue();
  let at = new Date(FIXED_NOW); let calls = 0;
  const searchId = await store.createSearch('org-a', searchInput(1), at.toISOString());
  const lead = storedLead(1, at.toISOString());
  const resolvedWebsite = lead.website!;
  if (missingWebsite) lead.website = null;
  const leadId = await store.insertLead('org-a', searchId, lead);
  assert.ok(leadId);
  const child = await store.createJob('org-a', searchId, leadId, 'enrichment', 'firecrawl-budget', at.toISOString(), 3);
  const env = { FIRECRAWL_API_KEY: 'fixture-only', LEAD_RADAR_FIRECRAWL_ENABLED: 'true',
    LEAD_RADAR_FIRECRAWL_MODE: 'fallback', LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS: 'org-a' };
  let completed = false;
  for (let delivery = 0; delivery < 3; delivery++) {
    counted.reset();
    const provider = await createFirecrawlQueueDependencies(env, db, 'org-a', false, {
      now: () => at, direct: async () => ({ facts: null, reason: 'source_unavailable', retryable: true }), robots: async () => null,
      fetch: async (input, init) => {
        calls++; const url = JSON.parse(String(init?.body)).url;
        const result = String(input).endsWith('/search') ? { success: true, data: { web: [{ url: resolvedWebsite }] } }
          : String(input).endsWith('/map') ? { success: true, links: ['/contacts', '/about', '/team'] }
          : { success: true, data: { html: `<h1>${lead.name}</h1><p>Ташкент</p>`, links: [], metadata: { sourceURL: url, statusCode: 200 } } };
        return new Response(JSON.stringify(result));
      },
    });
    const outcome = await consumeLeadRadarQueueMessage(db, { schema: 'gptbot.lead-radar.job.v1', job_id: child.id }, queue, { ...provider, now: () => at });
    const count = counted.snapshot('funnel_refresh', 1).executedStatements;
    // 4 base schema + 1 outer job lookup + <=4 timed lease heartbeats.
    context.diagnostic(`Firecrawl delivery ${delivery + 1}: ${count} D1 statements + 9 reserved for Worker/heartbeats`);
    assert.ok(count + 9 <= 50, `Firecrawl exceeds Free D1 budget: ${count}+9`);
    if (outcome.outcome === 'completed') { completed = true; break; }
    assert.equal(outcome.outcome, 'retry_wait');
    at = new Date(at.getTime() + 121_000);
  }
  assert.equal(completed, true);
  assert.equal(calls, missingWebsite ? 6 : 5, 'bounded search/map/scrapes; no re-submission after continuation');
  assert.equal(fixture.value('SELECT pages FROM lead_radar_firecrawl_reports'), 4);
});

test('background contact checks and final target aggregation fit the Free D1 budget', async (context) => {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0050_lead_radar_contact_discovery.sql'),'utf8'));
  fixture.exec(`CREATE TABLE d1_migrations(name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');
    CREATE TABLE lead_radar_tg_user_accounts(id TEXT,org_id TEXT,status TEXT);
    INSERT INTO lead_radar_tg_user_accounts VALUES ('fixture-account','org-a','connected');`);
  const store = new LeadRadarStore(fixture.asD1()), queue = new RecordingQueue();
  const now = FIXED_NOW.toISOString();
  const searchId = await store.createSearch('org-a',{...searchInput(5),searchGoal:'telegram_contacts',maxCandidates:25},now);
  const lead = storedLead(1,now);
  lead.enrichmentStatus = 'enriched';
  const companyId = await store.insertLead('org-a',searchId,lead);
  assert.ok(companyId);
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools (org_id,search_id,candidate_count,cursor,target,created_at,expires_at,updated_at)
    VALUES ('org-a',?,1,1,5,?,?,?)`).run(searchId,now,new Date(FIXED_NOW.getTime()+3600_000).toISOString(),now);
  const evidence = fixture.sqlite.prepare(`INSERT INTO lead_radar_evidence(id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
    VALUES (?,'org-a',?,?,?,?,'company_website',?,0.9,'company_data')`);
  evidence.run('binding',companyId,'web.website',lead.website,lead.website,now);
  fixture.exec("UPDATE lead_radar_evidence SET classification='fact' WHERE id='binding'");
  for (const [i,phone] of ['+998901234567','+998901234568'].entries()) evidence.run(`phone-${i}`,companyId,'company_contacts.phone',phone,lead.website,now);
  const job = await store.createJob('org-a',searchId,companyId,'enrichment',`contact-resolve:${searchId}:${companyId}`,now);
  const counted = new CountingD1(fixture.asD1()), db = counted.asD1();
  const outcome = await consumeLeadRadarQueueMessage(db,{schema:'gptbot.lead-radar.job.v1',job_id:job.id},queue,{
    now:() => FIXED_NOW,
    resolveLeadContacts:async () => {
      for (const phone of ['+998901234567','+998901234568']) await checkCorporateTelegramContact({
        db,orgId:'org-a',searchId,companyId,accountId:'fixture-account',candidateKey:`phone:${phone}`,now,
        resolve:async () => ({status:'unresolved',username:null,reason:'privacy_or_missing',retryAfterSeconds:null}),
      });
      return {pending:false};
    },
  });
  assert.equal(outcome.outcome,'completed');
  const count = counted.snapshot('funnel_refresh',1).executedStatements;
  // Nine outer Worker/heartbeat slots plus four for account/binding loading.
  context.diagnostic(`Contact delivery: ${count} D1 statements + 13 outer/account allowance`);
  assert.ok(count+13<=50,`Contact delivery exceeds Free D1 budget: ${count}+13`);
  assert.equal(fixture.value('SELECT COUNT(*) FROM lead_radar_contact_checks'),2);
});

test('contact-first search then Bridge proof stays inside D1 budget on every delivery',async(context)=>{
  const fixture=database();
  fixture.exec('CREATE TABLE d1_migrations(name TEXT)');
  for (const file of ['0049_lead_radar_firecrawl.sql','0050_lead_radar_contact_discovery.sql','0052_lead_radar_contact_sources.sql']) {
    fixture.exec(readFileSync(resolve(import.meta.dirname,'../migrations',file),'utf8'));
    fixture.sqlite.prepare('INSERT INTO d1_migrations VALUES (?)').run(file);
  }
  fixture.exec("CREATE TABLE lead_radar_tg_user_accounts(id TEXT,org_id TEXT,status TEXT); INSERT INTO lead_radar_tg_user_accounts VALUES ('fixture-account','org-a','connected')");
  const counted=new CountingD1(fixture.asD1()),db=counted.asD1(),store=new LeadRadarStore(db),queue=new RecordingQueue();
  let at=new Date(FIXED_NOW),requests=0;
  const searchId=await store.createSearch('org-a',searchInput(5),at.toISOString());
  const lead=storedLead(1,at.toISOString());lead.website=null;lead.phone='+998711234567';lead.enrichmentStatus='terminal';
  const companyId=(await store.insertLead('org-a',searchId,lead))!;
  const job=await store.createJob('org-a',searchId,companyId,'enrichment',`contact-resolve:${searchId}:${companyId}`,at.toISOString());
  const env={FIRECRAWL_API_KEY:'fixture-only',LEAD_RADAR_FIRECRAWL_ENABLED:'true',LEAD_RADAR_FIRECRAWL_MODE:'fallback',LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS:'org-a'};
  let completed=false;
  for (let delivery=0;delivery<3;delivery++) {
    counted.reset();
    const sources=await createContactSourceQueueDependencies(env,db,'org-a',{now:()=>at,robots:async()=>null,fetch:async(input)=>{
      requests++;const url='https://clinics.uz/catalog/fixture';
      return new Response(JSON.stringify(String(input).endsWith('/search') ? {success:true,data:{web:[{url}]}}
        : {success:true,data:{rawHtml:`<script type="application/ld+json">${JSON.stringify({'@type':'Dentist',name:lead.name,telephone:lead.phone,sameAs:'https://t.me/fixture_booking'})}</script>`,metadata:{statusCode:200,sourceURL:url}}}));
    }});
    const provider=await createFirecrawlQueueDependencies(env,db,'org-a',false,{preferContactDiscovery:true});
    const outcome=await consumeLeadRadarQueueMessage(db,{schema:'gptbot.lead-radar.job.v1',job_id:job.id},queue,{...provider,...sources,now:()=>at,
      resolveLeadContacts:async()=>{
        const base={db,orgId:'org-a',companyId,accountId:'fixture-account',now:at.toISOString()};
        const next=await nextTelegramContactCandidate(base);assert.ok(next.candidateKey);
        const checked=await checkCorporateTelegramContact({...base,searchId,candidateKey:next.candidateKey,resolve:async()=>({status:'resolved',username:'fixture_booking',reason:'regular_user_resolved',retryAfterSeconds:null})});
        assert.equal(checked.status,'resolved');return {pending:false};
      },
    });
    const count=counted.snapshot('funnel_refresh',1).executedStatements;
    // Includes both provider factories; reserve base auditor/job lookup,
    // account/binding and <=4 timed heartbeats in the production Worker.
    context.diagnostic(`Contact-first delivery ${delivery+1}: ${count} + 13 reserved`);
    assert.ok(count+13<=50,`contact-first exceeds D1 budget: ${count}+13`);
    if (outcome.outcome==='completed') {completed=true;break;}
    assert.equal(outcome.outcome,'retry_wait');at=new Date(at.getTime()+121_000);
  }
  assert.equal(completed,true);assert.equal(requests,2);
});

interface D1Counters {
  prepare: number;
  run: number;
  all: number;
  first: number;
  batch: number;
  batchStatements: number;
  rowsReturned: number;
}

interface D1BudgetSample extends D1Counters {
  operation: 'discovery_fanout' | 'funnel_refresh' | 'due_dispatch' | 'adversarial_cron' | 'contact_pool_discovery';
  n: number;
  executedStatements: number;
  roundTrips: number;
}

function zeroCounters(): D1Counters {
  return {
    prepare: 0,
    run: 0,
    all: 0,
    first: 0,
    batch: 0,
    batchStatements: 0,
    rowsReturned: 0,
  };
}

class CountingD1Statement {
  constructor(
    private inner: D1PreparedStatement,
    private readonly counters: D1Counters,
  ) {}

  bind(...values: unknown[]): CountingD1Statement {
    this.inner = this.inner.bind(...values);
    return this;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.counters.run += 1;
    return this.inner.run<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.counters.all += 1;
    const result = await this.inner.all<T>();
    this.counters.rowsReturned += result.results?.length ?? 0;
    return result;
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    this.counters.first += 1;
    const result = columnName === undefined
      ? await this.inner.first<T>()
      : await this.inner.first<T>(columnName);
    if (result !== null) this.counters.rowsReturned += 1;
    return result;
  }

  unwrap(): D1PreparedStatement {
    return this.inner;
  }
}

/**
 * Logical D1 profiler: deterministic in CI and independent of host CPU load.
 * `roundTrips` prices a batch as one D1 API call, while `executedStatements`
 * also accounts for every statement inside a batch.
 */
class CountingD1 {
  private counters = zeroCounters();

  constructor(private readonly inner: D1Database) {}

  prepare(sql: string): D1PreparedStatement {
    this.counters.prepare += 1;
    return new CountingD1Statement(
      this.inner.prepare(sql),
      this.counters,
    ) as unknown as D1PreparedStatement;
  }

  async batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    this.counters.batch += 1;
    this.counters.batchStatements += statements.length;
    const unwrapped = statements.map((statement) => (
      statement instanceof CountingD1Statement ? statement.unwrap() : statement
    ));
    return this.inner.batch<T>(unwrapped);
  }

  reset(): void {
    this.counters = zeroCounters();
  }

  snapshot(operation: D1BudgetSample['operation'], n: number): D1BudgetSample {
    const counters = { ...this.counters };
    return {
      operation,
      n,
      ...counters,
      executedStatements: counters.run + counters.all + counters.first
        + counters.batchStatements,
      roundTrips: counters.run + counters.all + counters.first + counters.batch,
    };
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

class RecordingQueue implements LeadRadarQueueSender {
  readonly messages: LeadRadarQueueMessage[] = [];

  async send(message: LeadRadarQueueMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

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

function searchInput(desiredCount: number): LeadRadarSearchInput {
  return {
    niche: 'Стоматологии',
    city: 'Ташкент',
    country: 'UZ',
    offer: 'AI-бот для заявок',
    desiredCount,
    telegramRequired: false,
    languages: ['ru', 'uz'],
  };
}

function candidate(index: number): SourceCandidate {
  const suffix = String(index).padStart(3, '0');
  const sourceUrl = `https://www.openstreetmap.org/node/${10_000 + index}`;
  return {
    sourceId: `budget-company-${suffix}`,
    sourceUrl,
    name: `Budget Clinic ${suffix}`,
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: `Ташкент, дом ${index}`,
    website: `https://clinic-${suffix}.example.uz`,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    evidence: [{
      id: `budget-evidence-${suffix}`,
      fieldPath: 'company.name',
      value: `Budget Clinic ${suffix}`,
      sourceUrl,
      sourceType: 'openstreetmap',
      observedAt: FIXED_NOW.toISOString(),
      confidence: 0.9,
      classification: 'company_data',
    }],
    signals: [],
  };
}

function storedLead(index: number, now: string): StoredLeadInput {
  const suffix = String(index).padStart(3, '0');
  return {
    canonicalKey: `budget-expired-${suffix}`,
    name: `Expired Budget Clinic ${suffix}`,
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: `Ташкент, дом ${index}`,
    website: `https://expired-${suffix}.example.uz`,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: 'pending',
    enrichmentReason: null,
    enrichmentAttempts: 0,
    score: 10,
    confidence: 0.8,
    priority: 'P3',
    lifecycle: 'new',
    suppressed: false,
    scoreComponents: [],
    signals: [],
    evidence: [],
    discoveredAt: now,
    lastVerifiedAt: now,
  };
}

function assertAtMost(
  sample: D1BudgetSample,
  metric: keyof D1Counters | 'executedStatements' | 'roundTrips',
  maximum: number,
): void {
  assert.ok(
    sample[metric] <= maximum,
    `${sample.operation} N=${sample.n}: ${metric}=${sample[metric]} exceeds ${maximum}`,
  );
}

function assertMarginalCostBounded(
  samples: D1BudgetSample[],
  metric: keyof D1Counters | 'executedStatements' | 'roundTrips',
  maximumPerItem: number,
): void {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const marginalCost = (current[metric] - previous[metric]) / (current.n - previous.n);
    assert.ok(
      marginalCost <= maximumPerItem,
      `${current.operation}: marginal ${metric}=${marginalCost} exceeds ${maximumPerItem}`,
    );
  }
}

async function measureDiscoveryFanout(n: number): Promise<{
  discovery: D1BudgetSample;
  funnel: D1BudgetSample;
}> {
  const fixture = database();
  const queue = new RecordingQueue();
  const store = new LeadRadarStore(fixture.asD1());
  const result = await enqueueLeadRadarSearch(
    store,
    `budget-discovery-${n}`,
    searchInput(n),
    queue,
    FIXED_NOW,
    `budget-request-${n}`,
  );
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);

  const profiler = new CountingD1(fixture.asD1());
  const outcome = await consumeLeadRadarQueueMessage(
    profiler.asD1(),
    discoveryMessage,
    queue,
    {
      now: () => FIXED_NOW,
      discover: async () => ({
        candidates: Array.from({ length: n }, (_, index) => candidate(index + 1)),
        sourceWarnings: [],
        rawDiscoveredCount: n,
      }),
    },
  );
  assert.deepEqual(outcome, { outcome: 'completed' });
  assert.equal(queue.messages.length, Math.min(n, 5));
  assert.equal(fixture.value(
    'SELECT COUNT(*) FROM lead_radar_companies WHERE org_id = ?', `budget-discovery-${n}`,
  ), n);
  assert.equal(fixture.value(
    `SELECT COUNT(*) FROM lead_radar_jobs
      WHERE org_id = ? AND stage = 'enrichment'`, `budget-discovery-${n}`,
  ), n);
  const discovery = profiler.snapshot('discovery_fanout', n);

  profiler.reset();
  await new LeadRadarStore(profiler.asD1()).refreshSearchFunnel(
    `budget-discovery-${n}`,
    result.search.id,
    FIXED_NOW.toISOString(),
  );
  return {
    discovery,
    funnel: profiler.snapshot('funnel_refresh', n),
  };
}

async function measureDueDispatch(n: number): Promise<D1BudgetSample> {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  const orgId = `budget-dispatch-${n}`;
  const searchId = await store.createSearch(orgId, searchInput(n), FIXED_NOW.toISOString());
  for (let index = 0; index < n; index += 1) {
    await store.createJob(
      orgId,
      searchId,
      null,
      'discovery',
      `budget-dispatch-job-${index}`,
      FIXED_NOW.toISOString(),
    );
  }

  const profiler = new CountingD1(fixture.asD1());
  const queue = new RecordingQueue();
  const sent = await enqueueDueLeadRadarJobs(
    profiler.asD1(),
    queue,
    FIXED_NOW,
    n,
  );
  assert.equal(sent, Math.min(n, 5));
  assert.equal(queue.messages.length, sent);
  return profiler.snapshot('due_dispatch', n);
}

async function measureAdversarialCron(): Promise<{
  sample: D1BudgetSample;
  sent: number;
  effectJobStatus: string | null;
  terminalJobStatus: string | null;
  terminalLeadStatus: string | null;
  pendingDueJobs: number;
}> {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const orgId = 'budget-adversarial-cron';
  const old = '2026-08-25T09:50:00.000Z';
  const effectAt = '2026-08-25T09:50:30.000Z';
  const searchId = await store.createSearch(orgId, searchInput(12), old);

  const effectLead = await store.insertLead(orgId, searchId, storedLead(1, old));
  const terminalLead = await store.insertLead(orgId, searchId, storedLead(2, old));
  assert.ok(effectLead);
  assert.ok(terminalLead);
  const effectJob = await store.createJob(
    orgId, searchId, effectLead, 'enrichment', 'budget-expired-effect', old, 1,
  );
  const terminalJob = await store.createJob(
    orgId, searchId, terminalLead, 'enrichment', 'budget-expired-terminal', old, 1,
  );
  const claimedEffect = await store.claimJob(
    orgId, effectJob.id, old, '2026-08-25T09:51:00.000Z',
  );
  const claimedTerminal = await store.claimJob(
    orgId, terminalJob.id, old, '2026-08-25T09:52:00.000Z',
  );
  assert.ok(claimedEffect?.leaseOwner);
  assert.ok(claimedTerminal?.leaseOwner);
  assert.equal(await store.markLeadEnrichmentProcessing(
    orgId, effectLead, effectJob.id, claimedEffect?.leaseOwner ?? '', 1, old,
    claimedEffect?.leaseGeneration,
  ), true);
  assert.equal(await store.applyLeadEnrichment(
    orgId,
    effectLead,
    effectJob.id,
    claimedEffect?.leaseOwner ?? '',
    {
      ...storedLead(1, effectAt),
      phone: '+998901234567',
      enrichmentStatus: 'enriched',
      enrichmentReason: 'enriched',
      enrichmentAttempts: 1,
    },
    effectAt,
    claimedEffect?.leaseGeneration,
    { effectKey: 'company_enrichment:v1', payloadDigest: 'b'.repeat(64) },
  ), true);

  for (let index = 0; index < 5; index += 1) {
    const stale = await store.createJob(
      orgId, searchId, null, 'discovery', `budget-stale-sent-${index}`, old,
    );
    const reservation = await store.reserveJobDispatch(
      orgId, stale.id, old, '2026-08-25T09:50:30.000Z',
    );
    assert.ok(reservation);
    assert.equal(await store.markJobDispatchSent(
      orgId, stale.id, reservation?.dispatchLeaseOwner ?? '', old,
    ), true);
  }
  for (let index = 0; index < 5; index += 1) {
    await store.createJob(
      orgId,
      searchId,
      null,
      'discovery',
      `budget-due-${index}`,
      FIXED_NOW.toISOString(),
    );
  }

  const profiler = new CountingD1(db);
  const queue = new RecordingQueue();
  const sent = await enqueueDueLeadRadarJobs(
    profiler.asD1(), queue, FIXED_NOW, 5,
  );
  return {
    sample: profiler.snapshot('adversarial_cron', 12),
    sent,
    effectJobStatus: fixture.value(
      'SELECT status FROM lead_radar_jobs WHERE id = ?', effectJob.id,
    ) as string | null,
    terminalJobStatus: fixture.value(
      'SELECT status FROM lead_radar_jobs WHERE id = ?', terminalJob.id,
    ) as string | null,
    terminalLeadStatus: fixture.value(
      'SELECT enrichment_status FROM lead_radar_companies WHERE id = ?', terminalLead,
    ) as string | null,
    pendingDueJobs: Number(fixture.value(
      `SELECT COUNT(*) FROM lead_radar_jobs
        WHERE org_id = ? AND idempotency_key LIKE 'budget-due-%'
          AND dispatch_status = 'pending'`,
      orgId,
    )),
  };
}

test('contact pool discovery and refill remain within the Free D1 budget including outer guard headroom', async (context) => {
  const fixture = database();
  fixture.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0050_lead_radar_contact_discovery.sql'),'utf8'));
  fixture.exec("CREATE TABLE d1_migrations (name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');");
  const queue = new RecordingQueue();
  const store = new LeadRadarStore(fixture.asD1());
  await enqueueLeadRadarSearch(store,'org-a',{ ...searchInput(5),searchGoal:'telegram_contacts',maxCandidates:25 },queue,FIXED_NOW,'pool-budget-test');
  const profiler = new CountingD1(fixture.asD1());
  const db = profiler.asD1();
  const outcome = await consumeLeadRadarQueueMessage(db,queue.messages.shift(),queue,{ now: () => FIXED_NOW,
    discover: async () => ({ candidates: Array.from({length:25},(_,i) => ({ ...candidate(i+1),website:null })),sourceWarnings:[] }),
  });
  assert.equal(outcome.outcome,'completed');
  const sample = profiler.snapshot('contact_pool_discovery',25);
  assert.ok(sample.executedStatements + 9 <= 50,JSON.stringify(sample));
  context.diagnostic(JSON.stringify(sample));
});

test('Lead Radar discovery fan-out stays within the Workers Free D1 budget at N=1/5/10/50', async (context) => {
  const measured = await Promise.all(SAMPLE_SIZES.map(measureDiscoveryFanout));
  const discoverySamples = measured.map((sample) => sample.discovery);
  const funnelSamples = measured.map((sample) => sample.funnel);

  for (const sample of discoverySamples) {
    // Five fixed fan-out statements persist every company/evidence/job row;
    // two fixed statements complete the parent and release its outbox. Only
    // the immediate low-latency outbox tick scales, and it is capped at five.
    assertAtMost(sample, 'prepare', 36);
    assertAtMost(sample, 'run', 15);
    assertAtMost(sample, 'all', 5);
    assertAtMost(sample, 'first', 9);
    assertAtMost(sample, 'batch', 2);
    assertAtMost(sample, 'batchStatements', 7);
    assertAtMost(sample, 'rowsReturned', 10 + 4 * sample.n);
    assertAtMost(sample, 'executedStatements', 36);
    assertAtMost(sample, 'executedStatements', FREE_D1_QUERIES_PER_INVOCATION);
    assertAtMost(sample, 'roundTrips', 31);
  }
  for (const [metric, maximumPerItem] of [
    ['prepare', 3],
    ['run', 2],
    ['all', 0],
    ['first', 1],
    ['batch', 0],
    ['batchStatements', 0],
    ['rowsReturned', 4],
    ['executedStatements', 3],
    ['roundTrips', 3],
  ] as const) {
    assertMarginalCostBounded(discoverySamples, metric, maximumPerItem);
  }

  for (const sample of funnelSamples) {
    // Funnel aggregation may read O(N) rows, but its D1 API/statement count is
    // bounded independently of N.
    assertAtMost(sample, 'prepare', 6);
    assertAtMost(sample, 'run', 2);
    assertAtMost(sample, 'all', 3);
    assertAtMost(sample, 'first', 2);
    assertAtMost(sample, 'batch', 0);
    assertAtMost(sample, 'executedStatements', 6);
    assertAtMost(sample, 'roundTrips', 6);
    assertAtMost(sample, 'rowsReturned', 3 + 3 * sample.n);
  }
  assertMarginalCostBounded(funnelSamples, 'prepare', 0);
  assertMarginalCostBounded(funnelSamples, 'executedStatements', 0);
  assertMarginalCostBounded(funnelSamples, 'roundTrips', 0);
  assertMarginalCostBounded(funnelSamples, 'rowsReturned', 3);

  context.diagnostic(`D1 budget samples: ${JSON.stringify([
    ...discoverySamples,
    ...funnelSamples,
  ])}`);
  context.diagnostic(
    `Capacity gate: Workers Free; N=50 consumes ${discoverySamples.at(-1)?.executedStatements}`
      + `/${FREE_D1_QUERIES_PER_INVOCATION} D1 queries per invocation`,
  );
});

test('Lead Radar due dispatcher stays within the Workers Free budget with a five-job tick', async (context) => {
  const samples = await Promise.all(SAMPLE_SIZES.map(measureDueDispatch));
  for (const sample of samples) {
    const dispatched = Math.min(sample.n, 5);
    // Three fixed scans plus three statements per reserved job. At N=50 the
    // job work plateaus at the Free-safe production cap while candidate rows remain
    // linear in the bounded 100-row scheduler scan.
    assertAtMost(sample, 'prepare', 4 + 3 * dispatched);
    assertAtMost(sample, 'run', 2 * dispatched);
    assertAtMost(sample, 'all', 3);
    assertAtMost(sample, 'first', dispatched);
    assertAtMost(sample, 'batch', 0);
    assertAtMost(sample, 'batchStatements', 0);
    assertAtMost(sample, 'rowsReturned', 1 + sample.n + dispatched);
    assertAtMost(sample, 'executedStatements', 4 + 3 * dispatched);
    assertAtMost(sample, 'executedStatements', FREE_D1_QUERIES_PER_INVOCATION);
    assertAtMost(sample, 'roundTrips', 4 + 3 * dispatched);
  }
  assertMarginalCostBounded(samples, 'rowsReturned', 2);
  assertMarginalCostBounded(samples, 'executedStatements', 3);
  assertMarginalCostBounded(samples, 'roundTrips', 3);

  context.diagnostic(`D1 dispatcher samples: ${JSON.stringify(samples)}`);
});

test('Lead Radar adversarial cron recovery and dispatch stays within 50 D1 statements', async (context) => {
  const result = await measureAdversarialCron();
  const { sample } = result;

  assert.equal(result.sent, 5, 'the bounded tick still makes forward progress');
  assert.equal(result.effectJobStatus, 'completed', 'a committed effect is recovered monotonically');
  assert.equal(result.terminalJobStatus, 'dead_letter', 'an exhausted lease reaches a terminal job state');
  assert.equal(result.terminalLeadStatus, 'terminal', 'terminal recovery closes its company state');
  assert.equal(result.pendingDueJobs, 5, 'unselected due jobs remain durable for the next cron tick');
  assertAtMost(sample, 'all', 7);
  assertAtMost(sample, 'first', 9);
  assertAtMost(sample, 'run', 21);
  assertAtMost(sample, 'batchStatements', 0);
  assertAtMost(sample, 'executedStatements', 36);
  assertAtMost(sample, 'executedStatements', FREE_D1_QUERIES_PER_INVOCATION);
  assertAtMost(sample, 'roundTrips', 36);

  context.diagnostic(
    `Adversarial cron gate: ${JSON.stringify(sample)}; `
      + `${sample.executedStatements}/${FREE_D1_QUERIES_PER_INVOCATION} D1 queries`,
  );
});
