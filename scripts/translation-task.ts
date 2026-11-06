import type { Page } from '../src/shared/types';
import { TRANSLATION_SOURCE_MAX } from '../src/uz-translit/translation-prompt';
import { escapeHtml, messageAttributes } from './widgets/html';

const COPY = {
  ru: {
    intro: 'Выберите направление и стиль. Кнопка подготовит запрос в AI-чате — проверьте его и нажмите отправку в чате.',
    direction: 'Направление', ruUz: 'Русский → узбекский', uzRu: 'Узбекский → русский',
    script: 'Узбекская письменность', latin: 'Латиница', cyrillic: 'Кириллица',
    style: 'Стиль', neutral: 'Нейтральный', business: 'Деловой', simple: 'Простой',
    source: 'Текст для перевода', sample: 'Вставить пример', button: 'Подготовить перевод в AI-чате',
    limit: `До ${TRANSLATION_SOURCE_MAX} символов. Длинный текст разделите на части.`,
    trial: 'AI: 3 пробных ответа за всё время использования сервиса, затем AI-пакет. Проверьте перевод перед использованием. Конвертер алфавита ниже работает бесплатно и без AI.',
    noscript: 'Для подготовки запроса включите JavaScript. Примеры и объяснения остаются доступны ниже.',
    messages: {
      empty: 'Вставьте текст для перевода.', long: 'Слишком длинный текст: разделите его на части до 1000 символов.', options: 'Выберите направление, письменность и стиль из списка.',
      prepared: 'Запрос в поле AI-чата. Проверьте и отправьте его — только отправка расходует ответ чата.',
      wait: 'Чат ещё загружается или занят. Ваш текст сохранён в поле; попробуйте ещё раз через несколько секунд.',
    },
  },
  uz: {
    intro: 'Yo‘nalish va uslubni tanlang. Tugma so‘rovni AI-chat maydoniga joylaydi — uni tekshirib, chatda yuboring.',
    direction: 'Yo‘nalish', ruUz: 'Ruscha → o‘zbekcha', uzRu: 'O‘zbekcha → ruscha',
    script: 'O‘zbekcha yozuv', latin: 'Lotin', cyrillic: 'Kirill',
    style: 'Uslub', neutral: 'Neytral', business: 'Rasmiy', simple: 'Sodda',
    source: 'Tarjima qilinadigan matn', sample: 'Namuna qo‘yish', button: 'AI-chat uchun tarjima so‘rovini tayyorlash',
    limit: `${TRANSLATION_SOURCE_MAX} tagacha belgi. Uzun matnni qismlarga bo‘ling.`,
    trial: 'AI: servisdan foydalanish davomida jami 3 ta sinov javobi, keyin AI-paket. Tarjimani ishlatishdan oldin tekshiring. Pastdagi yozuv konvertori bepul va AI’siz ishlaydi.',
    noscript: 'So‘rovni tayyorlash uchun JavaScript’ni yoqing. Namunalar va izohlar pastda mavjud.',
    messages: {
      empty: 'Tarjima qilinadigan matnni kiriting.', long: 'Matn juda uzun: uni 1000 belgigacha bo‘lgan qismlarga bo‘ling.', options: 'Yo‘nalish, yozuv va uslubni ro‘yxatdan tanlang.',
      prepared: 'So‘rov AI-chat maydonida. Uni tekshirib yuboring — faqat yuborish chat javobini sarflaydi.',
      wait: 'Chat hali yuklanmoqda yoki band. Matningiz maydonda qoldi; bir necha soniyadan keyin qayta urinib ko‘ring.',
    },
  },
} as const;

/** No native form submission: source text can never become a query string. */
export function renderTranslationTask(page: Page): string {
  const t = COPY[page.locale === 'uz' ? 'uz' : 'ru'];
  return `<section id="translation-task" data-translation-task class="ym-hide-content" aria-labelledby="tool-first-title"${messageAttributes(t.messages)}>
<style>
#translation-task{padding:1rem;border:1px solid #2fe6d140;border-radius:1.25rem;background:#0d2028;color:#f2f8fa}
#translation-task p{margin:0 0 .75rem;color:#c0d1d8;font-size:.9rem;line-height:1.45}
#translation-task label{display:block;font-size:.9rem;font-weight:650;margin:0 0 .35rem}
#translation-task .translation-options{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem}
#translation-task .translation-direction{grid-column:1/-1}
#translation-task select,#translation-task textarea{display:block;width:100%;min-width:0;padding:.65rem;border:1px solid #647e89;border-radius:.65rem;background:#0a1921;color:#f2f8fa;font:inherit;font-size:1rem}
#translation-task select{min-height:44px}
#translation-task textarea{min-height:6rem;resize:vertical;margin-bottom:.5rem;line-height:1.4}
#translation-task button{min-height:44px;padding:.65rem .9rem;border:1px solid #647e89;border-radius:.65rem;background:#152e38;color:#f2f8fa;font:inherit;font-size:.9rem;cursor:pointer;line-height:1.4}
#translation-task button[data-translation-prepare]{width:100%;margin:.5rem 0 .75rem;background:#66ecdd;color:#08262b;border-color:#66ecdd;font-weight:700}
#translation-task button:disabled{opacity:.55;cursor:wait}
#translation-task :is(button,textarea,select):focus-visible{outline:3px solid #fce29c;outline-offset:2px}
#translation-task .translation-note{font-size:.8rem}
#translation-task [data-translation-status]:empty{margin:0}
@media(min-width:640px){#translation-task{padding:1.5rem}#translation-task .translation-options{grid-template-columns:2fr 1fr 1fr}#translation-task .translation-direction{grid-column:auto}}
</style>
  <p>${escapeHtml(t.intro)}</p>
  <div class="translation-options">
    <div class="translation-direction"><label for="translation-direction">${escapeHtml(t.direction)}</label><select id="translation-direction"><option value="ru-uz">${escapeHtml(t.ruUz)}</option><option value="uz-ru">${escapeHtml(t.uzRu)}</option></select></div>
    <div><label for="translation-script">${escapeHtml(t.script)}</label><select id="translation-script"><option value="latin">${escapeHtml(t.latin)}</option><option value="cyrillic">${escapeHtml(t.cyrillic)}</option></select></div>
    <div><label for="translation-style">${escapeHtml(t.style)}</label><select id="translation-style"><option value="neutral">${escapeHtml(t.neutral)}</option><option value="business">${escapeHtml(t.business)}</option><option value="simple">${escapeHtml(t.simple)}</option></select></div>
  </div>
  <label for="translation-source">${escapeHtml(t.source)}</label>
  <textarea id="translation-source" rows="4" maxlength="${TRANSLATION_SOURCE_MAX}" autocomplete="off" spellcheck="false" aria-describedby="translation-limit"></textarea>
  <p id="translation-limit" class="translation-note">${escapeHtml(t.limit)}</p>
  <button type="button" data-translation-sample>${escapeHtml(t.sample)}</button>
  <button type="button" data-translation-prepare disabled>${escapeHtml(t.button)}</button>
  <p role="status" aria-live="polite" data-translation-status></p>
  <p class="translation-note">${escapeHtml(t.trial)}</p>
  <noscript><p>${escapeHtml(t.noscript)}</p></noscript>
</section>`;
}
