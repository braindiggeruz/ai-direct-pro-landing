// The RU/UZ pairs that the English layer (/en/, scripts/en-pages.ts) joins in
// hreflang. Kept apart from en-pages.ts so prerender.ts, prerender-blog.ts and
// generate-sitemap.ts read the map without loading the English content.
//
// Only unprotected pairs are listed: the protected pages (scripts/seo-protection.ts)
// keep their reviewed hreflang sets (tests/en-pages.test.ts checks it).
//
// A RU/UZ page declares its English alternate only when the English page was
// built (builtEnAlternateOf). scripts/prerender-en.ts runs in every build chain
// (build, build:fast, build:cf) right after `vite build`, before prerender.ts
// and prerender-blog.ts; a partial run without it (a prerender script started
// alone) emits no hreflang that points to a missing page, and the sitemap agrees.
import fs from 'node:fs';
import path from 'node:path';

/** RU/UZ URL -> the English page that joins its hreflang set. Both members of each pair are listed. */
export const EN_ALTERNATES: Readonly<Record<string, string>> = Object.freeze({
  '/ru/o-kompanii/': '/en/',
  '/uz/biz-haqimizda/': '/en/',
  '/ru/ai-bot-dlya-biznesa/': '/en/ai-chatbot-development-tashkent/',
  '/uz/biznes-uchun-ai-bot/': '/en/ai-chatbot-development-tashkent/',
  '/ru/blog/sravnenie-ai-chatov-na-uzbekskom/': '/en/uzbek-ai-chats-compared/',
  '/uz/blog/ozbekcha-ai-chatlar-taqqoslash/': '/en/uzbek-ai-chats-compared/',
});

/** The English alternate of a RU/UZ page, if it has one. */
export const enAlternateOf = (url: string): string | undefined => EN_ALTERNATES[url];

/** dist file of an English page: /en/ -> dist/en/index.html. */
export const enDistFile = (dist: string, url: string): string => path.join(dist, ...url.split('/').filter(Boolean), 'index.html');

/** The English alternate of a RU/UZ page when this build contains it. */
export function builtEnAlternateOf(url: string, dist: string): string | undefined {
  const en = enAlternateOf(url);
  return en && fs.existsSync(enDistFile(dist, en)) ? en : undefined;
}
