// The practice quiz's logic, free of the page: the picks (a question keeps its
// first one), the score, the choice by grade and topic, and the text
// «AI bilan tushuntirish / Объяснить с AI» puts into the chat's composer.
// src/tools/quiz/main.ts binds it to the prerendered questions; the build
// (scripts/widgets/practice-quiz-block.ts) renders the same option lines and
// checks with the same text that every question's request fits the composer.

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** A question as the score and the choice see it. */
export interface QuizItem {
  id: string;
  grade?: number;
  topic: string;
  /** The index of the correct option. */
  answer: number;
}

/** Question id → the index of the option picked. */
export type QuizPicks = Readonly<Record<string, number>>;

/**
 * Records a pick: the new picks, whether it is right and whether it counted.
 * A question already answered keeps its first pick (counted false), and so
 * does a pick that is not one of the four options.
 */
export function pickOption(picks: QuizPicks, item: QuizItem, choice: number): { picks: QuizPicks; right: boolean; counted: boolean } {
  const known = Object.prototype.hasOwnProperty.call(picks, item.id);
  if (known || !Number.isInteger(choice) || choice < 0 || choice >= OPTION_LETTERS.length) {
    return { picks, right: known && picks[item.id] === item.answer, counted: false };
  }
  return { picks: { ...picks, [item.id]: choice }, right: choice === item.answer, counted: true };
}

export interface QuizScore {
  /** The questions counted (the ones shown). */
  total: number;
  answered: number;
  correct: number;
}

/** The score over these questions: picks of questions not among them do not count. */
export function quizScore(items: readonly QuizItem[], picks: QuizPicks): QuizScore {
  let answered = 0;
  let correct = 0;
  for (const item of items) {
    if (!Object.prototype.hasOwnProperty.call(picks, item.id)) continue;
    answered++;
    if (picks[item.id] === item.answer) correct++;
  }
  return { total: items.length, answered, correct };
}

/** What the visitor chose to see: one grade and one topic, or every one (null). */
export interface QuizView {
  grade: number | null;
  topic: string | null;
}

/** The questions the view shows, in the set's sequence. */
export function shownItems<T extends QuizItem>(items: readonly T[], view: QuizView): T[] {
  return items.filter((item) => (view.grade === null || item.grade === view.grade) && (view.topic === null || item.topic === view.topic));
}

/** The grades of the questions, each once, smallest first. */
export function gradesOf(items: readonly QuizItem[]): number[] {
  return [...new Set(items.map((item) => item.grade).filter((grade): grade is number => typeof grade === 'number'))].sort((a, b) => a - b);
}

/** The topics of the questions, each once, as they first come. */
export function topicsOf(items: readonly QuizItem[]): string[] {
  return [...new Set(items.map((item) => item.topic))];
}

/** «B) 8»: an option with its letter. */
export function optionLine(options: readonly string[], index: number): string {
  return `${OPTION_LETTERS[index] ?? '?'}) ${options[index] ?? ''}`;
}

/** The page's three requests: before a pick, after a right one, after a wrong one. */
export interface QuizPrefillTemplates {
  ask: string;
  right: string;
  wrong: string;
}

export interface QuizPrefillQuestion {
  q: string;
  options: readonly string[];
  answer: number;
}

/**
 * The text «Explain with AI» puts into the chat's composer: the subject, the
 * question and its four options, and once the visitor has picked, the pick
 * and the page's answer key, so the explanation starts from the same key the
 * page shows. Before a pick it asks for the reasoning, not the answer.
 */
export function quizPrefill(templates: QuizPrefillTemplates, subject: string, question: QuizPrefillQuestion, chosen?: number): string {
  const options = question.options.map((_, index) => optionLine(question.options, index)).join('\n');
  const values = { subject, question: question.q, options };
  if (chosen === undefined || !Number.isInteger(chosen) || chosen < 0 || chosen >= question.options.length) return fillTemplate(templates.ask, values);
  return fillTemplate(chosen === question.answer ? templates.right : templates.wrong, {
    ...values,
    chosen: optionLine(question.options, chosen),
    key: optionLine(question.options, question.answer),
  });
}

/** A message template from the page with its {name} slots filled in one pass; a slot without a value stays empty. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : ''));
}
