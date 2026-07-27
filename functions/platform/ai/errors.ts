import type { AiTask } from './types';

export type AiErrorCode =
  | 'configuration'
  | 'provider'
  | 'timeout'
  | 'structured_invalid_json'
  | 'structured_schema_mismatch'
  | 'unavailable';

function safeTag(value: unknown, fallback = 'unknown'): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized) ? normalized : fallback;
}

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly task?: AiTask,
    public readonly driver?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export class AiConfigurationError extends AiError {
  constructor(task?: AiTask, detail = 'invalid') {
    const safeTask = safeTag(task);
    super(
      'configuration',
      `AI configuration error (task=${safeTask}; detail=${safeTag(detail)}).`,
      task,
    );
    this.name = 'AiConfigurationError';
  }
}

export class AiProviderError extends AiError {
  constructor(task: AiTask, driver?: string) {
    const safeDriver = safeTag(driver);
    super(
      'provider',
      `AI provider failed (task=${safeTag(task)}; driver=${safeDriver}).`,
      task,
      safeDriver,
    );
    this.name = 'AiProviderError';
  }
}

export class AiTimeoutError extends AiError {
  constructor(task: AiTask, driver?: string) {
    const safeDriver = safeTag(driver);
    super(
      'timeout',
      `AI request timed out (task=${safeTag(task)}; driver=${safeDriver}).`,
      task,
      safeDriver,
    );
    this.name = 'AiTimeoutError';
  }
}

export class AiStructuredOutputError extends AiError {
  constructor(task: AiTask, reason: 'invalid_json' | 'schema_mismatch', driver?: string) {
    const safeDriver = safeTag(driver);
    const code = reason === 'invalid_json'
      ? 'structured_invalid_json'
      : 'structured_schema_mismatch';
    super(
      code,
      `AI structured output rejected (task=${safeTag(task)}; reason=${reason}; driver=${safeDriver}).`,
      task,
      safeDriver,
    );
    this.name = 'AiStructuredOutputError';
  }
}

export class AiUnavailableError extends AiError {
  constructor(task: AiTask, capability: 'complete' | 'structured' | 'stream' | 'transcribe') {
    super(
      'unavailable',
      `AI capability unavailable (task=${safeTag(task)}; capability=${capability}).`,
      task,
    );
    this.name = 'AiUnavailableError';
  }
}
