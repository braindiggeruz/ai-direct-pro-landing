export type CheckoutValidationCode =
  | 'invalid_context'
  | 'invalid_id'
  | 'invalid_quantity'
  | 'invalid_name'
  | 'invalid_phone'
  | 'invalid_address'
  | 'invalid_comment'
  | 'invalid_version'
  | 'invalid_state'
  | 'invalid_order_number'
  | 'invalid_input';

export class CheckoutValidationError extends Error {
  constructor(public readonly code: CheckoutValidationCode) {
    super(`checkout validation failed: ${code}`);
    this.name = 'CheckoutValidationError';
  }
}

export class CheckoutAuthorizationError extends Error {
  readonly code = 'authorization_failed';

  constructor() {
    super('checkout authorization failed');
    this.name = 'CheckoutAuthorizationError';
  }
}

export class CheckoutNotFoundError extends Error {
  readonly code = 'not_found';

  constructor(
    public readonly entity: 'session' | 'product' | 'order' | 'item',
  ) {
    super(`checkout ${entity} not found`);
    this.name = 'CheckoutNotFoundError';
  }
}

export type CheckoutStateCode =
  | 'product_unavailable'
  | 'order_not_draft'
  | 'order_incomplete'
  | 'invalid_transition';

export class CheckoutStateError extends Error {
  constructor(public readonly code: CheckoutStateCode) {
    super(`checkout state rejected: ${code}`);
    this.name = 'CheckoutStateError';
  }
}

export class CheckoutVersionConflictError extends Error {
  readonly code = 'version_conflict';

  constructor() {
    super('checkout version conflict');
    this.name = 'CheckoutVersionConflictError';
  }
}

export class CheckoutIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor() {
    super('checkout idempotency conflict');
    this.name = 'CheckoutIdempotencyConflictError';
  }
}

export class CheckoutPersistenceError extends Error {
  constructor(
    public readonly code: 'persistence_failed' | 'corrupt_row' | 'number_collision',
  ) {
    super(`checkout persistence failed: ${code}`);
    this.name = 'CheckoutPersistenceError';
  }
}
