// The practice-quiz widget of the AI tool pages (Page.widgets 'practice-quiz'
// with Page.quizSet): the question-set format and its checks, the content
// gate, the prerendered HTML (every question, its options and, in a native
// <details>, the key and the explanation; all escaped), the schema.org Quiz
// node, the score and the choice by grade and topic, and the text «Explain
// with AI» puts into the chat's composer (never sent). The two sample sets
// live here only: the real sets are content (src/tools/quiz/sets/).
//
// Run: node --import tsx --test tests/practice-quiz.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { PAGE_WIDGETS, pageWidgetIssues, type Page } from '../src/shared/types';
import { CHAT_PREFILL_MAX, readChatPrefill } from '../src/shared/chat-prefill';
import { QUIZ_LIMITS, findQuizSet, quizSetIssues, type QuizQuestion, type QuizSet } from '../src/tools/quiz/set';
import { QUIZ_SETS } from '../src/tools/quiz/sets';
import { OPTION_LETTERS, fillTemplate, gradesOf, optionLine, pickOption, quizPrefill, quizScore, shownItems, topicsOf, type QuizItem } from '../src/tools/quiz/logic';
import {
  PRACTICE_QUIZ_ANCHOR, practiceQuizJsonLd, practiceQuizPrefillIssues, quizPrefillTemplates, renderPracticeQuizBlock,
} from '../scripts/widgets/practice-quiz-block';
import {
  WIDGET_ENTRY, assertToolPage, pageQuizSet, pageWidgets, quizPageIssues, renderToolWidgets, toolJsonLd, toolPageIssues, toolWidgetScripts, widgetScriptsFrom,
} from '../scripts/tool-widgets';
import { ENTRIES, type ViteManifest } from '../scripts/vite-manifest';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = <T>(file: string) => JSON.parse(read(file)) as T;

function readPages(): Page[] {
  const out: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as Page);
    }
  };
  walk(path.join(ROOT, 'content', 'pages'));
  return out;
}
const pages = readPages();
const chatRu = json<Page>('content/pages/ru/gpt-chat.json');
const chatUz = json<Page>('content/pages/uz/gpt-uzbek-tilida.json');

// ── The sample sets (tests only) ────────────────────────────────────────────

const SAMPLE_RU: QuizSet = {
  id: 'test-ru-informatika',
  locale: 'ru',
  subject: 'Информатика',
  title: 'Тренировочный тест по информатике',
  questions: [
    {
      id: 'inf-1', grade: 7, topic: 'Единицы информации',
      q: 'Сколько бит в одном байте?',
      options: ['4', '8', '16', '1024'], answer: 1,
      explanation: 'Байт — это 8 бит. 1024 — число байтов в килобайте, а не битов в байте.',
    },
    {
      id: 'inf-2', grade: 9, topic: 'HTML & "разметка"',
      q: 'Какой тег <script> в HTML?\nВыберите «верное» & \'точное\' описание.',
      options: ['<b>жирный</b> текст', 'Подключает или содержит сценарий', 'Ссылка "a"', 'Таблица & строки'], answer: 1,
      explanation: 'Тег <script> подключает файл со сценарием или содержит его код.\nОстальные варианты — другие теги.',
    },
    {
      id: 'inf-3', grade: 7, topic: 'Единицы информации',
      q: 'Сколько байтов в одном килобайте (в двоичной системе)?',
      options: ['100', '1000', '1024', '512'], answer: 2,
      explanation: '1 КБ = 2¹⁰ = 1024 байта.',
    },
  ],
};

const SAMPLE_UZ: QuizSet = {
  id: 'test-uz-matematika',
  locale: 'uz',
  subject: 'Matematika',
  title: 'Matematika bo‘yicha mashq testi',
  questions: [
    {
      id: 'mat-1', topic: 'Kasrlar',
      q: '1/2 + 1/4 nechaga teng?',
      options: ['2/6', '3/4', '1/8', '2/4'], answer: 1,
      explanation: 'Umumiy maxraj 4: 2/4 + 1/4 = 3/4.',
    },
    {
      id: 'mat-2', topic: 'Kasrlar',
      q: '0,5 qaysi kasrga teng?',
      options: ['1/5', '5/1', '1/2', '2/5'], answer: 2,
      explanation: '0,5 = 5/10 = 1/2.',
    },
  ],
};
const SETS = [SAMPLE_RU, SAMPLE_UZ];

/** A tool page built from a chat: what a content page with the quiz declares. */
const quizPage = (extra: Partial<Page> = {}, base: Page = chatRu): Page => ({
  ...base, url: `/${base.locale}/ai-quiz-test/`, chatRole: 'teacher', widgets: ['practice-quiz'], quizSet: base.locale === 'uz' ? SAMPLE_UZ.id : SAMPLE_RU.id, ...extra,
});
const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attribute = (html: string, name: string) => {
  const raw = html.match(new RegExp(` ${name}="([^"]*)"`))?.[1];
  return raw === undefined ? undefined : decode(raw);
};

// ── The set format ──────────────────────────────────────────────────────────

test('the sample sets are valid, and every question’s request fits the composer', () => {
  for (const set of SETS) {
    assert.deepEqual(quizSetIssues(set), [], set.id);
    assert.deepEqual(practiceQuizPrefillIssues(set), [], set.id);
  }
  assert.equal(findQuizSet('test-uz-matematika', SETS), SAMPLE_UZ);
  for (const id of ['missing', '', undefined, null, 1]) assert.equal(findQuizSet(id, SETS), undefined, String(id));
});

test('the set format: four different options, an index for the answer, unique ids, grades 1–11, plain one-line fields', () => {
  const question = SAMPLE_RU.questions[0];
  const withQuestion = (change: Record<string, unknown>) => ({ ...SAMPLE_RU, questions: [{ ...question, ...change }] });
  const bad: Array<[unknown, RegExp]> = [
    [null, /not an object/],
    [{ ...SAMPLE_RU, extra: 1 }, /unknown fields: extra/],
    [{ ...SAMPLE_RU, id: 'Bad_Id' }, /^id is not small Latin letters/m],
    [{ ...SAMPLE_RU, id: 'a'.repeat(QUIZ_LIMITS.id + 1) }, /^id has 41 characters/m],
    [{ ...SAMPLE_RU, locale: 'en' }, /locale is not ru or uz/],
    [{ ...SAMPLE_RU, subject: '' }, /subject is empty/],
    [{ ...SAMPLE_RU, title: ' Тест' }, /title has leading or trailing spaces/],
    [{ ...SAMPLE_RU, title: 'Две\nстроки' }, /title has a control character or a line break/],
    [{ ...SAMPLE_RU, questions: 'x' }, /questions is not an array/],
    [{ ...SAMPLE_RU, questions: [] }, /questions is empty/],
    [{ ...SAMPLE_RU, questions: Array.from({ length: QUIZ_LIMITS.questions + 1 }, (_, i) => ({ ...question, id: `q-${i}`, q: `Вопрос ${i}` })) }, /at most 120/],
    [withQuestion({ options: ['1', '2', '3'] }), /options is not a list of exactly 4 options/],
    [withQuestion({ options: ['1', '2', '3', '4', '5'] }), /exactly 4 options/],
    [withQuestion({ options: ['8', '8', '16', '1024'] }), /options\[1\] repeats another option/],
    [withQuestion({ options: ['Да', 'да', '16', '1024'] }), /options\[1\] repeats another option/],
    [withQuestion({ options: ['4', '', '16', '1024'] }), /options\[1\] is empty/],
    [withQuestion({ options: ['4', 'две\nстроки', '16', '1024'] }), /options\[1\] has a control character or a line break/],
    [withQuestion({ answer: 4 }), /answer is not 0, 1, 2 or 3/],
    [withQuestion({ answer: '1' }), /answer is not 0, 1, 2 or 3/],
    [withQuestion({ answer: undefined }), /answer is not 0, 1, 2 or 3/],
    [withQuestion({ grade: 12 }), /grade is not a whole number from 1 to 11/],
    [withQuestion({ grade: 7.5 }), /grade is not a whole number/],
    [withQuestion({ grade: 0 }), /grade is not a whole number/],
    [withQuestion({ topic: '' }), /topic is empty/],
    [withQuestion({ q: 'x'.repeat(QUIZ_LIMITS.q + 1) }), /\.q has 601 characters, at most 600/],
    [withQuestion({ q: 'tab\there' }), /\.q has a control character/],
    [withQuestion({ explanation: '' }), /explanation is empty/],
    [withQuestion({ explanation: 'См. </script><script>alert(1)</script>' }), /would break the page’s JSON-LD/],
    [withQuestion({ q: 'Комментарий <!-- в HTML?' }), /would break the page’s JSON-LD/],
    [withQuestion({ id: 'Q 1' }), /\.id is not small Latin letters/],
    [withQuestion({ hint: 'x' }), /unknown fields: hint/],
    [{ ...SAMPLE_RU, questions: [question, { ...question, q: 'Другой вопрос' }] }, /questions\[1\]\.id repeats inf-1/],
    [{ ...SAMPLE_RU, questions: [question, { ...question, id: 'inf-9' }] }, /questions\[1\]\.q repeats another question/],
  ];
  for (const [value, issue] of bad) assert.match(quizSetIssues(value).join('\n'), issue, JSON.stringify(value)?.slice(0, 160));
  // Line breaks are kept in the question and the explanation; markup is allowed there (printed escaped).
  assert.deepEqual(quizSetIssues(withQuestion({ q: 'Строка 1\nСтрока 2 <b>', explanation: 'a < b && c > d' })), []);
  // The compiler holds the same shape: four options, an index 0–3.
  const typed: QuizQuestion = { id: 'x', topic: 't', q: 'q', options: ['a', 'b', 'c', 'd'], answer: 3, explanation: 'e' };
  assert.equal(typed.options.length, 4);
});

test('the registry: unique ids, every set valid, Uzbek in U+2018/U+2019, each set on one page at most, Tailwind never scans it', () => {
  const ids = QUIZ_SETS.map((set) => set.id);
  assert.equal(new Set(ids).size, ids.length, 'set ids are unique');
  for (const set of QUIZ_SETS) {
    assert.deepEqual(quizSetIssues(set), [], set.id);
    assert.deepEqual(practiceQuizPrefillIssues(set), [], set.id);
    if (set.locale === 'uz') {
      const text = JSON.stringify(set);
      assert.doesNotMatch(text, /[A-Za-z]'[A-Za-z]|[ʻʼ]/, `${set.id}: Uzbek uses o‘ g‘ (U+2018) and the tutuq ’ (U+2019)`);
      assert.doesNotMatch(text, /[OoGg]’[a-z]/, `${set.id}: o’ / g’ with the tutuq is a wrong letter`);
    }
  }
  const used = pages.filter((page) => page.quizSet !== undefined).map((page) => page.quizSet);
  assert.equal(new Set(used).size, used.length, 'no set is shown on two pages');
  for (const page of pages.filter((p) => p.quizSet !== undefined)) assert.deepEqual(quizPageIssues(page), [], page.url);
  // The questions are data: their words must not add rules to the shared stylesheet.
  assert.match(read('tailwind.config.js'), /content: \[[^\]]*'!\.\/src\/tools\/quiz\/sets\/\*\*'\]/);
  // Only the build imports the sets; the widget's script reads the page.
  const entry = read('src/tools/quiz/main.ts');
  assert.doesNotMatch(entry, /from '\.\/sets|from '\.\/set'/);
});

// ── The content gate ────────────────────────────────────────────────────────

test('the allowlist: practice-quiz is a widget, quizSet only with it, a registered valid set in the page’s language', () => {
  assert.ok(PAGE_WIDGETS.includes('practice-quiz'));
  assert.deepEqual(pageWidgetIssues(['practice-quiz']), []);
  assert.deepEqual(pageWidgetIssues(['calculator', 'practice-quiz']), []);
  assert.equal(WIDGET_ENTRY['practice-quiz'], 'practiceQuiz');
  assert.equal(ENTRIES.practiceQuiz, 'src/tools/quiz/main.ts');
  assert.ok(read('vite.config.ts').includes(`'practice-quiz': here('./src/tools/quiz/main.ts')`), 'a Vite input of its own');

  assert.deepEqual(toolPageIssues(quizPage(), SETS), []);
  assert.deepEqual(toolPageIssues(quizPage({ widgets: ['calculator', 'practice-quiz'] }), SETS), []);
  assert.deepEqual(toolPageIssues(quizPage({}, { ...chatUz, chatRole: 'teacher' }), SETS), []);
  assert.doesNotThrow(() => assertToolPage(quizPage(), SETS));

  const refused: Array<[Page, RegExp]> = [
    [quizPage({ widgets: undefined }), /quizSet needs widgets to list 'practice-quiz'/],
    [quizPage({ widgets: ['calculator'] }), /quizSet needs widgets to list 'practice-quiz'/],
    [quizPage({ quizSet: undefined }), /the practice-quiz widget needs a quizSet/],
    [quizPage({ quizSet: 'nope' }), /quizSet «nope» is not a registered question set/],
    [quizPage({ quizSet: 7 as never }), /quizSet «7» is not a registered question set/],
    [quizPage({ quizSet: SAMPLE_UZ.id }), /quiz set test-uz-matematika is in uz, the page in ru/],
    [{ ...quizPage(), chatRole: undefined }, /need pageType gpt-chat and a chatRole/],
    [{ ...chatRu, quizSet: SAMPLE_RU.id }, /need pageType gpt-chat and a chatRole/],
    [{ ...quizPage(), pageType: 'money' }, /need pageType gpt-chat and a chatRole/],
  ];
  for (const [page, issue] of refused) {
    assert.match(toolPageIssues(page, SETS).join('\n'), issue, JSON.stringify({ widgets: page.widgets, quizSet: page.quizSet, role: page.chatRole }));
    assert.throws(() => assertToolPage(page, SETS), issue);
    assert.equal(pageQuizSet(page, SETS), undefined);
    // Never a block: the widget without its set refuses to render (fail closed), the others render without it.
    let rendered = '';
    try {
      rendered = renderToolWidgets(page, SETS);
    } catch (error) {
      assert.match(String(error), /the practice-quiz widget has no valid quizSet/);
    }
    assert.equal(rendered.includes('data-practice-quiz'), false);
    assert.deepEqual(toolJsonLd(page, 'https://gptbot.uz/x/', SETS), []);
  }
  // A registered set that breaks a rule, or whose request would not fit the composer, stops the build.
  const broken = { ...SAMPLE_RU, id: 'broken', questions: [{ ...SAMPLE_RU.questions[0], options: ['1', '1', '2', '3'] as const }] } as QuizSet;
  assert.match(toolPageIssues(quizPage({ quizSet: 'broken' }), [broken]).join('\n'), /quiz set broken: questions\[0\]\.options\[1\] repeats another option/);
  const long = { ...SAMPLE_RU, id: 'long', questions: [{ ...SAMPLE_RU.questions[0], q: 'В'.repeat(QUIZ_LIMITS.q), options: ['а'.repeat(200), 'б'.repeat(200), 'в'.repeat(200), 'г'.repeat(200)] as const }] } as QuizSet;
  assert.deepEqual(quizSetIssues(long), []);
  assert.match(toolPageIssues(quizPage({ quizSet: 'long' }), [long]).join('\n'), /quiz set long: questions\[0\] \(inf-1\): its request for the chat has \d+ characters, at most 1500/);
  // The real registry is the default: the sample sets are not in it.
  assert.match(toolPageIssues(quizPage()).join('\n'), /quizSet «test-ru-informatika» is not a registered question set/);
});

test('every content page keeps passing the gate, and the protected chats carry no quiz', () => {
  for (const page of pages) assert.deepEqual(toolPageIssues(page), [], page.url);
  for (const chat of [chatRu, chatUz]) {
    assert.equal(chat.quizSet, undefined);
    assert.equal(renderToolWidgets(chat), '');
    assert.deepEqual(toolJsonLd(chat, `https://gptbot.uz${chat.url}`), []);
  }
});

// ── The prerendered block ───────────────────────────────────────────────────

test('the block: every question with four options and, in a native <details>, the key and the explanation', () => {
  const page = quizPage();
  const html = renderToolWidgets(page, SETS);
  assert.equal(html, renderPracticeQuizBlock(page, SAMPLE_RU), 'the widget is exactly the quiz block');
  assert.match(html, new RegExp(`^<section id="${PRACTICE_QUIZ_ANCHOR}" data-practice-quiz data-pq-set="test-ru-informatika" data-pq-subject="Информатика" aria-labelledby="pq-heading"`));
  assert.match(html, /<h2 id="pq-heading">Тренировочный тест по информатике<\/h2>/);
  assert.doesNotMatch(html, /<h1|<nav|<main|<script|<form|<input|<button(?![^>]*data-pq-action="restart")/, 'static text; the option buttons come with the script');
  const items = html.match(/<li class="pq-item"[\s\S]*?<\/details>\s*<\/li>/g) || [];
  assert.equal(items.length, SAMPLE_RU.questions.length);
  SAMPLE_RU.questions.forEach((question, index) => {
    const item = items[index];
    assert.match(item, new RegExp(`^<li class="pq-item" id="pq-${question.id}" data-pq-item="${question.id}" data-answer="${question.answer}" data-grade="${question.grade}" data-topic="`));
    assert.equal((item.match(/<li data-pq-option="\d">/g) || []).length, 4, `${question.id}: four options`);
    OPTION_LETTERS.forEach((letter, optionIndex) => assert.match(item, new RegExp(`<li data-pq-option="${optionIndex}"><span class="pq-letter">${letter}\\)</span> <span data-pq-text>`)));
    const details = item.match(/<details><summary>Ответ и разбор<\/summary><p class="pq-right">([^<]*)<\/p><p>([^<]*)<\/p><\/details>/);
    assert.ok(details, `${question.id}: one <details> with the key line and the explanation`);
    assert.equal(decode(details[1]), `Правильный ответ: ${optionLine(question.options, question.answer)}`);
    assert.equal(decode(details[2]), question.explanation);
    assert.equal((item.match(/<details>/g) || []).length, 1);
    assert.doesNotMatch(item, /<details open|data-mark|data-state/, 'nothing is answered or opened before the visitor picks');
    assert.equal(decode(item.match(/<p class="pq-q" id="pq-[\w-]+-q" data-pq-q>([^<]*)<\/p>/)![1]), question.q);
    assert.match(item, new RegExp(`<p class="pq-meta">Вопрос ${index + 1} · ${question.grade} класс · `));
  });
  // The controls wait for the script; the honest notes are there.
  assert.match(html, /<div class="pq-bar" data-pq-bar hidden>/);
  assert.match(html, /<select id="pq-grade" data-pq-view="grade"><option value="">Все классы<\/option><option value="7">7 класс<\/option><option value="9">9 класс<\/option><\/select>/);
  assert.match(html, /<select id="pq-topic" data-pq-view="topic"><option value="">Все темы<\/option><option value="Единицы информации">Единицы информации<\/option><option value="HTML &amp; &quot;разметка&quot;">/);
  assert.match(html, /<p class="pq-score" role="status" aria-live="polite" data-pq-score><\/p>/);
  assert.match(html, /<button type="button" data-pq-action="restart">Начать заново<\/button>/);
  assert.match(html, /3 тренировочных вопроса по предмету «Информатика»/);
  assert.match(html, /не официальные экзаменационные материалы и не ответы к реальным тестам/);
  assert.match(html, /Вопросы можно выбрать по классу и по теме\. Всё работает в браузере, без запроса к AI\./);
  assert.match(html, /расходует пробный ответ чата или AI-пакет/);
  assert.match(html, /<noscript><p>Ответ и разбор открываются под каждым вопросом;/);
  assert.equal(attribute(html, 'data-msg-ai'), 'Объяснить с AI');
});

test('the block escapes every text and attribute: no markup from a set reaches the page as markup', () => {
  const html = renderPracticeQuizBlock(quizPage(), SAMPLE_RU);
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(body, /<script>|<b>жирный|<\/b>/, 'tags from the set are text');
  assert.match(body, /Какой тег &lt;script&gt; в HTML\?\nВыберите «верное» &amp; &#39;точное&#39; описание\./);
  assert.match(body, /<span data-pq-text>&lt;b&gt;жирный&lt;\/b&gt; текст<\/span>/);
  assert.match(body, /<span data-pq-text>Ссылка &quot;a&quot;<\/span>/);
  assert.match(body, /data-topic="HTML &amp; &quot;разметка&quot;"/);
  assert.match(body, /<p class="pq-meta">Вопрос 2 · 9 класс · HTML &amp; &quot;разметка&quot;<\/p>/);
  // Every attribute value is closed by its own quote: no raw quote or angle bracket inside one.
  for (const value of body.match(/ [\w-]+="[^"]*"/g) || []) assert.doesNotMatch(value.slice(value.indexOf('"') + 1, -1), /[<>"]/, value);
  // A set's own braces stay text: the key line is not a template for the set's words.
  const braces = { ...SAMPLE_RU, questions: [{ ...SAMPLE_RU.questions[0], options: ['{key}', '8', '{subject}', '$&'] as const }] } as QuizSet;
  assert.deepEqual(quizSetIssues(braces), []);
  const braced = renderPracticeQuizBlock(quizPage(), braces);
  assert.match(braced, /<p class="pq-right">Правильный ответ: B\) 8<\/p>/);
  assert.match(braced, /<span data-pq-text>\{key\}<\/span>/);
  assert.match(braced, /<span data-pq-text>\$&amp;<\/span>/);
});

test('the Uzbek block: Uzbek copy in U+2018/U+2019, «AI bilan tushuntirish», no choice where the set offers one value', () => {
  const page = quizPage({}, { ...chatUz, chatRole: 'teacher' });
  const html = renderToolWidgets(page, SETS);
  assert.match(html, /<h2 id="pq-heading">Matematika bo‘yicha mashq testi<\/h2>/);
  assert.match(html, /«Matematika» fanidan 2 ta mashq savoli, har birining javobi va izohi bilan\./);
  assert.match(html, /bu rasmiy imtihon materiallari ham, haqiqiy testlarning javoblari ham emas/);
  assert.match(html, /<details><summary>Javob va izoh<\/summary><p class="pq-right">To‘g‘ri javob: B\) 3\/4<\/p>/);
  assert.match(html, /<p class="pq-meta">1-savol · Kasrlar<\/p>/);
  assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ''), /data-grade=|data-pq-view=|pq-view/, 'no grades and one topic: nothing to choose');
  assert.match(html, /Javobni tanlang: darhol tekshiriladi va izoh ko‘rsatiladi\. Hammasi brauzerda ishlaydi, AI’ga so‘rov yuborilmaydi\./);
  assert.equal(attribute(html, 'data-msg-ai'), 'AI bilan tushuntirish');
  assert.match(html, /sinov javobini yoki AI paketni sarflaydi/);
  const copy = html.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(copy, /[A-Za-z]'[A-Za-z]|&#39;|[ʻʼ]/, 'no ASCII apostrophe or modifier letter');
  assert.doesNotMatch(copy, /[OoGg]’[a-z]/, 'o’ / g’ with the tutuq is a wrong letter');
});

test('the script loads only where the widget is listed; the page JSON-LD gains one schema.org Quiz', () => {
  const scripts = { 'uz-translit': '/assets/uz-translit-A.js', calculator: '/assets/calculator-widget-B.js', 'irregular-verbs': '/assets/irregular-verbs-C.js', 'practice-quiz': '/assets/practice-quiz-D.js' };
  assert.equal(toolWidgetScripts(quizPage(), scripts), '\n<script type="module" src="/assets/practice-quiz-D.js"></script>');
  assert.equal(toolWidgetScripts(quizPage({ widgets: ['practice-quiz', 'calculator'] }), scripts), '\n<script type="module" src="/assets/practice-quiz-D.js"></script>\n<script type="module" src="/assets/calculator-widget-B.js"></script>');
  assert.deepEqual(pageWidgets(quizPage()), ['practice-quiz']);
  for (const page of [chatRu, chatUz, quizPage({ widgets: ['calculator'], quizSet: undefined })]) assert.doesNotMatch(toolWidgetScripts(page, scripts), /practice-quiz/, page.url);
  const manifest: ViteManifest = Object.fromEntries(PAGE_WIDGETS.map((widget) => [ENTRIES[WIDGET_ENTRY[widget]], { file: `assets/${widget}-H.js`, isEntry: true }]));
  assert.equal(widgetScriptsFrom(manifest)['practice-quiz'], '/assets/practice-quiz-H.js');

  const url = 'https://gptbot.uz/ru/ai-quiz-test/';
  const [quiz, ...rest] = toolJsonLd(quizPage(), url, SETS);
  assert.deepEqual(rest, []);
  assert.deepEqual(quiz, practiceQuizJsonLd(SAMPLE_RU, url));
  assert.equal(quiz['@type'], 'Quiz');
  assert.equal(quiz['@id'], `${url}#practice-quiz`);
  assert.equal(quiz.name, SAMPLE_RU.title);
  assert.equal(quiz.inLanguage, 'ru');
  assert.deepEqual(quiz.about, { '@type': 'Thing', name: 'Информатика' });
  assert.deepEqual(quiz.isPartOf, { '@id': `${url}#webpage` });
  const parts = quiz.hasPart as Array<Record<string, unknown>>;
  assert.equal(parts.length, SAMPLE_RU.questions.length);
  assert.deepEqual(parts[0], {
    '@type': 'Question',
    eduQuestionType: 'Multiple choice',
    text: 'Сколько бит в одном байте?',
    about: { '@type': 'Thing', name: 'Единицы информации' },
    educationalLevel: '7 класс',
    acceptedAnswer: { '@type': 'Answer', position: 1, text: '8', answerExplanation: { '@type': 'Comment', text: SAMPLE_RU.questions[0].explanation } },
    suggestedAnswer: [{ '@type': 'Answer', position: 0, text: '4' }, { '@type': 'Answer', position: 2, text: '16' }, { '@type': 'Answer', position: 3, text: '1024' }],
  });
  const uzQuiz = toolJsonLd(quizPage({}, { ...chatUz, chatRole: 'teacher' }), 'https://gptbot.uz/uz/ai-quiz-test/', SETS)[0];
  assert.equal((uzQuiz.hasPart as Array<Record<string, unknown>>)[0].educationalLevel, undefined, 'no grade, no level');
  // prerender puts the nodes into the page's @graph, before the page's own extra nodes.
  const prerender = read('scripts/prerender.ts');
  assert.match(prerender, /graph\.push\(\.\.\.toolJsonLd\(page, fullUrl\)\);\s*(?:\/\/[^\n]*\n\s*)*if \(Array\.isArray\(page\.extraJsonLd\)/);
  assert.match(prerender, /<script type="application\/ld\+json">\$\{buildJsonLd\(page, global\)\}<\/script>/);
  // Nothing in a set can end that script early.
  assert.doesNotMatch(JSON.stringify(quiz), /<\/script|<!--/i);
});

// ── The logic: picks, score, choice ─────────────────────────────────────────

const ITEMS: QuizItem[] = [
  { id: 'a', grade: 7, topic: 'T1', answer: 1 },
  { id: 'b', grade: 9, topic: 'T2', answer: 0 },
  { id: 'c', grade: 7, topic: 'T2', answer: 3 },
  { id: 'd', topic: 'T1', answer: 2 },
];

test('a pick is checked at once; a question keeps its first pick; only the four options count', () => {
  let picks = {};
  let outcome = pickOption(picks, ITEMS[0], 1);
  assert.deepEqual(outcome, { picks: { a: 1 }, right: true, counted: true });
  picks = outcome.picks;
  outcome = pickOption(picks, ITEMS[0], 2);
  assert.deepEqual(outcome, { picks: { a: 1 }, right: true, counted: false }, 'a second pick changes nothing');
  outcome = pickOption(picks, ITEMS[1], 3);
  assert.deepEqual(outcome, { picks: { a: 1, b: 3 }, right: false, counted: true });
  assert.notEqual(outcome.picks, picks, 'a new object, the old one untouched');
  assert.deepEqual(picks, { a: 1 });
  for (const choice of [-1, 4, 1.5, Number.NaN]) assert.equal(pickOption({}, ITEMS[2], choice).counted, false, String(choice));
  assert.deepEqual(pickOption({ b: 3 }, ITEMS[1], 0), { picks: { b: 3 }, right: false, counted: false }, 'a wrong first pick stays wrong');
  // An id like a property of Object.prototype is a question like any other.
  assert.equal(pickOption({}, { id: 'constructor', topic: 't', answer: 0 }, 0).counted, true);
});

test('the score counts the questions shown; grade and topic narrow them; restart is no picks', () => {
  const picks = { a: 1, b: 3, c: 3 };
  assert.deepEqual(quizScore(ITEMS, picks), { total: 4, answered: 3, correct: 2 });
  assert.deepEqual(quizScore(ITEMS, {}), { total: 4, answered: 0, correct: 0 }, 'restart');
  assert.deepEqual(quizScore([], picks), { total: 0, answered: 0, correct: 0 });
  assert.deepEqual(quizScore(ITEMS, { a: 1, b: 0, c: 3, d: 2 }), { total: 4, answered: 4, correct: 4 });
  assert.deepEqual(quizScore(ITEMS, { zzz: 1 }), { total: 4, answered: 0, correct: 0 }, 'a pick of another question does not count');

  const ids = (view: { grade: number | null; topic: string | null }) => shownItems(ITEMS, view).map((item) => item.id);
  assert.deepEqual(ids({ grade: null, topic: null }), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ grade: 7, topic: null }), ['a', 'c']);
  assert.deepEqual(ids({ grade: null, topic: 'T2' }), ['b', 'c']);
  assert.deepEqual(ids({ grade: 7, topic: 'T2' }), ['c']);
  assert.deepEqual(ids({ grade: 9, topic: 'T1' }), []);
  assert.deepEqual(quizScore(shownItems(ITEMS, { grade: 7, topic: null }), picks), { total: 2, answered: 2, correct: 2 });
  assert.deepEqual(gradesOf(ITEMS), [7, 9]);
  assert.deepEqual(gradesOf([{ id: 'x', topic: 't', answer: 0, grade: 11 }, { id: 'y', topic: 't', answer: 0, grade: 2 }]), [2, 11], 'numbers, not text');
  assert.deepEqual(topicsOf(ITEMS), ['T1', 'T2']);
});

test('message templates are filled in one pass: a value never becomes a slot', () => {
  assert.equal(fillTemplate('Верно {correct} из {answered} · отвечено {answered} из {total}.', { correct: 2, answered: 3, total: 4 }), 'Верно 2 из 3 · отвечено 3 из 4.');
  assert.equal(fillTemplate('{a} and {b}', { a: '{b}' }), '{b} and ');
  assert.equal(fillTemplate('{x}', { x: '$& $1' }), '$& $1');
  assert.equal(fillTemplate('{constructor}', {}), '');
  assert.equal(optionLine(['4', '8', '16', '1024'], 3), 'D) 1024');
});

// ── The request «Explain with AI» puts into the chat ────────────────────────

test('the request: the question, the four options and the pick with the page’s key; before a pick it asks for the reasoning', () => {
  const ru = quizPrefillTemplates('ru');
  const question = SAMPLE_RU.questions[0];
  const options = 'A) 4\nB) 8\nC) 16\nD) 1024';
  assert.equal(quizPrefill(ru, 'Информатика', question),
    `Помоги разобраться с тренировочным вопросом по предмету «Информатика». Не называй ответ сразу: сначала объясни, как рассуждать.\nВопрос: Сколько бит в одном байте?\n${options}`);
  assert.equal(quizPrefill(ru, 'Информатика', question, 1),
    `Объясни по шагам тренировочный вопрос по предмету «Информатика».\nВопрос: Сколько бит в одном байте?\n${options}\nМой ответ: B) 8\nОтвет по ключу на странице: B) 8\nПочему этот ответ верный?`);
  assert.equal(quizPrefill(ru, 'Информатика', question, 3),
    `Объясни по шагам тренировочный вопрос по предмету «Информатика».\nВопрос: Сколько бит в одном байте?\n${options}\nМой ответ: D) 1024\nОтвет по ключу на странице: B) 8\nПочему верен ответ по ключу и в чём моя ошибка?`);
  for (const chosen of [-1, 4, 0.5]) assert.equal(quizPrefill(ru, 'Информатика', question, chosen), quizPrefill(ru, 'Информатика', question), String(chosen));
  // A set's braces and dollar signs reach the chat as they are.
  assert.match(quizPrefill(ru, 'Тест {key}', { q: 'Что значит $& и {chosen}?', options: ['{key}', 'b', 'c', 'd'], answer: 0 }, 0), /«Тест \{key\}»[\s\S]*Вопрос: Что значит \$& и \{chosen\}\?\nA\) \{key\}[\s\S]*Мой ответ: A\) \{key\}/);

  const uz = quizPrefillTemplates('uz');
  const uzQuestion = SAMPLE_UZ.questions[0];
  const uzText = quizPrefill(uz, SAMPLE_UZ.subject, uzQuestion, 0);
  assert.equal(uzText, '«Matematika» fanidan mashq savolini qadamma-qadam tushuntir.\nSavol: 1/2 + 1/4 nechaga teng?\nA) 2/6\nB) 3/4\nC) 1/8\nD) 2/4\nMening javobim: A) 2/6\nSahifadagi kalit bo‘yicha javob: B) 3/4\nNega kalitdagi javob to‘g‘ri va men qayerda xato qildim?');
  assert.match(quizPrefill(uz, SAMPLE_UZ.subject, uzQuestion), /^«Matematika» fanidan mashq savolini tushunishga yordam ber\. Javobni darhol aytma/);
  assert.match(quizPrefill(uz, SAMPLE_UZ.subject, uzQuestion, 1), /Nega bu javob to‘g‘ri\?$/);
  for (const template of Object.values(uz)) {
    assert.doesNotMatch(template, /[A-Za-z]'[A-Za-z]|[ʻʼ]/);
    assert.doesNotMatch(template, /[OoGg]’[a-z]/);
  }
  // The chat takes each request whole: within the bridge's limit, unchanged by its trim.
  for (const set of SETS) {
    const templates = quizPrefillTemplates(set.locale);
    for (const q of set.questions) {
      for (const chosen of [undefined, 0, 1, 2, 3]) {
        const text = quizPrefill(templates, set.subject, q, chosen);
        assert.ok(text.length <= CHAT_PREFILL_MAX);
        assert.equal(readChatPrefill({ detail: { text } } as unknown as Event), text);
      }
    }
  }
});

test('the page carries the same three requests the build checks, and the script fills them from the page', () => {
  for (const [page, locale] of [[quizPage(), 'ru'], [quizPage({}, { ...chatUz, chatRole: 'teacher' }), 'uz']] as const) {
    const html = renderToolWidgets(page, SETS);
    const templates = quizPrefillTemplates(locale);
    assert.equal(attribute(html, 'data-msg-ai-ask'), templates.ask);
    assert.equal(attribute(html, 'data-msg-ai-right'), templates.right);
    assert.equal(attribute(html, 'data-msg-ai-wrong'), templates.wrong);
    for (const name of ['count', 'score', 'done', 'none', 'right', 'wrong', 'ai', 'ai-sent', 'ai-wait']) assert.ok(attribute(html, `data-msg-${name}`), `${locale}: data-msg-${name}`);
  }
  const entry = read('src/tools/quiz/main.ts');
  assert.match(entry, /const templates = \{ ask: msg\.msgAiAsk \|\| '', right: msg\.msgAiRight \|\| '', wrong: msg\.msgAiWrong \|\| '' \};/);
  assert.match(entry, /const subject = msg\.pqSubject \|\| '';/);
  assert.match(entry, /const text = quizPrefill\(templates, subject, item, chosen\);/);
});

test('the script: a type-only bridge import, the event name checked by the compiler, nothing sent, no request, no analytics', () => {
  const entry = read('src/tools/quiz/main.ts');
  assert.match(entry, /import type \{ ChatPrefillDetail, ChatPrefillEventName \} from '\.\.\/\.\.\/shared\/chat-prefill';/);
  assert.doesNotMatch(entry, /^import \{[^}]*\} from '\.\.\/\.\.\/shared\//m, 'no value import from src/shared (it would share a chunk with the chat)');
  assert.match(entry, /const PREFILL: ChatPrefillEventName = 'gptbot:prefill';/);
  assert.match(entry, /window\.dispatchEvent\(new CustomEvent\(PREFILL, \{ detail \}\)\);/);
  assert.match(entry, /return detail\.accepted === true;/);
  assert.doesNotMatch(entry, /fetch\(|XMLHttpRequest|sendBeacon|gtag|dataLayer|ym\(|localStorage|sessionStorage|\.click\(\)|requestSubmit|\.submit\(/, 'no request, no storage, no send');
  // Its imports: the logic only (no set, no chat module).
  const imports = [...entry.matchAll(/^import (?:type )?\{[^}]*\} from '([^']+)';/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./logic', '../../shared/chat-prefill']);
  const logic = read('src/tools/quiz/logic.ts');
  assert.doesNotMatch(logic, /^import /m, 'the logic imports nothing');
});

// ── After a build (npm run build:fast) ──────────────────────────────────────
const DIST = path.join(ROOT, 'dist');
const built = (url: string) => path.join(DIST, url.replace(/^\/|\/$/g, ''), 'index.html');
test('built: the quiz entry is self-contained; no page without a quizSet carries the block or its script', { skip: !fs.existsSync(path.join(DIST, '.vite', 'manifest.json')) && 'no dist/ build present' }, () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, '.vite', 'manifest.json'), 'utf8')) as ViteManifest;
  const chunk = manifest[ENTRIES.practiceQuiz];
  assert.ok(chunk?.isEntry, 'the entry is built');
  assert.deepEqual(chunk.imports ?? [], [], 'no chunk shared with the chat or another widget');
  assert.equal(chunk.css, undefined, 'no stylesheet of its own: the block carries its style');
  for (const page of pages.filter((p) => p.status === 'published' && fs.existsSync(built(p.url)))) {
    const html = fs.readFileSync(built(page.url), 'utf8');
    const quiz = page.quizSet !== undefined;
    assert.equal(/data-practice-quiz/.test(html), quiz, page.url);
    assert.equal(/src="\/assets\/practice-quiz-[\w-]+\.js"/.test(html), quiz, page.url);
    assert.equal(/"@type":"Quiz"/.test(html), quiz, page.url);
  }
});
