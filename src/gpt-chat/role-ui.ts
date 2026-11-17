// What an AI tool page's first screen says in its own role (chat CRO,
// 2026-11-17): the big question and the example in the empty composer. Kept
// out of the start bundle: the lazy part chat-tool brings it to the chat
// (toolPage), and the prerender writes the same question into the frame
// (data-g on the greeting), so the frame and the chat say the same words. The
// two main chats and the roles without a line here keep the general wording.
// Uzbek writes o‘ g‘ with U+2018 and the tutuq with U+2019.
import type { Locale } from './types';

export interface RoleUi {
  /** The first screen's question, in place of «Savolingiz bor?» / «Есть вопрос?». */
  greet: string;
  /** The empty composer's example, in place of the general one. */
  placeholder: string;
}

const ROLE_UI: Record<Locale, Partial<Record<string, RoleUi>>> = {
  uz: {
    writer: { greet: 'Qanday matn kerak?', placeholder: 'Masalan: onamga 8 qatorli she’r' },
    teacher: { greet: 'Qaysi mavzuni tushuntiray?', placeholder: 'Masalan: 7-sinf masalasini tushuntirib ber' },
    translator: { greet: 'Nimani tarjima qilay?', placeholder: 'Masalan: rasmiy xatni o‘zbekchaga tarjima qil' },
    smm: { greet: 'Qanday post kerak?', placeholder: 'Masalan: qahvaxonam uchun Instagram posti' },
  },
  ru: {
    writer: { greet: 'Какой текст нужен?', placeholder: 'Например: стих маме на 8 строк' },
    teacher: { greet: 'Какую тему объяснить?', placeholder: 'Например: объясни задачу за 7 класс' },
    translator: { greet: 'Что перевести?', placeholder: 'Например: переведи письмо на узбекский' },
    smm: { greet: 'Какой пост нужен?', placeholder: 'Например: пост в Instagram для кофейни' },
  },
};

/** The role's lines, or undefined for no role or a role without its own (general wording). */
export function roleUi(role: string | undefined, locale: Locale): RoleUi | undefined {
  return role ? ROLE_UI[locale][role] : undefined;
}
