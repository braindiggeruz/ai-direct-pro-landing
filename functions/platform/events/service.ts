import type { PlatformEvent } from '../contracts';
import { EventBus } from './bus';
import { validatePiiSafePayload } from './pii';
import { ensurePlatformEventsSchema } from './schema';
import { appendEvent, type AppendEventResult } from './store';

const EVENT_TYPE = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

type EventField =
  | 'id'
  | 'idempotencyKey'
  | 'type'
  | 'occurredAt'
  | 'orgId'
  | 'agentId'
  | 'aggregate';

export class PlatformEventValidationError extends Error {
  readonly field: EventField;

  constructor(field: EventField) {
    super(`platform event rejected: invalid ${field}`);
    this.name = 'PlatformEventValidationError';
    this.field = field;
  }
}

export interface PublishEventInput {
  event: PlatformEvent;
  idempotencyKey: string;
}

function requireBounded(value: string, field: EventField, maxLength: number): void {
  if (!value.trim() || value.length > maxLength) throw new PlatformEventValidationError(field);
}

function validateEvent(input: PublishEventInput): PlatformEvent {
  requireBounded(input.event.id, 'id', 200);
  requireBounded(input.idempotencyKey, 'idempotencyKey', 240);
  requireBounded(input.event.type, 'type', 120);
  if (!EVENT_TYPE.test(input.event.type)) throw new PlatformEventValidationError('type');
  requireBounded(input.event.aggregate, 'aggregate', 240);
  if (!Number.isFinite(Date.parse(input.event.occurredAt))) {
    throw new PlatformEventValidationError('occurredAt');
  }
  if (input.event.orgId !== null) requireBounded(input.event.orgId, 'orgId', 120);
  if (input.event.agentId !== null) requireBounded(input.event.agentId, 'agentId', 120);
  return { ...input.event, payload: validatePiiSafePayload(input.event.payload) };
}

/** Publish order is durable append first, then sequential in-process emit.
 * Duplicate idempotency keys return without a second emit. Subscriber errors
 * propagate after persistence, so callers can observe failure without losing
 * the durable event. */
export class PlatformEventsService {
  constructor(
    private readonly db: D1Database,
    private readonly bus: EventBus = new EventBus(),
  ) {}

  async publish(input: PublishEventInput): Promise<AppendEventResult> {
    const event = validateEvent(input);
    await ensurePlatformEventsSchema(this.db);
    const result = await appendEvent(this.db, {
      event,
      idempotencyKey: input.idempotencyKey,
    });
    if (result.status === 'duplicate') return result;
    await this.bus.emit(event);
    return result;
  }
}

export function createPlatformEventsService(
  db: D1Database,
  bus?: EventBus,
): PlatformEventsService {
  return new PlatformEventsService(db, bus);
}
