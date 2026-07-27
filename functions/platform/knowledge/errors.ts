export type KnowledgeValidationCode =
  | 'invalid_org_id'
  | 'invalid_collection_id'
  | 'invalid_item_id'
  | 'invalid_agent_id'
  | 'invalid_kind'
  | 'invalid_schema_version'
  | 'invalid_version'
  | 'invalid_name'
  | 'invalid_status'
  | 'invalid_payload'
  | 'invalid_search_text'
  | 'invalid_media_refs'
  | 'invalid_numeric_values'
  | 'invalid_query'
  | 'invalid_limit';

export class KnowledgeValidationError extends Error {
  constructor(public readonly code: KnowledgeValidationCode) {
    super(`knowledge validation failed: ${code}`);
    this.name = 'KnowledgeValidationError';
  }
}

export class KnowledgeNotFoundError extends Error {
  readonly code = 'not_found';

  constructor(public readonly entity: 'collection' | 'item') {
    super(`knowledge ${entity} not found`);
    this.name = 'KnowledgeNotFoundError';
  }
}

export class KnowledgeVersionConflictError extends Error {
  readonly code = 'version_conflict';

  constructor() {
    super('knowledge item version conflict');
    this.name = 'KnowledgeVersionConflictError';
  }
}

export class KnowledgeDuplicateCollectionError extends Error {
  readonly code = 'duplicate_collection';

  constructor() {
    super('knowledge collection already exists');
    this.name = 'KnowledgeDuplicateCollectionError';
  }
}

export class KnowledgePayloadTooLargeError extends Error {
  readonly code = 'payload_too_large';

  constructor() {
    super('knowledge payload exceeds the configured limit');
    this.name = 'KnowledgePayloadTooLargeError';
  }
}

export class KnowledgePersistenceError extends Error {
  constructor(public readonly code: 'persistence_failed' | 'corrupt_row') {
    super(`knowledge persistence failed: ${code}`);
    this.name = 'KnowledgePersistenceError';
  }
}
