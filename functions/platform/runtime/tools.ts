import type {
  AgentManifest,
  FactSheet,
  FactValue,
  ToolContext,
  ToolDefinition,
} from '../contracts';
import {
  AgentGroundingError,
  AgentToolExecutionError,
  AgentToolInputError,
  AgentToolNotFoundError,
} from './errors';

const FACT_KEY =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const TOOL_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const TENANT_KEYS = new Set([
  'orgid',
  'org_id',
  'organizationid',
  'organization_id',
  'tenantid',
  'tenant_id',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeFactValue(value: unknown): value is FactValue {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) {
    return typeof value !== 'string'
      || (
        value.length <= 1_024
        && ![...value].some((character) => {
          const code = character.charCodeAt(0);
          return (code < 32 && code !== 9 && code !== 10 && code !== 13)
            || code === 127;
        })
      );
  }
  return typeof value === 'number' && Number.isFinite(value);
}

function rejectTenantOverride(
  value: unknown,
  seen: Set<object>,
  depth: number,
): void {
  if (depth > 12) throw new AgentToolInputError();
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new AgentToolInputError();
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const child of value) {
        rejectTenantOverride(child, seen, depth + 1);
      }
      return;
    }
    if (!isPlainObject(value)) throw new AgentToolInputError();
    for (const [key, child] of Object.entries(value)) {
      if (TENANT_KEYS.has(key.toLowerCase())) throw new AgentToolInputError();
      rejectTenantOverride(child, seen, depth + 1);
    }
  } finally {
    seen.delete(value);
  }
}

export function validateFactSheet(
  value: unknown,
  expectedToolName: string,
): FactSheet {
  if (
    !isPlainObject(value)
    || Object.keys(value).some(
      (key) => key !== 'toolName' && key !== 'values',
    )
    || typeof value.toolName !== 'string'
    || value.toolName.length > 64
    || !TOOL_NAME.test(value.toolName)
    || value.toolName !== expectedToolName
    || !isPlainObject(value.values)
    || Object.keys(value.values).length > 64
  ) {
    throw new AgentGroundingError('invalid_facts');
  }
  const values: Record<string, FactValue> = {};
  for (const [key, factValue] of Object.entries(value.values)) {
    if (!FACT_KEY.test(key) || !safeFactValue(factValue)) {
      throw new AgentGroundingError('invalid_facts');
    }
    values[key] = factValue;
  }
  return {
    toolName: expectedToolName,
    values,
  };
}

export function findManifestTool(
  manifest: AgentManifest,
  toolName: string,
): ToolDefinition {
  const tool = manifest.tools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new AgentToolNotFoundError();
  return tool;
}

export async function executeManifestTool(
  manifest: AgentManifest,
  toolName: string,
  rawInput: unknown,
  context: ToolContext,
): Promise<{ tool: ToolDefinition; facts: FactSheet }> {
  const tool = findManifestTool(manifest, toolName);
  rejectTenantOverride(rawInput, new Set<object>(), 0);

  let input: unknown;
  try {
    input = tool.inputSchema.parse(rawInput);
  } catch {
    throw new AgentToolInputError();
  }

  let output: unknown;
  try {
    output = await tool.run(context, input);
  } catch {
    throw new AgentToolExecutionError();
  }

  let projected: FactSheet;
  try {
    projected = tool.facts(output);
  } catch {
    throw new AgentGroundingError('invalid_facts');
  }
  return {
    tool,
    facts: validateFactSheet(projected, tool.name),
  };
}
