// The irregular-verbs widget's logic, free of the page: the 10-question quiz
// (a verb and the form to write, V2 or V3), answer checking that takes every
// standard form, the score, the search filter, and the message templates.
// src/tools/irregular-verbs/main.ts binds it to the prerendered table.

/** A row of the table as the widget reads it back: three forms and the page's translation. */
export interface QuizVerb {
  v1: string;
  v2: string;
  v3: string;
  tr: string;
}
export type QuizForm = 'v2' | 'v3';
export interface QuizQuestion {
  verb: QuizVerb;
  form: QuizForm;
}

export const QUIZ_LENGTH = 10;

/**
 * Ten different verbs in random order, each asking for V2 or V3 (about half
 * each). `random` is Math.random in the page and a seeded generator in tests.
 */
export function makeQuiz(verbs: readonly QuizVerb[], count = QUIZ_LENGTH, random: () => number = Math.random): QuizQuestion[] {
  const pool = [...verbs];
  const size = Math.min(count, pool.length);
  // A partial Fisher–Yates shuffle: the first `size` places are a uniform sample.
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size).map((verb) => ({ verb, form: random() < 0.5 ? 'v2' : 'v3' }));
}

/** An answer or a form as compared: small letters, single spaces, typographic apostrophes as ASCII. */
export function normalizeAnswer(text: string): string {
  return text.toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
}

/** The forms a cell allows: «got/gotten» → got, gotten. */
export function formsOf(cell: string): string[] {
  return cell.split('/').map(normalizeAnswer).filter(Boolean);
}

/**
 * Whether an answer is right: every form written is a standard one, and there
 * is at least one. «was», «were», «was/were», «were, was» are all right for be.
 */
export function isCorrect(question: QuizQuestion, answer: string): boolean {
  const allowed = new Set(formsOf(question.verb[question.form]));
  const given = normalizeAnswer(answer).split(/\s*[/,;]\s*|\s+or\s+|\s+/).filter(Boolean);
  return given.length > 0 && given.every((form) => allowed.has(form));
}

export interface QuizState {
  questions: QuizQuestion[];
  /** The question shown (questions.length once the quiz is over). */
  index: number;
  correct: number;
  /** The base forms answered wrongly, in order, each once. */
  mistakes: string[];
}

export function startQuiz(questions: QuizQuestion[]): QuizState {
  return { questions, index: 0, correct: 0, mistakes: [] };
}

/** Records the answer to the current question and moves on: the new state and whether it was right. */
export function answerQuiz(state: QuizState, answer: string): { state: QuizState; right: boolean; expected: string } {
  const question = state.questions[state.index];
  if (!question) return { state, right: false, expected: '' };
  const right = isCorrect(question, answer);
  const mistakes = right || state.mistakes.includes(question.verb.v1) ? state.mistakes : [...state.mistakes, question.verb.v1];
  return {
    state: { ...state, index: state.index + 1, correct: state.correct + (right ? 1 : 0), mistakes },
    right,
    expected: question.verb[question.form],
  };
}

export function quizOver(state: QuizState): boolean {
  return state.index >= state.questions.length;
}

/** The search filter: a row matches when any of its forms or its translation contains the query. */
export function matchesVerb(verb: QuizVerb, query: string): boolean {
  const q = normalizeAnswer(query);
  if (!q) return true;
  return [verb.v1, verb.v2, verb.v3, verb.tr].some((cell) => normalizeAnswer(cell).includes(q));
}

/** A message template from the page with its {name} slots filled; a slot without a value stays empty. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in values ? String(values[name]) : ''));
}
