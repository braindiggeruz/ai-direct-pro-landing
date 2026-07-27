export type WorkflowValidationCode =
  | 'invalid_org_id'
  | 'invalid_instance_id'
  | 'invalid_definition'
  | 'invalid_definition_id'
  | 'invalid_definition_version'
  | 'invalid_state'
  | 'invalid_trigger'
  | 'invalid_idempotency_key'
  | 'invalid_version'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'invalid_action'
  | 'definition_mismatch'
  | 'idempotency_conflict';

export class WorkflowValidationError extends Error {
  constructor(public readonly code: WorkflowValidationCode) {
    super(`workflow validation failed: ${code}`);
    this.name = 'WorkflowValidationError';
  }
}

export class WorkflowNotFoundError extends Error {
  readonly code = 'not_found';

  constructor() {
    super('workflow instance not found');
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowTransitionNotAllowedError extends Error {
  readonly code = 'transition_not_allowed';

  constructor() {
    super('workflow transition is not allowed');
    this.name = 'WorkflowTransitionNotAllowedError';
  }
}

export class WorkflowGuardRejectedError extends Error {
  readonly code = 'guard_rejected';

  constructor() {
    super('workflow guard rejected the transition');
    this.name = 'WorkflowGuardRejectedError';
  }
}

export class WorkflowGuardError extends Error {
  readonly code = 'guard_failed';

  constructor() {
    super('workflow guard failed');
    this.name = 'WorkflowGuardError';
  }
}

export class WorkflowVersionConflictError extends Error {
  readonly code = 'version_conflict';

  constructor() {
    super('workflow instance version conflict');
    this.name = 'WorkflowVersionConflictError';
  }
}

export class WorkflowAlreadyFinishedError extends Error {
  readonly code = 'already_finished';

  constructor() {
    super('workflow instance is already finished');
    this.name = 'WorkflowAlreadyFinishedError';
  }
}

export class WorkflowActionError extends Error {
  constructor(
    public readonly code: 'unknown_action' | 'result_persistence_failed',
  ) {
    super(`workflow action failed: ${code}`);
    this.name = 'WorkflowActionError';
  }
}

export class WorkflowPersistenceError extends Error {
  constructor(public readonly code: 'persistence_failed' | 'corrupt_row') {
    super(`workflow persistence failed: ${code}`);
    this.name = 'WorkflowPersistenceError';
  }
}
