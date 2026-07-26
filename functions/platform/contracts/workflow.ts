// Platform contract: declarative workflow definitions (data only).
// The persistent FSM executor arrives in P1.2; nothing here executes.
// State payloads and timers are intentionally absent until a stage needs them.

export type WorkflowTrigger =
  | { on: 'intent'; intent: string }
  | { on: 'action'; actionId: string }
  | { on: 'event'; eventType: string };

export interface WorkflowTransition {
  trigger: WorkflowTrigger;
  to: string;
}

export interface WorkflowStateDefinition {
  transitions: readonly WorkflowTransition[];
  /** Marks a state where the instance is complete; no transitions required. */
  terminal?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  initial: string;
  states: Readonly<Record<string, WorkflowStateDefinition>>;
}
