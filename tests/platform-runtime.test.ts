import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  clearAgentsForTests,
  getAgent,
  listAgents,
  registerAgent,
  requireAgent,
} from '../functions/agents/registry';
import { demoAgentManifest } from '../functions/agents/demo';
import {
  eraseTool,
  type AgentCapability,
  type AgentManifest,
  type DeterministicRule,
  type FactSheet,
  type KnowledgeServicePort,
  type RuntimeServices,
  type RuntimeTurnInput,
  type Tool,
  type ToolContext,
  type WorkflowServicePort,
} from '../functions/platform/contracts';
import {
  AiPolicyResolver,
  createAiFacade,
} from '../functions/platform/ai';
import {
  AgentGroundingError,
  AgentManifestValidationError,
  AgentNotFoundError,
  AgentRuntimeRejectedError,
  AgentToolExecutionError,
  AgentToolInputError,
  AgentToolNotFoundError,
  DuplicateAgentIdError,
  createAgentRegistry,
  createAgentRuntime,
  executeManifestTool,
  groundResponse,
  validateAgentManifest,
} from '../functions/platform/runtime';
import {
  checkBoundaries,
  scanTree,
} from '../scripts/check-agent-boundaries';

const ROOT = path.resolve(import.meta.dirname, '..');

interface ValueInput {
  value: string;
}

interface ValueOutput {
  value: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valueTool(
  options: {
    name?: string;
    run?: Tool<ValueInput, ValueOutput>['run'];
    facts?: Tool<ValueInput, ValueOutput>['facts'];
    capture?: (context: ToolContext) => void;
  } = {},
) {
  const name = options.name ?? 'demo.value';
  const tool: Tool<ValueInput, ValueOutput> = {
    name,
    description: 'Return one validated value for runtime tests.',
    inputSchema: {
      parse(value: unknown): ValueInput {
        if (
          !isPlainObject(value)
          || Object.keys(value).length !== 1
          || typeof value.value !== 'string'
          || value.value.length === 0
          || value.value.length > 128
        ) {
          throw new Error('invalid');
        }
        return { value: value.value };
      },
    },
    async run(context, input) {
      options.capture?.(context);
      if (options.run) return options.run(context, input);
      return { value: input.value };
    },
    facts: options.facts ?? ((output) => ({
      toolName: name,
      values: { 'demo.value.text': output.value },
    })),
    response: {
      text: {
        ru: '{{demo.value.text}}',
        uz: '{{demo.value.text}}',
      },
    },
  };
  return eraseTool(tool);
}

function manifest(
  overrides: Partial<AgentManifest> = {},
): AgentManifest {
  return {
    id: 'runtime-test',
    version: '1.0.0',
    locales: ['ru', 'uz'],
    capabilities: ['knowledge.query'],
    tools: [valueTool()],
    deterministicRules: [],
    policies: { grounding: 'strict', aiSelection: 'disabled' },
    ...overrides,
  };
}

class FakeKnowledge implements KnowledgeServicePort {
  readonly calls: Array<{ orgId: string; agentId: string; query: string }> = [];

  async searchItems(
    orgId: string,
    input: {
      agentId: string;
      kind: string;
      query: string;
      limit?: number;
    },
  ) {
    this.calls.push({
      orgId,
      agentId: input.agentId,
      query: input.query,
    });
    const matches = orgId === 'org-a'
      && input.agentId === 'demo'
      && input.kind === 'demo-item'
      && input.query.toLowerCase().includes('alpha');
    return matches
      ? [{
          item: {
            id: 'demo-item-alpha',
            status: 'active',
            payload: { name: 'Alpha Service', status: 'available' },
          },
          score: 4_000,
          matchedTokens: 1,
        }]
      : [];
  }
}

function services(knowledge = new FakeKnowledge()): RuntimeServices {
  return { knowledge };
}

function turn(
  text: string,
  overrides: Partial<RuntimeTurnInput> = {},
): RuntimeTurnInput {
  return {
    requestId: 'request-1',
    orgId: 'org-a',
    agentId: 'demo',
    locale: 'ru',
    message: { kind: 'text', text },
    ...overrides,
  };
}

function aiConfiguration(
  result: unknown,
  onCall?: () => void,
  failure?: Error,
) {
  const facade = createAiFacade({
    drivers: [{
      id: 'runtime-fake',
      async structured() {
        onCall?.();
        if (failure) throw failure;
        return { text: JSON.stringify(result) };
      },
    }],
    policy: new AiPolicyResolver([{
      task: 'intent',
      routes: [{ driver: 'runtime-fake' }],
      maxAttempts: 1,
    }]),
  });
  return {
    facade,
    policy: { task: 'intent' as const },
  };
}

test('valid manifest passes runtime validation', () => {
  assert.equal(validateAgentManifest(demoAgentManifest), demoAgentManifest);
});

test('invalid manifest id and version are rejected', () => {
  assert.throws(
    () => validateAgentManifest(manifest({ id: 'Unsafe ID' })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'invalid_id',
  );
  assert.throws(
    () => validateAgentManifest(manifest({ version: 'v1' })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'invalid_version',
  );
});

test('duplicate locale is rejected', () => {
  assert.throws(
    () => validateAgentManifest(manifest({ locales: ['ru', 'ru'] })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'duplicate_locale',
  );
});

test('duplicate capability is rejected', () => {
  assert.throws(
    () => validateAgentManifest(manifest({
      capabilities: ['knowledge.query', 'knowledge.query'],
    })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'duplicate_capability',
  );
});

test('unknown capability is rejected at runtime', () => {
  assert.throws(
    () => validateAgentManifest(manifest({
      capabilities: ['root.shell'] as unknown as readonly AgentCapability[],
    })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'invalid_capability',
  );
});

test('duplicate tool is rejected', () => {
  const tool = valueTool();
  assert.throws(
    () => validateAgentManifest(manifest({ tools: [tool, tool] })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'duplicate_tool',
  );
});

test('missing grounding policy is rejected', () => {
  const invalid = {
    ...manifest(),
    policies: { aiSelection: 'disabled' },
  } as unknown as AgentManifest;
  assert.throws(
    () => validateAgentManifest(invalid),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'invalid_policy',
  );
});

test('manifest cannot carry or override tenant context', () => {
  const invalid = {
    ...manifest(),
    orgId: 'org-b',
  } as unknown as AgentManifest;
  assert.throws(
    () => validateAgentManifest(invalid),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'invalid_manifest',
  );
});

test('duplicate deterministic priority is rejected as ambiguous', () => {
  const rule = (id: string): DeterministicRule => ({
    id,
    priority: 1,
    match: () => false,
    async execute() {
      return { kind: 'handoff', reasonCode: 'no_route' };
    },
  });
  assert.throws(
    () => validateAgentManifest(manifest({
      deterministicRules: [rule('one'), rule('two')],
    })),
    (error: unknown) =>
      error instanceof AgentManifestValidationError
      && error.code === 'duplicate_priority',
  );
});

test('non-array manifest collections fail with controlled validation errors', () => {
  const cases: Array<{
    value: AgentManifest;
    code: string;
  }> = [
    {
      value: manifest({
        deterministicRules: {} as unknown as readonly DeterministicRule[],
      }),
      code: 'invalid_rule',
    },
    {
      value: manifest({
        workflows: {} as AgentManifest['workflows'],
      }),
      code: 'invalid_workflow',
    },
    {
      value: manifest({
        knowledgeKinds: {} as AgentManifest['knowledgeKinds'],
      }),
      code: 'invalid_knowledge_kind',
    },
  ];

  for (const item of cases) {
    assert.throws(
      () => validateAgentManifest(item.value),
      (error: unknown) =>
        error instanceof AgentManifestValidationError
        && error.code === item.code,
    );
  }
});

test('registry registers and gets a known manifest', () => {
  const registry = createAgentRegistry();
  registry.register(manifest());
  assert.equal(registry.get('runtime-test').version, '1.0.0');
});

test('registry duplicate is controlled', () => {
  const registry = createAgentRegistry([manifest()]);
  assert.throws(() => registry.register(manifest()), DuplicateAgentIdError);
});

test('registry unknown agent is controlled and content-free', () => {
  const registry = createAgentRegistry();
  assert.throws(
    () => registry.get('private-agent-value'),
    (error: unknown) =>
      error instanceof AgentNotFoundError
      && !error.message.includes('private-agent-value'),
  );
});

test('registry list is deterministic by agent id', () => {
  const registry = createAgentRegistry([
    manifest({ id: 'zeta' }),
    manifest({ id: 'alpha' }),
  ]);
  assert.deepEqual(registry.list().map((item) => item.id), ['alpha', 'zeta']);
});

test('production registry remains the single explicit empty registration point', () => {
  clearAgentsForTests();
  assert.deepEqual(listAgents(), []);
  registerAgent(manifest());
  assert.equal(getAgent('runtime-test')?.id, 'runtime-test');
  assert.equal(requireAgent('runtime-test').id, 'runtime-test');
  assert.throws(() => requireAgent('missing'), AgentNotFoundError);
  clearAgentsForTests();
});

test('valid tool input executes and extracts explicit Facts', async () => {
  const toolManifest = manifest();
  const result = await executeManifestTool(
    toolManifest,
    'demo.value',
    { value: 'hello' },
    {
      org: {
        orgId: 'org-a',
        requestId: 'request-tool',
        locale: 'ru',
      },
      requestId: 'request-tool',
      locale: 'ru',
      services: services(),
    },
  );
  assert.deepEqual(result.facts, {
    toolName: 'demo.value',
    values: { 'demo.value.text': 'hello' },
  });
});

test('invalid tool input fails closed without its value', async () => {
  await assert.rejects(
    executeManifestTool(
      manifest(),
      'demo.value',
      { wrong: 'private-value' },
      {
        org: { orgId: 'org-a', requestId: 'request-2', locale: 'ru' },
        requestId: 'request-2',
        locale: 'ru',
        services: services(),
      },
    ),
    (error: unknown) =>
      error instanceof AgentToolInputError
      && !error.message.includes('private-value'),
  );
});

test('unknown manifest tool fails closed', async () => {
  await assert.rejects(
    executeManifestTool(
      manifest(),
      'unknown.tool',
      {},
      {
        org: { orgId: 'org-a', requestId: 'request-3', locale: 'ru' },
        requestId: 'request-3',
        locale: 'ru',
        services: services(),
      },
    ),
    AgentToolNotFoundError,
  );
});

test('tool exception is normalized without raw input or upstream error', async () => {
  const failing = valueTool({
    async run() {
      throw new Error('upstream-private-value');
    },
  });
  await assert.rejects(
    executeManifestTool(
      manifest({ tools: [failing] }),
      'demo.value',
      { value: 'raw-private-value' },
      {
        org: { orgId: 'org-a', requestId: 'request-4', locale: 'ru' },
        requestId: 'request-4',
        locale: 'ru',
        services: services(),
      },
    ),
    (error: unknown) =>
      error instanceof AgentToolExecutionError
      && !error.message.includes('raw-private-value')
      && !error.message.includes('upstream-private-value'),
  );
});

test('invalid Facts are rejected instead of becoming arbitrary blobs', async () => {
  const invalidFacts = valueTool({
    facts: () => ({
      toolName: 'demo.value',
      values: {
        'demo.value.payload': { unsafe: true },
      } as unknown as FactSheet['values'],
    }),
  });
  await assert.rejects(
    executeManifestTool(
      manifest({ tools: [invalidFacts] }),
      'demo.value',
      { value: 'hello' },
      {
        org: { orgId: 'org-a', requestId: 'request-5', locale: 'ru' },
        requestId: 'request-5',
        locale: 'ru',
        services: services(),
      },
    ),
    AgentGroundingError,
  );
});

test('AI or caller arguments cannot override orgId, including nested keys', async () => {
  await assert.rejects(
    executeManifestTool(
      manifest(),
      'demo.value',
      { value: 'hello', nested: { orgId: 'org-b' } },
      {
        org: { orgId: 'org-a', requestId: 'request-6', locale: 'ru' },
        requestId: 'request-6',
        locale: 'ru',
        services: services(),
      },
    ),
    AgentToolInputError,
  );
});

test('tool receives only minimal context with the runtime tenant source', async () => {
  let captured: ToolContext | null = null;
  const tool = valueTool({ capture: (context) => { captured = context; } });
  await executeManifestTool(
    manifest({ tools: [tool] }),
    'demo.value',
    { value: 'hello' },
    {
      org: { orgId: 'org-a', requestId: 'request-7', locale: 'uz' },
      requestId: 'request-7',
      locale: 'uz',
      services: services(),
    },
  );
  assert.ok(captured);
  assert.deepEqual(Object.keys(captured).sort(), [
    'locale',
    'org',
    'requestId',
    'services',
  ]);
  assert.equal(captured.org.orgId, 'org-a');
  assert.equal('db' in captured, false);
  assert.equal('channel' in captured, false);
  assert.equal('secrets' in captured, false);
});

test('supported number passes grounding', () => {
  assert.deepEqual(
    groundResponse(
      {
        messages: [{ text: 'Price: 1200' }],
        claims: [{ key: 'item.price.amount', value: 1_200 }],
      },
      [{
        toolName: 'catalog.lookup',
        values: { 'item.price.amount': 1_200 },
      }],
    ),
    { status: 'passed' },
  );
});

test('unsupported number is rejected', () => {
  assert.deepEqual(
    groundResponse(
      { messages: [{ text: 'Price: 9999' }] },
      [{
        toolName: 'catalog.lookup',
        values: { 'item.price.amount': 1_200 },
      }],
    ),
    { status: 'failed', reasonCode: 'unsupported_number' },
  );
});

test('supported status claim passes grounding', () => {
  assert.deepEqual(
    groundResponse(
      {
        messages: [{ text: 'Status: available' }],
        claims: [{ key: 'item.stock.status', value: 'available' }],
      },
      [{
        toolName: 'catalog.lookup',
        values: { 'item.stock.status': 'available' },
      }],
    ),
    { status: 'passed' },
  );
});

test('unsupported exact status claim is rejected', () => {
  assert.deepEqual(
    groundResponse(
      {
        messages: [{ text: 'Status: unavailable' }],
        claims: [{ key: 'item.stock.status', value: 'unavailable' }],
      },
      [{
        toolName: 'catalog.lookup',
        values: { 'item.stock.status': 'available' },
      }],
    ),
    { status: 'failed', reasonCode: 'unsupported_claim' },
  );
});

test('exact ids use the same explicit claim grounding', () => {
  assert.deepEqual(
    groundResponse(
      {
        messages: [{ text: 'Reference: item-alpha' }],
        claims: [{ key: 'item.record.id', value: 'item-alpha' }],
      },
      [{
        toolName: 'catalog.lookup',
        values: { 'item.record.id': 'item-alpha' },
      }],
    ),
    { status: 'passed' },
  );
  assert.deepEqual(
    groundResponse(
      {
        messages: [{ text: 'Reference: item-beta' }],
        claims: [{ key: 'item.record.id', value: 'item-beta' }],
      },
      [{
        toolName: 'catalog.lookup',
        values: { 'item.record.id': 'item-alpha' },
      }],
    ),
    { status: 'failed', reasonCode: 'unsupported_claim' },
  );
});

test('grounding failure prevents outbound answer', async () => {
  const unsupportedRule: DeterministicRule = {
    id: 'unsupported-number',
    priority: 1,
    match: () => true,
    async execute() {
      return {
        kind: 'answer',
        response: { messages: [{ text: 'Invented: 777' }] },
        facts: [],
      };
    },
  };
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      deterministicRules: [unsupportedRule],
    })]),
    services: services(),
  });
  const result = await runtime.run(turn('hello', { agentId: 'runtime-test' }));
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.grounding, {
    status: 'failed',
    reasonCode: 'unsupported_number',
  });
});

test('deterministic rule runs before AI', async () => {
  let aiCalls = 0;
  const deterministic: DeterministicRule = {
    id: 'first',
    priority: 1,
    match: () => true,
    async execute() {
      return {
        kind: 'answer',
        response: { messages: [{ text: 'deterministic' }] },
      };
    },
  };
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      deterministicRules: [deterministic],
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration(
      { tool: 'demo.value', arguments: { value: 'ai' } },
      () => { aiCalls += 1; },
    ),
  });
  const result = await runtime.run(turn('hello', { agentId: 'runtime-test' }));
  assert.equal(result.messages[0]?.text, 'deterministic');
  assert.equal(aiCalls, 0);
});

test('first matching rule is predictable by unique priority', async () => {
  const rule = (id: string, priority: number): DeterministicRule => ({
    id,
    priority,
    match: () => true,
    async execute() {
      return {
        kind: 'answer',
        response: { messages: [{ text: id }] },
      };
    },
  });
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      deterministicRules: [rule('later', 20), rule('earlier', 10)],
    })]),
    services: services(),
  });
  const result = await runtime.run(turn('hello', { agentId: 'runtime-test' }));
  assert.equal(result.messages[0]?.text, 'earlier');
});

test('no deterministic match uses one closed-list AI selection', async () => {
  let calls = 0;
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration(
      { tool: 'demo.value', arguments: { value: 'selected' } },
      () => { calls += 1; },
    ),
  });
  const result = await runtime.run(turn('choose', { agentId: 'runtime-test' }));
  assert.equal(result.status, 'answered');
  assert.equal(result.messages[0]?.text, 'selected');
  assert.equal(calls, 1);
});

test('AI selector cannot choose a tool outside the manifest', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration({ tool: 'root.shell', arguments: {} }),
  });
  const result = await runtime.run(turn('choose', { agentId: 'runtime-test' }));
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.messages, []);
  assert.equal(result.toolExecutions[0]?.status, 'failed');
});

test('AI-selected arguments still pass the tool runtime schema', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration({
      tool: 'demo.value',
      arguments: { unexpected: 'private-value' },
    }),
  });
  const result = await runtime.run(turn('choose', { agentId: 'runtime-test' }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.toolExecutions[0]?.code, 'input_rejected');
  assert.deepEqual(result.messages, []);
});

test('AI arguments cannot substitute tenant context', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration({
      tool: 'demo.value',
      arguments: { value: 'hello', orgId: 'org-b' },
    }),
  });
  const result = await runtime.run(turn('choose', { agentId: 'runtime-test' }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.toolExecutions[0]?.code, 'input_rejected');
});

test('AI disabled policy produces a controlled fallback', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest()]),
    services: services(),
  });
  const result = await runtime.run(turn('unknown', { agentId: 'runtime-test' }));
  assert.equal(result.status, 'handoff_required');
  assert.equal(result.reasonCode, 'no_route');
  assert.deepEqual(result.messages, []);
});

test('AI failure becomes a controlled content-free fallback', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration(
      null,
      undefined,
      new Error('provider leaked private prompt'),
    ),
  });
  const result = await runtime.run(
    turn('raw private user text', { agentId: 'runtime-test' }),
  );
  assert.equal(result.status, 'handoff_required');
  assert.equal(result.reasonCode, 'ai_unavailable');
  assert.deepEqual(result.messages, []);
});

test('AI null selection produces a controlled no-route fallback', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([manifest({
      policies: { grounding: 'strict', aiSelection: 'closed-list' },
    })]),
    services: services(),
    ai: aiConfiguration({ tool: null, arguments: null }),
  });
  const result = await runtime.run(turn('unknown', {
    agentId: 'runtime-test',
  }));
  assert.equal(result.status, 'handoff_required');
  assert.equal(result.reasonCode, 'no_route');
});

test('active workflow port runs before deterministic rules', async () => {
  let workflowCalls = 0;
  const workflow: WorkflowServicePort = {
    async handleActive(org, active) {
      workflowCalls += 1;
      assert.equal(org.orgId, 'org-a');
      assert.equal(active.instanceId, 'workflow-instance-1');
      return {
        kind: 'answer',
        response: { messages: [{ text: 'workflow-first' }] },
      };
    },
  };
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: { knowledge: new FakeKnowledge(), workflow },
  });
  const result = await runtime.run(turn('echo: should-not-run', {
    activeWorkflow: {
      instanceId: 'workflow-instance-1',
      expectedVersion: 1,
      idempotencyKey: 'workflow-turn-1',
      trigger: { on: 'intent', intent: 'continue' },
    },
  }));
  assert.equal(result.messages[0]?.text, 'workflow-first');
  assert.equal(workflowCalls, 1);
});

test('active workflow input fails closed when no workflow port is injected', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(),
  });
  const result = await runtime.run(turn('echo: hello', {
    activeWorkflow: {
      instanceId: 'workflow-instance-1',
      expectedVersion: 1,
      idempotencyKey: 'workflow-turn-1',
      trigger: { on: 'intent', intent: 'continue' },
    },
  }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.reasonCode, 'workflow_unavailable');
});

test('demo echo returns the deterministic value without AI', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(),
  });
  const result = await runtime.run(turn('echo: hello'));
  assert.equal(result.status, 'answered');
  assert.equal(result.messages[0]?.text, 'hello');
  assert.deepEqual(result.facts, []);
});

test('demo knowledge question works in Russian', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(),
  });
  const result = await runtime.run(turn('Найди Alpha'));
  assert.equal(result.status, 'answered');
  assert.equal(
    result.messages[0]?.text,
    'Найдено: Alpha Service. Статус: available.',
  );
  assert.equal(result.facts[0]?.values['knowledge.item.name'], 'Alpha Service');
});

test('demo knowledge question works in Uzbek Latin', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(),
  });
  const result = await runtime.run(turn('Alpha haqida', { locale: 'uz' }));
  assert.equal(result.status, 'answered');
  assert.equal(
    result.messages[0]?.text,
    'Topildi: Alpha Service. Holat: available.',
  );
});

test('demo knowledge question works with mixed RU and Uzbek Latin', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(),
  });
  const result = await runtime.run(turn('Найди Alpha haqida'));
  assert.equal(result.status, 'answered');
  assert.equal(result.toolExecutions[0]?.toolName, 'knowledge.lookup');
});

test('org A knowledge is visible and tool receives exact org A', async () => {
  const knowledge = new FakeKnowledge();
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(knowledge),
  });
  const result = await runtime.run(turn('Alpha'));
  assert.equal(result.status, 'answered');
  assert.equal(knowledge.calls[0]?.orgId, 'org-a');
});

test('org B cannot see org A knowledge and existence is not disclosed', async () => {
  const knowledge = new FakeKnowledge();
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(knowledge),
  });
  const result = await runtime.run(turn('Alpha', { orgId: 'org-b' }));
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.facts, []);
  assert.equal(knowledge.calls[0]?.orgId, 'org-b');
});

test('a new runtime instance works with the same persistent service port', async () => {
  const knowledge = new FakeKnowledge();
  const registry = createAgentRegistry([demoAgentManifest]);
  const first = createAgentRuntime({
    registry,
    services: services(knowledge),
  });
  assert.equal((await first.run(turn('Alpha'))).status, 'answered');
  const restarted = createAgentRuntime({
    registry,
    services: services(knowledge),
  });
  assert.equal((await restarted.run(turn('Alpha'))).status, 'answered');
  assert.equal(knowledge.calls.length, 2);
});

test('runtime input rejects provider metadata and error omits raw inbound', async () => {
  const runtime = createAgentRuntime({
    registry: createAgentRegistry([demoAgentManifest]),
    services: services(),
  });
  await assert.rejects(
    runtime.run({
      ...turn('raw-private-message'),
      chat_id: 'provider-specific',
    }),
    (error: unknown) =>
      error instanceof AgentRuntimeRejectedError
      && !error.message.includes('raw-private-message')
      && !error.message.includes('provider-specific'),
  );
});

test('runtime and demo source respect boundaries and production registry has no demo import', () => {
  assert.deepEqual(checkBoundaries(scanTree(ROOT)), []);
  const registrySource = fs.readFileSync(
    path.join(ROOT, 'functions/agents/registry.ts'),
    'utf8',
  );
  assert.doesNotMatch(registrySource, /agents[\\/]demo|demoAgentManifest/);
  const runtimeFiles = fs.readdirSync(
    path.join(ROOT, 'functions/platform/runtime'),
  );
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(
      path.join(ROOT, 'functions/platform/runtime', file),
      'utf8',
    );
    assert.doesNotMatch(source, /functions[\\/](agents|channels|lib)/);
    assert.doesNotMatch(source, /onRequest(?:Get|Post|Put|Delete|Patch)?/);
  }
});

test('runtime source has no logging or event payload path for raw turns', () => {
  const runtimeDir = path.join(ROOT, 'functions/platform/runtime');
  const source = fs.readdirSync(runtimeDir)
    .map((file) => fs.readFileSync(path.join(runtimeDir, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /\bconsole\.(?:log|error|warn)\b/);
  assert.doesNotMatch(source, /events?\.publish|events?\.emit/);
});
