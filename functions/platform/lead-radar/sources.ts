import type {
  LeadRadarEvidence,
  LeadRadarSearchInput,
  LeadRadarSignal,
  LeadRadarSignalType,
} from '../../../src/shared/lead-radar';
import type { LeadRadarDiscoveryResult, LeadRadarSource, SourceCandidate } from './types';
import { normalizeCompanyKey, safePublicHttpUrl } from './validation';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;
const USER_AGENT = 'GPTBot-Lead-Radar/1.0 (+https://gptbot.uz; admin-only evidence discovery)';
const MAX_WEBSITE_BYTES = 450_000;
const MAX_SITE_ENRICHMENTS = 12;

interface NominatimResult {
  boundingbox?: [string, string, string, string];
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface WebsiteFacts {
  website: string;
  phone: string | null;
  genericEmail: string | null;
  telegramUrl: string | null;
  evidence: LeadRadarEvidence[];
  signals: LeadRadarSignal[];
}

const NICHE_FILTERS: Array<{ match: RegExp; category: string; filters: string[] }> = [
  { match: /стомат|dent|tish|dental|ортод/i, category: 'Стоматология', filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
  { match: /клиник|clinic|медицин|medical|shifox/i, category: 'Клиника', filters: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"="clinic"]'] },
  { match: /салон|beauty|красот|go.zallik|парикмах|hair/i, category: 'Красота', filters: ['["shop"="beauty"]', '["shop"="hairdresser"]'] },
  { match: /недвиж|real.?estate|риелтор|риэлтор|ko.chmas/i, category: 'Недвижимость', filters: ['["office"="estate_agent"]'] },
  { match: /учеб|образован|education|training|o.quv|школ|курс/i, category: 'Образование', filters: ['["amenity"="language_school"]', '["amenity"="training"]', '["amenity"="college"]'] },
  { match: /авто|car|машин|autosalon/i, category: 'Авто', filters: ['["shop"="car"]', '["shop"="car_repair"]', '["amenity"="car_repair"]'] },
  { match: /ресторан|кафе|достав|restaurant|cafe|horeca|овқат|ovqat/i, category: 'HoReCa', filters: ['["amenity"="restaurant"]', '["amenity"="cafe"]', '["amenity"="fast_food"]'] },
  { match: /фитнес|спортзал|fitness|gym|sport/i, category: 'Фитнес', filters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'] },
  { match: /магазин|shop|докон|do.kon|retail/i, category: 'Розничная торговля', filters: ['["shop"]'] },
];

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sourceEvidence(
  fieldPath: string,
  value: string,
  sourceUrl: string,
  sourceType: LeadRadarEvidence['sourceType'],
  confidence: number,
  classification: LeadRadarEvidence['classification'] = 'fact',
): LeadRadarEvidence {
  return {
    id: `ev_${crypto.randomUUID().replaceAll('-', '')}`,
    fieldPath,
    value,
    sourceUrl,
    sourceType,
    observedAt: new Date().toISOString(),
    confidence,
    classification,
  };
}

function cleanPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(/[;,/]/)[0]?.trim() ?? '';
  const compact = first.replace(/[^+\d]/g, '');
  return /^\+?\d{7,15}$/.test(compact) ? compact : null;
}

function cleanTelegram(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.startsWith('@') ? `https://t.me/${value.slice(1)}` : value;
  const url = safePublicHttpUrl(candidate);
  if (!url || !['t.me', 'telegram.me'].includes(url.hostname.toLowerCase())) return null;
  const handle = url.pathname.split('/').filter(Boolean)[0] ?? '';
  if (!/^[-A-Za-z0-9_+]{4,64}$/.test(handle)) return null;
  return `https://t.me/${handle}`;
}

function cleanWebsite(value: string | null | undefined): string | null {
  const url = safePublicHttpUrl(value);
  if (!url) return null;
  if (url.hostname === 't.me' || url.hostname === 'telegram.me') return null;
  return url.toString();
}

function genericEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  const local = normalized.split('@')[0] ?? '';
  return /^(info|sales|office|hello|contact|support|admin|marketing|reception|booking|zakaz|order|mail)$/i.test(local)
    ? normalized
    : null;
}

function addressFrom(tags: Record<string, string>): string | null {
  const full = tags['addr:full'];
  if (full) return full;
  const parts = [tags['addr:street'], tags['addr:housenumber'], tags['addr:district']].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function queryDefinition(niche: string): { category: string; filters: string[] } {
  const matched = NICHE_FILTERS.find((item) => item.match.test(niche));
  if (matched) return { category: matched.category, filters: matched.filters };
  const escaped = niche.replace(/[\\"\n\r]/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 70);
  return { category: niche, filters: [`["name"~"${escaped}",i]`] };
}

async function geocode(input: LeadRadarSearchInput): Promise<[number, number, number, number]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: `${input.city}, ${input.country}`,
    limit: '1',
    addressdetails: '0',
  });
  const response = await fetchWithTimeout(`${NOMINATIM_ENDPOINT}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Referer: 'https://gptbot.uz/' },
  }, 12_000);
  if (!response.ok) throw new Error('nominatim_unavailable');
  const rows = await response.json() as NominatimResult[];
  const bounds = rows[0]?.boundingbox?.map(Number);
  if (!bounds || bounds.length !== 4 || bounds.some((item) => !Number.isFinite(item))) {
    throw new Error('city_not_found');
  }
  return [bounds[0], bounds[2], bounds[1], bounds[3]];
}

function buildOverpassQuery(input: LeadRadarSearchInput, bounds: [number, number, number, number]): { query: string; category: string } {
  const definition = queryDefinition(input.niche);
  const bbox = bounds.join(',');
  const lines = definition.filters.map((filter) => `nwr${filter}(${bbox});`).join('\n');
  return {
    category: definition.category,
    query: `[out:json][timeout:24];\n(\n${lines}\n);\nout tags center ${Math.min(150, input.desiredCount * 4)};`,
  };
}

async function overpass(query: string): Promise<OverpassResponse> {
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': USER_AGENT,
          Referer: 'https://gptbot.uz/',
        },
        body: new URLSearchParams({ data: query }),
      }, 35_000);
      if (!response.ok) throw new Error(`overpass_${response.status}`);
      return await response.json() as OverpassResponse;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('overpass_unavailable');
}

function candidateFromElement(
  element: OverpassElement,
  input: LeadRadarSearchInput,
  fallbackCategory: string,
): SourceCandidate | null {
  const tags = element.tags ?? {};
  const name = tags['name:ru'] || tags['name:uz'] || tags.name || tags.brand;
  if (!name || name.trim().length < 2) return null;
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const category = tags['healthcare:speciality'] || tags.healthcare || tags.amenity || tags.shop || tags.office || fallbackCategory;
  const address = addressFrom(tags);
  const website = cleanWebsite(tags['contact:website'] || tags.website || null);
  const phone = cleanPhone(tags['contact:phone'] || tags.phone || null);
  const email = genericEmail(tags['contact:email'] || tags.email || null);
  const telegram = cleanTelegram(tags['contact:telegram'] || tags.telegram || tags['social:telegram'] || null);
  const evidence: LeadRadarEvidence[] = [
    sourceEvidence('company.name', name.trim(), sourceUrl, 'openstreetmap', 0.82),
    sourceEvidence('company.category', category, sourceUrl, 'openstreetmap', 0.78),
    sourceEvidence('locations.city', input.city, sourceUrl, 'openstreetmap', 0.8),
  ];
  if (address) evidence.push(sourceEvidence('locations.address', address, sourceUrl, 'openstreetmap', 0.82));
  if (website) evidence.push(sourceEvidence('web.website', website, sourceUrl, 'openstreetmap', 0.78));
  if (phone) evidence.push(sourceEvidence('company_contacts.phone', phone, sourceUrl, 'openstreetmap', 0.74, 'company_data'));
  if (email) evidence.push(sourceEvidence('company_contacts.generic_email', email, sourceUrl, 'openstreetmap', 0.74, 'company_data'));
  if (telegram) evidence.push(sourceEvidence('web.telegram', telegram, sourceUrl, 'openstreetmap', 0.74, 'company_data'));

  return {
    sourceId: `osm:${element.type}:${element.id}`,
    sourceUrl,
    name: name.trim(),
    category,
    city: input.city,
    country: input.country,
    address,
    website,
    phone,
    genericEmail: email,
    telegramUrl: telegram,
    evidence,
    signals: [],
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameOriginLinks(html: string, base: URL): URL[] {
  const links: URL[] = [];
  const pattern = /href\s*=\s*["']([^"'#]+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], base);
      if (url.origin !== base.origin) continue;
      if (!/(contact|kontakt|aloqa|about|company|vakans|career|service|uslug)/i.test(url.pathname)) continue;
      url.hash = '';
      if (!links.some((item) => item.toString() === url.toString())) links.push(url);
      if (links.length >= 2) break;
    } catch {
      // Ignore malformed page links.
    }
  }
  return links;
}

function robotsAllows(robots: string): boolean {
  const lines = robots.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim());
  let applies = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*';
    if (applies && key === 'disallow' && value === '/') return false;
  }
  return true;
}

async function fetchText(url: URL, maxRedirects = 2): Promise<{ url: URL; html: string } | null> {
  let current = url;
  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const response = await fetchWithTimeout(current, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    }, 9_000);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      const next = safePublicHttpUrl(new URL(location, current).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) return null;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(length) && length > MAX_WEBSITE_BYTES) return null;
    const html = (await response.text()).slice(0, MAX_WEBSITE_BYTES);
    return { url: current, html };
  }
  return null;
}

export function extractCompanyPageFacts(pageUrl: URL, html: string): Omit<WebsiteFacts, 'website'> {
  const text = stripHtml(html);
  const telegramMatch = html.match(/https?:\/\/(?:t\.me|telegram\.me)\/[-A-Za-z0-9_+]{4,64}/i);
  const emailMatches = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => genericEmail(match[0]))
    .filter((item): item is string => Boolean(item));
  const phoneMatches = [...text.matchAll(/(?:\+998|998)[\s()-]*\d{2}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g)]
    .map((match) => cleanPhone(match[0]))
    .filter((item): item is string => Boolean(item));
  const telegramUrl = cleanTelegram(telegramMatch?.[0] ?? null);
  const genericEmailValue = emailMatches[0] ?? null;
  const phone = phoneMatches[0] ?? null;
  const evidence: LeadRadarEvidence[] = [
    sourceEvidence('web.website', pageUrl.origin, pageUrl.toString(), 'company_website', 0.94),
  ];
  if (telegramUrl) evidence.push(sourceEvidence('web.telegram', telegramUrl, pageUrl.toString(), 'company_website', 0.94, 'company_data'));
  if (genericEmailValue) evidence.push(sourceEvidence('company_contacts.generic_email', genericEmailValue, pageUrl.toString(), 'company_website', 0.92, 'company_data'));
  if (phone) evidence.push(sourceEvidence('company_contacts.phone', phone, pageUrl.toString(), 'company_website', 0.9, 'company_data'));

  const signalPatterns: Array<{ type: LeadRadarSignalType; label: string; pattern: RegExp }> = [
    { type: 'online_booking', label: 'онлайн-запись', pattern: /онлайн[- ]?(?:запис|бронир)|online booking|qabulga yozil/i },
    { type: 'contact_form', label: 'форма заявки', pattern: /остав(?:ить|ьте) (?:заявку|контакт)|форма (?:заявки|обратной связи)|submit request|ariza qoldir/i },
    { type: 'messenger', label: 'мессенджер', pattern: /whatsapp|telegram|direct/i },
    { type: 'hiring', label: 'вакансия или найм', pattern: /ваканси|ищем (?:администратор|оператор|менеджер)|career|job opening|bo.sh ish/i },
    { type: 'tender', label: 'тендер или закупка', pattern: /тендер|закупк|tender|procurement/i },
    { type: 'new_branch', label: 'новый филиал или расширение', pattern: /нов(?:ый|ого) филиал|открыли филиал|new branch|yangi filial/i },
  ];
  const signals: LeadRadarSignal[] = [];
  for (const item of signalPatterns) {
    if (!item.pattern.test(text)) continue;
    const evidenceItem = sourceEvidence(`signals.${item.type}`, item.label, pageUrl.toString(), 'company_website', 0.84);
    evidence.push(evidenceItem);
    signals.push({
      type: item.type,
      label: item.label,
      classification: 'fact',
      evidenceIds: [evidenceItem.id],
      observedAt: evidenceItem.observedAt,
    });
  }
  const activeEvidence = sourceEvidence('signals.active_website', 'Сайт отвечает', pageUrl.toString(), 'company_website', 0.96);
  evidence.push(activeEvidence);
  signals.push({
    type: 'active_website',
    label: 'активный сайт',
    classification: 'fact',
    evidenceIds: [activeEvidence.id],
    observedAt: activeEvidence.observedAt,
  });

  return { phone, genericEmail: genericEmailValue, telegramUrl, evidence, signals };
}

export async function enrichCompanyWebsite(website: string): Promise<WebsiteFacts | null> {
  const start = safePublicHttpUrl(website);
  if (!start) return null;
  try {
    const robotsUrl = new URL('/robots.txt', start);
    const robotsResponse = await fetchWithTimeout(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
    }, 5_000);
    if (robotsResponse.ok && !robotsAllows((await robotsResponse.text()).slice(0, 100_000))) return null;
  } catch {
    // A missing robots file does not block a public homepage fetch.
  }

  try {
    const home = await fetchText(start);
    if (!home) return null;
    const pages = [home];
    for (const link of sameOriginLinks(home.html, home.url)) {
      const page = await fetchText(link, 1);
      if (page) pages.push(page);
    }
    const facts = pages.map((page) => extractCompanyPageFacts(page.url, page.html));
    return {
      website: home.url.origin,
      phone: facts.find((item) => item.phone)?.phone ?? null,
      genericEmail: facts.find((item) => item.genericEmail)?.genericEmail ?? null,
      telegramUrl: facts.find((item) => item.telegramUrl)?.telegramUrl ?? null,
      evidence: facts.flatMap((item) => item.evidence),
      signals: facts.flatMap((item) => item.signals).filter((signal, index, all) => (
        all.findIndex((candidate) => candidate.type === signal.type) === index
      )),
    };
  } catch {
    return null;
  }
}

async function enrichCandidates(candidates: SourceCandidate[]): Promise<SourceCandidate[]> {
  const queue = candidates.filter((candidate) => candidate.website).slice(0, MAX_SITE_ENRICHMENTS);
  const enriched = new Map<string, WebsiteFacts>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const candidate = queue[index];
      if (!candidate?.website) continue;
      const facts = await enrichCompanyWebsite(candidate.website);
      if (facts) enriched.set(candidate.sourceId, facts);
    }
  });
  await Promise.all(workers);

  return candidates.map((candidate) => {
    const facts = enriched.get(candidate.sourceId);
    if (!facts) return candidate;
    return {
      ...candidate,
      website: facts.website,
      phone: facts.phone ?? candidate.phone,
      genericEmail: facts.genericEmail ?? candidate.genericEmail,
      telegramUrl: facts.telegramUrl ?? candidate.telegramUrl,
      evidence: [...candidate.evidence, ...facts.evidence],
      signals: [...candidate.signals, ...facts.signals],
    };
  });
}

export class OpenStreetMapLeadSource implements LeadRadarSource {
  readonly id = 'openstreetmap';

  async discover(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult> {
    const bounds = await geocode(input);
    const { query, category } = buildOverpassQuery(input, bounds);
    const response = await overpass(query);
    const candidates = (response.elements ?? [])
      .map((element) => candidateFromElement(element, input, category))
      .filter((item): item is SourceCandidate => Boolean(item));

    const deduped = new Map<string, SourceCandidate>();
    for (const candidate of candidates) {
      const key = candidate.website
        ? new URL(candidate.website).hostname.replace(/^www\./, '')
        : `${normalizeCompanyKey(candidate.name)}:${normalizeCompanyKey(candidate.address ?? input.city)}`;
      const existing = deduped.get(key);
      if (!existing || candidate.evidence.length > existing.evidence.length) deduped.set(key, candidate);
    }
    const enriched = await enrichCandidates([...deduped.values()].slice(0, Math.min(80, input.desiredCount * 3)));
    return { candidates: enriched, sourceWarnings: [] };
  }
}
