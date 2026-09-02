/**
 * Signal Radar — web-side discovery.
 *
 * Everything in this module is offline-testable: it takes HTML (or plain text)
 * and returns structured data. Network access lives in the caller so the parsing
 * rules can be pinned with fixtures taken from real markup.
 *
 * Verified 2026-09-02 against live responses:
 *   - `https://uz.tgstat.com/ratings/chats`      -> ~100 Uzbek group slugs
 *   - `https://uz.tgstat.com/ratings/channels`   -> ~97 Uzbek channel slugs
 *   - `https://t.me/s/<slug>`                    -> channel preview: title, about,
 *     member count and ~20 recent messages.
 *
 * Two hard facts that shape the whole design:
 *   1. Public GROUPS have no web preview. `t.me/s/<group>` renders
 *      "Telegram: View @x" with zero messages and no member count. Group content
 *      is only reachable over MTProto, i.e. it costs a join. Channels cost
 *      nothing. That is why the funnel scores web data first and only lets
 *      ~5% of candidates near the Telegram API.
 *   2. Telegram marks unavailable pages with `<meta name="robots" ... noindex>`.
 *      We honour it: a page that asks not to be indexed is dropped, not scraped.
 *
 * tgstat sitemaps are from 2018 and mostly dead, so they are not used as a seed
 * source. Country rating pages are current and robots-permitted
 * (`User-agent: *` disallows only /quotes, /share, /stat/*, /research-2023/personal/*).
 */

import type { SignalService, SignalTriage } from './signal-triage';
import { triageSignal } from './signal-triage';
import { normalizeLeadRadarIntentText } from './intent';

export type SignalLanguage = 'ru' | 'uz' | 'en' | 'other';

/**
 * A page shape we can recognise. `channel` is the only one that carries posts.
 */
export type TelegramPreviewShape = 'channel' | 'page' | 'dead';

export interface TelegramPreviewMessage {
  /** Telegram's own `<slug>/<id>` marker, stable across re-crawls. */
  externalId: string;
  occurredAt: string | null;
  /** Public display name only. Never a phone, never a user id. */
  author: string | null;
  text: string;
}

export interface TelegramPreview {
  slug: string;
  shape: TelegramPreviewShape;
  kind: 'channel' | 'group' | 'unknown';
  title: string;
  about: string;
  members: number | null;
  messages: TelegramPreviewMessage[];
  /** Other t.me entities the channel links to — free candidates for the next hop. */
  linkedSlugs: string[];
  /** False when the page asked us not to index it. We drop those. */
  indexable: boolean;
}

export interface SignalPostAssessment {
  externalId: string;
  occurredAt: string | null;
  author: string | null;
  text: string;
  triage: SignalTriage;
}

export interface SignalTargetAssessment {
  /** 0..100 — how much this channel is worth our attention. */
  score: number;
  language: SignalLanguage;
  services: SignalService[];
  reasons: string[];
  posts: SignalPostAssessment[];
  leadCount: number;
  reviewCount: number;
}

/** Country-rating seeds. Both entries verified live on 2026-09-02. */
export const SIGNAL_DISCOVERY_SOURCES = {
  tgstatChats: (country = 'uz') => `https://${country}.tgstat.com/ratings/chats`,
  tgstatChannels: (country = 'uz') => `https://${country}.tgstat.com/ratings/channels`,
} as const;

type Replacement = string | ((substring: string, ...args: string[]) => string);

const ENTITIES: Array<[RegExp, Replacement]> = [
  [/&quot;/g, '"'],
  [/&#0?39;|&apos;|&#x0?27;/gi, "'"],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&nbsp;|&#160;/gi, ' '],
  [/&mdash;|&#8212;/gi, '—'],
  [/&laquo;|&#171;/gi, '«'],
  [/&raquo;|&#187;/gi, '»'],
  [/&#(\d+);/g, (_, code: string) => safeCodePoint(Number(code))],
  [/&#x([0-9a-f]+);/gi, (_, code: string) => safeCodePoint(parseInt(code, 16))],
];

function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return '';
  try {
    return String.fromCodePoint(value);
  } catch {
    return '';
  }
}

/** Telegram preview pages mix numeric and named entities; both show up in fixtures. */
export function decodeHtmlEntities(raw: string): string {
  let out = raw.replace(/&amp;/g, '&');
  for (const [pattern, replacement] of ENTITIES) {
    out = out.replace(pattern, replacement as never);
  }
  return out;
}

export function htmlToText(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    // Collapse horizontal runs only: the <br> conversion above already
    // produced newlines and we must not flatten them. U+00A0 arrives decoded
    // from &nbsp;, which Telegram emits constantly inside message text.
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "10.9M" -> 10_900_000, "66.3K" -> 66_300, "1 234" -> 1234. */
export function parseCounterValue(raw: string): number | null {
  // \s already covers U+00A0, so counters like "1 234" (Telegram groups
  // thousands with a non-breaking space) collapse without a special case.
  const cleaned = decodeHtmlEntities(raw).replace(/[\s,]/g, '').trim();
  const match = /^(\d+(?:\.\d+)?)([KkMm])?$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const scale = match[2] ? (match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000) : 1;
  return Math.round(value * scale);
}

const NOINDEX_RE = /<meta\s+name="robots"[^>]*\bnoindex/i;
const COUNTER_RE = /class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">([a-z]+)</g;
const TITLE_RE = /tgme_channel_info_header_title"><span dir="auto">([\s\S]*?)<\/span>/;
const ABOUT_RE = /tgme_channel_info_description">([\s\S]*?)<\/div>/;
const PAGE_TITLE_RE = /tgme_page_title"[^>]*>([\s\S]*?)<\/(?:span|div)>/;
const MESSAGE_SPLIT_RE = /<div class="tgme_widget_message[\s"']/g;
const MESSAGE_TEXT_RE = /tgme_widget_message_text[^>]*dir="auto">([\s\S]*?)<\/div>/;
const MESSAGE_POST_RE = /data-post="([^"]+)"/;
const MESSAGE_TIME_RE = /datetime="([^"]+)"/;
const MESSAGE_AUTHOR_RE = /tgme_widget_message_owner_name"[^>]*>([\s\S]*?)<\/a>/;
const TELEGRAM_LINK_RE = /(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,40})(?![A-Za-z0-9_])/g;

const LINK_PATH_STOP = new Set([
  's', 'share', 'joinchat', 'login', 'proxy', 'iv', 'addstickers', 'setlanguage', 'contact', 'c',
]);

/**
 * Parse a `t.me/s/<slug>` preview page.
 *
 * Selectors here were derived from real responses, not guessed — see
 * `tests/fixtures/signal-radar/*.html`, cut from live pages on 2026-09-02.
 */
export function parseTelegramPreview(html: string, slug: string): TelegramPreview {
  const indexable = !NOINDEX_RE.test(html);
  const empty: TelegramPreview = {
    slug,
    shape: 'dead',
    kind: 'unknown',
    title: '',
    about: '',
    members: null,
    messages: [],
    linkedSlugs: [],
    indexable,
  };
  if (!indexable) return empty;

  const counters: Record<string, string> = {};
  for (const match of html.matchAll(COUNTER_RE)) counters[match[2]] = match[1];

  const titleMatch = TITLE_RE.exec(html);
  const pageTitleMatch = PAGE_TITLE_RE.exec(html);
  const title = titleMatch ? htmlToText(titleMatch[1]) : pageTitleMatch ? htmlToText(pageTitleMatch[1]) : '';
  const aboutMatch = ABOUT_RE.exec(html);
  const about = aboutMatch ? htmlToText(aboutMatch[1]) : '';

  const messages = parsePreviewMessages(html);
  const kind: TelegramPreview['kind'] = counters.members
    ? 'group'
    : counters.subscribers
      ? 'channel'
      : 'unknown';

  return {
    slug,
    shape: titleMatch ? 'channel' : pageTitleMatch ? 'page' : 'dead',
    kind,
    title,
    about,
    members: counters.members ? parseCounterValue(counters.members) : counters.subscribers ? parseCounterValue(counters.subscribers) : null,
    messages,
    linkedSlugs: extractTelegramSlugs(html, slug),
    indexable,
  };
}

function parsePreviewMessages(html: string): TelegramPreviewMessage[] {
  const starts: number[] = [];
  for (const match of html.matchAll(MESSAGE_SPLIT_RE)) starts.push(match.index);
  if (starts.length === 0) return [];

  const out: TelegramPreviewMessage[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const chunk = html.slice(starts[index], starts[index + 1] ?? html.length);
    const externalId = MESSAGE_POST_RE.exec(chunk)?.[1];
    const textMatch = MESSAGE_TEXT_RE.exec(chunk);
    if (!externalId || !textMatch) continue;
    const text = htmlToText(textMatch[1]);
    if (!text) continue;
    const authorMatch = MESSAGE_AUTHOR_RE.exec(chunk);
    out.push({
      externalId,
      occurredAt: MESSAGE_TIME_RE.exec(chunk)?.[1] ?? null,
      author: authorMatch ? htmlToText(authorMatch[1]) : null,
      text,
    });
  }
  return out;
}

/** Public @handles a page points at. Used for one-hop expansion only. */
export function extractTelegramSlugs(html: string, exclude?: string): string[] {
  const out = new Set<string>();
  for (const match of html.matchAll(TELEGRAM_LINK_RE)) {
    const slug = match[1];
    if (LINK_PATH_STOP.has(slug.toLowerCase())) continue;
    if (exclude && slug.toLowerCase() === exclude.toLowerCase()) continue;
    out.add(slug);
  }
  return [...out];
}

export interface TgstatEntity {
  slug: string;
  kind: 'channel' | 'group';
}

/** Slugs from a tgstat country rating page. Both entity types share the markup. */
export function parseTgstatEntities(html: string): TgstatEntity[] {
  const out = new Map<string, TgstatEntity>();
  // tgstat paths are `/chat/@slug` (groups) and `/channel/@slug` (channels).
  // The shared prefix is `cha` — then either `t` or `nnel`. "channel" is
  // c-h-a-n-n-e-l, so a `chat` + optional `nel` pattern silently misses it.
  for (const match of html.matchAll(/\/cha(?:t|nnel)\/@([A-Za-z0-9_]{3,40})/g)) {
    const slug = match[1];
    const kind: TgstatEntity['kind'] = match[0] === `/chat/@${slug}` ? 'group' : 'channel';
    if (!out.has(slug)) out.set(slug, { slug, kind });
  }
  return [...out.values()];
}

const UZ_MARKERS = [
  'kerak', 'qilaman', 'qilamiz', 'qidiryapman', 'izlayapman', 'bizning', 'uchun',
  'xizmat', 'sayt', 'ish', 'yordam', 'narxi', 'qancha', 'buyurtma', 'mijoz',
  'kompaniya', 'toshkent', 'o‘zbek', "o'zbek", 'salom', 'rahmat', 'iltimos',
];
const EN_MARKERS = [
  'the', 'and', 'need', 'looking', 'website', 'design', 'please', 'with', 'for',
  'our', 'this', 'that', 'will', 'price', 'contact',
];

/**
 * Coarse language gate. We do not need a classifier — we only need to know
 * whether a channel speaks a language our dictionaries cover.
 */
export function detectSignalLanguage(text: string): SignalLanguage {
  const sample = text.slice(0, 4000);
  if (!sample) return 'other';
  const letters = sample.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return 'other';
  const cyrillic = (letters.match(/[\p{Script=Cyrillic}]/gu) ?? []).length;
  if (cyrillic / letters.length > 0.25) return 'ru';
  const probe = normalizeLeadRadarIntentText(sample);
  const words = new Set(probe.split(' ').filter(Boolean));
  const uz = UZ_MARKERS.filter((marker) => words.has(marker)).length;
  const en = EN_MARKERS.filter((marker) => words.has(marker)).length;
  if (uz >= 2) return 'uz';
  if (en >= 3) return 'en';
  if (uz === 1) return 'uz';
  return 'other';
}

const FRESHNESS_MS = { day: 86_400_000, week: 604_800_000, month: 2_592_000_000 };

export interface ScoreSignalTargetOptions {
  now?: number;
  /** Skip per-post triage once this many messages have been processed. */
  maxPosts?: number;
}

/**
 * Turn a preview into a decision: is this channel worth watching, and why.
 *
 * Deliberately rule-based, no LLM — the answer must be reproducible and free.
 */
export function scoreSignalTarget(
  preview: TelegramPreview,
  options: ScoreSignalTargetOptions = {},
): SignalTargetAssessment {
  const now = options.now ?? Date.now();
  const maxPosts = options.maxPosts ?? 20;
  const reasons: string[] = [];
  const services = new Set<SignalService>();

  const corpus = [preview.title, preview.about, ...preview.messages.map((message) => message.text)]
    .join('\n');
  const language = detectSignalLanguage(corpus);

  const posts: SignalPostAssessment[] = [];
  let leadCount = 0;
  let reviewCount = 0;
  for (const message of preview.messages.slice(0, maxPosts)) {
    const triage = triageSignal(message.text);
    if (triage.verdict === 'lead') leadCount += 1;
    if (triage.verdict === 'review') reviewCount += 1;
    for (const service of triage.services) services.add(service);
    posts.push({
      externalId: message.externalId,
      occurredAt: message.occurredAt,
      author: message.author,
      text: message.text,
      triage,
    });
  }

  let score = 0;
  if (language === 'ru' || language === 'uz') {
    score += 25;
    reasons.push(`lang:${language}`);
  } else if (language === 'en') {
    score += 5;
    reasons.push('lang:en');
  }

  if (leadCount > 0) {
    score += Math.min(35, leadCount * 18);
    reasons.push(`leads:${leadCount}`);
  }
  if (reviewCount > 0) {
    score += Math.min(15, reviewCount * 5);
    reasons.push(`review:${reviewCount}`);
  }

  const members = preview.members ?? 0;
  if (members >= 10_000) score += 20;
  else if (members >= 2_000) score += 15;
  else if (members >= 500) score += 10;
  else if (members >= 100) score += 5;
  if (members >= 500) reasons.push(`members:${members}`);

  const newest = preview.messages
    .map((message) => (message.occurredAt ? Date.parse(message.occurredAt) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];
  if (newest !== undefined) {
    const age = now - newest;
    if (age <= FRESHNESS_MS.day) {
      score += 10;
      reasons.push('fresh:1d');
    } else if (age <= FRESHNESS_MS.week) {
      score += 6;
      reasons.push('fresh:7d');
    } else if (age <= FRESHNESS_MS.month) {
      score += 3;
    }
  }

  if (preview.kind === 'group') reasons.push('needs:join');
  if (!indexable(preview)) reasons.push('noindex');

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    language,
    services: [...services],
    reasons,
    posts,
    leadCount,
    reviewCount,
  };
}

function indexable(preview: TelegramPreview): boolean {
  return preview.indexable;
}
