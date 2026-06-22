// Heuristic topic suggester for the "10 unique topics / day" planner.
//
// Why heuristic and not LLM-only:
//   * Reservations + deterministic uniqueness are non-negotiable.
//   * We need to GUARANTEE no duplicate fingerprint among the proposed
//     items, no duplicate against the inventory, no duplicate against
//     active reservations from a previous plan.
//   * LLM-only would frequently propose 4-5 near-duplicates.
//
// Strategy:
//   1. Build a list of candidate (audience × industry × channel × modifier)
//      slots from a curated matrix.
//   2. For each slot, derive a planned_title + primary_keyword and
//      compute the fingerprint.
//   3. Discard slots whose fingerprint:
//        a. is already represented in the inventory (published, drafts)
//        b. is already in the in-progress plan
//        c. has an active reservation
//   4. Optionally weight slots so the requested params (cluster, industry,
//      channel, funnel_stage, target_money_page) are respected first.
//   5. Pick first N unique ones.

import type {
  ContentInventory, IntentFingerprint, IntentRiskLevel, TopicPlanItem,
} from '../../../src/shared/intent-guard';
import { buildFingerprint, intentKeyOf } from './fingerprint';
import { riskLevelFromScore } from '../../../src/shared/intent-guard';

interface MatrixSlot {
  audience: string;
  industry: string;
  channel: string;
  modifier: string;
  content_type: string;
  funnel_stage: 'top' | 'middle' | 'bottom';
}

// 60-slot matrix. Enough for many days of unique topics without
// repetition. We pick the first N that pass the uniqueness filter.
const MATRIX: MatrixSlot[] = [
  // -- clinic
  { audience: 'clinic-owner', industry: 'clinic', channel: 'telegram', modifier: 'guide',       content_type: 'guide',      funnel_stage: 'middle' },
  { audience: 'clinic-owner', industry: 'clinic', channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',     funnel_stage: 'middle' },
  { audience: 'clinic-owner', industry: 'clinic', channel: 'instagram', modifier: 'speed',      content_type: 'listicle',   funnel_stage: 'middle' },
  { audience: 'clinic-owner', industry: 'clinic', channel: 'telegram', modifier: 'case-study',  content_type: 'case-study', funnel_stage: 'bottom' },
  { audience: 'clinic-owner', industry: 'clinic', channel: 'web',      modifier: 'comparison',  content_type: 'comparison', funnel_stage: 'middle' },
  // -- restaurant
  { audience: 'restaurant-owner', industry: 'restaurant', channel: 'telegram', modifier: 'guide',       content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'restaurant-owner', industry: 'restaurant', channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',    funnel_stage: 'middle' },
  { audience: 'restaurant-owner', industry: 'restaurant', channel: 'instagram', modifier: 'speed',      content_type: 'listicle',  funnel_stage: 'middle' },
  { audience: 'restaurant-owner', industry: 'restaurant', channel: 'telegram', modifier: 'case-study',  content_type: 'case-study',funnel_stage: 'bottom' },
  // -- retail
  { audience: 'retail-owner', industry: 'retail', channel: 'telegram', modifier: 'guide',       content_type: 'guide',      funnel_stage: 'middle' },
  { audience: 'retail-owner', industry: 'retail', channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',     funnel_stage: 'middle' },
  { audience: 'retail-owner', industry: 'retail', channel: 'instagram', modifier: 'speed',      content_type: 'listicle',   funnel_stage: 'middle' },
  { audience: 'retail-owner', industry: 'retail', channel: 'web',      modifier: 'comparison',  content_type: 'comparison', funnel_stage: 'middle' },
  // -- fitness
  { audience: 'small-business', industry: 'fitness',    channel: 'telegram', modifier: 'guide',       content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'fitness',    channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',    funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'fitness',    channel: 'instagram', modifier: 'speed',      content_type: 'listicle',  funnel_stage: 'middle' },
  // -- beauty
  { audience: 'small-business', industry: 'beauty',     channel: 'telegram', modifier: 'guide',       content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'beauty',     channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',    funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'beauty',     channel: 'instagram', modifier: 'speed',      content_type: 'listicle',  funnel_stage: 'middle' },
  // -- realestate
  { audience: 'small-business', industry: 'realestate', channel: 'telegram', modifier: 'guide',       content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'realestate', channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',    funnel_stage: 'middle' },
  // -- education
  { audience: 'small-business', industry: 'education',  channel: 'telegram', modifier: 'guide',       content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'education',  channel: 'instagram', modifier: 'speed',      content_type: 'listicle',  funnel_stage: 'middle' },
  // -- ecommerce
  { audience: 'ecommerce', industry: 'retail',     channel: 'telegram', modifier: 'integration', content_type: 'guide',      funnel_stage: 'middle' },
  { audience: 'ecommerce', industry: 'retail',     channel: 'whatsapp', modifier: 'speed',       content_type: 'how-to',     funnel_stage: 'middle' },
  { audience: 'ecommerce', industry: 'retail',     channel: 'instagram', modifier: 'comparison', content_type: 'comparison', funnel_stage: 'middle' },
  // -- marketer
  { audience: 'marketer',  industry: 'b2c',        channel: 'telegram', modifier: 'comparison',  content_type: 'comparison', funnel_stage: 'top' },
  { audience: 'marketer',  industry: 'b2b',        channel: 'web',      modifier: 'pricing',     content_type: 'review',     funnel_stage: 'bottom' },
  // -- sales
  { audience: 'sales-manager', industry: 'b2b',    channel: 'telegram', modifier: 'integration', content_type: 'how-to',     funnel_stage: 'middle' },
  { audience: 'sales-manager', industry: 'b2b',    channel: 'whatsapp', modifier: 'speed',       content_type: 'guide',      funnel_stage: 'middle' },
  // -- logistics
  { audience: 'small-business', industry: 'logistics',  channel: 'telegram', modifier: 'guide',       content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'logistics',  channel: 'whatsapp', modifier: 'integration', content_type: 'how-to',    funnel_stage: 'middle' },
  // -- general small-business
  { audience: 'small-business', industry: 'b2c',    channel: 'omni',     modifier: 'security',    content_type: 'guide',     funnel_stage: 'top' },
  { audience: 'small-business', industry: 'b2c',    channel: 'omni',     modifier: 'integration', content_type: 'guide',     funnel_stage: 'middle' },
  { audience: 'small-business', industry: 'b2c',    channel: 'web',      modifier: 'pricing',     content_type: 'review',    funnel_stage: 'bottom' },
];

const AUDIENCE_TITLE_RU: Record<string, string> = {
  'clinic-owner':     'клиник',
  'restaurant-owner': 'ресторанов и кафе',
  'retail-owner':     'магазинов',
  'ecommerce':        'интернет-магазинов',
  'marketer':         'маркетологов',
  'sales-manager':    'отдела продаж',
  'small-business':   'малого бизнеса',
};
const INDUSTRY_TITLE_RU: Record<string, string> = {
  clinic: 'клиники', restaurant: 'ресторана', retail: 'магазина',
  fitness: 'фитнес-клуба', beauty: 'салона красоты', realestate: 'риелторского агентства',
  education: 'учебного центра', logistics: 'логистики', b2c: 'B2C-бизнеса', b2b: 'B2B-сегмента',
};
const CHANNEL_TITLE_RU: Record<string, string> = {
  telegram: 'Telegram', whatsapp: 'WhatsApp', instagram: 'Instagram',
  web: 'сайта', omni: 'мультиканала',
};
const MODIFIER_TITLE_RU: Record<string, string> = {
  pricing: 'цены и тарифы', integration: 'интеграция с CRM', security: 'безопасность данных',
  speed: 'скорость ответов 24/7', comparison: 'сравнение', 'case-study': 'кейс',
  guide: 'пошаговое руководство',
};

const AUDIENCE_TITLE_UZ: Record<string, string> = {
  'clinic-owner':     'shifoxonalar uchun',
  'restaurant-owner': 'restoran va kafe uchun',
  'retail-owner':     'do\'kon uchun',
  'ecommerce':        'onlayn-do\'kon uchun',
  'marketer':         'marketologlar uchun',
  'sales-manager':    'savdo bo\'limi uchun',
  'small-business':   'kichik biznes uchun',
};

function planTitleRu(slot: MatrixSlot): string {
  const audience = AUDIENCE_TITLE_RU[slot.audience] || 'малого бизнеса';
  const industry = INDUSTRY_TITLE_RU[slot.industry] || '';
  const channel = CHANNEL_TITLE_RU[slot.channel] || '';
  const modifier = MODIFIER_TITLE_RU[slot.modifier] || '';
  switch (slot.content_type) {
    case 'how-to':
      return `Как настроить AI-бота для ${industry}: ${modifier} (${channel})`;
    case 'listicle':
      return `7 сценариев AI-бота для ${audience} в ${channel}`;
    case 'comparison':
      return `AI-бот или живой менеджер: что выбрать для ${industry}`;
    case 'case-study':
      return `Кейс: как AI-бот обрабатывает заявки ${industry} в ${channel}`;
    case 'review':
      return `Стоимость AI-бота для ${industry}: на чём строится цена`;
    case 'guide':
    default:
      return `AI-бот для ${industry} в ${channel}: ${modifier}`;
  }
}

function planTitleUz(slot: MatrixSlot): string {
  const aud = AUDIENCE_TITLE_UZ[slot.audience] || 'kichik biznes uchun';
  const industry = slot.industry;
  const channel = slot.channel;
  // simple Uzbek heuristic — gets refined by the n8n UZ adaptation later
  switch (slot.content_type) {
    case 'how-to':
      return `${industry} biznesi uchun AI-botni qanday sozlash kerak (${channel})`;
    case 'listicle':
      return `${aud} uchun AI-botning 7 ish stsenariysi: ${channel}`;
    case 'comparison':
      return `AI-bot yoki menejer: ${industry} biznesi uchun qaysi yaxshiroq`;
    case 'case-study':
      return `Tajriba: ${industry} biznesida AI-bot ${channel} arizalarini qanday qabul qiladi`;
    case 'review':
      return `${industry} biznesi uchun AI-bot narxi nimaga bog'liq`;
    case 'guide':
    default:
      return `${industry} biznesi uchun AI-bot: ${channel}`;
  }
}

function planKeywordRu(slot: MatrixSlot): string {
  const industry = INDUSTRY_TITLE_RU[slot.industry] || 'бизнеса';
  return `AI-бот для ${industry}`;
}

function planKeywordUz(slot: MatrixSlot): string {
  return `AI-bot ${slot.industry} biznesi uchun`;
}

export interface ProposeTopicsParams {
  count: number;
  locale_mode: 'ru' | 'uz' | 'ru+uz';
  inventory: ContentInventory;
  reservedActiveIntentKeys: Set<string>; // already-reserved active intents
  filters?: {
    cluster?: string;          // industry:xxx | audience:yyy
    industry?: string;
    channel?: string;
    funnel_stage?: string;
    target_money_page?: string;
  };
}

export interface ProposedTopic {
  locale: 'ru' | 'uz';
  planned_title: string;
  primary_keyword: string;
  intent_key: string;
  fingerprint: IntentFingerprint;
  cluster_key: string;
  funnel_stage: string;
  audience: string;
  industry: string;
  channel: string;
  modifier: string;
  content_type: string;
  reason_unique: string;
  supports_url: string | null;
  risk_score: number;
  risk_level: IntentRiskLevel;
}

function clusterFromSlot(slot: MatrixSlot): string {
  if (slot.industry && slot.industry !== 'b2c' && slot.industry !== 'b2b') return `industry:${slot.industry}`;
  if (slot.audience !== 'small-business') return `audience:${slot.audience}`;
  if (slot.channel  !== 'omni')           return `channel:${slot.channel}`;
  return `modifier:${slot.modifier}`;
}

function matchesFilter(slot: MatrixSlot, filters: ProposeTopicsParams['filters']): boolean {
  if (!filters) return true;
  if (filters.industry && slot.industry !== filters.industry) return false;
  if (filters.channel && slot.channel !== filters.channel) return false;
  if (filters.funnel_stage && slot.funnel_stage !== filters.funnel_stage) return false;
  if (filters.cluster) {
    const c = clusterFromSlot(slot);
    if (filters.cluster.includes(':')) {
      if (c !== filters.cluster) return false;
    } else if (!c.endsWith(`:${filters.cluster}`)) return false;
  }
  return true;
}

function pickMoneyPageFor(slot: MatrixSlot, inventory: ContentInventory, locale: 'ru' | 'uz'): string | null {
  const targets = inventory.items
    .filter((it) => it.source_type === 'money_page' && it.locale === locale)
    .map((it) => ({
      url: it.url,
      score:
        (it.fingerprint.industry === slot.industry ? 30 : 0) +
        (it.fingerprint.audience === slot.audience ? 12 : 0) +
        (it.fingerprint.channel  === slot.channel  ? 10 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return targets[0]?.url || null;
}

export function proposeTopics(params: ProposeTopicsParams): ProposedTopic[] {
  const used = new Set<string>(params.reservedActiveIntentKeys);
  // Pre-fill with existing inventory intent_keys to enforce uniqueness.
  for (const it of params.inventory.items) used.add(it.intent_key);

  const locales: Array<'ru' | 'uz'> = params.locale_mode === 'uz' ? ['uz']
    : params.locale_mode === 'ru+uz' ? ['ru', 'uz']
    : ['ru'];

  const out: ProposedTopic[] = [];
  // Score-then-pick: prefer slots that match the filter; rotate audience+industry
  // so we don't pile up similar topics.
  const slots = MATRIX.filter((s) => matchesFilter(s, params.filters));
  for (const slot of slots) {
    if (out.length >= params.count) break;
    for (const locale of locales) {
      if (out.length >= params.count) break;
      const title = locale === 'ru' ? planTitleRu(slot) : planTitleUz(slot);
      const keyword = locale === 'ru' ? planKeywordRu(slot) : planKeywordUz(slot);
      const money = params.filters?.target_money_page
        ? params.filters.target_money_page
        : pickMoneyPageFor(slot, params.inventory, locale);
      const fp = buildFingerprint({
        locale, meta_title: title, h1: title,
        target_keyword: keyword, target_money_page: money, slug: '',
      });
      const key = intentKeyOf(fp);
      if (used.has(key)) continue;
      used.add(key);
      // For pre-launch risk estimate, find the strongest deterministic
      // peer in the inventory with the same locale.
      let topScore = 0;
      for (const it of params.inventory.items) {
        if (it.locale !== locale) continue;
        if (it.fingerprint.industry === fp.industry && it.fingerprint.audience === fp.audience) topScore = Math.max(topScore, 28);
        if (it.fingerprint.industry === fp.industry && it.fingerprint.channel  === fp.channel)  topScore = Math.max(topScore, 22);
      }
      out.push({
        locale,
        planned_title: title,
        primary_keyword: keyword,
        intent_key: key,
        fingerprint: fp,
        cluster_key: clusterFromSlot(slot),
        funnel_stage: slot.funnel_stage,
        audience: slot.audience,
        industry: slot.industry,
        channel: slot.channel,
        modifier: slot.modifier,
        content_type: slot.content_type,
        reason_unique: locale === 'ru'
          ? `Уникальное сочетание аудитории, отрасли, канала и формата (${slot.audience}/${slot.industry}/${slot.channel}/${slot.content_type}).`
          : `Audience+industry+channel+content_type unique slot (${slot.audience}/${slot.industry}/${slot.channel}/${slot.content_type}).`,
        supports_url: money,
        risk_score: topScore,
        risk_level: riskLevelFromScore(topScore),
      });
    }
  }
  return out.slice(0, params.count);
}

/** Helper used by the planner to detect duplicates between plan items. */
export function dedupePlanItems<T extends { intent_key: string; locale: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = `${it.locale}::${it.intent_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export type { TopicPlanItem };
