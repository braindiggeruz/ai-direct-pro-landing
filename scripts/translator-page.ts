// What a gpt-chat page with `chatRole` adds to the chat template
// (scripts/prerender.ts, renderGptChatMain): the role and its paired page on
// #gpt-chat-root, and the Uzbek Cyrillic ↔ Latin converter as the first block
// under the chat. A page without chatRole gets two empty strings, so the two
// main chat pages (protected, scripts/seo-protection.ts) render byte for byte
// as before. Lives in its own module so tests can read it without running the
// prerender pass.
//
// The converter itself is src/shared/uz-translit.ts; src/uz-translit/main.ts
// (its own Vite entry, loaded only on these pages) binds the buttons. It runs
// in the browser with no model call: no quota and no trial reply is spent.
import { chatRolePreset, type Page } from '../src/shared/types';

/** A same-site page of the other language: /ru/<slug>/ or /uz/<slug>/. */
const PAIR_PATH = /^\/(?:ru|uz)\/[a-z0-9-]+\/$/;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

/** The page's role preset, or undefined on every other page. */
export function pageChatRole(page: Page) {
  return page.pageType === 'gpt-chat' ? chatRolePreset(page.chatRole) : undefined;
}

/** The paired page in the other language, for the chat's language links. */
export function pairedPath(page: Page): string | undefined {
  const other = page.locale === 'uz' ? page.hreflangRu : page.hreflangUz;
  return other && PAIR_PATH.test(other) && other !== page.url ? other : undefined;
}

/**
 * Attributes for #gpt-chat-root, with their leading space; '' without a
 * role, so the main chats' mount point does not change.
 */
export function chatRoleAttributes(page: Page): string {
  const role = pageChatRole(page);
  if (!role) return '';
  const pair = pairedPath(page);
  return ` data-chat-role="${role}"${pair ? ` data-alt-href="${escapeHtml(pair)}"` : ''}`;
}

const COPY = {
  ru: {
    heading: 'Латиница ↔ кириллица: конвертер узбекского текста',
    intro: 'Меняет алфавит узбекского текста, а не язык: из кириллицы в латиницу и обратно. Работает в браузере по правилам официального узбекского алфавита: без запроса к AI, без лимита, пробные ответы чата не тратятся.',
    input: 'Узбекский текст (кириллица или латиница)',
    output: 'Результат',
    actions: 'Что сделать с текстом',
    toLatin: 'Кириллица → латиница',
    toCyrillic: 'Латиница → кириллица',
    normalize: 'Исправить апострофы: o‘, g‘, ’',
    copy: 'Скопировать результат',
    note: 'Слова, которые можно записать по-разному, проверьте вручную: например, ц в русских заимствованиях (милиция → militsiya → милитсия) или й перед о (район → rayon → раён).',
    noscript: 'Конвертер работает при включённом JavaScript.',
    done: 'Готово.',
    empty: 'Вставьте текст в поле выше.',
    russian: 'В тексте есть русские буквы щ или ы: в узбекской латинице они записаны как sh и i. Конвертер меняет алфавит узбекского текста и не переводит русский.',
    foreign: 'Слова с буквами c и w оставлены латиницей: этих букв нет в узбекском алфавите.',
    copied: 'Скопировано.',
    copyFailed: 'Не удалось скопировать: выделите результат и скопируйте вручную.',
  },
  uz: {
    heading: 'Lotin ↔ kirill: o‘zbekcha matn konvertori',
    intro: 'O‘zbekcha matnning tilini emas, yozuvini almashtiradi: kirilldan lotinga va aksincha. Brauzerda, rasmiy o‘zbek alifbosi qoidalari bo‘yicha ishlaydi: AI’ga so‘rov yuborilmaydi, limit yo‘q, chatning sinov javoblari sarflanmaydi.',
    input: 'O‘zbekcha matn (kirill yoki lotin)',
    output: 'Natija',
    actions: 'Matn bilan nima qilish kerak',
    toLatin: 'Kirill → lotin',
    toCyrillic: 'Lotin → kirill',
    normalize: 'Apostroflarni tuzatish: o‘, g‘, ’',
    copy: 'Natijani nusxalash',
    note: 'Bir necha xil yozilishi mumkin bo‘lgan so‘zlarni qo‘lda tekshiring: masalan, ruschadan kirgan so‘zlardagi ц (милиция → militsiya → милитсия) yoki о oldidagi й (район → rayon → раён).',
    noscript: 'Konvertor JavaScript yoqilganda ishlaydi.',
    done: 'Tayyor.',
    empty: 'Matnni yuqoridagi maydonga qo‘ying.',
    russian: 'Matnda rus tilidagi щ yoki ы harflari bor: o‘zbek lotin yozuvida ular sh va i bo‘lib yoziladi. Konvertor o‘zbekcha matnning yozuvini almashtiradi, ruscha matnni tarjima qilmaydi.',
    foreign: 'c yoki w harfi bor so‘zlar lotincha qoldirildi: bu harflar o‘zbek alifbosida yo‘q.',
    copied: 'Nusxalandi.',
    copyFailed: 'Nusxalab bo‘lmadi: natijani belgilab, o‘zingiz nusxalang.',
  },
} as const;

/** The converter's own anchor: the page text links it. */
export const UZ_TRANSLIT_ANCHOR = 'kirill-lotin';

const STYLE = `<style>
#kirill-lotin{margin:0 0 2.5rem;padding:clamp(1rem,4vw,1.5rem);border:1px solid #2fe6d140;border-radius:1.25rem;background:#0d2028;color:#f2f8fa;scroll-margin-top:1.5rem;overflow-wrap:anywhere}
#kirill-lotin *{box-sizing:border-box}
#kirill-lotin h2{margin:0 0 .75rem;font-size:clamp(1.25rem,3.5vw,1.6rem);line-height:1.25}
#kirill-lotin p{margin:0 0 1rem;line-height:1.6;color:#c0d1d8;font-size:.95rem}
#kirill-lotin label{display:block;margin:0 0 .4rem;font-size:.9rem;font-weight:650;color:#f2f8fa}
#kirill-lotin textarea{display:block;width:100%;min-height:7.5rem;margin:0 0 1rem;padding:.75rem;border:1px solid #647e89;border-radius:.65rem;background:#0a1921;color:#f2f8fa;font:inherit;font-size:1rem;line-height:1.5}
#kirill-lotin textarea:focus-visible,#kirill-lotin button:focus-visible{outline:3px solid #fce29c;outline-offset:2px}
#kirill-lotin .uzt-actions{display:flex;flex-wrap:wrap;gap:.55rem;margin:0 0 1rem}
#kirill-lotin button{font:inherit;font-size:.95rem;line-height:1.4;min-height:44px;padding:.6rem .9rem;border:1px solid #647e89;border-radius:.65rem;background:#152e38;color:#f2f8fa;cursor:pointer}
#kirill-lotin button[data-uzt="latin"],#kirill-lotin button[data-uzt="cyrillic"]{background:#66ecdd;border-color:#66ecdd;color:#08262b;font-weight:700}
#kirill-lotin .uzt-status{min-height:1.5em;margin:0 0 .75rem;color:#bafdf5}
#kirill-lotin .uzt-note{margin:1rem 0 0;font-size:.85rem}
</style>`;

/** The converter block, first in the text under the chat on a page with a role. */
export function renderUzTranslitBlock(page: Page): string {
  if (!pageChatRole(page)) return '';
  const t = COPY[page.locale === 'uz' ? 'uz' : 'ru'];
  const data = (name: string, value: string) => ` data-msg-${name}="${escapeHtml(value)}"`;
  return `<section id="${UZ_TRANSLIT_ANCHOR}" data-uz-translit aria-labelledby="uzt-heading"${data('done', t.done)}${data('empty', t.empty)}${data('russian', t.russian)}${data('foreign', t.foreign)}${data('copied', t.copied)}${data('copy-failed', t.copyFailed)}>
${STYLE}
      <h2 id="uzt-heading">${escapeHtml(t.heading)}</h2>
      <p>${escapeHtml(t.intro)}</p>
      <label for="uzt-in">${escapeHtml(t.input)}</label>
      <textarea id="uzt-in" rows="5" maxlength="20000" spellcheck="false" autocomplete="off" placeholder="Тошкент шаҳри / Toshkent shahri"></textarea>
      <div class="uzt-actions" role="group" aria-label="${escapeHtml(t.actions)}">
        <button type="button" data-uzt="latin">${escapeHtml(t.toLatin)}</button>
        <button type="button" data-uzt="cyrillic">${escapeHtml(t.toCyrillic)}</button>
        <button type="button" data-uzt="normalize">${escapeHtml(t.normalize)}</button>
      </div>
      <label for="uzt-out">${escapeHtml(t.output)}</label>
      <textarea id="uzt-out" rows="5" readonly spellcheck="false"></textarea>
      <p class="uzt-status" role="status" aria-live="polite" data-uzt-status></p>
      <button type="button" data-uzt="copy">${escapeHtml(t.copy)}</button>
      <noscript><p>${escapeHtml(t.noscript)}</p></noscript>
      <p class="uzt-note">${escapeHtml(t.note)}</p>
    </section>
    `;
}
