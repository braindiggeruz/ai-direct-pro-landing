// Build-time public facts. Import the existing billing allowances; never ship
// this module in a browser bundle or infer checkout availability from a build.
import { PAID_MESSAGES, PRICE_TIYIN } from '../functions/lib/gpt-chat/billing-config';
import { PACKS } from '../functions/lib/gpt-chat/packs';
import { FREE_TRIAL_LIMIT } from '../functions/lib/gpt-chat/trial-store';
import { PACK_DAILY_LIMIT } from '../functions/lib/gpt-chat/turn-store';
import { STUDIO_PLANS, TERMS_PLAN } from '../functions/lib/studio/plans';
import publishedOffer from '../content/pages/ru/oferta.json';
import type { BodyBlock, Locale } from '../src/shared/types';

export const PRODUCT_FACTS_REVIEWED_AT = '2026-11-17';
export const CHAT_PRODUCT_URLS = ['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/'] as const;
export const isChatProductUrl = (url: string): boolean => CHAT_PRODUCT_URLS.some((path) => path === url);
export const isChatPricingUrl = (url: string): boolean => url === '/ru/tarify-ai-chat/';
export const CHAT_FACTS = Object.freeze({
  priceUzs: PRICE_TIYIN / 100,
  replies: PAID_MESSAGES,
  dailyReplies: PACK_DAILY_LIMIT, // Replies charged to packs, not every free+paid answer.
  trialReplies: FREE_TRIAL_LIMIT,
  // The 3-day pack (functions/lib/gpt-chat/packs.ts), sold beside the monthly one since offer edition ai-paket-2026-11-v6.
  smallPriceUzs: PACKS.once.amountTiyin / 100,
  smallReplies: PACKS.once.answers,
  smallHours: 'hours' in PACKS.once.term ? PACKS.once.term.hours : 0,
});
// The currently published offer edition, not the inactive photo-enabled plan.
const studioPlanVersion = TERMS_PLAN[publishedOffer.termsVersion];
if (!studioPlanVersion) throw new Error('Published offer has no Studio plan; review the public facts before building');
export const STUDIO_FACTS = STUDIO_PLANS[studioPlanVersion];
const amount = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const chatPricingPath = (locale: Locale): string => locale === 'uz' ? '/uz/tariflar/#ai-paket' : '/ru/tarify-ai-chat/';

export function chatPlanDescription(locale: Locale): string {
  const f = CHAT_FACTS;
  return locale === 'uz'
    ? `${amount(f.priceUzs)} so‘m — to‘lov tasdiqlangan paytdan boshlab bir kalendar oyga ${f.replies} ta javob, kuniga paketdan ${f.dailyReplies} tagacha javob. Amaldagi paketga kiritilgan bepul javoblar oferta bo‘yicha alohida hisoblanadi. Muddat UTC taqvimi bo‘yicha hisoblanadi; tugash sanasi chatdagi paket bo‘limida ko‘rsatiladi. Kunlik limit Toshkent vaqti bilan 05:00 da yangilanadi. Avtoto‘lov yo‘q. Xarid faqat chatda to‘lov ochiq bo‘lganda mavjud.`
    : `${amount(f.priceUzs)} сум — ${f.replies} ответов на один календарный месяц с подтверждения оплаты, до ${f.dailyReplies} ответов из пакета в сутки. Включённые бесплатные ответы действующего пакета считаются отдельно по оферте. Срок рассчитывается по календарю UTC; дату окончания смотрите в разделе пакета в чате. Суточный лимит обновляется в 05:00 по Ташкенту. Автопродления нет. Покупка доступна только при открытой оплате в чате.`;
}

/** Normal content blocks: the HTML and Markdown use precisely the same text. */
export function chatProductBlocks(url: string, locale: Locale): BodyBlock[] {
  if (!isChatProductUrl(url)) return [];
  const f = CHAT_FACTS;
  const uz = locale === 'uz';
  return [
    { type: 'h2', id: 'ai-chat-terms', text: uz ? 'AI chat: sinov va AI paket' : 'AI-чат: проба и AI-пакет' },
    { type: 'p', text: uz
      ? `GPTBot.uz — o‘zbek va rus tillaridagi mustaqil AI chat, OpenAI yoki ChatGPT mahsuloti emas. Ro‘yxatsiz jami ${f.trialReplies} ta bepul sinov javobi beriladi; sinov har kuni yangilanmaydi.`
      : `GPTBot.uz — самостоятельный AI-чат на русском и узбекском, не продукт OpenAI или ChatGPT. Без регистрации доступны ${f.trialReplies} бесплатных пробных ответа всего; проба не обновляется ежедневно.` },
    { type: 'p', text: chatPlanDescription(locale) },
    { type: 'linkp', text: uz
      ? 'Javoblar saytdagi AI chatlar uchun umumiy. Studio taqdimotlari va biznes uchun bot yaratish alohida xizmatlar. {price}; {studio}; {terms}.'
      : 'Ответы общие для AI-чатов сайта. Презентации Studio и разработка бота для бизнеса оплачиваются отдельно. {price}; {studio}; {terms}.',
      links: [
        { token: 'price', target: chatPricingPath(locale), anchor: uz ? 'AI paket narxi va limitlari' : 'цена и ограничения AI-пакета' },
        { token: 'studio', target: '/uz/tariflar/', anchor: uz ? 'Studio tariflari' : 'тарифы Studio (узбекский)', lang: 'uz' },
        { token: 'terms', target: `/${locale}/oferta/`, anchor: uz ? 'ommaviy oferta' : 'публичная оферта' },
      ] },
  ];
}

export function buildChatPaidOffer(siteUrl: string, locale: Locale): Record<string, unknown> {
  return {
    '@type': 'Offer', '@id': `${siteUrl}/#ai-paket`,
    name: locale === 'uz' ? 'AI paket' : 'AI-пакет',
    price: String(CHAT_FACTS.priceUzs), priceCurrency: 'UZS',
    description: chatPlanDescription(locale),
    url: `${siteUrl}${chatPricingPath(locale)}`,
    seller: { '@id': `${siteUrl}/#org` },
    itemOffered: { '@id': `${siteUrl}/#ai-chat` },
    // No InStock: payment availability is decided by the live checkout gate.
  };
}

export function buildChatApplicationLd(siteUrl: string, locale: Locale): Record<string, unknown> {
  const uz = locale === 'uz';
  return {
    '@type': 'SoftwareApplication', '@id': `${siteUrl}/#ai-chat`,
    name: 'GPTBot.uz AI chat',
    applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web',
    inLanguage: ['ru', 'uz'],
    url: CHAT_PRODUCT_URLS.map((url) => `${siteUrl}${url}`),
    publisher: { '@id': `${siteUrl}/#org` },
    description: uz
      ? 'O‘zbek va rus tillaridagi mustaqil AI chat. OpenAI yoki ChatGPT mahsuloti emas. Studio taqdimotlari alohida xizmat.'
      : 'Самостоятельный AI-чат на русском и узбекском. Не продукт OpenAI или ChatGPT. Презентации Studio — отдельный сервис.',
    offers: [
      {
        '@type': 'Offer', '@id': `${siteUrl}/#ai-chat-trial`,
        name: uz ? `${CHAT_FACTS.trialReplies} ta bepul sinov javobi` : `${CHAT_FACTS.trialReplies} бесплатных пробных ответа`,
        price: '0', priceCurrency: 'UZS',
        description: uz ? 'Jami sinov javoblari; har kuni yangilanmaydi. Keyin AI paket kerak.' : 'Пробные ответы всего, без ежедневного обновления. Затем нужен AI-пакет.',
        url: `${siteUrl}${chatPricingPath(locale)}`,
        seller: { '@id': `${siteUrl}/#org` },
        itemOffered: { '@id': `${siteUrl}/#ai-chat` },
      },
      buildChatPaidOffer(siteUrl, locale),
    ],
  };
}

export function productFactsManifest(): string {
  const f = CHAT_FACTS;
  return [
    '<!-- product-facts:start -->',
    '## Current consumer product terms',
    '',
    `Reviewed: ${PRODUCT_FACTS_REVIEWED_AT}. Generated from the existing billing allowances and published Studio offer edition.`,
    `- AI chat trial: ${f.trialReplies} successful lifetime replies, no daily renewal; no registration.`,
    `- AI chat pack, monthly: ${amount(f.priceUzs)} UZS for ${f.replies} replies, up to ${f.dailyReplies} replies charged to packs per UTC day across the account's packs. The day resets at 00:00 UTC / 05:00 Tashkent. Included free replies of an active pack are accounted for separately under the offer; this is not a renewed daily free trial for visitors without a pack.`,
    '- Monthly pack validity: one calendar month from confirmed payment, calculated using the UTC calendar and preserving the UTC time of day; if the next UTC month has no matching date, validity ends on its last day. This can differ from adding a month to the local Tashkent date near midnight. The chat account/pack panel displays the expiry date. No auto-renewal. A new pack starts immediately, even if another pack is still active; packs run side by side and their replies add up.',
    `- AI chat pack, 3 days: ${amount(f.smallPriceUzs)} UZS for ${f.smallReplies} replies, valid for ${f.smallHours} hours from confirmed payment and counted within the same ${f.dailyReplies} pack replies per UTC day across all packs. No auto-renewal.`,
    '- Checkout availability is determined in the chat; a published price does not mean payment is currently open.',
    '- Chat pricing: https://gptbot.uz/ru/tarify-ai-chat/ and https://gptbot.uz/uz/tariflar/#ai-paket .',
    `- Studio Kunlik: ${amount(STUDIO_FACTS.kunlik.amountTiyin / 100)} UZS / 24 hours / ${STUDIO_FACTS.kunlik.presentationFull} full presentation. Studio Oylik: ${amount(STUDIO_FACTS.oylik.amountTiyin / 100)} UZS / one calendar month / ${STUDIO_FACTS.oylik.presentationFull} full presentations.`,
    '- Studio, the AI chat pack and custom business implementation are separate products. Studio terms: https://gptbot.uz/uz/tariflar/ .',
    '<!-- product-facts:end -->',
  ].join('\n');
}

export function refreshProductFactsManifest(source: string): string {
  const marker = /<!-- product-facts:start -->[\s\S]*?<!-- product-facts:end -->/;
  if (!marker.test(source)) throw new Error('llms.txt lacks the reviewed product facts block');
  return source.replace(marker, productFactsManifest());
}
