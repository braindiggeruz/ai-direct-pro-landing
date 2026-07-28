import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AutomationStepError,
  AutomationValidationError,
  cancelAutomationJob,
  consumeAutomationMessage,
  createAndEnqueueAutomationJob,
  ensureAutomationSchema,
  finishAutomationJob,
  getAutomationJobById,
  getAutomationJobForTenant,
  insertOrReuseAutomationJob,
  leaseAutomationJob,
  messageForJob,
  parseAutomationQueueMessage,
  replayAutomationDeadLetter,
  type AutomationClock,
  type AutomationJob,
  type AutomationQueueMessage,
  type AutomationQueueSender,
} from '../functions/platform/automation';
import {
  createSeoDraftAutomationHandler,
  SEO_AUTOMATION_TENANT,
} from '../functions/lib/seo-autopilot/automation';
import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';

class MutableClock implements AutomationClock {
  constructor(private current: Date) {}
  now(): Date { return new Date(this.current); }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class RecordingQueue implements AutomationQueueSender {
  readonly messages: AutomationQueueMessage[] = [];
  async send(message: AutomationQueueMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

function fixture(clock: MutableClock, suffix = 'one') {
  return {
    tenantKey: 'tenant:alpha',
    jobType: 'seo_draft_generation' as const,
    idempotencyKey: `fixture:${suffix}`,
    requestRef: 'seo_schedule:default',
    maxAttempts: 3,
    availableAt: clock.now().toISOString(),
  };
}

describe('first-party automation queue and ledger', () => {
  test('duplicate enqueue reuses one job and sends one queue message', async () => {
    const db = new SqliteD1();
    const queue = new RecordingQueue();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const first = await createAndEnqueueAutomationJob(
      db.asD1(),
      queue,
      fixture(clock),
      clock,
    );
    const second = await createAndEnqueueAutomationJob(
      db.asD1(),
      queue,
      fixture(clock),
      clock,
    );
    assert.equal(first.outcome, 'created');
    assert.equal(second.outcome, 'duplicate');
    assert.equal(first.job.jobId, second.job.jobId);
    assert.equal(queue.messages.length, 1);
    assert.equal(
      db.value('SELECT COUNT(*) FROM automation_jobs'),
      1,
    );
  });

  test('duplicate delivery applies the domain mutation once', async () => {
    const db = new SqliteD1();
    const queue = new RecordingQueue();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const created = await createAndEnqueueAutomationJob(
      db.asD1(), queue, fixture(clock, 'duplicate-delivery'), clock,
    );
    let mutations = 0;
    const handlers = {
      seo_draft_generation: async () => {
        mutations += 1;
        return {
          status: 'awaiting_review' as const,
          resultRef: 'ai_draft:draft_once',
        };
      },
    };
    const message = queue.messages[0];
    assert.ok(message);
    const first = await consumeAutomationMessage(
      db.asD1(), message, handlers, { clock, leaseOwner: 'consumer:first' },
    );
    const replay = await consumeAutomationMessage(
      db.asD1(), message, handlers, { clock, leaseOwner: 'consumer:replay' },
    );
    assert.equal(first.outcome, 'awaiting_review');
    assert.equal(replay.outcome, 'duplicate_or_unavailable');
    assert.equal(mutations, 1);
    assert.equal((await getAutomationJobById(db.asD1(), created.job.jobId))?.resultRef, 'ai_draft:draft_once');
  });

  test('retry is bounded and a later delivery may complete', async () => {
    const db = new SqliteD1();
    const queue = new RecordingQueue();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const created = await createAndEnqueueAutomationJob(
      db.asD1(),
      queue,
      { ...fixture(clock, 'retry'), maxAttempts: 2 },
      clock,
    );
    let calls = 0;
    let externalMutations = 0;
    const result1 = await consumeAutomationMessage(
      db.asD1(),
      queue.messages[0],
      {
        seo_draft_generation: async () => {
          calls += 1;
          throw new AutomationStepError('provider_rate_limited', true);
        },
      },
      { clock, leaseOwner: 'consumer:retry-one', retryDelayMs: 60_000 },
    );
    assert.equal(result1.outcome, 'retry_wait');
    clock.advance(60_001);
    const result2 = await consumeAutomationMessage(
      db.asD1(),
      messageForJob(created.job),
      {
        seo_draft_generation: async () => {
          calls += 1;
          externalMutations += 1;
          return { status: 'completed', resultRef: 'result:done' };
        },
      },
      { clock, leaseOwner: 'consumer:retry-two' },
    );
    assert.equal(result2.outcome, 'completed');
    assert.equal(calls, 2);
    assert.equal(externalMutations, 1);
    assert.equal(result2.job.attemptCount, 2);
  });

  test('first terminal result wins and cannot be overwritten', async () => {
    const db = new SqliteD1();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const inserted = await insertOrReuseAutomationJob(
      db.asD1(), fixture(clock, 'terminal'), clock.now().toISOString(),
    );
    const lease = await leaseAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      expectedType: inserted.job.jobType,
      leaseOwner: 'consumer:terminal',
      now: clock.now().toISOString(),
      leaseExpiresAt: '2026-07-28T00:10:00.000Z',
    });
    assert.ok(lease);
    db.exec(
      `UPDATE automation_jobs SET status='running'
       WHERE job_id='${inserted.job.jobId}'`,
    );
    assert.equal(await finishAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      leaseOwner: 'consumer:terminal',
      status: 'completed',
      resultRef: 'result:first',
      now: clock.now().toISOString(),
    }), 'applied');
    assert.equal(await finishAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      leaseOwner: 'consumer:other',
      status: 'completed',
      resultRef: 'result:second',
      now: clock.now().toISOString(),
    }), 'terminal_won');
    assert.equal(
      (await getAutomationJobById(db.asD1(), inserted.job.jobId))?.resultRef,
      'result:first',
    );
  });

  test('one active lease exists and takeover is allowed only after expiry', async () => {
    const db = new SqliteD1();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const inserted = await insertOrReuseAutomationJob(
      db.asD1(), fixture(clock, 'lease'), clock.now().toISOString(),
    );
    const first = await leaseAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      expectedType: inserted.job.jobType,
      leaseOwner: 'consumer:lease-one',
      now: '2026-07-28T00:00:00.000Z',
      leaseExpiresAt: '2026-07-28T00:10:00.000Z',
    });
    const early = await leaseAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      expectedType: inserted.job.jobType,
      leaseOwner: 'consumer:lease-two',
      now: '2026-07-28T00:09:59.000Z',
      leaseExpiresAt: '2026-07-28T00:19:59.000Z',
    });
    const takeover = await leaseAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      expectedType: inserted.job.jobType,
      leaseOwner: 'consumer:lease-two',
      now: '2026-07-28T00:10:00.000Z',
      leaseExpiresAt: '2026-07-28T00:20:00.000Z',
    });
    assert.ok(first);
    assert.equal(early, null);
    assert.equal(takeover?.leaseOwner, 'consumer:lease-two');
  });

  test('cancellation wins over a late consumer result', async () => {
    const db = new SqliteD1();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const inserted = await insertOrReuseAutomationJob(
      db.asD1(), fixture(clock, 'cancel'), clock.now().toISOString(),
    );
    const lease = await leaseAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      expectedType: inserted.job.jobType,
      leaseOwner: 'consumer:cancel',
      now: clock.now().toISOString(),
      leaseExpiresAt: '2026-07-28T00:10:00.000Z',
    });
    assert.ok(lease);
    db.exec(
      `UPDATE automation_jobs SET status='running'
       WHERE job_id='${inserted.job.jobId}'`,
    );
    const cancelled = await cancelAutomationJob(db.asD1(), {
      tenantKey: 'tenant:alpha',
      jobId: inserted.job.jobId,
      now: clock.now().toISOString(),
    });
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(await finishAutomationJob(db.asD1(), {
      jobId: inserted.job.jobId,
      leaseOwner: 'consumer:cancel',
      status: 'completed',
      resultRef: 'result:late',
      now: clock.now().toISOString(),
    }), 'terminal_won');
    assert.equal(
      (await getAutomationJobById(db.asD1(), inserted.job.jobId))?.resultRef,
      null,
    );
  });

  test('concurrent consumers execute one handler', async () => {
    const db = new SqliteD1();
    const queue = new RecordingQueue();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    await createAndEnqueueAutomationJob(
      db.asD1(), queue, fixture(clock, 'concurrent'), clock,
    );
    let calls = 0;
    const handler = async () => {
      calls += 1;
      await Promise.resolve();
      return { status: 'completed' as const, resultRef: 'result:single' };
    };
    const results = await Promise.all([
      consumeAutomationMessage(
        db.asD1(), queue.messages[0],
        { seo_draft_generation: handler },
        { clock, leaseOwner: 'consumer:concurrent-one' },
      ),
      consumeAutomationMessage(
        db.asD1(), queue.messages[0],
        { seo_draft_generation: handler },
        { clock, leaseOwner: 'consumer:concurrent-two' },
      ),
    ]);
    assert.equal(calls, 1);
    assert.equal(results.filter((result) => result.outcome === 'completed').length, 1);
  });

  test('dead letter is fail-closed and replay requires owner/admin', async () => {
    const db = new SqliteD1();
    const queue = new RecordingQueue();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const created = await createAndEnqueueAutomationJob(
      db.asD1(), queue, { ...fixture(clock, 'dlq'), maxAttempts: 1 }, clock,
    );
    const failed = await consumeAutomationMessage(
      db.asD1(),
      queue.messages[0],
      {
        seo_draft_generation: async () => {
          throw new AutomationStepError('invalid_source_set', false);
        },
      },
      { clock, leaseOwner: 'consumer:dlq' },
    );
    assert.equal(failed.outcome, 'dead_letter');
    assert.equal(await replayAutomationDeadLetter(
      db.asD1(),
      queue,
      {
        tenantKey: 'tenant:alpha',
        jobId: created.job.jobId,
        actorRole: 'member',
      },
      clock,
    ), null);
    const replayed = await replayAutomationDeadLetter(
      db.asD1(),
      queue,
      {
        tenantKey: 'tenant:alpha',
        jobId: created.job.jobId,
        actorRole: 'owner',
      },
      clock,
    );
    assert.equal(replayed?.status, 'queued');
    assert.equal(queue.messages.length, 2);
  });

  test('cross-tenant lookup is neutral not-found', async () => {
    const db = new SqliteD1();
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    const inserted = await insertOrReuseAutomationJob(
      db.asD1(), fixture(clock, 'tenant'), clock.now().toISOString(),
    );
    assert.equal(
      await getAutomationJobForTenant(
        db.asD1(), 'tenant:other', inserted.job.jobId,
      ),
      null,
    );
  });

  test('queue schema is closed-list and payload bounded', () => {
    assert.throws(
      () => parseAutomationQueueMessage({
        schema: 'gptbot.automation.job.v1',
        job_id: 'job:one',
        job_type: 'arbitrary_callback',
        delivery_id: 'delivery:one',
      }),
      AutomationValidationError,
    );
    assert.throws(
      () => parseAutomationQueueMessage({
        schema: 'gptbot.automation.job.v1',
        job_id: 'job:one',
        job_type: 'seo_draft_generation',
        delivery_id: 'delivery:one',
        callback_url: 'https://attacker.invalid',
      }),
      AutomationValidationError,
    );
    assert.throws(
      () => parseAutomationQueueMessage({
        schema: 'gptbot.automation.job.v1',
        job_id: `job:${'x'.repeat(3_000)}`,
        job_type: 'seo_draft_generation',
        delivery_id: 'delivery:one',
      }),
      AutomationValidationError,
    );
  });

  test('analytics events contain codes and references, never raw content', async () => {
    const db = new SqliteD1();
    await ensureAutomationSchema(db.asD1());
    const clock = new MutableClock(new Date('2026-07-28T00:00:00.000Z'));
    await insertOrReuseAutomationJob(
      db.asD1(), fixture(clock, 'events'), clock.now().toISOString(),
    );
    const columns = db.rows<{ name: string }>(
      'PRAGMA table_info(automation_job_events)',
    ).map((row) => row.name);
    assert.deepEqual(columns, [
      'event_id',
      'job_id',
      'tenant_key',
      'event_type',
      'error_code',
      'attempt_count',
      'created_at',
    ]);
    assert.ok(!columns.some((column) =>
      /payload|prompt|content|phone|username|address|secret/i.test(column)));
  });
});

describe('SEO draft automation adapter', () => {
  test('requires a complete RU/UZ draft and preserves manual review', async () => {
    const db = new SqliteD1();
    const env = { GPTBOT_DRAFTS_DB: db.asD1() } as Env;
    const calls: Array<Record<string, unknown>> = [];
    const handler = createSeoDraftAutomationHandler(
      env,
      (async (_env, topic, options) => {
        calls.push({ topic, options });
        return {
          ok: true,
          draft_id: 'draft_pair',
          bundle_id: 'bundle_pair',
          admin_url: '/admin-tools/ai-drafts/draft_pair',
          locales: ['ru', 'uz'],
        };
      }) as never,
    );
    const job = {
      jobId: 'ajob:seo',
      jobType: 'seo_draft_generation',
      tenantKey: SEO_AUTOMATION_TENANT,
      idempotencyKey: 'seo:stable-idempotency',
      requestRef: 'seo_schedule:default',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      availableAt: '2026-07-28T00:00:00.000Z',
      leaseOwner: 'consumer:seo',
      leaseExpiresAt: '2026-07-28T00:10:00.000Z',
      enqueuedAt: null,
      cancelRequested: false,
      resultRef: null,
      lastErrorCode: null,
      version: 1,
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      completedAt: null,
    } satisfies AutomationJob;
    const result = await handler(job);
    assert.deepEqual(result, {
      status: 'awaiting_review',
      resultRef: 'ai_draft:draft_pair',
    });
    const options = calls[0]?.options as Record<string, unknown>;
    assert.equal(options.runId, job.idempotencyKey);
    assert.equal(options.requireLocalePair, true);
    assert.equal(
      JSON.stringify(calls).toLowerCase().includes('github'),
      false,
    );
  });

  test('incomplete locale pair cannot become a reviewable result', async () => {
    const db = new SqliteD1();
    const env = { GPTBOT_DRAFTS_DB: db.asD1() } as Env;
    const handler = createSeoDraftAutomationHandler(
      env,
      (async () => ({
        ok: true,
        draft_id: 'draft_partial',
        bundle_id: 'bundle_partial',
        admin_url: '/admin-tools/ai-drafts/draft_partial',
        locales: ['ru'],
      })) as never,
    );
    const job = {
      jobId: 'ajob:partial',
      jobType: 'seo_draft_generation',
      tenantKey: SEO_AUTOMATION_TENANT,
      idempotencyKey: 'seo:partial',
      requestRef: 'seo_schedule:default',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      availableAt: '2026-07-28T00:00:00.000Z',
      leaseOwner: 'consumer:seo',
      leaseExpiresAt: '2026-07-28T00:10:00.000Z',
      enqueuedAt: null,
      cancelRequested: false,
      resultRef: null,
      lastErrorCode: null,
      version: 1,
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      completedAt: null,
    } satisfies AutomationJob;
    await assert.rejects(
      () => handler(job),
      (error: unknown) =>
        error instanceof AutomationStepError
        && error.code === 'locale_pair_incomplete'
        && !error.retryable,
    );
  });
});
