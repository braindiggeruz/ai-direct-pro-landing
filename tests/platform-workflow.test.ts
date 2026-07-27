import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  WorkflowDefinition,
  WorkflowGuard,
} from '../functions/platform/contracts';
import {
  createWorkflowEngine,
  ensureWorkflowSchema,
  WORKFLOW_LIMITS,
  WorkflowActionError,
  WorkflowAlreadyFinishedError,
  WorkflowGuardError,
  WorkflowGuardRejectedError,
  WorkflowNotFoundError,
  WorkflowPersistenceError,
  WorkflowTransitionNotAllowedError,
  WorkflowValidationError,
  WorkflowVersionConflictError,
} from '../functions/platform/workflow';

interface InstanceRow {
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

interface TransitionRow {
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

interface FakeTables {
  instances: InstanceRow[];
  transitions: TransitionRow[];
  ddl: string[];
}

interface FakeStatement {
  sql: string;
  args: unknown[];
  bind(...args: unknown[]): FakeStatement;
  run(): Promise<{ meta: { changes: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}

interface FixturePayload {
  count: number;
  label?: string;
}

type FixtureState = 'draft' | 'review' | 'done';

const fixturePayloadSchema = {
  validate(input: unknown): FixturePayload {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('invalid fixture');
    }
    const source = input as { count?: unknown; label?: unknown };
    if (
      typeof source.count !== 'number'
      || !Number.isFinite(source.count)
      || (source.label !== undefined && typeof source.label !== 'string')
    ) {
      throw new Error('invalid fixture');
    }
    return {
      count: source.count,
      ...(source.label === undefined ? {} : { label: source.label }),
    };
  },
};

interface DefinitionOptions {
  guard?: WorkflowGuard<FixturePayload>;
  firstActions?: WorkflowDefinition<
    FixturePayload,
    FixtureState
  >['states']['draft']['transitions'][number]['actions'];
  secondActions?: WorkflowDefinition<
    FixturePayload,
    FixtureState
  >['states']['review']['transitions'][number]['actions'];
}

function makeDefinition(
  options: DefinitionOptions = {},
): WorkflowDefinition<FixturePayload, FixtureState> {
  return {
    id: 'fixture-flow',
    version: 1,
    initial: 'draft',
    terminalStates: ['done'],
    payload: fixturePayloadSchema,
    states: {
      draft: {
        transitions: [{
          trigger: { on: 'action', actionId: 'advance' },
          to: 'review',
          guard: options.guard,
          actions: options.firstActions,
        }],
      },
      review: {
        transitions: [{
          trigger: { on: 'event', eventType: 'fixture.finish' },
          to: 'done',
          actions: options.secondActions,
        }],
      },
      done: { transitions: [] },
    },
  };
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function stringValue(value: unknown): string {
  return String(value);
}

function makeD1() {
  const tables: FakeTables = {
    instances: [],
    transitions: [],
    ddl: [],
  };
  const organizations = new Set(['org-alpha', 'org-beta']);

  function run(sql: string, args: unknown[]): { meta: { changes: number } } {
    const statement = compactSql(sql);
    if (/^CREATE (?:TABLE|INDEX)/.test(statement)) {
      tables.ddl.push(statement);
      return { meta: { changes: 0 } };
    }

    if (/^INSERT OR IGNORE INTO workflow_instances/.test(statement)) {
      const [
        id,
        orgId,
        workflowId,
        workflowVersion,
        state,
        status,
        payloadJson,
        idempotencyKey,
        createdAt,
        updatedAt,
        completedAt,
      ] = args;
      if (!organizations.has(stringValue(orgId))) {
        throw new Error('fake organization FK');
      }
      if (
        tables.instances.some(
          (row) =>
            row.id === id
            || (
              row.org_id === orgId
              && row.idempotency_key === idempotencyKey
            ),
        )
      ) {
        return { meta: { changes: 0 } };
      }
      tables.instances.push({
        id: stringValue(id),
        org_id: stringValue(orgId),
        workflow_id: stringValue(workflowId),
        workflow_version: Number(workflowVersion),
        state: stringValue(state),
        status: stringValue(status),
        payload_json: stringValue(payloadJson),
        version: 1,
        idempotency_key: stringValue(idempotencyKey),
        wake_at: null,
        created_at: stringValue(createdAt),
        updated_at: stringValue(updatedAt),
        completed_at: completedAt === null ? null : stringValue(completedAt),
      });
      return { meta: { changes: 1 } };
    }

    if (/^INSERT OR IGNORE INTO workflow_transitions/.test(statement)) {
      const [
        id,
        toState,
        trigger,
        idempotencyKey,
        metadataJson,
        createdAt,
        orgId,
        instanceId,
        expectedVersion,
        fromState,
      ] = args;
      if (
        tables.transitions.some(
          (row) =>
            row.id === id
            || (
              row.org_id === orgId
              && row.idempotency_key === idempotencyKey
            ),
        )
      ) {
        return { meta: { changes: 0 } };
      }
      const instance = tables.instances.find(
        (row) =>
          row.org_id === orgId
          && row.id === instanceId
          && row.version === expectedVersion
          && row.status === 'active'
          && row.state === fromState,
      );
      if (!instance) return { meta: { changes: 0 } };
      tables.transitions.push({
        id: stringValue(id),
        org_id: instance.org_id,
        instance_id: instance.id,
        from_state: instance.state,
        to_state: stringValue(toState),
        trigger: stringValue(trigger),
        idempotency_key: stringValue(idempotencyKey),
        instance_version: instance.version + 1,
        metadata_json: stringValue(metadataJson),
        created_at: stringValue(createdAt),
      });
      return { meta: { changes: 1 } };
    }

    if (/^UPDATE workflow_instances SET state = \?/.test(statement)) {
      const [
        toState,
        status,
        payloadJson,
        updatedAt,
        completedAt,
        orgId,
        instanceId,
        expectedVersion,
        fromState,
        transitionOrgId,
        transitionId,
      ] = args;
      const transition = tables.transitions.find(
        (row) =>
          row.org_id === transitionOrgId
          && row.id === transitionId
          && row.instance_id === instanceId,
      );
      const instance = tables.instances.find(
        (row) =>
          row.org_id === orgId
          && row.id === instanceId
          && row.version === expectedVersion
          && row.status === 'active'
          && row.state === fromState,
      );
      if (!transition || !instance) return { meta: { changes: 0 } };
      instance.state = stringValue(toState);
      instance.status = stringValue(status);
      instance.payload_json = stringValue(payloadJson);
      instance.version += 1;
      instance.updated_at = stringValue(updatedAt);
      instance.completed_at =
        completedAt === null ? null : stringValue(completedAt);
      return { meta: { changes: 1 } };
    }

    if (/^UPDATE workflow_transitions SET metadata_json = \?/.test(statement)) {
      const [metadataJson, orgId, instanceId, transitionId] = args;
      const transition = tables.transitions.find(
        (row) =>
          row.org_id === orgId
          && row.instance_id === instanceId
          && row.id === transitionId,
      );
      if (!transition) return { meta: { changes: 0 } };
      transition.metadata_json = stringValue(metadataJson);
      return { meta: { changes: 1 } };
    }

    throw new Error(`unexpected D1 run statement: ${statement.slice(0, 100)}`);
  }

  function first(sql: string, args: unknown[]): unknown {
    const statement = compactSql(sql);
    if (
      /FROM workflow_instances WHERE org_id = \? AND id = \?/.test(statement)
    ) {
      return tables.instances.find(
        (row) => row.org_id === args[0] && row.id === args[1],
      ) ?? null;
    }
    if (
      /FROM workflow_instances WHERE org_id = \? AND idempotency_key = \?/.test(
        statement,
      )
    ) {
      return tables.instances.find(
        (row) =>
          row.org_id === args[0] && row.idempotency_key === args[1],
      ) ?? null;
    }
    if (
      /FROM workflow_transitions WHERE org_id = \? AND idempotency_key = \?/.test(
        statement,
      )
    ) {
      return tables.transitions.find(
        (row) =>
          row.org_id === args[0] && row.idempotency_key === args[1],
      ) ?? null;
    }
    if (
      /FROM workflow_transitions WHERE org_id = \? AND id = \?/.test(statement)
    ) {
      return tables.transitions.find(
        (row) => row.org_id === args[0] && row.id === args[1],
      ) ?? null;
    }
    throw new Error(`unexpected D1 first statement: ${statement.slice(0, 100)}`);
  }

  function all(sql: string, args: unknown[]): { results: unknown[] } {
    const statement = compactSql(sql);
    if (
      /FROM workflow_transitions WHERE org_id = \? AND instance_id = \?/.test(
        statement,
      )
    ) {
      return {
        results: tables.transitions
          .filter(
            (row) => row.org_id === args[0] && row.instance_id === args[1],
          )
          .sort(
            (left, right) =>
              left.created_at.localeCompare(right.created_at)
              || left.id.localeCompare(right.id),
          ),
      };
    }
    throw new Error(`unexpected D1 all statement: ${statement.slice(0, 100)}`);
  }

  function prepare(sql: string): FakeStatement {
    const statement: FakeStatement = {
      sql,
      args: [],
      bind(...args: unknown[]): FakeStatement {
        statement.args = args;
        return statement;
      },
      run() {
        return Promise.resolve(run(statement.sql, statement.args));
      },
      first<T>() {
        return Promise.resolve(first(statement.sql, statement.args) as T | null);
      },
      all<T>() {
        return Promise.resolve(
          all(statement.sql, statement.args) as { results: T[] },
        );
      },
    };
    return statement;
  }

  async function batch(
    statements: readonly FakeStatement[],
  ): Promise<Array<{ meta: { changes: number } }>> {
    const snapshot = {
      instances: structuredClone(tables.instances),
      transitions: structuredClone(tables.transitions),
    };
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      tables.instances.splice(0, tables.instances.length, ...snapshot.instances);
      tables.transitions.splice(
        0,
        tables.transitions.length,
        ...snapshot.transitions,
      );
      throw error;
    }
  }

  return {
    prepare,
    batch,
    _tables: tables,
  } as unknown as D1Database & { _tables: FakeTables };
}

async function setup(
  options: DefinitionOptions = {},
  actionLog: string[] = [],
) {
  const db = makeD1();
  const actions = {
    record: async () => {
      actionLog.push('record');
    },
    first: async () => {
      actionLog.push('first');
    },
    second: async () => {
      actionLog.push('second');
    },
    fail: async () => {
      actionLog.push('fail');
      throw new Error('fixture action failure');
    },
  };
  const engine = createWorkflowEngine(db, actions);
  const definition = makeDefinition(options);
  await ensureWorkflowSchema(db);
  return { db, engine, definition, tables: db._tables };
}

async function createFixture(
  engine: ReturnType<typeof createWorkflowEngine>,
  definition = makeDefinition(),
  orgId = 'org-alpha',
  key = 'create-fixture-1',
) {
  return engine.create(orgId, definition, {
    idempotencyKey: key,
    initialPayload: { count: 1, label: 'fixture' },
  });
}

test('runtime bootstrap is idempotent and creates two tables plus four indexes', async () => {
  const db = makeD1();
  await ensureWorkflowSchema(db);
  await ensureWorkflowSchema(db);
  assert.equal(
    db._tables.ddl.filter(
      (sql) => /^CREATE TABLE IF NOT EXISTS workflow_/.test(sql),
    ).length,
    2,
  );
  assert.equal(
    db._tables.ddl.filter(
      (sql) => /^CREATE INDEX IF NOT EXISTS idx_workflow_/.test(sql),
    ).length,
    4,
  );
});

test('valid definition creates an active instance in its initial state', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  assert.equal(created.outcome, 'created');
  assert.equal(created.instance.state, 'draft');
  assert.equal(created.instance.status, 'active');
  assert.equal(created.instance.version, 1);
});

test('definition with a missing initial state is rejected', async () => {
  const { engine } = await setup();
  const definition = {
    ...makeDefinition(),
    initial: 'missing',
  } as unknown as WorkflowDefinition<FixturePayload, FixtureState>;
  await assert.rejects(
    () => createFixture(engine, definition),
    WorkflowValidationError,
  );
});

test('definition with an unknown transition target is rejected', async () => {
  const definition = makeDefinition();
  const invalid = {
    ...definition,
    states: {
      ...definition.states,
      draft: {
        transitions: [{
          trigger: { on: 'action', actionId: 'advance' },
          to: 'missing',
        }],
      },
    },
  } as unknown as WorkflowDefinition<FixturePayload, FixtureState>;
  const { engine } = await setup();
  await assert.rejects(
    () => createFixture(engine, invalid),
    WorkflowValidationError,
  );
});

test('duplicate trigger from one state is rejected as ambiguous', async () => {
  const definition = makeDefinition();
  const invalid = {
    ...definition,
    states: {
      ...definition.states,
      draft: {
        transitions: [
          ...definition.states.draft.transitions,
          ...definition.states.draft.transitions,
        ],
      },
    },
  };
  const { engine } = await setup();
  await assert.rejects(
    () => createFixture(engine, invalid),
    WorkflowValidationError,
  );
});

test('invalid definition id and version are rejected', async () => {
  const { engine } = await setup();
  await assert.rejects(
    () => createFixture(engine, { ...makeDefinition(), id: 'Unsafe Flow' }),
    WorkflowValidationError,
  );
  await assert.rejects(
    () => createFixture(engine, { ...makeDefinition(), version: 0 }),
    WorkflowValidationError,
  );
});

test('dangerous prototype state names are rejected', async () => {
  const definition = makeDefinition();
  const states = Object.create(null) as Record<string, unknown>;
  Object.assign(states, definition.states);
  Object.defineProperty(states, '__proto__', {
    value: { transitions: [] },
    enumerable: true,
  });
  const invalid = {
    ...definition,
    states,
  } as unknown as WorkflowDefinition<FixturePayload, FixtureState>;
  const { engine } = await setup();
  await assert.rejects(
    () => createFixture(engine, invalid),
    WorkflowValidationError,
  );
});

test('empty action type is rejected during definition validation', async () => {
  const definition = makeDefinition({
    firstActions: [{ type: '' }],
  });
  const { engine } = await setup();
  await assert.rejects(
    () => createFixture(engine, definition),
    WorkflowValidationError,
  );
});

test('duplicate create idempotency key returns the same instance and one row', async () => {
  const { engine, definition, tables } = await setup();
  const first = await createFixture(engine, definition);
  const second = await createFixture(engine, definition);
  assert.equal(second.outcome, 'duplicate');
  assert.equal(second.instance.id, first.instance.id);
  assert.equal(tables.instances.length, 1);
});

test('create idempotency key cannot be reused for another definition', async () => {
  const { engine, definition } = await setup();
  await createFixture(engine, definition);
  await assert.rejects(
    () => createFixture(
      engine,
      { ...definition, id: 'another-flow' },
    ),
    (error: unknown) =>
      error instanceof WorkflowValidationError
      && error.code === 'idempotency_conflict',
  );
});

test('invalid payload is rejected without a row', async () => {
  const { engine, definition, tables } = await setup();
  await assert.rejects(
    () => engine.create('org-alpha', definition, {
      idempotencyKey: 'invalid-payload',
      initialPayload: { count: 'wrong' },
    }),
    WorkflowValidationError,
  );
  assert.equal(tables.instances.length, 0);
});

test('oversized payload is rejected before persistence', async () => {
  const { engine, definition, tables } = await setup();
  await assert.rejects(
    () => engine.create('org-alpha', definition, {
      idempotencyKey: 'oversized-payload',
      initialPayload: {
        count: 1,
        label: 'x'.repeat(WORKFLOW_LIMITS.payloadBytes),
      },
    }),
    (error: unknown) =>
      error instanceof WorkflowValidationError
      && error.code === 'payload_too_large',
  );
  assert.equal(tables.instances.length, 0);
});

test('the same creation key is allowed in different organizations', async () => {
  const { engine, definition } = await setup();
  const first = await createFixture(
    engine,
    definition,
    'org-alpha',
    'shared-create-key',
  );
  const second = await createFixture(
    engine,
    definition,
    'org-beta',
    'shared-create-key',
  );
  assert.notEqual(first.instance.id, second.instance.id);
});

test('the same transition key is allowed in different organizations', async () => {
  const { engine, definition } = await setup();
  const first = await createFixture(
    engine,
    definition,
    'org-alpha',
    'transition-org-a-create',
  );
  const second = await createFixture(
    engine,
    definition,
    'org-beta',
    'transition-org-b-create',
  );
  const input = {
    trigger: { on: 'action' as const, actionId: 'advance' },
    idempotencyKey: 'shared-transition-key',
    expectedVersion: 1,
  };
  const resultA = await engine.transition(
    'org-alpha',
    definition,
    first.instance.id,
    input,
  );
  const resultB = await engine.transition(
    'org-beta',
    definition,
    second.instance.id,
    input,
  );
  assert.equal(resultA.outcome, 'applied');
  assert.equal(resultB.outcome, 'applied');
});

test('allowed transition changes state, increments version and writes history', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  const result = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'transition-fixture-1',
      expectedVersion: 1,
    },
  );
  assert.deepEqual(
    {
      outcome: result.outcome,
      previous: result.previousState,
      current: result.currentState,
      version: result.version,
    },
    { outcome: 'applied', previous: 'draft', current: 'review', version: 2 },
  );
  const history = await engine.history('org-alpha', created.instance.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].trigger, 'action:advance');
});

test('duplicate transition does not change version or execute actions twice', async () => {
  const actionLog: string[] = [];
  const { engine, definition } = await setup(
    { firstActions: [{ type: 'record' }] },
    actionLog,
  );
  const created = await createFixture(engine, definition);
  const input = {
    trigger: { on: 'action' as const, actionId: 'advance' },
    idempotencyKey: 'transition-duplicate',
    expectedVersion: 1,
  };
  await engine.transition('org-alpha', definition, created.instance.id, input);
  const duplicate = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    input,
  );
  assert.equal(duplicate.outcome, 'duplicate');
  assert.deepEqual(actionLog, ['record']);
  assert.equal(
    (await engine.get('org-alpha', created.instance.id))?.version,
    2,
  );
  assert.equal(
    (await engine.history('org-alpha', created.instance.id)).length,
    1,
  );
});

test('invalid trigger is rejected without a state change', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'missing' },
      idempotencyKey: 'invalid-trigger',
      expectedVersion: 1,
    }),
    WorkflowTransitionNotAllowedError,
  );
  assert.equal(
    (await engine.get('org-alpha', created.instance.id))?.state,
    'draft',
  );
});

test('stale expected version is rejected and never silently retried', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.transition('org-alpha', definition, created.instance.id, {
    trigger: { on: 'action', actionId: 'advance' },
    idempotencyKey: 'current-transition',
    expectedVersion: 1,
  });
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'event', eventType: 'fixture.finish' },
      idempotencyKey: 'stale-transition',
      expectedVersion: 1,
    }),
    WorkflowVersionConflictError,
  );
});

test('guard true receives safe context and allows the transition', async () => {
  let observed = false;
  const guard: WorkflowGuard<FixturePayload> = (context, payload, trigger) => {
    observed = context.orgId === 'org-alpha'
      && payload.count === 1
      && trigger.data === 'allow';
    return observed;
  };
  const { engine, definition } = await setup({ guard });
  const created = await createFixture(engine, definition);
  const result = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'guard-true',
      expectedVersion: 1,
      triggerData: 'allow',
    },
  );
  assert.equal(result.outcome, 'applied');
  assert.equal(observed, true);
});

test('guard false is a controlled rejection', async () => {
  const { engine, definition } = await setup({ guard: () => false });
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'guard-false',
      expectedVersion: 1,
    }),
    WorkflowGuardRejectedError,
  );
});

test('guard exception becomes a content-free controlled error', async () => {
  const privateFixture = 'guard-private-fixture';
  const { engine, definition } = await setup({
    guard: () => {
      throw new Error(privateFixture);
    },
  });
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'guard-error',
      expectedVersion: 1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowGuardError);
      assert.doesNotMatch(error.message, new RegExp(privateFixture));
      return true;
    },
  );
});

test('unknown action fails closed before durable transition', async () => {
  const { db } = await setup();
  const definition = makeDefinition({
    firstActions: [{ type: 'not-registered' }],
  });
  const engine = createWorkflowEngine(db, {});
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'unknown-action',
      expectedVersion: 1,
    }),
    WorkflowActionError,
  );
  assert.equal(
    (await engine.get('org-alpha', created.instance.id))?.version,
    1,
  );
});

test('actions execute sequentially in declaration order', async () => {
  const actionLog: string[] = [];
  const { engine, definition } = await setup(
    {
      firstActions: [
        { type: 'first' },
        { type: 'second' },
      ],
    },
    actionLog,
  );
  const created = await createFixture(engine, definition);
  const result = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'ordered-actions',
      expectedVersion: 1,
    },
  );
  assert.deepEqual(actionLog, ['first', 'second']);
  assert.deepEqual(
    result.actionResults.map((item) => item.status),
    ['succeeded', 'succeeded'],
  );
});

test('action failure keeps durable transition and records only safe status', async () => {
  const actionLog: string[] = [];
  const { engine, definition, tables } = await setup(
    {
      firstActions: [
        { type: 'first', input: { fixture: 'transient-action-value' } },
        { type: 'fail' },
        { type: 'second' },
      ],
    },
    actionLog,
  );
  const created = await createFixture(engine, definition);
  const result = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'failed-action',
      expectedVersion: 1,
      triggerData: { fixture: 'transient-trigger-value' },
    },
  );
  assert.equal(result.currentState, 'review');
  assert.deepEqual(actionLog, ['first', 'fail']);
  assert.equal(result.actionResults.at(-1)?.status, 'failed');
  assert.doesNotMatch(tables.transitions[0].metadata_json, /transient-/);
});

test('terminal state completes the instance and sets completedAt', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.transition('org-alpha', definition, created.instance.id, {
    trigger: { on: 'action', actionId: 'advance' },
    idempotencyKey: 'to-review',
    expectedVersion: 1,
  });
  const result = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    {
      trigger: { on: 'event', eventType: 'fixture.finish' },
      idempotencyKey: 'to-terminal',
      expectedVersion: 2,
    },
  );
  const stored = await engine.get('org-alpha', created.instance.id);
  assert.equal(result.status, 'completed');
  assert.equal(stored?.status, 'completed');
  assert.ok(stored?.completedAt);
});

test('new transition after completion is rejected', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.transition('org-alpha', definition, created.instance.id, {
    trigger: { on: 'action', actionId: 'advance' },
    idempotencyKey: 'complete-step-one',
    expectedVersion: 1,
  });
  await engine.transition('org-alpha', definition, created.instance.id, {
    trigger: { on: 'event', eventType: 'fixture.finish' },
    idempotencyKey: 'complete-step-two',
    expectedVersion: 2,
  });
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'event', eventType: 'fixture.finish' },
      idempotencyKey: 'after-completion',
      expectedVersion: 3,
    }),
    WorkflowAlreadyFinishedError,
  );
});

test('duplicate key from the terminal transition still returns duplicate', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.transition('org-alpha', definition, created.instance.id, {
    trigger: { on: 'action', actionId: 'advance' },
    idempotencyKey: 'terminal-setup',
    expectedVersion: 1,
  });
  const input = {
    trigger: { on: 'event' as const, eventType: 'fixture.finish' },
    idempotencyKey: 'terminal-duplicate',
    expectedVersion: 2,
  };
  await engine.transition('org-alpha', definition, created.instance.id, input);
  const duplicate = await engine.transition(
    'org-alpha',
    definition,
    created.instance.id,
    input,
  );
  assert.equal(duplicate.outcome, 'duplicate');
  assert.equal(duplicate.status, 'completed');
});

test('cancel marks only an active instance and preserves an audit row', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  const cancelled = await engine.cancel('org-alpha', created.instance.id);
  assert.equal(cancelled.outcome, 'cancelled');
  assert.equal(cancelled.instance.status, 'cancelled');
  assert.equal(cancelled.instance.version, 2);
  const history = await engine.history('org-alpha', created.instance.id);
  assert.equal(history[0].trigger, 'system:cancel');
});

test('duplicate cancel is safe and does not increment version twice', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.cancel('org-alpha', created.instance.id);
  const duplicate = await engine.cancel('org-alpha', created.instance.id);
  assert.equal(duplicate.outcome, 'already_cancelled');
  assert.equal(duplicate.instance.version, 2);
});

test('transition after cancel is rejected', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.cancel('org-alpha', created.instance.id);
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'after-cancel',
      expectedVersion: 2,
    }),
    WorkflowTransitionNotAllowedError,
  );
});

test('org B cannot read an org A instance', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  assert.equal(await engine.get('org-beta', created.instance.id), null);
});

test('org B cannot transition an org A instance', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition('org-beta', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'foreign-transition',
      expectedVersion: 1,
    }),
    WorkflowNotFoundError,
  );
});

test('org B cannot cancel an org A instance', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.cancel('org-beta', created.instance.id),
    WorkflowNotFoundError,
  );
});

test('org B cannot read org A transition history', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await engine.transition('org-alpha', definition, created.instance.id, {
    trigger: { on: 'action', actionId: 'advance' },
    idempotencyKey: 'history-tenant',
    expectedVersion: 1,
  });
  assert.deepEqual(await engine.history('org-beta', created.instance.id), []);
});

test('new engine object reads and advances the persisted workflow', async () => {
  const { db, engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  const restarted = createWorkflowEngine(db);
  assert.equal(
    (await restarted.get('org-alpha', created.instance.id))?.state,
    'draft',
  );
  const result = await restarted.transition(
    'org-alpha',
    definition,
    created.instance.id,
    {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'after-restart',
      expectedVersion: 1,
    },
  );
  assert.equal(result.currentState, 'review');
});

test('payload remains validated and intact across isolate restart', async () => {
  const { db, engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  const restarted = createWorkflowEngine(db);
  assert.deepEqual(
    (await restarted.get('org-alpha', created.instance.id))?.payload,
    { count: 1, label: 'fixture' },
  );
});

test('invalid stored JSON fails closed', async () => {
  const { engine, definition, tables } = await setup();
  const created = await createFixture(engine, definition);
  tables.instances[0].payload_json = '{invalid';
  await assert.rejects(
    () => engine.get('org-alpha', created.instance.id),
    WorkflowPersistenceError,
  );
});

test('definition mismatch cannot advance a stored instance', async () => {
  const { engine, definition } = await setup();
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition(
      'org-alpha',
      { ...definition, version: 2 },
      created.instance.id,
      {
        trigger: { on: 'action', actionId: 'advance' },
        idempotencyKey: 'definition-mismatch',
        expectedVersion: 1,
      },
    ),
    (error: unknown) =>
      error instanceof WorkflowValidationError
      && error.code === 'definition_mismatch',
  );
});

test('invalid transient trigger data is rejected without persistence', async () => {
  const { engine, definition, tables } = await setup();
  const created = await createFixture(engine, definition);
  await assert.rejects(
    () => engine.transition('org-alpha', definition, created.instance.id, {
      trigger: { on: 'action', actionId: 'advance' },
      idempotencyKey: 'invalid-trigger-data',
      expectedVersion: 1,
      triggerData: () => 'unsupported',
    }),
    WorkflowValidationError,
  );
  assert.equal(tables.transitions.length, 0);
});
