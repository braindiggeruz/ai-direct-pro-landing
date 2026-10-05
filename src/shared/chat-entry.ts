// Curated entry IDs only. Never put visitor questions or arbitrary return URLs in links.
const UZ_CHAT_ENTRIES = [
  { id: 'download', slug: 'chatgpt-telefon-va-kompyuterga-yuklab-olish', title: 'Ilova yuklamasdan AI bilan suhbatlashing', prompt: 'O‘zbek tilida nimalarda yordam bera olasan? Uchta misol keltir.' },
  { id: 'login', slug: 'chatgptga-qanday-kirish-mumkin', title: 'Akkauntsiz AI-chatni sinab ko‘ring', prompt: 'AI bilan birinchi suhbatni qanday boshlash mumkin? Oddiy misol ko‘rsat.' },
  { id: 'access', slug: 'chatgpt-ozbekistonda-vpnsiz-ishlaydimi', title: 'AI-chatni shu yerda oching', prompt: 'Menga o‘zbek tilida yordam ber. Savolni aniq yozish uchun uchta maslahat ber.' },
  { id: 'prompts', slug: 'chatgpt-uzbek-tilida-promptlar', title: 'Promptni AI-chatda sinab ko‘ring', prompt: 'Vazifam uchun aniq prompt tuzishga yordam ber. Avval mendan vazifamni so‘ra.' },
  { id: 'students', slug: 'chatgpt-talabalar-uchun', title: 'O‘qishdagi savolingizni AI bilan muhokama qiling', prompt: 'Mavzuni tushunishga yordam ber. Avval qaysi mavzuni o‘rganayotganimni so‘ra, keyin misol bilan tushuntir.' },
  { id: 'essay', slug: 'insho-yozish-suniy-intellekt-bilan', title: 'Insho yoki esse rejasini birga tuzing', prompt: 'Insho yoki esse uchun reja tuzishga yordam ber. Avval mavzu, ish turi va talablarni so‘ra.' },
  { id: 'slides', slug: 'slayd-tayyorlash', title: 'Slaydlar rejasini AI bilan tuzing', prompt: 'Slaydlar uchun reja tuzishga yordam ber. Avval mavzuni, kim oldida gapirishimni va necha daqiqa vaqtim borligini so‘ra.' },
  { id: 'compare', slug: 'chatgpt-claude-gemini-ozbekistonda', title: 'AI bilan amalda suhbatlashib ko‘ring', prompt: 'AI yordamida vaqtimni tejashim uchun uchta amaliy vazifani misol qilib ko‘rsat.' },
] as const;

/**
 * Article chat entries: the article shows the chat block after its second body
 * element, and its header, sticky and closing buttons open the chat with the
 * entry's sample question filled in.
 */
export const CHAT_ENTRIES = [
  ...UZ_CHAT_ENTRIES.map(entry => ({ ...entry, locale: 'uz' as const })),
  { locale: 'ru', id: 'compare-ru', slug: 'chatgpt-i-claude-v-uzbekistane', title: 'Попробуйте AI на своей задаче', prompt: 'Помоги понять, как AI может помочь с моей задачей. Сначала спроси, что я хочу сделать.' },
  { locale: 'ru', id: 'payment-ru', slug: 'kak-oplatit-chatgpt-v-uzbekistane', title: 'Нужен AI для задачи? Попробуйте GPTBot.uz', prompt: 'Помоги составить короткий деловой текст. Сначала спроси, для кого он нужен и что я хочу сказать.' },
] as const;

/**
 * Chat bridges of the first unprotected roll-out (SEO roadmap 2026-10-04, Б6):
 * five articles whose chat block closes an editorial section and whose own
 * header and sticky buttons stay as they are (scripts/chat-entry-cta.ts keeps
 * the place and the block's title). Release R-S1 lets the chat read these ids
 * too, so the bridge link fills the same sample question the article prints.
 * Only the fields the chat needs live here: id, locale, the article slug for
 * the way back, and the question.
 */
export const CHAT_BRIDGE_ENTRIES = [
  { locale: 'ru', id: 'online-ru', slug: 'chat-gpt-online', prompt: 'Объясни простыми словами, чем ты можешь помочь в учёбе и работе. Приведи три примера запросов.' },
  { locale: 'ru', id: 'russian-ru', slug: 'chat-gpt-na-russkom', prompt: 'Помоги составить точный запрос. Сначала спроси, какая у меня задача, для кого результат и в каком виде он нужен.' },
  { locale: 'ru', id: 'analogs-ru', slug: 'analogi-chatgpt-kotorye-rabotayut-v-uzbekistane', prompt: 'Ответь на мой вопрос по-русски, а в конце коротко перечисли, что в ответе стоит проверить. Сначала спроси, какой у меня вопрос.' },
  { locale: 'ru', id: 'talk-ru', slug: 'chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom', prompt: 'Давай пообщаемся. Спроси, что меня сейчас интересует, и предложи три темы для разговора.' },
  { locale: 'uz', id: 'reply', slug: 'chat-gpt-uzbek-biznes-uchun', prompt: 'Mijozga xushmuomala javob matnini yozishga yordam ber. Avval vaziyatni va javob uslubini so‘ra.' },
] as const;

type EntryLink = { locale: 'ru' | 'uz'; slug: string };

export function chatEntryArticleHref(entry: EntryLink) {
  return `/${entry.locale}/blog/${entry.slug}/`;
}

export function chatEntryForArticle(path: string) {
  return CHAT_ENTRIES.find(entry => path === chatEntryArticleHref(entry));
}

/** The entry or bridge a chat link names; ids only, never text from the address. */
export function chatEntryFromHash(hash: string, locale?: 'ru' | 'uz') {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('entry');
  return [...CHAT_ENTRIES, ...CHAT_BRIDGE_ENTRIES].find(entry => entry.id === id && (!locale || locale === entry.locale));
}

export function chatEntryHref(entry: { locale: 'ru' | 'uz'; id: string }) {
  return `${entry.locale === 'uz' ? '/uz/gpt-uzbek-tilida/' : '/ru/gpt-chat/'}#entry=${entry.id}`;
}
