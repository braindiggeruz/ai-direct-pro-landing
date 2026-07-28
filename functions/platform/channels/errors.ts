export type ChannelAddressValidationCode =
  | 'invalid_identity'
  | 'invalid_channel'
  | 'invalid_namespace'
  | 'invalid_thread_ref'
  | 'invalid_status';

export class ChannelAddressValidationError extends Error {
  constructor(public readonly code: ChannelAddressValidationCode) {
    super(`channel address validation failed: ${code}`);
    this.name = 'ChannelAddressValidationError';
  }
}

/** Content-free: it never reveals whether the identity or the bot exists. */
export class ChannelAddressNotFoundError extends Error {
  readonly code = 'not_found';

  constructor() {
    super('channel address not found');
    this.name = 'ChannelAddressNotFoundError';
  }
}

export class ChannelAddressPersistenceError extends Error {
  constructor(public readonly code: 'persistence_failed' | 'corrupt_row') {
    super(`channel address persistence failed: ${code}`);
    this.name = 'ChannelAddressPersistenceError';
  }
}
