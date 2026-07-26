export { EventBus, EventDispatchError } from './bus';
export type { EventHandler } from './bus';
export {
  EventPayloadValidationError,
  MAX_EVENT_PAYLOAD_BYTES,
  MAX_EVENT_PAYLOAD_DEPTH,
  validatePiiSafePayload,
} from './pii';
export { ensurePlatformEventsSchema } from './schema';
export {
  appendEvent,
  CorruptPlatformEventError,
  getEventById,
  listUnprocessed,
  markProcessed,
  PlatformEventPersistenceError,
} from './store';
export type {
  AppendEventInput,
  AppendEventResult,
  MarkProcessedResult,
  StoredPlatformEvent,
} from './store';
export {
  createPlatformEventsService,
  PlatformEventsService,
  PlatformEventValidationError,
} from './service';
export type { PublishEventInput } from './service';
