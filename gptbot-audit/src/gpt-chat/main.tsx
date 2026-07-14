// Entry for the AI-chat island. Built as a SEPARATE Vite entry so money/
// product pages stay static and only the chat pages load this bundle.
// Mounts into <div id="gpt-chat-root" data-locale="ru|uz"> which the
// prerenderer injects on pageType === 'gpt-chat'.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AiChatConsole } from './components/AiChatConsole';
import type { Locale, MountConfig } from './types';

function readConfig(el: HTMLElement): MountConfig {
  const locale = (el.dataset.locale === 'uz' ? 'uz' : 'ru') as Locale;
  return {
    locale,
    apiBase: el.dataset.apiBase || '',
    turnstileSiteKey: el.dataset.turnstileSitekey || undefined,
  };
}

function mount() {
  const el = document.getElementById('gpt-chat-root');
  if (!el) return;
  const config = readConfig(el);
  el.innerHTML = ''; // clear the no-JS fallback
  createRoot(el).render(
    <StrictMode>
      <AiChatConsole config={config} />
    </StrictMode>,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
