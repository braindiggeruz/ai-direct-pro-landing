import type { TelegramHandleKind } from '../../../src/shared/lead-radar-export-contacts';
import { isCacheableTelegramUsername, writeTelegramHandleVerdict } from './telegram-handle-store';

export {
  readTelegramHandleVerdicts,
  telegramHandleCacheKey,
  writeTelegramHandleVerdict,
} from './telegram-handle-store';

/**
 * Free Telegram handle classification (owner audit 22.11.2026, EX-09).
 *
 * The public page https://t.me/<handle> already tells a bot ("Start Bot"), a
 * channel ("subscribers" / channel preview), a group ("members") and a dead
 * username (noindex, no title) apart. Reading it costs no Telegram account
 * lookup, so bots, channels, groups and dead handles are removed before any
 * MTProto request and before the export file is written.
 */

export interface PublicTelegramCard {
  kind: TelegramHandleKind | 'unknown';
  title: string;
}

const NOINDEX_RE = /<meta\s+name="robots"[^>]*\bnoindex/i;
const PAGE_TITLE_RE = /class="tgme_page_title"[^>]*>([\s\S]*?)<\/(?:span|div)>/;
const PAGE_EXTRA_RE = /class="tgme_page_extra"[^>]*>([\s\S]*?)<\/div>/;
const ACTION_RE = /class="tgme_action_button_new[^"]*"[^>]*>([\s\S]*?)<\/a>/;
const COUNTER_RE = /class="counter_value">[^<]+<\/span>\s*<span class="counter_type">([a-z]+)</g;
const GENERIC_OG_TITLE_RE = /property="og:title"\s+content="Telegram: Contact @/i;
const CHANNEL_PREVIEW_RE = /tgme_action_button_new[^>]*href="\/s\/|Preview channel/i;

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Classify a public t.me page. `unknown` means the markup did not match a known shape. */
export function classifyPublicTelegramCard(html: string): PublicTelegramCard {
  const titleMatch = PAGE_TITLE_RE.exec(html);
  const title = titleMatch ? text(titleMatch[1]) : '';
  if (NOINDEX_RE.test(html) && !title) return { kind: 'not_found', title: '' };
  if (!title && GENERIC_OG_TITLE_RE.test(html)) return { kind: 'not_found', title: '' };
  const extra = text(PAGE_EXTRA_RE.exec(html)?.[1] ?? '');
  const action = text(ACTION_RE.exec(html)?.[1] ?? '').toLowerCase();
  const counters = new Set([...html.matchAll(COUNTER_RE)].map((match) => match[1]));
  if (/start bot|запустить бота/i.test(action)) return { kind: 'bot', title };
  if (counters.has('members') || /(?:members|участник)/i.test(extra)) return { kind: 'group', title };
  if (counters.has('subscribers') || /(?:subscribers|подписчик)/i.test(extra) || CHANNEL_PREVIEW_RE.test(html)) return { kind: 'channel', title };
  if (title && /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(extra) && /send message|написать|отправить сообщение/i.test(action)) return { kind: 'user', title };
  return { kind: 'unknown', title };
}

export interface PublicCardCheckOptions {
  fetch?: typeof fetch;
  /** Hard cap of pages read in one call. */
  limit?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Overall wall-clock budget. */
  budgetMs?: number;
  now?: Date;
  /** How long a passed canary is trusted in this isolate; tests pass 0. */
  canaryCacheMs?: number;
}

/**
 * Canary: Telegram's own public channel must classify as a channel. If t.me
 * serves this egress a different page (a block page, a consent wall, a markup
 * change), every handle would look dead or unknown, so nothing is written.
 */
const CANARY_HANDLE = 'telegram';
const CANARY_KIND: TelegramHandleKind = 'channel';
let canaryPassedUntil = 0;

/** Tests only: forget a passed canary so the next check runs it again. */
export function resetTelegramCanaryCache(): void {
  canaryPassedUntil = 0;
}

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; GPTBot.uz Lead Radar contact check)', Accept: 'text/html' };

async function readCard(fetcher: typeof fetch, username: string, timeoutMs: number): Promise<{ status: number; kind: PublicTelegramCard['kind'] | null }> {
  const response = await fetcher(`https://t.me/${username}`, {
    headers: REQUEST_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return { status: response.status, kind: null };
  const html = (await response.text()).slice(0, 200_000);
  return { status: response.status, kind: classifyPublicTelegramCard(html).kind };
}

/**
 * Read public t.me pages for handles without a cached verdict, bounded in
 * count, concurrency and time. Stops on HTTP 429. Returns new verdicts only.
 */
export async function checkTelegramHandlesPublicly(
  db: D1Database,
  usernames: readonly string[],
  options: PublicCardCheckOptions = {},
): Promise<Map<string, TelegramHandleKind>> {
  const fetcher = options.fetch ?? fetch;
  const limit = Math.max(0, Math.min(80, options.limit ?? 40));
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 3));
  const timeoutMs = Math.max(1000, Math.min(15000, options.timeoutMs ?? 8000));
  const deadline = Date.now() + Math.max(1000, Math.min(25000, options.budgetMs ?? 15000));
  const queue = [...new Set(usernames.map((name) => name.toLowerCase()))]
    .filter(isCacheableTelegramUsername).slice(0, limit);
  const found = new Map<string, TelegramHandleKind>();
  if (!queue.length) return found;
  const canaryCacheMs = Math.max(0, options.canaryCacheMs ?? 10 * 60_000);
  if (canaryCacheMs === 0 || Date.now() >= canaryPassedUntil) {
    try {
      const canary = await readCard(fetcher, CANARY_HANDLE, timeoutMs);
      if (canary.kind !== CANARY_KIND) return found;
      canaryPassedUntil = Date.now() + canaryCacheMs;
    } catch {
      return found;
    }
  }
  let stopped = false;
  async function worker(): Promise<void> {
    while (!stopped && queue.length && Date.now() < deadline) {
      const username = queue.shift()!;
      try {
        const card = await readCard(fetcher, username, timeoutMs);
        if (card.status === 429) { stopped = true; return; }
        if (!card.kind || card.kind === 'unknown') continue;
        found.set(username, card.kind);
        await writeTelegramHandleVerdict(db, username, card.kind, 'public_card', options.now);
      } catch { /* a timeout or network error leaves the handle unclassified */ }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return found;
}
