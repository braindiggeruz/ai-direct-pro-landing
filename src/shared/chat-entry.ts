// Curated entry IDs only. Never put visitor questions or arbitrary return URLs in links.
const UZ_CHAT_ENTRIES = [
  { id: 'download', slug: 'chatgpt-telefon-va-kompyuterga-yuklab-olish', title: 'Ilova yuklamasdan AI bilan suhbatlashing', prompt: 'O‘zbek tilida nimalarda yordam bera olasan? Uchta misol keltir.' },
  { id: 'login', slug: 'chatgptga-qanday-kirish-mumkin', title: 'Akkauntsiz AI-chatni sinab ko‘ring', prompt: 'AI bilan birinchi suhbatni qanday boshlash mumkin? Oddiy misol ko‘rsat.' },
  { id: 'access', slug: 'chatgpt-ozbekistonda-vpnsiz-ishlaydimi', title: 'AI-chatni shu yerda oching', prompt: 'Menga o‘zbek tilida yordam ber. Savolni aniq yozish uchun uchta maslahat ber.' },
  { id: 'prompts', slug: 'chatgpt-uzbek-tilida-promptlar', title: 'Promptni AI-chatda sinab ko‘ring', prompt: 'Vazifam uchun aniq prompt tuzishga yordam ber. Avval mendan vazifamni so‘ra.' },
  { id: 'students', slug: 'chatgpt-talabalar-uchun', title: 'O‘qishdagi savolingizni AI bilan muhokama qiling', prompt: 'Mavzuni tushunishga yordam ber. Avval qaysi mavzuni o‘rganayotganimni so‘ra, keyin misol bilan tushuntir.' },
  { id: 'essay', slug: 'insho-yozish-suniy-intellekt-bilan', title: 'Insho rejasini birga tuzing', prompt: 'Insho uchun reja tuzishga yordam ber. Avval mavzu va talablarni so‘ra.' },
  { id: 'compare', slug: 'chatgpt-claude-gemini-ozbekistonda', title: 'AI bilan amalda suhbatlashib ko‘ring', prompt: 'AI yordamida vaqtimni tejashim uchun uchta amaliy vazifani misol qilib ko‘rsat.' },
] as const;

export const CHAT_ENTRIES = [
  ...UZ_CHAT_ENTRIES.map(entry => ({ ...entry, locale: 'uz' as const })),
  { locale: 'ru', id: 'compare-ru', slug: 'chatgpt-i-claude-v-uzbekistane', title: 'Попробуйте AI на своей задаче', prompt: 'Помоги понять, как AI может помочь с моей задачей. Сначала спроси, что я хочу сделать.' },
  { locale: 'ru', id: 'payment-ru', slug: 'kak-oplatit-chatgpt-v-uzbekistane', title: 'Нужен AI для задачи? Попробуйте GPTBot', prompt: 'Помоги составить короткий деловой текст. Сначала спроси, для кого он нужен и что я хочу сказать.' },
] as const;

export function chatEntryArticleHref(entry: typeof CHAT_ENTRIES[number]) {
  return `/${entry.locale}/blog/${entry.slug}/`;
}

export function chatEntryForArticle(path: string) {
  return CHAT_ENTRIES.find(entry => path === chatEntryArticleHref(entry));
}

export function chatEntryFromHash(hash: string, locale?: 'ru' | 'uz') {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('entry');
  return CHAT_ENTRIES.find(entry => entry.id === id && (!locale || locale === entry.locale));
}

export function chatEntryHref(entry: typeof CHAT_ENTRIES[number]) {
  return `${entry.locale === 'uz' ? '/uz/gpt-uzbek-tilida/' : '/ru/gpt-chat/'}#entry=${entry.id}`;
}
