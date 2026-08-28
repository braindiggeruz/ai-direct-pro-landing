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
  failures = 0;

  constructor(private readonly recordBeforeFailure = false) {}

  async send(message: LeadRadarQueueMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      if (this.recordBeforeFailure) this.messages.push(structuredClone(message));
      throw new Error('fixture_queue_send_failed');
    }
    this.messages.push(structuredClone(message));
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
