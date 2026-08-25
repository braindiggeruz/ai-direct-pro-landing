import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../workers/automation-worker';

interface RecordedMessage {
  body: unknown;
  acknowledgements: number;
  retries: number[];
}

function queueMessage(body: unknown): Message<unknown> & RecordedMessage {
  const state: RecordedMessage = { body, acknowledgements: 0, retries: [] };
  return {
    ...state,
    id: crypto.randomUUID(),
    timestamp: new Date('2026-08-25T10:00:00.000Z'),
    attempts: 1,
    ack() { state.acknowledgements += 1; },
    retry(options?: { delaySeconds?: number }) { state.retries.push(options?.delaySeconds ?? 0); },
    get acknowledgements() { return state.acknowledgements; },
    get retries() { return state.retries; },
  } as Message<unknown> & RecordedMessage;
}

class FakeStatement {
  constructor(
    readonly sql: string,
    private readonly database: FakeD1,
  ) {}

  bind(): FakeStatement { return this; }

  async first<T>(): Promise<T | null> {
    if (this.database.telegramSchema && this.sql.includes('lead_radar_tg_connect_nonces')) {
      return { count: 6 } as T;
    }
    if (this.sql.includes('SELECT value_json FROM system_settings')) {
      return JSON.parse(JSON.stringify({
        value_json: JSON.stringify({
          mode: 'disabled', active_days: [], updated_at: null, updated_by: null,
        }),
      })) as T;
    }
    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    if (this.database.personalSchema && this.sql.includes("pragma_table_info('lead_radar_companies')")) {
      return {
        success: true,
        results: ['decision_makers_json', 'id', 'org_id', 'search_id', 'telegram_contact_json', 'telegram_url', 'updated_at']
          .map((name) => ({ name })) as T[],
        meta: { changes: 0 },
      } as unknown as D1Result<T>;
    }
    if (this.database.personalSchema && this.sql.includes("pragma_table_info('lead_radar_evidence')")) {
      return {
        success: true,
        results: ['company_id', 'field_path', 'id', 'org_id'].map((name) => ({ name })) as T[],
        meta: { changes: 0 },
      } as unknown as D1Result<T>;
    }
    if (this.database.failLeadSchemaAudit && (
      this.sql.includes('sqlite_master') || this.sql.includes('pragma_') || this.sql.includes('PRAGMA ')
    )) throw new Error('lead schema audit unavailable');
    return { success: true, results: [], meta: { changes: 0 } } as unknown as D1Result<T>;
  }

  async run<T>(): Promise<D1Result<T>> {
    return { success: true, results: [], meta: { changes: 0 } } as unknown as D1Result<T>;
  }
}

class FakeD1 {
  readonly sql: string[] = [];

  constructor(
    readonly personalSchema = false,
    readonly failLeadSchemaAudit = false,
    readonly telegramSchema = false,
  ) {}

  prepare(sql: string): FakeStatement {
    this.sql.push(sql);
    return new FakeStatement(sql, this);
  }

  async batch(): Promise<D1Result<unknown>[]> { return []; }

  asD1(): D1Database { return this as unknown as D1Database; }
}

function fakeQueue(): Queue<unknown> & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    async send(body: unknown) { sent.push(body); },
    async sendBatch(batch: Iterable<MessageSendRequest<unknown>>) {
      for (const item of batch) sent.push(item.body);
    },
  } as unknown as Queue<unknown> & { sent: unknown[] };
}

function environment(db: FakeD1, overrides: Record<string, unknown> = {}): Parameters<typeof worker.queue>[1] {
  return {
    GPTBOT_DRAFTS_DB: db.asD1(),
    AUTOMATION_QUEUE: fakeQueue(),
    AUTOMATION_DLQ: fakeQueue(),
    LEAD_RADAR_ADMISSION_ENABLED: 'false',
    LEAD_RADAR_PROCESSING_ENABLED: 'false',
    LEAD_RADAR_CONTACT_ENABLED: 'false',
    LEAD_RADAR_ALLOWED_ORGS: '',
    LEAD_RADAR_PERSONAL_RETENTION_DAYS: '30',
    LEAD_RADAR_MAX_DISPATCH_PER_TICK: '5',
    FIRST_PARTY_AUTOMATION_ENABLED: 'false',
    ...overrides,
  } as unknown as Parameters<typeof worker.queue>[1];
}

function batch(messages: Message<unknown>[]): MessageBatch<unknown> {
  return {
    queue: 'automation-queue',
    messages,
    ackAll() { for (const message of messages) message.ack(); },
    retryAll(options?: { delaySeconds?: number }) {
      for (const message of messages) message.retry(options);
    },
  } as MessageBatch<unknown>;
}

test('processing pause ACKs Lead Radar without touching D1 and preserves SEO retry behavior', async () => {
  const db = new FakeD1(false, true);
  const lead = queueMessage({ schema: 'gptbot.lead-radar.job.v1', job_id: `lrjob_${'1'.repeat(32)}` });
  const seo = queueMessage({ schema: 'gptbot.automation.job.v1', job_id: 'job-seo', job_type: 'seo_draft_generation' });

  await worker.queue(batch([lead, seo]), environment(db), {} as ExecutionContext);

  assert.equal(lead.acknowledgements, 1);
  assert.deepEqual(lead.retries, []);
  assert.deepEqual(db.sql, []);
  assert.equal(seo.acknowledgements, 0);
  assert.deepEqual(seo.retries, [300]);
});

test('a Lead Radar schema fault is isolated and cannot abort the next SEO message', async () => {
  const db = new FakeD1(false, true);
  const lead = queueMessage({ schema: 'gptbot.lead-radar.job.v1', job_id: `lrjob_${'2'.repeat(32)}` });
  const seo = queueMessage({ schema: 'gptbot.automation.job.v1', job_id: 'job-seo', job_type: 'seo_draft_generation' });

  await worker.queue(batch([lead, seo]), environment(db, {
    LEAD_RADAR_PROCESSING_ENABLED: 'true',
  }), {} as ExecutionContext);

  assert.equal(lead.acknowledgements, 1);
  assert.equal(seo.acknowledgements, 0);
  assert.deepEqual(seo.retries, [300]);
  assert.ok(db.sql.length > 0);
});

test('personal-data retention runs even while Lead Radar processing is paused', async () => {
  const db = new FakeD1(true, false);
  await worker.scheduled(
    {} as ScheduledController,
    environment(db),
    {} as ExecutionContext,
  );

  assert.ok(db.sql.some((sql) => sql.includes("pragma_table_info('lead_radar_companies')")));
  assert.ok(db.sql.some((sql) => sql.includes('FROM lead_radar_companies')));
  assert.equal(db.sql.some((sql) => sql.includes('FROM lead_radar_jobs')), false);
});

test('Telegram transport reconciliation and retention run while every Lead Radar flag is paused', async () => {
  const db = new FakeD1(false, false, true);
  await worker.scheduled(
    {} as ScheduledController,
    environment(db),
    {} as ExecutionContext,
  );

  assert.ok(db.sql.some((sql) => sql.includes('lead_radar_tg_connect_nonces')));
  assert.ok(db.sql.some((sql) => sql.includes("status = 'ambiguous'")));
  assert.ok(db.sql.some((sql) => sql.includes('DELETE FROM lead_radar_tg_company_chats')));
  assert.equal(db.sql.some((sql) => sql.includes('FROM lead_radar_jobs')), false);
});

test('scheduled Lead Radar failure does not stop the existing automation scheduler', async () => {
  const db = new FakeD1(false, true);
  await worker.scheduled(
    {} as ScheduledController,
    environment(db, {
      LEAD_RADAR_PROCESSING_ENABLED: 'true',
      FIRST_PARTY_AUTOMATION_ENABLED: 'true',
    }),
    {} as ExecutionContext,
  );

  assert.ok(db.sql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS automation_jobs')));
  assert.ok(db.sql.some((sql) => sql.includes('SELECT * FROM automation_jobs')));
});
