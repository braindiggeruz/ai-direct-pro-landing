export type HandoffValidationCode =
  | 'invalid_context'
  | 'invalid_id'
  | 'invalid_input'
  | 'invalid_question'
  | 'invalid_reply'
  | 'invalid_reason'
  | 'invalid_state'
  | 'invalid_version';

export class HandoffValidationError extends Error {
  constructor(public readonly code: HandoffValidationCode) {
    super(`handoff validation failed: ${code}`);
    this.name = 'HandoffValidationError';
  }
}

/** Content-free: never reveals whether the store, buyer or handoff exists. */
export class HandoffNotFoundError extends Error {
  readonly code = 'not_found';

  constructor() {
    super('handoff not found');
    this.name = 'HandoffNotFoundError';
  }
}

export class HandoffAuthorizationError extends Error {
  readonly code = 'authorization_failed';

  constructor() {
    super('handoff authorization failed');
    this.name = 'HandoffAuthorizationError';
  }
}

export type HandoffStateCode =
  | 'invalid_transition'
  | 'already_answered'
  | 'no_reply_session';

export class HandoffStateError extends Error {
  constructor(public readonly code: HandoffStateCode) {
    super(`handoff state rejected: ${code}`);
    this.name = 'HandoffStateError';
  }
}

export class HandoffExpiredError extends Error {
  readonly code = 'expired';

  constructor() {
    super('handoff expired');
    this.name = 'HandoffExpiredError';
  }
}

export class HandoffIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor() {
    super('handoff idempotency conflict');
    this.name = 'HandoffIdempotencyConflictError';
  }
}

export class HandoffReplyConflictError extends Error {
  readonly code = 'reply_conflict';

  constructor() {
    super('handoff reply conflict');
    this.name = 'HandoffReplyConflictError';
  }
}

export class HandoffPersistenceError extends Error {
  constructor(public readonly code: 'persistence_failed' | 'corrupt_row') {
    super(`handoff persistence failed: ${code}`);
    this.name = 'HandoffPersistenceError';
  }
}

/** Raised when a message cannot be pushed; never carries a transport detail. */
export class NotificationDeliveryError extends Error {
  constructor(public readonly code: 'no_address' | 'send_failed') {
    super(`notification delivery failed: ${code}`);
    this.name = 'NotificationDeliveryError';
  }
}
