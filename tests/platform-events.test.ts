import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PlatformEvent } from '../functions/platform/contracts';
import {
  appendEvent,
  CorruptPlatformEventError,
  EventBus,
  EventDispatchError,
  EventPayloadValidationError,
  getEventById,
  listUnprocessed,
  markProcessed,
  PlatformEventsService,
  validatePiiSafePayload,
} from '../functions/platform/events';
import { ensurePlatformEventsSchema } from '../functions/platform/events/schema';
import { logJavobMessageReceived } from '../functions/lib/telegram/platform-events';

interface EventRow {
  id: string;
  idempotency_key: string;
  org_id: string | null;
  agent_id: string | null;
  type: string;
  aggregate_ref: string;
  payload_json: string;
  occurred_at: string;
  created_at: string;
  processed_at: string | null;
}

function makeD1(options: { failPlatformInsert?: boolean } = {}) {
  const tables = {
    platformEvents: [] as EventRow[],
    legacyEvents: [] as Array<{
      id: string;
      event: string;
      pseudo_user: string | null;
      meta_json: string;
      created_at: string;
    }>,
  };

  function run(sql: string, args: unknown[]) {
    if (/^CREATE (?:TABLE|INDEX)/.test(sql.trim())) return { meta: { changes: 0 } };
    if (/INSERT OR IGNORE INTO events/.test(sql)) {
      if (options.failPlatformInsert) throw new Error('simulated platform D1 failure');
      const [id, idempotencyKey, orgId, agentId, type, aggregate, payloadJson, occurredAt, createdAt] = args;
      if (tables.platformEvents.some((row) => row.id === id || row.idempotency_key === idempotencyKey)) {
        return { meta: { changes: 0 } };
      }
      tables.platformEvents.push({
        id: String(id),
        idempotency_key: String(idempotencyKey),
        org_id: orgId === null ? null : String(orgId),
        agent_id: agentId === null ? null : String(agentId),
        type: String(type),
        aggregate_ref: String(aggregate),
        payload_json: String(payloadJson),
        occurred_at: String(occurredAt),
        created_at: String(createdAt),
        processed_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (/UPDATE events SET processed_at/.test(sql)) {
      const row = tables.platformEvents.find((item) => item.id === args[1] && item.processed_at === null);
      if (!row) return { meta: { changes: 0 } };
      row.processed_at = String(args[0]);
      return { meta: { changes: 1 } };
    }
    if (/INSERT INTO telegram_events/.test(sql)) {
      tables.legacyEvents.push({
        id: String(args[0]),
        event: String(args[1]),
        pseudo_user: args[2] === null ? null : String(args[2]),
        meta_json: String(args[3]),
        created_at: String(args[4]),
      });
      return { meta: { changes: 1 } };
    }
    throw new Error('unexpected D1 run statement in platform-events fake');
  }

  function first(sql: string, args: unknown[]) {
    if (/FROM events WHERE idempotency_key = \?/.test(sql)) {
      return tables.platformEvents.find((row) => row.idempotency_key === args[0]) ?? null;
    }
    if (/FROM events WHERE id = \?/.test(sql)) {
      return tables.platformEvents.find((row) => row.id === args[0]) ?? null;
    }
    throw new Error('unexpected D1 first statement in platform-events fake');
  }

  function all(sql: string, args: unknown[]) {
    if (/FROM events\s+WHERE processed_at IS NULL/.test(sql)) {
      const limit = Number(args[0]);
      return {
        results: tables.platformEvents
          .filter((row) => row.processed_at === null)
          .sort((left, right) =>
            left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
          .slice(0, limit),
      };
    }
    throw new Error('unexpected D1 all statement in platform-events fake');
  }

  const prepare = (sql: string) => ({
    args: [] as unknown[],
    bind(...args: unknown[]) {
      this.args = args;
      return this;
    },
    run() {
      return Promise.resolve(run(sql, this.args));
    },
    first<T>() {
      return Promise.resolve(first(sql, this.args) as T | null);
    },
    all<T>() {
      return Promise.resolve(all(sql, this.args) as { results: T[] });
    },
  });

  return {
    prepare,
    _tables: tables,
  } as unknown as D1Database & { _tables: typeof tables };
}

function platformEvent(id: string, payload: PlatformEvent['payload'] = { count: 1 }): PlatformEvent {
  return {
    id,
    type: 'message.received',
    occurredAt: '2026-07-26T00:00:00.000Z',
    orgId: null,
    agentId: 'test-agent',
    aggregate: `test:${id}`,
    payload,
  };
}

test('bus calls one subscriber', async () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.subscribe('message.received', (event) => { seen.push(event.id); });
  await bus.emit(platformEvent('bus-one'));
  assert.deepEqual(seen, ['bus-one']);
});

test('bus calls multiple subscribers in registration order', async () => {
  const bus = new EventBus();
  const order: number[] = [];
  bus.subscribe('message.received', async () => { order.push(1); });
  bus.subscribe('message.received', () => { order.push(2); });
  await bus.emit(platformEvent('bus-order'));
  assert.deepEqual(order, [1, 2]);
});

test('bus safely ignores events without subscribers', async () => {
  await new EventBus().emit(platformEvent('bus-empty'));
});

test('bus runs remaining subscribers and reports aggregated failures', async () => {
  const bus = new EventBus();
  const order: number[] = [];
  bus.subscribe('message.received', () => {
    order.push(1);
    throw new Error('subscriber failed');
  });
  bus.subscribe('message.received', () => { order.push(2); });
  await assert.rejects(
    () => bus.emit(platformEvent('bus-error')),
    (error: unknown) => error instanceof EventDispatchError && error.failureCount === 1,
  );
  assert.deepEqual(order, [1, 2]);
});

test('append creates a durable event', async () => {
  const db = makeD1();
  await ensurePlatformEventsSchema(db);
  const result = await appendEvent(db, {
    event: platformEvent('append-one'),
    idempotencyKey: 'append-one',
    createdAt: '2026-07-26T00:00:01.000Z',
  });
  assert.equal(result.status, 'created');
  assert.equal((db as typeof db)._tables.platformEvents.length, 1);
  assert.equal((await getEventById(db, 'append-one'))?.idempotencyKey, 'append-one');
});

test('duplicate idempotency key returns duplicate without a second row', async () => {
  const db = makeD1();
  const service = new PlatformEventsService(db);
  const first = await service.publish({ event: platformEvent('duplicate-one'), idempotencyKey: 'same-key' });
  const second = await service.publish({ event: platformEvent('duplicate-two'), idempotencyKey: 'same-key' });
  assert.equal(first.status, 'created');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.event.id, 'duplicate-one');
  assert.equal((db as typeof db)._tables.platformEvents.length, 1);
});

test('listUnprocessed returns only unprocessed rows', async () => {
  const db = makeD1();
  await ensurePlatformEventsSchema(db);
  await appendEvent(db, { event: platformEvent('queue-a'), idempotencyKey: 'queue-a' });
  await appendEvent(db, { event: platformEvent('queue-b'), idempotencyKey: 'queue-b' });
  assert.equal(await markProcessed(db, 'queue-a', '2026-07-26T00:01:00.000Z'), 'processed');
  assert.deepEqual((await listUnprocessed(db)).map((event) => event.id), ['queue-b']);
});

test('markProcessed is idempotent and distinguishes missing rows', async () => {
  const db = makeD1();
  await ensurePlatformEventsSchema(db);
  await appendEvent(db, { event: platformEvent('mark-one'), idempotencyKey: 'mark-one' });
  assert.equal(await markProcessed(db, 'mark-one'), 'processed');
  assert.equal(await markProcessed(db, 'mark-one'), 'already_processed');
  assert.equal(await markProcessed(db, 'missing'), 'missing');
});

test('PII guard accepts nested JSON-safe payloads', () => {
  const safe = validatePiiSafePayload({
    channel: 'telegram',
    metrics: { durationBucket: '15-60s', attempts: 1 },
    flags: [true, false, null],
  });
  assert.equal((safe.metrics as { attempts: number }).attempts, 1);
});

test('PII guard rejects a forbidden top-level key', () => {
  assert.throws(
    () => validatePiiSafePayload({ email: 'test@example.invalid' }),
    (error: unknown) =>
      error instanceof EventPayloadValidationError &&
      error.code === 'forbidden_key' &&
      error.path === '$.email',
  );
});

test('PII guard rejects a forbidden nested key', () => {
  assert.throws(
    () => validatePiiSafePayload({ profile: { raw_text: 'Test' } }),
    (error: unknown) =>
      error instanceof EventPayloadValidationError &&
      error.path === '$.profile.raw_text',
  );
});

test('PII guard error never includes the rejected value', () => {
  const pii = 'test@example.invalid';
  assert.throws(
    () => validatePiiSafePayload({ profile: { email: pii } }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('$.profile.email') &&
      !error.message.includes(pii),
  );
});

test('PII guard rejects payloads deeper than the configured boundary', () => {
  assert.throws(
    () => validatePiiSafePayload({ a: { b: { c: { d: { e: { f: true } } } } } }),
    (error: unknown) =>
      error instanceof EventPayloadValidationError && error.code === 'too_deep',
  );
});

test('PII guard rejects oversized payloads', () => {
  assert.throws(
    () => validatePiiSafePayload({ note: 'x'.repeat(9_000) }),
    (error: unknown) =>
      error instanceof EventPayloadValidationError && error.code === 'too_large',
  );
});

test('service durably appends before emitting', async () => {
  const db = makeD1();
  const bus = new EventBus();
  bus.subscribe('message.received', () => {
    assert.equal((db as typeof db)._tables.platformEvents.length, 1);
  });
  const result = await new PlatformEventsService(db, bus).publish({
    event: platformEvent('service-order'),
    idempotencyKey: 'service-order',
  });
  assert.equal(result.status, 'created');
});

test('service does not emit a duplicate event twice', async () => {
  const db = makeD1();
  const bus = new EventBus();
  let emitted = 0;
  bus.subscribe('message.received', () => { emitted++; });
  const service = new PlatformEventsService(db, bus);
  await service.publish({ event: platformEvent('emit-one'), idempotencyKey: 'emit-once' });
  const duplicate = await service.publish({ event: platformEvent('emit-two'), idempotencyKey: 'emit-once' });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(emitted, 1);
});

test('subscriber failure leaves the durable event intact', async () => {
  const db = makeD1();
  const bus = new EventBus();
  bus.subscribe('message.received', () => { throw new Error('subscriber failed'); });
  await assert.rejects(
    () => new PlatformEventsService(db, bus).publish({
      event: platformEvent('durable-before-error'),
      idempotencyKey: 'durable-before-error',
    }),
    EventDispatchError,
  );
  assert.ok(await getEventById(db, 'durable-before-error'));
});

test('corrupt stored JSON fails closed', async () => {
  const db = makeD1();
  (db as typeof db)._tables.platformEvents.push({
    id: 'corrupt',
    idempotency_key: 'corrupt',
    org_id: null,
    agent_id: null,
    type: 'message.received',
    aggregate_ref: 'test:corrupt',
    payload_json: '{not-json',
    occurred_at: '2026-07-26T00:00:00.000Z',
    created_at: '2026-07-26T00:00:00.000Z',
    processed_at: null,
  });
  await assert.rejects(() => getEventById(db, 'corrupt'), CorruptPlatformEventError);
});

test('Javob bridge preserves legacy logging and writes one PII-safe platform event', async () => {
  const db = makeD1();
  await logJavobMessageReceived(db, {
    updateId: 701,
    itemId: 'item-safe',
    pseudo: 'pseudo-safe',
    locale: 'ru',
    language: 'ru',
  });
  const tables = (db as typeof db)._tables;
  assert.equal(tables.legacyEvents.length, 1);
  assert.equal(tables.legacyEvents[0].event, 'javob_message_received');
  assert.equal(tables.platformEvents.length, 1);
  const stored = await getEventById(db, 'javob-message-received:701');
  assert.equal(stored?.type, 'message.received');
  assert.deepEqual(stored?.payload, {
    channel: 'telegram',
    locale: 'ru',
    language: 'ru',
    sourceType: 'direct',
  });
  assert.ok(!tables.platformEvents[0].payload_json.includes('pseudo-safe'));
});

test('Javob bridge failure is content-free and never breaks legacy logging', async () => {
  const db = makeD1({ failPlatformInsert: true });
  const captured: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
  try {
    await logJavobMessageReceived(db, {
      updateId: 702,
      itemId: 'item-safe',
      pseudo: 'pseudo-safe',
      locale: 'uz',
      language: 'uz',
    });
  } finally {
    console.error = original;
  }
  assert.equal((db as typeof db)._tables.legacyEvents.length, 1);
  assert.deepEqual(captured, ['tg.platform_event bridge failed']);
});
