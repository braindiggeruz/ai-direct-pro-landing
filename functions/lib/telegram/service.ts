// telegramAssistantService — runs an assistant action through the SAME
// server-side OpenRouter walker as the web chat (functions/lib/gpt-chat). The
// AI is never called from the client; the key never leaves the server.
//
// Javob is a free tier like the site's (decision L15): it walks freeTierChain,
// the paid primary only while the day's shared budget allows it
// (model-spend-store.ts, the same gpt_model_spend bucket as the site), then
// the ':free' models. Without D1 there is no budget, so the chain stays
// ':free'. Every model the site has cooled down is skipped before a request
// is spent (chatComplete), and a generation never runs past the caller's
// deadline: the webhook's waitUntil ends 30 s after Telegram got its 200.
import type { Env } from '../../_types';
import { BILLING_ORG } from '../gpt-chat/billing-config';
import { recordServiceAlert } from '../gpt-chat/billing-maintenance-store';
import { ensureBillingSchema } from '../gpt-chat/billing-schema';
import { freeChain, resolveConfig } from '../gpt-chat/config';
import { freeTierChain } from '../gpt-chat/model-provider';
import { estimateCostUsd } from '../gpt-chat/model-pricing';
import {
  FREE_PAID_BUDGET_ALERT,
  freePaidBudget,
  ModelSpendStore,
  type FreePaidBudget,
} from '../gpt-chat/model-spend-store';
import { chatComplete } from '../gpt-chat/openrouter-chat';
import { alertOperator } from '../gpt-chat/operator-alert';
import type { ChatMessage } from '../gpt-chat/prompt';
import { isTruncated } from '../gpt-chat/turn-outcome';
import type { BuiltPrompt } from './prompts';
import { validateReply, validateModifier, type ValidationResult } from './validator';

/**
 * The webhook's waitUntil ends 30 s after Telegram got its 200. The model work
 * of a reply (the validation retry included) is over this long after the
 * update arrived, so the result or the error is saved and sent by 28 s.
 */
export const JAVOB_REPLY_DEADLINE_MS = 25_000;
/** Cap of the first generation of a text reply or a modifier. */
export const JAVOB_FIRST_ATTEMPT_MS = 14_000;
/** Cap of the one stricter regeneration after a failed validation. */
export const JAVOB_RETRY_MS = 10_000;
/** Cap of a voice reply's one generation: the download (≤ 6 s) and STT (≤ 10 s) came first. */
export const JAVOB_VOICE_MS = 10_000;
/** Model requests of a voice reply, counted after the health filter. */
export const JAVOB_VOICE_MAX_ATTEMPTS = 2;
/** A generation with less time than this left is not started. */
const MIN_GENERATION_MS = 1_000;

export interface ServiceResult {
  ok: boolean;
  text?: string;
  model?: string | null;
  provider: string;
  errorCode?: string;
}

/**
 * Execute a built prompt once: up to `maxAttempts` model requests within
 * `timeoutMs`. Low temperature and a modest token cap keep replies tight and
 * cheap. On failure returns ok:false with a machine code (chatComplete's, or
 * 'truncated' for an answer cut at max_tokens, which would read as complete
 * in Telegram) — the handler maps it to friendly, localized copy.
 */
export async function runAssistant(
  env: Env,
  prompt: BuiltPrompt,
  maxOutputChars: number,
  options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<ServiceResult> {
  const cfg = resolveConfig(env);
  // ~4 chars/token heuristic; clamp so long answers still fit Telegram.
  const maxTokens = Math.min(1200, Math.max(200, Math.floor(maxOutputChars / 3)));
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  // Alert writes of this generation. The caller already runs inside
  // waitUntil, so they are awaited here instead of being left to outlive it.
  const pending: Promise<unknown>[] = [];
  const db = env.GPTBOT_DRAFTS_DB;
  let budget: FreePaidBudget | null = null;
  if (db) {
    // The bot's own bootstrap does not create the gpt_* tables the walker
    // and the budget use (model health, spend, service alerts).
    await ensureBillingSchema(db);
    budget = freePaidBudget(
      new ModelSpendStore(db, BILLING_ORG),
      { freePaidDailyUsd: cfg.freePaidDailyUsd, maxOutputTokens: maxTokens },
      messages,
      () =>
        pending.push(
          recordServiceAlert(env, FREE_PAID_BUDGET_ALERT).catch(() =>
            console.warn('gpt_operator_alert_record_failed'),
          ),
        ),
    );
  }
  try {
    const result = await chatComplete(
      env,
      cfg,
      budget ? freeTierChain(cfg) : freeChain(cfg),
      messages,
      maxTokens,
      options.timeoutMs ?? JAVOB_FIRST_ATTEMPT_MS,
      undefined,
      budget?.admit,
      // OpenRouter credits (402 on the paid primary) page the owner, as from the site.
      (code) => pending.push(alertOperator(env, code)),
      options.maxAttempts,
    );
    if (result.ok && result.modelUsed) {
      await budget?.settle(
        result.modelUsed,
        estimateCostUsd(result.modelUsed, result.inputTokens, result.outputTokens),
      );
    }
    if (!result.ok || !result.content) {
      return { ok: false, provider: 'openrouter', errorCode: result.errorCode || 'provider_error' };
    }
    if (isTruncated(result.finishReason)) {
      return { ok: false, provider: 'openrouter', errorCode: 'truncated', model: result.modelUsed ?? null };
    }
    return {
      ok: true,
      text: result.content.slice(0, maxOutputChars),
      model: result.modelUsed ?? null,
      provider: 'openrouter',
    };
  } finally {
    await Promise.allSettled(pending);
  }
}

export interface JavobRunResult extends ServiceResult {
  latencyMs: number;
  /** true when the first answer failed validation and one stricter retry ran */
  retried: boolean;
  /**
   * Validator issue codes of every answer that failed (invented_number,
   * wrong_language, …), deduplicated. Never their detail: it quotes the answer.
   */
  issues: string[];
}

export interface JavobCheck {
  source: string;
  previous?: string;
  expectedLanguage: 'ru' | 'uz' | null;
  mode: 'reply' | 'modifier';
  /** Epoch ms by which every generation, the retry included, is over. */
  deadline: number;
  /** Cap of the first generation; JAVOB_FIRST_ATTEMPT_MS by default. */
  firstAttemptMs?: number;
  /** Model requests per generation, after the health filter; MAX_ATTEMPTS by default. */
  maxAttempts?: number;
  /** false: an answer that fails validation fails closed at once (the voice path). */
  validationRetry?: boolean;
}

const STRICTER_RETRY =
  '\nПОВТОР: предыдущая попытка нарушила правила (выдуманная цифра / неверный язык / мета-текст). Строго: ни одной цифры, которой нет во входных данных; только язык входящего сообщения; только чистый текст ответа.';

/**
 * telegramReplyOrchestrator core: generate → validate → at most ONE stricter
 * retry → if still invalid, fail closed (the handler sends friendly copy).
 * One deadline covers both generations: the first gets at most
 * `firstAttemptMs`, the retry at most JAVOB_RETRY_MS, and neither starts with
 * less than a second left. A retry that does not fit fails closed as
 * validation_failed; a first generation that does not fit is a timeout.
 */
export async function runJavobValidated(
  env: Env,
  prompt: BuiltPrompt,
  maxOutputChars: number,
  check: JavobCheck,
): Promise<JavobRunResult> {
  const started = Date.now();
  const issues = new Set<string>();
  const finish = (res: ServiceResult, retried: boolean): JavobRunResult => ({
    ...res,
    latencyMs: Date.now() - started,
    retried,
    issues: [...issues],
  });
  const generate = (p: BuiltPrompt, capMs: number): Promise<ServiceResult> | null => {
    const timeoutMs = Math.min(capMs, check.deadline - Date.now());
    if (timeoutMs < MIN_GENERATION_MS) return null;
    return runAssistant(env, p, maxOutputChars, { timeoutMs, maxAttempts: check.maxAttempts });
  };
  const valid = (text: string): boolean => {
    const verdict: ValidationResult = check.mode === 'modifier' && check.previous !== undefined
      ? validateModifier(check.source, check.previous, text)
      : validateReply(check.source, text, check.expectedLanguage);
    for (const issue of verdict.issues) issues.add(issue.code);
    return verdict.ok;
  };

  const first = generate(prompt, check.firstAttemptMs ?? JAVOB_FIRST_ATTEMPT_MS);
  if (!first) return finish({ ok: false, provider: 'openrouter', errorCode: 'timeout' }, false);
  const res = await first;
  if (!res.ok || !res.text || valid(res.text)) return finish(res, false);
  // Fail closed: an invented fact must never reach the user.
  const rejected: ServiceResult = { ok: false, provider: res.provider, errorCode: 'validation_failed' };
  if (check.validationRetry === false) return finish(rejected, false);
  const second = generate({ ...prompt, system: prompt.system + STRICTER_RETRY }, JAVOB_RETRY_MS);
  if (!second) return finish(rejected, false);
  const retry = await second;
  if (!retry.ok || !retry.text) return finish(retry, true);
  return finish(valid(retry.text) ? retry : { ...rejected, provider: retry.provider }, true);
}
