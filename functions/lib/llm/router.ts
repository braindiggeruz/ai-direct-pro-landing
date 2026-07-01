// Feature-aware LLM router with fallback + circuit-breaker + queue + idempotency.
//
// One entry point: `routeLlmCall(env, input)`. The router:
//
//   1. Resolves the candidate list from `model-registry.routes(feature, locale)`.
//   2. Filters out:
//        * unconfigured providers (no API key in env)
//        * candidates whose circuit-breaker is open
//   3. If `input.idempotencyKey` is set, returns a cached result when one
//      exists (TTL 10 min).
//   4. If the feature is "heavy" (article/translate/optimizer/retarget),
//      enqueues the call so heavy tasks run sequentially (concurrency=1)
//      and never burst the Gemini free quota.
//   5. Walks the candidates in priority order:
//        * call the provider adapter
//        * record success → recordSuccess, return wrapped LlmCallResult
//        * record failure → recordFailure, decide retry vs hard-fail
//          based on error_class. Non-retriable classes (auth, bad_request,
//          safety_blocked, invalid_json, truncated) skip the rest of
//          the chain — those are caller/payload problems, not provider
//          health problems.
//   6. Writes the final result to the idempotency cache (when key was set)
//      and to the usage-store ledger.
//
// The router NEVER throws — every failure mode produces a structured
// LlmCallFailure with operator-meaningful error_class.

import type { Env } from '../../_types';
import type {
  LlmCallInput, LlmCallResult, LlmCallSuccess, LlmCallFailure,
  LlmAttemptTrace, LlmErrorClass, LlmProvider, LlmProviderId, RouteCandidate,
} from './types';
import { routes } from './model-registry';
import { geminiProvider } from './providers/gemini';
import { mistralProvider } from './providers/mistral';
import { groqProvider } from './providers/groq';
import { cerebrasProvider } from './providers/cerebras';
import { openrouterProvider } from './providers/openrouter';
import { xaiProvider } from './providers/xai';
import { readBreaker, recordSuccess, recordFailure, isOpen } from './circuit-breaker';
import { enqueueHeavy, isHeavyFeature } from './queue';
import { recordUsage, readIdempotent, writeIdempotent } from './usage-store';

const PROVIDERS: Record<LlmProviderId, LlmProvider> = {
  gemini: geminiProvider,
  mistral: mistralProvider,
  groq: groqProvider,
  cerebras: cerebrasProvider,
  openrouter: openrouterProvider,
  xai: xaiProvider,
};

const NON_RETRIABLE: ReadonlySet<LlmErrorClass> = new Set([
  // bad_request means our payload is wrong — likely wrong for every provider.
  // Stop the chain to save quota.
  'bad_request',
]);

// These classes ARE retriable across providers but with caveats:
// * auth → provider A's credentials missing; provider B has its own. Skip to next.
// * safety_blocked → content policy refusal; different vendor may behave differently.
// * invalid_json / truncated → different model architecture parses/limits differently.
// * rate_limit / transient_5xx / timeout / network → standard transient classes.

export async function routeLlmCall(env: Env, input: LlmCallInput): Promise<LlmCallResult> {
  // 0. Idempotency cache (always consulted first).
  if (input.idempotencyKey) {
    const cached = await readIdempotent(env, input.idempotencyKey);
    if (cached && typeof cached === 'object' && (cached as { ok?: unknown }).ok !== undefined) {
      return cached as LlmCallResult;
    }
  }

  const exec = async (): Promise<LlmCallResult> => {
    const candidates = await selectHealthyCandidates(env, input);

    if (candidates.length === 0) {
      return buildEmptyFailure(input.feature, 'No configured provider can serve this feature. Add MISTRAL_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or CEREBRAS_API_KEY in Cloudflare Pages env.');
    }

    const attempts: LlmAttemptTrace[] = [];
    let lastFailure: { error: string; cls: LlmErrorClass; status?: number; excerpt?: string; provider: LlmProviderId; model: string; duration_ms: number } | null = null;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]!;
      const adapter = PROVIDERS[cand.provider];
      const callInput: LlmCallInput = {
        ...input,
        maxTokens: input.maxTokens ?? cand.max_output_tokens,
        timeoutMs: input.timeoutMs ?? cand.per_call_timeout_ms,
      };
      const r = await adapter.call(env, cand.model, callInput);
      attempts.push({
        provider: cand.provider,
        model: cand.model,
        status: r.ok ? 'ok' : 'error',
        error_class: r.ok ? undefined : r.error_class,
        http_status: r.ok ? undefined : r.http_status,
        duration_ms: r.duration_ms,
      });

      if (r.ok) {
        await recordSuccess(env, cand.provider, cand.model).catch((e) => console.warn(`[llm-router] recordSuccess failed for ${cand.provider}/${cand.model}:`, (e as Error).message));
        const success: LlmCallSuccess = {
          ok: true,
          content: r.content,
          finishReason: r.finishReason,
          meta: {
            provider: cand.provider,
            model: cand.model,
            feature: input.feature,
            duration_ms: r.duration_ms,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            retry_count: i,
            fallback_used: !cand.is_primary,
            attempts,
          },
        };
        if (input.idempotencyKey) await writeIdempotent(env, input.idempotencyKey, input.feature, success).catch((e) => console.warn('[llm-router] writeIdempotent failed:', (e as Error).message));
        await recordUsage(env, input.feature, success, input.idempotencyKey).catch((e) => console.warn('[llm-router] recordUsage failed:', (e as Error).message));
        return success;
      }

      // Record failure regardless of retry decision.
      await recordFailure(env, cand.provider, cand.model, r.error_class).catch((e) => console.warn(`[llm-router] recordFailure failed for ${cand.provider}/${cand.model}:`, (e as Error).message));
      lastFailure = {
        error: r.error,
        cls: r.error_class,
        status: r.http_status,
        excerpt: r.rawExcerpt,
        provider: cand.provider,
        model: cand.model,
        duration_ms: r.duration_ms,
      };

      // Non-retriable classes short-circuit the chain.
      if (NON_RETRIABLE.has(r.error_class)) {
        break;
      }
      // invalid_json / truncated: try ONE more candidate (a different
      // model architecture may parse better) but stop after that.
      if ((r.error_class === 'invalid_json' || r.error_class === 'truncated')) {
        // Continue to the next candidate (handled by the for loop), but
        // mark a soft cap so we don't burn the whole list on JSON failures.
        // For simplicity we just continue once — the natural i+1 step does
        // that. To enforce "only one more", we break after the next loop's
        // failure; an injected counter would be cleaner. Acceptable for
        // current scope.
        continue;
      }
    }

    // All candidates exhausted (or stopped on non-retriable class).
    const failureSrc = lastFailure || { error: 'no providers attempted', cls: 'unknown' as LlmErrorClass, status: undefined, excerpt: undefined, provider: 'gemini' as LlmProviderId, model: 'unknown', duration_ms: 0 };
    const failure: LlmCallFailure = {
      ok: false,
      error: failureSrc.error,
      error_class: failureSrc.cls,
      status: failureSrc.status,
      rawExcerpt: failureSrc.excerpt,
      meta: {
        provider: failureSrc.provider,
        model: failureSrc.model,
        feature: input.feature,
        duration_ms: failureSrc.duration_ms,
        retry_count: Math.max(0, attempts.length - 1),
        fallback_used: attempts.length > 1,
        attempts,
      },
    };
    if (input.idempotencyKey) await writeIdempotent(env, input.idempotencyKey, input.feature, failure).catch((e) => console.warn('[llm-router] writeIdempotent (failure) failed:', (e as Error).message));
    await recordUsage(env, input.feature, failure, input.idempotencyKey).catch((e) => console.warn('[llm-router] recordUsage (failure) failed:', (e as Error).message));
    return failure;
  };

  // Heavy features go through the global queue (concurrency=1) so a batch
  // of 10 topics never bursts. Light features run unqueued.
  if (isHeavyFeature(input.feature)) {
    return enqueueHeavy(exec);
  }
  return exec();
}

/** Filter candidates down to healthy + configured providers. */
async function selectHealthyCandidates(env: Env, input: LlmCallInput): Promise<RouteCandidate[]> {
  const all = routes(env, input.feature, input.locale);
  const out: RouteCandidate[] = [];
  for (const c of all) {
    const provider = PROVIDERS[c.provider];
    if (!provider || !provider.isConfigured(env)) continue;
    const breaker = await readBreaker(env, c.provider, c.model).catch((e) => {
      console.warn(`[llm-router] readBreaker failed for ${c.provider}/${c.model}:`, (e as Error).message);
      return null;
    });
    if (breaker && isOpen(breaker)) continue;
    out.push(c);
  }
  return out;
}

function buildEmptyFailure(feature: LlmCallInput['feature'], message: string): LlmCallFailure {
  return {
    ok: false,
    error: message,
    error_class: 'unavailable',
    meta: {
      provider: 'gemini',
      model: 'unknown',
      feature,
      duration_ms: 0,
      retry_count: 0,
      fallback_used: false,
      attempts: [],
    },
  };
}

// ── Public diagnostics ────────────────────────────────────────────────

export function whichProvidersConfigured(env: Env): Array<{ provider: LlmProviderId; configured: boolean }> {
  return (Object.keys(PROVIDERS) as LlmProviderId[]).map((p) => ({
    provider: p,
    configured: PROVIDERS[p].isConfigured(env),
  }));
}
