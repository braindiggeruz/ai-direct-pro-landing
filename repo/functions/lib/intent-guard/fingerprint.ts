// Intent fingerprint extraction + normalisation.
//
// A fingerprint is a coarse-grained label per article describing
// "which search territory does this document occupy". It is derived
// from explicit fields (target_keyword, target_money_page, locale) +
// shallow keyword heuristics over the title / H1 / target keyword.
//
// The fingerprint is intentionally deterministic and lossy — the
// downstream Intent Guard pipeline uses it as a FAST shortlist filter,
// not as the only signal. Deterministic similarity + Serper SERP overlap
// + the semantic judge produce the final risk score.
//
// Hard rules:
//   - Two articles with the SAME (locale, intent_key) are candidates
//     for cannibalization unless one of them is the article being
//     analysed (self-exclusion happens at the caller, not here).
//   - The fingerprint NEVER triggers a publish block on its own.
//   - RU/UZ versions of the same content are NOT in conflict — locale
//     is the very first axis of the fingerprint.

import type { Locale } from '../../../src/shared/types';
import type { IntentFingerprint, IntentKey } from '../../../src/shared/intent-guard';

interface FingerprintSource {
  locale: Locale;
  meta_title?: string;
  h1?: string;
  excerpt?: string;
  target_keyword?: string;
  target_money_page?: string | null;
  primary_keyword?: string;
  slug?: string;
}

// ────────────────────────────────────────────────────────────────────
// Dictionaries — kept short and human-readable so adding new niches is
// a one-line PR. We intentionally keep BOTH RU and UZ token forms here.

const ENTITY_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'gpt-bot',    tokens: ['gpt бот', 'gpt-бот', 'gpt бoт', 'gpt boti', 'gpt-boti', 'chatgpt бот', 'gpt'] },
  { key: 'ai-bot',     tokens: ['ai бот', 'ai-бот', 'ai-boti', 'ai bot', 'искусственный интеллект бот', 'sun\'iy intellekt bot'] },
  { key: 'chatbot',    tokens: ['чатбот', 'чат-бот', 'chat-bot', 'chatbot', 'chat bot'] },
  { key: 'telegram-bot', tokens: ['telegram бот', 'telegram-бот', 'telegram boti', 'tg бот'] },
  { key: 'whatsapp-bot', tokens: ['whatsapp бот', 'whatsapp-бот', 'whatsapp boti'] },
  { key: 'instagram-bot', tokens: ['instagram бот', 'instagram direct', 'instagram boti', 'инстаграм бот'] },
  { key: 'voice-bot',  tokens: ['голосовой бот', 'voice bot', 'ovozli bot'] },
  { key: 'lead-bot',   tokens: ['лидбот', 'lead bot', 'лид-бот'] },
];

const INTENT_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'commercial-buy',    tokens: ['купить', 'заказать', 'цена', 'стоимость', 'sotib olish', 'buyurtma', 'narx'] },
  { key: 'commercial-service', tokens: ['внедрить', 'настройка', 'разработка', 'agency', 'студия', 'studio', 'sozlash', 'ishlab chiqish'] },
  { key: 'commercial-compare', tokens: ['сравнить', 'vs', 'или', 'taqqoslash', 'qaysi yaxshi', 'qaysi yaxshiroq'] },
  { key: 'informational-howto', tokens: ['как', 'инструкция', 'руководство', 'how to', 'qanday', 'qanday qilib', 'yo\'riqnoma'] },
  { key: 'informational-explain', tokens: ['что такое', 'что это', 'nima', 'nima u', 'аббревиатура'] },
  { key: 'informational-list',   tokens: ['топ', 'top', 'список', 'примеры', 'misollar', 'ro\'yxat'] },
  { key: 'informational-case',   tokens: ['кейс', 'case study', 'история', 'tajriba', 'tajribadan'] },
  { key: 'navigational',         tokens: ['gptbot', 'gptbot.uz'] },
];

const FUNNEL_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'top',    tokens: ['что такое', 'зачем', 'основы', 'asoslar', 'tushuncha'] },
  { key: 'middle', tokens: ['как', 'сравнение', 'обзор', 'функции', 'taqqoslash', 'sharh', 'funksiyalar'] },
  { key: 'bottom', tokens: ['купить', 'заказать', 'цена', 'тариф', 'sotib olish', 'narx', 'tarif'] },
];

const AUDIENCE_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'clinic-owner',     tokens: ['клиник', 'врач', 'doctor', 'медицин', 'shifoxona', 'tibbiy'] },
  { key: 'restaurant-owner', tokens: ['ресторан', 'кафе', 'restoran', 'kafe', 'oshxona'] },
  { key: 'retail-owner',     tokens: ['магазин', 'розниц', 'do\'kon', 'savdo'] },
  { key: 'ecommerce',        tokens: ['интернет-магазин', 'e-commerce', 'shopify', 'wildberries', 'onlayn-do\'kon'] },
  { key: 'marketer',         tokens: ['маркетолог', 'smm', 'агентство', 'agentlik', 'marketolog'] },
  { key: 'sales-manager',    tokens: ['менеджер', 'отдел продаж', 'savdo bo\'limi', 'menejer'] },
  { key: 'small-business',   tokens: ['малый бизнес', 'мсб', 'kichik biznes', 'kichik korxona'] },
];

const INDUSTRY_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'clinic',     tokens: ['клиник', 'tibbiy', 'shifoxona'] },
  { key: 'restaurant', tokens: ['ресторан', 'кафе', 'restoran', 'kafe'] },
  { key: 'retail',     tokens: ['магазин', 'розниц', 'do\'kon'] },
  { key: 'fitness',    tokens: ['фитнес', 'спортзал', 'sport zal', 'fitnes'] },
  { key: 'beauty',     tokens: ['салон', 'красота', 'beauty', 'go\'zallik', 'salon'] },
  { key: 'realestate', tokens: ['недвижим', 'риелтор', 'ko\'chmas mulk', 'rieltor'] },
  { key: 'education',  tokens: ['курсы', 'школа', 'учеб', 'o\'quv', 'kurslar', 'maktab'] },
  { key: 'logistics',  tokens: ['логистик', 'доставк', 'logistika', 'yetkazib berish'] },
  { key: 'b2c',        tokens: ['клиент', 'mijoz'] },
  { key: 'b2b',        tokens: ['b2b', 'корпоратив', 'korporativ'] },
];

const CHANNEL_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'telegram',  tokens: ['telegram', 'telegram-bot', 'tg'] },
  { key: 'whatsapp',  tokens: ['whatsapp', 'wa'] },
  { key: 'instagram', tokens: ['instagram', 'инстаграм', 'direct'] },
  { key: 'web',       tokens: ['на сайт', 'веб', 'сайт', 'web', 'sayt'] },
  { key: 'omni',      tokens: ['omnichannel', 'мульти', 'multichannel'] },
];

const GEO_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'tashkent',   tokens: ['ташкент', 'toshkent'] },
  { key: 'samarkand',  tokens: ['самарканд', 'samarqand'] },
  { key: 'uzbekistan', tokens: ['узбекистан', 'o\'zbekiston', 'uzbekistan'] },
];

const MODIFIER_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'pricing',     tokens: ['цена', 'тариф', 'стоимость', 'narx', 'tarif'] },
  { key: 'integration', tokens: ['интеграц', 'integratsi', 'crm', 'amocrm', 'bitrix'] },
  { key: 'security',    tokens: ['безопасн', 'gdpr', 'persona', 'xavfsiz'] },
  { key: 'speed',       tokens: ['24/7', 'быстр', 'мгновен', 'tezkor', 'tez'] },
  { key: 'comparison',  tokens: ['vs', 'сравнение', 'taqqoslash'] },
  { key: 'case-study',  tokens: ['кейс', 'история', 'tajriba'] },
  { key: 'guide',       tokens: ['руководство', 'гайд', 'yo\'riqnoma', 'qo\'llanma'] },
];

const CONTENT_TYPE_TOKENS: Array<{ key: string; tokens: string[] }> = [
  { key: 'guide',       tokens: ['руководство', 'гайд', 'инструкция', 'yo\'riqnoma'] },
  { key: 'listicle',    tokens: ['топ', 'top', '7', '10', 'список', 'ro\'yxat'] },
  { key: 'comparison',  tokens: ['vs', 'сравнение', 'taqqoslash'] },
  { key: 'case-study',  tokens: ['кейс', 'история', 'tajriba'] },
  { key: 'faq',         tokens: ['faq', 'вопросы и ответы', 'savol-javob'] },
  { key: 'how-to',      tokens: ['как', 'qanday'] },
  { key: 'review',      tokens: ['обзор', 'sharh'] },
];

function lowerAll(s: unknown): string {
  return (typeof s === 'string' ? s : '').toLowerCase();
}

function matchToken(haystack: string, dict: Array<{ key: string; tokens: string[] }>): string {
  for (const entry of dict) {
    for (const tok of entry.tokens) {
      if (haystack.includes(tok)) return entry.key;
    }
  }
  return 'none';
}

function deriveGeoFromMoneyPage(target: string | null | undefined): string {
  if (!target) return 'uzbekistan';
  // money pages live under /<locale>/... so we default to uzbekistan
  return 'uzbekistan';
}

export function buildFingerprint(src: FingerprintSource): IntentFingerprint {
  const haystack = [
    src.meta_title,
    src.h1,
    src.target_keyword,
    src.primary_keyword,
    src.excerpt,
    src.slug,
    src.target_money_page,
  ]
    .map(lowerAll)
    .join(' || ');

  const entity   = matchToken(haystack, ENTITY_TOKENS);
  const intent   = matchToken(haystack, INTENT_TOKENS);
  const funnel   = matchToken(haystack, FUNNEL_TOKENS);
  const audience = matchToken(haystack, AUDIENCE_TOKENS);
  const industry = matchToken(haystack, INDUSTRY_TOKENS);
  const channel  = matchToken(haystack, CHANNEL_TOKENS);
  const geo      = matchToken(haystack, GEO_TOKENS) !== 'none'
    ? matchToken(haystack, GEO_TOKENS)
    : deriveGeoFromMoneyPage(src.target_money_page);
  const modifier = matchToken(haystack, MODIFIER_TOKENS);
  const content_type = matchToken(haystack, CONTENT_TYPE_TOKENS);

  return {
    locale: src.locale,
    primary_entity: entity,
    search_intent: intent,
    funnel_stage: funnel,
    audience,
    industry,
    channel,
    geo,
    modifier,
    content_type,
  };
}

/** Compact, hashable representation of a fingerprint. */
export function intentKeyOf(fp: IntentFingerprint): IntentKey {
  return [
    fp.locale,
    fp.primary_entity,
    fp.search_intent,
    fp.funnel_stage,
    fp.audience,
    fp.industry,
    fp.channel,
    fp.geo,
    fp.modifier,
    fp.content_type,
  ].join('|');
}

/** Loose equality — used to short-circuit deterministic shortlisting. */
export function sameIntent(a: IntentFingerprint, b: IntentFingerprint): boolean {
  if (a.locale !== b.locale) return false;       // RU vs UZ is never a conflict
  if (a.primary_entity !== b.primary_entity) return false;
  if (a.search_intent !== b.search_intent) return false;
  if (a.funnel_stage !== b.funnel_stage) return false;
  return true;
}
