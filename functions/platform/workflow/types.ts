import type {
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowJsonValue,
  WorkflowTrigger,
} from '../contracts';

export const WORKFLOW_INSTANCE_STATUSES = [
  'active',
  'completed',
  'cancelled',
  'failed',
] as const;

export type WorkflowInstanceStatus =
  (typeof WORKFLOW_INSTANCE_STATUSES)[number];

export type WorkflowActionResult =
  | { type: string; status: 'succeeded' }
  | { type: string; status: 'failed'; code: 'handler_failed' };

export type WorkflowActionStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'not_applicable';

export interface WorkflowTransitionMetadata {
  instanceStatus: WorkflowInstanceStatus;
  actionStatus: WorkflowActionStatus;
  actionResults: readonly WorkflowActionResult[];
}

export interface WorkflowInstance<TPayload = unknown> {
  id: string;
  orgId: string;
  workflowId: string;
  workflowVersion: number;
  state: string;
  status: WorkflowInstanceStatus;
  payload: TPayload;
  version: number;
  idempotencyKey: string;
  wakeAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkflowTransitionRecord {
  id: string;
  orgId: string;
  instanceId: string;
  fromState: string;
  toState: string;
  trigger: string;
  idempotencyKey: string;
  instanceVersion: number;
  metadata: WorkflowTransitionMetadata;
  createdAt: string;
}

export interface CreateWorkflowInstanceInput {
  idempotencyKey: string;
  initialPayload: unknown;
}

export interface CreateWorkflowInstanceResult<TPayload = unknown> {
  outcome: 'created' | 'duplicate';
  instance: WorkflowInstance<TPayload>;
}

export interface TransitionWorkflowInput {
  trigger: WorkflowTrigger;
  idempotencyKey: string;
  expectedVersion: number;
  triggerData?: unknown;
}

export interface WorkflowTransitionResult {
  outcome: 'applied' | 'duplicate';
  previousState: string;
  currentState: string;
  version: number;
  status: WorkflowInstanceStatus;
  actionResults: readonly WorkflowActionResult[];
}

export interface CancelWorkflowResult {
  outcome: 'cancelled' | 'already_cancelled';
  instance: WorkflowInstance;
}

export interface WorkflowActionContext extends WorkflowExecutionContext {
  transitionId: string;
  transitionIdempotencyKey: string;
  actionIndex: number;
  actionIdempotencyKey: string;
  fromState: string;
  toState: string;
}

export type WorkflowActionHandler = (
  context: WorkflowActionContext,
  input: WorkflowJsonValue | undefined,
) => Promise<void>;

export type WorkflowActionRegistry = Readonly<
  Record<string, WorkflowActionHandler>
>;

export interface PersistWorkflowInstanceInput {
  id: string;
  workflowId: string;
  workflowVersion: number;
  initialState: string;
  status: WorkflowInstanceStatus;
  payloadJson: string;
  idempotencyKey: string;
  completedAt: string | null;
}

export interface CommitWorkflowTransitionInput {
  instanceId: string;
  expectedVersion: number;
  fromState: string;
  toState: string;
  trigger: string;
  idempotencyKey: string;
  payloadJson: string;
  status: WorkflowInstanceStatus;
  completedAt: string | null;
  metadataJson: string;
}

export type CommitWorkflowTransitionResult =
  | {
      outcome: 'applied' | 'duplicate';
      instance: WorkflowInstance;
      transition: WorkflowTransitionRecord;
    }
  | { outcome: 'conflict'; instance: WorkflowInstance }
  | { outcome: 'not_found' };

export type AnyWorkflowDefinition = WorkflowDefinition<unknown, string>;
