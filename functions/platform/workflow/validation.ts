import type {
  EventValue,
  WorkflowDefinition,
  WorkflowJsonValue,
  WorkflowPayloadSchema,
  WorkflowTrigger,
} from '../contracts';
import { validatePiiSafePayload } from '../events';
import {
  WorkflowPersistenceError,
  WorkflowValidationError,
  type WorkflowValidationCode,
} from './errors';
import {
  WORKFLOW_INSTANCE_STATUSES,
  type WorkflowActionResult,
  type WorkflowInstanceStatus,
  type WorkflowTransitionMetadata,
} from './types';

export const WORKFLOW_LIMITS = Object.freeze({
  idLength: 120,
  definitionIdLength: 64,
  stateLength: 64,
  triggerLength: 120,
  actionTypeLength: 64,
  idempotencyKeyLength: 240,
  payloadBytes: 65_536,
  payloadDepth: 20,
  transientBytes: 8_192,
  transientDepth: 10,
  states: 100,
  transitionsPerState: 50,
  actionsPerTransition: 20,
});

const SAFE_CODE = /^[a-z0-9][a-z0-9._-]*$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const STATUSES = new Set<string>(WORKFLOW_INSTANCE_STATUSES);
const ACTION_STATUSES = new Set([
  'pending',
  'succeeded',
  'failed',
  'not_applicable',
]);

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function requireString(
  value: unknown,
  code: WorkflowValidationCode,
  maxLength: number,
): string {
  if (typeof value !== 'string') throw new WorkflowValidationError(code);
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > maxLength
    || hasControlCharacters(normalized)
  ) {
    throw new WorkflowValidationError(code);
  }
  return normalized;
}

function requireSafeCode(
  value: unknown,
  code: WorkflowValidationCode,
  maxLength: number,
): string {
  const normalized = requireString(value, code, maxLength).toLowerCase();
  if (!SAFE_CODE.test(normalized) || DANGEROUS_KEYS.has(normalized)) {
    throw new WorkflowValidationError(code);
  }
  return normalized;
}

export function requireWorkflowOrgId(value: unknown): string {
  return requireString(value, 'invalid_org_id', WORKFLOW_LIMITS.idLength);
}

export function requireWorkflowInstanceId(value: unknown): string {
  return requireString(value, 'invalid_instance_id', WORKFLOW_LIMITS.idLength);
}

export function requireWorkflowIdempotencyKey(value: unknown): string {
  return requireString(
    value,
    'invalid_idempotency_key',
    WORKFLOW_LIMITS.idempotencyKeyLength,
  );
}

export function requireWorkflowVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new WorkflowValidationError('invalid_version');
  }
  return Number(value);
}

export function requireWorkflowStatus(value: unknown): WorkflowInstanceStatus {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw new WorkflowPersistenceError('corrupt_row');
  }
  return value as WorkflowInstanceStatus;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(
  value: unknown,
  seen: Set<object>,
  depth: number,
  maxDepth: number,
): void {
  if (depth > maxDepth) throw new WorkflowValidationError('invalid_payload');
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new WorkflowValidationError('invalid_payload');
    }
    return;
  }
  if (typeof value !== 'object' || ArrayBuffer.isView(value)) {
    throw new WorkflowValidationError('invalid_payload');
  }
  if (seen.has(value)) throw new WorkflowValidationError('invalid_payload');
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new WorkflowValidationError('invalid_payload');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const child of value) {
        validateJsonValue(child, seen, depth + 1, maxDepth);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        throw new WorkflowValidationError('invalid_payload');
      }
      validateJsonValue(child, seen, depth + 1, maxDepth);
    }
  } finally {
    seen.delete(value);
  }
}

function serializeJson(
  value: unknown,
  maxBytes: number,
  maxDepth: number,
): string {
  validateJsonValue(value, new Set<object>(), 0, maxDepth);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new WorkflowValidationError('invalid_payload');
  }
  if (serialized === undefined) {
    throw new WorkflowValidationError('invalid_payload');
  }
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new WorkflowValidationError('payload_too_large');
  }
  return serialized;
}

export function prepareWorkflowPayload<TPayload>(
  input: unknown,
  schema: WorkflowPayloadSchema<TPayload>,
): { value: TPayload; payloadJson: string } {
  let value: TPayload;
  try {
    value = schema.validate(input);
  } catch {
    throw new WorkflowValidationError('invalid_payload');
  }
  return {
    value,
    payloadJson: serializeJson(
      value,
      WORKFLOW_LIMITS.payloadBytes,
      WORKFLOW_LIMITS.payloadDepth,
    ),
  };
}

export function parseStoredWorkflowPayload(payloadJson: string): unknown {
  try {
    const value = JSON.parse(payloadJson);
    validateJsonValue(
      value,
      new Set<object>(),
      0,
      WORKFLOW_LIMITS.payloadDepth,
    );
    return value;
  } catch {
    throw new WorkflowPersistenceError('corrupt_row');
  }
}

export function validateWorkflowTriggerData(
  value: unknown,
): WorkflowJsonValue | undefined {
  if (value === undefined) return undefined;
  serializeJson(
    value,
    WORKFLOW_LIMITS.transientBytes,
    WORKFLOW_LIMITS.transientDepth,
  );
  return value as EventValue;
}

function triggerValue(trigger: WorkflowTrigger): string {
  if (!trigger || typeof trigger !== 'object') {
    throw new WorkflowValidationError('invalid_trigger');
  }
  switch (trigger.on) {
    case 'intent':
      return requireSafeCode(
        trigger.intent,
        'invalid_trigger',
        WORKFLOW_LIMITS.triggerLength,
      );
    case 'action':
      return requireSafeCode(
        trigger.actionId,
        'invalid_trigger',
        WORKFLOW_LIMITS.triggerLength,
      );
    case 'event':
      return requireSafeCode(
        trigger.eventType,
        'invalid_trigger',
        WORKFLOW_LIMITS.triggerLength,
      );
    default:
      throw new WorkflowValidationError('invalid_trigger');
  }
}

export function workflowTriggerKey(trigger: WorkflowTrigger): string {
  return `${trigger.on}:${triggerValue(trigger)}`;
}

function validateActionInput(value: WorkflowJsonValue | undefined): void {
  if (value === undefined) return;
  serializeJson(
    value,
    WORKFLOW_LIMITS.transientBytes,
    WORKFLOW_LIMITS.transientDepth,
  );
}

export function validateWorkflowDefinition<
  TPayload,
  TState extends string,
>(
  definition: WorkflowDefinition<TPayload, TState>,
): WorkflowDefinition<TPayload, TState> {
  if (!definition || typeof definition !== 'object') {
    throw new WorkflowValidationError('invalid_definition');
  }
  requireSafeCode(
    definition.id,
    'invalid_definition_id',
    WORKFLOW_LIMITS.definitionIdLength,
  );
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new WorkflowValidationError('invalid_definition_version');
  }
  if (!definition.payload || typeof definition.payload.validate !== 'function') {
    throw new WorkflowValidationError('invalid_definition');
  }
  if (
    !definition.states
    || typeof definition.states !== 'object'
    || Array.isArray(definition.states)
    || !isPlainObject(definition.states)
  ) {
    throw new WorkflowValidationError('invalid_definition');
  }
  const states = Object.keys(definition.states);
  if (states.length === 0 || states.length > WORKFLOW_LIMITS.states) {
    throw new WorkflowValidationError('invalid_definition');
  }
  const stateSet = new Set(
    states.map((state) =>
      requireSafeCode(state, 'invalid_state', WORKFLOW_LIMITS.stateLength)),
  );
  if (stateSet.size !== states.length) {
    throw new WorkflowValidationError('invalid_definition');
  }
  const initial = requireSafeCode(
    definition.initial,
    'invalid_state',
    WORKFLOW_LIMITS.stateLength,
  );
  if (!stateSet.has(initial)) {
    throw new WorkflowValidationError('invalid_definition');
  }
  for (const terminal of definition.terminalStates ?? []) {
    const state = requireSafeCode(
      terminal,
      'invalid_state',
      WORKFLOW_LIMITS.stateLength,
    );
    if (!stateSet.has(state)) {
      throw new WorkflowValidationError('invalid_definition');
    }
  }
  for (const stateName of states) {
    const state = definition.states[stateName as TState];
    if (!state || !Array.isArray(state.transitions)) {
      throw new WorkflowValidationError('invalid_definition');
    }
    if (state.transitions.length > WORKFLOW_LIMITS.transitionsPerState) {
      throw new WorkflowValidationError('invalid_definition');
    }
    const triggers = new Set<string>();
    for (const transition of state.transitions) {
      if (!transition || typeof transition !== 'object') {
        throw new WorkflowValidationError('invalid_definition');
      }
      const target = requireSafeCode(
        transition.to,
        'invalid_state',
        WORKFLOW_LIMITS.stateLength,
      );
      if (!stateSet.has(target)) {
        throw new WorkflowValidationError('invalid_definition');
      }
      const trigger = workflowTriggerKey(transition.trigger);
      if (triggers.has(trigger)) {
        throw new WorkflowValidationError('invalid_definition');
      }
      triggers.add(trigger);
      if (
        transition.guard !== undefined
        && typeof transition.guard !== 'function'
      ) {
        throw new WorkflowValidationError('invalid_definition');
      }
      if (
        transition.reducePayload !== undefined
        && typeof transition.reducePayload !== 'function'
      ) {
        throw new WorkflowValidationError('invalid_definition');
      }
      const actions = transition.actions ?? [];
      if (
        !Array.isArray(actions)
        || actions.length > WORKFLOW_LIMITS.actionsPerTransition
      ) {
        throw new WorkflowValidationError('invalid_action');
      }
      for (const action of actions) {
        if (!action || typeof action !== 'object') {
          throw new WorkflowValidationError('invalid_action');
        }
        requireSafeCode(
          action.type,
          'invalid_action',
          WORKFLOW_LIMITS.actionTypeLength,
        );
        validateActionInput(action.input);
      }
    }
  }
  return definition;
}

export function isWorkflowTerminalState<
  TPayload,
  TState extends string,
>(
  definition: WorkflowDefinition<TPayload, TState>,
  state: string,
): boolean {
  return (definition.terminalStates ?? []).includes(state as TState);
}

export function serializeWorkflowMetadata(
  metadata: WorkflowTransitionMetadata,
): string {
  return JSON.stringify(validatePiiSafePayload(metadata));
}

export function parseWorkflowMetadata(
  metadataJson: string,
): WorkflowTransitionMetadata {
  try {
    const value = validatePiiSafePayload(JSON.parse(metadataJson));
    if (
      typeof value.instanceStatus !== 'string'
      || !STATUSES.has(value.instanceStatus)
      || typeof value.actionStatus !== 'string'
      || !ACTION_STATUSES.has(value.actionStatus)
      || !Array.isArray(value.actionResults)
    ) {
      throw new Error('invalid metadata shape');
    }
    const actionResults = value.actionResults.map((item) => {
      if (
        !item
        || typeof item !== 'object'
        || Array.isArray(item)
        || typeof item.type !== 'string'
        || typeof item.status !== 'string'
        || !SAFE_CODE.test(item.type)
      ) {
        throw new Error('invalid action result');
      }
      if (item.status === 'succeeded') {
        return { type: item.type, status: 'succeeded' } as const;
      }
      if (item.status === 'failed' && item.code === 'handler_failed') {
        return {
          type: item.type,
          status: 'failed',
          code: 'handler_failed',
        } as const;
      }
      throw new Error('invalid action result');
    });
    return {
      instanceStatus: value.instanceStatus as WorkflowInstanceStatus,
      actionStatus: value.actionStatus as WorkflowTransitionMetadata['actionStatus'],
      actionResults: actionResults as readonly WorkflowActionResult[],
    };
  } catch {
    throw new WorkflowPersistenceError('corrupt_row');
  }
}
