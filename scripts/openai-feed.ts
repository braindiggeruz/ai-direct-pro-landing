// OpenAI product feed (ChatGPT Business Hub → Products → Hosted URL).
// Spec: https://developers.openai.com/commerce/specs/file-upload/products.md
//
// Nothing here states a price. Every amount is read from the place the site
// itself takes it from, so a price changed on the site changes the feed on the
// next build and can never drift from it:
//   - AI chat packs: functions/lib/gpt-chat/packs.ts via CHAT_FACTS (the same
//     numbers the checkout charges and the pages print);
//   - Studio plans: functions/lib/studio/plans.ts via STUDIO_FACTS (the plan
//     of the published offer edition);
//   - agency services: the package table «Пакет | Что входит | Срок | Цена (сум)»
//     on each service page (content/pages/ru/*.json), the table the visitor reads.
// The catalog below holds only what the pages cannot give: the stable item_id,
// the English wording and the product category. Each English «includes» line
// keeps the Russian cell it was translated from (`sourceRu`); when the page text
// changes, the test fails until the translation is reviewed.
//
// Unknown values are left out of a record entirely: no null, "n/a" or "".
//
// Three files carry the same records (scripts/build-openai-feed.ts writes them):
//   openai-product-feed.jsonl.gz  the Hosted URL (Business Hub takes gzip JSONL)
//   openai-product-feed.tsv       fallback Hosted URL, header row, one item a line
//   openai-product-feed.jsonl     plain copy for people and tools
// WebP og:images are replaced by JPEG copies in /assets/feed/ (the spec names
// JPEG and PNG); scripts/openai-feed-images.json maps each WebP to its copy.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { CHAT_FACTS, STUDIO_FACTS } from './product-facts';

export const SITE = 'https://gptbot.uz';
export const FEED_FILE = 'public/openai-product-feed.jsonl';
export const FEED_GZ_FILE = 'public/openai-product-feed.jsonl.gz';
export const FEED_TSV_FILE = 'public/openai-product-feed.tsv';
export const FEED_URL = `${SITE}/openai-product-feed.jsonl`;
export const FEED_GZ_URL = `${SITE}/openai-product-feed.jsonl.gz`;
export const FEED_TSV_URL = `${SITE}/openai-product-feed.tsv`;
export const FEED_IMAGE_LOCK = 'scripts/openai-feed-images.json';
export const FEED_IMAGE_DIR = '/assets/feed/';

// The free trial is the one record priced 0 UZS, and the spec asks for a
// positive price. Set this to false (then run `npm run feed:openai` and commit
// the three files) if Business Hub rejects the row. It is a committed constant,
// not an environment variable, because the release guard requires the build to
// reproduce the committed feed byte for byte.
export const INCLUDE_FREE_TRIAL = true;
export const FREE_TRIAL_ITEM_ID = 'gptbot-ai-chat-trial';
const BRAND = 'GPTBot.uz';
const OFFER_URL = `${SITE}/ru/oferta/`;

// Item ids already handed to OpenAI. Append only: an id is never renamed or
// removed, because the Hub keys the product's history on it.
export const LOCKED_ITEM_IDS = [
  'gptbot-ai-chat-trial', 'gptbot-ai-pack-3d', 'gptbot-ai-pack-1m',
  'gptbot-studio-day', 'gptbot-studio-month',
  'gptbot-ai-bot-business', 'gptbot-ai-bot-business-tier', 'gptbot-ai-bot-pro', 'gptbot-ai-bot-support',
  'gptbot-ig-start', 'gptbot-ig-ai-manager', 'gptbot-ig-pro',
  'gptbot-wa-start', 'gptbot-wa-business',
  'gptbot-tg-start', 'gptbot-tg-business', 'gptbot-tg-pro', 'gptbot-tg-support',
  'gptbot-web-landing', 'gptbot-web-corporate', 'gptbot-web-eshop', 'gptbot-web-support',
  'gptbot-seo-audit', 'gptbot-seo-start', 'gptbot-seo-growth', 'gptbot-seo-leader',
  'gptbot-smm-start', 'gptbot-smm-business', 'gptbot-smm-pro',
  'gptbot-target-launch', 'gptbot-target-management',
  'gptbot-ppc-launch', 'gptbot-ppc-management',
] as const;

export const AVAILABILITY_VALUES = ['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown'] as const;

/** One line of the feed, in the order the fields are written. */
export interface FeedRecord {
  item_id: string;
  title: string;
  description: string;
  url: string;
  brand: string;
  seller_name: string;
  seller_url: string;
  image_url: string;
  price: string;
  availability: (typeof AVAILABILITY_VALUES)[number];
  condition: 'new';
  is_digital: true;
  product_category: string;
  target_countries: string[];
  store_country: string;
  return_policy?: string;
  accepts_returns?: boolean;
}

/** Where a record's price was read and how it reads on the page, for the parity test. */
export interface PriceProof {
  itemId: string;
  /** Content file of the page the record links to. */
  page: string;
  amountUzs: number;
  /** Text the page must show for this price, spaces normalised. */
  visible: string;
}

// ---------- page content ----------

interface TableBlock { type: 'table'; headers: string[]; rows: string[][] }
interface PageContent {
  status?: string;
  robotsIndex?: boolean;
  url: string;
  ogImage?: string;
  bodyBlocks?: Array<{ type: string } & Partial<TableBlock>>;
  [key: string]: unknown;
}

const PACKAGE_TABLE_HEADERS = ['Пакет', 'Что входит', 'Срок', 'Цена (сум)'];

export function readPage(root: string, file: string): PageContent {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as PageContent;
}

/** Every string of a page, whitespace (regular and NBSP) collapsed to one space. */
export function pageText(page: unknown): string {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(page);
  return normaliseSpaces(out.join('\n'));
}

export const normaliseSpaces = (text: string): string => text.replace(/[ \u00a0\u202f\t]+/g, ' ');

/** 1990000 → "1 990 000", the way the pages print sums. */
export const groupThousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export interface PackageRow {
  name: string;
  includes: string;
  term: string;
  priceCell: string;
  amountUzs: number;
  monthly: boolean;
}

const PRICE_CELL_RE = /^от (\d{1,3}(?: \d{3})*)( \/ мес)?$/u;
const MONTHLY_TERMS = new Set(['в месяц', 'ежемесячно']);

/** The row `name` of the page's package table; throws when the table or row is missing or unreadable. */
export function packageRow(page: PageContent, name: string): PackageRow {
  const tables = (page.bodyBlocks ?? []).filter((block): block is { type: 'table' } & TableBlock =>
    block.type === 'table' && JSON.stringify(block.headers) === JSON.stringify(PACKAGE_TABLE_HEADERS));
  if (tables.length !== 1) throw new Error(`${page.url}: expected one package table «${PACKAGE_TABLE_HEADERS.join(' | ')}», found ${tables.length}`);
  const rows = tables[0].rows.filter((row) => normaliseSpaces(row[0]).trim() === name);
  if (rows.length !== 1) throw new Error(`${page.url}: package «${name}» not found exactly once in the package table`);
  const [cellName, includes, term, priceCell] = rows[0].map((cell) => normaliseSpaces(cell).trim());
  const match = PRICE_CELL_RE.exec(priceCell);
  if (!match) throw new Error(`${page.url}: price cell of «${name}» is not «от N» or «от N / мес»: «${priceCell}»`);
  const amountUzs = Number(match[1].replace(/ /g, ''));
  if (!Number.isSafeInteger(amountUzs) || amountUzs <= 0) throw new Error(`${page.url}: «${name}» has no positive price`);
  const monthly = Boolean(match[2]) || MONTHLY_TERMS.has(term);
  return { name: cellName, includes, term, priceCell, amountUzs, monthly };
}

/** The Срок cell in English. Unknown wording fails the build instead of guessing. */
export function termInEnglish(term: string, afterAccess: boolean): string {
  if (MONTHLY_TERMS.has(term)) return '';
  const days = /^(\d+) (?:день|дня|дней)$/u.exec(term);
  if (days) return `Timeline: ${days[1]} ${days[1] === '1' ? 'day' : 'days'}${afterAccess ? ', counted from receipt of access and materials' : ''}.`;
  if (term === 'разово') return 'One-time service.';
  const once = /^разово, (\d+) (?:день|дня|дней)$/u.exec(term);
  if (once) return `One-time service, timeline: ${once[1]} days.`;
  throw new Error(`Unknown package term «${term}»: extend termInEnglish before publishing it in the feed`);
}

// ---------- catalog ----------

const STARTING_PRICE = 'Starting price; the final scope and price are fixed in a quote before work starts.';
const AD_BUDGET = 'Advertising budget is paid separately.';
const NOT_OPENAI = 'Independent AI chat, not ChatGPT and not an OpenAI product.';

interface ServicePage {
  file: string;
  category: string;
  /** Facts the page states about costs outside the price, in English. */
  notes: string[];
  /** The page says the timeline starts once access and materials are received. */
  afterAccess: boolean;
}

export const SERVICE_PAGES = {
  aiBot: {
    file: 'content/pages/ru/ai-bot-dlya-biznesa.json',
    category: 'Services > AI Chatbot Development',
    notes: ['Hosting, AI/API costs and external platform licences are paid separately from development.'],
    afterAccess: true,
  },
  instagram: {
    file: 'content/pages/ru/ai-menedzher-dlya-instagram.json',
    category: 'Services > AI Chatbot Development',
    notes: ['A second channel, CRM, payments, external platform fees and AI model costs are separate quote items.'],
    afterAccess: true,
  },
  whatsapp: {
    file: 'content/pages/ru/whatsapp-bot-dlya-biznesa.json',
    category: 'Services > AI Chatbot Development',
    notes: ['A second channel, CRM, payments, external platform fees and AI model costs are separate quote items.'],
    afterAccess: true,
  },
  telegram: {
    file: 'content/pages/ru/razrabotka-telegram-bota-tashkent.json',
    category: 'Services > Chatbot Development',
    notes: ['CRM licences, hosting, AI/API costs and payment provider fees are listed separately in the quote.'],
    afterAccess: true,
  },
  web: {
    file: 'content/pages/ru/razrabotka-saytov-tashkent.json',
    category: 'Services > Website Development',
    notes: ['CRM, payments, data migration, external platform fees and AI model costs are separate quote items.'],
    afterAccess: true,
  },
  seo: {
    file: 'content/pages/ru/seo-prodvizhenie-saytov-tashkent.json',
    category: 'Services > SEO',
    notes: [],
    afterAccess: false,
  },
  smm: {
    file: 'content/pages/ru/smm-prodvizhenie-tashkent.json',
    category: 'Services > Social Media Marketing',
    notes: [AD_BUDGET],
    afterAccess: false,
  },
  target: {
    file: 'content/pages/ru/targetirovannaya-reklama-tashkent.json',
    category: 'Services > Online Advertising > Social Media Ads',
    notes: [AD_BUDGET],
    afterAccess: false,
  },
  ppc: {
    file: 'content/pages/ru/kontekstnaya-reklama-tashkent.json',
    category: 'Services > Online Advertising > Search Ads',
    notes: [AD_BUDGET],
    afterAccess: false,
  },
} satisfies Record<string, ServicePage>;

export interface ServiceItem {
  itemId: string;
  page: keyof typeof SERVICE_PAGES;
  /** First cell of the package row. */
  row: string;
  title: string;
  /** English rendering of the «Что входит» cell. */
  includes: string;
  /** The «Что входит» cell the English was written from. */
  sourceRu: string;
  /** Extra facts from the same page for this package only. */
  extra?: string;
}

export const SERVICE_ITEMS: readonly ServiceItem[] = [
  {
    itemId: 'gptbot-ai-bot-business', page: 'aiBot', row: 'Старт',
    title: 'AI bot for business — Start package (one channel)',
    includes: 'One channel (Telegram or Instagram), AI answers from the company knowledge base, collection of name and phone number.',
    sourceRu: 'Один канал (Telegram или Instagram), AI-ответы по базе знаний, сбор имени и телефона',
  },
  {
    itemId: 'gptbot-ai-bot-business-tier', page: 'aiBot', row: 'Бизнес',
    title: 'AI bot for business — Business package (Telegram + Instagram, CRM)',
    includes: 'Telegram + Instagram, a knowledge base for the niche, Russian + Uzbek, handoff to CRM.',
    sourceRu: 'Telegram + Instagram, база знаний под нишу, RU + UZ, передача в CRM',
  },
  {
    itemId: 'gptbot-ai-bot-pro', page: 'aiBot', row: 'Pro',
    title: 'AI bot for business — Pro package (three channels)',
    includes: 'Three channels (plus WhatsApp or a website), payments, broadcasts, lead routing, analytics.',
    sourceRu: 'Три канала (+ WhatsApp или сайт), оплата, рассылки, маршрутизация заявок, аналитика',
  },
  {
    itemId: 'gptbot-ai-bot-support', page: 'aiBot', row: 'Поддержка',
    title: 'AI bot support — monthly',
    includes: 'Monthly support of an AI bot: answer quality control, knowledge base updates, a report on customer requests.',
    sourceRu: 'Контроль качества ответов, дообучение базы знаний, отчёт по обращениям',
  },
  {
    itemId: 'gptbot-ig-start', page: 'instagram', row: 'Старт',
    title: 'Instagram AI manager — Start package (Direct auto-replies)',
    includes: 'Scripted auto-replies in Instagram Direct, contact collection, handoff to a manager.',
    sourceRu: 'Автоответы в Direct по сценарию, сбор контакта, передача менеджеру',
  },
  {
    itemId: 'gptbot-ig-ai-manager', page: 'instagram', row: 'AI-менеджер',
    title: 'Instagram AI manager — AI Manager package',
    includes: 'AI answers to free-form questions in Instagram, lead qualification, comments and stories, Russian + Uzbek.',
    sourceRu: 'AI-ответы на свободные вопросы, квалификация, комментарии и stories, RU + UZ',
  },
  {
    itemId: 'gptbot-ig-pro', page: 'instagram', row: 'Pro',
    title: 'Instagram AI manager — Pro package (with CRM)',
    includes: 'Instagram AI manager plus CRM, connected with advertising and analytics by traffic source.',
    sourceRu: 'AI-менеджер + CRM + связка с рекламой и аналитикой по источникам',
  },
  {
    itemId: 'gptbot-wa-start', page: 'whatsapp', row: 'Старт',
    title: 'WhatsApp bot for business — Start package',
    includes: 'Scripted auto-replies and lead collection in WhatsApp.',
    sourceRu: 'Автоответы и сбор лидов в WhatsApp по сценарию',
  },
  {
    itemId: 'gptbot-wa-business', page: 'whatsapp', row: 'Бизнес',
    title: 'WhatsApp bot for business — Business package (AI + CRM)',
    includes: 'WhatsApp bot with AI answers from the knowledge base, Russian + Uzbek, handoff to CRM.',
    sourceRu: 'AI-ответы по базе знаний, RU + UZ, передача в CRM',
  },
  {
    itemId: 'gptbot-tg-start', page: 'telegram', row: 'Старт',
    title: 'Telegram bot development — Start package (lead bot)',
    includes: 'Button-based flow, lead intake, FAQ, handoff to a manager in Telegram.',
    sourceRu: 'Кнопочный сценарий, приём заявок, FAQ, передача менеджеру в Telegram',
    extra: 'The Start package works in one language of choice: Russian or Uzbek.',
  },
  {
    itemId: 'gptbot-tg-business', page: 'telegram', row: 'Бизнес',
    title: 'Telegram bot development — Business package (AI + CRM)',
    includes: 'Sales funnel, AI answers from the knowledge base, Russian + Uzbek, AmoCRM/Bitrix24 integration.',
    sourceRu: 'Воронка продаж, AI-ответы по базе знаний, RU + UZ, интеграция с AmoCRM/Bitrix24',
  },
  {
    itemId: 'gptbot-tg-pro', page: 'telegram', row: 'Pro',
    title: 'Telegram bot development — Pro package (payments, Mini App)',
    includes: 'AI + CRM + Payme/Click payments + a catalog bot or Mini App, analytics by traffic source.',
    sourceRu: 'AI + CRM + оплата Payme/Click + бот-витрина или Mini App, аналитика по источникам',
  },
  {
    itemId: 'gptbot-tg-support', page: 'telegram', row: 'Поддержка',
    title: 'Telegram bot support — monthly',
    includes: 'Monthly support of a Telegram bot: monitoring, flow edits, knowledge base updates.',
    sourceRu: 'Мониторинг, правки сценария, обновление базы знаний',
  },
  {
    itemId: 'gptbot-web-landing', page: 'web', row: 'Лендинг',
    title: 'Website development — landing page',
    includes: 'One page for a service, a form and an AI bot, Russian + Uzbek, lead analytics.',
    sourceRu: 'Одна страница под услугу, форма и AI-бот, RU + UZ, аналитика заявок',
  },
  {
    itemId: 'gptbot-web-corporate', page: 'web', row: 'Корпоративный сайт',
    title: 'Website development — corporate website (up to 15 pages)',
    includes: 'Up to 15 pages, CMS, blog, basic SEO, Russian + Uzbek, Telegram/CRM integration.',
    sourceRu: 'До 15 страниц, CMS, блог, SEO-база, RU + UZ, интеграция с Telegram/CRM',
  },
  {
    itemId: 'gptbot-web-eshop', page: 'web', row: 'Интернет-магазин',
    title: 'Website development — online store (Payme/Click)',
    includes: 'Catalog, cart, Payme/Click payments, delivery, a catalog bot in Telegram.',
    sourceRu: 'Каталог, корзина, оплата Payme/Click, доставка, бот-витрина в Telegram',
  },
  {
    itemId: 'gptbot-web-support', page: 'web', row: 'Поддержка',
    title: 'Website support — monthly',
    includes: 'Monthly website support: updates, backups, monitoring, content edits.',
    sourceRu: 'Обновления, бэкапы, мониторинг, правки контента',
  },
  {
    itemId: 'gptbot-seo-audit', page: 'seo', row: 'Аудит',
    title: 'Website SEO audit',
    includes: 'Technical, search and commercial website audit with a priority plan.',
    sourceRu: 'Технический, поисковый и коммерческий аудит с планом приоритетов',
    extra: 'Implementing the fixes is agreed separately.',
  },
  {
    itemId: 'gptbot-seo-start', page: 'seo', row: 'Старт',
    title: 'SEO promotion — Start package (monthly)',
    includes: 'Up to 15 pages: technical SEO, keyword research, 4 articles a month, local SEO, a report on leads.',
    sourceRu: 'До 15 страниц: техника, семантика, 4 материала в месяц, локальное SEO, отчёт по заявкам',
  },
  {
    itemId: 'gptbot-seo-growth', page: 'seo', row: 'Рост',
    title: 'SEO promotion — Growth package (monthly)',
    includes: 'Up to 100 pages: Russian + Uzbek content of up to 10 articles, internal linking, 5 external mentions, analytics.',
    sourceRu: 'До 100 страниц: RU + UZ контент до 10 материалов, перелинковка, 5 внешних упоминаний, аналитика',
  },
  {
    itemId: 'gptbot-seo-leader', page: 'seo', row: 'Лидер',
    title: 'SEO promotion — Leader package (monthly)',
    includes: 'Catalogs and highly competitive niches: no URL limit, a content plan, PR links, weekly monitoring.',
    sourceRu: 'Каталоги и высококонкурентные ниши: без лимита URL, контент-план, PR-ссылки, еженедельный мониторинг',
  },
  {
    itemId: 'gptbot-smm-start', page: 'smm', row: 'Старт',
    title: 'SMM management — Start package (monthly)',
    includes: '12 posts and 16 stories a month, design, replies in Instagram Direct via an AI bot.',
    sourceRu: '12 публикаций и 16 stories в месяц, дизайн, ответы в Direct через AI-бота',
  },
  {
    itemId: 'gptbot-smm-business', page: 'smm', row: 'Бизнес',
    title: 'SMM management — Business package (monthly)',
    includes: '20 posts, 8 Reels from the client’s materials, targeted ads management, a report on customer requests.',
    sourceRu: '20 публикаций, 8 Reels из материалов клиента, ведение таргета (бюджет отдельно), отчёт по обращениям',
  },
  {
    itemId: 'gptbot-smm-pro', page: 'smm', row: 'Про',
    title: 'SMM management — Pro package (monthly)',
    includes: 'Strategy, a shooting day, 12 Reels, targeting and retargeting, CRM connection.',
    sourceRu: 'Стратегия, съёмочный день, 12 Reels, таргет и ретаргет, связка с CRM',
  },
  {
    itemId: 'gptbot-target-launch', page: 'target', row: 'Запуск',
    title: 'Instagram and Facebook targeted ads — campaign launch',
    includes: 'Audiences, ad creatives, landing page, UTM tags and goals, the first 2 weeks of management; the scope is fixed in a quote.',
    sourceRu: 'Аудитории, креативы, посадочная, UTM и цели, первые 2 недели ведения; объём фиксируется в смете',
  },
  {
    itemId: 'gptbot-target-management', page: 'target', row: 'Ведение',
    title: 'Instagram and Facebook targeted ads — monthly management',
    includes: 'Bid and audience optimisation, creative tests, a cost-per-lead report.',
    sourceRu: 'Оптимизация ставок и аудиторий, тесты креативов, отчёт по стоимости заявки (рекламный бюджет отдельно)',
  },
  {
    itemId: 'gptbot-ppc-launch', page: 'ppc', row: 'Запуск',
    title: 'Google and Yandex search ads — campaign launch',
    includes: 'Keywords and negative keywords, ads, landing page, UTM tags and goals, the first 2 weeks of management; the scope is fixed in a quote.',
    sourceRu: 'Семантика и минус-слова, объявления, посадочная, UTM и цели, первые 2 недели ведения; объём фиксируется в смете',
  },
  {
    itemId: 'gptbot-ppc-management', page: 'ppc', row: 'Ведение',
    title: 'Google and Yandex search ads — monthly management',
    includes: 'Bid and audience optimisation, ad tests, a cost-per-lead report.',
    sourceRu: 'Оптимизация ставок и аудиторий, тесты креативов, отчёт по стоимости заявки (рекламный бюджет отдельно)',
  },
];

// ---------- llms.txt: published starting prices ----------

/** English names of the package rows the feed reads; an unknown row fails the build instead of guessing. */
const PACKAGE_LABELS: Record<string, string> = {
  'Старт': 'Start', 'Бизнес': 'Business', 'Pro': 'Pro', 'Про': 'Pro', 'Поддержка': 'Support',
  'AI-менеджер': 'AI Manager', 'Лендинг': 'Landing page', 'Корпоративный сайт': 'Corporate website',
  'Интернет-магазин': 'Online store', 'Аудит': 'Audit', 'Рост': 'Growth', 'Лидер': 'Leader',
  'Запуск': 'Launch', 'Ведение': 'Management',
};

const SERVICE_NAMES: Record<keyof typeof SERVICE_PAGES, string> = {
  aiBot: 'AI bot for business (Telegram, Instagram, WhatsApp, website)',
  instagram: 'Instagram AI manager (Direct and comments)',
  whatsapp: 'WhatsApp bot for business',
  telegram: 'Telegram bot development',
  web: 'Website development',
  seo: 'SEO',
  smm: 'SMM: Instagram and Telegram management',
  target: 'Instagram and Facebook targeted ads',
  ppc: 'Google and Yandex search ads',
};

/**
 * The llms.txt block of business service prices, read from the same package
 * tables as the product feed, so llms.txt can never quote a stale price.
 * scripts/generate-llm-markdown.ts refreshes it in every build; a test keeps
 * the committed public/llms.txt current.
 */
export function servicePricesManifest(root: string): string {
  const lines = [
    '<!-- service-prices:start -->',
    '## Published starting prices of business services',
    '',
    'Read in every build from the package tables of the service pages, the same source as the product feed. All prices are starting prices ("from"): the final scope and price are fixed in a quote before work starts.',
  ];
  for (const key of Object.keys(SERVICE_PAGES) as Array<keyof typeof SERVICE_PAGES>) {
    const spec: ServicePage = SERVICE_PAGES[key];
    const page = readPage(root, spec.file);
    const items = SERVICE_ITEMS.filter((item) => item.page === key);
    const parts = items.map((item) => {
      const row = packageRow(page, item.row);
      const label = PACKAGE_LABELS[row.name];
      if (!label) throw new Error(`${page.url}: no English label for package «${row.name}»`);
      const days = /^(?:разово, )?(\d+) (?:день|дня|дней)$/u.exec(row.term)?.[1];
      return `${label} from ${groupThousands(row.amountUzs)} UZS${row.monthly ? ' a month' : ''}${days ? ` (timeline ${days} ${days === '1' ? 'day' : 'days'})` : ''}`;
    });
    lines.push(`- ${SERVICE_NAMES[key]} — ${SITE}${page.url}: ${parts.join('; ')}.${spec.notes.length ? ` ${spec.notes.join(' ')}` : ''}`);
  }
  lines.push(
    `- Machine-readable product feed (OpenAI Commerce format, every product with its price and page): ${FEED_GZ_URL} (gzip JSONL), ${FEED_TSV_URL} (TSV).`,
    '<!-- service-prices:end -->',
  );
  return lines.join('\n');
}

export function refreshServicePricesManifest(source: string, root: string): string {
  const marker = /<!-- service-prices:start -->[\s\S]*?<!-- service-prices:end -->/;
  if (!marker.test(source)) throw new Error('llms.txt lacks the service prices block');
  return source.replace(marker, servicePricesManifest(root));
}

// ---------- records ----------

type ImageResolver = (ogImagePath: string) => string;

const base = (
  image: ImageResolver, itemId: string, title: string, description: string, page: PageContent, amountUzs: number, category: string,
): FeedRecord => ({
  item_id: itemId,
  title,
  description,
  url: absolute(page.url),
  brand: BRAND,
  seller_name: BRAND,
  seller_url: `${SITE}/`,
  image_url: absolute(image(new URL(absolute(requireValue(page.ogImage, `${page.url}: no ogImage`))).pathname)),
  price: `${amountUzs} UZS`,
  availability: 'in_stock',
  condition: 'new',
  is_digital: true,
  product_category: category,
  target_countries: ['UZ'],
  store_country: 'UZ',
});

// ---------- feed images ----------

export interface FeedImageEntry {
  /** sha256 of the WebP the copy was made from. */
  sourceSha256: string;
  /** Site path of the JPEG copy, content hash in the name (/assets/* is cached as immutable). */
  jpg: string;
  jpgSha256: string;
  width: number;
  height: number;
}
export type FeedImageLock = Record<string, FeedImageEntry>;

export const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

/** Local file behind a site path: /assets/studio/* is the Studio build (apps/studio/public), the rest is public/. */
export function publicFile(root: string, sitePath: string): string {
  return sitePath.startsWith('/assets/studio/')
    ? path.join(root, 'apps/studio/public', sitePath.slice('/assets/studio/'.length))
    : path.join(root, 'public', sitePath);
}

export function readImageLock(root: string): FeedImageLock {
  const file = path.join(root, FEED_IMAGE_LOCK);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as FeedImageLock : {};
}

/** JPEG and PNG pass through; a WebP resolves to its locked JPEG copy, which must match the current WebP. */
export function lockedImageResolver(root: string, lock: FeedImageLock = readImageLock(root)): ImageResolver {
  return (sitePath) => {
    if (/\.(jpe?g|png)$/i.test(sitePath)) return sitePath;
    if (!/\.webp$/i.test(sitePath)) throw new Error(`og:image ${sitePath} is not JPEG, PNG or WebP`);
    const entry = lock[sitePath];
    if (!entry) throw new Error(`No JPEG copy of ${sitePath} in ${FEED_IMAGE_LOCK}: run npx tsx scripts/build-openai-feed.ts`);
    const source = publicFile(root, sitePath);
    if (!fs.existsSync(source) || sha256(fs.readFileSync(source)) !== entry.sourceSha256) {
      throw new Error(`${sitePath} changed since its JPEG copy was made: run npx tsx scripts/build-openai-feed.ts`);
    }
    if (!fs.existsSync(publicFile(root, entry.jpg))) throw new Error(`JPEG copy ${entry.jpg} is missing: run npx tsx scripts/build-openai-feed.ts`);
    return entry.jpg;
  };
}

/** The WebP og:images the feed needs, by site path. */
export function webpSources(root: string, options: Omit<BuildOptions, 'image'> = {}): string[] {
  const found = new Set<string>();
  buildFeed(root, { ...options, image: (sitePath) => {
    if (/\.webp$/i.test(sitePath)) found.add(sitePath);
    return sitePath.replace(/\.webp$/i, '.jpg');
  } });
  return [...found].sort();
}

function absolute(urlOrPath: string): string {
  if (urlOrPath.startsWith(`${SITE}/`)) return urlOrPath;
  if (urlOrPath.startsWith('/')) return `${SITE}${urlOrPath}`;
  throw new Error(`Not a gptbot.uz URL or root path: ${urlOrPath}`);
}

function requireValue<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null || value === '') throw new Error(message);
  return value;
}

/** First capture group of `re` in the page text; throws when the page does not state it. */
function stated(page: PageContent, re: RegExp, what: string): string {
  const match = re.exec(pageText(page));
  if (!match) throw new Error(`${page.url}: page does not state ${what} (${re})`);
  return match[1];
}

const sentence = (...parts: string[]): string => parts.filter(Boolean).join(' ');

export interface BuiltFeed { records: FeedRecord[]; proofs: PriceProof[] }
export interface BuildOptions {
  includeFreeTrial?: boolean;
  /** Maps an og:image site path to the image the feed links; defaults to the locked JPEG copies. */
  image?: ImageResolver;
}

export function buildFeed(root: string, options: BuildOptions = {}): BuiltFeed {
  const image = options.image ?? lockedImageResolver(root);
  const includeFreeTrial = options.includeFreeTrial ?? INCLUDE_FREE_TRIAL;
  const records: FeedRecord[] = [];
  const proofs: PriceProof[] = [];
  const add = (record: FeedRecord, proof: Omit<PriceProof, 'itemId'>): void => {
    records.push(record);
    proofs.push({ itemId: record.item_id, ...proof });
  };

  // AI chat: trial and packs (functions/lib/gpt-chat via CHAT_FACTS).
  const chat = CHAT_FACTS;
  const trialFile = 'content/pages/uz/gpt-uzbek-tilida.json';
  const trialPage = readPage(root, trialFile);
  if (includeFreeTrial) add({
    ...base(image, FREE_TRIAL_ITEM_ID, `AI chat in Uzbek and Russian — free trial (${chat.trialReplies} replies)`, sentence(
      'AI chat in Uzbek (Latin script) and Russian that works in the browser, without an app.',
      `${chat.trialReplies} free trial replies in total, without registration, card or phone number; they do not renew daily.`,
      'More replies need a paid AI pack.',
      NOT_OPENAI,
    ), trialPage, 0, 'Software > AI Chat'),
    return_policy: OFFER_URL,
  }, { page: trialFile, amountUzs: 0, visible: `${chat.trialReplies} ta bepul sinov javobi` });

  const packFile = 'content/pages/ru/tarify-ai-chat.json';
  const packPage = readPage(root, packFile);
  const packNote = 'One-time payment in the chat, no auto-renewal. The pack can be bought while payment is open in the chat. A paid pack is not refundable, except money charged by mistake.';
  const smallDays = chat.smallHours / 24;
  if (!Number.isInteger(smallDays) || smallDays <= 0) throw new Error(`3-day pack term is not whole days: ${chat.smallHours} h`);
  add({
    ...base(image, 'gptbot-ai-pack-3d', `AI chat pack — ${chat.smallReplies} replies for ${smallDays} days`, sentence(
      `${chat.smallReplies} replies in the GPTBot.uz AI chat (Uzbek and Russian), valid for ${chat.smallHours} hours from confirmed payment.`,
      packNote,
      NOT_OPENAI,
    ), packPage, chat.smallPriceUzs, 'Software > AI Chat'),
    return_policy: OFFER_URL,
    accepts_returns: false,
  }, { page: packFile, amountUzs: chat.smallPriceUzs, visible: `${groupThousands(chat.smallPriceUzs)} сум` });
  add({
    ...base(image, 'gptbot-ai-pack-1m', `AI chat pack — ${chat.replies} replies for one month`, sentence(
      `${chat.replies} replies in the GPTBot.uz AI chat (Uzbek and Russian) for one calendar month from confirmed payment, up to ${chat.dailyReplies} pack replies a day.`,
      packNote,
      NOT_OPENAI,
    ), packPage, chat.priceUzs, 'Software > AI Chat'),
    return_policy: OFFER_URL,
    accepts_returns: false,
  }, { page: packFile, amountUzs: chat.priceUzs, visible: `${groupThousands(chat.priceUzs)} сум` });

  // Studio (functions/lib/studio/plans.ts via STUDIO_FACTS); deck limits as the page states them.
  const studioNote = 'Price includes 12% VAT. The result is a draft: check the facts. GPTBot.uz Studio is an independent service, not an OpenAI product.';
  const dayFile = 'content/studio/pages/uz/taqdimot-ai.json';
  const dayPage = readPage(root, dayFile);
  const day = STUDIO_FACTS.kunlik;
  if (!('hours' in day.duration)) throw new Error('Studio Kunlik is not an hourly plan');
  const daySlides = stated(dayPage, /(\d+) slaydgacha, \d+ rasmgacha/u, 'the full-deck slide limit');
  const dayImages = stated(dayPage, /\d+ slaydgacha, (\d+) rasmgacha/u, 'the full-deck image limit');
  const dayUzs = day.amountTiyin / 100;
  add({
    ...base(image, 'gptbot-studio-day', `GPTBot.uz Studio AI presentation maker — 24-hour plan (${day.presentationFull} full presentation)`, sentence(
      `${day.presentationFull} full AI-generated PowerPoint (.pptx) presentation of up to ${daySlides} slides, with up to ${dayImages} images and speaker notes, in Uzbek or Russian.`,
      `Valid for ${day.duration.hours} hours from confirmed payment.`,
      studioNote,
    ), dayPage, dayUzs, 'Software > AI Presentation Maker'),
    return_policy: OFFER_URL,
  }, { page: dayFile, amountUzs: dayUzs, visible: `Kunlik — ${groupThousands(dayUzs)} so‘m` });

  const monthFile = 'content/studio/pages/ru/prezentatsiya-ai.json';
  const monthPage = readPage(root, monthFile);
  const month = STUDIO_FACTS.oylik;
  const monthSlides = stated(monthPage, /до (\d+) слайдов, до \d+ изображений/u, 'the full-deck slide limit');
  const monthImages = stated(monthPage, /до \d+ слайдов, до (\d+) изображений/u, 'the full-deck image limit');
  const monthUzs = month.amountTiyin / 100;
  add({
    ...base(image, 'gptbot-studio-month', `GPTBot.uz Studio AI presentation maker — monthly plan (${month.presentationFull} full presentations)`, sentence(
      `${month.presentationFull} full AI-generated PowerPoint (.pptx) presentations, each of up to ${monthSlides} slides with up to ${monthImages} images and speaker notes, in Uzbek or Russian.`,
      'Valid for one calendar month from payment.',
      studioNote,
    ), monthPage, monthUzs, 'Software > AI Presentation Maker'),
    return_policy: OFFER_URL,
  }, { page: monthFile, amountUzs: monthUzs, visible: `Oylik — ${groupThousands(monthUzs)} сум` });

  // Agency services: price and term from the page's package table.
  const pages = new Map<string, PageContent>();
  for (const item of SERVICE_ITEMS) {
    const spec: ServicePage = SERVICE_PAGES[item.page];
    const page = pages.get(spec.file) ?? readPage(root, spec.file);
    pages.set(spec.file, page);
    const row = packageRow(page, item.row);
    add(base(image, item.itemId, item.title, sentence(
      item.includes,
      item.extra ?? '',
      termInEnglish(row.term, spec.afterAccess),
      row.monthly ? 'Price per month.' : '',
      STARTING_PRICE,
      ...spec.notes,
      'GPTBot.uz is a team in Tashkent, Uzbekistan.',
    ), page, row.amountUzs, spec.category), { page: spec.file, amountUzs: row.amountUzs, visible: row.priceCell });
  }
  return { records, proofs };
}

/** Records as JSONL: one object per line, fixed key order, trailing newline. */
export function serializeFeed(records: readonly FeedRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

/**
 * The JSONL gzip-compressed. The header carries no file name and mtime 0, and
 * the OS byte is pinned to Unix so Windows and Linux builds agree on the header.
 * Deflate output can still differ between zlib builds, so the writer keeps the
 * committed .gz whenever it decompresses to the current JSONL.
 */
export function gzipFeed(jsonl: string): Buffer {
  const out = zlib.gzipSync(Buffer.from(jsonl, 'utf8'), { level: 9 });
  out[9] = 3;
  return out;
}

export const gunzipText = (data: Buffer): string => zlib.gunzipSync(data).toString('utf8');

/** TSV columns, the FeedRecord fields in feed order. A field missing here fails the build. */
export const TSV_COLUMNS = [
  'item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'seller_url', 'image_url', 'price',
  'availability', 'condition', 'is_digital', 'product_category', 'target_countries', 'store_country',
  'return_policy', 'accepts_returns',
] as const;

/**
 * Records as TSV: UTF-8, header row, one item a line, LF. Arrays are JSON
 * (["UZ"]), booleans true/false, an absent optional field an empty cell (the
 * spec reads an empty delimited cell as no value). A tab or line break inside a
 * value fails the build: TSV has no quoting.
 */
export function serializeTsv(records: readonly FeedRecord[]): string {
  const columns = new Set<string>(TSV_COLUMNS);
  const cell = (id: string, column: string, value: unknown): string => {
    if (value === undefined) return '';
    const text = typeof value === 'string' ? value : typeof value === 'boolean' || typeof value === 'number' ? String(value) : JSON.stringify(value);
    if (/[\t\r\n]/.test(text)) throw new Error(`${id}: ${column} contains a tab or line break`);
    return text;
  };
  const lines = records.map((record) => {
    for (const key of Object.keys(record)) if (!columns.has(key)) throw new Error(`${record.item_id}: field ${key} has no TSV column`);
    const row = record as unknown as Record<string, unknown>;
    return TSV_COLUMNS.map((column) => cell(record.item_id, column, row[column])).join('\t');
  });
  return [TSV_COLUMNS.join('\t'), ...lines].join('\n') + '\n';
}

/** TSV rows back to records (types restored), for the tests and the validator. */
export function parseTsv(text: string): { header: string[]; records: Array<Record<string, unknown>>; errors: string[] } {
  const errors: string[] = [];
  if (text.charCodeAt(0) === 0xfeff) errors.push('TSV starts with a BOM');
  if (text.includes('\r')) errors.push('TSV has CR line endings');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const header = (lines.shift() ?? '').split('\t');
  const records = lines.map((line, index) => {
    const cells = line.split('\t');
    if (cells.length !== header.length) errors.push(`TSV row ${index + 2}: ${cells.length} cells, header has ${header.length}`);
    const record: Record<string, unknown> = {};
    header.forEach((column, i) => {
      const value = cells[i] ?? '';
      if (value === '') return;
      if (column === 'target_countries') {
        try { record[column] = JSON.parse(value); } catch { errors.push(`TSV row ${index + 2}: ${column} is not JSON`); }
      } else if (column === 'is_digital' || column === 'accepts_returns') {
        if (value !== 'true' && value !== 'false') errors.push(`TSV row ${index + 2}: ${column} is not true/false`);
        record[column] = value === 'true';
      } else {
        record[column] = value;
      }
    });
    return record;
  });
  return { header, records, errors };
}

/** The TSV must hold exactly the JSONL records: same ids, order, prices and every other field. */
export function validateTsvText(tsv: string, jsonl: string): string[] {
  const { header, records, errors } = parseTsv(tsv);
  if (JSON.stringify(header) !== JSON.stringify(TSV_COLUMNS)) errors.push('TSV header differs from the column list');
  const expected = jsonl.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
  if (records.length !== expected.length) errors.push(`TSV has ${records.length} rows, JSONL ${expected.length}`);
  expected.forEach((record, i) => {
    if (JSON.stringify(records[i]) !== JSON.stringify(record)) errors.push(`TSV row ${i + 2} (${String(record.item_id)}) differs from the JSONL record`);
  });
  return errors;
}

// ---------- validation ----------

const REQUIRED_FIELDS = [
  'item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'seller_url', 'image_url',
  'availability', 'price', 'target_countries', 'store_country',
] as const;
const IMAGE_EXT_RE = /\.(jpe?g|png)$/i;
const FORBIDDEN_WORDS_RE = /\bofficial\b|\brasmiy\b|официальн/i;

/** Every rule of the task; returns human-readable errors, empty when the feed is valid. */
export function validateFeedText(text: string, options: { includeFreeTrial?: boolean } = {}): string[] {
  const includeFreeTrial = options.includeFreeTrial ?? INCLUDE_FREE_TRIAL;
  const errors: string[] = [];
  if (text.charCodeAt(0) === 0xfeff) errors.push('file starts with a BOM');
  if (!text.endsWith('\n')) errors.push('file does not end with a newline');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const ids = new Set<string>();
  lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
    let record: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      record = parsed as Record<string, unknown>;
    } catch {
      errors.push(`${at}: not a JSON object`);
      return;
    }
    const id = typeof record.item_id === 'string' ? record.item_id : at;
    for (const field of REQUIRED_FIELDS) if (!(field in record)) errors.push(`${id}: missing ${field}`);
    for (const [field, value] of Object.entries(record)) {
      if (value === null || value === '' || (typeof value === 'string' && /^(n\/a|null|undefined|none)$/i.test(value.trim()))) {
        errors.push(`${id}: ${field} is empty or a placeholder`);
      }
      if (Array.isArray(value) && value.length === 0) errors.push(`${id}: ${field} is an empty array`);
    }
    if (typeof record.item_id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(record.item_id)) errors.push(`${id}: bad item_id`);
    else if (ids.has(record.item_id)) errors.push(`${id}: duplicate item_id`);
    else ids.add(record.item_id);
    if (typeof record.title !== 'string' || record.title.length > 150) errors.push(`${id}: title missing or longer than 150`);
    if (typeof record.description !== 'string' || record.description.length > 5000) errors.push(`${id}: description missing or longer than 5000`);
    if (typeof record.description === 'string' && /<[a-z/][^>]*>/i.test(record.description)) errors.push(`${id}: description contains HTML`);
    for (const field of ['title', 'description'] as const) {
      const value = record[field];
      if (typeof value === 'string' && /[Ѐ-ӿ]/.test(value)) errors.push(`${id}: ${field} is not English (Cyrillic found)`);
      if (typeof value === 'string' && FORBIDDEN_WORDS_RE.test(value)) errors.push(`${id}: ${field} says "official"`);
    }
    if (typeof record.price !== 'string' || !/^\d+ UZS$/.test(record.price)) errors.push(`${id}: price is not "<integer> UZS"`);
    if (!AVAILABILITY_VALUES.includes(record.availability as never)) errors.push(`${id}: availability not allowed`);
    for (const field of ['url', 'image_url', 'seller_url', 'return_policy'] as const) {
      if (field in record && (typeof record[field] !== 'string' || !(record[field] as string).startsWith(`${SITE}/`))) {
        errors.push(`${id}: ${field} is not an absolute ${SITE}/ URL`);
      }
    }
    if (typeof record.image_url === 'string' && !IMAGE_EXT_RE.test(record.image_url)) errors.push(`${id}: image_url is not a JPEG or PNG file`);
    if (record.brand !== BRAND || record.seller_name !== BRAND) errors.push(`${id}: brand and seller_name must be ${BRAND}`);
    if (record.seller_url !== `${SITE}/`) errors.push(`${id}: seller_url must be ${SITE}/`);
    if (JSON.stringify(record.target_countries) !== '["UZ"]' || record.store_country !== 'UZ') errors.push(`${id}: country must be UZ`);
    if ('condition' in record && record.condition !== 'new') errors.push(`${id}: condition must be new`);
    if ('is_digital' in record && typeof record.is_digital !== 'boolean') errors.push(`${id}: is_digital must be boolean`);
    if ('accepts_returns' in record && typeof record.accepts_returns !== 'boolean') errors.push(`${id}: accepts_returns must be boolean`);
  });
  for (const locked of LOCKED_ITEM_IDS) if (!ids.has(locked) && (includeFreeTrial || locked !== FREE_TRIAL_ITEM_ID)) errors.push(`${locked}: locked item_id is missing (ids are never removed or renamed)`);
  return errors;
}
