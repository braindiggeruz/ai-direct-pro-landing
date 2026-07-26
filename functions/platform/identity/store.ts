import {
  IDENTITY_PROVIDERS,
  type Identity,
  type IdentityLookup,
  type IdentityProvider,
  type IdentityResolution,
} from './types';

const IDENTITY_COLUMNS = 'id, provider, external_id, created_at, updated_at';
const PROVIDERS = new Set<string>(IDENTITY_PROVIDERS);

const IDENTITY_DDL = [
  `CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('telegram', 'web', 'email', 'phone', 'api')),
    external_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (provider, external_id)
  )`,
] as const;

interface IdentityRow {
  id: string;
  provider: string;
  external_id: string;
  created_at: string;
  updated_at: string;
}

export class IdentityValidationError extends Error {
  readonly code: 'invalid_provider' | 'invalid_external_id' | 'invalid_identity_id';

  constructor(code: IdentityValidationError['code']) {
    super(`identity rejected: ${code}`);
    this.name = 'IdentityValidationError';
    this.code = code;
  }
}

export class IdentityPersistenceError extends Error {
  constructor() {
    super('identity persistence failed');
    this.name = 'IdentityPersistenceError';
  }
}

export interface IdentityStore {
  getOrCreateIdentity(provider: IdentityProvider, externalId: string): Promise<IdentityResolution>;
  getIdentityById(identityId: string): Promise<Identity | null>;
  findIdentity(provider: IdentityProvider, externalId: string): Promise<Identity | null>;
}

function fromRow(row: IdentityRow): Identity {
  if (!PROVIDERS.has(row.provider)) throw new IdentityPersistenceError();
  return {
    id: row.id,
    provider: row.provider as IdentityProvider,
    externalId: row.external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireIdentityId(value: string): string {
  if (typeof value !== 'string') throw new IdentityValidationError('invalid_identity_id');
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    throw new IdentityValidationError('invalid_identity_id');
  }
  return normalized;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizeExternalId(provider: IdentityProvider, value: string): string {
  if (!PROVIDERS.has(provider)) throw new IdentityValidationError('invalid_provider');
  if (typeof value !== 'string') throw new IdentityValidationError('invalid_external_id');
  const trimmed = value.trim();
  if (!trimmed || hasControlCharacters(trimmed)) {
    throw new IdentityValidationError('invalid_external_id');
  }

  if (provider === 'telegram') {
    if (!/^[1-9]\d{0,19}$/.test(trimmed)) {
      throw new IdentityValidationError('invalid_external_id');
    }
    return trimmed;
  }
  if (provider === 'email') {
    const normalized = trimmed.toLowerCase();
    if (
      normalized.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw new IdentityValidationError('invalid_external_id');
    }
    return normalized;
  }
  if (provider === 'phone') {
    const normalized = trimmed.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new IdentityValidationError('invalid_external_id');
    }
    return normalized;
  }
  if (trimmed.length > 200) throw new IdentityValidationError('invalid_external_id');
  return trimmed;
}

function newIdentityId(): string {
  return `identity_${crypto.randomUUID()}`;
}

export async function bootstrapIdentityStore(db: D1Database): Promise<void> {
  for (const statement of IDENTITY_DDL) await db.prepare(statement).run();
}

export function createIdentityStore(db: D1Database): IdentityStore {
  async function findNormalized(lookup: IdentityLookup): Promise<Identity | null> {
    const row = await db
      .prepare(`SELECT ${IDENTITY_COLUMNS}
                FROM identities
                WHERE provider = ? AND external_id = ?`)
      .bind(lookup.provider, lookup.externalId)
      .first<IdentityRow>();
    return row ? fromRow(row) : null;
  }

  return {
    async getOrCreateIdentity(
      provider: IdentityProvider,
      externalId: string,
    ): Promise<IdentityResolution> {
      const normalized = normalizeExternalId(provider, externalId);
      const existing = await findNormalized({ provider, externalId: normalized });
      if (existing) return { status: 'existing', identity: existing };

      const createdAt = new Date().toISOString();
      const identity: Identity = {
        id: newIdentityId(),
        provider,
        externalId: normalized,
        createdAt,
        updatedAt: createdAt,
      };
      const result = await db
        .prepare(`INSERT OR IGNORE INTO identities
          (id, provider, external_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`)
        .bind(
          identity.id,
          identity.provider,
          identity.externalId,
          identity.createdAt,
          identity.updatedAt,
        )
        .run();
      if ((result.meta?.changes ?? 0) > 0) {
        return { status: 'created', identity };
      }
      const raced = await findNormalized({ provider, externalId: normalized });
      if (!raced) throw new IdentityPersistenceError();
      return { status: 'existing', identity: raced };
    },

    async getIdentityById(identityId: string): Promise<Identity | null> {
      const id = requireIdentityId(identityId);
      const row = await db
        .prepare(`SELECT ${IDENTITY_COLUMNS} FROM identities WHERE id = ?`)
        .bind(id)
        .first<IdentityRow>();
      return row ? fromRow(row) : null;
    },

    async findIdentity(provider: IdentityProvider, externalId: string): Promise<Identity | null> {
      return findNormalized({
        provider,
        externalId: normalizeExternalId(provider, externalId),
      });
    },
  };
}
