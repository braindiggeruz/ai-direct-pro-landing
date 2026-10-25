// Entry for the irregular-verbs widget (Page.widgets 'irregular-verbs'): its
// own Vite entry, which scripts/prerender.ts loads only on a page that lists
// the widget. scripts/widgets/irregular-verbs-block.ts prerenders the table
// (the content a reader and a crawler see without JavaScript) and every
// message; this file reads the rows back from the table and binds the
// search, the «hide a column» practice, the 10-question quiz and «Practise
// with AI», which puts a request into the chat's composer through the prefill
// bridge (src/shared/chat-prefill.ts) and never sends it. No request, no model call.
import { answerQuiz, fillTemplate, makeQuiz, matchesVerb, quizOver, startQuiz, type QuizState, type QuizVerb } from './quiz';
import type { ChatPrefillDetail, ChatPrefillEventName } from '../../shared/chat-prefill';

const PREFILL: ChatPrefillEventName = 'gptbot:prefill';
type Column = 'v1' | 'v2' | 'v3' | 'tr';
const COLUMNS: readonly Column[] = ['v1', 'v2', 'v3', 'tr'];

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
  const verbTable = root.querySelector<HTMLTableElement>('table[data-iv-table]');
  const search = root.querySelector<HTMLInputElement>('#iv-search');
  const count = root.querySelector<HTMLElement>('[data-iv-count]');
  const status = root.querySelector<HTMLElement>('[data-iv-status]');
  const quiz = root.querySelector<HTMLElement>('[data-iv-quiz]');
  if (!verbTable || !search || !count || !status || !quiz) return;
  const msg = root.dataset;
  const rows = Array.from(verbTable.tBodies[0]?.rows ?? []).map((row) => {
    const cell = (column: Column) => row.querySelector<HTMLElement>(`td[data-col="${column}"]`)?.textContent?.trim() || '';
    const verb: QuizVerb = { v1: cell('v1'), v2: cell('v2'), v3: cell('v3'), tr: cell('tr') };
    return { row, verb };
  }).filter(({ verb }) => verb.v1 && verb.v2 && verb.v3);
  const verbs = rows.map(({ verb }) => verb);

  // Search: the rows that match stay, with their number said once typing stops.
  search.addEventListener('input', () => {
    const query = search.value;
    let shown = 0;
    for (const { row, verb } of rows) {
      const match = matchesVerb(verb, query);
      row.hidden = !match;
      if (match) shown++;
    }
    count.textContent = query.trim() ? fillTemplate(shown ? msg.msgFound || '' : msg.msgNone || '', { count: shown }) : '';
  });

  // Practice: one column hidden; a hidden cell shows its answer on a click, Enter or Space.
  const hide = (column: Column | 'none') => {
    if (column === 'none') delete verbTable.dataset.hide;
    else verbTable.dataset.hide = column;
    root.querySelectorAll<HTMLButtonElement>('button[data-iv-hide]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.ivHide === column));
    });
    for (const { row } of rows) {
      for (const td of Array.from(row.querySelectorAll<HTMLElement>('td[data-col]'))) {
        delete td.dataset.shown;
        if (td.dataset.col === column) {
          td.tabIndex = 0;
          td.title = msg.msgReveal || '';
        } else {
          td.removeAttribute('tabindex');
          td.removeAttribute('title');
        }
      }
    }
  };
  const reveal = (target: EventTarget | null) => {
    const td = (target as Element | null)?.closest<HTMLElement>('td[data-col]');
    if (!td || !verbTable.dataset.hide || td.dataset.col !== verbTable.dataset.hide) return false;
    if (td.dataset.shown) delete td.dataset.shown;
    else td.dataset.shown = '';
    return true;
  };
  verbTable.addEventListener('click', (event) => { reveal(event.target); });
  verbTable.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && reveal(event.target)) event.preventDefault();
  });

  // The quiz.
  const question = quiz.querySelector<HTMLElement>('[data-iv-question]');
  const prompt = quiz.querySelector<HTMLElement>('[data-iv-prompt]');
  const answer = quiz.querySelector<HTMLInputElement>('#iv-answer');
  const feedback = quiz.querySelector<HTMLElement>('[data-iv-feedback]');
  const result = quiz.querySelector<HTMLElement>('[data-iv-result]');
  const score = quiz.querySelector<HTMLElement>('[data-iv-score]');
  const check = quiz.querySelector<HTMLButtonElement>('[data-iv-action="check"]');
  const next = quiz.querySelector<HTMLButtonElement>('[data-iv-action="next"]');
  const begin = quiz.querySelector<HTMLButtonElement>('[data-iv-action="start"]');
  if (!question || !prompt || !answer || !feedback || !result || !score || !check || !next || !begin) return;
  let state: QuizState | null = null;
  let lastMistakes: string[] = [];

  const ask = () => {
    if (!state) return;
    const current = state.questions[state.index];
    prompt.textContent = fillTemplate(msg.msgAsk || '', {
      n: state.index + 1,
      total: state.questions.length,
      v1: current.verb.v1,
      tr: current.verb.tr,
      form: current.form === 'v2' ? msg.msgFormV2 || 'V2' : msg.msgFormV3 || 'V3',
    });
    answer.value = '';
    answer.disabled = false;
    feedback.textContent = '';
    delete feedback.dataset.tone;
    check.hidden = false;
    next.hidden = true;
    answer.focus();
  };
  const finish = () => {
    if (!state) return;
    lastMistakes = state.mistakes;
    question.hidden = true;
    result.hidden = false;
    const line = fillTemplate(msg.msgScore || '', { score: state.correct, total: state.questions.length });
    score.textContent = lastMistakes.length ? `${line} ${fillTemplate(msg.msgMistakes || '', { list: lastMistakes.join(', ') })}` : line;
    score.focus();
  };
  const startNew = () => {
    if (!verbs.length) return;
    state = startQuiz(makeQuiz(verbs));
    begin.hidden = true;
    result.hidden = true;
    question.hidden = false;
    ask();
  };
  const submit = () => {
    if (!state || quizOver(state) || answer.disabled) return;
    if (!answer.value.trim()) { feedback.textContent = msg.msgEmpty || ''; return; }
    const outcome = answerQuiz(state, answer.value);
    state = outcome.state;
    answer.disabled = true;
    feedback.textContent = outcome.right ? msg.msgRight || '' : fillTemplate(msg.msgWrong || '', { answer: outcome.expected });
    feedback.dataset.tone = outcome.right ? 'right' : 'wrong';
    check.hidden = true;
    next.hidden = false;
    next.focus();
  };

  answer.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
  });

  const practise = () => {
    const text = lastMistakes.length
      ? fillTemplate(msg.msgAiMistakes || '', { list: lastMistakes.join(', ') })
      : msg.msgAiPrompt || '';
    if (!text.trim()) return;
    if (askChat(text)) {
      status.textContent = msg.msgAiSent || '';
      showChat();
    } else {
      status.textContent = msg.msgAiWait || '';
    }
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    const { ivHide, ivAction } = button.dataset;
    if (ivHide === 'none' || COLUMNS.includes(ivHide as Column)) hide(ivHide as Column | 'none');
    else if (ivAction === 'start') startNew();
    else if (ivAction === 'check') submit();
    else if (ivAction === 'next') {
      if (state && quizOver(state)) finish();
      else ask();
    } else if (ivAction === 'ai') practise();
  });
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-irregular-verbs]').forEach(bind);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
