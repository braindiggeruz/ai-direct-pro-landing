export type CatalogValidationCode =
  | 'invalid_context'
  | 'invalid_id'
  | 'invalid_name'
  | 'invalid_description'
  | 'invalid_slug'
  | 'invalid_sort_order'
  | 'invalid_sku'
  | 'invalid_price'
  | 'invalid_currency'
  | 'invalid_availability'
  | 'invalid_status'
  | 'invalid_media_refs'
  | 'invalid_version'
  | 'invalid_patch'
  | 'invalid_filter'
  | 'invalid_query'
  | 'invalid_limit';

export class CatalogValidationError extends Error {
  constructor(public readonly code: CatalogValidationCode) {
    super(`catalog validation failed: ${code}`);
    this.name = 'CatalogValidationError';
  }
}

export class CatalogNotFoundError extends Error {
  readonly code = 'not_found';

  constructor(
    public readonly entity: 'store' | 'category' | 'product' | 'session' | 'inquiry',
  ) {
    super(`catalog ${entity} not found`);
    this.name = 'CatalogNotFoundError';
  }
}

export class CatalogAuthorizationError extends Error {
  readonly code = 'authorization_failed';

  constructor() {
    super('catalog authorization failed');
    this.name = 'CatalogAuthorizationError';
  }
}

export class CatalogVersionConflictError extends Error {
  readonly code = 'version_conflict';

  constructor() {
    super('catalog version conflict');
    this.name = 'CatalogVersionConflictError';
  }
}

export type CatalogStateCode =
  | 'category_archived'
  | 'category_inactive'
  | 'product_archived'
  | 'invalid_transition'
  | 'publication_blocked'
  | 'sku_conflict'
  | 'catalog_limit'
  | 'slug_collision';

export class CatalogStateError extends Error {
  constructor(public readonly code: CatalogStateCode) {
    super(`catalog state rejected: ${code}`);
    this.name = 'CatalogStateError';
  }
}

export class CatalogIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor() {
    super('catalog idempotency conflict');
    this.name = 'CatalogIdempotencyConflictError';
  }
}

export class CatalogPersistenceError extends Error {
  constructor(public readonly code: 'persistence_failed' | 'corrupt_row') {
    super(`catalog persistence failed: ${code}`);
    this.name = 'CatalogPersistenceError';
  }
}
