import { ensureIdentitySchema } from '../identity';
import { isRuntimeSchemaVerified } from '../storage/runtime-schema';
import { bootstrapOrganizationsStore } from './store';

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureOrganizationsSchema(db: D1Database): Promise<void> {
  if (isRuntimeSchemaVerified(db)) return Promise.resolve();
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureIdentitySchema(db);
      await bootstrapOrganizationsStore(db);
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
