import { bootstrapPlatformEventsStore } from './store';
import { isRuntimeSchemaVerified } from '../storage/runtime-schema';

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

/** Idempotent per-isolate runtime bootstrap. Canonical deployment DDL remains
 * migrations/0013_platform_events.sql; this protects fresh/test databases. */
export function ensurePlatformEventsSchema(db: D1Database): Promise<void> {
  if (isRuntimeSchemaVerified(db)) return Promise.resolve();
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = bootstrapPlatformEventsStore(db).catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
