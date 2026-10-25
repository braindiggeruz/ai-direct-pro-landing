// Entry for the practice-quiz widget (Page.widgets 'practice-quiz'): its own
// Vite entry, which scripts/prerender.ts loads only on a page that lists the
// widget. scripts/widgets/practice-quiz-block.ts prerenders every question,
// its four options and, in a native <details>, the answer key with its
// explanation (what a reader without JavaScript and a crawler see), plus every
// message. This file reads the questions back from that HTML and makes the
// quiz interactive: a pick is checked at once and opens the explanation, the
// score follows, grade and topic narrow the list, «Restart» clears it, and
// «Explain with AI» puts the question, its options and the pick into the
// chat's composer through the prefill bridge (src/shared/chat-prefill.ts),
// never sending it. No request, no model call.
import { fillTemplate, optionLine, pickOption, quizPrefill, quizScore, shownItems, type QuizItem, type QuizPicks, type QuizView } from './logic';
import type { ChatPrefillDetail, ChatPrefillEventName } from '../../shared/chat-prefill';

const PREFILL: ChatPrefillEventName = 'gptbot:prefill';

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

interface Item extends QuizItem {
  el: HTMLElement;
  q: string;
  options: string[];
  buttons: HTMLButtonElement[];
  key: HTMLDetailsElement | null;
  feedback: HTMLElement;
  status: HTMLElement;
}

function paragraph(className: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.setAttribute('aria-live', 'polite');
  return p;
}

/** One prerendered question made interactive: each option becomes a button, then the feedback, «Explain with AI» and its note. */
function readItem(el: HTMLElement, aiLabel: string): Item | null {
  const id = el.dataset.pqItem || '';
  const answer = Number(el.dataset.answer);
  const q = el.querySelector<HTMLElement>('[data-pq-q]')?.textContent?.trim() || '';
  const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-pq-option]'));
  const list = el.querySelector<HTMLElement>('.pq-options');
  if (!id || !q || !list || rows.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  const options = rows.map((row) => row.querySelector<HTMLElement>('[data-pq-text]')?.textContent?.trim() || '');
  const buttons = rows.map((row, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.pqChoice = String(index);
    while (row.firstChild) button.appendChild(row.firstChild);
    row.appendChild(button);
    return button;
  });
  list.dataset.ready = '';
  const feedback = paragraph('pq-feedback');
  list.after(feedback);
  const tools = document.createElement('div');
  tools.className = 'pq-tools';
  const ai = document.createElement('button');
  ai.type = 'button';
  ai.dataset.pqAi = '';
  ai.textContent = aiLabel;
  const status = paragraph('pq-small');
  tools.append(ai, status);
  el.append(tools);
  const grade = el.dataset.grade ? Number(el.dataset.grade) : undefined;
  return {
    el, id, answer, q, options, buttons, feedback, status,
    grade: Number.isInteger(grade) ? grade : undefined,
    topic: el.dataset.topic || '',
    key: el.querySelector<HTMLDetailsElement>('details'),
  };
}

function bind(root: HTMLElement): void {
  const msg = root.dataset;
  const bar = root.querySelector<HTMLElement>('[data-pq-bar]');
  const score = root.querySelector<HTMLElement>('[data-pq-score]');
  if (!bar || !score) return;
  const gradeSelect = root.querySelector<HTMLSelectElement>('select[data-pq-view="grade"]');
  const topicSelect = root.querySelector<HTMLSelectElement>('select[data-pq-view="topic"]');
  const items: Item[] = [];
  root.querySelectorAll<HTMLElement>('[data-pq-item]').forEach((el) => {
    const item = readItem(el, msg.msgAi || '');
    if (item) items.push(item);
  });
  if (!items.length) return;
  const byElement = new Map(items.map((item) => [item.el, item]));
  const templates = { ask: msg.msgAiAsk || '', right: msg.msgAiRight || '', wrong: msg.msgAiWrong || '' };
  const subject = msg.pqSubject || '';
  let picks: QuizPicks = {};
  let view: QuizView = { grade: null, topic: null };

  const showScore = () => {
    const result = quizScore(shownItems(items, view), picks);
    let text = msg.msgScore || '';
    if (!result.total) text = msg.msgNone || '';
    else if (!result.answered) text = msg.msgCount || '';
    else if (result.answered === result.total) text = msg.msgDone || '';
    score.textContent = fillTemplate(text, { total: result.total, answered: result.answered, correct: result.correct });
  };

  const choose = (item: Item, choice: number) => {
    const outcome = pickOption(picks, item, choice);
    if (!outcome.counted) return;
    picks = outcome.picks;
    item.el.dataset.state = outcome.right ? 'right' : 'wrong';
    item.buttons.forEach((button, index) => {
      button.setAttribute('aria-disabled', 'true');
      if (index === item.answer) button.dataset.mark = 'right';
      else if (index === choice) button.dataset.mark = 'wrong';
    });
    item.feedback.textContent = outcome.right ? msg.msgRight || '' : fillTemplate(msg.msgWrong || '', { key: optionLine(item.options, item.answer) });
    item.feedback.dataset.tone = outcome.right ? 'right' : 'wrong';
    if (item.key) item.key.open = true;
    showScore();
  };

  const applyView = () => {
    view = {
      grade: gradeSelect?.value ? Number(gradeSelect.value) : null,
      topic: topicSelect?.value ? topicSelect.value : null,
    };
    const shown = new Set(shownItems(items, view));
    for (const item of items) item.el.hidden = shown.has(item) === false;
    showScore();
  };

  const restart = () => {
    picks = {};
    for (const item of items) {
      delete item.el.dataset.state;
      for (const button of item.buttons) {
        button.removeAttribute('aria-disabled');
        delete button.dataset.mark;
      }
      item.feedback.textContent = '';
      delete item.feedback.dataset.tone;
      item.status.textContent = '';
      if (item.key) item.key.open = false;
    }
    showScore();
    items.find((item) => item.el.hidden === false)?.buttons[0]?.focus();
  };

  const explain = (item: Item) => {
    const chosen = Object.prototype.hasOwnProperty.call(picks, item.id) ? picks[item.id] : undefined;
    const text = quizPrefill(templates, subject, item, chosen);
    if (askChat(text)) {
      item.status.textContent = msg.msgAiSent || '';
      showChat();
    } else {
      item.status.textContent = msg.msgAiWait || '';
    }
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    const item = byElement.get(button.closest<HTMLElement>('[data-pq-item]') as HTMLElement);
    if (button.dataset.pqChoice !== undefined && item) choose(item, Number(button.dataset.pqChoice));
    else if (button.dataset.pqAi !== undefined && item) explain(item);
    else if (button.dataset.pqAction === 'restart') restart();
  });
  gradeSelect?.addEventListener('change', applyView);
  topicSelect?.addEventListener('change', applyView);

  bar.hidden = false;
  showScore();
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-practice-quiz]').forEach(bind);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
