// Entry for the AI-chat island. Built as a SEPARATE Vite entry so money/
// product pages stay static and only the chat pages load this bundle.
// Mounts into <div id="gpt-chat-root" data-locale="ru|uz"> which the
// prerenderer injects on pageType === 'gpt-chat'.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AiChatConsole } from './components/AiChatConsole';
import type { Locale, MountConfig } from './types';
// The chat's own stylesheet (chat design 2026-10-06): Vite emits it beside
// this entry and scripts/prerender.ts links it on the two chat pages only, so
// no other page downloads the chat's rules. The site's sheet comes first.
import './premium.css';
import './account/account.css';
import './article.css';

function readConfig(el: HTMLElement): MountConfig {
  const locale = (el.dataset.locale === 'uz' ? 'uz' : 'ru') as Locale;
  return {
    locale,
    apiBase: el.dataset.apiBase || '',
    turnstileSiteKey: el.dataset.turnstileSitekey || undefined,
    h1: el.dataset.h1 || undefined,
  };
}

function mount() {
  const el = document.getElementById('gpt-chat-root');
  if (!el) return;
  const config = readConfig(el);
  // The prerendered frame stays until React's first commit, which replaces it
  // in one go (createRoot clears its container then): no blank frame between
  // the frame and the chat, and the H1 stays where it is (UX plan REV-3).
  createRoot(el).render(
    <StrictMode>
      <AiChatConsole config={config} />
    </StrictMode>,
  );
}

// The frame paints first, then the chat mounts, a frame later: on a slow
// phone the script can be here before the stylesheets, and the first paint
// would wait for React (chat design §9.2, LCP). A hidden tab paints no
// frames, so a timer mounts it there.
function start() {
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    mount();
  };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
