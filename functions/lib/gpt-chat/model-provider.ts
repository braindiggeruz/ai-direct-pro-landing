// Which provider serves a model id, and the web chat's provider-aware chain.
//
// The consumer chat walks ONE chain of model ids (openrouter-chat.ts and
// openrouter-stream.ts). Z.ai is the second provider behind that same walker:
// its ids are provider-qualified with the `zai/` prefix ('zai/glm-4.7-flash'),
// which is deliberately distinct from OpenRouter's own 'z-ai/…' slugs, so an
// id alone says where the request goes and what the answer label will read.
//
// Z.ai is used only when ALL THREE switches are on (plan decision L10):
//   GPT_MODEL_PROVIDER='zai'     public config, needs a deploy
//   GPT_ZAI_EVAL_APPROVED=<date> public config: the day a blind evaluation
//                                approved Z.ai; the committed date must have
//                                docs/paid-chat/evals/zai-<date>.json (tested)
//   ZAI_API_KEY                  secret, set by the owner
// With the committed config webChatChain() returns modelChain() unchanged, so
// the chat's outbound requests go to OpenRouter only.
//
// Only functions/api/gpt/chat.ts calls webChatChain(). Javob
// (functions/lib/telegram/**) and the OpenRouter catalogue check
// (billing-operations-store.ts) keep calling modelChain()/freeChain(), which
// never contain a 'zai/' id.
//
// Facts (docs.z.ai, read 2026-09-30):
//   https://docs.z.ai/api-reference/llm/chat-completion — model codes
//   https://docs.z.ai/guides/overview/pricing — GLM-4.7-Flash and GLM-4.5-Flash
//     are free; GLM-4.7-FlashX $0.07/$0.4, GLM-4.5-Air $0.2/$1.1 per 1M tokens.
// GLM-5.x cannot switch thinking off (first token ~9–12 s against our 12 s
// first-content budget), so no GLM-5 code is ever allowed here.
import type { Env } from '../../_types';
import { freeChain, modelChain, type GptChatConfig } from './config';

export type ModelProvider = 'openrouter' | 'zai';

export const ZAI_PREFIX = 'zai/';

/** Model-health wildcard that blocks every Z.ai model and nothing else. */
export const ZAI_WILDCARD = 'zai/*';

export function providerOf(id: string): ModelProvider {
  return id.startsWith(ZAI_PREFIX) ? 'zai' : 'openrouter';
}

/** The model code the provider itself expects ('zai/glm-4.7-flash' → 'glm-4.7-flash'). */
export function bareModel(id: string): string {
  return providerOf(id) === 'zai' ? id.slice(ZAI_PREFIX.length) : id;
}

/** The account-wide health wildcard for a provider ('*' stays OpenRouter-only). */
export function providerWildcard(provider: ModelProvider): string {
  return provider === 'zai' ? ZAI_WILDCARD : '*';
}

/**
 * Model-health wildcard for every PAID OpenRouter model: a 402 on a paid model
 * means the account has no credits, and ':free' models still answer.
 */
export const OPENROUTER_PAID_WILDCARD = 'openrouter-paid/*';

/** An OpenRouter id that can bill the account (anything but a ':free' slug). */
export function isPaidOpenRouterModel(id: string): boolean {
  return !!id && providerOf(id) === 'openrouter' && !id.endsWith(':free');
}

/** The health wildcards that also block a model: its provider's account and, for a paid OpenRouter id, its credits. */
export function healthWildcards(id: string): string[] {
  if (providerOf(id) === 'zai') return [ZAI_WILDCARD];
  return isPaidOpenRouterModel(id) ? ['*', OPENROUTER_PAID_WILDCARD] : ['*'];
}

/** $0 Z.ai models. The free tier may only ever call one of these. */
export const ZAI_ZERO_PRICE: ReadonlySet<string> = new Set(['glm-4.7-flash', 'glm-4.5-flash']);

/**
 * Z.ai models the paid tier may use: thinking can be disabled, and the price
 * is inside the unit economics in the roadmap. GLM-4.7 and every GLM-5.x are
 * deliberately absent.
 */
export const ZAI_PAID_ALLOWED: ReadonlySet<string> = new Set([
  'glm-4.7-flashx',
  'glm-4.5-air',
  'glm-4.7-flash',
  'glm-4.5-flash',
]);

export function hasProviderKey(
  env: Pick<Env, 'OPENROUTER_API_KEY' | 'ZAI_API_KEY'>,
  provider: ModelProvider,
): boolean {
  return provider === 'zai' ? !!env.ZAI_API_KEY : !!env.OPENROUTER_API_KEY;
}

// One warning per isolate: a misconfigured model must not become a log line
// per chat turn.
let warnedRejected = false;

/** Reset between tests. */
export function _resetZaiWarning(): void {
  warnedRejected = false;
}

/**
 * The web chat's chain for a tier: modelChain(cfg, 'paid') or freeChain(cfg).
 * With all three Z.ai switches on: one Z.ai model first, then that OpenRouter
 * chain as the fallback. The chain is not cut here: the walker takes the
 * first three candidates that are neither cooling down nor keyless
 * (availableModels), so a blocked Z.ai never costs an OpenRouter slot.
 */
export function webChatChain(
  cfg: GptChatConfig,
  env: Pick<Env, 'ZAI_API_KEY'>,
  tier: 'free' | 'paid',
): string[] {
  const base = tier === 'paid' ? modelChain(cfg, 'paid') : freeChain(cfg);
  if (
    cfg.modelProvider !== 'zai' ||
    !cfg.zaiEvalApproved ||
    !env.ZAI_API_KEY ||
    !cfg.zaiTiers.includes(tier)
  )
    return base;
  const id = tier === 'free' ? cfg.zaiModelFree : cfg.zaiModelPaid;
  const allowed = tier === 'free' ? ZAI_ZERO_PRICE.has(id) : ZAI_PAID_ALLOWED.has(id);
  if (!allowed) {
    if (!warnedRejected) {
      warnedRejected = true;
      // The configured code is public config, never a secret; the tier alone
      // is enough to find it.
      console.warn(JSON.stringify({ event: 'gpt_zai_model_rejected', tier }));
    }
    return base;
  }
  return [`${ZAI_PREFIX}${id}`, ...base.filter((m) => providerOf(m) === 'openrouter')];
}
