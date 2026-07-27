import type {
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowTransition,
} from '../contracts';
import {
  WorkflowActionError,
  WorkflowAlreadyFinishedError,
  WorkflowGuardError,
  WorkflowGuardRejectedError,
  WorkflowNotFoundError,
  WorkflowTransitionNotAllowedError,
  WorkflowValidationError,
  WorkflowVersionConflictError,
} from './errors';
import { ensureWorkflowSchema } from './schema';
import { createWorkflowStore, type WorkflowStore } from './store';
import {
  type CancelWorkflowResult,
  type CreateWorkflowInstanceInput,
  type CreateWorkflowInstanceResult,
  type TransitionWorkflowInput,
  type WorkflowActionRegistry,
  type WorkflowActionResult,
  type WorkflowInstance,
  type WorkflowTransitionMetadata,
  type WorkflowTransitionRecord,
  type WorkflowTransitionResult,
} from './types';
import {
  isWorkflowTerminalState,
  prepareWorkflowPayload,
  requireWorkflowIdempotencyKey,
  requireWorkflowInstanceId,
  requireWorkflowOrgId,
  requireWorkflowVersion,
  serializeWorkflowMetadata,
  validateWorkflowDefinition,
  validateWorkflowTriggerData,
  workflowTriggerKey,
} from './validation';

function newInstanceId(): string {
  return `workflow_instance_${crypto.randomUUID()}`;
}

function transitionResult(
  outcome: 'applied' | 'duplicate',
  transition: WorkflowTransitionRecord,
): WorkflowTransitionResult {
  return {
    outcome,
    previousState: transition.fromState,
    currentState: transition.toState,
    version: transition.instanceVersion,
    status: transition.metadata.instanceStatus,
    actionResults: transition.metadata.actionResults,
  };
}

function definitionMatches<TPayload, TState extends string>(
  instance: WorkflowInstance,
  definition: WorkflowDefinition<TPayload, TState>,
): boolean {
  return instance.workflowId === definition.id
    && instance.workflowVersion === definition.version;
}

export class WorkflowEngine {
  private readonly store: WorkflowStore;

  constructor(
    private readonly db: D1Database,
    private readonly actions: WorkflowActionRegistry = {},
  ) {
    this.store = createWorkflowStore(db);
  }

  private async ready(): Promise<void> {
    await ensureWorkflowSchema(this.db);
  }

  async create<TPayload, TState extends string>(
    orgId: string,
    definition: WorkflowDefinition<TPayload, TState>,
    input: CreateWorkflowInstanceInput,
  ): Promise<CreateWorkflowInstanceResult<TPayload>> {
    validateWorkflowDefinition(definition);
    const tenantId = requireWorkflowOrgId(orgId);
    const idempotencyKey = requireWorkflowIdempotencyKey(input.idempotencyKey);
    await this.ready();
    const existing = await this.store.getInstanceByIdempotencyKey(
      tenantId,
      idempotencyKey,
    );
    if (existing) {
      if (!definitionMatches(existing, definition)) {
        throw new WorkflowValidationError('idempotency_conflict');
      }
      return {
        outcome: 'duplicate',
        instance: existing as WorkflowInstance<TPayload>,
      };
    }
    const payload = prepareWorkflowPayload(
      input.initialPayload,
      definition.payload,
    );
    const completed = isWorkflowTerminalState(definition, definition.initial);
    const createdAt = new Date().toISOString();
    const result = await this.store.createInstance(tenantId, {
      id: newInstanceId(),
      workflowId: definition.id,
      workflowVersion: definition.version,
      initialState: definition.initial,
      status: completed ? 'completed' : 'active',
      payloadJson: payload.payloadJson,
      idempotencyKey,
      completedAt: completed ? createdAt : null,
    });
    if (!definitionMatches(result.instance, definition)) {
      throw new WorkflowValidationError('idempotency_conflict');
    }
    return {
      outcome: result.outcome,
      instance: result.instance as WorkflowInstance<TPayload>,
    };
  }

  async get(
    orgId: string,
    instanceId: string,
  ): Promise<WorkflowInstance | null> {
    await this.ready();
    return this.store.getInstance(orgId, instanceId);
  }

  async history(
    orgId: string,
    instanceId: string,
  ): Promise<WorkflowTransitionRecord[]> {
    await this.ready();
    return this.store.listTransitionHistory(orgId, instanceId);
  }

  async transition<TPayload, TState extends string>(
    orgId: string,
    definition: WorkflowDefinition<TPayload, TState>,
    instanceId: string,
    input: TransitionWorkflowInput,
  ): Promise<WorkflowTransitionResult> {
    validateWorkflowDefinition(definition);
    const tenantId = requireWorkflowOrgId(orgId);
    const id = requireWorkflowInstanceId(instanceId);
    const idempotencyKey = requireWorkflowIdempotencyKey(input.idempotencyKey);
    const expectedVersion = requireWorkflowVersion(input.expectedVersion);
    const triggerKey = workflowTriggerKey(input.trigger);
    const triggerData = validateWorkflowTriggerData(input.triggerData);
    await this.ready();

    const prior = await this.store.getTransitionByIdempotencyKey(
      tenantId,
      idempotencyKey,
    );
    if (prior) {
      if (prior.instanceId !== id || prior.trigger !== triggerKey) {
        throw new WorkflowValidationError('idempotency_conflict');
      }
      return transitionResult('duplicate', prior);
    }

    const instance = await this.store.getInstance(tenantId, id);
    if (!instance) throw new WorkflowNotFoundError();
    if (!definitionMatches(instance, definition)) {
      throw new WorkflowValidationError('definition_mismatch');
    }
    if (instance.status === 'completed') {
      throw new WorkflowAlreadyFinishedError();
    }
    if (instance.status !== 'active') {
      throw new WorkflowTransitionNotAllowedError();
    }
    if (instance.version !== expectedVersion) {
      throw new WorkflowVersionConflictError();
    }

    const state = definition.states[instance.state as TState];
    if (!state) throw new WorkflowValidationError('definition_mismatch');
    const transition = state.transitions.find(
      (candidate) => workflowTriggerKey(candidate.trigger) === triggerKey,
    ) as WorkflowTransition<TPayload, TState> | undefined;
    if (!transition) throw new WorkflowTransitionNotAllowedError();

    const payload = prepareWorkflowPayload(
      instance.payload,
      definition.payload,
    );
    const context: WorkflowExecutionContext = {
      orgId: tenantId,
      instanceId: id,
      workflowId: definition.id,
      workflowVersion: definition.version,
      state: instance.state,
      instanceVersion: instance.version,
    };
    if (transition.guard) {
      let allowed: boolean;
      try {
        allowed = await transition.guard(context, payload.value, {
          trigger: input.trigger,
          data: triggerData,
        });
      } catch {
        throw new WorkflowGuardError();
      }
      if (!allowed) throw new WorkflowGuardRejectedError();
    }

    let nextPayload = payload;
    if (transition.reducePayload) {
      try {
        const reduced = await transition.reducePayload(
          context,
          payload.value,
          {
            trigger: input.trigger,
            data: triggerData,
          },
        );
        nextPayload = prepareWorkflowPayload(reduced, definition.payload);
      } catch {
        throw new WorkflowValidationError('invalid_payload');
      }
    }

    const actionRefs = transition.actions ?? [];
    for (const action of actionRefs) {
      if (
        !Object.prototype.hasOwnProperty.call(this.actions, action.type)
        || typeof this.actions[action.type] !== 'function'
      ) {
        throw new WorkflowActionError('unknown_action');
      }
    }

    const completed = isWorkflowTerminalState(definition, transition.to);
    const initialMetadata: WorkflowTransitionMetadata = {
      instanceStatus: completed ? 'completed' : 'active',
      actionStatus: actionRefs.length > 0 ? 'pending' : 'not_applicable',
      actionResults: [],
    };
    const committed = await this.store.commitTransition(tenantId, {
      instanceId: id,
      expectedVersion,
      fromState: instance.state,
      toState: transition.to,
      trigger: triggerKey,
      idempotencyKey,
      payloadJson: nextPayload.payloadJson,
      status: initialMetadata.instanceStatus,
      completedAt: completed ? new Date().toISOString() : null,
      metadataJson: serializeWorkflowMetadata(initialMetadata),
    });
    if (committed.outcome === 'not_found') throw new WorkflowNotFoundError();
    if (committed.outcome === 'conflict') {
      throw new WorkflowVersionConflictError();
    }
    if (committed.transition.instanceId !== id) {
      throw new WorkflowValidationError('idempotency_conflict');
    }
    if (committed.outcome === 'duplicate') {
      return transitionResult('duplicate', committed.transition);
    }
    if (actionRefs.length === 0) {
      return transitionResult('applied', committed.transition);
    }

    const actionResults: WorkflowActionResult[] = [];
    for (let index = 0; index < actionRefs.length; index += 1) {
      const action = actionRefs[index];
      const handler = this.actions[action.type];
      try {
        await handler(
          {
            ...context,
            transitionId: committed.transition.id,
            transitionIdempotencyKey: idempotencyKey,
            actionIndex: index,
            actionIdempotencyKey: `${committed.transition.id}:action:${index}`,
            fromState: instance.state,
            toState: transition.to,
          },
          action.input,
        );
        actionResults.push({ type: action.type, status: 'succeeded' });
      } catch {
        actionResults.push({
          type: action.type,
          status: 'failed',
          code: 'handler_failed',
        });
        break;
      }
    }
    const finalMetadata: WorkflowTransitionMetadata = {
      instanceStatus: initialMetadata.instanceStatus,
      actionStatus: actionResults.some((result) => result.status === 'failed')
        ? 'failed'
        : 'succeeded',
      actionResults,
    };
    let recorded: WorkflowTransitionRecord;
    try {
      recorded = await this.store.updateTransitionMetadata(
        tenantId,
        id,
        committed.transition.id,
        serializeWorkflowMetadata(finalMetadata),
      );
    } catch {
      throw new WorkflowActionError('result_persistence_failed');
    }
    return transitionResult('applied', recorded);
  }

  async cancel(
    orgId: string,
    instanceId: string,
  ): Promise<CancelWorkflowResult> {
    const tenantId = requireWorkflowOrgId(orgId);
    const id = requireWorkflowInstanceId(instanceId);
    await this.ready();
    const instance = await this.store.getInstance(tenantId, id);
    if (!instance) throw new WorkflowNotFoundError();
    if (instance.status === 'cancelled') {
      return { outcome: 'already_cancelled', instance };
    }
    if (instance.status !== 'active') {
      throw new WorkflowAlreadyFinishedError();
    }
    const metadata: WorkflowTransitionMetadata = {
      instanceStatus: 'cancelled',
      actionStatus: 'not_applicable',
      actionResults: [],
    };
    const committed = await this.store.commitTransition(tenantId, {
      instanceId: id,
      expectedVersion: instance.version,
      fromState: instance.state,
      toState: instance.state,
      trigger: 'system:cancel',
      idempotencyKey: `workflow.cancel:${id}`,
      payloadJson: JSON.stringify(instance.payload),
      status: 'cancelled',
      completedAt: null,
      metadataJson: serializeWorkflowMetadata(metadata),
    });
    if (committed.outcome === 'not_found') throw new WorkflowNotFoundError();
    if (committed.outcome === 'conflict') {
      throw new WorkflowVersionConflictError();
    }
    return {
      outcome: committed.outcome === 'applied'
        ? 'cancelled'
        : 'already_cancelled',
      instance: committed.instance,
    };
  }
}

export function createWorkflowEngine(
  db: D1Database,
  actions: WorkflowActionRegistry = {},
): WorkflowEngine {
  return new WorkflowEngine(db, actions);
}
