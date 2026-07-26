// Platform contract: Tool — the only way an agent touches the world.
// Validation-library-neutral: a schema is anything that can parse unknown
// input into a typed value (zod, valibot or a hand-written parser all fit).
// Provider-neutral: nothing here knows about OpenAI function calling,
// Telegram or Cloudflare.
import type { OrgContext } from './context';
import type { FactSheet } from './facts';

export interface ToolInputSchema<I> {
  /** Must throw (or return a rejected promise) on invalid input. */
  parse(raw: unknown): I;
}

export interface Tool<I, O> {
  /** Stable machine name, unique within an agent manifest. */
  name: string;
  /** One-line purpose shown to the intent selector (closed-list choice). */
  description: string;
  input: ToolInputSchema<I>;
  run(ctx: OrgContext, input: I): Promise<O>;
  /** Project the output into grounding-safe facts. */
  facts(output: O): FactSheet;
}

/**
 * Type-erased view used by registries/runtime plumbing. The single documented
 * legacy-free cast boundary: a concrete Tool<I,O> is widened here so that
 * heterogeneous tool lists remain type-safe to store without `any`.
 */
export interface UnknownTool {
  name: string;
  description: string;
  input: ToolInputSchema<unknown>;
  run(ctx: OrgContext, input: unknown): Promise<unknown>;
  facts(output: unknown): FactSheet;
}

export function eraseTool<I, O>(tool: Tool<I, O>): UnknownTool {
  // Safe by construction: consumers must go through input.parse before run,
  // and facts only ever receives the value produced by run.
  return tool as unknown as UnknownTool;
}
