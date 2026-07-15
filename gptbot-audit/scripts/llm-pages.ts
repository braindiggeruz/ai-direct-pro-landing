// Curated list of RU service/money pages that get a clean Markdown twin
// (dist/ru/<slug>/index.html.md) for LLM agents, plus a <link rel="alternate"
// type="text/markdown"> in the prerendered HTML head.
//
// Kept small and hand-curated on purpose: only high-value service pages an AI
// agent should read per intent — NOT the whole site (that is what the XML
// sitemap is for). Markdown twins are noindex (see _headers /*.md rule) so they
// never cannibalise the canonical HTML pages in search.
export const LLM_MARKDOWN_SLUGS_RU: string[] = [
  'razrabotka-saytov-tashkent',
  'razrabotka-sayta-pod-klyuch',
  'sozdanie-sayta-dlya-biznesa',
  'sayt-s-ai-botom',
  'sayt-dlya-zayavok',
  'internet-reklama-tashkent',
  'razrabotka-telegram-bota-tashkent',
  'ai-bot-dlya-biznesa',
  'telegram-bot-dlya-biznesa',
  'avtomatizatsiya-zayavok',
  'ai-bot-s-crm-amocrm-bitrix24',
  'bot-dlya-obrabotki-zayavok',
];

/** URL path (with leading /ru/ and trailing slash) → true if it has a Markdown twin. */
export const LLM_MARKDOWN_URLS: ReadonlySet<string> = new Set(
  LLM_MARKDOWN_SLUGS_RU.map((s) => `/ru/${s}/`),
);
