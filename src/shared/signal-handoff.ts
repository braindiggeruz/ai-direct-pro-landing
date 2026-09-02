/**
 * Signal Radar → Lead Radar handoff.
 *
 * The two radars look at the market from opposite ends and deliberately share
 * no tables. Signal Radar finds a *person* who asked for something; Lead Radar
 * finds *companies* to sell to. The only thing that crosses between them is a
 * URL, by design: no company is created, no lead is mutated, and nothing is
 * sent. The operator decides everything on the Lead Radar side.
 *
 * What the handoff actually carries is the honest part. A stranger asking for
 * a chat bot in a Telegram channel tells us *what is in demand*, not who they
 * are — there is no industry in a first-person request. So the offer is filled
 * in and the niche is left alone, because inventing a niche would send Lead
 * Radar looking for the wrong businesses.
 */

import { signalServiceLabel, type SignalLead, type SignalServiceId } from './signal-radar';
import type { LeadRadarSearchInput } from './lead-radar';

/** Marks a Lead Radar URL as arriving from Signal Radar. */
export const SIGNAL_HANDOFF_SOURCE = 'signal';

/**
 * The quote is carried for context only. Bounded so a handoff URL can never
 * become a 4 KB request line.
 */
export const SIGNAL_HANDOFF_QUOTE_MAX = 240;

export interface SignalHandoff {
  from: typeof SIGNAL_HANDOFF_SOURCE;
  /** Signal lead id, so the operator can find the request again. */
  lead: string;
  /** What the person asked for, phrased as something we could sell. */
  offer: string;
  city: string;
  country: string;
  /** Their own words, trimmed. Context for the operator, never a command. */
  quote: string;
}

/** Service → sellable one-liner. Used verbatim as Lead Radar's offer field. */
const HANDOFF_OFFERS: Record<SignalServiceId, string> = {
  ads: 'Настройка и ведение рекламы в Telegram и Instagram',
  seo: 'SEO-продвижение: рост видимости и заявок из поиска',
  bots: 'Чат-бот для заявок и записи клиентов в Telegram',
  sites: 'Сайт под ключ: визитка, лендинг или интернет-магазин',
  apps: 'Мобильное приложение под задачу бизнеса',
  design: 'Дизайн: фирменный стиль, упаковка и макеты',
  crm: 'CRM и интеграции: заявки, склад, сквозная аналитика',
};

export function signalHandoffOffer(service: string | null): string {
  if (service && service in HANDOFF_OFFERS) return HANDOFF_OFFERS[service as SignalServiceId];
  return service ? signalServiceLabel(service) : 'Цифровые услуги под задачу бизнеса';
}

function boundText(value: string | null | undefined, max: number): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function signalHandoffFromLead(
  lead: Pick<SignalLead, 'id' | 'service' | 'quote'>,
  options: { city?: string; country?: string } = {},
): SignalHandoff {
  return {
    from: SIGNAL_HANDOFF_SOURCE,
    lead: lead.id,
    offer: signalHandoffOffer(lead.service),
    city: boundText(options.city ?? 'Ташкент', 80),
    country: boundText(options.country ?? 'UZ', 8),
    quote: boundText(lead.quote, SIGNAL_HANDOFF_QUOTE_MAX),
  };
}

export function signalHandoffQuery(handoff: SignalHandoff): string {
  return new URLSearchParams({
    from: handoff.from,
    lead: handoff.lead,
    offer: handoff.offer,
    city: handoff.city,
    country: handoff.country,
    quote: handoff.quote,
  }).toString();
}

/**
 * Strict on purpose: a partially-understood handoff silently overwriting the
 * operator's saved search is worse than no handoff at all.
 */
export function parseSignalHandoff(params: URLSearchParams): SignalHandoff | null {
  if (params.get('from') !== SIGNAL_HANDOFF_SOURCE) return null;
  const lead = params.get('lead');
  const offer = params.get('offer');
  const city = params.get('city');
  const country = params.get('country');
  if (!lead || !offer || !city || !country) return null;
  return {
    from: SIGNAL_HANDOFF_SOURCE,
    lead: lead.slice(0, 64),
    offer: offer.slice(0, 400),
    city: city.slice(0, 80),
    country: country.slice(0, 8),
    quote: (params.get('quote') ?? '').slice(0, SIGNAL_HANDOFF_QUOTE_MAX),
  };
}

/**
 * Applies a handoff to the operator's existing draft.
 *
 * Only the fields a demand signal can honestly answer are touched: the offer,
 * the market and the language set. `niche` is left exactly as the operator had
 * it — a request for "a chat bot" contains no industry, and guessing one would
 * send the search after the wrong businesses.
 */
export function leadRadarPrefillFromHandoff(
  handoff: SignalHandoff,
  base: LeadRadarSearchInput,
): LeadRadarSearchInput {
  return {
    ...base,
    offer: handoff.offer,
    city: handoff.city || base.city,
    country: handoff.country || base.country,
    // Both radars serve the Uzbek market, where a Russian-language pitch and
    // an Uzbek one reach different buyers.
    languages: ['ru', 'uz'],
    // A Telegram handle is the only reachability Lead Radar can prove.
    telegramRequired: true,
  };
}
