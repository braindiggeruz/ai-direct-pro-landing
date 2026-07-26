import { ensureIdentitySchema } from '../identity';
import { bootstrapOrganizationsStore } from './store';

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureOrganizationsSchema(db: D1Database): Promise<void> {
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
