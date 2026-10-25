// The question sets of the practice-quiz widget (Page.widgets 'practice-quiz'
// with Page.quizSet): their format, limits and checks. A set is a data module
// of its own, src/tools/quiz/sets/<id>.ts, registered in
// src/tools/quiz/sets/index.ts. The build's content gate
// (scripts/tool-widgets.ts) refuses to render a page whose set breaks a rule;
// the widget's script (src/tools/quiz/main.ts) never imports a set, it reads
// the questions back from the prerendered HTML.
//
// The questions are original practice questions written for the page, each
// with its explanation: never answers leaked from a real exam, never
// presented as official exam material.

export type QuizLocale = 'ru' | 'uz';
/** The correct option: 0 = A, 1 = B, 2 = C, 3 = D. */
export type QuizOptionIndex = 0 | 1 | 2 | 3;

export interface QuizQuestion {
  /** Unique in the set: small Latin letters, digits and single hyphens («inf-7-01»). */
  id: string;
  /** School grade 1–11, when the question belongs to one; the widget lets the visitor choose by it. */
  grade?: number;
  /** A short topic name; the widget lets the visitor choose by it. */
  topic: string;
  /** The question, plain text (line breaks kept). */
  q: string;
  /** Exactly four options, plain text, one line each, all different. */
  options: readonly [string, string, string, string];
  answer: QuizOptionIndex;
  /** Why the answer is right (and the others are not), plain text (line breaks kept). */
  explanation: string;
}

export interface QuizSet {
  /** Page.quizSet: small Latin letters, digits and single hyphens («uz-informatika»). */
  id: string;
  /** The language of the set; it must be the page's. */
  locale: QuizLocale;
  /** The subject, as the page's language names it («Informatika», «Биология»). */
  subject: string;
  /** The widget's heading (h2). */
  title: string;
  questions: readonly QuizQuestion[];
}

export const QUIZ_LIMITS = {
  questions: 120,
  id: 40,
  subject: 60,
  title: 120,
  topic: 60,
  q: 600,
  option: 200,
  explanation: 1200,
  gradeMin: 1,
  gradeMax: 11,
} as const;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A control character (C0, DEL, C1, the line and paragraph separators); a line break only where it is not allowed. */
function hasControlCharacter(text: string, lineBreaks: boolean): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 && lineBreaks) continue;
    if (code < 32 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

/**
 * What would end the page's JSON-LD script early (the set is also printed
 * there, as a schema.org Quiz, where JSON keeps «<» as it is).
 */
const SCRIPT_BREAK = /<\/script|<!--/i;

/**
 * The first thing wrong with a text field, or undefined. Markup is allowed
 * (a question may be about an HTML tag): the page prints it escaped.
 */
function textProblem(value: unknown, max: number, lineBreaks = false): string | undefined {
  if (typeof value !== 'string') return 'is not a string';
  if (!value.trim()) return 'is empty';
  if (value.trim() !== value) return 'has leading or trailing spaces';
  if (value.length > max) return `has ${value.length} characters, at most ${max}`;
  if (hasControlCharacter(value, lineBreaks)) return lineBreaks ? 'has a control character' : 'has a control character or a line break';
  if (SCRIPT_BREAK.test(value)) return 'has «</script» or «<!--», which would break the page’s JSON-LD';
  return undefined;
}

function idProblem(value: unknown): string | undefined {
  if (typeof value !== 'string') return 'is not a string';
  if (value.length > QUIZ_LIMITS.id) return `has ${value.length} characters, at most ${QUIZ_LIMITS.id}`;
  if (!ID.test(value)) return 'is not small Latin letters, digits and single hyphens';
  return undefined;
}

const SET_FIELDS = new Set(['id', 'locale', 'subject', 'title', 'questions']);
const QUESTION_FIELDS = new Set(['id', 'grade', 'topic', 'q', 'options', 'answer', 'explanation']);

/**
 * What is wrong with a question set, one line per problem; [] when it is
 * valid. The content gate (scripts/tool-widgets.ts) refuses to render a page
 * whose set has any. The request each question puts into the chat is checked
 * there too (scripts/widgets/practice-quiz-block.ts), against the composer's limit.
 */
export function quizSetIssues(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['the quiz set is not an object'];
  const set = value as Record<string, unknown>;
  const issues: string[] = [];
  const unknown = Object.keys(set).filter((key) => !SET_FIELDS.has(key));
  if (unknown.length) issues.push(`the set has unknown fields: ${unknown.join(', ')}`);
  const id = idProblem(set.id);
  if (id) issues.push(`id ${id}`);
  if (set.locale !== 'ru' && set.locale !== 'uz') issues.push('locale is not ru or uz');
  for (const [name, max] of [['subject', QUIZ_LIMITS.subject], ['title', QUIZ_LIMITS.title]] as const) {
    const problem = textProblem(set[name], max);
    if (problem) issues.push(`${name} ${problem}`);
  }
  if (!Array.isArray(set.questions)) return [...issues, 'questions is not an array'];
  if (set.questions.length === 0) issues.push('questions is empty');
  if (set.questions.length > QUIZ_LIMITS.questions) issues.push(`questions has ${set.questions.length} items, at most ${QUIZ_LIMITS.questions}`);
  const ids = new Set<string>();
  const texts = new Set<string>();
  set.questions.forEach((item: unknown, index) => {
    const at = `questions[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { issues.push(`${at} is not an object`); return; }
    const question = item as Record<string, unknown>;
    const extra = Object.keys(question).filter((key) => !QUESTION_FIELDS.has(key));
    if (extra.length) issues.push(`${at} has unknown fields: ${extra.join(', ')}`);
    const questionId = idProblem(question.id);
    if (questionId) issues.push(`${at}.id ${questionId}`);
    else if (ids.has(question.id as string)) issues.push(`${at}.id repeats ${String(question.id)}`);
    else ids.add(question.id as string);
    if (question.grade !== undefined && (!Number.isInteger(question.grade) || (question.grade as number) < QUIZ_LIMITS.gradeMin || (question.grade as number) > QUIZ_LIMITS.gradeMax)) {
      issues.push(`${at}.grade is not a whole number from ${QUIZ_LIMITS.gradeMin} to ${QUIZ_LIMITS.gradeMax}`);
    }
    for (const [name, max, lineBreaks] of [['topic', QUIZ_LIMITS.topic, false], ['q', QUIZ_LIMITS.q, true], ['explanation', QUIZ_LIMITS.explanation, true]] as const) {
      const problem = textProblem(question[name], max, lineBreaks);
      if (problem) issues.push(`${at}.${name} ${problem}`);
    }
    if (typeof question.q === 'string') {
      const key = question.q.toLowerCase();
      if (texts.has(key)) issues.push(`${at}.q repeats another question`);
      texts.add(key);
    }
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      issues.push(`${at}.options is not a list of exactly 4 options`);
    } else {
      const seen = new Set<string>();
      question.options.forEach((option: unknown, optionIndex) => {
        const problem = textProblem(option, QUIZ_LIMITS.option);
        if (problem) { issues.push(`${at}.options[${optionIndex}] ${problem}`); return; }
        const key = (option as string).toLowerCase();
        if (seen.has(key)) issues.push(`${at}.options[${optionIndex}] repeats another option`);
        seen.add(key);
      });
    }
    if (question.answer !== 0 && question.answer !== 1 && question.answer !== 2 && question.answer !== 3) {
      issues.push(`${at}.answer is not 0, 1, 2 or 3 (the index of the correct option)`);
    }
  });
  return issues;
}

/** The registered set with this id, or undefined. */
export function findQuizSet(id: unknown, sets: readonly QuizSet[]): QuizSet | undefined {
  return typeof id === 'string' ? sets.find((set) => set.id === id) : undefined;
}
