// The question sets of the practice-quiz widget: Page.quizSet names one by its
// id. Each set is a data module of its own in this folder, typed QuizSet
// (src/tools/quiz/set.ts holds the format and the rules the build checks):
//
//   import { uzInformatika } from './uz-informatika';
//   export const QUIZ_SETS: readonly QuizSet[] = [uzInformatika];
//
// Only the build imports these modules (scripts/tool-widgets.ts); the widget's
// script reads the questions back from the page. Tailwind does not scan this
// folder (tailwind.config.js), so the words of the questions never add a rule
// to the site's shared stylesheet.
import type { QuizSet } from '../set';
import { uzFizika } from './uz-fizika';
import { uzInformatika } from './uz-informatika';
import { uzMatematika } from './uz-matematika';

// The tests pilot (2026-10-25): /uz/informatika-test/, /uz/fizika-test/,
// /uz/matematika-test/, one set per page.
export const QUIZ_SETS: readonly QuizSet[] = [uzInformatika, uzFizika, uzMatematika];
