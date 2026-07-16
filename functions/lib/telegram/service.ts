// telegramAssistantService — runs an assistant action via the SAME server-side
// OpenRouter provider used by the web chat (functions/lib/gpt-chat). The AI is
// never called from the client; the token/key never leaves the server.
import type { Env } from '../../_types';
import { resolveConfig, modelChain } from '../gpt-chat/config';
import { chatComplete } from '../gpt-chat/openrouter-chat';
import type { BuiltPrompt } from './prompts';
import { validateReply, validateModifier } from './validator';

export interface ServiceResult {
  ok: boolean;
  text?: string;
  model?: string | null;
  provider: string;
  errorCode?: string;
}

/**
 * Execute a built prompt. Low temperature and a modest token cap keep replies
 * tight and cheap. On provider failure returns ok:false with a machine code —
 * the handler maps it to friendly, localized copy.
 */
export async function runAssistant(env: Env, prompt: BuiltPrompt, maxOutputChars: number): Promise<ServiceResult> {
  const cfg = resolveConfig(env);
  // ~4 chars/token heuristic; clamp so long answers still fit Telegram.
  const maxTokens = Math.min(1200, Math.max(200, Math.floor(maxOutputChars / 3)));
  const result = await chatComplete(
    env,
    cfg,
    modelChain(cfg, 'free'),
    [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    maxTokens,
  );
  if (!result.ok || !result.content) {
    return { ok: false, provider: 'openrouter', errorCode: result.errorCode || 'provider_error' };
  }
  return {
    ok: true,
    text: result.content.slice(0, maxOutputChars),
    model: result.modelUsed ?? null,
    provider: 'openrouter',
  };
}

export interface JavobRunResult extends ServiceResult {
  latencyMs: number;
  /** true when the first attempt failed validation and one retry ran */
  retried: boolean;
}

const STRICTER_RETRY =
  '\nПОВТОР: предыдущая попытка нарушила правила (выдуманная цифра / неверный язык / мета-текст). Строго: ни одной цифры, которой нет во входных данных; только язык входящего сообщения; только чистый текст ответа.';

/**
 * telegramReplyOrchestrator core: generate → validate → at most ONE stricter
 * retry → if still invalid, fail closed (the handler sends friendly copy).
 * `mode` picks the right validator; expectedLanguage 'other'/mixed → null.
 */
export async function runJavobValidated(
  env: Env,
  prompt: BuiltPrompt,
  maxOutputChars: number,
  check: { source: string; previous?: string; expectedLanguage: 'ru' | 'uz' | null; mode: 'reply' | 'modifier' },
): Promise<JavobRunResult> {
  const started = Date.now();
  const attempt = async (p: BuiltPrompt) => runAssistant(env, p, maxOutputChars);

  let res = await attempt(prompt);
  let retried = false;
  if (res.ok && res.text) {
    const v = check.mode === 'modifier' && check.previous !== undefined
      ? validateModifier(check.source, check.previous, res.text)
      : validateReply(check.source, res.text, check.expectedLanguage);
    if (!v.ok) {
      retried = true;
      res = await attempt({ ...prompt, system: prompt.system + STRICTER_RETRY });
      if (res.ok && res.text) {
        const v2 = check.mode === 'modifier' && check.previous !== undefined
          ? validateModifier(check.source, check.previous, res.text)
          : validateReply(check.source, res.text, check.expectedLanguage);
        if (!v2.ok) {
          // Fail closed: an invented fact must never reach the user.
          return { ok: false, provider: res.provider, errorCode: 'validation_failed', latencyMs: Date.now() - started, retried };
        }
      }
    }
  }
  return { ...res, latencyMs: Date.now() - started, retried };
}
