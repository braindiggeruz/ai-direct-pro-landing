import { AiStructuredOutputError } from './errors';
import type { AiRuntimeSchema, AiTask } from './types';

/** Strict JSON parse followed by a runtime schema parse. Never returns raw data. */
export function parseStructuredOutput<T>(
  text: string,
  schema: AiRuntimeSchema<T>,
  task: AiTask,
  driver?: string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiStructuredOutputError(task, 'invalid_json', driver);
  }
  try {
    return schema.parse(parsed);
  } catch {
    throw new AiStructuredOutputError(task, 'schema_mismatch', driver);
  }
}
