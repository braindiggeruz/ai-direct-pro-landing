import {
  WorkflowPersistenceError,
} from './errors';
import {
  type CommitWorkflowTransitionInput,
  type CommitWorkflowTransitionResult,
  type PersistWorkflowInstanceInput,
  type WorkflowInstance,
  type WorkflowTransitionRecord,
} from './types';
import {
  parseStoredWorkflowPayload,
  parseWorkflowMetadata,
  requireWorkflowIdempotencyKey,
  requireWorkflowInstanceId,
  requireWorkflowOrgId,
  requireWorkflowStatus,
  requireWorkflowVersion,
} from './validation';

const INSTANCE_COLUMNS =
  'id, org_id, workflow_id, workflow_version, state, status, payload_json, '
  + 'version, idempotency_key, wake_at, created_at, updated_at, completed_at';
const TRANSITION_COLUMNS =
  'id, org_id, instance_id, from_state, to_state, trigger, idempotency_key, '
  + 'instance_version, metadata_json, created_at';

interface WorkflowInstanceRow {
  id: string;
  org_id: string;
  workflow_id: string;
  workflow_version: number;
  state: string;
  status: string;
  payload_json: string;
  version: number;
  idempotency_key: string;
  wake_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface WorkflowTransitionRow {
  id: string;
  org_id: string;
  instance_id: string;
  from_state: string;
  to_state: string;
  trigger: string;
  idempotency_key: string;
  instance_version: number;
  metadata_json: string;
  created_at: string;
}

export interface WorkflowStore {
  createInstance(
    orgId: string,
    input: PersistWorkflowInstanceInput,
  ): Promise<{ outcome: 'created' | 'duplicate'; instance: WorkflowInstance }>;
  getInstance(orgId: string, instanceId: string): Promise<WorkflowInstance | null>;
  getInstanceByIdempotencyKey(
    orgId: string,
    idempotencyKey: string,
  ): Promise<WorkflowInstance | null>;
  getTransitionByIdempotencyKey(
    orgId: string,
    idempotencyKey: string,
  ): Promise<WorkflowTransitionRecord | null>;
  listTransitionHistory(
    orgId: string,
    instanceId: string,
  ): Promise<WorkflowTransitionRecord[]>;
  commitTransition(
    orgId: string,
    input: CommitWorkflowTransitionInput,
  ): Promise<CommitWorkflowTransitionResult>;
  updateTransitionMetadata(
    orgId: string,
    instanceId: string,
    transitionId: string,
    metadataJson: string,
  ): Promise<WorkflowTransitionRecord>;
}

function validRequiredDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validOptionalDate(value: unknown): value is string | null {
  return value === null || validRequiredDate(value);
}

function fromInstanceRow(row: WorkflowInstanceRow): WorkflowInstance {
  try {
    const status = requireWorkflowStatus(row.status);
    requireWorkflowVersion(row.workflow_version);
    requireWorkflowVersion(row.version);
    if (
      !validOptionalDate(row.wake_at)
      || !validRequiredDate(row.created_at)
      || !validRequiredDate(row.updated_at)
      || !validOptionalDate(row.completed_at)
      || (status === 'completed' && row.completed_at === null)
      || (status !== 'completed' && row.completed_at !== null)
    ) {
      throw new WorkflowPersistenceError('corrupt_row');
    }
    return {
      id: row.id,
      orgId: row.org_id,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      state: row.state,
      status,
      payload: parseStoredWorkflowPayload(row.payload_json),
      version: row.version,
      idempotencyKey: row.idempotency_key,
      wakeAt: row.wake_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  } catch {
    throw new WorkflowPersistenceError('corrupt_row');
  }
}

function fromTransitionRow(
  row: WorkflowTransitionRow,
): WorkflowTransitionRecord {
  try {
    requireWorkflowVersion(row.instance_version);
    if (!validRequiredDate(row.created_at)) {
      throw new WorkflowPersistenceError('corrupt_row');
    }
    return {
      id: row.id,
      orgId: row.org_id,
      instanceId: row.instance_id,
      fromState: row.from_state,
      toState: row.to_state,
      trigger: row.trigger,
      idempotencyKey: row.idempotency_key,
      instanceVersion: row.instance_version,
      metadata: parseWorkflowMetadata(row.metadata_json),
      createdAt: row.created_at,
    };
  } catch {
    throw new WorkflowPersistenceError('corrupt_row');
  }
}

function newWorkflowId(type: 'instance' | 'transition'): string {
  return `workflow_${type}_${crypto.randomUUID()}`;
}

export function createWorkflowStore(db: D1Database): WorkflowStore {
  async function getInstanceRow(
    orgId: string,
    instanceId: string,
  ): Promise<WorkflowInstance | null> {
    const row = await db
      .prepare(`SELECT ${INSTANCE_COLUMNS}
                FROM workflow_instances
                WHERE org_id = ? AND id = ?`)
      .bind(orgId, instanceId)
      .first<WorkflowInstanceRow>();
    return row ? fromInstanceRow(row) : null;
  }

  async function getInstanceByKey(
    orgId: string,
    idempotencyKey: string,
  ): Promise<WorkflowInstance | null> {
    const row = await db
      .prepare(`SELECT ${INSTANCE_COLUMNS}
                FROM workflow_instances
                WHERE org_id = ? AND idempotency_key = ?`)
      .bind(orgId, idempotencyKey)
      .first<WorkflowInstanceRow>();
    return row ? fromInstanceRow(row) : null;
  }

  async function getTransitionByKey(
    orgId: string,
    idempotencyKey: string,
  ): Promise<WorkflowTransitionRecord | null> {
    const row = await db
      .prepare(`SELECT ${TRANSITION_COLUMNS}
                FROM workflow_transitions
                WHERE org_id = ? AND idempotency_key = ?`)
      .bind(orgId, idempotencyKey)
      .first<WorkflowTransitionRow>();
    return row ? fromTransitionRow(row) : null;
  }

  async function getTransitionById(
    orgId: string,
    transitionId: string,
  ): Promise<WorkflowTransitionRecord | null> {
    const row = await db
      .prepare(`SELECT ${TRANSITION_COLUMNS}
                FROM workflow_transitions
                WHERE org_id = ? AND id = ?`)
      .bind(orgId, transitionId)
      .first<WorkflowTransitionRow>();
    return row ? fromTransitionRow(row) : null;
  }

  return {
    async createInstance(
      orgId: string,
      input: PersistWorkflowInstanceInput,
    ): Promise<{ outcome: 'created' | 'duplicate'; instance: WorkflowInstance }> {
      const tenantId = requireWorkflowOrgId(orgId);
      const idempotencyKey = requireWorkflowIdempotencyKey(input.idempotencyKey);
      const createdAt = new Date().toISOString();
      try {
        const result = await db
          .prepare(`INSERT OR IGNORE INTO workflow_instances
            (id, org_id, workflow_id, workflow_version, state, status,
             payload_json, version, idempotency_key, wake_at, created_at,
             updated_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?)`)
          .bind(
            input.id,
            tenantId,
            input.workflowId,
            input.workflowVersion,
            input.initialState,
            input.status,
            input.payloadJson,
            idempotencyKey,
            createdAt,
            createdAt,
            input.completedAt,
          )
          .run();
        if ((result.meta?.changes ?? 0) > 0) {
          const created = await getInstanceRow(tenantId, input.id);
          if (!created) throw new WorkflowPersistenceError('persistence_failed');
          return { outcome: 'created', instance: created };
        }
        const existing = await getInstanceByKey(tenantId, idempotencyKey);
        if (!existing) throw new WorkflowPersistenceError('persistence_failed');
        return { outcome: 'duplicate', instance: existing };
      } catch (error) {
        if (error instanceof WorkflowPersistenceError) throw error;
        const existing = await getInstanceByKey(tenantId, idempotencyKey);
        if (existing) return { outcome: 'duplicate', instance: existing };
        throw new WorkflowPersistenceError('persistence_failed');
      }
    },

    async getInstance(
      orgId: string,
      instanceId: string,
    ): Promise<WorkflowInstance | null> {
      return getInstanceRow(
        requireWorkflowOrgId(orgId),
        requireWorkflowInstanceId(instanceId),
      );
    },

    async getInstanceByIdempotencyKey(
      orgId: string,
      idempotencyKey: string,
    ): Promise<WorkflowInstance | null> {
      return getInstanceByKey(
        requireWorkflowOrgId(orgId),
        requireWorkflowIdempotencyKey(idempotencyKey),
      );
    },

    async getTransitionByIdempotencyKey(
      orgId: string,
      idempotencyKey: string,
    ): Promise<WorkflowTransitionRecord | null> {
      return getTransitionByKey(
        requireWorkflowOrgId(orgId),
        requireWorkflowIdempotencyKey(idempotencyKey),
      );
    },

    async listTransitionHistory(
      orgId: string,
      instanceId: string,
    ): Promise<WorkflowTransitionRecord[]> {
      const tenantId = requireWorkflowOrgId(orgId);
      const id = requireWorkflowInstanceId(instanceId);
      if (!await getInstanceRow(tenantId, id)) return [];
      const rows = await db
        .prepare(`SELECT ${TRANSITION_COLUMNS}
                  FROM workflow_transitions
                  WHERE org_id = ? AND instance_id = ?
                  ORDER BY created_at ASC, id ASC`)
        .bind(tenantId, id)
        .all<WorkflowTransitionRow>();
      return (rows.results ?? []).map(fromTransitionRow);
    },

    async commitTransition(
      orgId: string,
      input: CommitWorkflowTransitionInput,
    ): Promise<CommitWorkflowTransitionResult> {
      const tenantId = requireWorkflowOrgId(orgId);
      const instanceId = requireWorkflowInstanceId(input.instanceId);
      const idempotencyKey = requireWorkflowIdempotencyKey(input.idempotencyKey);
      const expectedVersion = requireWorkflowVersion(input.expectedVersion);
      const transitionId = newWorkflowId('transition');
      const createdAt = new Date().toISOString();
      let results: D1Result<unknown>[];
      try {
        results = await db.batch([
          db.prepare(`INSERT OR IGNORE INTO workflow_transitions
            (id, org_id, instance_id, from_state, to_state, trigger,
             idempotency_key, instance_version, metadata_json, created_at)
            SELECT ?, instance.org_id, instance.id, instance.state, ?, ?, ?,
                   instance.version + 1, ?, ?
            FROM workflow_instances AS instance
            WHERE instance.org_id = ? AND instance.id = ?
              AND instance.version = ? AND instance.status = 'active'
              AND instance.state = ?`)
            .bind(
              transitionId,
              input.toState,
              input.trigger,
              idempotencyKey,
              input.metadataJson,
              createdAt,
              tenantId,
              instanceId,
              expectedVersion,
              input.fromState,
            ),
          db.prepare(`UPDATE workflow_instances
            SET state = ?, status = ?, payload_json = ?,
                version = version + 1, updated_at = ?, completed_at = ?
            WHERE org_id = ? AND id = ? AND version = ?
              AND status = 'active' AND state = ?
              AND EXISTS (
                SELECT 1 FROM workflow_transitions AS transition
                WHERE transition.org_id = ? AND transition.id = ?
                  AND transition.instance_id = workflow_instances.id
              )`)
            .bind(
              input.toState,
              input.status,
              input.payloadJson,
              createdAt,
              input.completedAt,
              tenantId,
              instanceId,
              expectedVersion,
              input.fromState,
              tenantId,
              transitionId,
            ),
        ]);
      } catch {
        throw new WorkflowPersistenceError('persistence_failed');
      }
      const inserted = results[0]?.meta?.changes ?? 0;
      const updated = results[1]?.meta?.changes ?? 0;
      if (inserted === 1 && updated === 1) {
        const instance = await getInstanceRow(tenantId, instanceId);
        const transition = await getTransitionById(tenantId, transitionId);
        if (!instance || !transition) {
          throw new WorkflowPersistenceError('persistence_failed');
        }
        return { outcome: 'applied', instance, transition };
      }
      if (inserted !== 0 || updated !== 0) {
        throw new WorkflowPersistenceError('persistence_failed');
      }
      const duplicate = await getTransitionByKey(tenantId, idempotencyKey);
      if (duplicate) {
        const instance = await getInstanceRow(tenantId, duplicate.instanceId);
        if (!instance) throw new WorkflowPersistenceError('corrupt_row');
        return { outcome: 'duplicate', instance, transition: duplicate };
      }
      const instance = await getInstanceRow(tenantId, instanceId);
      return instance
        ? { outcome: 'conflict', instance }
        : { outcome: 'not_found' };
    },

    async updateTransitionMetadata(
      orgId: string,
      instanceId: string,
      transitionId: string,
      metadataJson: string,
    ): Promise<WorkflowTransitionRecord> {
      const tenantId = requireWorkflowOrgId(orgId);
      const workflowInstanceId = requireWorkflowInstanceId(instanceId);
      const id = requireWorkflowInstanceId(transitionId);
      const result = await db
        .prepare(`UPDATE workflow_transitions
                  SET metadata_json = ?
                  WHERE org_id = ? AND instance_id = ? AND id = ?`)
        .bind(metadataJson, tenantId, workflowInstanceId, id)
        .run();
      if ((result.meta?.changes ?? 0) !== 1) {
        throw new WorkflowPersistenceError('persistence_failed');
      }
      const updated = await getTransitionById(tenantId, id);
      if (!updated) throw new WorkflowPersistenceError('persistence_failed');
      return updated;
    },
  };
}
