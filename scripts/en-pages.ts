// The English layer of gptbot.uz (/en/), AI-visibility wave 1c (owner's brief of
// 23.11.2026; docs/seo/research/2026-11-23-ai-visibility). Assistants search in
// English ("free uzbek ai chat", "how to pay for chatgpt plus in uzbekistan",
// "ai chatbot development company in tashkent") and cite English pages.
//
// These pages live beside the ru/uz content system, the way Studio pages do:
// prerender.ts, the homepage lists, the demand gate and the LLM twins only read
// content/pages and content/blog, so nothing there changes. All six pages are
// informational. Every number is read from the same sources as the product
// feed and llms.txt (chat packs, Studio plans, the service pages' package
// tables), so an English page cannot quote a price the site does not show.
//
// hreflang: an English page joins an existing RU/UZ pair only where both
// members are unprotected (EN_ALTERNATES, scripts/en-alternates.ts); the
// protected chats keep A14 and the Studio pair keeps its own alternates, so
// those English pages stand alone and link to the Uzbek and Russian versions.
import fs from 'node:fs';
import path from 'node:path';

import type { BodyBlock, FaqItem, SourceReference } from '../src/shared/types';
import { STUDIO_EMAIL, STUDIO_TELEGRAM_HANDLE, STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';
import {
  groupThousands, PACKAGE_LABELS, packageRow, pageText, readPage, SERVICE_ITEMS, SERVICE_NAMES, SERVICE_PAGES, termInEnglish,
} from './openai-feed';
import { enDistFile } from './en-alternates';
import { CHAT_FACTS, STUDIO_FACTS } from './product-facts';

export { EN_ALTERNATES, enAlternateOf, enDistFile } from './en-alternates';

export const EN_SITE = 'https://gptbot.uz';
export const EN_REVIEWED_AT = '2026-11-23';

export interface EnPage {
  url: string;
  title: string;
  description: string;
  h1: string;
  breadcrumb: string;
  /** Answer-first opening paragraph. */
  intro: string;
  blocks: BodyBlock[];
  faq: FaqItem[];
  sources?: SourceReference[];
  /** JSON-LD main entity: AboutPage for the entity page, Article for guides. */
  kind: 'about' | 'article';
  datePublished: string;
  dateModified: string;
  ogImage: string;
  /** The unprotected RU/UZ pair this page joins in hreflang. */
  alternates?: { ru: string; uz: string };
  /** A page without alternates: the RU/UZ pages its language switch leads to (links for people, no hreflang). */
  switchTo?: { ru: string; uz: string };
}

const uzs = (n: number): string => `${groupThousands(n)} UZS`;

interface Facts {
  address: string;
  telegramHandle: string;
  telegramUrl: string;
  email: string;
  chat: typeof CHAT_FACTS;
  studio: { kunlikUzs: number; kunlikDecks: number; kunlikHours: number; oylikUzs: number; oylikDecks: number; freeSlides: number; freePerDay: number; fullSlides: number; fullImages: number };
  aiBot: Array<{ label: string; includes: string; term: string; amountUzs: number; monthly: boolean }>;
  services: Array<{ name: string; url: string; from: string; notes: string }>;
}

function stated(text: string, re: RegExp, what: string): number {
  const match = re.exec(text);
  if (!match) throw new Error(`EN pages: the Studio page does not state ${what} (${re})`);
  return Number(match[1]);
}

export function enFacts(root: string): Facts {
  const site = JSON.parse(fs.readFileSync(path.join(root, 'content/global/site.json'), 'utf8')) as { address: string };
  if (!STUDIO_TELEGRAM_URL || !STUDIO_TELEGRAM_HANDLE || !STUDIO_EMAIL) throw new Error('EN pages: studio contact is not configured');
  const studioRu = pageText(readPage(root, 'content/studio/pages/ru/prezentatsiya-ai.json'));
  const kunlik = STUDIO_FACTS.kunlik;
  const oylik = STUDIO_FACTS.oylik;
  if (!('hours' in kunlik.duration)) throw new Error('EN pages: Studio Kunlik is not an hourly plan');
  const aiBotPage = readPage(root, SERVICE_PAGES.aiBot.file);
  const aiBot = SERVICE_ITEMS.filter((item) => item.page === 'aiBot').map((item) => {
    const row = packageRow(aiBotPage, item.row);
    const label = PACKAGE_LABELS[row.name];
    if (!label) throw new Error(`EN pages: no English label for «${row.name}»`);
    return { label, includes: item.includes, term: termInEnglish(row.term, SERVICE_PAGES.aiBot.afterAccess), amountUzs: row.amountUzs, monthly: row.monthly };
  });
  const services = (Object.keys(SERVICE_PAGES) as Array<keyof typeof SERVICE_PAGES>).filter((key) => key !== 'aiBot').map((key) => {
    const page = readPage(root, SERVICE_PAGES[key].file);
    const parts = SERVICE_ITEMS.filter((item) => item.page === key).map((item) => {
      const row = packageRow(page, item.row);
      return `${PACKAGE_LABELS[row.name]} from ${uzs(row.amountUzs)}${row.monthly ? ' a month' : ''}`;
    });
    return { name: SERVICE_NAMES[key], url: page.url, from: parts.join('; '), notes: SERVICE_PAGES[key].notes.join(' ') };
  });
  return {
    address: site.address,
    telegramHandle: STUDIO_TELEGRAM_HANDLE,
    telegramUrl: STUDIO_TELEGRAM_URL,
    email: STUDIO_EMAIL,
    chat: CHAT_FACTS,
    studio: {
      kunlikUzs: kunlik.amountTiyin / 100,
      kunlikDecks: kunlik.presentationFull,
      kunlikHours: kunlik.duration.hours,
      oylikUzs: oylik.amountTiyin / 100,
      oylikDecks: oylik.presentationFull,
      freePerDay: stated(studioRu, /Бесплатный пример — (\d+) в сутки, до \d+ слайдов/u, 'free samples a day'),
      freeSlides: stated(studioRu, /Бесплатный пример — \d+ в сутки, до (\d+) слайдов/u, 'the free sample slide limit'),
      fullSlides: stated(studioRu, /до (\d+) слайдов, до \d+ изображений/u, 'the full-deck slide limit'),
      fullImages: stated(studioRu, /до \d+ слайдов, до (\d+) изображений/u, 'the full-deck image limit'),
    },
    aiBot,
    services,
  };
}

const NOT_OPENAI = 'GPTBot.uz is an independent service: it is not ChatGPT and not an OpenAI product.';
const IMG = `${EN_SITE}/assets/landing/og.jpg`;

export function enPages(root: string): EnPage[] {
  const f = enFacts(root);
  const c = f.chat;
  const smallDays = c.smallHours / 24;
  const packLine = `${c.smallReplies} replies for ${c.smallHours} hours for ${uzs(c.smallPriceUzs)}, or ${c.replies} replies for one calendar month (up to ${c.dailyReplies} a day) for ${uzs(c.priceUzs)}`;
  const start = f.aiBot[0];
  const perDay = f.studio.freePerDay === 1 ? 'once a day' : `${f.studio.freePerDay} times a day`;
  const d = EN_REVIEWED_AT;

  const about: EnPage = {
    url: '/en/',
    title: 'About GPTBot.uz: Uzbek AI chat, Studio and AI bots | GPTBot.uz',
    description: `GPTBot.uz is an independent AI chat in Uzbek and Russian with ${c.trialReplies} free trial replies, an AI presentation maker and a Tashkent team that builds AI bots and websites.`,
    h1: 'GPTBot.uz: an independent AI chat in Uzbek and Russian, and a Tashkent team that builds AI bots',
    breadcrumb: 'About',
    intro: `GPTBot.uz is an AI chat in Uzbek (Latin script) and Russian with ${c.trialReplies} free trial replies and no registration, an AI presentation maker for PowerPoint (Studio), and a team in Tashkent that builds AI bots, websites, SEO and advertising for businesses in Uzbekistan. ${NOT_OPENAI}`,
    blocks: [
      { type: 'h2', text: 'Key facts' },
      { type: 'list', items: [
        `Team in Tashkent; studio address: ${f.address}; working hours Monday to Saturday, 10:00–19:00 (Asia/Tashkent).`,
        `AI chat in Uzbek and Russian: ${c.trialReplies} free trial replies in total, without registration, card or phone number; then an AI pack: ${packLine}, paid once via Click or Payme.`,
        `Studio drafts PowerPoint (.pptx) presentations from a topic: a free sample ${perDay}, full presentations under the Kunlik plan (${uzs(f.studio.kunlikUzs)}) and the Oylik plan (${uzs(f.studio.oylikUzs)}).`,
        `For businesses: AI bots for Telegram, Instagram Direct, WhatsApp and websites (one channel from ${uzs(start.amountUzs)}), websites, SEO, SMM and advertising. Starting prices are published on the service pages; the final price is fixed in a quote before work starts.`,
        `Contact: Telegram ${f.telegramHandle} or ${f.email}. ${NOT_OPENAI}`,
      ] },
      { type: 'h2', text: 'What GPTBot.uz offers' },
      { type: 'table', headers: ['Product', 'What it is', 'Price', 'Page'], rows: [
        ['AI chat', `Chat in Uzbek or Russian in the browser; ${c.trialReplies} free trial replies`, `AI packs: ${uzs(c.smallPriceUzs)} or ${uzs(c.priceUzs)}`, 'gptbot.uz/uz/gpt-uzbek-tilida/'],
        ['Studio', 'AI presentation maker for PowerPoint (.pptx)', `Kunlik ${uzs(f.studio.kunlikUzs)}; Oylik ${uzs(f.studio.oylikUzs)}`, 'gptbot.uz/uz/taqdimot-ai/'],
        ['AI bots for business', 'Bots that answer customers from a knowledge base and pass leads to a manager or CRM', `From ${uzs(start.amountUzs)}`, 'gptbot.uz/ru/ai-bot-dlya-biznesa/'],
        ['Websites, SEO, SMM, ads', 'Projects for businesses in Uzbekistan', 'Starting prices on each service page', 'gptbot.uz/ru/razrabotka-saytov-tashkent/'],
      ] },
      { type: 'h2', text: 'Where to start' },
      { type: 'linkp', text: 'Uzbek AI chat: {chat}. Presentations: {studio}. AI bots for a business: {bots}. How AI chats for Uzbek users compare: {compare}. Paying for ChatGPT, Claude or Gemini from Uzbekistan: {pay}.', links: [
        { token: 'chat', target: '/en/uzbek-ai-chat/', anchor: 'free Uzbek AI chat' },
        { token: 'studio', target: '/en/ai-presentation-maker/', anchor: 'AI presentation maker' },
        { token: 'bots', target: '/en/ai-chatbot-development-tashkent/', anchor: 'AI chatbot development in Tashkent' },
        { token: 'compare', target: '/en/uzbek-ai-chats-compared/', anchor: 'Uzbek AI chats compared' },
        { token: 'pay', target: '/en/pay-for-chatgpt-in-uzbekistan/', anchor: 'how to pay from Uzbekistan' },
      ] },
      { type: 'p', text: `The facts on this page were checked on 23 November 2026. The full company page is in Russian and Uzbek.` },
    ],
    faq: [
      { q: 'Is GPTBot.uz ChatGPT or an OpenAI product?', a: 'No. GPTBot.uz is an independent AI chat and studio from Tashkent. Answers come from third-party language models. ChatGPT itself is at chatgpt.com.' },
      { q: 'Where is GPTBot.uz based?', a: `In Tashkent, Uzbekistan. Studio address: ${f.address}. Working hours: Monday to Saturday, 10:00–19:00 Tashkent time.` },
      { q: 'How do I contact GPTBot.uz?', a: `Write in Telegram (${f.telegramHandle}) or to ${f.email}. Business projects start with a short brief and a quote.` },
      { q: 'In which languages does the AI chat answer?', a: 'In the language of the question: Uzbek (Latin script) or Russian. These English pages summarise the services for readers and assistants who search in English.' },
    ],
    kind: 'about',
    datePublished: d,
    dateModified: d,
    ogImage: IMG,
    alternates: { ru: '/ru/o-kompanii/', uz: '/uz/biz-haqimizda/' },
  };

  const chat: EnPage = {
    url: '/en/uzbek-ai-chat/',
    title: `Free Uzbek AI chat without registration: ${c.trialReplies} free replies | GPTBot.uz`,
    description: `AI chat in Uzbek and Russian: ${c.trialReplies} free trial replies without registration, then AI packs from ${uzs(c.smallPriceUzs)} paid via Click or Payme. Not ChatGPT.`,
    h1: 'Free AI chat in Uzbek and Russian without registration',
    breadcrumb: 'Uzbek AI chat',
    intro: `GPTBot.uz gives ${c.trialReplies} free trial replies in total, without registration, card or phone number; they do not renew daily. After that, an AI pack: ${packLine}. Each pack is a one-time payment via Click or Payme, without auto-renewal. ${NOT_OPENAI}`,
    blocks: [
      { type: 'h2', text: 'How do I use the Uzbek AI chat?' },
      { type: 'list', items: [
        '1. Open the chat: gptbot.uz/uz/gpt-uzbek-tilida/ (Uzbek) or gptbot.uz/ru/gpt-chat/ (Russian).',
        '2. Type your question in Uzbek (Latin script) or Russian; the answer comes in the same language.',
        `3. The first ${c.trialReplies} replies are free. For more, buy an AI pack in the chat: the buy button appears while payment is open.`,
        '4. Do not type passwords, card numbers or other confidential data: questions go to the GPTBot.uz server and to third-party AI providers.',
      ] },
      { type: 'h2', text: 'How much does it cost?' },
      { type: 'table', headers: ['Plan', 'Replies', 'Valid for', 'Price', 'Payment'], rows: [
        ['Free trial', `${c.trialReplies} in total`, 'No expiry; does not renew daily', 'Free', 'No card needed'],
        [`AI pack, ${smallDays} days`, `${c.smallReplies}`, `${c.smallHours} hours from payment`, uzs(c.smallPriceUzs), 'Click or Payme, once'],
        ['AI pack, month', `${c.replies} (up to ${c.dailyReplies} a day)`, 'One calendar month from payment', uzs(c.priceUzs), 'Click or Payme, once'],
      ] },
      { type: 'p', text: 'A new pack starts at once, even while another pack is active; packs run side by side and their replies add up. A paid pack is not refundable, except money charged by mistake (public offer: gptbot.uz/ru/oferta/).' },
      { type: 'h2', text: 'What can it do, and what not?' },
      { type: 'list', items: [
        'Text tasks in Uzbek or Russian: writing, translation, plans, explanations, study help.',
        'The chat works with text; it does not draw pictures. PowerPoint presentations are a separate product, Studio.',
        'It runs in the browser; there is no app to install.',
      ] },
      { type: 'linkp', text: 'Compare it with other AI chats for Uzbek users: {compare}. Make a presentation: {studio}. A bot that answers your own customers is a separate service: {bots}.', links: [
        { token: 'compare', target: '/en/uzbek-ai-chats-compared/', anchor: 'Uzbek AI chats compared' },
        { token: 'studio', target: '/en/ai-presentation-maker/', anchor: 'AI presentation maker' },
        { token: 'bots', target: '/en/ai-chatbot-development-tashkent/', anchor: 'AI chatbot development in Tashkent' },
      ] },
    ],
    faq: [
      { q: 'Is there a free AI chat in Uzbek?', a: `Yes. GPTBot.uz gives ${c.trialReplies} free trial replies in Uzbek or Russian without registration. Other free options are listed in our comparison of AI chats for Uzbek users.` },
      { q: 'Do I need to register?', a: 'No registration, card or phone number is needed for the free trial replies.' },
      { q: 'How do I pay for more replies?', a: `Buy an AI pack in the chat via Click or Payme: ${uzs(c.smallPriceUzs)} for ${c.smallReplies} replies (${c.smallHours} hours) or ${uzs(c.priceUzs)} for ${c.replies} replies (one month). There is no auto-renewal.` },
      { q: 'Does the free limit renew every day?', a: `No. There are ${c.trialReplies} trial replies in total: a new day, a new chat or another language does not renew them. The limit is tied to the browser; after sign-in, the trial replies the account has already used count too.` },
      { q: 'Is this ChatGPT?', a: 'No. GPTBot.uz is an independent service and not an OpenAI product. ChatGPT itself is at chatgpt.com.' },
    ],
    kind: 'article',
    datePublished: d,
    dateModified: d,
    ogImage: `${EN_SITE}/assets/blog/gpt-uzbek-tilida-online-1200.webp`,
    switchTo: { ru: '/ru/gpt-chat/', uz: '/uz/gpt-uzbek-tilida/' },
  };

  const studio: EnPage = {
    url: '/en/ai-presentation-maker/',
    title: 'AI presentation maker in Uzbek and Russian (.pptx) | GPTBot.uz',
    description: `GPTBot.uz Studio drafts PowerPoint presentations in Uzbek or Russian: a free sample a day, or full decks for ${uzs(f.studio.kunlikUzs)} (24 hours) or ${uzs(f.studio.oylikUzs)} a month.`,
    h1: 'GPTBot.uz Studio: AI presentation maker for PowerPoint (.pptx) in Uzbek and Russian',
    breadcrumb: 'AI presentation maker',
    intro: `Studio drafts a PowerPoint (.pptx) presentation from a topic in the browser. A free sample is available ${perDay}, up to ${f.studio.freeSlides} slides, without registration. Full presentations of up to ${f.studio.fullSlides} slides with up to ${f.studio.fullImages} images and speaker notes come with two plans: Kunlik, ${uzs(f.studio.kunlikUzs)} for ${f.studio.kunlikDecks} full presentation within ${f.studio.kunlikHours} hours, and Oylik, ${uzs(f.studio.oylikUzs)} for ${f.studio.oylikDecks} full presentations within one calendar month. Prices include 12% VAT.`,
    blocks: [
      { type: 'h2', text: 'Which plan do I need?' },
      { type: 'table', headers: ['Plan', 'What you get', 'Valid for', 'Price'], rows: [
        ['Free sample', `${f.studio.freePerDay} presentation a day, up to ${f.studio.freeSlides} slides`, 'Every day', 'Free'],
        ['Kunlik', `${f.studio.kunlikDecks} full presentation, up to ${f.studio.fullSlides} slides, images and speaker notes`, `${f.studio.kunlikHours} hours from payment`, uzs(f.studio.kunlikUzs)],
        ['Oylik', `${f.studio.oylikDecks} full presentations, up to ${f.studio.fullSlides} slides each`, 'One calendar month from payment', uzs(f.studio.oylikUzs)],
      ] },
      { type: 'h2', text: 'How do I make a presentation with AI?' },
      { type: 'list', items: [
        '1. Open Studio: gptbot.uz/uz/taqdimot-ai/ (Uzbek) or gptbot.uz/ru/prezentatsiya-ai/ (Russian).',
        '2. Type the topic, choose who the presentation is for and how many slides it needs.',
        '3. Studio writes the slides; download the .pptx file and open it in PowerPoint or another editor.',
        '4. Treat the result as a draft: check the facts, add your own words and examples, and list your sources.',
      ] },
      { type: 'h2', text: 'What is in the free sample, and what does a full presentation add?' },
      { type: 'list', items: [
        `Free sample: ${perDay} per browser (the day starts at 05:00 Tashkent time), up to ${f.studio.freeSlides} slides with a heading and 2–5 short points each, up to 2 pictures and no speaker notes. Its last slide says that it was made with AI.`,
        `Full presentation: up to ${f.studio.fullSlides} slides, up to ${f.studio.fullImages} images, speaker notes and 3 colour palettes.`,
        'Pictures show objects, buildings or nature; a picture that fails the safety check is left out and the slide keeps its text.',
        'The .pptx file is assembled in your browser and opens in Microsoft PowerPoint, Google Slides, WPS Office and Keynote, on a phone too.',
      ] },
      { type: 'p', text: 'For the free sample, your topic is sent to the AI model of Z.ai (Singapore), which writes the text, and Cloudflare Workers AI draws and checks the pictures. The slide text is not stored on the GPTBot.uz server: it is sent only to your browser.' },
      { type: 'p', text: 'The AI chat pack does not include presentations, and a Studio plan does not include chat replies: they are separate products. Refunds for unused Studio units can be requested within 14 days of payment, under the public offer (gptbot.uz/ru/oferta/).' },
      { type: 'linkp', text: 'Need text help instead of slides? {chat}. About GPTBot.uz: {about}.', links: [
        { token: 'chat', target: '/en/uzbek-ai-chat/', anchor: 'free Uzbek AI chat' },
        { token: 'about', target: '/en/', anchor: 'about GPTBot.uz' },
      ] },
    ],
    faq: [
      { q: 'How can I make a presentation with AI for free?', a: `Studio gives a free sample presentation ${perDay}, up to ${f.studio.freeSlides} slides, without registration.` },
      { q: 'How many slides can a full presentation have?', a: `Up to ${f.studio.fullSlides} slides with up to ${f.studio.fullImages} images and speaker notes.` },
      { q: 'How much does Studio cost?', a: `Kunlik: ${uzs(f.studio.kunlikUzs)} for ${f.studio.kunlikDecks} full presentation within ${f.studio.kunlikHours} hours. Oylik: ${uzs(f.studio.oylikUzs)} for ${f.studio.oylikDecks} full presentations within one calendar month. Prices include 12% VAT.` },
      { q: 'In which languages does Studio write?', a: 'In Uzbek or Russian.' },
    ],
    kind: 'article',
    datePublished: d,
    dateModified: d,
    ogImage: `${EN_SITE}/assets/studio/og-prezentatsiya-v1.png`,
    switchTo: { ru: '/ru/prezentatsiya-ai/', uz: '/uz/taqdimot-ai/' },
  };

  const bots: EnPage = {
    url: '/en/ai-chatbot-development-tashkent/',
    title: `AI chatbot development in Tashkent from ${uzs(start.amountUzs)} | GPTBot.uz`,
    description: `GPTBot.uz builds AI bots for Telegram, Instagram, WhatsApp and websites in Tashkent: one channel from ${uzs(start.amountUzs)}, CRM handoff, Uzbek and Russian.`,
    h1: 'AI chatbot development in Tashkent: Telegram, Instagram, WhatsApp and website bots',
    breadcrumb: 'AI chatbot development',
    intro: `GPTBot.uz, a team in Tashkent, builds AI bots that answer customers from a company knowledge base, collect the name and phone number and hand the lead to a manager in Telegram or to an agreed CRM (AmoCRM or Bitrix24), in Uzbek and Russian. Published starting prices: ${f.aiBot.map((p) => `${p.label} from ${uzs(p.amountUzs)}${p.monthly ? ' a month' : ''}`).join(', ')}. The final price is fixed in a quote before work starts; ${SERVICE_PAGES.aiBot.notes.join(' ').replace(/^H/, 'h')}`,
    blocks: [
      { type: 'h2', text: 'What do the packages include and cost?' },
      { type: 'table', headers: ['Package', 'What is included', 'Timeline', 'Starting price'], rows: f.aiBot.map((p) => [
        p.label, p.includes, p.term ? p.term.replace(/^Timeline: /, '').replace(/\.$/, '') : (p.monthly ? 'Monthly' : '—'), `${uzs(p.amountUzs)}${p.monthly ? ' a month' : ''}`,
      ]) },
      { type: 'p', text: 'Starting prices cover the scope in each row. Channels and a CRM already listed in a package are not added again; extra integrations and data migration are estimated separately. Prices are read from gptbot.uz/ru/ai-bot-dlya-biznesa/.' },
      { type: 'h2', text: 'What else does the team build?' },
      { type: 'table', headers: ['Service', 'Starting prices', 'Page'], rows: f.services.map((s) => [s.name, s.from, `gptbot.uz${s.url}`]) },
      { type: 'h2', text: 'How does an AI bot work?' },
      { type: 'p', text: 'A customer writes in a messenger; the bot answers from the knowledge base and asks clarifying questions, collects the name and contact, forms a lead and passes it to a manager in the agreed channel. The knowledge base holds the approved services, prices and frequent questions. When the information is not enough, the bot hands over to a person instead of inventing a price, a discount or a booking.' },
      { type: 'h2', text: 'What does the business get?' },
      { type: 'list', items: [
        'An answer scenario for the agreed questions, based on the knowledge base.',
        'Collection of the contact, the need and the other fields from the brief.',
        'Rules for handing over to a person when a question is unknown or unusual.',
        'A check of the answers on your own company\'s questions before launch.',
        'Delivery of requests to the chosen channel: a manager in Telegram or an agreed CRM.',
        'Metrics to check the result: response time, lead quality and errors.',
      ] },
      { type: 'p', text: `Contact: Telegram ${f.telegramHandle} or ${f.email}. Studio address: ${f.address}.` },
      { type: 'linkp', text: 'More about the company: {about}. How AI chats for Uzbek users compare: {compare}.', links: [
        { token: 'about', target: '/en/', anchor: 'about GPTBot.uz' },
        { token: 'compare', target: '/en/uzbek-ai-chats-compared/', anchor: 'Uzbek AI chats compared' },
      ] },
    ],
    faq: [
      { q: 'How much does an AI chatbot cost in Tashkent?', a: `GPTBot.uz publishes starting prices: ${f.aiBot.map((p) => `${p.label} from ${uzs(p.amountUzs)}${p.monthly ? ' a month' : ''}`).join(', ')}. The final price is fixed in a quote before work starts.` },
      { q: 'Which channels can the bot work in?', a: 'Telegram, Instagram Direct and WhatsApp, one channel or several; the Pro package covers three channels, the third being WhatsApp or a website.' },
      { q: 'Can the bot pass leads to a CRM?', a: 'Yes, to AmoCRM or Bitrix24. The Business package lists a CRM handoff; otherwise a CRM is not part of a starting package and is estimated after the team checks its API, access, fields and pipeline.' },
      { q: 'How long does it take?', a: f.aiBot.filter((p) => !p.monthly).map((p) => `${p.label}: ${p.term.replace(/^Timeline: /, '').replace(/\.$/, '')}`).join('; ') + '.' },
      { q: 'In which languages does the bot answer?', a: 'Uzbek and Russian: the Business package lists both in its scope. The scope of each project, languages included, is fixed in the quote before work starts.' },
    ],
    kind: 'article',
    datePublished: d,
    dateModified: d,
    ogImage: IMG,
    alternates: { ru: '/ru/ai-bot-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/' },
  };

  const pay: EnPage = {
    url: '/en/pay-for-chatgpt-in-uzbekistan/',
    title: 'How to pay for ChatGPT, Claude and Gemini from Uzbekistan | GPTBot.uz',
    description: 'Uzbekistan is on the supported-country lists of OpenAI, Anthropic and Google Gemini. What card ChatGPT accepts, and a local AI chat paid in UZS via Click or Payme.',
    h1: 'How to pay for ChatGPT Plus, Claude and Gemini from Uzbekistan',
    breadcrumb: 'Pay for ChatGPT in Uzbekistan',
    intro: `As of 23 November 2026, Uzbekistan is on the supported-country lists of OpenAI (ChatGPT), Anthropic (Claude) and Google (Gemini and its paid plans). OpenAI's pricing page says paid ChatGPT plans can be bought "with any major credit card"; it does not name Uzcard or Humo. If you need an AI chat paid in UZS, GPTBot.uz sells AI packs via Click or Payme from ${uzs(c.smallPriceUzs)}; it is an independent service, not ChatGPT.`,
    blocks: [
      { type: 'h2', text: 'Is ChatGPT available in Uzbekistan?' },
      { type: 'p', text: 'Yes. Uzbekistan is on the list of supported countries and territories in the OpenAI Help Center. The free version of ChatGPT is available to everyone; the paid plans (Go, Plus, Pro and Business) and their prices are listed on chatgpt.com/pricing.' },
      { type: 'h2', text: 'Which card can I pay with?' },
      { type: 'p', text: 'OpenAI\'s pricing page names "any major credit card" and lists no Uzbek payment systems. Before paying, ask your bank whether your Visa or Mastercard card is enabled for international online payments, and buy the subscription only on chatgpt.com or in the ChatGPT app from the App Store or Google Play. This page does not describe ways around payment rules.' },
      { type: 'h2', text: 'Can I pay for Claude and Gemini from Uzbekistan?' },
      { type: 'p', text: 'Anthropic lists Uzbekistan among the countries where Claude is available, and Google lists Uzbekistan for the Gemini web app and for the Google AI Plus and AI Pro plans. The payment methods each service accepts are shown at its checkout.' },
      { type: 'h2', text: 'Is there an AI chat I can pay for in UZS?' },
      { type: 'p', text: `GPTBot.uz sells AI packs for its Uzbek and Russian AI chat in UZS via Click or Payme: ${packLine}, without auto-renewal. The first ${c.trialReplies} replies are free without registration.` },
      { type: 'linkp', text: 'More detail in Russian: {ru}. Compare AI chats for Uzbek users: {compare}. Try the Uzbek AI chat: {chat}.', links: [
        { token: 'ru', target: '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', anchor: 'how to pay for ChatGPT in Uzbekistan (RU)', lang: 'ru' },
        { token: 'compare', target: '/en/uzbek-ai-chats-compared/', anchor: 'Uzbek AI chats compared' },
        { token: 'chat', target: '/en/uzbek-ai-chat/', anchor: 'free Uzbek AI chat' },
      ] },
    ],
    faq: [
      { q: 'Can I pay for ChatGPT Plus with Uzcard or Humo?', a: 'OpenAI\'s pricing page names "any major credit card" and does not list Uzcard or Humo. Ask your bank whether your card supports international online payments.' },
      { q: 'Is ChatGPT available in Uzbekistan?', a: 'Yes, Uzbekistan is on OpenAI\'s list of supported countries (checked 23 November 2026).' },
      { q: 'Is Claude available in Uzbekistan?', a: 'Yes, Anthropic lists Uzbekistan among the supported countries (checked 23 November 2026).' },
      { q: 'Which AI chat can I pay for with Click or Payme?', a: `GPTBot.uz: AI packs for ${uzs(c.smallPriceUzs)} (${c.smallReplies} replies, ${c.smallHours} hours) or ${uzs(c.priceUzs)} (${c.replies} replies, one month), paid once via Click or Payme.` },
    ],
    sources: [
      { title: 'OpenAI Help Center — ChatGPT supported countries', url: 'https://help.openai.com/en/articles/7947663-chatgpt-supported-countries', note: 'Uzbekistan is listed. Checked 2026-11-23.' },
      { title: 'OpenAI — ChatGPT pricing', url: 'https://chatgpt.com/pricing', note: '"The free version of ChatGPT is available to everyone"; "any major credit card". Checked 2026-11-23.' },
      { title: 'Anthropic — Supported countries', url: 'https://www.anthropic.com/supported-countries', note: 'Uzbekistan is listed. Checked 2026-11-23.' },
      { title: 'Claude Help Center — Where can I access Claude?', url: 'https://support.claude.com/en/articles/8461763-where-can-i-access-claude', note: 'Uzbekistan is listed. Checked 2026-11-23.' },
      { title: 'Google — Gemini Apps: supported languages and countries', url: 'https://support.google.com/gemini/answer/13575153?hl=en', note: 'Uzbekistan is listed. Checked 2026-11-23.' },
      { title: 'Google — Gemini Apps limits and plans', url: 'https://support.google.com/gemini/answer/16275805?hl=en', note: 'Uzbekistan is on the Google AI Plus and AI Pro country lists. Checked 2026-11-23.' },
    ],
    kind: 'article',
    datePublished: d,
    dateModified: d,
    ogImage: IMG,
    switchTo: { ru: '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', uz: '/uz/' },
  };

  const compare: EnPage = {
    url: '/en/uzbek-ai-chats-compared/',
    title: 'Which AI chat understands Uzbek? Comparison 2026 | GPTBot.uz',
    description: 'A table checked on 23.11.2026: ChatGPT, Gemini, Copilot, CoreAI, Hayot AI, bota.chat and GPTBot.uz by Uzbek support, free limit, registration and payment.',
    h1: 'AI chats for Uzbek users compared: free use, registration and paying with Click or Payme',
    breadcrumb: 'Uzbek AI chats compared',
    intro: `As checked on 23 November 2026, the AI chats that state Uzbek on their own pages and let you write without registration are CoreAI (free during its public test), Hayot AI (guest mode with a daily limit) and GPTBot.uz (${c.trialReplies} free trial replies in total). Google Gemini lists Uzbek among its supported languages and lets you use some features without signing in. Of the chats checked, only GPTBot.uz says it sells a paid pack in UZS via Click or Payme: ${uzs(c.smallPriceUzs)} for ${c.smallReplies} replies, ${uzs(c.priceUzs)} for ${c.replies} replies a month.`,
    blocks: [
      { type: 'h2', text: 'Comparison table: Uzbek, free use, registration and payment (23.11.2026)' },
      { type: 'table', headers: ['Service', 'Uzbek (as the site states)', 'Free use', 'Registration', 'Payment'], rows: [
        ['ChatGPT (chatgpt.com)', 'No language list on the chatgpt.com pages checked', 'Free version "available to everyone"; text chats unlimited within abuse guardrails', 'Login needed for images, file uploads and saved chats', 'Paid plans (Go, Plus and others) monthly, with any major credit card'],
        ['Google Gemini', 'Uzbek is on the supported-language list; Uzbekistan on the country list', 'Some features free, with standard limits', 'Some features without signing in; a Google Account for history and extra features', 'Google AI Plus, AI Pro and AI Ultra; prices depend on the region'],
        ['Microsoft Copilot', 'Uzbek appears in the site menu; language list not checked', 'Free tier with a Microsoft account; some features limited', 'The site asks you to sign in to chat', 'Not stated'],
        ['CoreAI (coreai.uz)', 'Uzbek (Latin and Cyrillic), Russian and English stated', 'Free during the public test; shared free limit, number not stated', 'No account needed', 'Paid plans and payment methods not stated'],
        ['Hayot AI (hayot.ai)', 'Uzbek in Latin and Cyrillic script stated', 'Free plan with a daily limit (number not stated), 7-day history', 'Guest chat possible; free sign-up to keep history', 'Pro and Pro+ plans; payments "coming soon" (Apple Pay, Google Pay, bank cards)'],
        ['bota.chat', 'Uzbek appears in the site menu; Uzbek page not checked', 'Free, nothing to buy first; limit not stated', 'No registration or login', 'Not stated'],
        ['GPTBot.uz', 'Uzbek (Latin) and Russian', `${c.trialReplies} free trial replies in total, no daily renewal`, 'No registration, card or phone number', `AI packs: ${uzs(c.smallPriceUzs)} for ${c.smallReplies} replies (${c.smallHours} hours); ${uzs(c.priceUzs)} for ${c.replies} replies a month (up to ${c.dailyReplies} a day); Click or Payme, no auto-renewal`],
      ] },
      { type: 'p', text: '"Not stated" means the page says nothing about it, not that the service lacks it. Terms change; check the service\'s own page before paying. Sources are listed below.' },
      { type: 'h2', text: 'Which AI chat understands Uzbek best?' },
      { type: 'p', text: 'No open, independent test answers this with a measurement on the pages we checked, so we give no ranking. Give the same task — an essay outline, a 100-word business letter or a translation from Russian — to two or three chats and compare spelling, word choice and whether the answer fits the question.' },
      { type: 'h2', text: 'When is GPTBot.uz the right choice, and when is another chat better?' },
      { type: 'list', items: [
        'GPTBot.uz fits: a short task in Uzbek or Russian without registration, and paying in UZS with Click or Payme.',
        `Another chat is better for many free conversations: GPTBot.uz has ${c.trialReplies} free replies in total, while ChatGPT's free version does not limit text chats within its abuse guardrails.`,
        'Another chat is better for images or files: the GPTBot.uz chat works with text; presentations are a separate product, Studio.',
        'Another chat is better if you need a phone app: GPTBot.uz runs in the browser, while Hayot AI mentions a mobile app on its site.',
      ] },
      { type: 'h2', text: 'Why other services are not in the table' },
      { type: 'list', items: [
        'DeepSeek: chat.deepseek.com did not open for us on the check day (HTTP 403).',
        'salom-ai.uz: the site did not respond on the check day (HTTP 503).',
        'Mashxura AI: described only on its developer\'s portfolio page; the service\'s own site was not checked.',
        'ai.sqb.uz is the AI centre of SQB bank, not a public chat; aslmatn.uz checks plagiarism and AI text; azamat.ai builds AI agents for businesses (Kazakhstan).',
      ] },
      { type: 'linkp', text: 'The same comparison in Uzbek: {uz}. In Russian: {ru}. Try the Uzbek AI chat: {chat}. Paying for ChatGPT, Claude or Gemini themselves: {pay}.', links: [
        { token: 'uz', target: '/uz/blog/ozbekcha-ai-chatlar-taqqoslash/', anchor: 'O‘zbekcha AI chatlar taqqoslash', lang: 'uz' },
        { token: 'ru', target: '/ru/blog/sravnenie-ai-chatov-na-uzbekskom/', anchor: 'Сравнение ИИ-чатов на узбекском', lang: 'ru' },
        { token: 'chat', target: '/en/uzbek-ai-chat/', anchor: 'free Uzbek AI chat' },
        { token: 'pay', target: '/en/pay-for-chatgpt-in-uzbekistan/', anchor: 'how to pay from Uzbekistan' },
      ] },
    ],
    faq: [
      { q: 'Which AI chat understands Uzbek best?', a: 'There is no open independent test, so we give no ranking. Gemini lists Uzbek among its languages; CoreAI and Hayot AI state Uzbek too. Try the same task in two or three chats.' },
      { q: 'Is there a free Uzbek AI chat without registration?', a: `As checked on 23.11.2026: CoreAI (no account needed), Hayot AI (guest mode), bota.chat (no registration) and GPTBot.uz (${c.trialReplies} free replies in total). Some Gemini features also work without signing in.` },
      { q: 'Which AI chat accepts Click or Payme?', a: `Of the chats checked, GPTBot.uz states it: AI packs for ${uzs(c.smallPriceUzs)} or ${uzs(c.priceUzs)}, without auto-renewal.` },
      { q: 'When was the table checked?', a: 'On 23 November 2026, on each service\'s own pages.' },
    ],
    sources: [
      { title: 'OpenAI — ChatGPT pricing', url: 'https://chatgpt.com/pricing', note: 'Checked 2026-11-23.' },
      { title: 'OpenAI Help Center — ChatGPT supported countries', url: 'https://help.openai.com/en/articles/7947663-chatgpt-supported-countries', note: 'Uzbekistan is listed. Checked 2026-11-23.' },
      { title: 'Google — Gemini Apps: supported languages and countries', url: 'https://support.google.com/gemini/answer/13575153?hl=en', note: 'Checked 2026-11-23.' },
      { title: 'Google — Use Gemini without signing in', url: 'https://support.google.com/gemini/answer/13278668?hl=en', note: 'Checked 2026-11-23.' },
      { title: 'Microsoft Copilot', url: 'https://copilot.com/', note: 'Checked 2026-11-23.' },
      { title: 'CoreAI — free AI chat', url: 'https://coreai.uz/ai/', note: 'Checked 2026-11-23.' },
      { title: 'Hayot AI — pricing', url: 'https://hayot.ai/pricing', note: 'Checked 2026-11-23.' },
      { title: 'bota.chat', url: 'https://bota.chat/', note: 'Checked 2026-11-23.' },
    ],
    kind: 'article',
    datePublished: d,
    dateModified: d,
    ogImage: `${EN_SITE}/assets/blog/ai-chat-nima-va-qanday-turlari-bor-1200.webp`,
    alternates: { ru: '/ru/blog/sravnenie-ai-chatov-na-uzbekskom/', uz: '/uz/blog/ozbekcha-ai-chatlar-taqqoslash/' },
  };

  return [about, chat, studio, bots, pay, compare];
}

/** Sitemap entries for the English pages that exist in this build (a build without prerender-en lists none). */
export function enSitemapEntries(root: string, dist: string): Array<{ url: string; lastmod: string; alternates?: { ru: string; uz: string; en: string } }> {
  // No English build, no entries, and no need for the sources of truth either
  // (generate-sitemap runs on bare fixture roots in tests/studio-sitemap.test.ts).
  if (!fs.existsSync(path.join(dist, 'en'))) return [];
  return enPages(root).filter((page) => fs.existsSync(enDistFile(dist, page.url))).map((page) => ({
    url: page.url,
    lastmod: page.dateModified,
    ...(page.alternates ? { alternates: { ...page.alternates, en: page.url } } : {}),
  }));
}
