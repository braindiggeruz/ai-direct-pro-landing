#!/usr/bin/env node
const fs = require('fs');
let c = fs.readFileSync('src/gpt-chat/components/AiChatConsole.tsx', 'utf-8');

// Fix 1: Add clearSessionId import
c = c.replace(
  'import { loadHistory, saveHistory, loadSessionId, saveSessionId, loadRemaining, saveRemaining } from',
  'import { loadHistory, saveHistory, loadSessionId, saveSessionId, clearSessionId, loadRemaining, saveRemaining } from'
);

// Fix 2: Replace saveSessionId(null) with clearSessionId
c = c.replace(
  'setSessionId(null);\n    saveSessionId(null, config.locale);',
  'setSessionId(null);\n    clearSessionId(config.locale);'
);

// Fix 3: Insert clear-chat button before the language switcher div
// Find the pattern: <div className="flex items-center gap-2">
//                     <div className="flex items-center rounded-xl bg-white/[0.04] overflow-hidden text-[11px]"
const marker = '<div className="flex items-center gap-2">';
const langMarker = 'flex items-center rounded-xl bg-white/[0.04] overflow-hidden text-[11px]';

const markerIdx = c.indexOf(marker);
if (markerIdx === -1) {
  console.error('Cannot find flex items-center gap-2 marker');
  process.exit(1);
}

// Find the langMarker after the topbar marker
const langIdx = c.indexOf(langMarker, markerIdx);
if (langIdx === -1) {
  console.error('Cannot find language switcher marker');
  process.exit(1);
}

// Insert the clear-chat button before the language switcher
const buttonHtml = `<button type="button" onClick={onClearChat} disabled={busy || messages.length === 0} aria-label={config.locale === 'uz' ? 'Chatni tozalash' : '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0447\u0430\u0442'} title={config.locale === 'uz' ? 'Chatni tozalash' : '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0447\u0430\u0442'} className="min-h-11 w-11 inline-flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
          `;

c = c.slice(0, langIdx) + buttonHtml + c.slice(langIdx);

fs.writeFileSync('src/gpt-chat/components/AiChatConsole.tsx', c);
console.log('AiChatConsole.tsx fixed: clearSessionId + button inserted');
