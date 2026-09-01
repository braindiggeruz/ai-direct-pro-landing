import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  consumeLeadRadarQueueMessage,
  enqueueDueLeadRadarJobs,
  LeadRadarStore,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
  type StoredLeadInput,
} from '../functions/platform/lead-radar';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import { SqliteD1 } from './helpers/sqlite-d1';
import { resumeSearchPulse } from '../functions/platform/lead-radar/search-pulse';

const SEARCH_INPUT: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'AI-бот для заявок',
  desiredCount: 5,
  telegramRequired: false,
  languages: ['ru', 'uz'],
};

const CONTACT_INPUT: LeadRadarSearchInput = {
  ...SEARCH_INPUT,
  searchGoal: 'telegram_contacts',
  maxCandidates: 25,
};

function database(withContactPool = false): SqliteD1 {
  const fixture = new SqliteD1();
  for (const migration of [
    '0036_lead_radar.sql',
    '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql',
    ...(withContactPool
      ? ['0050_lead_radar_contact_discovery.sql', '0054_lead_radar_candidate_pool_resume.sql']
      : []),
  ]) {
    fixture.exec(readFileSync(resolve(import.meta.dirname, `../migrations/${migration}`), 'utf8'));
  }
  if (withContactPool) {
    fixture.exec("CREATE TABLE d1_migrations (name TEXT); INSERT INTO d1_migrations VALUES ('0050_lead_radar_contact_discovery.sql');");
  }
  return fixture;
}

class RecordingQueue implements LeadRadarQueueSender {
  readonly messages: LeadRadarQueueMessage[] = [];

  async send(message: LeadRadarQueueMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

function storedLead(canonicalKey: string): StoredLeadInput {
  return {
    canonicalKey,
    name: canonicalKey,
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: 'Ташкент',
    website: null,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: 'terminal',
    enrichmentReason: 'no_website',
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

test('an explicitly bounded enrichment continuation preserves attempts after 30 minutes', async () => {
  const fixture = database();
  const store = new LeadRadarStore(fixture.asD1());
  const startedAt = '2026-08-25T13:30:00.000Z';
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, startedAt);
  const leadId = await store.insertLead('org-a', searchId, storedLead('preserved-contact-budget'));
  assert.ok(leadId);
  const job = await store.createJob(
    'org-a', searchId, leadId, 'enrichment',
    `contact-resolve:${searchId}:${leadId}`, startedAt,
  );
  const now = '2026-08-25T14:01:00.000Z';
  const claimed = await store.claimJob('org-a', job.id, now, '2026-08-25T14:03:00.000Z');
  assert.ok(claimed?.leaseOwner);
  assert.equal(await store.retryJob(
    'org-a', job.id, claimed?.leaseOwner ?? '', 'contact_sources_free_catalog_page_4',
    '2026-08-25T14:02:00.000Z', now, claimed?.leaseGeneration, true,
  ), true);
  assert.equal((await store.getJob(job.id))?.attemptCount, 0,
    'the caller owns the continuation deadline, so wall-clock age must not consume attempts');
});

test('a young legacy max-attempt contact job is rearmed instead of ACK-looping', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const startedAt = '2026-08-25T14:00:00.000Z';
  const at = new Date('2026-08-25T14:10:00.000Z');
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, startedAt);
  const leadId = await store.insertLead('org-a', searchId, storedLead('legacy-max-contact'));
  assert.ok(leadId);
  const discovery = await store.createJob(
    'org-a', searchId, null, 'discovery', `discovery:${searchId}`, startedAt,
  );
  fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
    status='completed', completed_at=?, updated_at=? WHERE id=?`)
    .run(startedAt, startedAt, discovery.id);
  const contact = await store.createJob(
    'org-a', searchId, leadId, 'enrichment',
    `contact-resolve:${searchId}:${leadId}`, startedAt,
  );
  fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
    status='retry_wait', attempt_count=max_attempts,
    last_error_code='contact_sources_free_catalog_page_4',
    available_at=?, next_dispatch_at=?, dispatch_status='sent', dispatched_at=?, updated_at=?
    WHERE id=?`).run(at.toISOString(), at.toISOString(), at.toISOString(), at.toISOString(), contact.id);
  let lookups = 0;
  const outcome = await consumeLeadRadarQueueMessage(
    db,
    { schema: 'gptbot.lead-radar.job.v1', job_id: contact.id },
    queue,
    { now: () => at, resolveLeadContacts: async () => { lookups += 1; return { pending: false }; } },
  );
  assert.equal(outcome.outcome, 'completed');
  assert.equal(lookups, 1);
  assert.equal((await store.getJob(contact.id))?.status, 'completed');
});

test('stale max-attempt contact searches converge to partial and release admission', async () => {
  const fixture = database(true);
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const startedAt = new Date('2026-08-28T10:00:00.000Z');
  const at = new Date('2026-08-28T11:01:00.000Z');
  const searchIds: string[] = [];

  for (let index = 0; index < 2; index += 1) {
    const searchId = await store.createSearch('org-a', CONTACT_INPUT, startedAt.toISOString());
    searchIds.push(searchId);
    const leadId = await store.insertLead('org-a', searchId, storedLead(`stale-contact-${index}`));
    assert.ok(leadId);
    const discovery = await store.createJob(
      'org-a', searchId, null, 'discovery', `contact-pool:${searchId}:0`, startedAt.toISOString(),
    );
    fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
      status='completed', completed_at=?, updated_at=? WHERE id=?`)
      .run(startedAt.toISOString(), startedAt.toISOString(), discovery.id);
    const contact = await store.createJob(
      'org-a', searchId, leadId, 'enrichment',
      `contact-resolve:${searchId}:${leadId}`, startedAt.toISOString(),
    );
    fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
      status='retry_wait', attempt_count=max_attempts,
      last_error_code='contact_sources_domain_budget_exhausted',
      available_at=?, next_dispatch_at=?, dispatch_status='sent', dispatched_at=?, updated_at=?
      WHERE id=?`).run(
      startedAt.toISOString(), startedAt.toISOString(), startedAt.toISOString(),
      startedAt.toISOString(), contact.id,
    );
    fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
      (org_id,search_id,candidates_json,candidate_count,cursor,target,resolved_count,
       stop_reason,created_at,expires_at,updated_at)
      VALUES ('org-a',?,NULL,1,1,5,0,'time_limit',?,?,?)`).run(
      searchId, startedAt.toISOString(), at.toISOString(), startedAt.toISOString(),
    );
    fixture.sqlite.prepare(`UPDATE lead_radar_searches SET
      phase='enriching', raw_discovered_count=1, candidate_count=1,
      processed_count=1, pending_count=0 WHERE id=?`).run(searchId);
  }

  assert.equal((await store.createSearchIfAdmitted('org-a', CONTACT_INPUT, at)).id, null,
    'the two legacy running searches occupy both admission slots');
  assert.equal(await enqueueDueLeadRadarJobs(db, queue, at), 0);

  for (const searchId of searchIds) {
    const summary = await store.getSearch('org-a', searchId);
    assert.equal(summary?.search.status, 'partial');
    assert.equal(summary?.search.phase, 'completed');
    assert.equal(summary?.leads.length, 1, 'saved companies survive the search deadline');
    assert.equal(fixture.value(
      "SELECT status FROM lead_radar_jobs WHERE search_id=? AND idempotency_key LIKE 'contact-resolve:%'",
      searchId,
    ), 'dead_letter');
    assert.equal(fixture.value(
      'SELECT stop_reason FROM lead_radar_candidate_pools WHERE search_id=?', searchId,
    ), 'cancelled');
  }

  const admitted = await store.createSearchIfAdmitted('org-a', CONTACT_INPUT, at);
  assert.equal(admitted.disposition, 'created');
  assert.ok(admitted.id, 'deadline convergence frees an admission slot for a new search');
});

test('an ordinary search releases admission when only its stale contact tail remains', async () => {
  const fixture = database();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const queue = new RecordingQueue();
  const startedAt = new Date('2026-08-28T10:00:00.000Z');
  const at = new Date('2026-08-28T11:01:00.000Z');
  const staleSearchId = await store.createSearch('org-a', SEARCH_INPUT, startedAt.toISOString());
  const leadId = await store.insertLead('org-a', staleSearchId, storedLead('ordinary-stale-tail'));
  assert.ok(leadId);
  const discovery = await store.createJob(
    'org-a', staleSearchId, null, 'discovery', `discovery:${staleSearchId}`, startedAt.toISOString(),
  );
  fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
    status='completed', completed_at=?, updated_at=? WHERE id=?`)
    .run(startedAt.toISOString(), startedAt.toISOString(), discovery.id);
  const contact = await store.createJob(
    'org-a', staleSearchId, leadId, 'enrichment',
    `contact-resolve:${staleSearchId}:${leadId}`, startedAt.toISOString(),
  );
  const parkedUntil = new Date(at.getTime() + 24 * 60 * 60_000).toISOString();
  fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
    status='retry_wait', attempt_count=1, last_error_code='waiting_for_account',
    available_at=?, next_dispatch_at=?, updated_at=? WHERE id=?`).run(
    parkedUntil, parkedUntil, startedAt.toISOString(), contact.id,
  );
  const otherSearchId = await store.createSearch('org-a', SEARCH_INPUT, at.toISOString());
  const otherJob = await store.createJob(
    'org-a', otherSearchId, null, 'discovery', `discovery:${otherSearchId}`, at.toISOString(),
  );

  assert.equal((await store.createSearchIfAdmitted('org-a', SEARCH_INPUT, at)).id, null);
  assert.equal(await enqueueDueLeadRadarJobs(db, queue, at), 0);

  const summary = await store.getSearch('org-a', staleSearchId);
  assert.equal(summary?.search.status, 'partial');
  assert.equal(summary?.search.phase, 'completed');
  assert.equal(summary?.leads.length, 1, 'the ordinary search keeps its saved company');
  assert.equal((await store.getJob(contact.id))?.status, 'dead_letter');
  assert.equal((await store.getJob(contact.id))?.lastErrorCode, 'waiting_for_account');
  assert.equal((await store.getJob(otherJob.id))?.dispatchStatus, 'pending',
    'deadline recovery does not dispatch or cancel the other running search');
  const admitted = await store.createSearchIfAdmitted('org-a', SEARCH_INPUT, at);
  assert.equal(admitted.disposition, 'created');
  assert.ok(admitted.id);
});

test('manual pulse dispatches only the selected search', async () => {
  const fixture = database(true);
  const store = new LeadRadarStore(fixture.asD1());
  const queue = new RecordingQueue();
  const at = new Date('2026-08-28T12:00:00.000Z');
  const otherSearchId = await store.createSearch('org-a', SEARCH_INPUT, at.toISOString());
  const selectedSearchId = await store.createSearch('org-a', SEARCH_INPUT, at.toISOString());
  const otherJob = await store.createJob(
    'org-a', otherSearchId, null, 'discovery', `discovery:${otherSearchId}`, at.toISOString(),
  );
  const selectedJob = await store.createJob(
    'org-a', selectedSearchId, null, 'discovery', `discovery:${selectedSearchId}`, at.toISOString(),
  );

  const result = await resumeSearchPulse({
    db: fixture.asD1(),
    orgId: 'org-a',
    searchId: selectedSearchId,
    now: at,
    queue,
    allowOrganization: (orgId) => orgId === 'org-a',
  });

  assert.equal(result.kicked, 1);
  assert.deepEqual(queue.messages, [{ schema: 'gptbot.lead-radar.job.v1', job_id: selectedJob.id }]);
  assert.equal((await store.getJob(selectedJob.id))?.dispatchStatus, 'sent');
  assert.equal((await store.getJob(otherJob.id))?.dispatchStatus, 'pending',
    'another running search must not be counted or dispatched by this button');
});

test('manual pulse reports the committed terminal state instead of an actionable stale remainder', async () => {
  const fixture = database(true);
  const store = new LeadRadarStore(fixture.asD1());
  const queue = new RecordingQueue();
  const startedAt = new Date('2026-08-28T10:00:00.000Z');
  const at = new Date('2026-08-28T11:01:00.000Z');
  const searchId = await store.createSearch('org-a', CONTACT_INPUT, startedAt.toISOString());
  const leadId = await store.insertLead('org-a', searchId, storedLead('terminal-pulse-contact'));
  assert.ok(leadId);
  const discovery = await store.createJob(
    'org-a', searchId, null, 'discovery', `contact-pool:${searchId}:0`, startedAt.toISOString(),
  );
  fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
    status='completed', completed_at=?, updated_at=? WHERE id=?`)
    .run(startedAt.toISOString(), startedAt.toISOString(), discovery.id);
  const contact = await store.createJob(
    'org-a', searchId, leadId, 'enrichment',
    `contact-resolve:${searchId}:${leadId}`, startedAt.toISOString(),
  );
  fixture.sqlite.prepare(`UPDATE lead_radar_jobs SET
    status='retry_wait', attempt_count=max_attempts,
    last_error_code='contact_sources_domain_budget_exhausted',
    available_at=?, next_dispatch_at=?, dispatch_status='sent', dispatched_at=?, updated_at=?
    WHERE id=?`).run(
    startedAt.toISOString(), startedAt.toISOString(), startedAt.toISOString(),
    startedAt.toISOString(), contact.id,
  );
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,target,resolved_count,
     stop_reason,created_at,expires_at,updated_at,resume_count)
    VALUES ('org-a',?,NULL,127,60,5,0,'time_limit',?,?,?,2)`).run(
    searchId, startedAt.toISOString(), at.toISOString(), startedAt.toISOString(),
  );

  const result = await resumeSearchPulse({
    db: fixture.asD1(),
    orgId: 'org-a',
    searchId,
    now: at,
    queue,
    allowOrganization: (orgId) => orgId === 'org-a',
  });

  assert.equal(result.kicked, 0);
  assert.equal(result.remaining, 0, 'cancelled pool candidates are not actionable work');
  assert.match(result.note, /завершён с частичным результатом/i);
  assert.doesNotMatch(result.note, /нажимайте ещё/i);
  assert.equal((await store.getSearch('org-a', searchId))?.search.status, 'partial');
  assert.equal(fixture.value(
    'SELECT stop_reason FROM lead_radar_candidate_pools WHERE search_id=?', searchId,
  ), 'cancelled');
});

test('overview summaries expose the persisted resolved Telegram count', async () => {
  const fixture = database(true);
  const store = new LeadRadarStore(fixture.asD1());
  const now = '2026-08-28T12:00:00.000Z';
  const searchId = await store.createSearch('org-a', CONTACT_INPUT, now);
  fixture.sqlite.prepare(`INSERT INTO lead_radar_candidate_pools
    (org_id,search_id,candidates_json,candidate_count,cursor,target,resolved_count,
     stop_reason,created_at,expires_at,updated_at)
    VALUES ('org-a',?,NULL,5,5,5,3,'target_reached',?,?,?)`).run(
    searchId, now, '2026-08-28T13:00:00.000Z', now,
  );

  const overview = await store.listOverview('org-a');
  assert.equal(overview.searches[0]?.id, searchId);
  assert.equal(overview.searches[0]?.funnel.resolvedTelegramCount, 3);
});
