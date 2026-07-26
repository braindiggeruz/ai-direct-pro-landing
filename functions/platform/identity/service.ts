import { ensureIdentitySchema } from './schema';
import { createIdentityStore, type IdentityStore } from './store';
import type { Identity, IdentityProvider, IdentityResolution } from './types';

export class IdentityService {
  private readonly store: IdentityStore;

  constructor(private readonly db: D1Database) {
    this.store = createIdentityStore(db);
  }

  async getOrCreateIdentity(
    provider: IdentityProvider,
    externalId: string,
  ): Promise<IdentityResolution> {
    await ensureIdentitySchema(this.db);
    return this.store.getOrCreateIdentity(provider, externalId);
  }

  async getIdentityById(identityId: string): Promise<Identity | null> {
    await ensureIdentitySchema(this.db);
    return this.store.getIdentityById(identityId);
  }

  async findIdentity(
    provider: IdentityProvider,
    externalId: string,
  ): Promise<Identity | null> {
    await ensureIdentitySchema(this.db);
    return this.store.findIdentity(provider, externalId);
  }
}

export function createIdentityService(db: D1Database): IdentityService {
  return new IdentityService(db);
}
