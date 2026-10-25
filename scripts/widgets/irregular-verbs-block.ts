// The irregular-verbs widget under the chat (Page.widgets 'irregular-verbs'),
// as static HTML: the full V1–V2–V3 table with the page language's
// translation (the content a learner searches for, readable without
// JavaScript and by a crawler), the search, the «hide a column» practice and
// the 10-question quiz. src/tools/irregular-verbs/main.ts binds it (its own
// Vite entry, loaded only on a page with the widget) and reads the rows back
// from this table; the messages ride on data-msg-*.
import type { Page } from '../../src/shared/types';
import { IRREGULAR_VERBS } from '../../src/tools/irregular-verbs/data';
import { QUIZ_LENGTH } from '../../src/tools/irregular-verbs/quiz';
import { escapeHtml, messageAttributes } from './html';

/** The widget's own anchor: page text can link #irregular-verbs. */
export const IRREGULAR_VERBS_ANCHOR = 'irregular-verbs';

interface VerbsCopy {
  heading: string;
  intro: (count: number) => string;
  how: string;
  search: string;
  placeholder: string;
  practice: string;
  hide: { none: string; v1: string; v2: string; v3: string; tr: string };
  practiceNote: string;
  caption: string;
  translation: string;
  quiz: string;
  quizIntro: string;
  start: string;
  answer: string;
  check: string;
  next: string;
  restart: string;
  ai: string;
  aiNote: string;
  noscript: string;
  messages: Record<string, string>;
}

const COPY: Record<'ru' | 'uz', VerbsCopy> = {
  ru: {
    heading: 'Неправильные глаголы английского: таблица V1, V2, V3 с переводом',
    intro: (count) => `${count} самых употребимых неправильных глаголов: начальная форма (V1), прошедшее время (V2, Past Simple) и причастие прошедшего времени (V3, Past Participle). Две формы через косую черту верны обе: was/were — по числу, остальные — британский и американский варианты (learned/learnt, got/gotten).`,
    how: `Найдите глагол, скройте колонку, чтобы проверить себя, или пройдите тест из ${QUIZ_LENGTH} вопросов. Всё работает в браузере, без запроса к AI.`,
    search: 'Найти глагол: по-английски или по-русски',
    placeholder: 'go, take, писать…',
    practice: 'Тренировка: скрыть колонку',
    hide: { none: 'Показать всё', v1: 'Скрыть V1', v2: 'Скрыть V2', v3: 'Скрыть V3', tr: 'Скрыть перевод' },
    practiceNote: 'Скрытая ячейка открывается по нажатию.',
    caption: 'Неправильные глаголы английского языка: V1, V2, V3 и перевод на русский',
    translation: 'Перевод',
    quiz: `Тест: ${QUIZ_LENGTH} глаголов`,
    quizIntro: 'Дан глагол и форма — V2 или V3. Напишите её и нажмите «Проверить»; где форм две, подойдёт любая.',
    start: 'Начать тест',
    answer: 'Ваш ответ',
    check: 'Проверить',
    next: 'Дальше',
    restart: 'Пройти ещё раз',
    ai: 'Потренироваться с AI',
    aiNote: 'Кнопка «Потренироваться с AI» ставит в поле чата выше просьбу дать упражнения — после теста с теми глаголами, в которых вы ошиблись. Отправляете вы сами; такой вопрос расходует пробный ответ чата или AI-пакет.',
    noscript: 'Поиск, скрытие колонок и тест работают при включённом JavaScript; таблица видна и без него.',
    messages: {
      ask: 'Вопрос {n} из {total}. {v1} — «{tr}». Напишите {form}.',
      'form-v2': 'V2 (Past Simple)',
      'form-v3': 'V3 (Past Participle)',
      right: 'Верно!',
      wrong: 'Неверно. Правильно: {answer}.',
      empty: 'Напишите ответ.',
      score: 'Результат: {score} из {total}.',
      mistakes: 'Ошибки: {list}.',
      found: 'Найдено глаголов: {count}.',
      none: 'Ничего не найдено: попробуйте другую форму или перевод.',
      reveal: 'Показать ответ',
      'ai-prompt': 'Потренируй меня в неправильных глаголах английского: дай 10 коротких упражнений на формы V2 и V3, ответы — в конце.',
      'ai-mistakes': 'Потренируй меня в неправильных глаголах английского. В тесте я ошибся в глаголах: {list}. Дай 10 коротких упражнений с ними, ответы — в конце.',
      'ai-sent': 'Просьба в поле чата выше: проверьте и отправьте.',
      'ai-wait': 'AI-чат ещё загружается или отвечает: попробуйте через пару секунд.',
    },
  },
  uz: {
    heading: 'Ingliz tilidagi noto‘g‘ri fe’llar: V1, V2, V3 jadvali tarjimasi bilan',
    intro: (count) => `Eng ko‘p ishlatiladigan ${count} ta noto‘g‘ri fe’l: asosiy shakl (V1), o‘tgan zamon (V2, Past Simple) va o‘tgan zamon sifatdoshi (V3, Past Participle). Qiya chiziq bilan berilgan ikki shaklning ikkalasi ham to‘g‘ri: was/were — songa qarab, qolganlari — britancha va amerikancha variantlar (learned/learnt, got/gotten).`,
    how: `Fe’lni qidiring, o‘zingizni tekshirish uchun ustunni yashiring yoki ${QUIZ_LENGTH} savollik testdan o‘ting. Hammasi brauzerda ishlaydi, AI’ga so‘rov yuborilmaydi.`,
    search: 'Fe’lni qidirish: inglizcha yoki o‘zbekcha',
    placeholder: 'go, take, yozmoq…',
    practice: 'Mashq: ustunni yashirish',
    hide: { none: 'Hammasini ko‘rsatish', v1: 'V1 ni yashirish', v2: 'V2 ni yashirish', v3: 'V3 ni yashirish', tr: 'Tarjimani yashirish' },
    practiceNote: 'Yashirilgan katak bosilganda ochiladi.',
    caption: 'Ingliz tilidagi noto‘g‘ri fe’llar: V1, V2, V3 va o‘zbekcha tarjimasi',
    translation: 'Tarjima',
    quiz: `Test: ${QUIZ_LENGTH} ta fe’l`,
    quizIntro: 'Fe’l va shakl beriladi — V2 yoki V3. Uni yozib, «Tekshirish» tugmasini bosing; ikki shakl bo‘lsa, istalgani to‘g‘ri.',
    start: 'Testni boshlash',
    answer: 'Javobingiz',
    check: 'Tekshirish',
    next: 'Keyingisi',
    restart: 'Qaytadan o‘tish',
    ai: 'AI bilan mashq qilish',
    aiNote: '«AI bilan mashq qilish» tugmasi yuqoridagi chat maydoniga mashq so‘rovini qo‘yadi — testdan keyin xato qilgan fe’llaringiz bilan. Uni o‘zingiz yuborasiz; bunday savol chatning sinov javobini yoki AI paketni sarflaydi.',
    noscript: 'Qidiruv, ustunni yashirish va test JavaScript yoqilganda ishlaydi; jadval usiz ham ko‘rinadi.',
    messages: {
      ask: '{total} tadan {n}-savol. {v1} — «{tr}». {form} shaklini yozing.',
      'form-v2': 'V2 (Past Simple)',
      'form-v3': 'V3 (Past Participle)',
      right: 'To‘g‘ri!',
      wrong: 'Noto‘g‘ri. To‘g‘ri javob: {answer}.',
      empty: 'Javobni yozing.',
      score: 'Natija: {total} tadan {score} ta.',
      mistakes: 'Xatolar: {list}.',
      found: 'Topilgan fe’llar: {count} ta.',
      none: 'Hech narsa topilmadi: boshqa shakl yoki tarjimani yozib ko‘ring.',
      reveal: 'Javobni ko‘rsatish',
      'ai-prompt': 'Ingliz tilidagi noto‘g‘ri fe’llar bo‘yicha meni mashq qildir: V2 va V3 shakllariga 10 ta qisqa mashq ber, javoblarini oxirida yoz.',
      'ai-mistakes': 'Ingliz tilidagi noto‘g‘ri fe’llar bo‘yicha meni mashq qildir. Testda shu fe’llarda xato qildim: {list}. Shu fe’llar bilan 10 ta qisqa mashq ber, javoblarini oxirida yoz.',
      'ai-sent': 'So‘rov yuqoridagi chat maydonida: tekshirib, yuboring.',
      'ai-wait': 'AI-chat hali yuklanmoqda yoki javob yozmoqda: birozdan keyin qayta urinib ko‘ring.',
    },
  },
};

const STYLE = `<style>
#irregular-verbs{margin:0 0 2.5rem;padding:clamp(1rem,4vw,1.5rem);border:1px solid #2fe6d140;border-radius:1.25rem;background:#0d2028;color:#f2f8fa;scroll-margin-top:1.5rem;overflow-wrap:anywhere}
#irregular-verbs *{box-sizing:border-box}
#irregular-verbs h2{margin:0 0 .75rem;font-size:clamp(1.25rem,3.5vw,1.6rem);line-height:1.25}
#irregular-verbs h3{margin:0 0 .5rem;font-size:1.05rem;line-height:1.3}
#irregular-verbs p{margin:0 0 1rem;line-height:1.6;color:#c0d1d8;font-size:.95rem}
#irregular-verbs label{display:block;margin:0 0 .4rem;font-size:.9rem;font-weight:650;color:#f2f8fa}
#irregular-verbs input{display:block;width:100%;margin:0 0 .5rem;padding:.65rem .75rem;border:1px solid #647e89;border-radius:.65rem;background:#0a1921;color:#f2f8fa;font:inherit;font-size:1rem}
#irregular-verbs button{font:inherit;font-size:.95rem;line-height:1.3;min-height:44px;padding:.55rem .85rem;border:1px solid #647e89;border-radius:.65rem;background:#152e38;color:#f2f8fa;cursor:pointer}
#irregular-verbs button[aria-pressed="true"]{background:#66ecdd;border-color:#66ecdd;color:#08262b;font-weight:700}
#irregular-verbs button[data-iv-action="start"],#irregular-verbs button[data-iv-action="check"],#irregular-verbs button[data-iv-action="next"]{background:#66ecdd;border-color:#66ecdd;color:#08262b;font-weight:700}
#irregular-verbs button[data-iv-action="ai"]{background:#fce29c;border-color:#fce29c;color:#2b2208;font-weight:700}
#irregular-verbs button:focus-visible,#irregular-verbs input:focus-visible,#irregular-verbs td:focus-visible,#irregular-verbs [tabindex="-1"]:focus-visible{outline:3px solid #fce29c;outline-offset:2px}
#irregular-verbs .iv-row{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 .75rem}
#irregular-verbs .iv-small{min-height:1.4em;margin:0 0 .75rem;font-size:.85rem;color:#bafdf5}
#irregular-verbs .iv-wrap{max-height:32rem;overflow:auto;margin:0 0 1rem;border:1px solid #2fe6d130;border-radius:.75rem}
#irregular-verbs table{width:100%;border-collapse:collapse;font-size:.95rem}
#irregular-verbs caption{padding:.6rem .75rem;text-align:left;font-size:.85rem;color:#8fa6b0}
#irregular-verbs th,#irregular-verbs td{padding:.5rem .7rem;border-top:1px solid #ffffff14;text-align:left;vertical-align:top}
#irregular-verbs thead th{position:sticky;top:0;background:#12303b;font-size:.85rem;color:#f2f8fa}
#irregular-verbs td{color:#c0d1d8}
#irregular-verbs td[data-col="v1"]{font-weight:650;color:#f2f8fa}
#irregular-verbs table[data-hide="v1"] td[data-col="v1"]:not([data-shown]),#irregular-verbs table[data-hide="v2"] td[data-col="v2"]:not([data-shown]),#irregular-verbs table[data-hide="v3"] td[data-col="v3"]:not([data-shown]),#irregular-verbs table[data-hide="tr"] td[data-col="tr"]:not([data-shown]){color:transparent;background:#152e38;cursor:pointer;user-select:none}
#irregular-verbs .iv-quiz{margin:1.5rem 0 1rem;padding:1rem;border:1px solid #2fe6d130;border-radius:1rem;background:#0a1921}
#irregular-verbs [data-iv-feedback]{min-height:1.5em}
#irregular-verbs [data-tone="right"]{color:#9ef5c4}
#irregular-verbs [data-tone="wrong"]{color:#ffb4a8}
#irregular-verbs [data-iv-score]{font-size:1.05rem;font-weight:650;color:#f2f8fa}
</style>`;

/** The irregular-verbs block, under the chat, on a page that lists the widget. */
export function renderIrregularVerbsBlock(page: Page): string {
  const locale = page.locale === 'uz' ? 'uz' : 'ru';
  const t = COPY[locale];
  const hide = (Object.keys(t.hide) as Array<keyof VerbsCopy['hide']>)
    .map((column) => `<button type="button" data-iv-hide="${column}" aria-pressed="${column === 'none'}">${escapeHtml(t.hide[column])}</button>`)
    .join('');
  const rows = IRREGULAR_VERBS
    .map((verb) => `<tr><td data-col="v1">${escapeHtml(verb.v1)}</td><td data-col="v2">${escapeHtml(verb.v2)}</td><td data-col="v3">${escapeHtml(verb.v3)}</td><td data-col="tr" lang="${locale}">${escapeHtml(verb[locale])}</td></tr>`)
    .join('\n');
  return `<section id="${IRREGULAR_VERBS_ANCHOR}" data-irregular-verbs aria-labelledby="iv-heading"${messageAttributes(t.messages)}>
${STYLE}
      <h2 id="iv-heading">${escapeHtml(t.heading)}</h2>
      <p>${escapeHtml(t.intro(IRREGULAR_VERBS.length))}</p>
      <p>${escapeHtml(t.how)}</p>
      <label for="iv-search">${escapeHtml(t.search)}</label>
      <input id="iv-search" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escapeHtml(t.placeholder)}">
      <p class="iv-small" role="status" aria-live="polite" data-iv-count></p>
      <div class="iv-row" role="group" aria-label="${escapeHtml(t.practice)}">${hide}</div>
      <p class="iv-small">${escapeHtml(t.practiceNote)}</p>
      <div class="iv-wrap">
        <table data-iv-table>
          <caption>${escapeHtml(t.caption)}</caption>
          <thead><tr><th scope="col">V1</th><th scope="col">V2 (Past Simple)</th><th scope="col">V3 (Past Participle)</th><th scope="col">${escapeHtml(t.translation)}</th></tr></thead>
          <tbody lang="en">
${rows}
          </tbody>
        </table>
      </div>
      <div class="iv-quiz" data-iv-quiz>
        <h3>${escapeHtml(t.quiz)}</h3>
        <p>${escapeHtml(t.quizIntro)}</p>
        <button type="button" data-iv-action="start">${escapeHtml(t.start)}</button>
        <div data-iv-question hidden>
          <p data-iv-prompt></p>
          <label for="iv-answer">${escapeHtml(t.answer)}</label>
          <input id="iv-answer" type="text" lang="en" autocomplete="off" autocapitalize="off" spellcheck="false">
          <div class="iv-row"><button type="button" data-iv-action="check">${escapeHtml(t.check)}</button><button type="button" data-iv-action="next" hidden>${escapeHtml(t.next)}</button></div>
          <p data-iv-feedback role="status" aria-live="polite"></p>
        </div>
        <div data-iv-result hidden>
          <p data-iv-score tabindex="-1"></p>
          <div class="iv-row"><button type="button" data-iv-action="start">${escapeHtml(t.restart)}</button><button type="button" data-iv-action="ai">${escapeHtml(t.ai)}</button></div>
        </div>
      </div>
      <div class="iv-row"><button type="button" data-iv-action="ai">${escapeHtml(t.ai)}</button></div>
      <p class="iv-small" role="status" aria-live="polite" data-iv-status></p>
      <p>${escapeHtml(t.aiNote)}</p>
      <noscript><p>${escapeHtml(t.noscript)}</p></noscript>
    </section>
    `;
}
