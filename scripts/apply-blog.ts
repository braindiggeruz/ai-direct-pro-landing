// scripts/apply-blog.ts
//
// Phase 4 — Blog content builder. Reads scripts/blog-articles-part*.json,
// produces full BlogArticle JSON files in content/blog/ru/*.json, picks the
// first 5 to publish and leaves the rest as ready-to-review drafts.
//
// Anti-bullshit: copy comes from the research doc; no invented cases /
// clients / numbers / top-3 promises. CTA always points at the @XGame_changerx
// Telegram bot (single source of truth, same as money pages).
//
// Usage:
//   yarn tsx scripts/apply-blog.ts          # dry-run
//   yarn tsx scripts/apply-blog.ts --write  # writes JSON files
//
import fs from 'node:fs';
import path from 'node:path';
import type { BlogArticle, BodyBlock, FaqItem, InternalLink } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const BLOG_DIR = path.join(ROOT, 'content', 'blog', 'ru');
const WRITE = process.argv.includes('--write');
const SITE = 'https://gptbot.uz';
const TG = 'https://t.me/XGame_changerx';
const DEFAULT_OG = `${SITE}/assets/landing/1.png`;

interface RawArticle {
  slug: string;
  title: string;
  description: string;
  h1: string;
  keywords: string[];
  targetMoneyPage: string;
  intro: string;
  body: BodyBlock[];
  faq: FaqItem[];
}

const PUBLISH_SLUGS = new Set([
  'pochemu-biznes-teryaet-zayavki-iz-instagram-telegram',
  'kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy',
  'ai-bot-dlya-biznesa-v-uzbekistane',
  'gpt-bot-vs-chat-bot',
  'telegram-bot-dlya-biznesa',
]);

// Per-slug additional contextual outgoing links — picked from money pages
// related to the article topic. The article ALWAYS links to its
// targetMoneyPage first; the rest is contextually relevant.
const EXTRA_LINKS: Record<string, { target: string; anchor: string }[]> = {
  'pochemu-biznes-teryaet-zayavki-iz-instagram-telegram': [
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
  'kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
    { target: '/ru/bot-dlya-obrabotki-zayavok/', anchor: 'бот для обработки заявок' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот' },
  ],
  'ai-bot-dlya-biznesa-v-uzbekistane': [
    { target: '/ru/gpt-bot-dlya-biznesa/', anchor: 'GPT-бот для бизнеса' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот' },
  ],
  'gpt-bot-vs-chat-bot': [
    { target: '/ru/chat-bot-dlya-biznesa/', anchor: 'чат-бот для бизнеса' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса' },
  ],
  'telegram-bot-dlya-biznesa': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
    { target: '/ru/avtomatizatsiya-prodazh/', anchor: 'автоматизация продаж' },
  ],
  'instagram-direct-bot-kak-rabotaet': [
    { target: '/ru/ai-menedzher-dlya-instagram/', anchor: 'AI-менеджер для Instagram' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
  ],
  'ai-menedzher-dlya-instagram': [
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот' },
    { target: '/ru/ai-prodavec/', anchor: 'AI-продавец' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
  'avtomatizatsiya-zayavok-instruktsiya': [
    { target: '/ru/avtomatizatsiya-prodazh/', anchor: 'автоматизация продаж' },
    { target: '/ru/bot-dlya-obrabotki-zayavok/', anchor: 'бот для обработки заявок' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
  'otvety-klientam-24-7-bez-rasshireniya-otdela': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
    { target: '/ru/ai-menedzher-dlya-instagram/', anchor: 'AI-менеджер для Instagram' },
  ],
  'ai-bot-dlya-kliniki-zadachi': [
    { target: '/ru/chat-bot-dlya-biznesa/', anchor: 'чат-бот для бизнеса' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
  'ai-bot-dlya-salona-krasoty-zadachi': [
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
  ],
  'ai-bot-dlya-uchebnogo-tsentra-zadachi': [
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
  'ai-bot-dlya-internet-magazina-zadachi': [
    { target: '/ru/ai-prodavec/', anchor: 'AI-продавец' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса' },
  ],
  'ai-prodavec-i-otdel-prodazh': [
    { target: '/ru/avtomatizatsiya-prodazh/', anchor: 'автоматизация продаж' },
    { target: '/ru/ai-menedzher-dlya-instagram/', anchor: 'AI-менеджер для Instagram' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
  'telegram-bot-crm-ili-menedzher': [
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок' },
    { target: '/ru/avtomatizatsiya-prodazh/', anchor: 'автоматизация продаж' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса' },
  ],
};

const parts = ['blog-articles-part1.json', 'blog-articles-part2.json', 'blog-articles-part3.json'];
const articles: RawArticle[] = parts
  .map((p) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, p), 'utf-8')))
  .flat();

function bodyChars(body: BodyBlock[], intro: string): number {
  let c = intro.length;
  for (const b of body) {
    if (b.text) c += b.text.length;
    if (b.items) c += b.items.join(' ').length;
  }
  return c;
}

if (!WRITE) {
  for (const a of articles) {
    const chars = bodyChars(a.body, a.intro);
    console.log(`  ${a.slug}: title=${a.title.length}c desc=${a.description.length}c body=${chars}c faq=${a.faq.length} publish=${PUBLISH_SLUGS.has(a.slug)}`);
  }
  console.log(`Total ${articles.length} articles loaded. Re-run with --write to materialize.`);
  process.exit(0);
}

if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

const now = new Date().toISOString();
const today = now.split('T')[0];

let written = 0;
for (const a of articles) {
  const url = `/ru/blog/${a.slug}/`;
  // Build the body — make sure intro is the first paragraph and the
  // target money page CTA is somewhere in the body if not already.
  const body: BodyBlock[] = [{ type: 'p', text: a.intro }, ...a.body];

  // Internal links: target money page first, then the EXTRA_LINKS for this slug.
  // The article's targetMoneyPage anchor uses the page H1-style label.
  const moneyAnchorMap: Record<string, string> = {
    '/ru/ai-bot-dlya-biznesa/': 'AI-бот для бизнеса',
    '/ru/gpt-bot-dlya-biznesa/': 'GPT-бот для бизнеса',
    '/ru/chat-bot-dlya-biznesa/': 'чат-бот для бизнеса',
    '/ru/telegram-bot-dlya-biznesa/': 'Telegram-бот для бизнеса',
    '/ru/instagram-direct-bot/': 'Instagram Direct бот',
    '/ru/ai-menedzher-dlya-instagram/': 'AI-менеджер для Instagram',
    '/ru/ai-prodavec/': 'AI-продавец',
    '/ru/avtomatizatsiya-zayavok/': 'автоматизация заявок',
    '/ru/avtomatizatsiya-prodazh/': 'автоматизация продаж',
    '/ru/bot-dlya-obrabotki-zayavok/': 'бот для обработки заявок',
    '/ru/ai-bot-dlya-kliniki/': 'AI-бот для клиники',
    '/ru/ai-bot-dlya-salona-krasoty/': 'AI-бот для салона красоты',
    '/ru/ai-bot-dlya-uchebnogo-tsentra/': 'AI-бот для учебного центра',
    '/ru/ai-bot-dlya-magazina/': 'AI-бот для магазина',
    '/ru/ai-bot-dlya-horeca/': 'AI-бот для HoReCa',
  };
  const internalLinks: InternalLink[] = [
    {
      target: a.targetMoneyPage,
      anchor: moneyAnchorMap[a.targetMoneyPage] || 'смотрите подробнее',
      locale: 'ru',
      type: 'contextual',
      priority: 1,
    },
    ...(EXTRA_LINKS[a.slug] || []).map((l) => ({
      target: l.target, anchor: l.anchor, locale: 'ru' as const, type: 'contextual' as const,
    })),
  ];

  const article: BlogArticle = {
    status: PUBLISH_SLUGS.has(a.slug) ? 'published' : 'draft',
    locale: 'ru',
    slug: a.slug,
    url,
    title: a.title,
    description: a.description,
    h1: a.h1,
    topicCluster: a.targetMoneyPage.replace(/^\/ru\//, '').replace(/\/$/, ''),
    targetMoneyPage: a.targetMoneyPage,
    keywords: a.keywords,
    intro: a.intro,
    body,
    faq: a.faq,
    cta: { label: 'Запросить демо в Telegram', href: TG },
    internalLinks,
    ogTitle: a.title,
    ogDescription: a.description,
    ogImage: DEFAULT_OG,
    canonical: `${SITE}${url}`,
    hreflangRu: url,
    robotsIndex: true,
    robotsFollow: true,
    author: 'GPTBot Team',
    datePublished: today,
    dateModified: today,
    schemaTypes: ['Organization', 'WebSite', 'BreadcrumbList', 'Article', 'FAQPage'],
    updatedAt: now,
    createdAt: '2026-05-25T00:00:00Z',
  };

  const filePath = path.join(BLOG_DIR, `${a.slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(article, null, 2) + '\n', 'utf-8');
  written++;
}

console.log('========================================');
console.log(`  PHASE 4 — apply-blog`);
console.log('========================================');
console.log(`Articles total:   ${articles.length}`);
console.log(`Written to disk:  ${written}`);
console.log(`Published flag:   ${[...PUBLISH_SLUGS].length} articles`);
console.log(`Draft flag:       ${articles.length - PUBLISH_SLUGS.size}`);
console.log('========================================');
