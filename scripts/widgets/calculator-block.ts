// The calculator widget under the chat (Page.widgets 'calculator'), as
// static HTML: the heading, what it does, the field, DEG/RAD, the keys, = and
// «Explain with AI», the history box and the rules, in the page's language.
// A crawler and a visitor without JavaScript read the same text. The
// messages ride on data-msg-* for src/tools/calculator/main.ts, which binds
// it (its own Vite entry, loaded only on a page with the widget).
import type { Page } from '../../src/shared/types';
import type { CalcErrorCode } from '../../src/tools/calculator/engine';
import { MAX_EXPRESSION } from '../../src/tools/calculator/engine';
import { escapeHtml, messageAttributes } from './html';

/** The widget's own anchor: page text can link #kalkulyator. */
export const CALCULATOR_ANCHOR = 'kalkulyator';

type Key = { insert?: string; action?: 'clear' | 'back'; label: string; aria?: string; fn?: boolean };

interface CalculatorCopy {
  heading: string;
  intro: string;
  aiNote: string;
  input: string;
  angles: string;
  deg: string;
  rad: string;
  keys: string;
  equals: string;
  ai: string;
  history: string;
  rules: string;
  noscript: string;
  aria: Record<string, string>;
  errors: Record<CalcErrorCode, string>;
  messages: { 'ai-prompt': string; 'ai-fix': string; 'ai-deg': string; 'ai-rad': string; 'ai-empty': string; 'ai-sent': string; 'ai-wait': string };
}

const COPY: Record<'ru' | 'uz', CalculatorCopy> = {
  ru: {
    heading: 'Онлайн-калькулятор: обычный и инженерный',
    intro: 'Считает прямо в браузере: скобки, проценты, степени, корни, синус, косинус, тангенс и логарифмы. Без запроса к AI и без лимита: пробные ответы чата не тратятся.',
    aiNote: 'Кнопка «Объяснить с AI» ставит пример с ответом в поле чата выше. Проверьте и отправьте сами: AI разберёт решение по шагам. Такой вопрос расходует пробный ответ чата или AI-пакет, как любой другой.',
    input: 'Пример',
    angles: 'Углы',
    deg: 'Градусы (DEG)',
    rad: 'Радианы (RAD)',
    keys: 'Кнопки калькулятора',
    equals: 'Посчитать',
    ai: 'Объяснить с AI',
    history: 'История: последние 10 примеров',
    rules: 'Как считает: умножение и деление раньше сложения; степень — справа налево (2^3^2 = 2^9 = 512); −2^2 = −4. Процент: 200 + 10% = 220, 200 × 10% = 20. Без скобок функция берёт следующее число: sin 30 = sin(30). Делить можно знаком ÷, / или :, дробную часть отделять точкой или запятой. Клавиатура: Enter — посчитать, Esc — очистить.',
    noscript: 'Калькулятор работает при включённом JavaScript.',
    aria: {
      sin: 'синус', cos: 'косинус', tan: 'тангенс', ln: 'натуральный логарифм', log: 'десятичный логарифм',
      sqrt: 'квадратный корень', square: 'в квадрат', power: 'степень', open: 'открыть скобку', close: 'закрыть скобку',
      divide: 'разделить', multiply: 'умножить', minus: 'минус', plus: 'плюс', percent: 'процент',
      point: 'десятичная точка', pi: 'число пи', e: 'число e', clear: 'очистить', back: 'стереть последний символ',
    },
    errors: {
      empty: 'Введите пример, например (2 + 3) × 4.',
      'too-long': `Слишком длинный пример: не больше ${MAX_EXPRESSION} символов.`,
      'bad-char': 'Непонятный символ «{token}».',
      'bad-number': 'Неверное число «{token}»: у числа одна десятичная точка.',
      'unknown-name': 'Нет такой функции или константы: «{token}». Есть sin, cos, tan, sqrt, log, ln, pi и e.',
      'missing-operand': 'Не хватает числа: пример обрывается или два знака стоят подряд.',
      'missing-operator': 'Между числами нужен знак действия.',
      unbalanced: 'Скобки не сходятся: проверьте ( и ).',
      'div-zero': 'На ноль делить нельзя.',
      domain: 'Нет значения: корень из отрицательного числа или логарифм числа не больше нуля.',
      undefined: 'Тангенс здесь не определён: угол 90° + k·180°.',
      overflow: 'Слишком большое число.',
    },
    messages: {
      'ai-prompt': 'Объясни по шагам: {expression} = {result}',
      'ai-fix': 'Найди ошибку в записи примера и покажи, как записать его правильно: {expression}',
      'ai-deg': '(углы в градусах)',
      'ai-rad': '(углы в радианах)',
      'ai-empty': 'Сначала введите пример.',
      'ai-sent': 'Пример в поле чата выше: проверьте и отправьте.',
      'ai-wait': 'AI-чат ещё загружается или отвечает: попробуйте через пару секунд.',
    },
  },
  uz: {
    heading: 'Onlayn kalkulyator: oddiy va ilmiy',
    intro: 'Brauzerning o‘zida hisoblaydi: qavslar, foizlar, darajalar, ildizlar, sinus, kosinus, tangens va logarifmlar. AI’ga so‘rov yuborilmaydi, limit yo‘q: chatning sinov javoblari sarflanmaydi.',
    aiNote: '«AI bilan tushuntirish» tugmasi misolni javobi bilan yuqoridagi chat maydoniga qo‘yadi. Tekshirib, o‘zingiz yuborasiz: AI yechimni qadamma-qadam tushuntiradi. Bunday savol ham boshqa savollar kabi chatning sinov javobini yoki AI paketni sarflaydi.',
    input: 'Misol',
    angles: 'Burchaklar',
    deg: 'Gradus (DEG)',
    rad: 'Radian (RAD)',
    keys: 'Kalkulyator tugmalari',
    equals: 'Hisoblash',
    ai: 'AI bilan tushuntirish',
    history: 'Tarix: oxirgi 10 ta misol',
    rules: 'Qanday hisoblaydi: ko‘paytirish va bo‘lish qo‘shishdan oldin; daraja o‘ngdan chapga (2^3^2 = 2^9 = 512); −2^2 = −4. Foiz: 200 + 10% = 220, 200 × 10% = 20. Qavssiz yozilgan funksiya o‘zidan keyingi songa qo‘llanadi: sin 30 = sin(30). Bo‘lishni ÷, / yoki : bilan, kasr qismini nuqta yoki vergul bilan yozish mumkin. Klaviatura: Enter — hisoblash, Esc — tozalash.',
    noscript: 'Kalkulyator JavaScript yoqilganda ishlaydi.',
    aria: {
      sin: 'sinus', cos: 'kosinus', tan: 'tangens', ln: 'natural logarifm', log: 'o‘nli logarifm',
      sqrt: 'kvadrat ildiz', square: 'kvadratga ko‘tarish', power: 'daraja', open: 'qavsni ochish', close: 'qavsni yopish',
      divide: 'bo‘lish', multiply: 'ko‘paytirish', minus: 'ayirish', plus: 'qo‘shish', percent: 'foiz',
      point: 'o‘nli nuqta', pi: 'pi soni', e: 'e soni', clear: 'tozalash', back: 'oxirgi belgini o‘chirish',
    },
    errors: {
      empty: 'Misol kiriting, masalan: (2 + 3) × 4.',
      'too-long': `Misol juda uzun: ko‘pi bilan ${MAX_EXPRESSION} ta belgi.`,
      'bad-char': 'Tushunarsiz belgi: «{token}».',
      'bad-number': 'Noto‘g‘ri son: «{token}». Sonda bitta o‘nli nuqta bo‘ladi.',
      'unknown-name': 'Bunday funksiya yoki o‘zgarmas yo‘q: «{token}». Mavjudlari: sin, cos, tan, sqrt, log, ln, pi va e.',
      'missing-operand': 'Son yetishmayapti: misol chala qolgan yoki ikki belgi ketma-ket kelgan.',
      'missing-operator': 'Sonlar orasiga amal belgisini qo‘ying.',
      unbalanced: 'Qavslar mos emas: ( va ) ni tekshiring.',
      'div-zero': 'Nolga bo‘lish mumkin emas.',
      domain: 'Qiymat yo‘q: manfiy sondan ildiz chiqarilmaydi, logarifm esa faqat musbat son uchun aniqlangan.',
      undefined: 'Bu burchakda tangens aniqlanmagan: 90° + k·180°.',
      overflow: 'Son juda katta.',
    },
    messages: {
      'ai-prompt': 'Qadamma-qadam tushuntir: {expression} = {result}',
      'ai-fix': 'Misol yozuvidagi xatoni top va uni qanday to‘g‘ri yozishni ko‘rsat: {expression}',
      'ai-deg': '(burchaklar gradusda)',
      'ai-rad': '(burchaklar radianda)',
      'ai-empty': 'Avval misol kiriting.',
      'ai-sent': 'Misol yuqoridagi chat maydonida: tekshirib, yuboring.',
      'ai-wait': 'AI-chat hali yuklanmoqda yoki javob yozmoqda: birozdan keyin qayta urinib ko‘ring.',
    },
  },
};

/** Five keys a row; the field reads every symbol they insert (× ÷ − √ π). */
const KEYS = (aria: Record<string, string>): Key[] => [
  { insert: 'sin(', label: 'sin', aria: aria.sin, fn: true },
  { insert: 'cos(', label: 'cos', aria: aria.cos, fn: true },
  { insert: 'tan(', label: 'tan', aria: aria.tan, fn: true },
  { insert: 'ln(', label: 'ln', aria: aria.ln, fn: true },
  { insert: 'log(', label: 'log', aria: aria.log, fn: true },
  { insert: '√', label: '√', aria: aria.sqrt, fn: true },
  { insert: '^2', label: 'x²', aria: aria.square, fn: true },
  { insert: '^', label: '^', aria: aria.power, fn: true },
  { insert: '(', label: '(', aria: aria.open, fn: true },
  { insert: ')', label: ')', aria: aria.close, fn: true },
  { insert: '7', label: '7' }, { insert: '8', label: '8' }, { insert: '9', label: '9' },
  { insert: '÷', label: '÷', aria: aria.divide, fn: true },
  { action: 'clear', label: 'C', aria: aria.clear, fn: true },
  { insert: '4', label: '4' }, { insert: '5', label: '5' }, { insert: '6', label: '6' },
  { insert: '×', label: '×', aria: aria.multiply, fn: true },
  { action: 'back', label: '⌫', aria: aria.back, fn: true },
  { insert: '1', label: '1' }, { insert: '2', label: '2' }, { insert: '3', label: '3' },
  { insert: '−', label: '−', aria: aria.minus, fn: true },
  { insert: '%', label: '%', aria: aria.percent, fn: true },
  { insert: '0', label: '0' },
  { insert: '.', label: '.', aria: aria.point },
  { insert: 'π', label: 'π', aria: aria.pi, fn: true },
  { insert: 'e', label: 'e', aria: aria.e, fn: true },
  { insert: '+', label: '+', aria: aria.plus, fn: true },
];

const STYLE = `<style>
#kalkulyator{margin:0 0 2.5rem;padding:clamp(1rem,4vw,1.5rem);border:1px solid #2fe6d140;border-radius:1.25rem;background:#0d2028;color:#f2f8fa;scroll-margin-top:1.5rem;overflow-wrap:anywhere}
#kalkulyator *{box-sizing:border-box}
#kalkulyator h2{margin:0 0 .75rem;font-size:clamp(1.25rem,3.5vw,1.6rem);line-height:1.25}
#kalkulyator h3{margin:1rem 0 .5rem;font-size:.95rem;font-weight:650;color:#f2f8fa}
#kalkulyator p{margin:0 0 1rem;line-height:1.6;color:#c0d1d8;font-size:.95rem}
#kalkulyator label{display:block;margin:0 0 .4rem;font-size:.9rem;font-weight:650;color:#f2f8fa}
#kalkulyator input{display:block;width:100%;margin:0;padding:.7rem .8rem;border:1px solid #647e89;border-radius:.65rem;background:#0a1921;color:#f2f8fa;font:inherit;font-size:1.25rem;line-height:1.4;text-align:right;font-variant-numeric:tabular-nums}
#kalkulyator output{display:block;min-height:2.4rem;margin:.4rem 0 0;font-size:1.6rem;line-height:1.5;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;color:#bafdf5}
#kalkulyator output:not(:empty)::before{content:"= ";font-weight:400;color:#8fa6b0}
#kalkulyator .calc-status{min-height:1.5em;margin:.25rem 0 .75rem;color:#bafdf5}
#kalkulyator .calc-status[data-tone="error"]{color:#ffb4a8}
#kalkulyator .calc-angle{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0 0 .75rem;font-size:.9rem;color:#c0d1d8}
#kalkulyator .calc-keys{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.45rem;margin:0 0 .75rem}
#kalkulyator button{font:inherit;font-size:1.05rem;line-height:1.2;min-height:44px;padding:.5rem .35rem;border:1px solid #647e89;border-radius:.65rem;background:#1b3945;color:#f2f8fa;cursor:pointer;touch-action:manipulation}
#kalkulyator button[data-fn]{background:#122a33;color:#bafdf5}
#kalkulyator button[aria-pressed="true"]{background:#66ecdd;border-color:#66ecdd;color:#08262b;font-weight:700}
#kalkulyator .calc-angle button{font-size:.9rem;padding:.5rem .8rem}
#kalkulyator .calc-run{display:flex;flex-wrap:wrap;gap:.55rem;margin:0 0 1rem}
#kalkulyator button[data-calc-action="equals"]{flex:1 1 8rem;background:#66ecdd;border-color:#66ecdd;color:#08262b;font-weight:700}
#kalkulyator button[data-calc-action="ai"]{flex:1 1 12rem;background:#fce29c;border-color:#fce29c;color:#2b2208;font-weight:700}
#kalkulyator button:focus-visible,#kalkulyator input:focus-visible{outline:3px solid #fce29c;outline-offset:2px}
#kalkulyator ol{display:grid;gap:.35rem;margin:0 0 1rem;padding:0;list-style:none}
#kalkulyator ol button{width:100%;min-height:40px;padding:.45rem .7rem;background:transparent;text-align:left;font-size:.95rem;font-variant-numeric:tabular-nums}
#kalkulyator .calc-note{margin:0;font-size:.85rem}
</style>`;

/** The calculator block, under the chat, on a page that lists the widget. */
export function renderCalculatorBlock(page: Page): string {
  const t = COPY[page.locale === 'uz' ? 'uz' : 'ru'];
  const errors = Object.fromEntries(Object.entries(t.errors).map(([code, text]) => [`err-${code}`, text]));
  const key = (k: Key) => `<button type="button"${k.action ? ` data-calc-action="${k.action}"` : ` data-calc-key="${escapeHtml(k.insert || '')}"`}${k.fn ? ' data-fn' : ''}${k.aria ? ` aria-label="${escapeHtml(k.aria)}"` : ''}>${escapeHtml(k.label)}</button>`;
  return `<section id="${CALCULATOR_ANCHOR}" data-calculator aria-labelledby="calc-heading"${messageAttributes({ ...errors, ...t.messages })}>
${STYLE}
      <h2 id="calc-heading">${escapeHtml(t.heading)}</h2>
      <p>${escapeHtml(t.intro)}</p>
      <label for="calc-in">${escapeHtml(t.input)}</label>
      <input id="calc-in" type="text" inputmode="decimal" maxlength="${MAX_EXPRESSION}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="(2 + 3) × 4^2">
      <output for="calc-in" aria-live="polite" data-calc-result></output>
      <p class="calc-status" role="status" aria-live="polite" data-calc-status></p>
      <div class="calc-angle" role="group" aria-label="${escapeHtml(t.angles)}"><span aria-hidden="true">${escapeHtml(t.angles)}:</span><button type="button" data-calc-angle="deg" aria-pressed="true">${escapeHtml(t.deg)}</button><button type="button" data-calc-angle="rad" aria-pressed="false">${escapeHtml(t.rad)}</button></div>
      <div class="calc-keys" role="group" aria-label="${escapeHtml(t.keys)}">
        ${KEYS(t.aria).map(key).join('')}
      </div>
      <div class="calc-run">
        <button type="button" data-calc-action="equals" aria-label="${escapeHtml(t.equals)}">=</button>
        <button type="button" data-calc-action="ai">${escapeHtml(t.ai)}</button>
      </div>
      <p>${escapeHtml(t.aiNote)}</p>
      <div data-calc-history-box hidden>
        <h3>${escapeHtml(t.history)}</h3>
        <ol data-calc-history></ol>
      </div>
      <noscript><p>${escapeHtml(t.noscript)}</p></noscript>
      <p class="calc-note">${escapeHtml(t.rules)}</p>
    </section>
    `;
}
