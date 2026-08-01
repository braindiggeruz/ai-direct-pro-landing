import { ensureIdentitySchema } from '../identity';
import { isRuntimeSchemaVerified } from '../storage/runtime-schema';
import { PLATFORM_CHANNEL_ADDRESSES_DDL } from './store';

const bootstrapped = new WeakMap<D1Database, Promise<void>>();

export function ensureChannelAddressSchema(db: D1Database): Promise<void> {
  if (isRuntimeSchemaVerified(db)) return Promise.resolve();
  let pending = bootstrapped.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureIdentitySchema(db);
      for (const statement of PLATFORM_CHANNEL_ADDRESSES_DDL) {
        await db.prepare(statement).run();
      }
    })().catch((error) => {
      bootstrapped.delete(db);
      throw error;
    });
    bootstrapped.set(db, pending);
  }
  return pending;
}
