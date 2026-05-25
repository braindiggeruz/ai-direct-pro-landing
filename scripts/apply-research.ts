// scripts/apply-research.ts
//
// Phase 1 content builder. Reads SEO research (encoded inline below, sourced
// from docs_input/AI_GPT_RESEARCH.docx) and produces full money-page JSON
// for every URL in the programme. After running:
//
//   * Each money page has hero, body blocks (pain → solution → how it works
//     → benefits), FAQ ≥ 5, internal links ≥ 3, canonical, hreflang pair
//     when available, OG, schema types.
//   * Existing handcrafted FAQ items are preserved if present; we only top
//     them up to ≥ 5 from the research-faq pool.
//   * Internal-link graph is symmetric inside Batch A so each Batch A page
//     receives ≥ 2 incoming links.
//   * Only pages in BATCH_A are flipped to status="published". Everything
//     else stays "draft" but with full content so the page editor can review
//     and publish next.
//
// Anti-bullshit guard rails:
//   - No fake cases, no fake clients, no money guarantees, no top-3 claims.
//   - FAQ items about "how long / how much" deliberately answer with
//     "depends on the scope, ask in Telegram" rather than fixed numbers.
//
// Usage:
//   yarn tsx scripts/apply-research.ts          # dry-run, prints diff stats
//   yarn tsx scripts/apply-research.ts --write  # rewrites content/pages/*.json
//
import fs from 'node:fs';
import path from 'node:path';
import type { Page, FaqItem, BodyBlock, InternalLink, SchemaType } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES_DIR = path.join(ROOT, 'content', 'pages');
const WRITE = process.argv.includes('--write');

const SITE = 'https://gptbot.uz';
const TG_PRIMARY = 'https://t.me/XGame_changerx';
const DEFAULT_OG = `${SITE}/assets/landing/1.png`;

const BATCH_A = new Set([
  '/ru/ai-bot-dlya-biznesa/',
  '/ru/gpt-bot-dlya-biznesa/',
  '/ru/chat-bot-dlya-biznesa/',
  '/ru/telegram-bot-dlya-biznesa/',
  '/ru/instagram-direct-bot/',
  '/uz/biznes-uchun-ai-bot/',
  '/uz/telegram-bot-biznes-uchun/',
  '/uz/instagram-bot-biznes-uchun/',
]);

// RU ↔ UZ pairs (only pairs that exist on both sides)
const HREFLANG_PAIR: Record<string, string> = {
  '/ru/ai-bot-dlya-biznesa/': '/uz/biznes-uchun-ai-bot/',
  '/uz/biznes-uchun-ai-bot/': '/ru/ai-bot-dlya-biznesa/',
  '/ru/gpt-bot-dlya-biznesa/': '/uz/gpt-bot-biznes-uchun/',
  '/uz/gpt-bot-biznes-uchun/': '/ru/gpt-bot-dlya-biznesa/',
  '/ru/telegram-bot-dlya-biznesa/': '/uz/telegram-bot-biznes-uchun/',
  '/uz/telegram-bot-biznes-uchun/': '/ru/telegram-bot-dlya-biznesa/',
  '/ru/instagram-direct-bot/': '/uz/instagram-bot-biznes-uchun/',
  '/uz/instagram-bot-biznes-uchun/': '/ru/instagram-direct-bot/',
  '/ru/avtomatizatsiya-zayavok/': '/uz/arizalarni-avtomatlashtirish/',
  '/uz/arizalarni-avtomatlashtirish/': '/ru/avtomatizatsiya-zayavok/',
  '/ru/avtomatizatsiya-prodazh/': '/uz/savdoni-avtomatlashtirish/',
  '/uz/savdoni-avtomatlashtirish/': '/ru/avtomatizatsiya-prodazh/',
  '/ru/ai-bot-dlya-kliniki/': '/uz/klinika-uchun-ai-bot/',
  '/uz/klinika-uchun-ai-bot/': '/ru/ai-bot-dlya-kliniki/',
  '/ru/ai-bot-dlya-salona-krasoty/': '/uz/salon-uchun-ai-bot/',
  '/uz/salon-uchun-ai-bot/': '/ru/ai-bot-dlya-salona-krasoty/',
  '/ru/ai-bot-dlya-uchebnogo-tsentra/': '/uz/oquv-markazi-uchun-ai-bot/',
  '/uz/oquv-markazi-uchun-ai-bot/': '/ru/ai-bot-dlya-uchebnogo-tsentra/',
  '/ru/ai-bot-dlya-magazina/': '/uz/dokon-uchun-ai-bot/',
  '/uz/dokon-uchun-ai-bot/': '/ru/ai-bot-dlya-magazina/',
};

interface ResearchEntry {
  url: string;
  title: string;
  description: string;
  h1: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  heroSubtitle: string;
  painPoints: string[];
  solution: string;
  benefits: string[];
  faq: FaqItem[];
  ctaLabel: string;
  pageType?: 'money';
}

// FAQ pool: generic answers honoring the no-fake-claims rule. Used when the
// research provides only the question and we need a safe default answer.
function genericAnswer(q: string, locale: 'ru' | 'uz'): string {
  if (locale === 'ru') {
    return `Зависит от вашего сценария — пример сценария мы соберём индивидуально под нишу и каналы. Напишите в Telegram, поможем оценить объём работ и сроки: ${TG_PRIMARY}.`;
  }
  return `Bu sizning ssenariyingizga bog'liq — pример sсенарий nish va kanallarga moslab tuzamiz. Telegramga yozing, hajm va muddatlarni aniqlashga yordam beramiz: ${TG_PRIMARY}.`;
}

// Build a body-blocks tree: H2 → P solution → H2 → list pain → H2 → P how it
// works → H2 → list benefits → CTA. All copy taken from research; no invented
// numbers, no fake клиент/кейс claims.
function buildBody(r: ResearchEntry, locale: 'ru' | 'uz'): BodyBlock[] {
  const L = (ru: string, uz: string) => (locale === 'ru' ? ru : uz);
  const blocks: BodyBlock[] = [];
  blocks.push({ type: 'h2', text: L(`Что делает ${r.primaryKeyword}`, `${r.primaryKeyword} nima qiladi`) });
  blocks.push({ type: 'p', text: r.solution });
  if (r.painPoints.length) {
    blocks.push({ type: 'h2', text: L('Почему заявки теряются', 'Nima uchun arizalar yo\'qoladi') });
    blocks.push({ type: 'list', items: r.painPoints });
  }
  blocks.push({ type: 'h2', text: L('Как это работает', 'Bu qanday ishlaydi') });
  blocks.push({
    type: 'p',
    text: L(
      'AI-бот подключается к Telegram и Instagram Direct, отвечает на входящие сообщения, задаёт уточняющие вопросы, собирает имя и контакт и передаёт готовую заявку менеджеру в Telegram или CRM. Сценарий настраивается под нишу.',
      "AI-bot Telegram va Instagram Directga ulanadi, kiruvchi xabarlarga javob beradi, qo'shimcha savollarni so'raydi, ism va kontaktni yig'adi va tayyor arizani Telegram yoki CRM dagi menejerga uzatadi. Ssenariy nishga moslab tuziladi.",
    ),
  });
  if (r.benefits.length) {
    blocks.push({ type: 'h2', text: L('Что получает бизнес', 'Biznes nima oladi') });
    blocks.push({ type: 'list', items: r.benefits });
  }
  blocks.push({ type: 'cta', text: r.ctaLabel, href: TG_PRIMARY });
  return blocks;
}

// Normalize title to 45–65, description to 120–160.
function fitTitle(t: string): string {
  let s = t.trim();
  if (s.length < 45) s = `${s} | GPTBot`.trim();
  if (s.length < 45) s = `${s} — Telegram + Instagram 24/7`.trim();
  if (s.length > 65) s = s.slice(0, 65).replace(/[\s—–\-|]+$/, '');
  return s;
}
function fitDesc(d: string, locale: 'ru' | 'uz'): string {
  let s = d.trim();
  const pad = locale === 'ru'
    ? ' Демо в Telegram, без обещаний топ-3.'
    : " Telegram'da demo, top-3 va'dasiz.";
  if (s.length < 120) s = (s + pad).trim();
  if (s.length < 120) s = (s + (locale === 'ru' ? ' Подключаем под нишу.' : ' Nishga moslaymiz.')).trim();
  if (s.length > 160) s = s.slice(0, 159).replace(/[\s,;:.—–\-]+$/, '') + '.';
  return s;
}

// Internal-link plan per URL — at least 3 outgoing per page, every Batch A
// page receives ≥ 2 incoming via the graph below.
const LINKS: Record<string, { target: string; anchor: string; locale: 'ru' | 'uz' }[]> = {
  // RU money pages
  '/ru/ai-bot-dlya-biznesa/': [
    { target: '/ru/gpt-bot-dlya-biznesa/', anchor: 'GPT-бот для бизнеса', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
  ],
  '/ru/gpt-bot-dlya-biznesa/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/chat-bot-dlya-biznesa/', anchor: 'чат-бот для бизнеса', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
    { target: '/ru/ai-prodavec/', anchor: 'AI-продавец', locale: 'ru' },
  ],
  '/ru/chat-bot-dlya-biznesa/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/gpt-bot-dlya-biznesa/', anchor: 'GPT-бот для бизнеса', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
  ],
  '/ru/telegram-bot-dlya-biznesa/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
    { target: '/ru/gpt-bot-dlya-biznesa/', anchor: 'GPT-бот для бизнеса', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
  ],
  '/ru/instagram-direct-bot/': [
    { target: '/ru/ai-menedzher-dlya-instagram/', anchor: 'AI-менеджер для Instagram', locale: 'ru' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
  ],
  '/ru/ai-menedzher-dlya-instagram/': [
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
    { target: '/ru/ai-prodavec/', anchor: 'AI-продавец', locale: 'ru' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
  ],
  '/ru/ai-prodavec/': [
    { target: '/ru/ai-menedzher-dlya-instagram/', anchor: 'AI-менеджер для Instagram', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-prodazh/', anchor: 'автоматизация продаж', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
  ],
  '/ru/avtomatizatsiya-zayavok/': [
    { target: '/ru/avtomatizatsiya-prodazh/', anchor: 'автоматизация продаж', locale: 'ru' },
    { target: '/ru/bot-dlya-obrabotki-zayavok/', anchor: 'бот для обработки заявок', locale: 'ru' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
  ],
  '/ru/avtomatizatsiya-prodazh/': [
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
    { target: '/ru/ai-prodavec/', anchor: 'AI-продавец', locale: 'ru' },
    { target: '/ru/bot-dlya-obrabotki-zayavok/', anchor: 'бот для обработки заявок', locale: 'ru' },
  ],
  '/ru/bot-dlya-obrabotki-zayavok/': [
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
  ],
  '/ru/ai-bot-dlya-kliniki/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/chat-bot-dlya-biznesa/', anchor: 'чат-бот для бизнеса', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
  ],
  '/ru/ai-bot-dlya-salona-krasoty/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
    { target: '/ru/chat-bot-dlya-biznesa/', anchor: 'чат-бот для бизнеса', locale: 'ru' },
  ],
  '/ru/ai-bot-dlya-uchebnogo-tsentra/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/avtomatizatsiya-zayavok/', anchor: 'автоматизация заявок', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
  ],
  '/ru/ai-bot-dlya-magazina/': [
    { target: '/ru/ai-prodavec/', anchor: 'AI-продавец', locale: 'ru' },
    { target: '/ru/chat-bot-dlya-biznesa/', anchor: 'чат-бот для бизнеса', locale: 'ru' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
  ],
  '/ru/ai-bot-dlya-horeca/': [
    { target: '/ru/ai-bot-dlya-biznesa/', anchor: 'AI-бот для бизнеса', locale: 'ru' },
    { target: '/ru/telegram-bot-dlya-biznesa/', anchor: 'Telegram-бот для бизнеса', locale: 'ru' },
    { target: '/ru/instagram-direct-bot/', anchor: 'Instagram Direct бот', locale: 'ru' },
  ],
  // UZ money pages
  '/uz/biznes-uchun-ai-bot/': [
    { target: '/uz/gpt-bot-biznes-uchun/', anchor: 'GPT-bot biznes uchun', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
    { target: '/uz/instagram-bot-biznes-uchun/', anchor: 'Instagram bot biznes uchun', locale: 'uz' },
    { target: '/uz/arizalarni-avtomatlashtirish/', anchor: 'arizalarni avtomatlashtirish', locale: 'uz' },
  ],
  '/uz/gpt-bot-biznes-uchun/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
    { target: '/uz/instagram-bot-biznes-uchun/', anchor: 'Instagram bot biznes uchun', locale: 'uz' },
  ],
  '/uz/telegram-bot-biznes-uchun/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/instagram-bot-biznes-uchun/', anchor: 'Instagram bot biznes uchun', locale: 'uz' },
    { target: '/uz/arizalarni-avtomatlashtirish/', anchor: 'arizalarni avtomatlashtirish', locale: 'uz' },
    { target: '/uz/savdoni-avtomatlashtirish/', anchor: 'savdoni avtomatlashtirish', locale: 'uz' },
  ],
  '/uz/instagram-bot-biznes-uchun/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
    { target: '/uz/arizalarni-avtomatlashtirish/', anchor: 'arizalarni avtomatlashtirish', locale: 'uz' },
  ],
  '/uz/arizalarni-avtomatlashtirish/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/savdoni-avtomatlashtirish/', anchor: 'savdoni avtomatlashtirish', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
  ],
  '/uz/savdoni-avtomatlashtirish/': [
    { target: '/uz/arizalarni-avtomatlashtirish/', anchor: 'arizalarni avtomatlashtirish', locale: 'uz' },
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
  ],
  '/uz/klinika-uchun-ai-bot/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/instagram-bot-biznes-uchun/', anchor: 'Instagram bot biznes uchun', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
  ],
  '/uz/salon-uchun-ai-bot/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/instagram-bot-biznes-uchun/', anchor: 'Instagram bot biznes uchun', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
  ],
  '/uz/oquv-markazi-uchun-ai-bot/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/arizalarni-avtomatlashtirish/', anchor: 'arizalarni avtomatlashtirish', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
  ],
  '/uz/dokon-uchun-ai-bot/': [
    { target: '/uz/biznes-uchun-ai-bot/', anchor: 'biznes uchun AI bot', locale: 'uz' },
    { target: '/uz/telegram-bot-biznes-uchun/', anchor: 'Telegram bot biznes uchun', locale: 'uz' },
    { target: '/uz/instagram-bot-biznes-uchun/', anchor: 'Instagram bot biznes uchun', locale: 'uz' },
  ],
};

// Research data inlined — produced from docs_input/AI_GPT_RESEARCH.docx via
// extract_file_tool. Pain points / benefits / FAQ kept verbatim where the
// source provided them; CTA labels normalised; titles & descriptions kept
// for fit-pass.
const RESEARCH: ResearchEntry[] = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'research-data.json'), 'utf-8'));

function loadExistingFaq(filePath: string): FaqItem[] {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(raw.faq) ? raw.faq.filter((x: FaqItem) => x.q && x.a) : [];
  } catch { return []; }
}

function ensureFiveFaq(researchFaq: FaqItem[], existing: FaqItem[], locale: 'ru' | 'uz'): FaqItem[] {
  // Start with existing handcrafted FAQ (preserved). Top up with research
  // items that don't duplicate a question. Min target = 5.
  const seen = new Set(existing.map((x) => x.q.trim().toLowerCase()));
  const out: FaqItem[] = [...existing];
  for (const f of researchFaq) {
    if (out.length >= 7) break;
    const key = f.q.trim().toLowerCase();
    if (seen.has(key)) continue;
    out.push({ q: f.q, a: f.a || genericAnswer(f.q, locale) });
    seen.add(key);
  }
  // Last-resort: if still < 5, add a CTA-style generic FAQ.
  const ctaFaq = locale === 'ru'
    ? { q: 'Как заказать?', a: `Напишите в Telegram, мы соберём демо-сценарий под вашу нишу: ${TG_PRIMARY}.` }
    : { q: 'Qanday buyurtma berish kerak?', a: `Telegramga yozing, nishingizga moslab demo-ssenariyni tayyorlaymiz: ${TG_PRIMARY}.` };
  while (out.length < 5) {
    if (seen.has(ctaFaq.q.toLowerCase())) break;
    out.push(ctaFaq);
    seen.add(ctaFaq.q.toLowerCase());
  }
  return out.slice(0, 7);
}

function buildPage(r: ResearchEntry): Page {
  const locale: 'ru' | 'uz' = r.url.startsWith('/ru/') ? 'ru' : 'uz';
  const slug = r.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
  const filePath = path.join(PAGES_DIR, locale, `${slug}.json`);
  const existingFaq = loadExistingFaq(filePath);
  const faq = ensureFiveFaq(r.faq, existingFaq, locale);

  const title = fitTitle(r.title);
  const description = fitDesc(r.description, locale);
  const pair = HREFLANG_PAIR[r.url];

  const internalLinks: InternalLink[] = (LINKS[r.url] || []).map((l) => ({
    ...l, type: 'contextual' as const,
  }));

  const schemaTypes: SchemaType[] = ['Organization', 'WebSite', 'BreadcrumbList', 'Service', 'FAQPage'];

  const now = new Date().toISOString();
  return {
    status: BATCH_A.has(r.url) ? 'published' : 'draft',
    locale,
    url: r.url,
    slug,
    pageType: 'money',
    primaryKeyword: r.primaryKeyword,
    secondaryKeywords: r.secondaryKeywords,
    searchIntent: 'commercial',
    h1: r.h1,
    title,
    description,
    canonical: `${SITE}${r.url}`,
    hreflangRu: locale === 'ru' ? r.url : pair,
    hreflangUz: locale === 'uz' ? r.url : pair,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_OG,
    robotsIndex: true,
    robotsFollow: true,
    breadcrumbLabel: r.h1.split(':')[0].trim(),
    heroTitle: r.h1,
    heroSubtitle: r.heroSubtitle,
    ctaPrimaryLabel: r.ctaLabel,
    ctaPrimaryHref: TG_PRIMARY,
    ctaSecondaryLabel: locale === 'ru' ? 'Как это работает' : "Bu qanday ishlaydi",
    ctaSecondaryHref: '#how',
    bodyBlocks: buildBody(r, locale),
    faq,
    internalLinks,
    schemaTypes,
    lastReviewedAt: now.split('T')[0],
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: now,
  };
}

let written = 0;
const fileStats: string[] = [];
for (const r of RESEARCH) {
  const page = buildPage(r);
  const locale: 'ru' | 'uz' = page.locale as 'ru' | 'uz';
  const file = path.join(PAGES_DIR, locale, `${page.slug}.json`);
  const txt = JSON.stringify(page, null, 2) + '\n';
  if (WRITE) {
    fs.writeFileSync(file, txt, 'utf-8');
    written++;
  }
  fileStats.push(`  ${page.url}  title=${page.title.length}c  desc=${page.description.length}c  faq=${page.faq.length}  links=${page.internalLinks.length}  status=${page.status}`);
}

console.log('========================================');
console.log('  PHASE 1 — apply-research');
console.log('========================================');
console.log(`Mode:           ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
console.log(`Pages processed: ${RESEARCH.length}`);
console.log(`Files written:   ${written}`);
console.log('---');
for (const s of fileStats) console.log(s);
console.log('========================================');
