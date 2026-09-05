// Curated entry IDs only. Never put visitor questions or arbitrary return URLs in links.
export const CHAT_ENTRIES = [
  { id: 'download', slug: 'chatgpt-telefon-va-kompyuterga-yuklab-olish', title: 'Ilova yuklamasdan AI bilan suhbatlashing', prompt: 'O‘zbek tilida nimalarda yordam bera olasan? Uchta misol keltir.' },
  { id: 'login', slug: 'chatgptga-qanday-kirish-mumkin', title: 'Akkauntsiz AI-chatni sinab ko‘ring', prompt: 'AI bilan birinchi suhbatni qanday boshlash mumkin? Oddiy misol ko‘rsat.' },
  { id: 'access', slug: 'chatgpt-ozbekistonda-vpnsiz-ishlaydimi', title: 'AI-chatni shu yerda oching', prompt: 'Menga o‘zbek tilida yordam ber. Savolni aniq yozish uchun uchta maslahat ber.' },
  { id: 'prompts', slug: 'chatgpt-uzbek-tilida-promptlar', title: 'Promptni AI-chatda sinab ko‘ring', prompt: 'Vazifam uchun aniq prompt tuzishga yordam ber. Avval mendan vazifamni so‘ra.' },
  { id: 'students', slug: 'chatgpt-talabalar-uchun', title: 'O‘qishdagi savolingizni AI bilan muhokama qiling', prompt: 'Mavzuni tushunishga yordam ber. Avval qaysi mavzuni o‘rganayotganimni so‘ra, keyin misol bilan tushuntir.' },
  { id: 'essay', slug: 'insho-yozish-suniy-intellekt-bilan', title: 'Insho rejasini birga tuzing', prompt: 'Insho uchun reja tuzishga yordam ber. Avval mavzu va talablarni so‘ra.' },
  { id: 'compare', slug: 'chatgpt-claude-gemini-ozbekistonda', title: 'AI bilan amalda suhbatlashib ko‘ring', prompt: 'AI yordamida vaqtimni tejashim uchun uchta amaliy vazifani misol qilib ko‘rsat.' },
] as const;

export function chatEntryForArticle(path: string) {
  return CHAT_ENTRIES.find(entry => path === `/uz/blog/${entry.slug}/`);
}

export function chatEntryFromHash(hash: string) {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('entry');
  return CHAT_ENTRIES.find(entry => entry.id === id);
}

export function chatEntryHref(entry: typeof CHAT_ENTRIES[number]) {
  return `/uz/gpt-uzbek-tilida/#entry=${entry.id}`;
}
