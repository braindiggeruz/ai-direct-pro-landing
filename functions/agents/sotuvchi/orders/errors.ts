export type SellerOrdersValidationCode =
  | 'invalid_context'
  | 'invalid_id'
  | 'invalid_input'
  | 'invalid_quantity'
  | 'invalid_state'
  | 'invalid_version';

export class SellerOrdersValidationError extends Error {
  constructor(public readonly code: SellerOrdersValidationCode) {
    super(`seller orders validation failed: ${code}`);
    this.name = 'SellerOrdersValidationError';
  }
}

export class SellerOrdersAuthorizationError extends Error {
  readonly code = 'authorization_failed';

  constructor() {
    super('seller orders authorization failed');
    this.name = 'SellerOrdersAuthorizationError';
  }
}

export class SellerOrdersNotFoundError extends Error {
  readonly code = 'not_found';

  constructor(public readonly entity: 'order' | 'product' | 'store') {
    super(`seller ${entity} not found`);
    this.name = 'SellerOrdersNotFoundError';
  }
}

export type SellerOrdersStateCode =
  | 'invalid_transition'
  | 'product_not_sellable'
  | 'order_incomplete';

export class SellerOrdersStateError extends Error {
  constructor(public readonly code: SellerOrdersStateCode) {
    super(`seller order state rejected: ${code}`);
    this.name = 'SellerOrdersStateError';
  }
}

export class SellerOrdersVersionConflictError extends Error {
  readonly code = 'version_conflict';

  constructor() {
    super('seller order version conflict');
    this.name = 'SellerOrdersVersionConflictError';
  }
}

export class SellerOrdersIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor() {
    super('seller order idempotency conflict');
    this.name = 'SellerOrdersIdempotencyConflictError';
  }
}

export class SellerOrdersPersistenceError extends Error {
  constructor(
    public readonly code: 'persistence_failed' | 'corrupt_row',
  ) {
    super(`seller order persistence failed: ${code}`);
    this.name = 'SellerOrdersPersistenceError';
  }
}
