import { assessLeadRadarPhone } from '../../../src/shared/lead-radar-contacts';
import type { LeadRadarEvidence, LeadRadarSearchInput, LeadRadarSignal } from '../../../src/shared/lead-radar';
import { cleanTelegram, cleanText, sourceEvidence, staticCityBounds, telegramUsername } from './sources';
import { SourceYieldRecorder } from './source-yield';
import type { LeadRadarDiscoveryResult, LeadRadarSource, LeadRadarTelegramContact, SourceCandidate } from './types';

/**
 * 2GIS Places API catalog source.
 *
 * Why it exists: OpenStreetMap already yields a phone on 97% of the rows it
 * keeps, but only 12% carry a Telegram contact, because a Telegram handle is a
 * tag almost nobody fills in. 2GIS is a commercial catalog with far denser
 * coverage in Uzbekistan, and where the key permits `items.contact_groups` it
 * answers with social contacts as *structured fields* — no page crawl, no
 * guessing out of HTML.
 *
 * The honest caveat, measured before designing around it: 2GIS documents
 * `items.contact_groups` as paid information on demand. A key without that
 * permission answers HTTP 200 with every contact field silently absent. This
 * source therefore degrades instead of failing: with no contacts it still
 * yields names, addresses, websites and coordinates, which is worth having,
 * but the win is much smaller. `_probes-leadradar/_2gis_probe.mjs` measures
 * which case a given key is in.
 */

const API_ORIGIN = 'https://catalog.api.2gis.com';
const API_PATH = '/3.0/items';
const CLIENT_TIMEOUT_MS = 15_000;
/** 2GIS caps page_size; asking for more is how you earn a 400. */
const MAX_PAGE_SIZE = 50;

export interface TwoGisEnvironment {
  TWOGIS_API_KEY?: string;
}

/** Injectable so fixtures never reach the network. */
export type TwoGisFetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export interface TwoGisSourceOptions {
  fetchImpl?: TwoGisFetch;
  /** Overrides the wall clock; tests pin it. */
  now?: () => Date;
}

export const TWO_GIS_SOURCE_ID = '2gis_catalog';

/** Public permalink for an organisation. Deliberately NOT the API URL: the
 *  API request carries the key in its query string, and any URL we persist
 *  ends up in D1 and in the admin UI. */
export function twoGisFirmUrl(itemId: string): string {
  return `https://2gis.uz/firm/${encodeURIComponent(itemId)}`;
}

/**
 * 2GIS takes `location=lon,lat` plus a radius in metres, while the city table
 * holds `[south, west, north, east]`. The order trap is real — swapping lat
 * and lon silently searches the middle of the Indian Ocean.
 */
export function boundsToCircle(
  bounds: readonly [number, number, number, number],
): { lon: number; lat: number; radius: number } {
  const [south, west, north, east] = bounds;
  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  // Equirectangular approximation: at city scale the error is well inside the
  // few hundred metres we would round the radius to anyway.
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const halfHeight = ((north - south) / 2) * metresPerDegreeLat;
  const halfWidth = ((east - west) / 2) * metresPerDegreeLon;
  const diagonal = Math.hypot(halfHeight, halfWidth);
  return {
    lon: Number(lon.toFixed(6)),
    lat: Number(lat.toFixed(6)),
    radius: Math.max(1_000, Math.min(50_000, Math.round(diagonal))),
  };
}

/** Contact types we can turn into something actionable. Everything else in
 *  `contact_groups` (skype, viber, twitter…) is ignored rather than guessed. */
/** 2GIS spells the messenger type `telegram`; a longer spelling such as
 *  `telegram_channel` would be dropped by an exact match. Any type beginning
 *  with the name is that messenger. */
function isTelegramType(type: string): boolean {
  return type.startsWith('telegram');
}
const WEBSITE_TYPES = new Set(['website']);
const EMAIL_TYPES = new Set(['email']);
const PHONE_TYPES = new Set(['phone', 'whatsapp']);

interface TwoGisContact {
  type?: unknown;
  value?: unknown;
  url?: unknown;
  text?: unknown;
}

/**
 * 2GIS documents no single carrier field: a phone carries its number in
 * `value`, a website in `url`, some types in `text`. Reading all three is
 * defensive, not sloppy — the alternative is discovering per-type shapes in
 * production.
 */
function contactText(contact: TwoGisContact): string | null {
  for (const carrier of [contact.value, contact.url, contact.text]) {
    if (typeof carrier === 'string' && carrier.trim().length > 0) return carrier.trim();
  }
  return null;
}

export interface TwoGisExtractedContacts {
  phone: string | null;
  website: string | null;
  email: string | null;
  telegram: string | null;
  whatsapp: string | null;
}

export function extractTwoGisContacts(item: unknown): TwoGisExtractedContacts {
  const found: TwoGisExtractedContacts = {
    phone: null, website: null, email: null, telegram: null, whatsapp: null,
  };
  if (!item || typeof item !== 'object' || Array.isArray(item)) return found;
  const groups = (item as { contact_groups?: unknown }).contact_groups;
  if (!Array.isArray(groups)) return found;
  for (const group of groups) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    const contacts = (group as { contacts?: unknown }).contacts;
    if (!Array.isArray(contacts)) continue;
    for (const raw of contacts) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const contact = raw as TwoGisContact;
      const type = typeof contact.type === 'string' ? contact.type.toLowerCase() : '';
      const text = contactText(contact);
      if (!text) continue;
      if (PHONE_TYPES.has(type)) {
        // A WhatsApp entry is a phone number, so it is a phone first: it feeds
        // the same E.164 normaliser and the same dedup.
        if (type === 'whatsapp' && !found.whatsapp) found.whatsapp = text;
        if (!found.phone) found.phone = text;
      } else if (WEBSITE_TYPES.has(type) && !found.website) {
        found.website = text;
      } else if (EMAIL_TYPES.has(type) && !found.email) {
        found.email = text;
      } else if (isTelegramType(type) && !found.telegram) {
        found.telegram = text;
      }
    }
  }
  return found;
}

/** A Telegram handle, optionally prefixed with `@`, in the length Telegram
 *  itself allows. */
const TELEGRAM_HANDLE = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/;
const TELEGRAM_HOST_ONLY = /^(?:t|telegram)\.me\//i;

/**
 * Completes the shapes a catalog uses for a contact it has already typed as
 * `telegram`: a full URL, a URL without its scheme, an `@handle`, or a bare
 * handle. The shared cleaner accepts only the first and the third, and rightly
 * so — on a scraped page a bare word is far more often prose than a handle,
 * and guessing there would weaken the fail-closed contact model. A typed
 * contact field carries the one assertion the shared cleaner lacks, so the
 * shape is completed here and the shared cleaner still validates the handle.
 */
function twoGisTelegramUrl(raw: string | null): string | null {
  if (!raw) return null;
  const text = raw.trim();
  const handle = TELEGRAM_HANDLE.exec(text);
  if (handle) return cleanTelegram(`https://t.me/${handle[1]}`);
  if (TELEGRAM_HOST_ONLY.test(text)) return cleanTelegram(`https://${text}`);
  return cleanTelegram(text);
}

/** Item types that are not a business. 2GIS mixes buildings, streets and
 *  administrative divisions into the same result array. */
const NON_BUSINESS_TYPES = new Set([
  'building', 'street', 'adm_div', 'place', 'settlement', 'district', 'city',
  'region', 'country', 'crossroad', 'station', 'route', 'parking',
]);

export function twoGisItemType(item: unknown): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const type = (item as { type?: unknown }).type;
  return typeof type === 'string' ? type.toLowerCase() : null;
}

export function isTwoGisBusinessItem(item: unknown): boolean {
  const type = twoGisItemType(item);
  if (type === null) return false;
  return !NON_BUSINESS_TYPES.has(type);
}

function cleanWebsite(value: string | null): string | null {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanEmail(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? text.slice(0, 180) : null;
}

export function candidateFromTwoGisItem(
  item: unknown,
  input: LeadRadarSearchInput,
  observedAt: string,
): SourceCandidate | null {
  if (!isTwoGisBusinessItem(item)) return null;
  const raw = item as {
    id?: unknown; name?: unknown; address_name?: unknown; point?: { lat?: unknown; lon?: unknown };
    rubrics?: Array<{ name?: unknown }>; address?: { name?: unknown }; adm_div?: Array<{ name?: unknown }>;
  };
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const name = cleanText(raw.name, 160);
  if (!name || name.length < 2) return null;

  const sourceUrl = twoGisFirmUrl(id);
  const address = cleanText(raw.address_name ?? raw.address?.name, 200);
  const city = input.city;
  const rubric = cleanText(raw.rubrics?.[0]?.name, 120);
  const latitude = Number(raw.point?.lat);
  const longitude = Number(raw.point?.lon);
  const hasCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

  const contacts = extractTwoGisContacts(item);
  const phone = contacts.phone ? assessLeadRadarPhone(contacts.phone, input.country).e164 : null;
  const website = cleanWebsite(contacts.website);
  const email = cleanEmail(contacts.email);
  const telegram = twoGisTelegramUrl(contacts.telegram);

  const evidence: LeadRadarEvidence[] = [
    sourceEvidence('company.name', name, sourceUrl, 'official_open_data', 0.88, 'fact', observedAt),
  ];
  if (rubric) {
    evidence.push(sourceEvidence('company.category', rubric, sourceUrl, 'official_open_data', 0.86, 'fact', observedAt));
  }
  evidence.push(sourceEvidence(
    'locations.city', city, sourceUrl, 'official_open_data', 0.7, 'model_inference', observedAt,
  ));
  if (address) {
    evidence.push(sourceEvidence('locations.address', address, sourceUrl, 'official_open_data', 0.84, 'fact', observedAt));
  }
  if (hasCoordinates) {
    evidence.push(sourceEvidence(
      'locations.coordinates', `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
      sourceUrl, 'official_open_data', 0.9, 'fact', observedAt,
    ));
  }
  if (website) {
    evidence.push(sourceEvidence('web.website_candidate', website, sourceUrl, 'official_open_data', 0.5, 'model_inference', observedAt));
  }
  if (phone) {
    evidence.push(sourceEvidence('company_contacts.phone', phone, sourceUrl, 'official_open_data', 0.8, 'company_data', observedAt));
  }
  if (email) {
    evidence.push(sourceEvidence('company_contacts.generic_email', email, sourceUrl, 'official_open_data', 0.8, 'company_data', observedAt));
  }

  // WhatsApp is worth recording as a signal, not just as another phone: a
  // number published as WhatsApp is directly messageable, which is the whole
  // point of the export.
  let whatsappSignal: LeadRadarSignal[] = [];
  if (contacts.whatsapp) {
    const evidenceItem = sourceEvidence(
      'company_contacts.whatsapp', contacts.whatsapp, sourceUrl,
      'official_open_data', 0.6, 'company_data', observedAt,
    );
    evidence.push(evidenceItem);
    whatsappSignal = [{
      type: 'messenger',
      label: 'whatsapp',
      classification: 'model_inference',
      evidenceIds: [evidenceItem.id],
      observedAt,
    }];
  }

  let telegramContact: LeadRadarTelegramContact | null = null;
  if (telegram) {
    const username = telegramUsername(telegram);
    const evidenceItem = sourceEvidence(
      'web.telegram.unknown', telegram, sourceUrl, 'official_open_data', 0.45, 'model_inference', observedAt,
    );
    evidence.push(evidenceItem);
    telegramContact = {
      url: telegram,
      username,
      // A catalog listing a messenger does not say who reads it. Kept
      // un-messageable on purpose: the same fail-closed rule the OSM path uses.
      type: 'unknown',
      messageable: false,
      reason: 'Telegram указан в каталоге 2GIS; принадлежность компании и тип адресата не подтверждены',
      confidence: 0.45,
      evidenceIds: [evidenceItem.id],
      verifiedAt: evidenceItem.observedAt,
    };
  }

  return {
    sourceId: `2gis:${id}`,
    sourceUrl,
    name,
    category: rubric ?? input.niche,
    city,
    country: input.country,
    address,
    website,
    phone,
    genericEmail: email,
    telegramUrl: null,
    telegramContact,
    decisionMakers: [],
    enrichmentStatus: website ? 'pending' : 'terminal',
    enrichmentReason: website ? null : 'no_website',
    enrichmentAttempts: 0,
    evidence,
    signals: whatsappSignal,
  };
}

export class TwoGisLeadSource implements LeadRadarSource {
  readonly id = TWO_GIS_SOURCE_ID;

  private readonly fetchImpl: TwoGisFetch;

  private readonly now: () => Date;

  constructor(
    private readonly env: TwoGisEnvironment,
    options: TwoGisSourceOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl
      ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
  }

  /** Null when the source is not configured, so the caller can skip it
   *  without a wasted request. */
  get apiKey(): string | null {
    const key = this.env.TWOGIS_API_KEY?.trim();
    return key && key.length > 0 ? key : null;
  }

  async discover(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult> {
    const key = this.apiKey;
    const yieldRecorder = new SourceYieldRecorder({ city: input.city, niche: input.niche });
    if (!key) {
      yieldRecorder.log({ plansRun: ['skipped'], reason: 'no_api_key' });
      return { candidates: [], sourceWarnings: ['two_gis_not_configured'], sourceYield: yieldRecorder.snapshot() };
    }

    const bounds = staticCityBounds(input.city, input.country);
    if (!bounds) {
      yieldRecorder.log({ plansRun: ['skipped'], reason: 'city_unknown' });
      return { candidates: [], sourceWarnings: ['two_gis_city_unknown'], sourceYield: yieldRecorder.snapshot() };
    }

    const circle = boundsToCircle(bounds);
    const params = new URLSearchParams({
      q: input.niche,
      location: `${circle.lon},${circle.lat}`,
      radius: String(circle.radius),
      page_size: String(Math.min(MAX_PAGE_SIZE, Math.max(1, input.desiredCount * 2))),
      fields: 'items.contact_groups,items.contact_groups.contacts,items.address,items.point,items.rubrics,items.name_ex,items.org',
      key,
    });
    const requestUrl = `${API_ORIGIN}${API_PATH}?${params}`;
    // The key lives in that query string. Nothing built from `requestUrl` may
    // ever be persisted or logged; only the parsed items carry forward.
    const redactedUrl = `${API_ORIGIN}${API_PATH}?q=…&location=…&key=***`;

    let payload: unknown;
    try {
      const response = await this.fetchImpl(requestUrl, { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
      if (!response.ok) {
        yieldRecorder.log({ plansRun: ['failed'], reason: `http_${response.status}` });
        return {
          candidates: [],
          sourceWarnings: [`two_gis_http_${response.status}`],
          sourceYield: yieldRecorder.snapshot(),
        };
      }
      payload = await response.json();
    } catch (error) {
      const reason = String(error).includes('abort') ? 'two_gis_timeout' : 'two_gis_unavailable';
      yieldRecorder.log({ plansRun: ['failed'], reason });
      // Fail soft. The OSM source runs alongside this one and must still be
      // able to complete the search.
      return { candidates: [], sourceWarnings: [reason], sourceYield: yieldRecorder.snapshot() };
    }

    const items = (payload as { result?: { items?: unknown } })?.result?.items;
    if (!Array.isArray(items)) {
      yieldRecorder.log({ plansRun: ['failed'], reason: 'invalid_payload', url: redactedUrl });
      return {
        candidates: [],
        sourceWarnings: ['two_gis_invalid_payload'],
        sourceYield: yieldRecorder.snapshot(),
      };
    }

    const observedAt = this.now().toISOString();
    const candidates: SourceCandidate[] = [];
    let skipped = 0;
    for (const item of items) {
      const candidate = candidateFromTwoGisItem(item, input, observedAt);
      if (!candidate) { skipped += 1; continue; }
      candidates.push(candidate);
      yieldRecorder.recordCandidate(this.id, candidate);
    }

    const warnings: string[] = [];
    const hasContacts = candidates.some((candidate) => candidate.phone || candidate.website || candidate.telegramContact);
    if (!hasContacts && candidates.length > 0) {
      // The measurable signal that the key lacks the contact_groups permission.
      // Without this line the failure mode is "2GIS returned names and nothing
      // else", which looks like a parser bug from the outside.
      warnings.push('two_gis_contacts_absent');
    }
    if (skipped > 0) warnings.push(`two_gis_skipped_${Math.min(skipped, 99)}`);

    yieldRecorder.log({
      plansRun: ['catalog'],
      rawDiscoveredCount: items.length,
      url: redactedUrl,
    });
    return {
      candidates,
      sourceWarnings: warnings,
      rawDiscoveredCount: items.length,
      sourceYield: yieldRecorder.snapshot(),
    };
  }
}
