// The practice-quiz widget under the chat (Page.widgets 'practice-quiz' with
// Page.quizSet), as static HTML: the set's heading, what it is (original
// practice questions written for the page, not official exam material), the
// choice by grade and topic with the score and «Restart» (hidden until the
// script runs), and every question with its four options and, in a native
// <details>, the answer key and its explanation, so a reader without
// JavaScript and a crawler read the whole set. src/tools/quiz/main.ts binds it
// (its own Vite entry, loaded only on a page with the widget) and reads the
// questions back from this HTML; the messages ride on data-msg-*.
// practiceQuizJsonLd describes the same questions as a schema.org Quiz.
import type { Page } from '../../src/shared/types';
import type { QuizSet } from '../../src/tools/quiz/set';
import { OPTION_LETTERS, gradesOf, optionLine, quizPrefill, topicsOf, type QuizPrefillTemplates } from '../../src/tools/quiz/logic';
import { CHAT_PREFILL_MAX } from '../../src/shared/chat-prefill';
import { escapeHtml, messageAttributes } from './html';

/** The widget's own anchor: page text can link #practice-quiz. */
export const PRACTICE_QUIZ_ANCHOR = 'practice-quiz';

type QuizCopyLocale = 'ru' | 'uz';

/** «1 тренировочный вопрос», «2 тренировочных вопроса», «5 тренировочных вопросов». */
function ruQuestions(count: number): string {
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return 'тренировочный вопрос';
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 'тренировочных вопроса';
  return 'тренировочных вопросов';
}

interface QuizCopy {
  intro: (count: number, subject: string) => string;
  honest: string;
  /** What the widget does, naming the choices the set offers (by grade, by topic). */
  how: (grade: boolean, topic: boolean) => string;
  grade: string;
  allGrades: string;
  gradeName: (grade: number) => string;
  questionName: (n: number) => string;
  topic: string;
  allTopics: string;
  restart: string;
  key: string;
  keyLine: string;
  aiNote: string;
  noscript: string;
  /** count, score, done, none ({total}, {answered}, {correct}); right, wrong ({key}); ai and its requests and notes. */
  messages: Record<string, string>;
}

const COPY: Record<QuizCopyLocale, QuizCopy> = {
  ru: {
    intro: (count, subject) => `${count} ${ruQuestions(count)} по предмету «${subject}», у каждого — ответ и разбор.`,
    honest: 'Вопросы составлены для этой страницы, чтобы тренироваться: это не официальные экзаменационные материалы и не ответы к реальным тестам.',
    how: (grade, topic) => `Выберите ответ: проверка сразу, с разбором.${grade || topic ? ` Вопросы можно выбрать ${[grade ? 'по классу' : '', topic ? 'по теме' : ''].filter(Boolean).join(' и ')}.` : ''} Всё работает в браузере, без запроса к AI.`,
    grade: 'Класс',
    allGrades: 'Все классы',
    gradeName: (grade) => `${grade} класс`,
    questionName: (n) => `Вопрос ${n}`,
    topic: 'Тема',
    allTopics: 'Все темы',
    restart: 'Начать заново',
    key: 'Ответ и разбор',
    keyLine: 'Правильный ответ: {key}',
    aiNote: 'Кнопка «Объяснить с AI» ставит вопрос, варианты и ваш ответ в поле чата выше. Проверьте и отправьте сами: такой вопрос расходует пробный ответ чата или AI-пакет, как любой другой.',
    noscript: 'Ответ и разбор открываются под каждым вопросом; мгновенная проверка и счёт работают при включённом JavaScript.',
    messages: {
      count: 'Вопросов: {total}. Выберите ответ — проверка сразу.',
      score: 'Верно {correct} из {answered} · отвечено {answered} из {total}.',
      done: 'Все вопросы пройдены: верно {correct} из {total}.',
      none: 'Таких вопросов нет: выберите другой класс или тему.',
      right: 'Верно!',
      wrong: 'Неверно. Правильный ответ: {key}.',
      ai: 'Объяснить с AI',
      'ai-ask': 'Помоги разобраться с тренировочным вопросом по предмету «{subject}». Не называй ответ сразу: сначала объясни, как рассуждать.\nВопрос: {question}\n{options}',
      'ai-right': 'Объясни по шагам тренировочный вопрос по предмету «{subject}».\nВопрос: {question}\n{options}\nМой ответ: {chosen}\nОтвет по ключу на странице: {key}\nПочему этот ответ верный?',
      'ai-wrong': 'Объясни по шагам тренировочный вопрос по предмету «{subject}».\nВопрос: {question}\n{options}\nМой ответ: {chosen}\nОтвет по ключу на странице: {key}\nПочему верен ответ по ключу и в чём моя ошибка?',
      'ai-sent': 'Вопрос в поле чата выше: проверьте и отправьте.',
      'ai-wait': 'AI-чат ещё загружается или отвечает: попробуйте через пару секунд.',
    },
  },
  uz: {
    intro: (count, subject) => `«${subject}» fanidan ${count} ta mashq savoli, har birining javobi va izohi bilan.`,
    honest: 'Savollar shu sahifa uchun mashq qilish maqsadida tuzilgan: bu rasmiy imtihon materiallari ham, haqiqiy testlarning javoblari ham emas.',
    how: (grade, topic) => `Javobni tanlang: darhol tekshiriladi va izoh ko‘rsatiladi.${grade || topic ? ` Savollarni ${[grade ? 'sinf' : '', topic ? 'mavzu' : ''].filter(Boolean).join(' va ')} bo‘yicha tanlash mumkin.` : ''} Hammasi brauzerda ishlaydi, AI’ga so‘rov yuborilmaydi.`,
    grade: 'Sinf',
    allGrades: 'Barcha sinflar',
    gradeName: (grade) => `${grade}-sinf`,
    questionName: (n) => `${n}-savol`,
    topic: 'Mavzu',
    allTopics: 'Barcha mavzular',
    restart: 'Qaytadan boshlash',
    key: 'Javob va izoh',
    keyLine: 'To‘g‘ri javob: {key}',
    aiNote: '«AI bilan tushuntirish» tugmasi savol, variantlar va javobingizni yuqoridagi chat maydoniga qo‘yadi. Tekshirib, o‘zingiz yuborasiz: bunday savol ham boshqa savollar kabi chatning sinov javobini yoki AI paketni sarflaydi.',
    noscript: 'Javob va izoh har bir savol ostida ochiladi; darhol tekshirish va hisob JavaScript yoqilganda ishlaydi.',
    messages: {
      count: 'Savollar: {total} ta. Javobni tanlang — darhol tekshiriladi.',
      score: 'To‘g‘ri: {answered} tadan {correct} ta · javob berilgan: {total} tadan {answered} ta.',
      done: 'Barcha savollarga javob berildi: {total} tadan {correct} ta to‘g‘ri.',
      none: 'Bunday savollar yo‘q: boshqa sinf yoki mavzuni tanlang.',
      right: 'To‘g‘ri!',
      wrong: 'Noto‘g‘ri. To‘g‘ri javob: {key}.',
      ai: 'AI bilan tushuntirish',
      'ai-ask': '«{subject}» fanidan mashq savolini tushunishga yordam ber. Javobni darhol aytma: avval qanday fikrlash kerakligini tushuntir.\nSavol: {question}\n{options}',
      'ai-right': '«{subject}» fanidan mashq savolini qadamma-qadam tushuntir.\nSavol: {question}\n{options}\nMening javobim: {chosen}\nSahifadagi kalit bo‘yicha javob: {key}\nNega bu javob to‘g‘ri?',
      'ai-wrong': '«{subject}» fanidan mashq savolini qadamma-qadam tushuntir.\nSavol: {question}\n{options}\nMening javobim: {chosen}\nSahifadagi kalit bo‘yicha javob: {key}\nNega kalitdagi javob to‘g‘ri va men qayerda xato qildim?',
      'ai-sent': 'Savol yuqoridagi chat maydonida: tekshirib, yuboring.',
      'ai-wait': 'AI-chat hali yuklanmoqda yoki javob yozmoqda: birozdan keyin qayta urinib ko‘ring.',
    },
  },
};

const STYLE = `<style>
#practice-quiz{margin:0 0 2.5rem;padding:clamp(1rem,4vw,1.5rem);border:1px solid #2fe6d140;border-radius:1.25rem;background:#0d2028;color:#f2f8fa;scroll-margin-top:1.5rem;overflow-wrap:anywhere}
#practice-quiz *{box-sizing:border-box}
#practice-quiz h2{margin:0 0 .75rem;font-size:clamp(1.25rem,3.5vw,1.6rem);line-height:1.25}
#practice-quiz p{margin:0 0 1rem;line-height:1.6;color:#c0d1d8;font-size:.95rem}
#practice-quiz label{display:block;margin:0 0 .3rem;font-size:.85rem;font-weight:650;color:#f2f8fa}
#practice-quiz select{width:100%;min-height:44px;padding:.5rem .65rem;border:1px solid #647e89;border-radius:.65rem;background:#0a1921;color:#f2f8fa;font:inherit;font-size:.95rem}
#practice-quiz button{font:inherit;font-size:.95rem;line-height:1.35;min-height:44px;padding:.55rem .85rem;border:1px solid #647e89;border-radius:.65rem;background:#152e38;color:#f2f8fa;cursor:pointer;touch-action:manipulation}
#practice-quiz button:focus-visible,#practice-quiz select:focus-visible,#practice-quiz summary:focus-visible{outline:3px solid #fce29c;outline-offset:2px}
#practice-quiz .pq-bar{display:grid;gap:.6rem;margin:0 0 1rem;padding:.75rem;border:1px solid #2fe6d130;border-radius:1rem;background:#0a1921}
#practice-quiz .pq-view{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem}
#practice-quiz .pq-score{margin:0;font-weight:650;color:#bafdf5}
#practice-quiz .pq-list,#practice-quiz .pq-options{margin:0;padding:0;list-style:none}
#practice-quiz .pq-item{margin:0 0 1rem;padding:1rem;border:1px solid #2fe6d130;border-radius:1rem;background:#0a1921}
#practice-quiz .pq-item[data-state="right"]{border-color:#9ef5c480}
#practice-quiz .pq-item[data-state="wrong"]{border-color:#ffb4a880}
#practice-quiz .pq-meta{margin:0 0 .35rem;font-size:.8rem;color:#8fa6b0}
#practice-quiz .pq-q{margin:0 0 .75rem;font-size:1rem;font-weight:650;color:#f2f8fa;white-space:pre-line}
#practice-quiz .pq-options{display:grid;gap:.45rem;margin:0 0 .75rem}
#practice-quiz .pq-options li{padding:.5rem .75rem;border:1px solid #ffffff1f;border-radius:.65rem;color:#c0d1d8}
#practice-quiz .pq-options[data-ready] li{padding:0;border:0}
#practice-quiz .pq-options button{width:100%;text-align:left}
#practice-quiz .pq-options button[aria-disabled="true"]{cursor:default;opacity:.75}
#practice-quiz .pq-options button[data-mark]{opacity:1;font-weight:650}
#practice-quiz .pq-options button[data-mark="right"]{border-color:#9ef5c4;background:#123d2c;color:#e6fff1}
#practice-quiz .pq-options button[data-mark="wrong"]{border-color:#ffb4a8;background:#40201c;color:#ffe9e5}
#practice-quiz .pq-letter{font-weight:700;color:#bafdf5}
#practice-quiz .pq-feedback{min-height:0;margin:0 0 .5rem;font-weight:650}
#practice-quiz .pq-feedback:empty{display:none}
#practice-quiz [data-tone="right"]{color:#9ef5c4}
#practice-quiz [data-tone="wrong"]{color:#ffb4a8}
#practice-quiz details{margin:0 0 .5rem;border-top:1px solid #ffffff14;padding-top:.5rem}
#practice-quiz summary{cursor:pointer;font-size:.9rem;font-weight:650;color:#bafdf5;min-height:32px}
#practice-quiz details p{margin:.5rem 0 0;white-space:pre-line}
#practice-quiz .pq-right{font-weight:650;color:#f2f8fa}
#practice-quiz .pq-tools{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
#practice-quiz button[data-pq-ai]{background:#fce29c;border-color:#fce29c;color:#2b2208;font-weight:700}
#practice-quiz button[data-pq-action="restart"]{justify-self:start}
#practice-quiz .pq-small{margin:0;font-size:.85rem;color:#bafdf5}
</style>`;

function copyFor(locale: string): QuizCopy {
  return COPY[locale === 'uz' ? 'uz' : 'ru'];
}

/** The page's three requests for the chat (the data-msg-ai-* templates). */
export function quizPrefillTemplates(locale: string): QuizPrefillTemplates {
  const { messages } = copyFor(locale);
  return { ask: messages['ai-ask'], right: messages['ai-right'], wrong: messages['ai-wrong'] };
}

/**
 * The questions whose request for the chat would not fit the composer
 * (CHAT_PREFILL_MAX): the chat would refuse it. Checked for the request
 * before a pick and after each of the four picks.
 */
export function practiceQuizPrefillIssues(set: QuizSet): string[] {
  const templates = quizPrefillTemplates(set.locale);
  const issues: string[] = [];
  set.questions.forEach((question, index) => {
    const longest = Math.max(...[undefined, 0, 1, 2, 3].map((chosen) => quizPrefill(templates, set.subject, question, chosen).length));
    if (longest > CHAT_PREFILL_MAX) issues.push(`questions[${index}] (${question.id}): its request for the chat has ${longest} characters, at most ${CHAT_PREFILL_MAX}; shorten the question or its options`);
  });
  return issues;
}

/** «7-sinf» / «7 класс». */
export function quizGradeName(locale: string, grade: number): string {
  return copyFor(locale).gradeName(grade);
}

/** The practice-quiz block, under the chat, on a page that lists the widget with its set. */
export function renderPracticeQuizBlock(page: Page, set: QuizSet): string {
  const t = copyFor(page.locale);
  const grades = gradesOf(set.questions);
  const topics = topicsOf(set.questions);
  const option = (value: string, label: string) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  const gradeView = grades.length > 1
    ? `<div><label for="pq-grade">${escapeHtml(t.grade)}</label><select id="pq-grade" data-pq-view="grade">${option('', t.allGrades)}${grades.map((grade) => option(String(grade), t.gradeName(grade))).join('')}</select></div>`
    : '';
  const topicView = topics.length > 1
    ? `<div><label for="pq-topic">${escapeHtml(t.topic)}</label><select id="pq-topic" data-pq-view="topic">${option('', t.allTopics)}${topics.map((topic) => option(topic, topic)).join('')}</select></div>`
    : '';
  const questions = set.questions.map((question, index) => {
    const at = `pq-${question.id}`;
    const meta = [t.questionName(index + 1), question.grade !== undefined ? t.gradeName(question.grade) : '', question.topic].filter(Boolean).join(' · ');
    const options = question.options
      .map((text, optionIndex) => `<li data-pq-option="${optionIndex}"><span class="pq-letter">${OPTION_LETTERS[optionIndex]})</span> <span data-pq-text>${escapeHtml(text)}</span></li>`)
      .join('');
    const keyLine = t.keyLine.replace('{key}', () => optionLine(question.options, question.answer));
    return `<li class="pq-item" id="${at}" data-pq-item="${escapeHtml(question.id)}" data-answer="${question.answer}"${question.grade !== undefined ? ` data-grade="${question.grade}"` : ''} data-topic="${escapeHtml(question.topic)}">
          <p class="pq-meta">${escapeHtml(meta)}</p>
          <p class="pq-q" id="${at}-q" data-pq-q>${escapeHtml(question.q)}</p>
          <ol class="pq-options" aria-labelledby="${at}-q">${options}</ol>
          <details><summary>${escapeHtml(t.key)}</summary><p class="pq-right">${escapeHtml(keyLine)}</p><p>${escapeHtml(question.explanation)}</p></details>
        </li>`;
  }).join('\n        ');
  return `<section id="${PRACTICE_QUIZ_ANCHOR}" data-practice-quiz data-pq-set="${escapeHtml(set.id)}" data-pq-subject="${escapeHtml(set.subject)}" aria-labelledby="pq-heading"${messageAttributes(t.messages)}>
${STYLE}
      <h2 id="pq-heading">${escapeHtml(set.title)}</h2>
      <p>${escapeHtml(t.intro(set.questions.length, set.subject))}</p>
      <p>${escapeHtml(t.honest)}</p>
      <p>${escapeHtml(t.how(grades.length > 1, topics.length > 1))}</p>
      <div class="pq-bar" data-pq-bar hidden>
        ${gradeView || topicView ? `<div class="pq-view">${gradeView}${topicView}</div>` : ''}
        <p class="pq-score" role="status" aria-live="polite" data-pq-score></p>
        <button type="button" data-pq-action="restart">${escapeHtml(t.restart)}</button>
      </div>
      <ol class="pq-list">
        ${questions}
      </ol>
      <p>${escapeHtml(t.aiNote)}</p>
      <noscript><p>${escapeHtml(t.noscript)}</p></noscript>
    </section>
    `;
}

/**
 * The set as a schema.org Quiz for the page's JSON-LD graph: every question
 * as a multiple-choice Question, the key as its acceptedAnswer with the
 * explanation, the other options as suggestedAnswer. All of it is on the page
 * (the key and the explanation inside each question's <details>).
 */
export function practiceQuizJsonLd(set: QuizSet, pageUrl: string): Record<string, unknown> {
  return {
    '@type': 'Quiz',
    '@id': `${pageUrl}#${PRACTICE_QUIZ_ANCHOR}`,
    name: set.title,
    inLanguage: set.locale,
    about: { '@type': 'Thing', name: set.subject },
    isPartOf: { '@id': `${pageUrl}#webpage` },
    hasPart: set.questions.map((question) => ({
      '@type': 'Question',
      eduQuestionType: 'Multiple choice',
      text: question.q,
      about: { '@type': 'Thing', name: question.topic },
      ...(question.grade !== undefined ? { educationalLevel: quizGradeName(set.locale, question.grade) } : {}),
      acceptedAnswer: {
        '@type': 'Answer',
        position: question.answer,
        text: question.options[question.answer],
        answerExplanation: { '@type': 'Comment', text: question.explanation },
      },
      suggestedAnswer: question.options
        .map((text, position) => ({ '@type': 'Answer', position, text }))
        .filter((answer) => answer.position !== question.answer),
    })),
  };
}
