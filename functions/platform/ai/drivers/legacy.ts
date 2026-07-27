// The only P0.5 platform→legacy dependency point. Existing consumers stay on
// their current imports; these factories let new platform code call the same
// implementations without copying model names, retries, prompts or secrets.
import type { Env } from '../../../_types';
import { resolveConfig, modelChain } from '../../../lib/gpt-chat/config'; // LEGACY-SHIM: isolated P0.5 compatibility adapter.
import { chatComplete } from '../../../lib/gpt-chat/openrouter-chat'; // LEGACY-SHIM: isolated P0.5 compatibility adapter.
import { routeLlmCall } from '../../../lib/llm/router'; // LEGACY-SHIM: isolated P0.5 compatibility adapter.
import type { LlmCallInput, LlmFeature, LlmErrorClass } from '../../../lib/llm/types'; // LEGACY-SHIM: isolated P0.5 compatibility adapter.
import {
  AiConfigurationError,
  AiProviderError,
  AiTimeoutError,
  AiUnavailableError,
} from '../errors';
import type {
  AiDriverRegistration,
  AiDriverRequest,
  AiMessage,
  AiTask,
} from '../types';

type LegacyChatComplete = typeof chatComplete;
type LegacyRouteLlmCall = typeof routeLlmCall;
type LegacyResolveConfig = typeof resolveConfig;
type LegacyModelChain = typeof modelChain;

export interface LegacyAdapterDependencies {
  chatComplete?: LegacyChatComplete;
  routeLlmCall?: LegacyRouteLlmCall;
  resolveConfig?: LegacyResolveConfig;
  modelChain?: LegacyModelChain;
}

export interface LegacyOpenRouterDriverOptions {
  tier?: 'free' | 'paid';
  dependencies?: LegacyAdapterDependencies;
}

export interface LegacyLlmStructuredDriverOptions {
  featureByTask: Partial<Record<AiTask, LlmFeature>>;
  dependencies?: LegacyAdapterDependencies;
}

function mutableMessages(messages: readonly AiMessage[]): AiMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

function mapChatFailure(task: AiTask, driver: string, code: string | undefined): Error {
  if (code === 'no_key') return new AiConfigurationError(task, 'missing_credentials');
  if (code === 'timeout') return new AiTimeoutError(task, driver);
  return new AiProviderError(task, driver);
}

function mapLlmFailure(task: AiTask, driver: string, errorClass: LlmErrorClass): Error {
  if (errorClass === 'unavailable') return new AiUnavailableError(task, 'structured');
  if (errorClass === 'timeout') return new AiTimeoutError(task, driver);
  return new AiProviderError(task, driver);
}

export function createLegacyOpenRouterDriver(
  env: Env,
  options: LegacyOpenRouterDriverOptions = {},
): AiDriverRegistration {
  const id = 'legacy-openrouter-chat';
  const deps = options.dependencies ?? {};
  const complete = deps.chatComplete ?? chatComplete;
  const readConfig = deps.resolveConfig ?? resolveConfig;
  const readChain = deps.modelChain ?? modelChain;
  const tier = options.tier ?? 'free';

  return {
    id,
    async complete(request: AiDriverRequest) {
      const config = readConfig(env);
      const chain = request.model ? [request.model] : readChain(config, tier);
      const result = await complete(
        env,
        config,
        chain,
        mutableMessages(request.messages),
        request.maxTokens,
        request.timeoutMs,
      );
      if (!result.ok || !result.content) {
        throw mapChatFailure(request.task, id, result.errorCode);
      }
      return {
        text: result.content,
        provider: 'openrouter',
        model: result.modelUsed,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      };
    },
  };
}

function legacyPrompts(messages: readonly AiMessage[]): { system: string; user: string } {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const user = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n');
  return { system, user };
}

export function createLegacyLlmStructuredDriver(
  env: Env,
  options: LegacyLlmStructuredDriverOptions,
): AiDriverRegistration {
  const id = 'legacy-llm-structured';
  const call = options.dependencies?.routeLlmCall ?? routeLlmCall;
  return {
    id,
    async structured(request: AiDriverRequest) {
      const feature = options.featureByTask[request.task];
      if (!feature) throw new AiConfigurationError(request.task, 'missing_feature_mapping');
      const prompts = legacyPrompts(request.messages);
      const input: LlmCallInput = {
        feature,
        system: prompts.system,
        user: prompts.user,
        jsonObject: true,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        timeoutMs: request.timeoutMs,
      };
      const result = await call(env, input);
      if (!result.ok) throw mapLlmFailure(request.task, id, result.error_class);
      return {
        text: result.content,
        provider: result.meta.provider,
        model: result.meta.model,
        latencyMs: result.meta.duration_ms,
        usage: {
          inputTokens: result.meta.input_tokens,
          outputTokens: result.meta.output_tokens,
        },
        attempts: result.meta.attempts.length,
      };
    },
  };
}
