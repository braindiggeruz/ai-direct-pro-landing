/**
 * The HTML of a studio page (STUDIO-SPEC §11.2–§11.4), from its record in
 * content/studio/pages/**.json. Used by prerender-studio.ts (the build) and
 * check-pages.ts (the headless checks render a draft in memory exactly as the
 * release will write it).
 *
 * Every visible word outside the form comes from the record, so the native
 * speaker reads one file per language; the form's words are the island's
 * (src/tools/presentation/texts.ts). The few words of the frame below (skip
 * link, footer labels, language names) are in CHROME.
 *
 * The page:
 *   <head>   title, description, robots, canonical, hreflang only for a
 *            published pair, og/twitter, the site's icons and fonts, the site
 *            stylesheet and then the studio's, the in-app mark (src/inapp.ts
 *            INAPP_HEAD_SCRIPT: <html data-inapp> before the first paint, so
 *            the form's «Brauzerda oching» never shifts it), JSON-LD (Organization from
 *            scripts/jsonld-helpers.ts, so its @id is the site's; WebApplication
 *            free of charge; BreadcrumbList; FAQPage for the visible FAQ), the
 *            first-touch, GA4 and Metrika blocks of the site (no GTM), and the
 *            island's module script.
 *   <body data-studio>
 *            header: GPTBot.uz (→ /uz/, or / on a Russian page; never /ru/,
 *            which is a 301 to /), the published tools (the page's own one
 *            from 640 px: on a phone the breadcrumb and the H1 name it), the
 *            site's AI chat item of the page's language
 *            (src/shared/site-chat-nav.ts: every site header names the chat
 *            once, revision 2026-10-06-seo-push R3-10; shown from 640 px like
 *            the blog header's), a language switch only when the translation
 *            is published; every header link 44 px high and the header one
 *            row on a 320 px phone, so the form keeps its place on the first
 *            screen (device-check.ts: 320 × 568, Telegram's 360 × 612);
 *            breadcrumb (its link 44 px high without moving the H1); the H1
 *            (24 px under 360 px, 26 px under 640 px) and the honesty line;
 *            #studio-root with the form's first state and nothing else; the
 *            text, the FAQ, the links; the footer from
 *            content/global/legal-entity.json with the e-mail behind
 *            <!--email_off-->.
 *
 * Class names here are studio utilities (prefix st): the studio's Tailwind
 * reads this directory (@source "../scripts" in src/styles.css). The root
 * Tailwind never reads apps/, so nothing here can change the site CSS.
 */
import { ANALYTICS_HEAD } from '../../../scripts/analytics-snippet';
import { METRIKA_HEAD, METRIKA_NOSCRIPT } from '../../../scripts/analytics-metrika';
import { FIRST_TOUCH_SCRIPT } from '../../../scripts/attribution-snippet';
import { withEmailOff } from '../../../scripts/email-off';
import { buildBreadcrumbLd, buildOrganizationLd } from '../../../scripts/jsonld-helpers';
import { SITE_CHAT_NAV } from '../../../src/shared/site-chat-nav';
import type { GlobalSEO } from '../../../src/shared/types';
import { INAPP_HEAD_SCRIPT } from '../src/inapp';
import { renderForm } from '../src/tools/presentation/static';
import { studioAlternates, type StudioLocale, type StudioPageRecord } from '../shared/published-urls';

/** Visible words outside the island, at least (§11.3). */
export const MIN_WORDS_OUTSIDE_ISLAND = 400;
/** The site's audit ranges (src/shared/audit.ts RULES), applied to the studio pages too. */
export const TITLE_LENGTH = { min: 45, max: 65 } as const;
export const DESCRIPTION_LENGTH = { min: 120, max: 160 } as const;
export const FAQ_COUNT = { min: 5, max: 6 } as const;
export const ROBOTS = 'index, follow, max-image-preview:large';
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
/** Words no studio page may use: no unlimited plan, nothing "official" (STUDIO-SPEC §1.3 item 11). */
export const FORBIDDEN_WORDS: readonly RegExp[] = [/cheksiz/i, /безлимит/i, /rasmiy/i, /официальн/i, /\bofficial\b/i];
export const OG_IMAGE_PATH = /^\/assets\/studio\/og-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+\.png$/;

export interface StudioLink {
  token: string;
  target: string;
  anchor: string;
}

/** A paragraph: plain text, or text with {token}s that become links. */
export type StudioParagraph = string | { text: string; links: StudioLink[] };

export interface StudioSection {
  id: string;
  h2: string;
  steps?: Array<{ title: string; text: string }>;
  items?: string[];
  paragraphs?: StudioParagraph[];
}

export interface StudioPageContent {
  url: string;
  locale: StudioLocale;
  tool: 'presentation';
  toolName: string;
  title: string;
  h1: string;
  description: string;
  honesty: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  hreflangRu?: string;
  hreflangUz?: string;
  tariffsVisible: false;
  ogImage: string;
  ogImageAlt: string;
  lead: string;
  sections: StudioSection[];
  faqTitle: string;
  faq: Array<{ q: string; a: string }>;
  links: { text: string; links: StudioLink[] };
  business: { text: string; links: StudioLink[] };
  createdAt: string;
  updatedAt: string;
}

const KEYS = new Set([
  'status', 'locale', 'url', 'tool', 'toolName', 'title', 'h1', 'description', 'honesty', 'primaryKeyword',
  'secondaryKeywords', 'hreflangRu', 'hreflangUz', 'tariffsVisible', 'ogImage', 'ogImageAlt', 'lead', 'sections',
  'faqTitle', 'faq', 'links', 'business', 'createdAt', 'updatedAt',
]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /\{([a-z0-9]+)\}/g;

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length > 0;

/** Every string of a record, for the word and spelling checks. */
export function recordStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(recordStrings);
  if (value && typeof value === 'object') {
    return Object.entries(value).filter(([key]) => !key.startsWith('_')).flatMap(([, item]) => recordStrings(item));
  }
  return [];
}

function linkProblems(where: string, paragraph: unknown): string[] {
  if (typeof paragraph === 'string') {
    return isText(paragraph) && !paragraph.includes('{') ? [] : [`${where}: empty text or a {token} without links`];
  }
  const { text, links } = (paragraph ?? {}) as { text?: unknown; links?: unknown };
  if (!isText(text) || !Array.isArray(links) || !links.length) return [`${where}: text with links needs text and links`];
  const problems: string[] = [];
  const tokens = [...text.matchAll(TOKEN)].map((match) => match[1]);
  const named = links.map((link) => (link as StudioLink)?.token);
  if (new Set(tokens).size !== tokens.length) problems.push(`${where}: a {token} is used twice`);
  if ([...tokens].sort().join() !== [...named].sort().join()) problems.push(`${where}: the {tokens} and the links do not match`);
  if (text.replace(TOKEN, '').match(/[{}]/)) problems.push(`${where}: a stray brace`);
  for (const link of links as StudioLink[]) {
    if (!isText(link?.anchor)) problems.push(`${where}: a link without an anchor`);
    if (typeof link?.target !== 'string' || !/^\/(?:[a-z0-9-]+\/)*$/.test(link.target)) problems.push(`${where}: link target ${String(link?.target)} is not a site path`);
  }
  return problems;
}

/**
 * Why the record cannot be rendered, every reason at once; empty when it can.
 * Drafts are checked too: the build refuses a malformed draft long before the
 * release that would publish it.
 */
export function studioPageProblems(page: StudioPageRecord): string[] {
  const data = page.data;
  const problems: string[] = [];
  for (const key of Object.keys(data)) if (!key.startsWith('_') && !KEYS.has(key)) problems.push(`unknown field ${key}`);
  for (const field of ['toolName', 'title', 'h1', 'description', 'honesty', 'primaryKeyword', 'ogImageAlt', 'lead', 'faqTitle']) {
    if (!isText(data[field])) problems.push(`${field} is required`);
  }
  if (data.tool !== 'presentation') problems.push('tool must be "presentation" (the photo page arrives with its own tool)');
  if (isText(data.title) && (data.title.length < TITLE_LENGTH.min || data.title.length > TITLE_LENGTH.max)) {
    problems.push(`title is ${data.title.length} characters, expected ${TITLE_LENGTH.min}–${TITLE_LENGTH.max}`);
  }
  if (isText(data.description) && (data.description.length < DESCRIPTION_LENGTH.min || data.description.length > DESCRIPTION_LENGTH.max)) {
    problems.push(`description is ${data.description.length} characters, expected ${DESCRIPTION_LENGTH.min}–${DESCRIPTION_LENGTH.max}`);
  }
  if (isText(data.honesty) && !['GPTBot.uz', 'ChatGPT', 'OpenAI'].every((name) => (data.honesty as string).includes(name))) {
    problems.push('honesty must name GPTBot.uz, ChatGPT and OpenAI');
  }
  if (!Array.isArray(data.secondaryKeywords) || !data.secondaryKeywords.every(isText)) problems.push('secondaryKeywords must be a list of phrases');
  if (data.tariffsVisible !== false) problems.push('tariffsVisible must be false: the tariffs section ships with offer v3 (T5.1)');
  if (typeof data.ogImage !== 'string' || !OG_IMAGE_PATH.test(data.ogImage)) problems.push('ogImage must be a versioned /assets/studio/og-*-vN.png');
  for (const [field, locale] of [['hreflangRu', 'ru'], ['hreflangUz', 'uz']] as const) {
    const value = data[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.startsWith(`/${locale}/`)) problems.push(`${field} must be a /${locale}/ URL`);
    else if (locale === page.locale && value !== page.url) problems.push(`${field} must be the page's own URL`);
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (typeof data[field] !== 'string' || !DAY.test(data[field] as string)) problems.push(`${field} must be YYYY-MM-DD`);
  }
  const sections = data.sections;
  if (!Array.isArray(sections) || sections.length < 3) problems.push('sections: at least three');
  else {
    const ids = new Set<string>();
    sections.forEach((section: StudioSection, i) => {
      const where = `sections[${i}]`;
      if (!section || typeof section.id !== 'string' || !SLUG.test(section.id) || ids.has(section.id)) problems.push(`${where}: a unique slug id`);
      else ids.add(section.id);
      if (!isText(section?.h2)) problems.push(`${where}: h2 is required`);
      const kinds = (['steps', 'items', 'paragraphs'] as const).filter((kind) => section?.[kind] !== undefined);
      if (kinds.length !== 1) problems.push(`${where}: exactly one of steps, items, paragraphs`);
      if (section?.steps !== undefined && (!Array.isArray(section.steps) || section.steps.length < 2
        || !section.steps.every((step) => isText(step?.title) && isText(step?.text)))) problems.push(`${where}: steps need a title and a text each`);
      if (section?.items !== undefined && (!Array.isArray(section.items) || section.items.length < 2 || !section.items.every(isText))) {
        problems.push(`${where}: items are phrases`);
      }
      if (section?.paragraphs !== undefined) {
        if (!Array.isArray(section.paragraphs) || !section.paragraphs.length) problems.push(`${where}: paragraphs are a list`);
        else section.paragraphs.forEach((paragraph, j) => problems.push(...linkProblems(`${where}.paragraphs[${j}]`, paragraph)));
      }
    });
  }
  const faq = data.faq;
  if (!Array.isArray(faq) || faq.length < FAQ_COUNT.min || faq.length > FAQ_COUNT.max) problems.push(`faq: ${FAQ_COUNT.min}–${FAQ_COUNT.max} questions`);
  else if (!faq.every((item) => isText(item?.q) && isText(item?.a))) problems.push('faq: every entry needs q and a');
  problems.push(...linkProblems('links', data.links), ...linkProblems('business', data.business));

  const strings = recordStrings(data);
  for (const word of FORBIDDEN_WORDS) {
    const found = strings.find((value) => word.test(value));
    if (found) problems.push(`forbidden word ${word} in «${found.slice(0, 60)}»`);
  }
  if (page.locale === 'uz') {
    // Uzbek Latin as on the site: ‘ (U+2018) in o‘ and g‘, ’ (U+2019) for the tutuq belgisi.
    for (const value of strings) {
      if (/['ʻʼ`]/.test(value)) problems.push(`uz: ASCII or modifier apostrophe in «${value.slice(0, 60)}»`);
      if (/[OoGg]’/.test(value)) problems.push(`uz: o’/g’ must be o‘/g‘ in «${value.slice(0, 60)}»`);
      if (/[Ѐ-ӿ]/.test(value)) problems.push(`uz: Cyrillic in «${value.slice(0, 60)}»`);
    }
  }
  return problems;
}

/** The record as typed content; throws with every problem. */
export function studioPageContent(page: StudioPageRecord): StudioPageContent {
  const problems = studioPageProblems(page);
  if (problems.length) throw new Error(`${page.file}: not a renderable studio page:\n  ${problems.join('\n  ')}`);
  return page.data as unknown as StudioPageContent;
}

// --- rendering --------------------------------------------------------------------

export const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The frame's words. Everything a reader sees besides these is in the page record. */
export const CHROME = {
  uz: {
    home: '/uz/',
    skip: 'Asosiy qismga o‘tish',
    tools: 'Vositalar',
    breadcrumb: 'Sahifa yo‘li',
    language: 'O‘zbekcha',
    taxId: 'STIR',
    privacy: { label: 'Maxfiylik siyosati', href: '/uz/maxfiylik-siyosati/' },
    ogLocale: 'uz_UZ',
    fonts: ['/assets/fonts/geist-latin-wght-normal.woff2'],
  },
  ru: {
    home: '/',
    skip: 'Перейти к основному содержанию',
    tools: 'Инструменты',
    breadcrumb: 'Навигационная цепочка',
    language: 'Русский',
    taxId: 'СТИР (ИНН)',
    privacy: { label: 'Политика конфиденциальности', href: '/ru/politika-konfidentsialnosti/' },
    ogLocale: 'ru_RU',
    fonts: ['/assets/fonts/geist-cyrillic-wght-normal.woff2', '/assets/fonts/geist-latin-wght-normal.woff2'],
  },
} as const;

/** The parts of content/global/site.json and legal-entity.json the page needs. */
export interface StudioSiteContext {
  global: GlobalSEO;
  phone: string;
  email: string;
  entity: { shortName: Record<StudioLocale, string>; stir: string };
}

export interface StudioRenderContext {
  site: StudioSiteContext;
  /** Every studio record: the header lists the published tools, the switch needs the published translation. */
  pages: readonly StudioPageRecord[];
  siteStyles: readonly string[];
  assets: { script: string; styles: readonly string[] };
  /** The form's first state; renderForm(locale) unless a test supplies its own. */
  islandHtml?: string;
}

const LINK = 'st:text-studio-cyan st:underline st:underline-offset-2 st:hover:text-studio-text';

/**
 * A link that stands alone (header, footer) is at least 44 px high, the touch
 * target of device-check.ts; links inside a sentence (LINK) are not, as WCAG
 * 2.5.8 excepts them. TAP_FROM_SM: the same, shown from 640 px only.
 */
const TAP = 'st:inline-flex st:min-h-11 st:items-center';
const TAP_FROM_SM = 'st:hidden st:min-h-11 st:items-center st:sm:inline-flex';

function paragraphHtml(paragraph: StudioParagraph): string {
  if (typeof paragraph === 'string') return escapeHtml(paragraph);
  const byToken = new Map(paragraph.links.map((link) => [link.token, link]));
  return paragraph.text.split(TOKEN).map((part, i) => {
    if (i % 2 === 0) return escapeHtml(part);
    const link = byToken.get(part) as StudioLink;
    return `<a href="${escapeHtml(link.target)}" class="${LINK}">${escapeHtml(link.anchor)}</a>`;
  }).join('');
}

function sectionHtml(section: StudioSection): string {
  const heading = `<h2 id="${section.id}-title" class="st:text-xl st:font-semibold st:leading-snug st:text-studio-text st:sm:text-2xl">${escapeHtml(section.h2)}</h2>`;
  let body = '';
  if (section.steps) {
    body = `<ol class="st:mt-4 st:space-y-4">${section.steps.map((step, i) => `<li class="st:flex st:gap-3">`
      + `<span aria-hidden="true" class="st:flex st:size-8 st:shrink-0 st:items-center st:justify-center st:rounded-full st:border st:border-studio-line st:bg-studio-surface st:text-sm st:font-semibold st:text-studio-cyan">${i + 1}</span>`
      + `<div><h3 class="st:text-lg st:font-semibold st:text-studio-text">${escapeHtml(step.title)}</h3>`
      + `<p class="st:mt-1 st:text-base st:leading-relaxed st:text-studio-muted">${escapeHtml(step.text)}</p></div></li>`).join('')}</ol>`;
  } else if (section.items) {
    body = `<ul class="st:mt-4 st:list-disc st:space-y-2 st:pl-5 st:text-base st:leading-relaxed st:text-studio-muted st:marker:text-studio-cyan">${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  } else if (section.paragraphs) {
    body = section.paragraphs.map((paragraph) => `<p class="st:mt-4 st:text-base st:leading-relaxed st:text-studio-muted">${paragraphHtml(paragraph)}</p>`).join('');
  }
  return `<section id="${section.id}" aria-labelledby="${section.id}-title" class="st:mt-12">${heading}${body}</section>`;
}

/** The JSON-LD graph of a studio page, with < escaped so no string can close the script. */
export function studioJsonLd(content: StudioPageContent, global: GlobalSEO): string {
  const pageUrl = `${global.siteUrl}${content.url}`;
  const graph = [
    buildOrganizationLd(global),
    {
      '@type': 'WebApplication',
      '@id': `${pageUrl}#app`,
      name: content.toolName,
      url: pageUrl,
      description: content.description,
      inLanguage: content.locale,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      // Before offer v3 the tool is free only (§11.3); the tariff range arrives with tariffsVisible.
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'UZS' },
      provider: { '@id': `${global.siteUrl}/#org` },
    },
    buildBreadcrumbLd([
      { name: global.siteName, item: `${global.siteUrl}${CHROME[content.locale].home}` },
      { name: content.toolName, item: pageUrl },
    ]),
    {
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      mainEntity: content.faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/** The whole page, e-mail addresses already behind <!--email_off-->. */
export function renderStudioPage(page: StudioPageRecord, context: StudioRenderContext): string {
  const content = studioPageContent(page);
  const { global } = context.site;
  const chrome = CHROME[content.locale];
  const pageUrl = `${global.siteUrl}${content.url}`;
  const alternates = studioAlternates(page, context.pages);
  const ogImage = `${global.siteUrl}${content.ogImage}`;
  const island = context.islandHtml ?? renderForm(content.locale);
  const tools = context.pages
    .filter((other) => other.locale === content.locale && (other.status === 'published' || other.url === page.url))
    .map((other) => {
      const current = other.url === page.url;
      const name = typeof other.data.toolName === 'string' ? other.data.toolName : other.url;
      return `<a href="${escapeHtml(other.url)}"${current ? ' aria-current="page"' : ''} class="${current ? `${TAP_FROM_SM} st:font-semibold st:text-studio-text` : `${TAP} st:text-studio-muted st:hover:text-studio-text`}">${escapeHtml(name)}</a>`;
    });
  const chat = SITE_CHAT_NAV[content.locale];
  const chatItem = `<a href="${escapeHtml(chat.href)}" class="${TAP_FROM_SM} st:text-studio-muted st:hover:text-studio-text">${escapeHtml(chat.label)}</a>`;
  const other = alternates ? (content.locale === 'uz' ? { url: alternates.ru, locale: 'ru' as const } : { url: alternates.uz, locale: 'uz' as const }) : null;
  const languageSwitch = other
    ? `<a href="${escapeHtml(other.url)}" hreflang="${other.locale}" lang="${other.locale}" class="st:ml-auto ${TAP} st:rounded-lg st:border st:border-studio-line st:px-3 st:text-sm st:text-studio-muted st:hover:text-studio-text">${escapeHtml(CHROME[other.locale].language)}</a>`
    : '';
  const hreflang = alternates
    ? [`<link rel="alternate" hreflang="ru" href="${escapeHtml(global.siteUrl + alternates.ru)}" />`,
      `<link rel="alternate" hreflang="uz" href="${escapeHtml(global.siteUrl + alternates.uz)}" />`,
      `<link rel="alternate" hreflang="x-default" href="${escapeHtml(global.siteUrl + alternates.xDefault)}" />`].join('\n')
    : '';
  const stylesheets = [...context.siteStyles, ...context.assets.styles]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join('\n');
  const fonts = chrome.fonts.map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`).join('\n');
  const phoneDisplay = formatPhone(context.site.phone);

  const html = `<!doctype html>
<html lang="${content.locale}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#05070D" />
<title>${escapeHtml(content.title)}</title>
<meta name="description" content="${escapeHtml(content.description)}" />
<meta name="robots" content="${ROBOTS}" />
<link rel="canonical" href="${escapeHtml(pageUrl)}" />
${hreflang}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(global.siteName)}" />
<meta property="og:locale" content="${chrome.ogLocale}" />
<meta property="og:url" content="${escapeHtml(pageUrl)}" />
<meta property="og:title" content="${escapeHtml(content.title)}" />
<meta property="og:description" content="${escapeHtml(content.description)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="${OG_IMAGE_SIZE.width}" />
<meta property="og:image:height" content="${OG_IMAGE_SIZE.height}" />
<meta property="og:image:alt" content="${escapeHtml(content.ogImageAlt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(content.title)}" />
<meta name="twitter:description" content="${escapeHtml(content.description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
${fonts}
<link rel="icon" type="image/webp" sizes="80x80" href="/assets/landing/logo-sq-80.webp" />
<link rel="icon" type="image/png" sizes="96x96" href="/assets/landing/logo-sq-96.png" />
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
${stylesheets}
<script>${INAPP_HEAD_SCRIPT}</script>
<script type="application/ld+json">${studioJsonLd(content, global)}</script>
${FIRST_TOUCH_SCRIPT}
${ANALYTICS_HEAD}
${METRIKA_HEAD}
<script type="module" src="${escapeHtml(context.assets.script)}"></script>
</head>
<body data-studio class="st:min-h-screen st:bg-studio-bg st:text-studio-text st:antialiased">
<a href="#main" class="st:sr-only st:focus:not-sr-only st:focus:absolute st:focus:left-2 st:focus:top-2 st:focus:z-50 st:focus:rounded-lg st:focus:bg-studio-text st:focus:px-4 st:focus:py-3 st:focus:text-studio-bg">${escapeHtml(chrome.skip)}</a>
${METRIKA_NOSCRIPT}
<header class="st:border-b st:border-studio-line">
<div class="st:mx-auto st:flex st:max-w-3xl st:flex-wrap st:items-center st:gap-x-5 st:gap-y-2 st:px-4 st:py-1.5 st:sm:px-6">
<a href="${chrome.home}" class="${TAP} st:text-base st:font-semibold st:text-studio-text">${escapeHtml(global.siteName)}</a>
<nav aria-label="${escapeHtml(chrome.tools)}" class="st:flex st:flex-wrap st:gap-x-4 st:text-sm">${tools.join('')}${chatItem}</nav>
${languageSwitch}
</div>
</header>
<main id="main" class="st:mx-auto st:max-w-3xl st:px-4 st:pb-16 st:pt-4 st:sm:px-6">
<nav aria-label="${escapeHtml(chrome.breadcrumb)}" class="st:text-sm st:text-studio-muted"><ol class="st:flex st:flex-wrap st:gap-x-2"><li><a href="${chrome.home}" class="st:-my-3 st:flex st:min-h-11 st:items-center st:hover:text-studio-text">${escapeHtml(global.siteName)}</a></li><li aria-hidden="true">›</li><li aria-current="page">${escapeHtml(content.toolName)}</li></ol></nav>
<h1 class="st:mt-3 st:text-2xl st:font-bold st:leading-tight st:text-studio-text st:min-[360px]:text-[1.625rem] st:sm:text-4xl">${escapeHtml(content.h1)}</h1>
<p data-studio-honesty class="st:mt-2 st:text-sm st:text-studio-muted">${escapeHtml(content.honesty)}</p>
<div id="studio-root" data-tool="${content.tool}" class="st:mt-5">${island}</div>
<p class="st:mt-10 st:text-base st:leading-relaxed st:text-studio-text">${escapeHtml(content.lead)}</p>
${content.sections.map(sectionHtml).join('\n')}
<section id="faq" aria-labelledby="faq-title" class="st:mt-12">
<h2 id="faq-title" class="st:text-xl st:font-semibold st:leading-snug st:text-studio-text st:sm:text-2xl">${escapeHtml(content.faqTitle)}</h2>
${content.faq.map((item) => `<div class="st:mt-4 st:rounded-2xl st:border st:border-studio-line st:bg-studio-surface st:p-4"><h3 class="st:text-lg st:font-semibold st:text-studio-text">${escapeHtml(item.q)}</h3><p class="st:mt-2 st:text-base st:leading-relaxed st:text-studio-muted">${escapeHtml(item.a)}</p></div>`).join('\n')}
</section>
<p class="st:mt-12 st:text-base st:leading-relaxed st:text-studio-muted">${paragraphHtml(content.links)}</p>
<p class="st:mt-4 st:text-sm st:text-studio-muted">${paragraphHtml(content.business)}</p>
</main>
<footer class="st:border-t st:border-studio-line">
<div class="st:mx-auto st:max-w-3xl st:space-y-1 st:px-4 st:py-8 st:text-sm st:text-studio-muted st:sm:px-6">
<p>${escapeHtml(context.site.entity.shortName[content.locale])} · ${escapeHtml(chrome.taxId)} ${escapeHtml(context.site.entity.stir)}</p>
<p class="st:flex st:flex-wrap st:gap-x-4"><a href="tel:${escapeHtml(context.site.phone)}" class="${TAP} st:hover:text-studio-text">${escapeHtml(phoneDisplay)}</a><a href="mailto:${escapeHtml(context.site.email)}" class="${TAP} st:hover:text-studio-text">${escapeHtml(context.site.email)}</a><a href="${chrome.privacy.href}" class="${TAP} st:hover:text-studio-text">${escapeHtml(chrome.privacy.label)}</a></p>
</div>
</footer>
</body>
</html>
`;
  return withEmailOff(html, content.url);
}

/** "+998505870720" → "+998 50 587 07 20" (as src/shared/studio-contact.ts formats it). */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('998')
    ? `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`
    : raw.trim();
}

// --- reading the HTML back (build checks and tests) --------------------------------

/** [start, end) of the element that opens at `start` (a <div>), by counting nested divs. */
function divExtent(html: string, start: number): number {
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  throw new Error('Unclosed <div id="studio-root">.');
}

/** The inner HTML of #studio-root, or null when the page has none. */
export function islandHtmlOf(html: string): string | null {
  const open = /<div id="studio-root"[^>]*>/.exec(html);
  if (!open) return null;
  const end = divExtent(html, open.index);
  return html.slice(open.index + open[0].length, end - '</div>'.length);
}

const WORD = /[\p{L}\p{N}]+(?:[‘’'-][\p{L}\p{N}]+)*/gu;

/** Visible text of the body without the island: no scripts, styles, noscript or comments. */
export function textOutsideIsland(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  const open = /<div id="studio-root"[^>]*>/.exec(body);
  const outside = open ? body.slice(0, open.index) + body.slice(divExtent(body, open.index)) : body;
  return outside
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export const countWords = (text: string): number => (text.match(WORD) ?? []).length;
