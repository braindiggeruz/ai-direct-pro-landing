import { bootstrapIdentityStore } from './store';
import { isRuntimeSchemaVerified } from '../storage/runtime-schema';

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureIdentitySchema(db: D1Database): Promise<void> {
  if (isRuntimeSchemaVerified(db)) return Promise.resolve();
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = bootstrapIdentityStore(db).catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
