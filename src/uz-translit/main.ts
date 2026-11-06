// Entry for the Uzbek Cyrillic ↔ Latin converter on the translator pages.
// A separate Vite entry (vite.config.ts) that scripts/prerender.ts loads only
// on a gpt-chat page with a chatRole that lists the 'uz-translit' widget
// (Page.widgets, scripts/tool-widgets.ts), so no other page, the chat bundle
// included, gets heavier. The markup and its messages are prerendered by
// scripts/translator-page.ts; this file only binds the buttons. Everything
// runs in the browser: no request, and no analytics event carries the text.
// After a conversion one quiet line offers the AI chat (Ш10): its button puts
// the request with the result into the chat's composer through the prefill
// bridge (src/shared/chat-prefill.ts) and never sends it.
import { normalizeLatin, scriptNotes, toCyrillic, toLatin, type ScriptNote } from '../shared/uz-translit';
import type { ChatPrefillDetail, ChatPrefillEventName } from '../shared/chat-prefill';
import { prepareTranslation } from './translation-prompt';

type Action = 'latin' | 'cyrillic' | 'normalize' | 'copy' | 'ai';

const PREFILL: ChatPrefillEventName = 'gptbot:prefill';
/** CHAT_PREFILL_MAX (src/shared/chat-prefill.ts, a type-only import here): the chat takes no longer text. */
const PREFILL_MAX = 1500;

/** Ш4: the steps GA4 hears about, each once per page view. */
type WidgetEvent = 'translit_converted' | 'translit_ai_clicked';
const reported = new Set<WidgetEvent>();

/**
 * One GA4 event, the first time the step happens on this page view: its fixed
 * name, the page's path and language, nothing typed or converted. In this
 * file on purpose: a module the widgets shared would become a chunk of its own.
 */
function report(event: WidgetEvent): void {
  if (reported.has(event)) return;
  reported.add(event);
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };
    const data = { route: location.pathname, lang: document.documentElement.lang.slice(0, 2) };
    if (typeof w.gtag === 'function') w.gtag('event', event, data);
    else (w.dataLayer ??= []).push({ event, ...data });
  } catch { /* Analytics never stops the tool. */ }
}

/** Puts text into the chat's composer; false when the chat is still loading or busy. */
function askChat(text: string): boolean {
  const detail: ChatPrefillDetail = { text };
  window.dispatchEvent(new CustomEvent(PREFILL, { detail }));
  return detail.accepted === true;
}

function showChat(): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('main')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

function bind(root: HTMLElement): void {
  const input = root.querySelector<HTMLTextAreaElement>('#uzt-in');
  const output = root.querySelector<HTMLTextAreaElement>('#uzt-out');
  const status = root.querySelector<HTMLElement>('[data-uzt-status]');
  if (!input || !output || !status) return;
  const aiLine = root.querySelector<HTMLElement>('[data-uzt-ai]');
  const message = root.dataset;
  const say = (text: string | undefined) => { status.textContent = text || ''; };
  const noteText = (note: ScriptNote) => (note === 'russian-letters' ? message.msgRussian : message.msgForeign);

  const copy = async () => {
    if (!output.value) { say(message.msgEmpty); return; }
    try {
      await navigator.clipboard.writeText(output.value);
      say(message.msgCopied);
    } catch {
      output.focus();
      output.select();
      say(message.msgCopyFailed);
    }
  };

  /** The result into the chat's composer, with the page's request around it. */
  const askAi = () => {
    const text = output.value.trim();
    if (!text) { say(message.msgEmpty); return; }
    // A function, so a «$&» in the text stays the text.
    const prompt = (message.msgAiPrompt || '').replace('{text}', () => text);
    if (!message.msgAiPrompt) return;
    if (prompt.length > PREFILL_MAX) { say(message.msgAiLong); return; }
    if (askChat(prompt)) {
      report('translit_ai_clicked');
      say(message.msgAiSent);
      showChat();
    } else {
      say(message.msgAiWait);
    }
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-uzt]');
    if (!button || !root.contains(button)) return;
    const action = button.dataset.uzt as Action;
    if (action === 'copy') { void copy(); return; }
    if (action === 'ai') { askAi(); return; }
    const text = input.value;
    if (!text.trim()) { output.value = ''; say(message.msgEmpty); return; }
    let notes: ScriptNote[] = [];
    if (action === 'latin') {
      output.value = toLatin(text);
      notes = scriptNotes(text, 'latin');
    } else if (action === 'cyrillic') {
      output.value = toCyrillic(text);
      notes = scriptNotes(text, 'cyrillic');
    } else if (action === 'normalize') {
      output.value = normalizeLatin(text);
    } else {
      return;
    }
    say(notes.length ? notes.map(noteText).join(' ') : message.msgDone);
    report('translit_converted');
    if (aiLine) aiLine.hidden = false;
  });
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-uz-translit]').forEach(bind);
  document.querySelectorAll<HTMLElement>('[data-translation-task]').forEach(bindTranslationTask);
}

/** Page-specific task controls; the visitor must review and send in the chat. */
function bindTranslationTask(root: HTMLElement): void {
  const text = root.querySelector<HTMLTextAreaElement>('#translation-source');
  const direction = root.querySelector<HTMLSelectElement>('#translation-direction');
  const script = root.querySelector<HTMLSelectElement>('#translation-script');
  const style = root.querySelector<HTMLSelectElement>('#translation-style');
  const prepare = root.querySelector<HTMLButtonElement>('[data-translation-prepare]');
  const sample = root.querySelector<HTMLButtonElement>('[data-translation-sample]');
  const status = root.querySelector<HTMLElement>('[data-translation-status]');
  if (!text || !direction || !script || !style || !prepare || !sample || !status) return;
  const locale = document.documentElement.lang.startsWith('uz') ? 'uz' : 'ru';
  const updateDirection = () => { script.disabled = direction.value === 'uz-ru'; };
  direction.addEventListener('change', updateDirection);
  updateDirection();
  sample.addEventListener('click', () => {
    text.value = direction.value === 'uz-ru'
      ? 'Salom! Uchrashuv 12-noyabr kuni soat 15:30 da bo‘ladi. Iltimos, ishtirokingizni tasdiqlang. Narxi — 250 000 so‘m.'
      : 'Здравствуйте! Встреча состоится 12 ноября в 15:30. Пожалуйста, подтвердите участие. Стоимость — 250 000 сум.';
    status.textContent = '';
    text.focus();
  });
  prepare.addEventListener('click', () => {
    const task = prepareTranslation({ text: text.value, direction: direction.value, script: script.value, style: style.value }, locale);
    if (!task.ok) {
      status.textContent = root.dataset[`msg${task.reason[0].toUpperCase()}${task.reason.slice(1)}`] || '';
      text.focus();
      return;
    }
    if (!askChat(task.prompt)) { status.textContent = root.dataset.msgWait || ''; return; }
    status.textContent = root.dataset.msgPrepared || '';
    showChat();
  });
  prepare.disabled = false;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
