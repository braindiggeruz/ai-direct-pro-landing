export type AgentManifestValidationCode =
  | 'invalid_manifest'
  | 'invalid_id'
  | 'invalid_version'
  | 'invalid_locale'
  | 'duplicate_locale'
  | 'invalid_capability'
  | 'duplicate_capability'
  | 'invalid_tool'
  | 'duplicate_tool'
  | 'invalid_rule'
  | 'duplicate_rule'
  | 'duplicate_priority'
  | 'invalid_policy'
  | 'invalid_workflow'
  | 'invalid_knowledge_kind';

export class AgentManifestValidationError extends Error {
  constructor(public readonly code: AgentManifestValidationCode) {
    super(`agent manifest rejected: ${code}`);
    this.name = 'AgentManifestValidationError';
  }
}

export class DuplicateAgentIdError extends Error {
  readonly code = 'duplicate_agent';

  constructor() {
    super('agent registry rejected a duplicate id');
    this.name = 'DuplicateAgentIdError';
  }
}

export class AgentNotFoundError extends Error {
  readonly code = 'agent_not_found';

  constructor() {
    super('agent not found');
    this.name = 'AgentNotFoundError';
  }
}

export class AgentToolNotFoundError extends Error {
  readonly code = 'tool_not_found';

  constructor() {
    super('agent tool not found');
    this.name = 'AgentToolNotFoundError';
  }
}

export class AgentToolInputError extends Error {
  readonly code = 'tool_input_rejected';

  constructor() {
    super('agent tool input rejected');
    this.name = 'AgentToolInputError';
  }
}

export class AgentToolExecutionError extends Error {
  readonly code = 'tool_execution_failed';

  constructor() {
    super('agent tool execution failed');
    this.name = 'AgentToolExecutionError';
  }
}

export class AgentRoutingError extends Error {
  readonly code = 'routing_failed';

  constructor() {
    super('agent routing failed');
    this.name = 'AgentRoutingError';
  }
}

export class AgentGroundingError extends Error {
  readonly code = 'grounding_failed';

  constructor(
    public readonly reason:
      | 'invalid_facts'
      | 'missing_template_fact'
      | 'unsupported_claim'
      | 'unsupported_number',
  ) {
    super(`agent grounding failed: ${reason}`);
    this.name = 'AgentGroundingError';
  }
}

export class AgentRuntimeRejectedError extends Error {
  readonly code = 'runtime_rejected';

  constructor() {
    super('agent runtime input rejected');
    this.name = 'AgentRuntimeRejectedError';
  }
}
