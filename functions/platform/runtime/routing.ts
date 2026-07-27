import type {
  AgentManifest,
  DeterministicRule,
  RuntimeActiveWorkflow,
  RuntimeMessage,
  RuntimeRuleContext,
  RuntimeStepResult,
  RuntimeTurnInput,
} from '../contracts';
import { workflowTriggerKey } from '../workflow';
import {
  AgentRoutingError,
  AgentRuntimeRejectedError,
} from './errors';
import type {
  AiToolSelection,
  RuntimeAiConfiguration,
} from './types';

const INPUT_KEYS = new Set([
  'requestId',
  'orgId',
  'agentId',
  'identityId',
  'contactId',
  'locale',
  'message',
  'conversationRef',
  'activeWorkflow',
]);
const WORKFLOW_KEYS = new Set([
  'instanceId',
  'expectedVersion',
  'idempotencyKey',
  'trigger',
]);
const SAFE_AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9._-]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function requireBoundedString(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== 'string') throw new AgentRuntimeRejectedError();
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > maxLength
    || [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new AgentRuntimeRejectedError();
  }
  return normalized;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  return value === undefined ? undefined : requireBoundedString(value, maxLength);
}

function validateMessage(value: unknown): RuntimeMessage {
  if (!isPlainObject(value)) throw new AgentRuntimeRejectedError();
  if (
    value.kind === 'text'
    && exactKeys(value, new Set(['kind', 'text']))
  ) {
    return { kind: 'text', text: requireBoundedString(value.text, 4_096) };
  }
  if (
    value.kind === 'action'
    && exactKeys(value, new Set(['kind', 'actionId']))
  ) {
    const actionId = requireBoundedString(value.actionId, 120);
    if (!SAFE_CODE.test(actionId)) throw new AgentRuntimeRejectedError();
    return { kind: 'action', actionId };
  }
  throw new AgentRuntimeRejectedError();
}

function validateActiveWorkflow(value: unknown): RuntimeActiveWorkflow | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || !exactKeys(value, WORKFLOW_KEYS)) {
    throw new AgentRuntimeRejectedError();
  }
  if (
    !Number.isInteger(value.expectedVersion)
    || Number(value.expectedVersion) < 1
  ) {
    throw new AgentRuntimeRejectedError();
  }
  try {
    workflowTriggerKey(value.trigger as RuntimeActiveWorkflow['trigger']);
  } catch {
    throw new AgentRuntimeRejectedError();
  }
  return {
    instanceId: requireBoundedString(value.instanceId, 120),
    expectedVersion: Number(value.expectedVersion),
    idempotencyKey: requireBoundedString(value.idempotencyKey, 240),
    trigger: value.trigger as RuntimeActiveWorkflow['trigger'],
  };
}

export function validateRuntimeTurnInput(value: unknown): RuntimeTurnInput {
  if (!isPlainObject(value) || !exactKeys(value, INPUT_KEYS)) {
    throw new AgentRuntimeRejectedError();
  }
  const agentId = requireBoundedString(value.agentId, 64);
  if (!SAFE_AGENT_ID.test(agentId)) throw new AgentRuntimeRejectedError();
  if (value.locale !== 'ru' && value.locale !== 'uz') {
    throw new AgentRuntimeRejectedError();
  }
  return {
    requestId: requireBoundedString(value.requestId, 120),
    orgId: requireBoundedString(value.orgId, 120),
    agentId,
    ...(value.identityId === undefined
      ? {}
      : { identityId: optionalString(value.identityId, 120) }),
    ...(value.contactId === undefined
      ? {}
      : { contactId: optionalString(value.contactId, 120) }),
    locale: value.locale,
    message: validateMessage(value.message),
    ...(value.conversationRef === undefined
      ? {}
      : { conversationRef: optionalString(value.conversationRef, 240) }),
    ...(value.activeWorkflow === undefined
      ? {}
      : { activeWorkflow: validateActiveWorkflow(value.activeWorkflow) }),
  };
}

function orderedRules(manifest: AgentManifest): DeterministicRule[] {
  return [...(manifest.deterministicRules ?? [])]
    .sort(
      (left, right) =>
        left.priority - right.priority
        || left.id.localeCompare(right.id),
    );
}

export async function selectDeterministicStep(
  manifest: AgentManifest,
  context: RuntimeRuleContext,
  input: RuntimeTurnInput,
): Promise<RuntimeStepResult | null> {
  for (const rule of orderedRules(manifest)) {
    let matched: boolean;
    try {
      matched = rule.match(input);
    } catch {
      throw new AgentRoutingError();
    }
    if (!matched) continue;
    try {
      return await rule.execute(context, input);
    } catch {
      throw new AgentRoutingError();
    }
  }
  return null;
}

const selectionSchema = {
  parse(value: unknown): AiToolSelection {
    if (
      !isPlainObject(value)
      || !exactKeys(value, new Set(['tool', 'arguments']))
      || (
        value.tool !== null
        && (
          typeof value.tool !== 'string'
          || value.tool.length > 64
          || !SAFE_CODE.test(value.tool)
        )
      )
    ) {
      throw new Error('invalid selection');
    }
    return {
      tool: value.tool as string | null,
      arguments: value.arguments,
    };
  },
};

export async function selectAiTool(
  manifest: AgentManifest,
  input: RuntimeTurnInput,
  configuration: RuntimeAiConfiguration,
): Promise<AiToolSelection> {
  const tools = manifest.tools
    .map((tool) => `${tool.name}: ${tool.description}`)
    .join('\n');
  const userContent = input.message.kind === 'text'
    ? input.message.text
    : `action:${input.message.actionId}`;
  const result = await configuration.facade.structured(
    {
      messages: [
        {
          role: 'system',
          content:
            'Select zero or one tool from the exact closed list. '
            + 'Return JSON with keys tool and arguments. Never invent a tool. '
            + `Closed list:\n${tools}`,
        },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
    },
    selectionSchema,
    configuration.policy,
  );
  return result.value;
}
