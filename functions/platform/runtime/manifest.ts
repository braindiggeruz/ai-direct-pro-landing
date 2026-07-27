import type {
  AgentCapability,
  AgentManifest,
  DeterministicRule,
  Locale,
  ToolDefinition,
  ToolResponseTemplate,
} from '../contracts';
import { validateWorkflowDefinition } from '../workflow';
import {
  AgentManifestValidationError,
  type AgentManifestValidationCode,
} from './errors';

const MANIFEST_KEYS = new Set([
  'id',
  'version',
  'locales',
  'capabilities',
  'tools',
  'deterministicRules',
  'policies',
  'workflows',
  'knowledgeKinds',
]);
const POLICY_KEYS = new Set(['grounding', 'aiSelection']);
const TOOL_KEYS = new Set([
  'name',
  'description',
  'inputSchema',
  'run',
  'facts',
  'response',
]);
const RULE_KEYS = new Set(['id', 'priority', 'match', 'execute']);
const CAPABILITIES = new Set<AgentCapability>([
  'knowledge.query',
  'commerce.order',
  'scheduling.book',
  'handoff',
]);
const LOCALES = new Set<Locale>(['ru', 'uz']);
const SAFE_AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9._-]*$/;
const SEMVER_LIKE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z.-]+)?$/i;
const PLACEHOLDER = /\{\{([a-z][a-z0-9]*(?:[._-][a-z0-9]+)+)\}\}/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13)
      || code === 127;
  });
}

function requireSafeCode(
  value: unknown,
  code: AgentManifestValidationCode,
  maxLength: number,
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || !SAFE_CODE.test(value)
  ) {
    throw new AgentManifestValidationError(code);
  }
  return value;
}

function validateTemplate(
  template: ToolResponseTemplate,
  locales: readonly Locale[],
): void {
  if (
    !isPlainObject(template)
    || !hasOnlyKeys(template, new Set(['text']))
    || !isPlainObject(template.text)
    || !Object.keys(template.text).every((locale) => LOCALES.has(locale as Locale))
  ) {
    throw new AgentManifestValidationError('invalid_tool');
  }
  for (const locale of locales) {
    const text = template.text[locale];
    if (
      typeof text !== 'string'
      || text.trim().length === 0
      || text.length > 4_096
      || hasUnsafeControl(text)
    ) {
      throw new AgentManifestValidationError('invalid_tool');
    }
    const withoutPlaceholders = text.replace(PLACEHOLDER, '');
    PLACEHOLDER.lastIndex = 0;
    if (withoutPlaceholders.includes('{{') || withoutPlaceholders.includes('}}')) {
      throw new AgentManifestValidationError('invalid_tool');
    }
  }
}

function validateTool(
  tool: ToolDefinition,
  locales: readonly Locale[],
): void {
  if (
    !isPlainObject(tool)
    || !hasOnlyKeys(tool, TOOL_KEYS)
    || typeof tool.description !== 'string'
    || tool.description.trim().length === 0
    || tool.description.length > 240
    || hasUnsafeControl(tool.description)
    || !isPlainObject(tool.inputSchema)
    || typeof tool.inputSchema.parse !== 'function'
    || typeof tool.run !== 'function'
    || typeof tool.facts !== 'function'
  ) {
    throw new AgentManifestValidationError('invalid_tool');
  }
  requireSafeCode(tool.name, 'invalid_tool', 64);
  validateTemplate(tool.response, locales);
}

function validateRule(rule: DeterministicRule): void {
  if (
    !isPlainObject(rule)
    || !hasOnlyKeys(rule, RULE_KEYS)
    || !Number.isInteger(rule.priority)
    || rule.priority < 0
    || rule.priority > 10_000
    || typeof rule.match !== 'function'
    || typeof rule.execute !== 'function'
  ) {
    throw new AgentManifestValidationError('invalid_rule');
  }
  requireSafeCode(rule.id, 'invalid_rule', 64);
}

export function validateAgentManifest(
  manifest: AgentManifest,
): AgentManifest {
  if (!isPlainObject(manifest) || !hasOnlyKeys(manifest, MANIFEST_KEYS)) {
    throw new AgentManifestValidationError('invalid_manifest');
  }
  if (
    typeof manifest.id !== 'string'
    || manifest.id.length > 64
    || !SAFE_AGENT_ID.test(manifest.id)
  ) {
    throw new AgentManifestValidationError('invalid_id');
  }
  if (
    typeof manifest.version !== 'string'
    || manifest.version.length > 64
    || !SEMVER_LIKE.test(manifest.version)
  ) {
    throw new AgentManifestValidationError('invalid_version');
  }
  if (!Array.isArray(manifest.locales) || manifest.locales.length === 0) {
    throw new AgentManifestValidationError('invalid_locale');
  }
  const locales = new Set<Locale>();
  for (const locale of manifest.locales) {
    if (!LOCALES.has(locale)) {
      throw new AgentManifestValidationError('invalid_locale');
    }
    if (locales.has(locale)) {
      throw new AgentManifestValidationError('duplicate_locale');
    }
    locales.add(locale);
  }
  if (!Array.isArray(manifest.capabilities)) {
    throw new AgentManifestValidationError('invalid_capability');
  }
  const capabilities = new Set<AgentCapability>();
  for (const capability of manifest.capabilities) {
    if (!CAPABILITIES.has(capability)) {
      throw new AgentManifestValidationError('invalid_capability');
    }
    if (capabilities.has(capability)) {
      throw new AgentManifestValidationError('duplicate_capability');
    }
    capabilities.add(capability);
  }
  if (!Array.isArray(manifest.tools)) {
    throw new AgentManifestValidationError('invalid_tool');
  }
  const tools = new Set<string>();
  for (const tool of manifest.tools) {
    validateTool(tool, manifest.locales);
    if (tools.has(tool.name)) {
      throw new AgentManifestValidationError('duplicate_tool');
    }
    tools.add(tool.name);
  }
  if (
    manifest.deterministicRules !== undefined
    && !Array.isArray(manifest.deterministicRules)
  ) {
    throw new AgentManifestValidationError('invalid_rule');
  }
  const rules = new Set<string>();
  const priorities = new Set<number>();
  for (const rule of manifest.deterministicRules ?? []) {
    validateRule(rule);
    if (rules.has(rule.id)) {
      throw new AgentManifestValidationError('duplicate_rule');
    }
    if (priorities.has(rule.priority)) {
      throw new AgentManifestValidationError('duplicate_priority');
    }
    rules.add(rule.id);
    priorities.add(rule.priority);
  }
  if (
    !isPlainObject(manifest.policies)
    || !hasOnlyKeys(manifest.policies, POLICY_KEYS)
    || manifest.policies.grounding !== 'strict'
    || (
      manifest.policies.aiSelection !== undefined
      && manifest.policies.aiSelection !== 'disabled'
      && manifest.policies.aiSelection !== 'closed-list'
    )
  ) {
    throw new AgentManifestValidationError('invalid_policy');
  }
  if (manifest.workflows !== undefined && !Array.isArray(manifest.workflows)) {
    throw new AgentManifestValidationError('invalid_workflow');
  }
  for (const workflow of manifest.workflows ?? []) {
    try {
      validateWorkflowDefinition(workflow);
    } catch {
      throw new AgentManifestValidationError('invalid_workflow');
    }
  }
  if (
    manifest.knowledgeKinds !== undefined
    && !Array.isArray(manifest.knowledgeKinds)
  ) {
    throw new AgentManifestValidationError('invalid_knowledge_kind');
  }
  const knowledgeKinds = new Set<string>();
  for (const kind of manifest.knowledgeKinds ?? []) {
    requireSafeCode(kind, 'invalid_knowledge_kind', 64);
    if (knowledgeKinds.has(kind)) {
      throw new AgentManifestValidationError('invalid_knowledge_kind');
    }
    knowledgeKinds.add(kind);
  }
  return manifest;
}
