// Platform contract: declarative workflow definitions.
// Definitions stay in trusted TypeScript code. The P1.2 executor persists
// instances in D1 and never loads definitions or executable expressions from
// storage.
import type { EventValue } from './events';

export type WorkflowTrigger =
  | { on: 'intent'; intent: string }
  | { on: 'action'; actionId: string }
  | { on: 'event'; eventType: string };

export type WorkflowJsonValue = EventValue;

export interface WorkflowPayloadSchema<TPayload> {
  validate(input: unknown): TPayload;
}

export interface WorkflowActionRef {
  type: string;
  input?: WorkflowJsonValue;
}

export interface WorkflowExecutionContext {
  orgId: string;
  instanceId: string;
  workflowId: string;
  workflowVersion: number;
  state: string;
  instanceVersion: number;
}

export interface WorkflowGuardTrigger {
  trigger: WorkflowTrigger;
  data?: WorkflowJsonValue;
}

/**
 * Guards receive data only. The engine provides no database, network or AI
 * capability; guards must remain side-effect free.
 */
export type WorkflowGuard<TPayload> = (
  context: WorkflowExecutionContext,
  payload: Readonly<TPayload>,
  trigger: WorkflowGuardTrigger,
) => boolean | Promise<boolean>;

/**
 * Trusted definitions may derive the next persisted payload from the current
 * payload and validated transient trigger data. The result is always passed
 * through the workflow payload schema before the transition is committed.
 */
export type WorkflowPayloadReducer<TPayload> = (
  context: WorkflowExecutionContext,
  payload: Readonly<TPayload>,
  trigger: WorkflowGuardTrigger,
) => TPayload | Promise<TPayload>;

export interface WorkflowTransition<
  TPayload = unknown,
  TState extends string = string,
> {
  trigger: WorkflowTrigger;
  to: TState;
  guard?: WorkflowGuard<TPayload>;
  reducePayload?: WorkflowPayloadReducer<TPayload>;
  actions?: readonly WorkflowActionRef[];
}

export interface WorkflowStateDefinition<
  TPayload = unknown,
  TState extends string = string,
> {
  transitions: readonly WorkflowTransition<TPayload, TState>[];
}

export interface WorkflowDefinition<
  TPayload = unknown,
  TState extends string = string,
> {
  id: string;
  version: number;
  initial: TState;
  terminalStates?: readonly TState[];
  payload: WorkflowPayloadSchema<TPayload>;
  states: Readonly<Record<TState, WorkflowStateDefinition<TPayload, TState>>>;
}

/** Type-erased manifest view; execution still validates payload at runtime. */
export function eraseWorkflowDefinition<
  TPayload,
  TState extends string,
>(
  definition: WorkflowDefinition<TPayload, TState>,
): WorkflowDefinition {
  return definition as unknown as WorkflowDefinition;
}
