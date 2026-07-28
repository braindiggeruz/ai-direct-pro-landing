import {
  ChannelAddressPersistenceError,
  ChannelAddressValidationError,
} from './errors';
import {
  CHANNEL_ADDRESS_STATUSES,
  type BindChannelAddressInput,
  type ChannelAddress,
  type ChannelAddressKey,
  type ChannelAddressStatus,
} from './types';

// Canonical SQL lives only here; schema.ts supplies the isolate-level guard.
export const PLATFORM_CHANNEL_ADDRESSES_DDL = [
  `CREATE TABLE IF NOT EXISTS channel_addresses (
    id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
    channel TEXT NOT NULL
      CHECK (length(channel) >= 1 AND length(channel) <= 32),
    namespace TEXT NOT NULL
      CHECK (length(namespace) >= 1 AND length(namespace) <= 64),
    thread_ref TEXT NOT NULL
      CHECK (length(thread_ref) >= 1 AND length(thread_ref) <= 64),
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (identity_id, channel, namespace)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_channel_addresses_lookup
    ON channel_addresses (channel, namespace, status, identity_id)`,
] as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const SAFE_CHANNEL = /^[a-z][a-z0-9_-]{0,31}$/;
const SAFE_NAMESPACE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_THREAD_REF = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,63}$/;
const STATUSES = new Set<string>(CHANNEL_ADDRESS_STATUSES);

interface ChannelAddressRow {
  id: string;
  identity_id: string;
  channel: string;
  namespace: string;
  thread_ref: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function requireIdentityId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new ChannelAddressValidationError('invalid_identity');
  }
  return value;
}

export function requireChannel(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_CHANNEL.test(value)) {
    throw new ChannelAddressValidationError('invalid_channel');
  }
  return value;
}

export function requireNamespace(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_NAMESPACE.test(value)) {
    throw new ChannelAddressValidationError('invalid_namespace');
  }
  return value;
}

/**
 * Opaque transport handle. It is deliberately not parsed into a channel
 * specific type here: the platform must never learn what a Telegram chat id is.
 */
export function requireThreadRef(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_THREAD_REF.test(value)) {
    throw new ChannelAddressValidationError('invalid_thread_ref');
  }
  return value;
}

function requireStatus(value: unknown): ChannelAddressStatus {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw new ChannelAddressValidationError('invalid_status');
  }
  return value as ChannelAddressStatus;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function fromRow(row: ChannelAddressRow): ChannelAddress {
  try {
    if (!validDate(row.created_at) || !validDate(row.updated_at)) {
      throw new ChannelAddressPersistenceError('corrupt_row');
    }
    return {
      id: requireIdentityId(row.id),
      identityId: requireIdentityId(row.identity_id),
      channel: requireChannel(row.channel),
      namespace: requireNamespace(row.namespace),
      threadRef: requireThreadRef(row.thread_ref),
      status: requireStatus(row.status),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    if (error instanceof ChannelAddressPersistenceError) throw error;
    throw new ChannelAddressPersistenceError('corrupt_row');
  }
}

export interface ChannelAddressStore {
  bind(
    id: string,
    input: BindChannelAddressInput,
    now: string,
  ): Promise<number>;
  findActive(key: ChannelAddressKey): Promise<ChannelAddress | null>;
  revoke(key: ChannelAddressKey, now: string): Promise<number>;
}

export function createChannelAddressStore(
  db: D1Database,
): ChannelAddressStore {
  return {
    async bind(id, input, now) {
      const result = await db
        .prepare(`INSERT INTO channel_addresses
            (id, identity_id, channel, namespace, thread_ref, status,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
          ON CONFLICT (identity_id, channel, namespace) DO UPDATE SET
            thread_ref = excluded.thread_ref,
            status = 'active',
            updated_at = excluded.updated_at
          WHERE channel_addresses.thread_ref <> excluded.thread_ref
             OR channel_addresses.status <> 'active'`)
        .bind(
          requireIdentityId(id),
          requireIdentityId(input.identityId),
          requireChannel(input.channel),
          requireNamespace(input.namespace),
          requireThreadRef(input.threadRef),
          now,
          now,
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },

    async findActive(key) {
      const row = await db
        .prepare(`SELECT id, identity_id, channel, namespace, thread_ref,
                         status, created_at, updated_at
                  FROM channel_addresses
                  WHERE identity_id = ? AND channel = ? AND namespace = ?
                    AND status = 'active'`)
        .bind(
          requireIdentityId(key.identityId),
          requireChannel(key.channel),
          requireNamespace(key.namespace),
        )
        .first<ChannelAddressRow>();
      return row ? fromRow(row) : null;
    },

    async revoke(key, now) {
      const result = await db
        .prepare(`UPDATE channel_addresses
                  SET status = 'revoked', updated_at = ?
                  WHERE identity_id = ? AND channel = ? AND namespace = ?
                    AND status = 'active'`)
        .bind(
          now,
          requireIdentityId(key.identityId),
          requireChannel(key.channel),
          requireNamespace(key.namespace),
        )
        .run();
      return Number(result?.meta?.changes ?? 0);
    },
  };
}
