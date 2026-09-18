// Curated list of RU and UZ service/money pages that get a clean Markdown twin
// (dist/<locale>/<slug>/index.html.md) for LLM agents, plus a <link rel="alternate"
// type="text/markdown"> in the prerendered HTML head.
//
// Kept small and hand-curated on purpose: only high-value service pages an AI
// agent should read per intent — NOT the whole site (that is what the XML
// sitemap is for). Markdown twins are noindex (see _headers /*.md rule) so they
// never cannibalise the canonical HTML pages in search.
export const LLM_MARKDOWN_SLUGS_RU: string[] = [
  'razrabotka-saytov-tashkent',
  'sozdanie-sayta-dlya-biznesa',
  'sayt-s-ai-botom',
  'sayt-dlya-zayavok',
  'internet-reklama-tashkent',
  'razrabotka-telegram-bota-tashkent',
  'ai-bot-dlya-biznesa',
  'telegram-bot-dlya-biznesa',
  'avtomatizatsiya-zayavok',
  'ai-bot-s-crm-amocrm-bitrix24',
];

/**
 * Curated Uzbek commercial hubs and the Uzbek AI chat page (gsc-audit-2026-09-17
 * X22): the Uzbek segment converts (all organic key events in the 28 days to
 * 2026-09-15 came from /uz/ pages) but had no Markdown twins for AI agents.
 */
export const LLM_MARKDOWN_SLUGS_UZ: string[] = [
  'sayt-yaratish',
  'smm-xizmatlari',
  'seo-xizmati',
  'telegram-reklama',
  'internet-reklama-toshkent',
  'biznes-uchun-ai-bot',
  'telegram-bot-biznes-uchun',
  'gpt-uzbek-tilida',
];

/** URL path (with locale prefix and trailing slash) → true if it has a Markdown twin. */
export const LLM_MARKDOWN_URLS: ReadonlySet<string> = new Set([
  ...LLM_MARKDOWN_SLUGS_RU.map((s) => `/ru/${s}/`),
  ...LLM_MARKDOWN_SLUGS_UZ.map((s) => `/uz/${s}/`),
]);
