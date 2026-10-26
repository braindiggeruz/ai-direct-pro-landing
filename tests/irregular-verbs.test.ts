// The irregular-verbs widget: the data (standard forms, no duplicates, no
// empty cells, site typography in Uzbek), the quiz logic (ten different
// verbs, every standard form accepted, the score and the mistakes), the
// search filter, and the prerendered table.
import assert from 'node:assert/strict';
import test from 'node:test';

import { IRREGULAR_VERBS } from '../src/tools/irregular-verbs/data';
import {
  QUIZ_LENGTH,
  answerQuiz,
  fillTemplate,
  formsOf,
  isCorrect,
  makeQuiz,
  matchesVerb,
  quizOver,
  startQuiz,
  type QuizVerb,
} from '../src/tools/irregular-verbs/quiz';
import { IRREGULAR_VERBS_ANCHOR, renderIrregularVerbsBlock } from '../scripts/widgets/irregular-verbs-block';
import type { Page } from '../src/shared/types';

const byV1 = new Map(IRREGULAR_VERBS.map((verb) => [verb.v1, verb]));
const asQuiz = (locale: 'ru' | 'uz'): QuizVerb[] => IRREGULAR_VERBS.map(({ v1, v2, v3, ru, uz }) => ({ v1, v2, v3, tr: locale === 'ru' ? ru : uz }));
/** A seeded generator (mulberry32), so a quiz is the same on every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('about 150 verbs, no duplicate base form, no empty cell', () => {
  assert.ok(IRREGULAR_VERBS.length >= 140 && IRREGULAR_VERBS.length <= 200, `${IRREGULAR_VERBS.length} verbs`);
  assert.equal(byV1.size, IRREGULAR_VERBS.length, 'duplicate V1');
  for (const verb of IRREGULAR_VERBS) {
    for (const [field, cell] of Object.entries(verb)) assert.ok(cell.trim() === cell && cell.length > 0, `${verb.v1}.${field} is empty or padded`);
  }
});

test('forms are small Latin words, alternatives with a slash, each listed once', () => {
  for (const verb of IRREGULAR_VERBS) {
    assert.match(verb.v1, /^[a-z]+$/, verb.v1);
    for (const field of ['v2', 'v3'] as const) {
      assert.match(verb[field], /^[a-z]+(?:\/[a-z]+)*$/, `${verb.v1}.${field}`);
      const forms = verb[field].split('/');
      assert.equal(new Set(forms).size, forms.length, `${verb.v1}.${field} repeats a form`);
    }
  }
});

test('the list is alphabetical, so a reader finds a verb by eye', () => {
  const v1 = IRREGULAR_VERBS.map((verb) => verb.v1);
  assert.deepEqual(v1, [...v1].sort());
});

test('the standard forms of the verbs every learner meets first', () => {
  const expect: Array<[string, string, string]> = [
    ['be', 'was/were', 'been'],
    ['have', 'had', 'had'],
    ['do', 'did', 'done'],
    ['go', 'went', 'gone'],
    ['get', 'got', 'got/gotten'],
    ['learn', 'learned/learnt', 'learned/learnt'],
    ['make', 'made', 'made'],
    ['take', 'took', 'taken'],
    ['see', 'saw', 'seen'],
    ['come', 'came', 'come'],
    ['know', 'knew', 'known'],
    ['think', 'thought', 'thought'],
    ['give', 'gave', 'given'],
    ['find', 'found', 'found'],
    ['tell', 'told', 'told'],
    ['become', 'became', 'become'],
    ['begin', 'began', 'begun'],
    ['write', 'wrote', 'written'],
    ['read', 'read', 'read'],
    ['speak', 'spoke', 'spoken'],
    ['buy', 'bought', 'bought'],
    ['bring', 'brought', 'brought'],
    ['teach', 'taught', 'taught'],
    ['catch', 'caught', 'caught'],
    ['eat', 'ate', 'eaten'],
    ['drink', 'drank', 'drunk'],
    ['swim', 'swam', 'swum'],
    ['run', 'ran', 'run'],
    ['lie', 'lay', 'lain'],
    ['lay', 'laid', 'laid'],
    ['put', 'put', 'put'],
    ['cut', 'cut', 'cut'],
    ['choose', 'chose', 'chosen'],
    ['fly', 'flew', 'flown'],
    ['forget', 'forgot', 'forgotten'],
    ['understand', 'understood', 'understood'],
    ['dream', 'dreamed/dreamt', 'dreamed/dreamt'],
    ['burn', 'burned/burnt', 'burned/burnt'],
  ];
  for (const [v1, v2, v3] of expect) {
    const verb = byV1.get(v1);
    assert.ok(verb, `${v1} is missing`);
    assert.equal(verb.v2, v2, `${v1} V2`);
    assert.equal(verb.v3, v3, `${v1} V3`);
  }
  // Regular verbs have no place in the table.
  for (const regular of ['work', 'play', 'want', 'like', 'use', 'look']) assert.ok(!byV1.has(regular), regular);
});

test('translations: Russian in Cyrillic, Uzbek in Latin with o‘ g‘ (U+2018) and the tutuq (U+2019)', () => {
  for (const verb of IRREGULAR_VERBS) {
    assert.match(verb.ru, /^[а-яё][а-яё ,()-]*$/, `${verb.v1}: ru «${verb.ru}»`);
    assert.match(verb.uz, /^[a-z‘’][a-z‘’ ,()-]*$/, `${verb.v1}: uz «${verb.uz}»`);
    assert.doesNotMatch(verb.uz, /['ʻʼ`]/, `${verb.v1}: no ASCII apostrophe or modifier letter`);
    assert.doesNotMatch(verb.uz, /[OoGg]’/, `${verb.v1}: o’ / g’ with the tutuq is a wrong letter`);
    assert.doesNotMatch(verb.uz, /[^OoGg]‘/, `${verb.v1}: ‘ only after o or g`);
    assert.doesNotMatch(verb.uz.replace(/\(narxi\)/, ''), /[()]/, `${verb.v1}: brackets only for a needed note`);
  }
  assert.equal(byV1.get('be')!.uz, 'bo‘lmoq');
  assert.equal(byV1.get('go')!.ru, 'идти');
});

test('a quiz: ten different verbs, V2 and V3 both asked, the same for one seed', () => {
  const verbs = asQuiz('ru');
  const quiz = makeQuiz(verbs, QUIZ_LENGTH, seeded(7));
  assert.equal(quiz.length, 10);
  assert.equal(new Set(quiz.map((q) => q.verb.v1)).size, 10, 'no verb twice');
  assert.deepEqual(makeQuiz(verbs, QUIZ_LENGTH, seeded(7)), quiz, 'deterministic for a seed');
  const forms = new Set<string>();
  for (let seed = 1; seed < 20; seed++) for (const q of makeQuiz(verbs, QUIZ_LENGTH, seeded(seed))) forms.add(q.form);
  assert.deepEqual([...forms].sort(), ['v2', 'v3']);
  assert.equal(makeQuiz(verbs.slice(0, 4), QUIZ_LENGTH, seeded(1)).length, 4, 'never more questions than verbs');
  // Every verb can be asked: over many seeds the sample covers the list.
  const seen = new Set<string>();
  for (let seed = 1; seed < 400; seed++) for (const q of makeQuiz(verbs, QUIZ_LENGTH, seeded(seed))) seen.add(q.verb.v1);
  assert.ok(seen.size > verbs.length * 0.95, `${seen.size} of ${verbs.length} verbs asked`);
});

test('answers: any standard form, case and spaces do not matter, a wrong form fails', () => {
  const be = { verb: { v1: 'be', v2: 'was/were', v3: 'been', tr: 'быть' }, form: 'v2' as const };
  for (const answer of ['was', 'were', 'was/were', 'were/was', 'Was, were', ' WAS ', 'was or were']) assert.equal(isCorrect(be, answer), true, answer);
  for (const answer of ['', '  ', 'been', 'is', 'was/been', 'wos']) assert.equal(isCorrect(be, answer), false, answer);
  const get = { verb: { v1: 'get', v2: 'got', v3: 'got/gotten', tr: 'получать' }, form: 'v3' as const };
  assert.equal(isCorrect(get, 'gotten'), true);
  assert.equal(isCorrect(get, 'got'), true);
  assert.equal(isCorrect({ ...get, form: 'v2' }, 'gotten'), false, 'gotten is no Past Simple');
  const learn = { verb: { v1: 'learn', v2: 'learned/learnt', v3: 'learned/learnt', tr: '' }, form: 'v3' as const };
  assert.equal(isCorrect(learn, 'learnt'), true);
  assert.equal(isCorrect(learn, 'learned'), true);
  assert.deepEqual(formsOf('got/gotten'), ['got', 'gotten']);
});

test('the quiz state: the score, the mistakes once each, the end', () => {
  const verbs = asQuiz('uz').filter((verb) => ['go', 'see', 'take'].includes(verb.v1));
  const questions = verbs.map((verb) => ({ verb, form: 'v2' as const }));
  let state = startQuiz(questions);
  assert.equal(quizOver(state), false);
  let step = answerQuiz(state, 'went');
  assert.equal(step.right, true);
  state = step.state;
  step = answerQuiz(state, 'seen');
  assert.equal(step.right, false);
  assert.equal(step.expected, 'saw');
  state = step.state;
  step = answerQuiz(state, 'took');
  state = step.state;
  assert.equal(quizOver(state), true);
  assert.equal(state.correct, 2);
  assert.deepEqual(state.mistakes, ['see']);
  assert.equal(answerQuiz(state, 'x').state, state, 'an answer after the end changes nothing');
});

test('search: by any form or the translation, case-insensitive; empty shows all', () => {
  const ru = asQuiz('ru');
  const go = ru.find((verb) => verb.v1 === 'go')!;
  for (const query of ['go', 'WENT', 'gone', 'идти', ' ид ']) assert.equal(matchesVerb(go, query), true, query);
  assert.equal(matchesVerb(go, 'take'), false);
  assert.equal(matchesVerb(go, ''), true);
  assert.equal(ru.filter((verb) => matchesVerb(verb, 'gotten')).map((verb) => verb.v1).join(), 'forget,get', 'a part of a word matches too');
  const uz = asQuiz('uz');
  assert.ok(uz.filter((verb) => matchesVerb(verb, 'o‘rganmoq')).some((verb) => verb.v1 === 'learn'));
});

test('message templates fill their slots', () => {
  assert.equal(fillTemplate('Вопрос {n} из {total}. {v1}', { n: 3, total: 10, v1: 'go' }), 'Вопрос 3 из 10. go');
  assert.equal(fillTemplate('{missing}!', {}), '!');
});

const page = (locale: 'ru' | 'uz') => ({ locale, url: `/${locale}/x/`, pageType: 'gpt-chat', chatRole: 'teacher', widgets: ['irregular-verbs'] }) as unknown as Page;

test('the prerendered table: every verb, the page language’s translation, no script, one section', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const html = renderIrregularVerbsBlock(page(locale));
    assert.match(html, new RegExp(`^<section id="${IRREGULAR_VERBS_ANCHOR}" data-irregular-verbs`));
    assert.doesNotMatch(html, /<h1|<nav|<main|<script|<form/, 'the chat page keeps one H1, one nav, one main');
    assert.equal((html.match(/<tr><td data-col="v1">/g) || []).length, IRREGULAR_VERBS.length);
    assert.match(html, /<td data-col="v1">be<\/td><td data-col="v2">was\/were<\/td><td data-col="v3">been<\/td>/);
    assert.match(html, /<tbody lang="en">/);
    assert.match(html, new RegExp(`<td data-col="tr" lang="${locale}">${locale === 'ru' ? 'быть' : 'bo‘lmoq'}</td>`));
    for (const action of ['start', 'check', 'next', 'ai']) assert.match(html, new RegExp(`data-iv-action="${action}"`));
    for (const column of ['none', 'v1', 'v2', 'v3', 'tr']) assert.match(html, new RegExp(`data-iv-hide="${column}"`));
    assert.match(html, /<noscript>/);
    assert.match(html, /data-msg-ai-prompt="/);
    // The AI note is honest: sending spends a trial reply or the pack.
    assert.match(html, locale === 'ru' ? /пробный ответ чата или AI-пакет/ : /sinov javobini yoki AI paketni/);
    // Ш10: after the quiz, one quiet line beside its AI button says what the AI adds; no price, no promise of a score.
    const result = html.slice(html.indexOf('<div data-iv-result hidden>'), html.indexOf('</div>', html.indexOf('data-iv-ai-value')));
    assert.match(result, /data-iv-action="ai"[\s\S]*<p class="iv-small" data-iv-ai-value>[^<]+<\/p>/, locale);
    assert.doesNotMatch(result.match(/data-iv-ai-value>([^<]+)</)![1], /so‘m|сум|\d/, locale);
  }
  const uz = renderIrregularVerbsBlock(page('uz')).replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(uz, /[A-Za-z]'[A-Za-z]|&#39;|[ʻʼ]/);
  assert.match(uz, /noto‘g‘ri fe’llar/);
  assert.match(uz, /AI bilan mashq qilish/);
  assert.match(renderIrregularVerbsBlock(page('ru')), /Потренироваться с AI/);
});
