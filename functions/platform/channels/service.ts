import { ChannelAddressNotFoundError } from './errors';
import { ensureChannelAddressSchema } from './schema';
import {
  createChannelAddressStore,
  requireChannel,
  requireIdentityId,
  requireNamespace,
  requireThreadRef,
  type ChannelAddressStore,
} from './store';
import type {
  BindChannelAddressInput,
  ChannelAddress,
  ChannelAddressBindingPort,
  ChannelAddressKey,
} from './types';

const ID_BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function randomAddressId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += ID_BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return `a-${encoded}`;
}

export interface ChannelAddressServiceOptions {
  idGenerator?: () => string;
}

/**
 * Stores where an identity can be reached, and nothing else. No raw transport
 * update, username or profile field is accepted or persisted, and a stored
 * address never grants tenant, store or conversation authority.
 */
export class ChannelAddressService {
  private readonly store: ChannelAddressStore;
  private readonly idGenerator: () => string;

  constructor(
    private readonly db: D1Database,
    options: ChannelAddressServiceOptions = {},
  ) {
    this.store = createChannelAddressStore(db);
    this.idGenerator = options.idGenerator ?? randomAddressId;
  }

  private async ready(): Promise<void> {
    await ensureChannelAddressSchema(this.db);
  }

  /** Idempotent: re-binding the same address writes nothing. */
  async bind(input: BindChannelAddressInput): Promise<void> {
    await this.ready();
    await this.store.bind(
      this.idGenerator(),
      {
        identityId: requireIdentityId(input.identityId),
        channel: requireChannel(input.channel),
        namespace: requireNamespace(input.namespace),
        threadRef: requireThreadRef(input.threadRef),
      },
      new Date().toISOString(),
    );
  }

  async find(key: ChannelAddressKey): Promise<ChannelAddress | null> {
    await this.ready();
    return this.store.findActive({
      identityId: requireIdentityId(key.identityId),
      channel: requireChannel(key.channel),
      namespace: requireNamespace(key.namespace),
    });
  }

  async require(key: ChannelAddressKey): Promise<ChannelAddress> {
    const address = await this.find(key);
    if (!address) throw new ChannelAddressNotFoundError();
    return address;
  }

  async revoke(key: ChannelAddressKey): Promise<boolean> {
    await this.ready();
    const changes = await this.store.revoke(
      {
        identityId: requireIdentityId(key.identityId),
        channel: requireChannel(key.channel),
        namespace: requireNamespace(key.namespace),
      },
      new Date().toISOString(),
    );
    return changes === 1;
  }
}

export function createChannelAddressService(
  db: D1Database,
  options: ChannelAddressServiceOptions = {},
): ChannelAddressService {
  return new ChannelAddressService(db, options);
}

/** Narrow write-only view handed to a channel adapter. */
export function createChannelAddressBindingPort(
  service: ChannelAddressService,
): ChannelAddressBindingPort {
  return { bind: (input) => service.bind(input) };
}
