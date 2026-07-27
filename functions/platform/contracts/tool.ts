// Platform contract: Tool — the only way an agent touches the world.
// Validation-library-neutral: a schema is anything that can parse unknown
// input into a typed value (zod, valibot or a hand-written parser all fit).
// Provider-neutral: nothing here knows about OpenAI function calling,
// Telegram or Cloudflare.
import type { FactSheet } from './facts';
import type { ToolContext, ToolResponseTemplate } from './runtime';

export interface RuntimeSchema<I> {
  /** Must throw on invalid input. */
  parse(raw: unknown): I;
}

export type ToolInputSchema<I> = RuntimeSchema<I>;

export interface Tool<I, O> {
  /** Stable machine name, unique within an agent manifest. */
  name: string;
  /** One-line purpose shown to the intent selector (closed-list choice). */
  description: string;
  inputSchema: RuntimeSchema<I>;
  run(ctx: ToolContext, input: I): Promise<O>;
  /** Project the output into grounding-safe facts. */
  facts(output: O): FactSheet;
  /** Deterministic channel-neutral response; placeholders reference facts. */
  response: ToolResponseTemplate;
}

/**
 * Type-erased view used by registries/runtime plumbing. The single documented
 * legacy-free cast boundary: a concrete Tool<I,O> is widened here so that
 * heterogeneous tool lists remain type-safe to store without `any`.
 */
export interface UnknownTool {
  name: string;
  description: string;
  inputSchema: RuntimeSchema<unknown>;
  run(ctx: ToolContext, input: unknown): Promise<unknown>;
  facts(output: unknown): FactSheet;
  response: ToolResponseTemplate;
}

export type ToolDefinition = UnknownTool;

export function eraseTool<I, O>(tool: Tool<I, O>): UnknownTool {
  // Safe by construction: consumers must go through inputSchema.parse before run,
  // and facts only ever receives the value produced by run.
  return tool as unknown as UnknownTool;
}
