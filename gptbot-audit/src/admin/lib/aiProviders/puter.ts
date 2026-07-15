// Puter Free LLM provider.
//
// IMPORTANT SECURITY RULES:
//   - Puter.js MUST NOT be loaded on public pages. This module dynamically
//     injects the script tag at runtime, only after the admin SPA has rendered
//     the AI Autopilot tab.
//   - All output is untrusted and must pass /api/seo/ai/validate-patch on the
//     backend before any field is shown to the operator as approvable.
//   - No API key is required by Puter — but if their service is offline we
//     fail gracefully and fall back to the Mock provider.
//
// Docs: https://puter.com/dev/docs (Puter.js v2)

import type { AiProviderClient } from './types';

const PUTER_SRC = 'https://js.puter.com/v2/';

declare global {
  interface Window {
    puter?: {
      ai?: {
        chat: (
          prompt: string | Array<{ role: string; content: string }>,
          options?: { model?: string; temperature?: number; max_tokens?: number },
        ) => Promise<unknown>;
        listModels?: () => Promise<string[] | { models?: string[] }>;
      };
    };
  }
}

let loaderPromise: Promise<boolean> | null = null;

/** Load Puter.js once. Resolves to true on success, false on any failure. */
export function loadPuter(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.puter?.ai?.chat) return Promise.resolve(true);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<boolean>((resolve) => {
    try {
      // Defensive: never load on public surfaces.
      if (!location.pathname.startsWith('/admin-tools/')) {
        resolve(false);
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${PUTER_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(!!window.puter?.ai?.chat), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = PUTER_SRC;
      s.async = true;
      s.dataset.tag = 'puter-admin';
      s.onload = () => resolve(!!window.puter?.ai?.chat);
      s.onerror = () => resolve(false);
      // 12s safety net.
      const t = setTimeout(() => resolve(!!window.puter?.ai?.chat), 12_000);
      s.addEventListener('load', () => clearTimeout(t));
      document.head.appendChild(s);
    } catch {
      resolve(false);
    }
  });
  return loaderPromise;
}

function extractText(resp: unknown): string {
  if (resp == null) return '';
  if (typeof resp === 'string') return resp;
  if (typeof resp === 'object') {
    const r = resp as Record<string, unknown>;
    if (typeof r.message === 'object' && r.message) {
      const m = r.message as Record<string, unknown>;
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((p) => (typeof p === 'string' ? p : (p as { text?: string }).text || ''))
          .join('');
      }
    }
    if (typeof r.text === 'string') return r.text;
    if (typeof r.content === 'string') return r.content;
    if (Array.isArray(r.choices)) {
      const c = (r.choices[0] as { message?: { content?: string } } | undefined)?.message?.content;
      if (typeof c === 'string') return c;
    }
  }
  // Last-resort: stringify so the caller still sees something parsable.
  try { return JSON.stringify(resp); } catch { return ''; }
}

let cachedModel = '';

export const PuterProvider: AiProviderClient = {
  id: 'puter',

  async isAvailable() {
    return await loadPuter();
  },

  async modelHint() {
    if (cachedModel) return cachedModel;
    const ok = await loadPuter();
    if (!ok) return '';
    try {
      const list = await window.puter?.ai?.listModels?.();
      if (Array.isArray(list) && list.length) { cachedModel = String(list[0]); return cachedModel; }
      if (list && typeof list === 'object' && Array.isArray((list as { models?: string[] }).models)) {
        const arr = (list as { models?: string[] }).models || [];
        if (arr.length) { cachedModel = String(arr[0]); return cachedModel; }
      }
    } catch { /* swallow */ }
    return '';
  },

  async generate({ systemPrompt, userPrompt, maxTokens = 900 }) {
    const ok = await loadPuter();
    if (!ok || !window.puter?.ai?.chat) {
      throw new Error('Puter.js not available');
    }
    // Use the messages overload for stronger system-prompt adherence.
    const resp = await window.puter.ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.4, max_tokens: maxTokens },
    );
    const text = extractText(resp);
    return { text, model: cachedModel || undefined };
  },
};
