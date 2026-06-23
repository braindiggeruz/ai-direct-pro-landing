// Dual-locale (RU + UZ) smoke + simulated-failure fallback smoke.
//
// 1. Generate RU + UZ in sequence — confirm heavy queue serialises and
//    each locale produces parseable JSON via its registry-primary route.
// 2. Sabotage Mistral with a bogus key — confirm router falls back to
//    Groq for RU and Gemini stays the UZ primary.

import { routeLlmCall } from '../functions/lib/llm/router.ts';

const env = {
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GROQ_API_KEY:   process.env.GROQ_API_KEY,
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
} as never;

const sys = 'Verkest qisqa JSON, faqat JSON. Return STRICT JSON only.';

async function generate(label: string, locale: 'ru' | 'uz', envOverride: Record<string, unknown> = {}) {
  const t0 = Date.now();
  const r = await routeLlmCall({ ...env, ...envOverride } as never, {
    feature: locale === 'ru' ? 'ru_article' : 'uz_article',
    locale,
    system: sys,
    user: locale === 'ru'
      ? 'Верни JSON {"locale":"ru","title":"...","intro":"одно предложение"} про AI-бот в Ташкенте.'
      : "JSON qaytar: {\"locale\":\"uz\",\"title\":\"...\",\"intro\":\"bir gap\"} Toshkentdagi AI-bot haqida.",
    maxTokens: 300,
    temperature: 0.3,
    timeoutMs: 30_000,
  });
  const dt = Date.now() - t0;
  if (r.ok) {
    const j = JSON.parse(r.content);
    console.log(`[${label}] ${locale.toUpperCase()} ✓  ${r.meta.provider}/${r.meta.model}  fb=${r.meta.fallback_used}  dt=${dt}ms  title="${String(j.title).slice(0, 50)}..."`);
  } else {
    console.log(`[${label}] ${locale.toUpperCase()} ✗  ${r.meta.provider}/${r.meta.model}  class=${r.error_class}  err=${r.error.slice(0, 80)}`);
  }
  return r;
}

// 1. Two locales, both providers available.
console.log('\n=== Test 1: RU + UZ with all keys ===');
const tStart = Date.now();
const [r1, r2] = await Promise.all([
  generate('parallel', 'ru'),
  generate('parallel', 'uz'),
]);
const total = Date.now() - tStart;
console.log(`Total wall: ${total}ms (queue should serialise; expected > sum of individual durations)`);
void r1; void r2;

// 2. Sabotage Mistral → expect RU to fall back to next registry entry.
console.log('\n=== Test 2: RU with broken Mistral key (force fallback) ===');
const r3 = await generate('fallback', 'ru', { MISTRAL_API_KEY: 'this-key-is-invalid-on-purpose' });
console.log(`Fallback used: ${r3.ok ? r3.meta.fallback_used : '(failed)'}, attempts: ${r3.meta.attempts.map((a) => `${a.provider}/${a.model}:${a.status}`).join(' → ')}`);

// 3. All providers broken → expect graceful failure with attempts trace.
console.log('\n=== Test 3: all keys broken — graceful failure ===');
const r4 = await generate('all-broken', 'ru', {
  MISTRAL_API_KEY: 'broken',
  GEMINI_API_KEY: 'broken',
  GROQ_API_KEY: 'broken',
  CEREBRAS_API_KEY: 'broken',
});
console.log(`All-broken result: ok=${r4.ok}, attempts=${r4.meta.attempts.length}, classes=${r4.meta.attempts.map((a) => a.error_class).join(',')}`);
