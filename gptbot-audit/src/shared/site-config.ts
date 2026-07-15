// Site-wide config shared by admin, functions, and build scripts.
// Keep in sync with /content/global/site.json (which is the editable source of truth).

export const SITE_URL = 'https://gptbot.uz';
export const SITE_NAME = 'GPTBot';
export const DEFAULT_LOCALE: 'ru' | 'uz' = 'ru';

/**
 * Canonical money page URLs (Step 9 of the brief).
 * These are seeded as drafts in /content/pages/ and editable from the admin.
 */
export const MONEY_PAGES = {
  ru: [
    '/ru/ai-bot-dlya-biznesa/',
    '/ru/gpt-bot-dlya-biznesa/',
    '/ru/chat-bot-dlya-biznesa/',
    '/ru/telegram-bot-dlya-biznesa/',
    '/ru/instagram-direct-bot/',
    '/ru/ai-menedzher-dlya-instagram/',
    '/ru/ai-prodavec/',
    '/ru/avtomatizatsiya-zayavok/',
    '/ru/avtomatizatsiya-prodazh/',
    '/ru/bot-dlya-obrabotki-zayavok/',
    '/ru/ai-bot-dlya-kliniki/',
    '/ru/ai-bot-dlya-salona-krasoty/',
    '/ru/ai-bot-dlya-uchebnogo-tsentra/',
    '/ru/ai-bot-dlya-magazina/',
    '/ru/ai-bot-dlya-horeca/',
  ],
  uz: [
    '/uz/biznes-uchun-ai-bot/',
    '/uz/gpt-bot-biznes-uchun/',
    '/uz/telegram-bot-biznes-uchun/',
    '/uz/instagram-bot-biznes-uchun/',
    '/uz/arizalarni-avtomatlashtirish/',
    '/uz/savdoni-avtomatlashtirish/',
    '/uz/klinika-uchun-ai-bot/',
    '/uz/salon-uchun-ai-bot/',
    '/uz/oquv-markazi-uchun-ai-bot/',
    '/uz/dokon-uchun-ai-bot/',
  ],
} as const;

/** RU <-> UZ slug pairs for hreflang bidirectionality. */
export const HREFLANG_PAIRS: Array<[string, string]> = [
  ['/ru/ai-bot-dlya-biznesa/', '/uz/biznes-uchun-ai-bot/'],
  ['/ru/gpt-bot-dlya-biznesa/', '/uz/gpt-bot-biznes-uchun/'],
  ['/ru/telegram-bot-dlya-biznesa/', '/uz/telegram-bot-biznes-uchun/'],
  ['/ru/instagram-direct-bot/', '/uz/instagram-bot-biznes-uchun/'],
  ['/ru/avtomatizatsiya-zayavok/', '/uz/arizalarni-avtomatlashtirish/'],
  ['/ru/avtomatizatsiya-prodazh/', '/uz/savdoni-avtomatlashtirish/'],
  ['/ru/ai-bot-dlya-kliniki/', '/uz/klinika-uchun-ai-bot/'],
  ['/ru/ai-bot-dlya-salona-krasoty/', '/uz/salon-uchun-ai-bot/'],
  ['/ru/ai-bot-dlya-uchebnogo-tsentra/', '/uz/oquv-markazi-uchun-ai-bot/'],
  ['/ru/ai-bot-dlya-magazina/', '/uz/dokon-uchun-ai-bot/'],
];

/** Curated anchor text library for internal-link suggestions. */
export const ANCHORS = {
  ru: [
    'AI-бот для бизнеса',
    'GPT-бот для бизнеса',
    'чат-бот для бизнеса',
    'Telegram-бот для бизнеса',
    'Instagram Direct бот',
    'AI-менеджер для Instagram',
    'AI-продавец',
    'автоматизация заявок',
    'автоматизация продаж',
    'бот для обработки заявок',
  ],
  uz: [
    'biznes uchun AI bot',
    'GPT bot biznes uchun',
    'Telegram bot biznes uchun',
    'Instagram bot biznes uchun',
    'arizalarni avtomatlashtirish',
    'savdoni avtomatlashtirish',
    'mijozlarga 24/7 javob beruvchi AI bot',
  ],
} as const;
