export type InventoryValidationCode =
  | 'invalid_context'
  | 'invalid_id'
  | 'invalid_quantity'
  | 'invalid_move_type'
  | 'invalid_version';

export class InventoryValidationError extends Error {
  constructor(public readonly code: InventoryValidationCode) {
    super(`inventory validation failed: ${code}`);
    this.name = 'InventoryValidationError';
  }
}

export class InventoryAuthorizationError extends Error {
  readonly code = 'authorization_failed';

  constructor() {
    super('inventory authorization failed');
    this.name = 'InventoryAuthorizationError';
  }
}

/** No balance row exists yet; the seller must set the initial stock first. */
export class InventoryNotConfiguredError extends Error {
  readonly code = 'inventory_not_configured';

  constructor() {
    super('inventory is not configured');
    this.name = 'InventoryNotConfiguredError';
  }
}

export class InventoryInsufficientError extends Error {
  readonly code = 'inventory_insufficient';

  constructor() {
    super('inventory is insufficient');
    this.name = 'InventoryInsufficientError';
  }
}

export class InventoryVersionConflictError extends Error {
  readonly code = 'version_conflict';

  constructor() {
    super('inventory version conflict');
    this.name = 'InventoryVersionConflictError';
  }
}

export class InventoryIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor() {
    super('inventory idempotency conflict');
    this.name = 'InventoryIdempotencyConflictError';
  }
}

export class InventoryPersistenceError extends Error {
  constructor(public readonly code: 'persistence_failed' | 'corrupt_row') {
    super(`inventory persistence failed: ${code}`);
    this.name = 'InventoryPersistenceError';
  }
}
