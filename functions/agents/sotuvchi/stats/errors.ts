/** Content-free stats errors: no tenant, store or buyer data in the message. */
export class StatsAuthorizationError extends Error {
  constructor() {
    super('sotuvchi stats rejected: not_authorized');
    this.name = 'StatsAuthorizationError';
  }
}

export class StatsValidationError extends Error {
  readonly code: 'invalid_input';

  constructor() {
    super('sotuvchi stats rejected: invalid_input');
    this.name = 'StatsValidationError';
    this.code = 'invalid_input';
  }
}
