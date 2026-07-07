// Single-purpose OpenRouter caller for the AI Draft Inbox optimiser.
// Server-side only — the key is read from env.OPENROUTER_API_KEY and never
// surfaces to the SPA.

import type { Env } from '../../_types';

interface OpenRouterEnv extends Env {
  OPENROUTER_API_KEY?: string;
  AI_OPTIMIZER_MODEL?: string;
  OPENROUTER_MODEL_QUALITY?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_TITLE?: string;
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const FALLBACK_MODEL = 'openai/gpt-4o';
const MAX_OUTPUT_TOKENS = 8000;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 75_000;

interface ChatResp {
  choices?: { message?: { content?: string } }[];
}

export interface LlmCallResult {
  ok: boolean;
  model: string;
  content: string;
  status?: number;
  error?: string;
}

function pickModel(env: OpenRouterEnv): string {
  return env.AI_OPTIMIZER_MODEL || DEFAULT_MODEL;
}

async function callOnce(
  env: OpenRouterEnv,
  model: string,
  system: string,
  user: string,
): Promise<LlmCallResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.OPENROUTER_SITE_URL || 'https://gptbot.uz',
        'X-Title': env.OPENROUTER_APP_TITLE || 'GPTBot SEO Cockpit',
      },
      body: JSON.stringify({
        model,
        temperature: TEMPERATURE,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!resp.ok) {
      const detail = (await resp.text().catch((e) => { console.warn('[optimizer] failed to read error response body:', (e as Error).message); return ''; })).slice(0, 600);
      return { ok: false, model, content: '', status: resp.status, error: detail || `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as ChatResp;
    const content = data.choices?.[0]?.message?.content || '';
    return { ok: true, model, content };
  } catch (e) {
    const err = (e as Error).message || 'fetch failed';
    return { ok: false, model, content: '', error: err };
  } finally {
    clearTimeout(timer);
  }
}

/** Try preferred model first; fall back to the cheap model on upstream error. */
export async function optimiseWithOpenRouter(
  env: OpenRouterEnv,
  system: string,
  user: string,
): Promise<LlmCallResult> {
  const primary = pickModel(env);
  const first = await callOnce(env, primary, system, user);
  if (first.ok) return first;
  if (primary === FALLBACK_MODEL) return first;
  const second = await callOnce(env, FALLBACK_MODEL, system, user);
  if (second.ok) return second;
  return first.error ? first : second;
}

/** Strip ```json ... ``` fences if the model added them, then JSON.parse. */
export function parseStrictJson(text: string): unknown {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (e) {
    console.warn('[optimizer] primary JSON.parse failed, attempting salvage:', (e as Error).message);
  }
  // Salvage path — find the largest {...} substring.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {
      console.warn('[optimizer] salvage JSON.parse failed:', (e as Error).message);
    }
  }
  return null;
}
