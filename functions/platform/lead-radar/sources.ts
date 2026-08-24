import type {
  LeadRadarEvidence,
  LeadRadarSearchInput,
  LeadRadarSignal,
  LeadRadarSignalType,
} from '../../../src/shared/lead-radar';
import {
  LeadRadarSourceError,
  type LeadRadarDecisionMaker,
  type LeadRadarDiscoveryResult,
  type LeadRadarGeocodeStore,
  type LeadRadarSource,
  type LeadRadarTelegramContact,
  type SourceCandidate,
  type TelegramContactType,
} from './types';
import { normalizeCompanyKey, safePublicHttpUrl } from './validation';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  { id: 'lz4', url: 'https://lz4.overpass-api.de/api/interpreter' },
  { id: 'private_coffee', url: 'https://overpass.private.coffee/api/interpreter' },
  { id: 'z', url: 'https://z.overpass-api.de/api/interpreter' },
] as const;
const USER_AGENT = 'GPTBot-Lead-Radar/1.1 (+https://gptbot.uz; contact: info@gptbot.uz)';
const MAX_WEBSITE_BYTES = 450_000;
const MAX_OVERPASS_BYTES = 2_000_000;
const MAX_GEOCODER_BYTES = 64_000;
const MAX_ROBOTS_BYTES = 100_000;
// A shared hard budget below the Workers Free ceiling covers discovery,
// DNS checks, redirects, robots and pages together.
const MAX_SOURCE_SUBREQUESTS = 45;
const MAX_SITE_ENRICHMENTS = 6;

const STATIC_CITY_BOUNDS = new Map<string, [number, number, number, number]>([
  ['ташкент:uz', [41.1577334, 69.1217970, 41.4224955, 69.5259080]],
  ['tashkent:uz', [41.1577334, 69.1217970, 41.4224955, 69.5259080]],
  ['toshkent:uz', [41.1577334, 69.1217970, 41.4224955, 69.5259080]],
]);
const geocodeCache = new Map<string, [number, number, number, number]>();

interface NominatimResult {
  boundingbox?: [string, string, string, string];
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: unknown[];
}

interface WebsiteFacts {
  website: string;
  phone: string | null;
  genericEmail: string | null;
  telegramUrl: string | null;
  telegramContact: LeadRadarTelegramContact | null;
  decisionMakers: LeadRadarDecisionMaker[];
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

class SubrequestBudget {
  constructor(private remaining: number) {}

  take(): void {
    if (this.remaining <= 0) throw new LeadRadarSourceError('source_timeout', ['subrequest_budget_exhausted']);
    this.remaining -= 1;
  }
}

async function fetchWithin<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  ms: number,
  budget: SubrequestBudget,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  budget.take();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let response: Response | null = null;
  try {
    response = await fetch(input, { ...init, signal: controller.signal });
    return await consume(response);
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.bodyUsed) {
      try { await response.body.cancel(); } catch { /* Connection is already closed. */ }
    }
  }
}

async function readTextBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new LeadRadarSourceError('upstream_payload_invalid', ['content_length_exceeded']);
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new LeadRadarSourceError('upstream_payload_invalid', ['body_limit_exceeded']);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new LeadRadarSourceError('upstream_payload_invalid', ['body_limit_exceeded']);
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || !value) return null;
  const printable = [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  const normalized = printable.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized.slice(0, max) : null;
}

interface DnsJsonResponse {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
}

const dnsSafetyCache = new Map<string, { safe: boolean; expiresAt: number }>();

function isPrivateAddress(value: string): boolean {
  const address = value.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const mappedDotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedDotted) return isPrivateAddress(mappedDotted[1]);
  const mappedHex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (!address.includes(':')) return true;
  return address === '::' || address === '::1'
    || address.startsWith('fc') || address.startsWith('fd')
    || /^fe[89a-f]/.test(address)
    || address.startsWith('ff')
    || address.startsWith('2002:')
    || address.startsWith('64:ff9b:')
    || address.startsWith('::ffff:')
    || address.includes('127.0.0.1')
    || address.includes('169.254.')
    || address.includes('192.168.');
}

async function resolveDns(hostname: string, type: 'A' | 'AAAA', budget: SubrequestBudget): Promise<string[]> {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.searchParams.set('name', hostname);
  endpoint.searchParams.set('type', type);
  return fetchWithin(
    endpoint,
    { headers: { Accept: 'application/dns-json' } },
    4_000,
    budget,
    async (response) => {
      if (!response.ok) throw new Error('dns_unavailable');
      const payload = JSON.parse(await readTextBounded(response, 32_000)) as DnsJsonResponse;
      if (payload.Status !== 0 && payload.Status !== 3) throw new Error('dns_invalid_status');
      return (payload.Answer ?? [])
        .filter((answer) => answer.type === (type === 'A' ? 1 : 28) && typeof answer.data === 'string')
        .map((answer) => String(answer.data));
    },
  );
}

async function hasOnlyPublicAddresses(url: URL, budget: SubrequestBudget): Promise<boolean> {
  const cached = dnsSafetyCache.get(url.hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.safe;
  try {
    // Sequential lookups keep concurrent outbound connections below the
    // Workers ceiling while several company sites are enriched in parallel.
    const ipv4 = await resolveDns(url.hostname, 'A', budget);
    const ipv6 = await resolveDns(url.hostname, 'AAAA', budget);
    const addresses = [...ipv4, ...ipv6];
    const safe = addresses.length > 0 && addresses.every((address) => !isPrivateAddress(address));
    dnsSafetyCache.set(url.hostname, { safe, expiresAt: Date.now() + 30_000 });
    return safe;
  } catch {
    dnsSafetyCache.set(url.hostname, { safe: false, expiresAt: Date.now() + 30_000 });
    return false;
  }
}

function sourceEvidence(
  fieldPath: string,
  value: string,
  sourceUrl: string,
  sourceType: LeadRadarEvidence['sourceType'],
  confidence: number,
  classification: LeadRadarEvidence['classification'] = 'fact',
  observedAt = new Date().toISOString(),
): LeadRadarEvidence {
  return {
    id: `ev_${crypto.randomUUID().replaceAll('-', '')}`,
    fieldPath,
    value,
    sourceUrl,
    sourceType,
    observedAt,
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
  if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) return null;
  if (['share', 'joinchat', 'proxy', 'socks', 'login', 'iv', 'addstickers', 'setlanguage'].includes(handle.toLowerCase())) return null;
  return `https://t.me/${handle}`;
}

const DECISION_ROLE_PATTERN = /(?:генеральн(?:ый|ая)\s+директор|коммерческ(?:ий|ая)\s+директор|исполнительн(?:ый|ая)\s+директор|главн(?:ый|ая)\s+врач|директор|основател(?:ь|ница)|соосновател(?:ь|ница)|владел(?:ец|ица)|собственни(?:к|ца)|руководител(?:ь|ница)|управляющ(?:ий|ая)|bosh\s+(?:direktor|shifokor)|ijrochi\s+direktor|tijorat\s+direktori|direktor|asoschi|hammuassis|egasi|rahbar|chief\s+executive\s+officer|chief\s+marketing\s+officer|managing\s+director|executive\s+director|general\s+manager|head\s+of\s+marketing|co[- ]founder|founder|owner|director|ceo|cmo)/iu;
const CYRILLIC_NAME_PATTERN = /(?<![А-ЯЁҚҒҲЎа-яёқғҳў])[А-ЯЁҚҒҲЎ][а-яёқғҳў]{1,}(?:[-'][А-ЯЁҚҒҲЎ]?[а-яёқғҳў]{1,})?(?:\s+[А-ЯЁҚҒҲЎ][а-яёқғҳў]{1,}(?:[-'][А-ЯЁҚҒҲЎ]?[а-яёқғҳў]{1,})?){1,2}(?![А-ЯЁҚҒҲЎа-яёқғҳў])/gu;
const LATIN_NAME_PATTERN = /\b[A-Z][a-zʻʼ’'-]{1,}(?:\s+[A-Z][a-zʻʼ’'-]{1,}){1,2}\b/g;
const PERSON_NAME_STOP_WORDS = new Set([
  'telegram', 'instagram', 'facebook', 'youtube', 'linkedin', 'whatsapp',
  'chief', 'executive', 'officer', 'general', 'manager', 'managing', 'director',
  'head', 'marketing', 'коммерческий', 'генеральный', 'исполнительный', 'главный',
  'врач', 'директор', 'основатель', 'владелец', 'руководитель', 'управляющий',
  'наша', 'наши', 'наш', 'команда', 'контакты', 'руководство', 'директоримиз',
  'bosh', 'direktor', 'shifokor', 'rahbar', 'asoschi', 'egasi', 'jamoa',
  'clinic', 'company', 'center', 'centre', 'dental', 'group', 'hospital',
  'medical', 'school', 'academy', 'restaurant', 'salon', 'studio', 'agency',
  'leadership', 'team', 'staff', 'management', 'our', 'meet',
  'клиника', 'компания', 'центр', 'стоматология', 'группа', 'медицинский',
  'школа', 'академия', 'ресторан', 'салон', 'агентство', 'доктор',
  'сотрудники', 'персонал', 'познакомьтесь',
  'klinika', 'markaz', 'kompaniya', 'tibbiyot', 'maktab', 'akademiya',
  'tashkent', 'toshkent', 'uzbekistan', 'ташкент', 'узбекистан',
]);

export interface TelegramClassificationInput {
  username: string;
  context: string;
  isOfficialCompanyPage: boolean;
  hasNamedDecisionMaker: boolean;
}

export function classifyTelegramContact(input: TelegramClassificationInput): Pick<
  LeadRadarTelegramContact,
  'type' | 'confidence' | 'reason' | 'messageable'
> {
  const username = input.username.trim().replace(/^@/, '').toLowerCase();
  const context = input.context.toLowerCase();
  const botHandle = /(?:^|_)(?:bot|robot|chatbot|assistant)(?:_|$)/i.test(username)
    || /bot$/i.test(username);
  const botContext = /(?:телеграм\s*-?\s*бот|\btelegram\s*-?\s*bot\b|\bchatbot\b|(?:^|[\s(])бот(?=$|[\s).,!?:;]))/i.test(context);
  if (botHandle || botContext) {
    return { type: 'bot', confidence: botHandle ? 0.99 : 0.94, reason: 'Лексические признаки Telegram-бота', messageable: false };
  }
  if (/(?:канал|\bchannel\b|\byangiliklar\b|\bnews\s+channel\b|\brasmiy\s+kanal\b)/i.test(context)) {
    return { type: 'channel', confidence: 0.91, reason: 'Страница называет ссылку каналом', messageable: false };
  }
  if (/(?:группа|групповой\s+чат|\bgroup\b|\bcommunity\b|\bguruh\b|\bjamoa\b|\bumumiy\s+chat\b)/i.test(context)) {
    return { type: 'group', confidence: 0.91, reason: 'Страница называет ссылку группой или сообществом', messageable: false };
  }
  if (input.hasNamedDecisionMaker) {
    return { type: 'human', confidence: 0.96, reason: 'Ссылка указана рядом с именем и ролью руководителя', messageable: true };
  }
  if (input.isOfficialCompanyPage) {
    return { type: 'business', confidence: 0.86, reason: 'Корпоративная ссылка опубликована на официальном сайте', messageable: false };
  }
  return { type: 'unknown', confidence: 0.45, reason: 'Недостаточно доказательств типа Telegram-контакта', messageable: false };
}

function telegramUsername(url: string): string {
  try { return new URL(url).pathname.split('/').filter(Boolean)[0] ?? ''; } catch { return ''; }
}

function compactEvidenceSnippet(value: string, max = 360): string {
  const clean = cleanText(stripHtml(value), max + 40) ?? '';
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function normalizedPersonKey(name: string, role: string): string {
  return `${normalizeCompanyKey(name)}:${normalizeCompanyKey(role)}`;
}

function validPersonName(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  return words.every((word) => {
    const normalized = word.replace(/[-'ʻʼ’]/g, '').toLowerCase();
    return normalized.length >= 2 && !PERSON_NAME_STOP_WORDS.has(normalized);
  });
}

function personNameCandidates(value: string): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const candidates: string[] = [];
  for (const size of [3, 2]) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const candidate = words.slice(start, start + size).join(' ');
      if (validPersonName(candidate) && !candidates.includes(candidate)) candidates.push(candidate);
    }
  }
  return candidates;
}

function namesNearRole(text: string): Array<{ name: string; role: string; snippet: string }> {
  const results: Array<{ name: string; role: string; snippet: string }> = [];
  const roleMatcher = new RegExp(DECISION_ROLE_PATTERN.source, 'giu');
  for (const roleMatch of text.matchAll(roleMatcher)) {
    const role = cleanText(roleMatch[0], 100);
    if (!role || roleMatch.index === undefined) continue;
    const start = Math.max(0, roleMatch.index - 100);
    const end = Math.min(text.length, roleMatch.index + roleMatch[0].length + 100);
    const window = text.slice(start, end);
    const roleCenter = roleMatch.index - start + roleMatch[0].length / 2;
    const names: Array<{ name: string; distance: number }> = [];
    for (const pattern of [CYRILLIC_NAME_PATTERN, LATIN_NAME_PATTERN]) {
      pattern.lastIndex = 0;
      for (const match of window.matchAll(pattern)) {
        if (match.index === undefined) continue;
        for (const name of personNameCandidates(match[0])) {
          const offset = match[0].indexOf(name);
          const center = match.index + Math.max(0, offset) + name.length / 2;
          names.push({ name, distance: Math.abs(center - roleCenter) });
        }
      }
    }
    names.sort((a, b) => a.distance - b.distance);
    const nearest = names[0];
    if (!nearest || nearest.distance > 105) continue;
    const snippet = compactEvidenceSnippet(window);
    const key = normalizedPersonKey(nearest.name, role);
    if (!results.some((item) => normalizedPersonKey(item.name, item.role) === key)) {
      results.push({ name: nearest.name, role, snippet });
    }
  }
  return results.slice(0, 12);
}

function jsonLdPeople(html: string): Array<{ name: string; role: string; telegramUrl: string | null; snippet: string }> {
  const people: Array<{ name: string; role: string; telegramUrl: string | null; snippet: string }> = [];
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  let visited = 0;
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || visited >= 200 || !value || typeof value !== 'object') return;
    visited += 1;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    const rawType = node['@type'];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (types.some((item) => typeof item === 'string' && item.toLowerCase() === 'person')) {
      const name = typeof node.name === 'string' ? cleanText(node.name, 120) : null;
      const role = typeof node.jobTitle === 'string' ? cleanText(node.jobTitle, 120) : null;
      if (name && role && validPersonName(name) && DECISION_ROLE_PATTERN.test(role)) {
        const sameAs = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
        const telegramUrl = sameAs
          .filter((item): item is string => typeof item === 'string')
          .map((item) => cleanTelegram(item))
          .find((item): item is string => Boolean(item)) ?? null;
        people.push({ name, role, telegramUrl, snippet: `${name} — ${role} (JSON-LD Person)` });
      }
    }
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  for (const match of scripts) {
    try { visit(JSON.parse(match[1] ?? 'null'), 0); } catch { /* Invalid structured data is ignored. */ }
  }
  return people.slice(0, 12);
}

export interface OfficialSiteContactFacts {
  telegramContact: LeadRadarTelegramContact | null;
  decisionMakers: LeadRadarDecisionMaker[];
  evidence: LeadRadarEvidence[];
}

export function extractOfficialSiteContacts(
  pageUrl: URL,
  html: string,
  verifiedAt = new Date().toISOString(),
): OfficialSiteContactFacts {
  const text = stripHtml(html);
  const people = [
    ...namesNearRole(text).map((person) => ({ ...person, telegramUrl: null as string | null, structured: false })),
    ...jsonLdPeople(html).map((person) => ({ ...person, structured: true })),
  ];
  const decisionMakerMap = new Map<string, LeadRadarDecisionMaker>();
  const evidence: LeadRadarEvidence[] = [];
  for (const person of people) {
    const key = normalizedPersonKey(person.name, person.role);
    const existing = decisionMakerMap.get(key);
    const evidenceItem = sourceEvidence(
      'decision_makers.named_role',
      `${person.name} — ${person.role}`,
      pageUrl.toString(),
      'company_website',
      person.structured ? 0.97 : 0.86,
      'company_data',
      verifiedAt,
    );
    evidence.push(evidenceItem);
    const contactType: TelegramContactType = person.telegramUrl ? 'human' : 'unknown';
    const candidate: LeadRadarDecisionMaker = {
      id: existing?.id ?? `dm_${crypto.randomUUID().replaceAll('-', '')}`,
      name: person.name,
      role: person.role,
      telegramUrl: person.telegramUrl,
      telegramUsername: person.telegramUrl ? telegramUsername(person.telegramUrl) : null,
      contactType,
      confidence: person.structured ? 0.97 : 0.86,
      evidenceIds: [...(existing?.evidenceIds ?? []), evidenceItem.id],
      sourceUrl: pageUrl.toString(),
      evidence: person.snippet,
      verifiedAt,
    };
    if (!existing || candidate.confidence > existing.confidence || (!existing.telegramUrl && candidate.telegramUrl)) {
      decisionMakerMap.set(key, candidate);
    }
  }

  const contacts: LeadRadarTelegramContact[] = [];
  const telegramPattern = /https?:\/\/(?:t\.me|telegram\.me)\/[-A-Za-z0-9_+]{4,64}/gi;
  for (const match of html.matchAll(telegramPattern)) {
    if (match.index === undefined) continue;
    const telegramUrl = cleanTelegram(match[0]);
    if (!telegramUrl) continue;
    const username = telegramUsername(telegramUrl);
    const rawContext = html.slice(Math.max(0, match.index - 420), Math.min(html.length, match.index + match[0].length + 420));
    const context = compactEvidenceSnippet(rawContext);
    const normalizedContext = context.toLocaleLowerCase('ru');
    const linked = [...decisionMakerMap.values()].find((person) => (
      person.telegramUrl === telegramUrl
      || (
        normalizedContext.includes(person.name.toLocaleLowerCase('ru'))
        && normalizedContext.includes(person.role.toLocaleLowerCase('ru'))
      )
    ));
    const classification = classifyTelegramContact({
      username,
      context,
      isOfficialCompanyPage: true,
      hasNamedDecisionMaker: Boolean(linked),
    });
    const evidenceItem = sourceEvidence(
      `web.telegram.${classification.type}`,
      telegramUrl,
      pageUrl.toString(),
      'company_website',
      classification.confidence,
      'company_data',
      verifiedAt,
    );
    evidence.push(evidenceItem);
    const contact: LeadRadarTelegramContact = {
      url: telegramUrl,
      username,
      ...classification,
      evidenceIds: [evidenceItem.id],
      verifiedAt,
    };
    const duplicate = contacts.find((item) => item.url.toLowerCase() === telegramUrl.toLowerCase());
    if (!duplicate) contacts.push(contact);
    else if (contact.confidence > duplicate.confidence) Object.assign(duplicate, contact);
    if (linked && classification.type === 'human') {
      linked.telegramUrl = telegramUrl;
      linked.telegramUsername = username;
      linked.contactType = 'human';
      linked.confidence = Math.max(linked.confidence, classification.confidence);
      linked.evidenceIds = [...new Set([...linked.evidenceIds, evidenceItem.id])];
    }
  }

  const rank: Record<TelegramContactType, number> = {
    human: 6, business: 5, channel: 3, group: 2, unknown: 1, bot: 0,
  };
  contacts.sort((a, b) => rank[b.type] - rank[a.type] || b.confidence - a.confidence);
  return {
    telegramContact: contacts[0] ?? null,
    decisionMakers: [...decisionMakerMap.values()].sort((a, b) => b.confidence - a.confidence),
    evidence,
  };
}

function cleanWebsite(value: string | null | undefined): string | null {
  const url = safePublicHttpUrl(value);
  if (!url) return null;
  if (url.hostname === 't.me' || url.hostname === 'telegram.me') return null;
  if (url.hostname === 'gptbot.uz' || url.hostname.endsWith('.gptbot.uz')) return null;
  return url.toString();
}

function genericEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  const local = normalized.split('@')[0] ?? '';
  return /^(info|sales|office|hello|contact|support|admin|marketing|reception|booking|zakaz|order|mail)$/i.test(local)
    ? normalized
    : null;
}

function addressFrom(tags: Record<string, string>): string | null {
  const full = tags['addr:full'];
  if (full) return cleanText(full, 300);
  const parts = [tags['addr:street'], tags['addr:housenumber'], tags['addr:district']].filter(Boolean);
  return parts.length > 0 ? cleanText(parts.join(', '), 300) : null;
}

function queryDefinition(niche: string): { category: string; filters: string[] } {
  const matched = NICHE_FILTERS.find((item) => item.match.test(niche));
  if (matched) return { category: matched.category, filters: matched.filters };
  const escaped = niche.replace(/[\\"\n\r]/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 70);
  return { category: niche, filters: [`["name"~"${escaped}",i]`] };
}

async function geocode(
  input: LeadRadarSearchInput,
  budget: SubrequestBudget,
  store?: LeadRadarGeocodeStore,
): Promise<[number, number, number, number]> {
  const cacheKey = `${normalizeCompanyKey(input.city)}:${input.country.toLowerCase()}`;
  const staticBounds = STATIC_CITY_BOUNDS.get(cacheKey);
  if (staticBounds) return staticBounds;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;
  const durableCached = await store?.getGeocodeBounds(cacheKey, new Date().toISOString());
  if (durableCached) {
    geocodeCache.set(cacheKey, durableCached);
    return durableCached;
  }

  if (store) {
    const slotTime = new Date();
    const acquired = await store.acquireGeocoderSlot(
      slotTime.toISOString(),
      new Date(slotTime.getTime() + 1_100).toISOString(),
    );
    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 1_150));
      const afterWait = await store.getGeocodeBounds(cacheKey, new Date().toISOString());
      if (afterWait) return afterWait;
      throw new LeadRadarSourceError('source_timeout', ['nominatim_application_throttle']);
    }
  }

  const params = new URLSearchParams({
    format: 'jsonv2',
    q: `${input.city}, ${input.country}`,
    limit: '1',
    addressdetails: '0',
  });
  let payload: string;
  try {
    payload = await fetchWithin(
      `${NOMINATIM_ENDPOINT}?${params}`,
      { headers: { 'User-Agent': USER_AGENT, Referer: 'https://gptbot.uz/', Accept: 'application/json' } },
      12_000,
      budget,
      async (response) => {
        if (!response.ok) throw new LeadRadarSourceError('geocoder_unavailable', [`nominatim_http_${response.status}`]);
        return readTextBounded(response, MAX_GEOCODER_BYTES);
      },
    );
  } catch (error) {
    if (error instanceof LeadRadarSourceError) throw error;
    const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    throw new LeadRadarSourceError(timedOut ? 'source_timeout' : 'geocoder_unavailable', [timedOut ? 'nominatim_timeout' : 'nominatim_network']);
  }
  let rows: NominatimResult[];
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) throw new Error('not_array');
    rows = parsed as NominatimResult[];
  } catch (error) {
    if (error instanceof LeadRadarSourceError) throw error;
    throw new LeadRadarSourceError('upstream_payload_invalid', ['nominatim_invalid_json']);
  }
  const rawBounds = rows[0]?.boundingbox;
  const bounds = Array.isArray(rawBounds) && rawBounds.length === 4
    ? rawBounds.map((item) => typeof item === 'string' || typeof item === 'number' ? Number(item) : Number.NaN)
    : null;
  if (
    !bounds
    || bounds.some((item) => !Number.isFinite(item))
    || bounds[0] < -90 || bounds[0] > 90
    || bounds[1] < -90 || bounds[1] > 90
    || bounds[2] < -180 || bounds[2] > 180
    || bounds[3] < -180 || bounds[3] > 180
    || bounds[0] > bounds[1]
    || bounds[2] > bounds[3]
  ) {
    throw new LeadRadarSourceError('city_not_found');
  }
  const normalizedBounds: [number, number, number, number] = [bounds[0], bounds[2], bounds[1], bounds[3]];
  if (geocodeCache.size >= 100) geocodeCache.delete(geocodeCache.keys().next().value as string);
  geocodeCache.set(cacheKey, normalizedBounds);
  if (store) {
    const observedAt = new Date();
    try {
      await store.putGeocodeBounds(
        cacheKey,
        normalizedBounds,
        observedAt.toISOString(),
        new Date(observedAt.getTime() + 30 * 24 * 60 * 60_000).toISOString(),
      );
    } catch {
      console.warn('lead_radar.geocode_cache_write_failed', { cacheKey });
    }
  }
  return normalizedBounds;
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

async function overpass(query: string, budget: SubrequestBudget): Promise<{ response: OverpassResponse; warnings: string[] }> {
  const failures: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const startedAt = Date.now();
    try {
      const parsed = await fetchWithin(
        endpoint.url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': USER_AGENT,
            Referer: 'https://gptbot.uz/',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: query }),
        },
        10_000,
        budget,
        async (response) => {
          if (!response.ok) throw new Error(`http_${response.status}`);
          return JSON.parse(await readTextBounded(response, MAX_OVERPASS_BYTES)) as unknown;
        },
      );
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as OverpassResponse).elements)) {
        failures.push(`${endpoint.id}_invalid_payload`);
        continue;
      }
      return {
        response: parsed as OverpassResponse,
        warnings: failures.map((code) => `fallback_after_${code}`),
      };
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      const message = error instanceof Error ? error.message : '';
      const code = error instanceof LeadRadarSourceError
        ? error.diagnostics[0] ?? error.code
        : (timedOut ? 'timeout' : (/^http_\d{3}$/.test(message) ? message : 'network'));
      failures.push(`${endpoint.id}_${code}`);
    } finally {
      if (Date.now() - startedAt > 10_500) failures.push(`${endpoint.id}_slow`);
    }
  }
  throw new LeadRadarSourceError(
    failures.some((code) => code.includes('timeout')) ? 'source_timeout' : 'discovery_source_unavailable',
    failures.slice(0, OVERPASS_ENDPOINTS.length * 2),
  );
}

function candidateFromElement(
  element: unknown,
  input: LeadRadarSearchInput,
  fallbackCategory: string,
): SourceCandidate | null {
  if (!element || typeof element !== 'object' || Array.isArray(element)) return null;
  const raw = element as Partial<OverpassElement>;
  if (!raw.type || !['node', 'way', 'relation'].includes(raw.type) || !Number.isSafeInteger(raw.id) || Number(raw.id) <= 0) return null;
  const tags = raw.tags && typeof raw.tags === 'object' && !Array.isArray(raw.tags)
    ? Object.fromEntries(Object.entries(raw.tags).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {};
  const name = cleanText(tags['name:ru'] || tags['name:uz'] || tags.name || tags.brand, 160);
  if (!name || name.length < 2) return null;
  const sourceUrl = `https://www.openstreetmap.org/${raw.type}/${raw.id}`;
  const category = cleanText(tags['healthcare:speciality'] || tags.healthcare || tags.amenity || tags.shop || tags.office || fallbackCategory, 120) ?? fallbackCategory;
  const address = addressFrom(tags);
  const website = cleanWebsite(tags['contact:website'] || tags.website || null);
  const phone = cleanPhone(tags['contact:phone'] || tags.phone || null);
  const email = genericEmail(tags['contact:email'] || tags.email || null);
  const telegram = cleanTelegram(tags['contact:telegram'] || tags.telegram || tags['social:telegram'] || null);
  const evidence: LeadRadarEvidence[] = [
    sourceEvidence('company.name', name, sourceUrl, 'openstreetmap', 0.82),
    sourceEvidence('company.category', category, sourceUrl, 'openstreetmap', 0.78),
    sourceEvidence('locations.city', input.city, sourceUrl, 'openstreetmap', 0.8),
  ];
  if (address) evidence.push(sourceEvidence('locations.address', address, sourceUrl, 'openstreetmap', 0.82));
  if (website) evidence.push(sourceEvidence('web.website', website, sourceUrl, 'openstreetmap', 0.78));
  if (phone) evidence.push(sourceEvidence('company_contacts.phone', phone, sourceUrl, 'openstreetmap', 0.74, 'company_data'));
  if (email) evidence.push(sourceEvidence('company_contacts.generic_email', email, sourceUrl, 'openstreetmap', 0.74, 'company_data'));
  let telegramContact: LeadRadarTelegramContact | null = null;
  if (telegram) {
    const username = telegramUsername(telegram);
    const classification = classifyTelegramContact({
      username,
      context: tags['contact:telegram'] || tags.telegram || tags['social:telegram'] || '',
      isOfficialCompanyPage: true,
      hasNamedDecisionMaker: false,
    });
    const evidenceItem = sourceEvidence(
      `web.telegram.${classification.type}`,
      telegram,
      sourceUrl,
      'openstreetmap',
      Math.min(0.82, classification.confidence),
      'company_data',
    );
    evidence.push(evidenceItem);
    telegramContact = {
      url: telegram,
      username,
      ...classification,
      reason: classification.type === 'business'
        ? 'Telegram указан в OpenStreetMap как контакт компании'
        : classification.reason,
      confidence: Math.min(0.82, classification.confidence),
      evidenceIds: [evidenceItem.id],
      verifiedAt: evidenceItem.observedAt,
    };
  }

  return {
    sourceId: `osm:${raw.type}:${raw.id}`,
    sourceUrl,
    name,
    category,
    city: input.city,
    country: input.country,
    address,
    website,
    phone,
    genericEmail: email,
    telegramUrl: telegramContact && ['human', 'business'].includes(telegramContact.type)
      ? telegramContact.url
      : null,
    telegramContact,
    decisionMakers: [],
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
      if (url.toString().length > 2_048) continue;
      if (!/(contact|kontakt|aloqa|about|company|vakans|career|service|uslug|team|staff|doctor|management|leadership|rukovod|руковод|команд|врач)/i.test(decodeURIComponent(url.pathname))) continue;
      url.hash = '';
      if (!links.some((item) => item.toString() === url.toString())) links.push(url);
      if (links.length >= 2) break;
    } catch {
      // Ignore malformed page links.
    }
  }
  return links;
}

interface RobotsGroup {
  agents: string[];
  rules: Array<{ allow: boolean; pattern: string }>;
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith('$');
  const raw = anchored ? pattern.slice(0, -1) : pattern;
  const expression = raw
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  try { return new RegExp(`^${expression}${anchored ? '$' : ''}`).test(path); } catch { return false; }
}

export function robotsAllows(robots: string, target: URL): boolean {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let rulesStarted = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!current || rulesStarted) {
        current = { agents: [], rules: [] };
        groups.push(current);
        rulesStarted = false;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current || (key !== 'allow' && key !== 'disallow')) continue;
    rulesStarted = true;
    if (value) current.rules.push({ allow: key === 'allow', pattern: value });
  }

  const product = 'gptbot-lead-radar';
  const scored = groups.map((group) => ({
    group,
    specificity: Math.max(0, ...group.agents.map((agent) => (
      agent === '*' ? 1 : (product.includes(agent) ? agent.length + 1 : 0)
    ))),
  })).filter((entry) => entry.specificity > 0);
  const specificity = Math.max(0, ...scored.map((entry) => entry.specificity));
  const path = `${target.pathname}${target.search}` || '/';
  const matching = scored
    .filter((entry) => entry.specificity === specificity)
    .flatMap((entry) => entry.group.rules)
    .filter((rule) => robotsPatternMatches(rule.pattern, path))
    .sort((a, b) => b.pattern.replaceAll('*', '').length - a.pattern.replaceAll('*', '').length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

async function fetchText(url: URL, budget: SubrequestBudget, maxRedirects = 2): Promise<{ url: URL; html: string } | null> {
  let current = url;
  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    if (!(await hasOnlyPublicAddresses(current, budget))) return null;
    const outcome = await fetchWithin(
      current,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'manual',
      },
      5_000,
      budget,
      async (response): Promise<{ redirect: string | null; html: string | null }> => {
        if (response.status >= 300 && response.status < 400) {
          return { redirect: response.headers.get('location'), html: null };
        }
        if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
          return { redirect: null, html: null };
        }
        return { redirect: null, html: await readTextBounded(response, MAX_WEBSITE_BYTES) };
      },
    );
    if (outcome.redirect) {
      const next = safePublicHttpUrl(new URL(outcome.redirect, current).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    return outcome.html === null ? null : { url: current, html: outcome.html };
  }
  return null;
}

export function extractCompanyPageFacts(pageUrl: URL, html: string): Omit<WebsiteFacts, 'website'> {
  const text = stripHtml(html);
  const contactFacts = extractOfficialSiteContacts(pageUrl, html);
  const emailMatches = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => genericEmail(match[0]))
    .filter((item): item is string => Boolean(item));
  const phoneMatches = [...text.matchAll(/(?:\+998|998)[\s()-]*\d{2}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g)]
    .map((match) => cleanPhone(match[0]))
    .filter((item): item is string => Boolean(item));
  const telegramUrl = contactFacts.telegramContact
    && ['human', 'business'].includes(contactFacts.telegramContact.type)
    ? contactFacts.telegramContact.url
    : null;
  const genericEmailValue = emailMatches[0] ?? null;
  const phone = phoneMatches[0] ?? null;
  const evidence: LeadRadarEvidence[] = [
    sourceEvidence('web.website', pageUrl.origin, pageUrl.toString(), 'company_website', 0.94),
    ...contactFacts.evidence,
  ];
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

  return {
    phone,
    genericEmail: genericEmailValue,
    telegramUrl,
    telegramContact: contactFacts.telegramContact,
    decisionMakers: contactFacts.decisionMakers,
    evidence,
    signals,
  };
}

async function enrichCompanyWebsiteWithBudget(
  website: string,
  budget: SubrequestBudget,
): Promise<WebsiteFacts | null> {
  const start = safePublicHttpUrl(website);
  if (!start) return null;
  let robots: string | null;
  try {
    const robotsUrl = new URL('/robots.txt', start);
    if (!(await hasOnlyPublicAddresses(robotsUrl, budget))) return null;
    const policy = await fetchWithin(
      robotsUrl,
      { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' },
      3_000,
      budget,
      async (response): Promise<{ allow: boolean; body: string | null }> => {
        if (response.status === 404 || response.status === 410) return { allow: true, body: null };
        if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
          return { allow: false, body: null };
        }
        if (!response.ok) return { allow: false, body: null };
        return { allow: true, body: await readTextBounded(response, MAX_ROBOTS_BYTES) };
      },
    );
    if (!policy.allow) return null;
    robots = policy.body;
  } catch {
    // Timeout, transport error, or malformed/oversized policy fails closed.
    return null;
  }

  try {
    if (robots !== null && !robotsAllows(robots, start)) return null;
    const home = await fetchText(start, budget, 1);
    if (!home) return null;
    const pages = [home];
    for (const link of sameOriginLinks(home.html, home.url)) {
      if (robots !== null && !robotsAllows(robots, link)) continue;
      const page = await fetchText(link, budget, 0);
      if (page) pages.push(page);
    }
    const facts = pages.map((page) => extractCompanyPageFacts(page.url, page.html));
    const telegramRank: Record<TelegramContactType, number> = {
      human: 6, business: 5, channel: 3, group: 2, unknown: 1, bot: 0,
    };
    const telegramContact = facts
      .map((item) => item.telegramContact)
      .filter((item): item is LeadRadarTelegramContact => Boolean(item))
      .sort((a, b) => telegramRank[b.type] - telegramRank[a.type] || b.confidence - a.confidence)[0] ?? null;
    const decisionMakerMap = new Map<string, LeadRadarDecisionMaker>();
    for (const person of facts.flatMap((item) => item.decisionMakers)) {
      const key = normalizedPersonKey(person.name, person.role);
      const existing = decisionMakerMap.get(key);
      if (!existing || person.confidence > existing.confidence || (!existing.telegramUrl && person.telegramUrl)) {
        decisionMakerMap.set(key, person);
      } else {
        existing.evidenceIds = [...new Set([...existing.evidenceIds, ...person.evidenceIds])];
      }
    }
    return {
      website: home.url.origin,
      phone: facts.find((item) => item.phone)?.phone ?? null,
      genericEmail: facts.find((item) => item.genericEmail)?.genericEmail ?? null,
      telegramUrl: telegramContact && ['human', 'business'].includes(telegramContact.type)
        ? telegramContact.url
        : null,
      telegramContact,
      decisionMakers: [...decisionMakerMap.values()].sort((a, b) => b.confidence - a.confidence),
      evidence: facts.flatMap((item) => item.evidence),
      signals: facts.flatMap((item) => item.signals).filter((signal, index, all) => (
        all.findIndex((candidate) => candidate.type === signal.type) === index
      )),
    };
  } catch {
    return null;
  }
}

export async function enrichCompanyWebsite(website: string): Promise<WebsiteFacts | null> {
  return enrichCompanyWebsiteWithBudget(website, new SubrequestBudget(12));
}

async function enrichCandidates(candidates: SourceCandidate[], budget: SubrequestBudget): Promise<SourceCandidate[]> {
  const queue = candidates
    .filter((candidate) => candidate.website)
    .slice(0, MAX_SITE_ENRICHMENTS);
  const enriched = new Map<string, WebsiteFacts>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const candidate = queue[index];
      if (!candidate?.website) continue;
      const facts = await enrichCompanyWebsiteWithBudget(candidate.website, budget);
      if (facts) enriched.set(candidate.sourceId, facts);
    }
  });
  await Promise.all(workers);

  return candidates.map((candidate) => {
    const facts = enriched.get(candidate.sourceId);
    if (!facts) return candidate;
    const rank: Record<TelegramContactType, number> = {
      human: 6, business: 5, channel: 3, group: 2, unknown: 1, bot: 0,
    };
    const telegramContact = [facts.telegramContact, candidate.telegramContact]
      .filter((item): item is LeadRadarTelegramContact => Boolean(item))
      .sort((a, b) => rank[b.type] - rank[a.type] || b.confidence - a.confidence)[0] ?? null;
    const decisionMakerMap = new Map<string, LeadRadarDecisionMaker>();
    for (const person of [...candidate.decisionMakers, ...facts.decisionMakers]) {
      const key = normalizedPersonKey(person.name, person.role);
      const existing = decisionMakerMap.get(key);
      if (!existing || person.confidence > existing.confidence || (!existing.telegramUrl && person.telegramUrl)) {
        decisionMakerMap.set(key, person);
      }
    }
    return {
      ...candidate,
      website: facts.website,
      phone: facts.phone ?? candidate.phone,
      genericEmail: facts.genericEmail ?? candidate.genericEmail,
      telegramUrl: telegramContact && ['human', 'business'].includes(telegramContact.type)
        ? telegramContact.url
        : null,
      telegramContact,
      decisionMakers: [...decisionMakerMap.values()].sort((a, b) => b.confidence - a.confidence),
      evidence: [...candidate.evidence, ...facts.evidence],
      signals: [...candidate.signals, ...facts.signals],
    };
  });
}

export class OpenStreetMapLeadSource implements LeadRadarSource {
  readonly id = 'openstreetmap';

  constructor(private readonly geocodeStore?: LeadRadarGeocodeStore) {}

  async discover(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult> {
    const budget = new SubrequestBudget(MAX_SOURCE_SUBREQUESTS);
    const bounds = await geocode(input, budget, this.geocodeStore);
    const { query, category } = buildOverpassQuery(input, bounds);
    const { response, warnings } = await overpass(query, budget);
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
    const enriched = await enrichCandidates(
      [...deduped.values()].slice(0, Math.min(80, input.desiredCount * 3)),
      budget,
    );
    return { candidates: enriched, sourceWarnings: warnings };
  }
}
