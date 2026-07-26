import { bootstrapIdentityStore } from './store';

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureIdentitySchema(db: D1Database): Promise<void> {
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
