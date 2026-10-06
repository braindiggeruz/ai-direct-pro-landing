// The AI chat's item in the site header (revision 2026-10-06-seo-push; SEO
// strategy 2026-10-06 §3.2, proposal R3-10, owner order of 2026-10-06).
//
// The chat brings about 94% of the site's organic clicks, but no header of the
// site named it: to a crawler the site read as a B2B studio (competitor study
// seo-compete-2026-10-06, part 02 §7). Every header that has a menu now carries
// one item for the chat of its language — Uzbek pages lead to the Uzbek chat,
// Russian pages to the Russian chat. The homepage stays the B2B landing: only
// its menu gains the item.
//
// Templates that read this: src/components/Header.tsx (the React landing on
// "/"), scripts/prerender-home.ts (the crawler shell of "/"), scripts/prerender.ts
// (landing pages, /uz/), scripts/prerender-blog.ts (articles and the blog
// indexes) and scripts/market-page.ts. The two chat pages have no site header.
//
// HEADER_CHAT_EXCLUDED_PATHS: pages whose HTML must not change in this
// release. The protected download guide has its own P-CTR window open
// (release 30.09/01.10, read ≈06–10.11) and gets the item in the January 2027
// entity revision, like the e-mail wrapper of scripts/email-off.ts.
export type SiteLocale = 'ru' | 'uz';

export const SITE_CHAT_NAV = {
  ru: { href: '/ru/gpt-chat/', label: 'ИИ-чат' },
  uz: { href: '/uz/gpt-uzbek-tilida/', label: 'O‘zbekcha AI chat' },
} as const satisfies Record<SiteLocale, { href: string; label: string }>;

export const HEADER_CHAT_EXCLUDED_PATHS: ReadonlySet<string> = new Set([
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
]);

/** The header's chat item for a page, or null where the header keeps its previous markup. */
export function headerChatLink(locale: SiteLocale, pathname: string): { href: string; label: string } | null {
  if (HEADER_CHAT_EXCLUDED_PATHS.has(pathname)) return null;
  return SITE_CHAT_NAV[locale];
}
