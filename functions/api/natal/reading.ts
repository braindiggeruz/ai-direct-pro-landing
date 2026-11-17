// POST /api/natal/reading — the AI reading of a natal chart or a pair
// (roadmap ROADMAP-NATAL-RU.md v2, sections 3 and 6).
// Body: { kind: 'natal' | 'pair', locale: 'uz' | 'ru', facts: string[], turnstileToken? }
//
// The browser computes the chart and sends only closed fact ids (signs,
// houses, aspects, contacts): no birth date, time, place or name. The server
// checks every id, renders the names itself, asks the model, checks the
// answer (retry once, then refuse) and saves it, so the same chart shows the
// same text again.
//
// Free: one natal reading and one pair reading per browser (the trial
// identity the chat's three free answers use), each correctable three times
// within a day. Anything else answers 402 next_paid: release 1 has no
// payment yet (owner's decision 17.11: the first pair reading is free too).
// Model calls are capped per hashed address and per day, walk the free
// tier's chain under its day budget, and stop when a counter cannot be read.
import type { Env } from '../../_types';
import { resolveConfig } from '../../lib/gpt-chat/config';
import { claimTrialIdentity } from '../../lib/gpt-chat/trial-identity';
import { hashIp, getClientIp } from '../../lib/gpt-chat/hash';
import { fail, genId, json, readJsonLimited } from '../../lib/gpt-chat/http';
import { consumeRateLimit, DAY_MS } from '../../lib/gpt-chat/rate-limit';
import { checkTurnstile } from '../../lib/turnstile';
import { hasProviderKey, providerOf, webChatChain } from '../../lib/gpt-chat/model-provider';
import { callZaiOnce } from '../../lib/gpt-chat/zai-chat';
import { chatComplete, type AdmitAttempt, type ChatResult } from '../../lib/gpt-chat/openrouter-chat';
import { FREE_PAID_BUDGET_ALERT, ModelSpendStore, freePaidBudget } from '../../lib/gpt-chat/model-spend-store';
import { recordServiceAlert } from '../../lib/gpt-chat/billing-maintenance-store';
import { alertOperator } from '../../lib/gpt-chat/operator-alert';
import { estimateCostUsd } from '../../lib/gpt-chat/model-pricing';
import { BILLING_ORG } from '../../lib/gpt-chat/billing-config';
import type { ChatMessage } from '../../lib/gpt-chat/prompt';
import { checkFacts, fingerprintOf, type ReadingKind } from '../../../src/shared/natal-facts';
import type { NatalLocale } from '../../../src/shared/natal-names';
import { checkReading, readingMessages, retryMessage, type ReadingSection } from '../../lib/natal/reading';
import { NatalStore, decideSlot } from '../../lib/natal/store';

/** Free readings that call the model, per hashed address and day, and for the whole site per day. */
// Eight: a free chart and a free pair, each corrected up to three times, from one address.
export const NATAL_FREE_PER_ADDRESS_DAY = 8;
export const NATAL_FREE_GLOBAL_DAY = 1000;
/** Output tokens a reading may take: Uzbek takes more tokens per word than Russian. */
export const READING_MAX_TOKENS: Readonly<Record<ReadingKind, number>> = { natal: 1700, pair: 1300 };
/**
 * One reading is several times longer than a chat answer, so it does not walk
 * the chat's chain: the chat gives Z.ai at most 15 s (ZAI_TIMEOUT_MS) and
 * cools a model that times out for every visitor. The first live readings of
 * 17.11.2026 timed out that way and paused the chat's own model for 30 s. A
 * reading asks the free tier's Z.ai model directly, with its own limit, and a
 * failure here cools nothing. Without a Z.ai head (after the prepaid bundle)
 * it falls back to the chat's walk.
 */
const READING_TIMEOUT_MS = 50_000;

export type Complete = (messages: ChatMessage[], maxTokens: number, admit: AdmitAttempt) => Promise<ChatResult>;

interface Body { kind?: unknown; locale?: unknown; facts?: unknown; turnstileToken?: unknown }

export async function handleReading(
  request: Request,
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void,
  complete?: Complete,
  now = Date.now(),
): Promise<Response> {
  const parsed = await readJsonLimited<Body>(request, 16_000);
  if (!parsed.ok) return fail(parsed.code, 'Invalid request body', parsed.code === 'payload_too_large' ? 413 : 400);
  const body = parsed.value ?? {};
  const kind = body.kind === 'pair' ? 'pair' : body.kind === 'natal' ? 'natal' : null;
  const locale: NatalLocale | null = body.locale === 'uz' || body.locale === 'ru' ? body.locale : null;
  if (!kind || !locale) return fail('bad_request', 'kind and locale are required');
  const checked = checkFacts(kind, body.facts);
  if (!checked.ok) return fail('bad_facts', checked.reason);
  const facts = checked.facts;

  const db = env.GPTBOT_DRAFTS_DB;
  if (!db) return fail('unavailable', 'Try later', 503);
  const cfg = resolveConfig(env);
  const ip = getClientIp(request);
  if (env.TURNSTILE_SECRET_KEY) {
    const turnstile = await checkTurnstile(env, typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined, ip, {
      expectedAction: 'natal_reading',
      expectedHostname: new URL(request.url).hostname,
    });
    if (!turnstile.ok) return fail(turnstile.reason === 'unavailable' ? 'turnstile_unavailable' : 'turnstile_failed', 'Verification failed', turnstile.reason === 'unavailable' ? 503 : 403);
  }

  let identity: { key: string; cookie: string | null };
  try {
    identity = await claimTrialIdentity(request, cfg);
  } catch {
    return fail('unavailable', 'Try later', 503);
  }
  const headers: Record<string, string> = identity.cookie ? { 'Set-Cookie': identity.cookie } : {};
  const answer = (sections: ReadingSection[], cached: boolean) => json({ ok: true, kind, locale, cached, sections }, 200, headers);

  const store = new NatalStore(db, BILLING_ORG);
  const fingerprint = await fingerprintOf(kind, facts);
  try {
    await store.ensure();
    const saved = await store.reading(identity.key, fingerprint, locale);
    if (saved) return answer(JSON.parse(saved.sections) as ReadingSection[], true);
  } catch {
    return json({ ok: false, code: 'unavailable' }, 503, headers);
  }

  const decision = decideSlot(await store.slot(identity.key, kind), fingerprint, now);
  if (decision === 'paid') return json({ ok: false, code: 'next_paid', kind }, 402, headers);

  // Counters before any model call; one that cannot be read stops the call (a model call costs money).
  const address = await hashIp(ip, cfg);
  const perAddress = await consumeRateLimit(db, 'natal_free', address, { limit: NATAL_FREE_PER_ADDRESS_DAY, windowMs: DAY_MS });
  if (perAddress.degraded) return json({ ok: false, code: 'unavailable' }, 503, headers);
  if (!perAddress.allowed) return json({ ok: false, code: 'rate_limited', retryAfter: perAddress.retryAfterSeconds }, 429, headers);
  const global = await consumeRateLimit(db, 'natal_free_global', 'all', { limit: NATAL_FREE_GLOBAL_DAY, windowMs: DAY_MS });
  if (global.degraded || !global.allowed) return json({ ok: false, code: 'busy' }, 503, headers);

  const maxTokens = READING_MAX_TOKENS[kind];
  const messages = readingMessages(kind, locale, facts);
  const spend = new ModelSpendStore(db, BILLING_ORG);
  const chain = webChatChain(cfg, env, 'free');
  const head = chain[0];
  const call: Complete = complete ?? (async (msgs, tokens, admit) => {
    if (head && providerOf(head) === 'zai' && hasProviderKey(env, 'zai')) {
      if ((await admit(head)) !== 'ok') return { ok: false, errorCode: 'budget_exhausted' };
      const result = await callZaiOnce(env, head, msgs, tokens, READING_TIMEOUT_MS, request.signal);
      if (!result.ok) console.warn(JSON.stringify({ event: 'natal_model_failed', model: head, code: result.errorCode }));
      return result;
    }
    return chatComplete(env, cfg, chain, msgs, tokens, READING_TIMEOUT_MS, request.signal, admit,
      (code) => waitUntil(alertOperator(env, code)));
  });
  const attempt = async (msgs: ChatMessage[]) => {
    const budget = freePaidBudget(spend, { ...cfg, maxOutputTokens: maxTokens }, msgs, () =>
      waitUntil(recordServiceAlert(env, FREE_PAID_BUDGET_ALERT).catch(() => console.warn('natal_budget_alert_failed'))));
    const result = await call(msgs, maxTokens, budget.admit).catch((): ChatResult => ({ ok: false, errorCode: 'provider_error' }));
    if (result.modelUsed) await budget.settle(result.modelUsed, estimateCostUsd(result.modelUsed, result.inputTokens, result.outputTokens));
    return result;
  };

  let result = await attempt(messages);
  if (!result.ok) return json({ ok: false, code: 'model_unavailable' }, 503, headers);
  let reading = checkReading(kind, result.content, facts);
  if (!reading.ok) {
    console.warn(JSON.stringify({ event: 'natal_reading_rejected', reason: reading.reason, kind, try: 1 }));
    result = await attempt([...messages, { role: 'assistant', content: result.content ?? '' }, retryMessage(reading.reason)]);
    if (!result.ok) return json({ ok: false, code: 'model_unavailable' }, 503, headers);
    reading = checkReading(kind, result.content, facts);
    if (!reading.ok) {
      console.warn(JSON.stringify({ event: 'natal_reading_rejected', reason: reading.reason, kind, try: 2 }));
      return json({ ok: false, code: 'reading_unavailable' }, 502, headers);
    }
  }
  try {
    await store.save({
      id: genId('nr'), identity: identity.key, kind, fingerprint, locale,
      sections: JSON.stringify(reading.sections), model: result.modelUsed ?? null, now, decision,
    });
  } catch {
    // The reading is shown even if saving failed; the slot is then not spent.
    console.warn(JSON.stringify({ event: 'natal_reading_save_failed', kind }));
  }
  return answer(reading.sections, false);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) =>
  handleReading(request, env, (promise) => waitUntil(promise));

export const onRequest: PagesFunction<Env> = async () => fail('method_not_allowed', 'Use POST', 405);
