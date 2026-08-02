import {
  AiConfigurationError,
  AiError,
  AiProviderError,
  AiStructuredOutputError,
  AiTimeoutError,
  AiUnavailableError,
} from './errors';
import {
  AiPolicyResolver,
  type AiPolicySelector,
  type ResolvedAiPolicy,
} from './policy';
import { parseStructuredOutput } from './structured';
import type {
  AiAttempt,
  AiAudioInput,
  AiCompletionRequest,
  AiDriverRegistration,
  AiDriverRequest,
  AiDriverTextResult,
  AiRuntimeSchema,
  AiStructuredResult,
  AiTask,
  AiTextResult,
  AiTranscriptionOutcome,
} from './types';

export interface AiTranscriptionRequest {
  audio: AiAudioInput;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AiFacade {
  complete(request: AiCompletionRequest, policy: AiPolicySelector): Promise<AiTextResult>;
  structured<T>(
    request: AiCompletionRequest,
    schema: AiRuntimeSchema<T>,
    policy: AiPolicySelector,
  ): Promise<AiStructuredResult<T>>;
  transcribe(
    request: AiTranscriptionRequest,
    policy: AiPolicySelector,
  ): Promise<AiTranscriptionOutcome>;
}

export interface CreateAiFacadeInput {
  drivers: readonly AiDriverRegistration[];
  policy: AiPolicyResolver;
}

function validateRequest(request: AiCompletionRequest, task: AiTask): void {
  if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
    throw new AiConfigurationError(task, 'invalid_request');
  }
  for (const message of request.messages) {
    if (
      !message
      || (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant')
      || typeof message.content !== 'string'
      || message.content.trim().length === 0
    ) {
      throw new AiConfigurationError(task, 'invalid_request');
    }
  }
}

function buildDriverRequest(
  request: AiCompletionRequest,
  policy: ResolvedAiPolicy,
  model?: string,
): AiDriverRequest {
  return {
    ...request,
    task: policy.task,
    ...(model === undefined ? {} : { model }),
    temperature: request.temperature ?? policy.temperature,
    maxTokens: request.maxTokens ?? policy.maxTokens,
    timeoutMs: request.timeoutMs ?? policy.timeoutMs,
  };
}

function normalizeError(error: unknown, task: AiTask, driver: string): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new AiTimeoutError(task, driver);
  }
  return new AiProviderError(task, driver);
}

async function withTimeout<T>(
  operation: (signal: AbortSignal | undefined) => Promise<T>,
  timeoutMs: number | undefined,
  externalSignal: AbortSignal | undefined,
  task: AiTask,
  driver: string,
): Promise<T> {
  if (timeoutMs === undefined && externalSignal === undefined) {
    return operation(undefined);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = timeoutMs === undefined
    ? null
    : new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AiTimeoutError(task, driver));
      }, timeoutMs);
    });
  try {
    const work = operation(controller.signal);
    return timeoutPromise ? await Promise.race([work, timeoutPromise]) : await work;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

function attemptErrorCode(error: AiError): string {
  return error.code;
}

function successMetadata(
  driver: string,
  result: AiDriverTextResult,
  startedAt: number,
  attempts: readonly AiAttempt[],
) {
  return {
    driver,
    provider: result.provider,
    model: result.model,
    latencyMs: Date.now() - startedAt,
    usage: result.usage,
    attempts,
  };
}

export function createAiFacade(input: CreateAiFacadeInput): AiFacade {
  const drivers = new Map<string, AiDriverRegistration>();
  for (const driver of input.drivers) {
    if (!driver || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(driver.id)) {
      throw new AiConfigurationError(undefined, 'invalid_driver');
    }
    if (drivers.has(driver.id)) throw new AiConfigurationError(undefined, 'duplicate_driver');
    drivers.set(driver.id, driver);
  }

  return {
    async complete(request, selector) {
      const policy = input.policy.resolve(selector);
      validateRequest(request, policy.task);
      const startedAt = Date.now();
      const attempts: AiAttempt[] = [];
      let lastError: AiError | null = null;
      let sawCapability = false;

      for (const route of policy.routes.slice(0, policy.maxAttempts)) {
        const registered = drivers.get(route.driver);
        if (!registered) throw new AiConfigurationError(policy.task, 'unknown_driver');
        if (!registered.complete) {
          attempts.push({
            driver: route.driver,
            model: route.model,
            status: 'error',
            errorCode: 'unavailable',
            latencyMs: 0,
          });
          continue;
        }
        sawCapability = true;
        const attemptStarted = Date.now();
        try {
          const driverRequest = buildDriverRequest(request, policy, route.model);
          const result = await withTimeout(
            (signal) => registered.complete!({ ...driverRequest, signal }),
            driverRequest.timeoutMs,
            request.signal,
            policy.task,
            route.driver,
          );
          if (!result || typeof result.text !== 'string' || result.text.length === 0) {
            throw new AiProviderError(policy.task, route.driver);
          }
          attempts.push({
            driver: route.driver,
            model: result.model ?? route.model,
            status: 'ok',
            latencyMs: Date.now() - attemptStarted,
          });
          return {
            text: result.text,
            ...successMetadata(route.driver, result, startedAt, attempts),
          };
        } catch (error) {
          lastError = normalizeError(error, policy.task, route.driver);
          attempts.push({
            driver: route.driver,
            model: route.model,
            status: 'error',
            errorCode: attemptErrorCode(lastError),
            latencyMs: Date.now() - attemptStarted,
          });
        }
      }
      if (!sawCapability) throw new AiUnavailableError(policy.task, 'complete');
      throw lastError ?? new AiUnavailableError(policy.task, 'complete');
    },

    async structured(request, schema, selector) {
      const policy = input.policy.resolve(selector);
      validateRequest(request, policy.task);
      const startedAt = Date.now();
      const attempts: AiAttempt[] = [];
      let lastError: AiError | null = null;
      let sawCapability = false;

      for (const route of policy.routes.slice(0, policy.maxAttempts)) {
        const registered = drivers.get(route.driver);
        if (!registered) throw new AiConfigurationError(policy.task, 'unknown_driver');
        if (!registered.structured) {
          attempts.push({
            driver: route.driver,
            model: route.model,
            status: 'error',
            errorCode: 'unavailable',
            latencyMs: 0,
          });
          continue;
        }
        sawCapability = true;
        const attemptStarted = Date.now();
        try {
          const driverRequest = buildDriverRequest(request, policy, route.model);
          const result = await withTimeout(
            (signal) => registered.structured!({ ...driverRequest, signal }),
            driverRequest.timeoutMs,
            request.signal,
            policy.task,
            route.driver,
          );
          if (!result || typeof result.text !== 'string' || result.text.length === 0) {
            throw new AiStructuredOutputError(policy.task, 'invalid_json', route.driver);
          }
          const value = parseStructuredOutput(result.text, schema, policy.task, route.driver);
          attempts.push({
            driver: route.driver,
            model: result.model ?? route.model,
            status: 'ok',
            latencyMs: Date.now() - attemptStarted,
          });
          return {
            value,
            ...successMetadata(route.driver, result, startedAt, attempts),
          };
        } catch (error) {
          lastError = normalizeError(error, policy.task, route.driver);
          attempts.push({
            driver: route.driver,
            model: route.model,
            status: 'error',
            errorCode: attemptErrorCode(lastError),
            latencyMs: Date.now() - attemptStarted,
          });
        }
      }
      if (!sawCapability) throw new AiUnavailableError(policy.task, 'structured');
      throw lastError ?? new AiUnavailableError(policy.task, 'structured');
    },

    async transcribe(request, selector) {
      const policy = input.policy.resolve(selector);
      if (
        !request
        || !request.audio
        || !(request.audio.bytes instanceof ArrayBuffer)
        || request.audio.bytes.byteLength === 0
        || typeof request.audio.mimeType !== 'string'
        || request.audio.mimeType.length === 0
      ) {
        throw new AiConfigurationError(policy.task, 'invalid_request');
      }
      const startedAt = Date.now();
      const attempts: AiAttempt[] = [];
      let lastError: AiError | null = null;
      let sawCapability = false;

      for (const route of policy.routes.slice(0, policy.maxAttempts)) {
        const registered = drivers.get(route.driver);
        if (!registered) throw new AiConfigurationError(policy.task, 'unknown_driver');
        if (!registered.transcribe) {
          attempts.push({
            driver: route.driver,
            model: route.model,
            status: 'error',
            errorCode: 'unavailable',
            latencyMs: 0,
          });
          continue;
        }
        sawCapability = true;
        const attemptStarted = Date.now();
        try {
          const result = await withTimeout(
            (signal) => registered.transcribe!(request.audio, signal),
            request.timeoutMs ?? policy.timeoutMs,
            request.signal,
            policy.task,
            route.driver,
          );
          if (!result || typeof result.text !== 'string' || result.text.length === 0) {
            throw new AiProviderError(policy.task, route.driver);
          }
          attempts.push({
            driver: route.driver,
            model: result.model ?? route.model,
            status: 'ok',
            latencyMs: Date.now() - attemptStarted,
          });
          return {
            text: result.text,
            language: result.language,
            segments: result.segments,
            driver: route.driver,
            provider: result.provider,
            model: result.model ?? route.model,
            latencyMs: Date.now() - startedAt,
            attempts,
          };
        } catch (error) {
          lastError = normalizeError(error, policy.task, route.driver);
          attempts.push({
            driver: route.driver,
            model: route.model,
            status: 'error',
            errorCode: attemptErrorCode(lastError),
            latencyMs: Date.now() - attemptStarted,
          });
        }
      }
      if (!sawCapability) throw new AiUnavailableError(policy.task, 'transcribe');
      throw lastError ?? new AiUnavailableError(policy.task, 'transcribe');
    },
  };
}
