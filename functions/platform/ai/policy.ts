import { AiConfigurationError } from './errors';
import type { AiTask, AiTier } from './types';

const TASKS: ReadonlySet<string> = new Set([
  'chat',
  'intent',
  'analysis',
  'structured',
  'transcription',
]);
const TIERS: ReadonlySet<string> = new Set([
  'default',
  'economy',
  'quality',
  'free',
  'paid',
]);
const DRIVER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export interface AiPolicySelector {
  task: AiTask;
  tier?: AiTier;
}

export interface AiRoute {
  driver: string;
  /** Optional configured model override; omission leaves choice to the driver. */
  model?: string;
}

export interface AiTaskPolicyDefinition {
  task: AiTask;
  tier?: AiTier;
  routes: readonly AiRoute[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Facade attempts; each configured route is attempted at most once. */
  maxAttempts?: number;
}

export interface ResolvedAiPolicy {
  task: AiTask;
  tier: AiTier;
  routes: readonly AiRoute[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxAttempts: number;
}

function key(task: AiTask, tier: AiTier): string {
  return `${task}:${tier}`;
}

function validTask(value: unknown): value is AiTask {
  return typeof value === 'string' && TASKS.has(value);
}

function validTier(value: unknown): value is AiTier {
  return typeof value === 'string' && TIERS.has(value);
}

function boundedNumber(
  value: number | undefined,
  min: number,
  max: number,
): boolean {
  return value === undefined || (Number.isFinite(value) && value >= min && value <= max);
}

function validateDefinition(definition: AiTaskPolicyDefinition): void {
  if (!validTask(definition.task)) throw new AiConfigurationError(undefined, 'unknown_task');
  const tier = definition.tier ?? 'default';
  if (!validTier(tier)) throw new AiConfigurationError(definition.task, 'unknown_tier');
  if (!Array.isArray(definition.routes) || definition.routes.length === 0) {
    throw new AiConfigurationError(definition.task, 'missing_routes');
  }
  for (const route of definition.routes) {
    if (!route || !DRIVER_ID.test(route.driver)) {
      throw new AiConfigurationError(definition.task, 'invalid_driver');
    }
    if (
      route.model !== undefined
      && (typeof route.model !== 'string'
        || route.model.trim().length === 0
        || route.model.length > 200
        || [...route.model].some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127;
        }))
    ) {
      throw new AiConfigurationError(definition.task, 'invalid_model');
    }
  }
  if (!boundedNumber(definition.temperature, 0, 2)) {
    throw new AiConfigurationError(definition.task, 'invalid_temperature');
  }
  if (!boundedNumber(definition.maxTokens, 1, 100_000)) {
    throw new AiConfigurationError(definition.task, 'invalid_max_tokens');
  }
  if (!boundedNumber(definition.timeoutMs, 1, 180_000)) {
    throw new AiConfigurationError(definition.task, 'invalid_timeout');
  }
  const maxAttempts = definition.maxAttempts ?? definition.routes.length;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > definition.routes.length) {
    throw new AiConfigurationError(definition.task, 'invalid_attempts');
  }
}

export class AiPolicyResolver {
  private readonly policies = new Map<string, ResolvedAiPolicy>();

  constructor(definitions: readonly AiTaskPolicyDefinition[]) {
    for (const definition of definitions) {
      validateDefinition(definition);
      const tier = definition.tier ?? 'default';
      const policyKey = key(definition.task, tier);
      if (this.policies.has(policyKey)) {
        throw new AiConfigurationError(definition.task, 'duplicate_policy');
      }
      this.policies.set(policyKey, {
        ...definition,
        tier,
        routes: definition.routes.map((route) => ({
          driver: route.driver,
          ...(route.model === undefined ? {} : { model: route.model.trim() }),
        })),
        maxAttempts: definition.maxAttempts ?? definition.routes.length,
      });
    }
  }

  resolve(selector: AiPolicySelector): ResolvedAiPolicy {
    if (!selector || !validTask(selector.task)) {
      throw new AiConfigurationError(undefined, 'unknown_task');
    }
    const tier = selector.tier ?? 'default';
    if (!validTier(tier)) throw new AiConfigurationError(selector.task, 'unknown_tier');
    const exact = this.policies.get(key(selector.task, tier));
    const fallback = tier === 'default'
      ? undefined
      : this.policies.get(key(selector.task, 'default'));
    const policy = exact ?? fallback;
    if (!policy) throw new AiConfigurationError(selector.task, 'missing_policy');
    return policy;
  }
}
