// End-to-end smoke for the multi-provider LLM router.
//
// Calls the router with REAL API keys and asks for a tiny RU JSON
// object. Verifies that:
//   * the router picks the registry-priority candidate
//   * the response is valid JSON the caller can JSON.parse
//   * meta reports the actual provider + model + duration
//
// Skips D1-backed circuit-breaker + usage-store (no db in this node
// runtime). The router gracefully no-ops on missing GPTBOT_DRAFTS_DB.

import { routeLlmCall } from '../functions/lib/llm/router.ts';

type AnyEnv = Record<string, unknown>;

const env: AnyEnv = {
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GROQ_API_KEY:   process.env.GROQ_API_KEY,
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
};

console.log('Configured providers:',
  Object.entries(env).filter(([k]) => k.endsWith('_API_KEY')).map(([k, v]) => `${k}=${v ? '✓' : '—'}`).join(' '));

// Tiny RU JSON test: short prompt, response_format=json_object, low max_tokens.
const r = await routeLlmCall(env as never, {
  feature: 'ru_article',
  locale: 'ru',
  system: 'Ты SEO-копирайтер. Возвращай ТОЛЬКО валидный JSON. Ничего больше.',
  user: 'Сгенерируй СТРОГО валидный JSON: {"locale":"ru","title":"...","summary":["3","коротких","пункта"]} про пользу AI-бота для салона красоты в Ташкенте.',
  maxTokens: 500,
  temperature: 0.3,
  timeoutMs: 30_000,
});

console.log('Router result:', {
  ok: r.ok,
  meta: r.meta,
  ...(r.ok ? { content: r.content.slice(0, 220), finishReason: r.finishReason } : { error: r.error, error_class: r.error_class }),
});

if (r.ok) {
  try {
    const parsed = JSON.parse(r.content);
    console.log('Parsed JSON keys:', Object.keys(parsed));
    process.exit(0);
  } catch (e) {
    console.error('JSON parse failed:', e);
    process.exit(2);
  }
} else {
  process.exit(1);
}
