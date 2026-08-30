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
import {
  normalizeLeadRadarIntentText,
  resolveLeadRadarIntent,
  scoreLeadRadarOsmTags,
  type LeadRadarIntentOsmFilter,
  type LeadRadarIntentResolution,
  type LeadRadarOsmTagCondition,
} from './intent';
import { normalizeCompanyKey, safePublicHttpUrl } from './validation';
import { assessLeadRadarPhone, extractLeadRadarPhones } from '../../../src/shared/lead-radar-contacts';
import { publishedTelegramLocators } from './telegram-locators';
import { hasDistinctBusinessName, publishedBusinessEntities, publishedPagePhones } from './business-contact-data';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  // Independent providers from the current OpenStreetMap public-instance
  // registry. Provider diversity matters: public mirrors legitimately shed
  // load, and retrying two hostnames on the same cluster is not redundancy.
  { id: 'main', url: 'https://overpass-api.de/api/interpreter' },
  { id: 'vk_maps', url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter' },
  { id: 'private_coffee', url: 'https://overpass.private.coffee/api/interpreter' },
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
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  timestamp?: string;
}

interface OverpassResponse {
  elements?: unknown[];
}

export interface WebsiteFacts {
  website: string;
  phone: string | null;
  genericEmail: string | null;
  telegramUrl: string | null;
  telegramContact: LeadRadarTelegramContact | null;
  /** All observed candidates; extraction never grants send permission. */
  telegramContacts?: LeadRadarTelegramContact[];
  decisionMakers: LeadRadarDecisionMaker[];
  evidence: LeadRadarEvidence[];
  signals: LeadRadarSignal[];
}

export interface ExpectedCompanyWebsiteIdentity {
  name: string;
  phone: string | null;
  address?: string | null;
  city?: string;
}

export interface CompanyWebsiteBinding {
  verified: boolean;
  method: 'company_name' | 'phone' | null;
  sourceUrl: string | null;
}

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

export async function readTextBounded(response: Response, maxBytes: number): Promise<string> {
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
  hasStructuredOrganizationOwner?: boolean;
  sourceClaim?: 'official_site_proximity' | 'json_ld_same_as';
}

export function classifyTelegramContact(input: TelegramClassificationInput): Pick<
  LeadRadarTelegramContact,
  'type' | 'confidence' | 'reason' | 'messageable'
> {
  const username = input.username.trim().replace(/^@/, '').toLowerCase();
  const context = input.context.toLowerCase();
  if (/(?:разработк[аи] сайта|создание сайта|powered by|website by|web design)/iu.test(context)) {
    return { type: 'unknown', confidence: 0.2, reason: 'Контакт разработчика сайта, не компании', messageable: false };
  }
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
    const structured = input.sourceClaim === 'json_ld_same_as';
    return {
      type: 'human',
      confidence: structured ? 0.9 : 0.78,
      reason: structured
        ? 'Официальный сайт публикует Telegram в JSON-LD Person; требуется проверка оператором'
        : 'Ссылка расположена рядом с именем и ролью; требуется проверка оператором',
      messageable: false,
    };
  }
  if (input.hasStructuredOrganizationOwner) {
    return {
      type: 'business',
      confidence: 0.94,
      reason: 'Exact Telegram endpoint указан в JSON-LD Organization/LocalBusiness',
      messageable: false,
    };
  }
  const telegramOffset = context.indexOf('telegram');
  const corporateLabelOffset = context.search(/(?:компани[ия]|организаци[ия]|бизнеса|korxona|kompaniya|tashkilot|biznes)/iu);
  const explicitCorporateLabel = telegramOffset >= 0
    && corporateLabelOffset >= 0
    && Math.abs(telegramOffset - corporateLabelOffset) <= 36;
  const corporateCallToAction = /(?:записаться|запись (?:на|в)|связаться с нами|напишите нам|пишите нам|регистратур|qabulga|biz bilan|bog.lanish|contact us|book an appointment)/iu.test(context);
  const thirdParty = /(?:разработк[аи] сайта|создание сайта|powered by|website by|web design|личный телефон|personal phone)/iu.test(context);
  if (input.isOfficialCompanyPage && !thirdParty && (explicitCorporateLabel || corporateCallToAction)) {
    return {
      type: 'business',
      confidence: 0.9,
      reason: 'Официальная страница явно маркирует endpoint как Telegram компании',
      messageable: false,
    };
  }
  return {
    type: 'unknown',
    confidence: input.isOfficialCompanyPage ? 0.58 : 0.45,
    reason: input.isOfficialCompanyPage
      ? 'Ссылка опубликована на официальном сайте, но корпоративная принадлежность не доказана'
      : 'Недостаточно доказательств типа Telegram-контакта',
    messageable: false,
  };
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

function jsonLdOrganizationTelegramUrls(html: string): Set<string> {
  const urls = new Set<string>();
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
    const isOrganization = types.some((item) => (
      typeof item === 'string'
      && ['organization', 'localbusiness', 'dentist', 'medicalclinic'].includes(item.toLowerCase())
    ));
    if (isOrganization) {
      const sameAs = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
      for (const item of sameAs) {
        const telegramUrl = typeof item === 'string' ? cleanTelegram(item) : null;
        if (telegramUrl) urls.add(telegramUrl.toLowerCase());
      }
    }
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  for (const match of scripts) {
    try { visit(JSON.parse(match[1] ?? 'null'), 0); } catch { /* Invalid structured data is ignored. */ }
  }
  return urls;
}

export interface OfficialSiteContactFacts {
  telegramContact: LeadRadarTelegramContact | null;
  telegramContacts: LeadRadarTelegramContact[];
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
  const structuredOrganizationTelegramUrls = jsonLdOrganizationTelegramUrls(html);
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
      person.structured ? 0.9 : 0.78,
      'company_data',
      verifiedAt,
    );
    evidence.push(evidenceItem);
    const structuredClassification = person.telegramUrl
      ? classifyTelegramContact({
          username: telegramUsername(person.telegramUrl),
          context: person.snippet,
          isOfficialCompanyPage: true,
          hasNamedDecisionMaker: true,
          sourceClaim: person.structured ? 'json_ld_same_as' : 'official_site_proximity',
        })
      : null;
    const contactType: TelegramContactType = structuredClassification?.type ?? 'unknown';
    const candidate: LeadRadarDecisionMaker = {
      id: existing?.id ?? `dm_${crypto.randomUUID().replaceAll('-', '')}`,
      name: person.name,
      role: person.role,
      telegramUrl: person.telegramUrl,
      telegramUsername: person.telegramUrl ? telegramUsername(person.telegramUrl) : null,
      contactType,
      confidence: person.structured ? 0.9 : 0.78,
      evidenceIds: [...(existing?.evidenceIds ?? []), evidenceItem.id],
      sourceUrl: pageUrl.toString(),
      evidence: person.snippet,
      verifiedAt,
      sourceClaim: person.structured ? 'json_ld_same_as' : 'official_site_proximity',
      contactReviewStatus: 'unreviewed',
      contactReviewedAt: null,
    };
    if (!existing || candidate.confidence > existing.confidence || (!existing.telegramUrl && candidate.telegramUrl)) {
      decisionMakerMap.set(key, candidate);
    }
  }

  const contacts: LeadRadarTelegramContact[] = [];
  for (const { locator, context: rawContext } of publishedTelegramLocators(html)) {
    const telegramUrl = locator.url;
    const username = locator.kind === 'username' ? locator.value : '';
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
      hasStructuredOrganizationOwner: structuredOrganizationTelegramUrls.has(telegramUrl.toLowerCase()),
      sourceClaim: linked?.sourceClaim,
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
    // Non-username locators are kept as evidence/multi-contact candidates. They
    // require Bridge resolution before they can become a legacy sender endpoint.
    if (locator.kind !== 'username') continue;
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
    if (linked) {
      linked.telegramUrl = telegramUrl;
      linked.telegramUsername = username;
      linked.contactType = classification.type;
      linked.confidence = Math.max(linked.confidence, classification.confidence);
      linked.evidenceIds = [...new Set([...linked.evidenceIds, evidenceItem.id])];
    }
  }

  const rank: Record<TelegramContactType, number> = {
    business: 6, human: 5, unknown: 4, channel: 2, group: 1, bot: 0,
  };
  contacts.sort((a, b) => rank[b.type] - rank[a.type] || b.confidence - a.confidence);
  return {
    telegramContact: contacts[0] ?? null,
    telegramContacts: contacts,
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

function escapeOverpassQuoted(value: string): string {
  return value.replace(/[\\"\n\r]/g, ' ').slice(0, 120);
}

function escapeOverpassRegex(value: string): string {
  return escapeOverpassQuoted(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function conditionSelector(condition: LeadRadarOsmTagCondition): string {
  const key = escapeOverpassQuoted(condition.key);
  if (condition.operation === 'exists') return `["${key}"]`;
  const value = condition.operation === 'matches'
    ? escapeOverpassQuoted(condition.value ?? '')
    : escapeOverpassQuoted(condition.value ?? '');
  return condition.operation === 'matches'
    ? `["${key}"~"${value}",i]`
    : `["${key}"="${value}"]`;
}

function filterSelector(filter: LeadRadarIntentOsmFilter): string {
  return filter.conditions.map(conditionSelector).join('');
}

function queryDefinition(
  niche: string,
  languages: LeadRadarSearchInput['languages'],
): { category: string; filters: string[]; intent: LeadRadarIntentResolution } {
  const intent = resolveLeadRadarIntent(niche);
  const localizedNameTags = [...new Set(languages)].map((language) => `name:${language}`);
  const semanticFilters = intent.osmFilters.map(filterSelector);
  const fallbackTerms = intent.nameFallbackTokens
    .map((term) => normalizeLeadRadarIntentText(term).slice(0, 32))
    .filter((term) => term.length >= 3)
    .map(escapeOverpassRegex);
  const fallbackPattern = fallbackTerms.length > 0
    ? [...new Set(fallbackTerms)].join('|')
    : `^${escapeOverpassRegex(intent.normalizedQuery.slice(0, 48))}$`;
  const fallbackTags = fallbackTerms.length > 0
    ? ['name', ...localizedNameTags, 'brand', 'operator']
    : ['name', ...localizedNameTags];
  const nameFilters = fallbackPattern && fallbackPattern !== '^$'
    ? fallbackTags.map((tag) => `["${escapeOverpassQuoted(tag)}"~"${fallbackPattern}",i]`)
    : [];
  return {
    category: intent.canonicalLabel || niche,
    // Once the closed resolver identifies a category, tag selectors are both
    // more precise and dramatically cheaper for Overpass than a city-wide
    // regex scan across every named object. Name/brand/operator fallback is
    // reserved for an unknown niche, where no grounded tag plan exists.
    filters: [...new Set(semanticFilters.length > 0 ? semanticFilters : nameFilters)],
    intent,
  };
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

export interface LeadRadarOsmQueryPlan {
  version: 'osm-overpass-v3';
  category: string;
  languageTags: string[];
  intent: LeadRadarIntentResolution;
  query: string;
}

/** Deterministic, versioned source plan used by discovery and contract tests. */
export function buildLeadRadarQueryPlan(
  input: LeadRadarSearchInput,
  bounds: [number, number, number, number],
): LeadRadarOsmQueryPlan {
  const definition = queryDefinition(input.niche, input.languages);
  const bbox = bounds.join(',');
  const lines = definition.filters.map((filter) => `nwr${filter}(${bbox});`).join('\n');
  const resultLimit = definition.intent.canonicalId
    ? Math.min(240, Math.max(80, input.desiredCount * 6))
    : (definition.intent.nameFallbackTokens.length > 0
      ? Math.min(160, Math.max(40, input.desiredCount * 4))
      : Math.min(40, Math.max(10, input.desiredCount * 2)));
  return {
    version: 'osm-overpass-v3',
    category: definition.category,
    languageTags: [...new Set(input.languages)].map((language) => `name:${language}`),
    intent: definition.intent,
    query: `[out:json][timeout:24];\n(\n${lines}\n);\nout meta center ${resultLimit};`,
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

function osmTagsFromElement(element: unknown): Record<string, string> {
  if (!element || typeof element !== 'object' || Array.isArray(element)) return {};
  const tags = (element as Partial<OverpassElement>).tags;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return {};
  return Object.fromEntries(
    Object.entries(tags).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** Stable, evidence-only ordering applied before the queue selects its fanout. */
export function rankLeadRadarOsmElements(
  elements: unknown[],
  intent: LeadRadarIntentResolution,
): unknown[] {
  return elements
    .map((element, index) => {
      const tags = osmTagsFromElement(element);
      const semantic = scoreLeadRadarOsmTags(tags, intent);
      const completeness = [
        tags.name,
        tags['contact:website'] || tags.website,
        tags['contact:phone'] || tags.phone,
        tags['addr:full'] || tags['addr:street'],
      ].filter(Boolean).length;
      return { element, index, score: semantic.score * 10 + completeness };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ element }) => element);
}

export function candidateFromOsmElement(
  element: unknown,
  input: LeadRadarSearchInput,
  fallbackCategory: string,
  collectedAt?: string,
): SourceCandidate | null {
  if (!element || typeof element !== 'object' || Array.isArray(element)) return null;
  const raw = element as Partial<OverpassElement>;
  if (!raw.type || !['node', 'way', 'relation'].includes(raw.type) || !Number.isSafeInteger(raw.id) || Number(raw.id) <= 0) return null;
  const tags = osmTagsFromElement(element);
  const lifecycleTags = Object.entries(tags).filter(([key]) => (
    key === 'disused' || key === 'abandoned' || key === 'demolished'
    || key.startsWith('disused:') || key.startsWith('abandoned:') || key.startsWith('demolished:')
  ));
  if (lifecycleTags.some(([, value]) => !['no', 'false', '0'].includes(value.trim().toLowerCase()))) return null;
  const preferredNames = [...new Set(input.languages)].map((language) => tags[`name:${language}`]);
  const name = cleanText(preferredNames.find(Boolean) || tags.name || tags.brand, 160);
  if (!name || name.length < 2) return null;
  const sourceUrl = `https://www.openstreetmap.org/${raw.type}/${raw.id}`;
  const sourcedCategory = cleanText(tags['healthcare:speciality'] || tags.healthcare || tags.amenity || tags.shop || tags.office, 120);
  const category = sourcedCategory ?? fallbackCategory;
  const address = addressFrom(tags);
  const website = cleanWebsite(tags['contact:website'] || tags.website || null);
  const phone = cleanPhone(tags['contact:phone'] || tags.phone || null);
  const email = genericEmail(tags['contact:email'] || tags.email || null);
  const telegram = cleanTelegram(tags['contact:telegram'] || tags.telegram || tags['social:telegram'] || null);
  const sourceObservedAt = collectedAt && Number.isFinite(Date.parse(collectedAt)) ? new Date(collectedAt).toISOString()
    : typeof raw.timestamp === 'string' && Number.isFinite(Date.parse(raw.timestamp))
    ? new Date(raw.timestamp).toISOString()
    : new Date().toISOString();
  const sourceCity = cleanText(tags['addr:city'] || tags['addr:place'], 120);
  const latitude = Number(raw.lat ?? raw.center?.lat);
  const longitude = Number(raw.lon ?? raw.center?.lon);
  const hasCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const evidence: LeadRadarEvidence[] = [
    sourceEvidence('company.name', name, sourceUrl, 'openstreetmap', 0.82, 'fact', sourceObservedAt),
  ];
  if (collectedAt && typeof raw.timestamp==='string' && Number.isFinite(Date.parse(raw.timestamp))) {
    evidence.push(sourceEvidence('source.osm.last_edited_at',new Date(raw.timestamp).toISOString(),sourceUrl,'openstreetmap',1,'fact',sourceObservedAt));
  }
  if (sourcedCategory) {
    evidence.push(sourceEvidence('company.category', sourcedCategory, sourceUrl, 'openstreetmap', 0.78, 'fact', sourceObservedAt));
  }
  if (sourceCity) evidence.push(sourceEvidence(
    'locations.city', sourceCity, sourceUrl, 'openstreetmap', 0.82, 'fact', sourceObservedAt,
  ));
  else evidence.push(sourceEvidence(
    'search_context.requested_city', input.city, sourceUrl, 'openstreetmap', 0.35, 'model_inference', sourceObservedAt,
  ));
  if (hasCoordinates) evidence.push(sourceEvidence(
    'locations.coordinates', `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
    sourceUrl, 'openstreetmap', 0.9, 'fact', sourceObservedAt,
  ));
  if (address) evidence.push(sourceEvidence(
    'locations.address', address, sourceUrl, 'openstreetmap', 0.82, 'fact', sourceObservedAt,
  ));
  if (website) evidence.push(sourceEvidence(
    'web.website_candidate', website, sourceUrl, 'openstreetmap', 0.45, 'model_inference', sourceObservedAt,
  ));
  if (phone) evidence.push(sourceEvidence(
    'company_contacts.phone', phone, sourceUrl, 'openstreetmap', 0.74, 'company_data', sourceObservedAt,
  ));
  if (email) evidence.push(sourceEvidence(
    'company_contacts.generic_email', email, sourceUrl, 'openstreetmap', 0.74, 'company_data', sourceObservedAt,
  ));
  let telegramContact: LeadRadarTelegramContact | null = null;
  if (telegram) {
    const username = telegramUsername(telegram);
    const evidenceItem = sourceEvidence(
      'web.telegram.unknown',
      telegram,
      sourceUrl,
      'openstreetmap',
      0.4,
      'model_inference',
      sourceObservedAt,
    );
    evidence.push(evidenceItem);
    telegramContact = {
      url: telegram,
      username,
      type: 'unknown',
      messageable: false,
      reason: 'Telegram указан в OpenStreetMap; принадлежность компании и тип адресата не подтверждены первым источником',
      confidence: 0.4,
      evidenceIds: [evidenceItem.id],
      verifiedAt: evidenceItem.observedAt,
    };
  }

  return {
    sourceId: `osm:${raw.type}:${raw.id}`,
    sourceUrl,
    name,
    category,
    city: sourceCity ?? input.city,
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
    enrichmentStatus: website ? 'pending' : 'terminal',
    enrichmentReason: website ? null : 'no_website',
    enrichmentAttempts: 0,
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

const COMPANY_LEGAL_FORM_TOKENS = new Set([
  'ooo', 'ооо', 'llc', 'ltd', 'inc', 'ip', 'ип', 'mchj', 'xk', 'aj', 'jsc', 'l.l.c',
]);

const GENERIC_SINGLE_COMPANY_NAMES = new Set([
  'clinic', 'klinika', 'клиника', 'dental', 'dent', 'center', 'centre', 'markaz', 'центр',
  'salon', 'салон', 'restaurant', 'ресторан', 'school', 'школа', 'academy', 'академия',
  'shop', 'store', 'магазин', 'company', 'kompaniya', 'компания',
]);

function normalizedCompanyPhrase(value: string): string {
  const tokens = normalizeCompanyKey(value).split('-').filter(Boolean);
  while (tokens.length > 1 && COMPANY_LEGAL_FORM_TOKENS.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && COMPANY_LEGAL_FORM_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join('-');
}

function metaOgTitles(html: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/(?:property|name)\s*=\s*["']og:title["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']{1,300})["']/i)?.[1];
    if (content) values.push(content);
  }
  return values;
}

function pageHasCompanyName(html: string, expectedName: string): boolean {
  const expected = normalizedCompanyPhrase(expectedName);
  if (!expected || !hasDistinctBusinessName(expectedName)) return false;
  const tokens = expected.split('-').filter(Boolean);
  if (tokens.length === 1 && (tokens[0].length < 6 || GENERIC_SINGLE_COMPANY_NAMES.has(tokens[0]))) {
    return false;
  }
  const titles = [...html.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(match => stripHtml(match[2]));
  const corpus = normalizedCompanyPhrase([...titles, ...metaOgTitles(html), ...publishedBusinessEntities(html).map(entity => entity.name)].join(' '));
  return Boolean(corpus) && `-${corpus}-`.includes(`-${expected}-`);
}

function pagePhoneNumbers(html: string): Set<string> {
  return new Set(publishedPagePhones(html).flatMap(phone => phone.e164 ? [phone.e164.replace(/\D/g, '')] : []));
}

/**
 * A website URL from a community-edited directory is only a candidate. Personal
 * contacts become first-party evidence after the fetched site independently
 * repeats the expected company name or the exact public company phone number.
 */
export function verifyCompanyWebsiteBinding(
  expected: ExpectedCompanyWebsiteIdentity,
  pages: Array<{ url: URL; html: string }>,
): CompanyWebsiteBinding {
  const expectedPhones = expected.phone
    ? extractLeadRadarPhones(expected.phone).flatMap(phone => phone.e164 ? [phone.e164.replace(/\D/g, '')] : [])
    : [];
  // Prefer the exact anchor across all pages before considering a name-only
  // match. A conflicting published phone cannot be ignored by the name fallback.
  for (const page of pages) {
    if (expectedPhones.some(phone => pagePhoneNumbers(page.html).has(phone))) {
      return { verified: true, method: 'phone', sourceUrl: page.url.toString() };
    }
  }
  const conflicting = expectedPhones.length > 0 && pages.some(page => pagePhoneNumbers(page.html).size > 0);
  for (const page of pages) {
    if (!conflicting && pageHasCompanyName(page.html, expected.name)) {
      return { verified: true, method: 'company_name', sourceUrl: page.url.toString() };
    }
  }
  return { verified: false, method: null, sourceUrl: null };
}

/** Bounded contact-page discovery on the company's own origin — the free
 * enrichment path. Contact-like pages rank first so the bounded page budget
 * is spent where Telegram/phone facts actually live (audit-2026-08-30 R1). */
const CONTACT_PAGE_PATTERN = /(contact|kontakt|aloqa|about|company|vakans|career|service|uslug|team|staff|doctor|management|leadership|rukovod|руковод|команд|врач|контакт|о-компан|o-kompan|haqida|o-nas)/i;
const CONTACT_PAGE_FETCH_LIMIT = 4;

function sameOriginLinks(html: string, base: URL): URL[] {
  const links: URL[] = [];
  const pattern = /href\s*=\s*["']([^"'#]+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(match[1], base);
      if (url.origin !== base.origin) continue;
      if (url.toString().length > 2_048) continue;
      url.hash = '';
      if (!links.some((item) => item.toString() === url.toString())) links.push(url);
      if (links.length >= 8) break;
    } catch {
      // Ignore malformed page links.
    }
  }
  const rank = (url: URL) => /contact|kontakt|aloqa|контакт/i.test(decodeURIComponent(url.pathname)) ? 0 : 1;
  return links.filter((url) => CONTACT_PAGE_PATTERN.test(decodeURIComponent(url.pathname)))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, CONTACT_PAGE_FETCH_LIMIT);
}

/** JS-rendered homepages often expose no static links, while the site's
 * sitemap still lists the real contact pages. Best-effort: any failure,
 * denial or non-XML answer simply yields no extra links and never fails
 * the enrichment (audit-2026-08-30 R1 Tier 0). */
async function sitemapContactLinks(start: URL, robots: string | null, budget: SubrequestBudget): Promise<URL[]> {
  try {
    const sitemapUrl = new URL('/sitemap.xml', start);
    if (robots !== null && !robotsAllows(robots, sitemapUrl)) return [];
    if (!(await hasOnlyPublicAddresses(sitemapUrl, budget))) return [];
    const xml = await fetchWithin(
      sitemapUrl,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml' }, redirect: 'manual' },
      4_000,
      budget,
      async (response): Promise<string | null> => {
        if (!response.ok) return null;
        if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('xml')) return null;
        return readTextBounded(response, 512_000);
      },
    );
    if (!xml) return [];
    const results: URL[] = [];
    for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      try {
        const url = new URL(match[1], start);
        if (url.origin !== start.origin) continue;
        url.hash = '';
        if (results.some((item) => item.toString() === url.toString())) continue;
        if (CONTACT_PAGE_PATTERN.test(decodeURIComponent(url.pathname))) results.push(url);
        if (results.length >= CONTACT_PAGE_FETCH_LIMIT) break;
      } catch {
        // A malformed <loc> entry is not actionable.
      }
    }
    return results;
  } catch {
    return [];
  }
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

export function robotsAllows(robots: string, target: URL, product = 'gptbot-lead-radar'): boolean {
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

/** Provider fallback obeys the same DNS/robots boundary as the direct reader. */
export async function readPublicWebsiteRobots(target: URL): Promise<string | null> {
  const budget = new SubrequestBudget(4);
  if (!safePublicHttpUrl(target.toString()) || !await hasOnlyPublicAddresses(target, budget)) {
    throw new Error('website_policy_unavailable');
  }
  return fetchWithin(new URL('/robots.txt', target), {
    headers: { 'User-Agent': USER_AGENT }, redirect: 'manual',
  }, 5_000, budget, async (response) => {
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new Error('website_policy_unavailable');
    const body = await readTextBounded(response, MAX_ROBOTS_BYTES);
    if (/<(?:html|body)\b/i.test(body)) throw new Error('website_policy_unavailable');
    return body;
  });
}

async function fetchText(url: URL, budget: SubrequestBudget, maxRedirects = 2, maxBytes = MAX_WEBSITE_BYTES): Promise<{ url: URL; html: string } | null> {
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
        return { redirect: null, html: await readTextBounded(response, maxBytes) };
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

export function extractCompanyPageFacts(
  pageUrl: URL,
  html: string,
  companyWebsiteBound = false,
  observedAt = new Date().toISOString(),
  expected?: ExpectedCompanyWebsiteIdentity,
): Omit<WebsiteFacts, 'website'> {
  const text = stripHtml(html);
  const contactFacts = extractOfficialSiteContacts(pageUrl, html, observedAt);
  const emailMatches = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => genericEmail(match[0]))
    .filter((item): item is string => Boolean(item));
  // Exclude numbers attributed to a site vendor/personal footer from both href
  // and visible-text extraction. Removing just the href reintroduced them below.
  // Keep all public company phone candidates; a landline is useful identity data
  // but never automatically a Telegram lookup target. The lookup layer rechecks type.
  const phoneMatches = publishedPagePhones(html, expected).map(item => item.e164!)
    .sort((a, b) => Number(assessLeadRadarPhone(b).mobileLookupCandidate) - Number(assessLeadRadarPhone(a).mobileLookupCandidate))
    .slice(0, 8);
  const telegramContact = companyWebsiteBound && contactFacts.telegramContact
    ? { ...contactFacts.telegramContact, messageable: false }
    : null;
  const telegramUrl = companyWebsiteBound
    && telegramContact
    && ['human', 'business'].includes(telegramContact.type)
    ? telegramContact.url
    : null;
  const genericEmailValue = companyWebsiteBound ? (emailMatches[0] ?? null) : null;
  const phone = companyWebsiteBound ? (phoneMatches[0] ?? null) : null;
  const contactEvidence = companyWebsiteBound ? contactFacts.evidence : [];
  const evidence: LeadRadarEvidence[] = [
    sourceEvidence(
      companyWebsiteBound ? 'web.website' : 'web.website_candidate',
      pageUrl.origin,
      pageUrl.toString(),
      'company_website',
      companyWebsiteBound ? 0.94 : 0.45,
      companyWebsiteBound ? 'fact' : 'model_inference',
    ),
    ...contactEvidence,
  ];
  if (genericEmailValue) evidence.push(sourceEvidence('company_contacts.generic_email', genericEmailValue, pageUrl.toString(), 'company_website', 0.92, 'company_data'));
  if (companyWebsiteBound) for (const candidatePhone of phoneMatches) {
    evidence.push(sourceEvidence('company_contacts.phone', candidatePhone, pageUrl.toString(), 'company_website', 0.9, 'company_data', observedAt));
  }

  const signalPatterns: Array<{ type: LeadRadarSignalType; label: string; pattern: RegExp }> = [
    { type: 'online_booking', label: 'онлайн-запись', pattern: /онлайн[- ]?(?:запис|бронир)|online booking|qabulga yozil/i },
    { type: 'contact_form', label: 'форма заявки', pattern: /остав(?:ить|ьте) (?:заявку|контакт)|форма (?:заявки|обратной связи)|submit request|ariza qoldir/i },
    { type: 'messenger', label: 'мессенджер', pattern: /whatsapp|telegram|direct/i },
    { type: 'hiring', label: 'вакансия или найм', pattern: /ваканси|ищем (?:администратор|оператор|менеджер)|career|job opening|bo.sh ish/i },
    { type: 'tender', label: 'тендер или закупка', pattern: /тендер|закупк|tender|procurement/i },
    { type: 'new_branch', label: 'новый филиал или расширение', pattern: /нов(?:ый|ого) филиал|открыли филиал|new branch|yangi filial/i },
  ];
  const observedMs = Date.parse(observedAt);
  const publishedCandidates = [
    ...html.matchAll(/(?:article:published_time|datePublished|date_created|datePublished)[^>\n]{0,160}?(?:content\s*=\s*["']|:\s*["'])([^"']{8,40})/gi),
    ...html.matchAll(/<time\b[^>]*datetime\s*=\s*["']([^"']{8,40})["']/gi),
  ];
  const publishedAt = publishedCandidates
    .map((match) => match[1] ?? '')
    .map((value) => Date.parse(value))
    .find((value) => Number.isFinite(value)
      && Number.isFinite(observedMs)
      && value <= observedMs + 5 * 60_000
      && observedMs - value <= 90 * 24 * 60 * 60_000);
  const signals: LeadRadarSignal[] = [];
  for (const item of signalPatterns) {
    if (!companyWebsiteBound) break;
    if (!item.pattern.test(text)) continue;
    const highIntent = ['hiring', 'tender', 'new_branch'].includes(item.type);
    const datedHighIntent = highIntent && publishedAt !== undefined;
    const classification = highIntent && !datedHighIntent ? 'model_inference' : 'fact';
    const signalObservedAt = datedHighIntent ? new Date(publishedAt).toISOString() : observedAt;
    const evidenceItem = sourceEvidence(
      `signals.${item.type}`,
      item.label,
      pageUrl.toString(),
      'company_website',
      classification === 'fact' ? 0.84 : 0.45,
      classification,
      signalObservedAt,
    );
    evidence.push(evidenceItem);
    signals.push({
      type: item.type,
      label: item.label,
      classification,
      evidenceIds: [evidenceItem.id],
      observedAt: signalObservedAt,
    });
  }
  if (companyWebsiteBound) {
    const activeEvidence = sourceEvidence('signals.active_website', 'Сайт отвечает', pageUrl.toString(), 'company_website', 0.96);
    evidence.push(activeEvidence);
    signals.push({
      type: 'active_website',
      label: 'активный сайт',
      classification: 'fact',
      evidenceIds: [activeEvidence.id],
      observedAt: activeEvidence.observedAt,
    });
  }

  return {
    phone,
    genericEmail: genericEmailValue,
    telegramUrl,
    telegramContact,
    telegramContacts: companyWebsiteBound ? contactFacts.telegramContacts : [],
    decisionMakers: companyWebsiteBound ? contactFacts.decisionMakers : [],
    evidence,
    signals,
  };
}

async function enrichCompanyWebsiteWithBudget(
  website: string,
  budget: SubrequestBudget,
  diagnostic?: { reason: 'robots_blocked' | 'http_blocked' | 'source_timeout' | 'source_unavailable'; retryable: boolean },
  expected?: ExpectedCompanyWebsiteIdentity,
): Promise<WebsiteFacts | null> {
  const start = safePublicHttpUrl(website);
  if (!start) return null;
  let robots: string | null;
  try {
    const robotsUrl = new URL('/robots.txt', start);
    if (!(await hasOnlyPublicAddresses(robotsUrl, budget))) {
      if (diagnostic) Object.assign(diagnostic, { reason: 'http_blocked', retryable: false });
      return null;
    }
    const policy = await fetchWithin(
      robotsUrl,
      { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' },
      3_000,
      budget,
      async (response): Promise<{ allow: boolean; body: string | null; reason?: 'robots_blocked' | 'http_blocked' | 'source_unavailable'; retryable?: boolean }> => {
        if (response.status === 404 || response.status === 410) return { allow: true, body: null };
        if (response.status === 401 || response.status === 403) {
          return { allow: false, body: null, reason: 'robots_blocked', retryable: false };
        }
        if (response.status === 429 || response.status >= 500) {
          return { allow: false, body: null, reason: 'source_unavailable', retryable: true };
        }
        if (!response.ok) return { allow: false, body: null, reason: 'http_blocked', retryable: false };
        return { allow: true, body: await readTextBounded(response, MAX_ROBOTS_BYTES) };
      },
    );
    if (!policy.allow) {
      if (diagnostic) Object.assign(diagnostic, {
        reason: policy.reason ?? 'robots_blocked',
        retryable: policy.retryable ?? false,
      });
      return null;
    }
    robots = policy.body;
  } catch {
    // Timeout, transport error, or malformed/oversized policy fails closed.
    if (diagnostic) Object.assign(diagnostic, { reason: 'source_timeout', retryable: true });
    return null;
  }

  try {
    if (robots !== null && !robotsAllows(robots, start)) {
      if (diagnostic) Object.assign(diagnostic, { reason: 'robots_blocked', retryable: false });
      return null;
    }
    const home = await fetchText(start, budget, 1);
    if (!home) {
      if (diagnostic) Object.assign(diagnostic, { reason: 'source_unavailable', retryable: true });
      return null;
    }
    const pages = [home];
    const links = sameOriginLinks(home.html, home.url);
    if (links.length < CONTACT_PAGE_FETCH_LIMIT) {
      for (const link of await sitemapContactLinks(start, robots, budget)) {
        if (links.length >= CONTACT_PAGE_FETCH_LIMIT) break;
        if (links.some((item) => item.toString() === link.toString())) continue;
        links.push(link);
      }
    }
    for (const link of links) {
      if (robots !== null && !robotsAllows(robots, link)) continue;
      const page = await fetchText(link, budget, 0);
      if (page) pages.push(page);
    }
    const binding = expected
      ? verifyCompanyWebsiteBinding(expected, pages)
      : { verified: false, method: null, sourceUrl: null } satisfies CompanyWebsiteBinding;
    const facts = pages.map((page) => extractCompanyPageFacts(page.url, page.html, binding.verified, undefined, expected));
    const telegramRank: Record<TelegramContactType, number> = {
      business: 6, human: 5, unknown: 4, channel: 2, group: 1, bot: 0,
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
    const bindingEvidence = binding.verified && binding.method && binding.sourceUrl
      ? [sourceEvidence(
          'web.company_binding',
          binding.method === 'phone' ? 'Совпадает телефон компании' : 'Совпадает название компании',
          binding.sourceUrl,
          'company_website',
          binding.method === 'phone' ? 0.98 : 0.9,
          'fact',
        )]
      : [];
    return {
      website: home.url.origin,
      phone: facts.find((item) => item.phone)?.phone ?? null,
      genericEmail: facts.find((item) => item.genericEmail)?.genericEmail ?? null,
      telegramUrl: telegramContact && ['human', 'business'].includes(telegramContact.type)
        ? telegramContact.url
        : null,
      telegramContact,
      decisionMakers: [...decisionMakerMap.values()].sort((a, b) => b.confidence - a.confidence),
      evidence: [...bindingEvidence, ...facts.flatMap((item) => item.evidence)],
      signals: facts.flatMap((item) => item.signals).filter((signal, index, all) => (
        all.findIndex((candidate) => candidate.type === signal.type) === index
      )),
    };
  } catch {
    if (diagnostic) Object.assign(diagnostic, { reason: 'source_unavailable', retryable: true });
    return null;
  }
}

export async function enrichCompanyWebsite(
  website: string,
  expected?: ExpectedCompanyWebsiteIdentity,
): Promise<WebsiteFacts | null> {
  return enrichCompanyWebsiteWithBudget(website, new SubrequestBudget(12), undefined, expected);
}

/** Free bounded public page fetch for catalog discovery (audit R1 Tier-1).
 * Same SSRF/DNS/robots-agnostic guards as the enrichment crawler; any failure
 * returns null so a blocked catalog never fails the calling job. */
export async function readPublicPageHtml(raw: string, options: { maxBytes?: number; sameOrigin?: boolean; allowRedirects?: boolean } = {}): Promise<string | null> {
  const url = safePublicHttpUrl(raw);
  if (!url) return null;
  const maxBytes = options.maxBytes ?? MAX_WEBSITE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 900_000) return null;
  try {
    const page = await fetchText(url, new SubrequestBudget(4), options.allowRedirects === false ? 0 : 1, maxBytes);
    if (options.sameOrigin && page && page.url.origin !== url.origin) return null;
    return page?.html ?? null;
  } catch {
    return null;
  }
}

export async function enrichCompanyWebsiteDetailed(
  website: string,
  expected?: ExpectedCompanyWebsiteIdentity,
): Promise<{
  facts: WebsiteFacts | null;
  reason: 'enriched' | 'no_relevant_evidence' | 'invalid_website' | 'robots_blocked' | 'http_blocked' | 'source_timeout' | 'source_unavailable';
  retryable: boolean;
}> {
  if (!safePublicHttpUrl(website)) return { facts: null, reason: 'invalid_website', retryable: false };
  const diagnostic = { reason: 'source_unavailable' as const, retryable: true } as {
    reason: 'robots_blocked' | 'http_blocked' | 'source_timeout' | 'source_unavailable'; retryable: boolean;
  };
  // Single-company detailed crawl: homepage + up to 4 contact pages + optional
  // sitemap lookup all fit the Free-plan 50-subrequest invocation ceiling
  // (queue consumer runs one Lead Radar job per delivery).
  const facts = await enrichCompanyWebsiteWithBudget(website, new SubrequestBudget(20), diagnostic, expected);
  if (!facts) return { facts: null, reason: diagnostic.reason, retryable: diagnostic.retryable };
  const relevant = Boolean(
    facts.phone || facts.genericEmail
    || (facts.telegramContact && ['human', 'business'].includes(facts.telegramContact.type))
    || facts.decisionMakers.length > 0
    || facts.signals.some((signal) => signal.type !== 'active_website'),
  );
  return relevant
    ? { facts, reason: 'enriched', retryable: false }
    : { facts, reason: 'no_relevant_evidence', retryable: false };
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
      const facts = await enrichCompanyWebsiteWithBudget(candidate.website, budget, undefined, {
        name: candidate.name,
        phone: candidate.phone,
        address: candidate.address,
      });
      if (facts) enriched.set(candidate.sourceId, facts);
    }
  });
  await Promise.all(workers);

  return candidates.map((candidate) => {
    const facts = enriched.get(candidate.sourceId);
    if (!facts) return candidate;
    const rank: Record<TelegramContactType, number> = {
      business: 6, human: 5, unknown: 4, channel: 2, group: 1, bot: 0,
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

  async discoverRaw(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult> {
    const budget = new SubrequestBudget(MAX_SOURCE_SUBREQUESTS);
    const bounds = await geocode(input, budget, this.geocodeStore);
    const { query, category, intent } = buildLeadRadarQueryPlan(input, bounds);
    const { response, warnings } = await overpass(query, budget);
    const collectedAt=new Date().toISOString();
    const candidates = rankLeadRadarOsmElements(response.elements ?? [], intent)
      .map((element) => candidateFromOsmElement(element, input, category, collectedAt))
      .filter((item): item is SourceCandidate => Boolean(item));

    const deduped = new Map<string, SourceCandidate>();
    for (const candidate of candidates) {
      const key = `${normalizeCompanyKey(candidate.name)}:${normalizeCompanyKey(candidate.address ?? input.city)}`;
      const existing = deduped.get(key);
      if (!existing || candidate.evidence.length > existing.evidence.length) deduped.set(key, candidate);
    }
    return {
      candidates: [...deduped.values()].slice(0, input.searchGoal === 'telegram_contacts'
        ? Math.min(250, input.maxCandidates ?? input.desiredCount * 5) : Math.min(80, input.desiredCount * 3)),
      sourceWarnings: warnings,
      rawDiscoveredCount: response.elements?.length ?? 0,
    };
  }

  async discover(input: LeadRadarSearchInput): Promise<LeadRadarDiscoveryResult> {
    const raw = await this.discoverRaw(input);
    const enriched = await enrichCandidates(raw.candidates, new SubrequestBudget(MAX_SOURCE_SUBREQUESTS));
    return { ...raw, candidates: enriched };
  }
}
