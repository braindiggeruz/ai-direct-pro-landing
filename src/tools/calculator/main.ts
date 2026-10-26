// Entry for the calculator widget (Page.widgets 'calculator'): its own Vite
// entry, which scripts/prerender.ts loads only on a page that lists the
// widget. The markup and every message are prerendered by
// scripts/widgets/calculator-block.ts; this file binds the keys, the field,
// DEG/RAD, the history (the last 10, in memory only) and «Explain with AI».
// The arithmetic is src/tools/calculator/engine.ts: no eval, no request, no
// model call. «Explain with AI» puts the example into the chat's composer
// through the prefill bridge (src/shared/chat-prefill.ts) and never sends it.
// GA4 hears the first result and the first hand-over to the chat (Ш4), never
// the example.
import { calculate, usesAngles, type AngleUnit, type CalcErrorCode } from './engine';
import type { ChatPrefillDetail, ChatPrefillEventName } from '../../shared/chat-prefill';

const PREFILL: ChatPrefillEventName = 'gptbot:prefill';
const HISTORY_SIZE = 10;

/** Ш4: the steps GA4 hears about, each once per page view. */
type WidgetEvent = 'calc_used' | 'calc_ai_clicked';
const reported = new Set<WidgetEvent>();

/**
 * One GA4 event, the first time the step happens on this page view: its fixed
 * name, the page's path and language; nothing typed or chosen. In
 * this file on purpose: a module the widgets shared would become a chunk of its own.
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

/** data-msg-err-div-zero → msgErrDivZero. */
function errorKey(code: CalcErrorCode): string {
  return `msgErr${code.replace(/(^|-)([a-z])/g, (_, __, letter: string) => letter.toUpperCase())}`;
}

const KEY_CHARACTERS = /^[0-9+\-*/^().,%]$/;

function bind(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('#calc-in');
  const output = root.querySelector<HTMLOutputElement>('[data-calc-result]');
  const status = root.querySelector<HTMLElement>('[data-calc-status]');
  const historyBox = root.querySelector<HTMLElement>('[data-calc-history-box]');
  const historyList = root.querySelector<HTMLElement>('[data-calc-history]');
  if (!input || !output || !status || !historyBox || !historyList) return;
  const msg = root.dataset;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  let angle: AngleUnit = 'deg';
  let caret = { start: input.value.length, end: input.value.length };
  const history: Array<{ expression: string; result: string }> = [];

  const say = (text: string | undefined, tone?: 'error') => {
    status.textContent = text || '';
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };
  const remember = () => {
    caret = { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length };
  };
  const place = (position: number) => {
    caret = { start: position, end: position };
    // A phone's keyboard would cover the keys: the field takes focus only with a mouse.
    if (!coarse) {
      input.focus();
      input.setSelectionRange(position, position);
    }
  };

  /** The result as the expression is typed; errors wait for = or Enter. */
  const preview = () => {
    const expression = input.value.trim();
    const result = expression ? calculate(expression, { angle }) : null;
    output.value = result?.ok ? result.text : '';
  };

  const renderHistory = () => {
    historyList.replaceChildren(...history.map((entry, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.calcRecall = String(index);
      button.textContent = `${entry.expression} = ${entry.result}`;
      item.append(button);
      return item;
    }));
    historyBox.hidden = history.length === 0;
  };

  /** = or Enter: the result, or what is wrong, and the history. */
  const run = (): { expression: string; text?: string } => {
    const expression = input.value.trim();
    const result = calculate(expression, { angle });
    if (!result.ok) {
      output.value = '';
      say((msg[errorKey(result.code)] || msg.msgErrMissingOperand || '').replace('{token}', result.token), 'error');
      return { expression };
    }
    output.value = result.text;
    say('');
    report('calc_used');
    if (history[0]?.expression !== expression || history[0]?.result !== result.text) {
      history.unshift({ expression, result: result.text });
      history.length = Math.min(history.length, HISTORY_SIZE);
      renderHistory();
    }
    return { expression, text: result.text };
  };

  const insert = (text: string) => {
    const value = input.value;
    const start = Math.min(caret.start, value.length);
    const end = Math.min(Math.max(caret.end, start), value.length);
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > input.maxLength && input.maxLength > 0) return;
    input.value = next;
    place(start + text.length);
    preview();
  };

  const back = () => {
    const value = input.value;
    const start = Math.min(caret.start, value.length);
    const end = Math.min(Math.max(caret.end, start), value.length);
    if (start === end && start === 0) return;
    const from = start === end ? start - 1 : start;
    input.value = value.slice(0, from) + value.slice(end);
    place(from);
    preview();
  };

  const clear = () => {
    input.value = '';
    output.value = '';
    say('');
    place(0);
  };

  const explain = () => {
    const expression = input.value.trim();
    if (!expression) { say(msg.msgAiEmpty); return; }
    const { text } = run();
    const angles = usesAngles(expression) ? ` ${angle === 'deg' ? msg.msgAiDeg || '' : msg.msgAiRad || ''}`.trimEnd() : '';
    const prompt = text
      ? `${(msg.msgAiPrompt || '').replace('{expression}', expression).replace('{result}', text)}${angles}`
      : (msg.msgAiFix || '').replace('{expression}', expression);
    if (!prompt.trim()) return;
    if (askChat(prompt)) {
      report('calc_ai_clicked');
      say(msg.msgAiSent);
      showChat();
    } else {
      say(msg.msgAiWait, 'error');
    }
  };

  const setAngle = (next: AngleUnit) => {
    angle = next;
    root.querySelectorAll<HTMLButtonElement>('button[data-calc-angle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.calcAngle === next));
    });
    preview();
  };

  for (const type of ['select', 'keyup', 'click', 'input', 'blur'] as const) input.addEventListener(type, remember);
  input.addEventListener('input', () => { say(''); preview(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); run(); }
    else if (event.key === 'Escape') { event.preventDefault(); clear(); }
  });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    const { calcKey, calcAction, calcAngle, calcRecall } = button.dataset;
    if (calcKey !== undefined) insert(calcKey);
    else if (calcAngle === 'deg' || calcAngle === 'rad') setAngle(calcAngle);
    else if (calcRecall !== undefined) {
      const entry = history[Number(calcRecall)];
      if (!entry) return;
      input.value = entry.expression;
      output.value = entry.result;
      say('');
      place(entry.expression.length);
    } else if (calcAction === 'equals') run();
    else if (calcAction === 'clear') clear();
    else if (calcAction === 'back') back();
    else if (calcAction === 'ai') explain();
  });

  // The keyboard works on the keys too: digits and signs go into the field.
  root.addEventListener('keydown', (event) => {
    if (event.target === input || event.ctrlKey || event.metaKey || event.altKey) return;
    if (KEY_CHARACTERS.test(event.key)) { event.preventDefault(); insert(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); back(); }
    else if (event.key === 'Escape') { event.preventDefault(); clear(); }
  });
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-calculator]').forEach(bind);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
