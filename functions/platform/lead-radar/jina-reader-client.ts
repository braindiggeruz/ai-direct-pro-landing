import { readTextBounded } from './sources';
import { safePublicHttpUrl } from './validation';

/**
 * Free Jina Reader fallback for the contact-source fetch chain.
 *
 * Step 0 finding (verified 2026-08-29 against the live endpoint):
 *   curl -H "X-Respond-With: html" https://r.jina.ai/https://example.com
 * returns the REAL rendered HTML (`<html lang="en"><head><title>Example Domain`
 * ...), while the same request WITHOUT the header returns markdown
 * ("Markdown Content: ..."). Because extractPublicBusinessContacts expects raw
 * HTML (JSON-LD scripts, tgme_page_* divs, <main> blocks), this client always
 * sends `X-Respond-With: html` and feeds the body directly into the extractor.
 * No markdown adapter is needed.
 *
 * Pacing: the free tier allows 20 requests/minute without an API key. Slots are
 * reserved through the generic per-source CAS throttle table
 * `lead_radar_source_throttles` (migration 0041) under the dedicated provider
 * bucket source_key='jina_reader' — never shared with 'nominatim' or the
 * Firecrawl budget tables. No new D1 migration is required.
 */

export interface JinaReaderEnvironment {
  LEAD_RADAR_JINA_ENABLED?: string;
  JINA_API_KEY?: string;
}

export interface JinaReaderConfig {
  key: string | null;
}

export function jinaReaderConfig(env: JinaReaderEnvironment): JinaReaderConfig | null {
  if (env.LEAD_RADAR_JINA_ENABLED !== 'true') return null;
  const key = env.JINA_API_KEY?.trim() || null;
  return { key };
}

/** Reason codes mirror the contact-source worker / enrichment taxonomy. */
export class JinaReaderError extends Error {
  constructor(
    readonly code: 'rate_limited' | 'source_timeout' | 'source_unavailable'
      | 'authentication_failed' | 'target_http_error' | 'invalid_page' | 'unsafe_url',
    readonly retryable = false,
    readonly retryAt: string | null = null,
  ) {
    super(`jina_${code}`);
    this.name = 'JinaReaderError';
  }
}

const JINA_ORIGIN = 'https://r.jina.ai/';
/** Separate provider bucket inside the shared throttle table. */
const THROTTLE_KEY = 'jina_reader';
/** Free tier: 20 requests/minute => one slot every 3 seconds. */
const FREE_INTERVAL_MS = 3_000;
/** Authenticated keys are not free-tier paced; stay polite anyway. */
const KEYED_INTERVAL_MS = 120;
const MAX_PAGE_BYTES = 900_000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Never block a queue delivery longer than this waiting for a pacing slot. */
const MAX_SLOT_WAIT_MS = 12_000;

export class JinaReaderClient {
  constructor(
    private readonly config: JinaReaderConfig,
    private readonly db: D1Database,
    private readonly transport: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** The pre-0041 schema has no throttle table; Jina stays off there. */
  async available(): Promise<boolean> {
    try {
      const row = await this.db.prepare(`SELECT COUNT(*) AS cols FROM pragma_table_info('lead_radar_source_throttles')
        WHERE name IN ('source_key','next_allowed_at','updated_at')`).first<{ cols: number }>();
      return row?.cols === 3;
    } catch { return false; }
  }

  /** D1-backed CAS pacing: one atomic upsert wins each slot, no read-then-write race. */
  private async acquireSlot(): Promise<void> {
    const interval = this.config.key ? KEYED_INTERVAL_MS : FREE_INTERVAL_MS;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const at = this.now();
      const result = await this.db.prepare(`INSERT INTO lead_radar_source_throttles (source_key, next_allowed_at, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          next_allowed_at = excluded.next_allowed_at,
          updated_at = excluded.updated_at
        WHERE lead_radar_source_throttles.next_allowed_at <= excluded.updated_at`)
        .bind(THROTTLE_KEY, new Date(at.getTime() + interval).toISOString(), at.toISOString()).run();
      if (Number(result.meta.changes ?? 0) === 1) return;
      const row = await this.db.prepare(`SELECT next_allowed_at FROM lead_radar_source_throttles WHERE source_key = ?`)
        .bind(THROTTLE_KEY).first<{ next_allowed_at: string }>();
      const wait = Date.parse(row?.next_allowed_at ?? '') - at.getTime();
      if (!Number.isFinite(wait) || wait > MAX_SLOT_WAIT_MS) {
        throw new JinaReaderError('rate_limited', true, new Date(at.getTime() + 60_000).toISOString());
      }
      await this.sleep(Math.max(25, wait));
    }
    throw new JinaReaderError('rate_limited', true, new Date(this.now().getTime() + 60_000).toISOString());
  }

  /** Returns rendered raw HTML of the target page, or throws JinaReaderError. */
  async fetchHtml(value: string): Promise<string> {
    const target = safePublicHttpUrl(value);
    if (!target) throw new JinaReaderError('unsafe_url');
    await this.acquireSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response | undefined;
    try {
      // Native workerd fetch is receiver-sensitive (see FirecrawlClient).
      const request = this.transport;
      const headers: Record<string, string> = { 'X-Respond-With': 'html', Accept: 'text/html' };
      if (this.config.key) headers.Authorization = `Bearer ${this.config.key}`;
      // Manual redirect keeps an optional API credential from being forwarded.
      response = await request(`${JINA_ORIGIN}${target.toString()}`, {
        method: 'GET', redirect: 'manual', signal: controller.signal, headers,
      });
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Math.min(900, Math.max(15, Number(response.headers.get('retry-after')) || 60));
          throw new JinaReaderError('rate_limited', true, new Date(this.now().getTime() + seconds * 1000).toISOString());
        }
        if (response.status === 401 || response.status === 403) throw new JinaReaderError('authentication_failed');
        if (response.status >= 500 || response.status === 408) throw new JinaReaderError('source_unavailable', true);
        // 4xx such as 422/451: Jina could not or may not render this origin.
        throw new JinaReaderError('target_http_error');
      }
      let html: string;
      try {
        html = await readTextBounded(response, MAX_PAGE_BYTES);
      } catch {
        throw new JinaReaderError('invalid_page');
      }
      // An unreachable or blocked origin comes back empty or as non-HTML text.
      if (!/<[a-z][^>]*>/i.test(html)) throw new JinaReaderError('invalid_page');
      return html;
    } catch (error) {
      if (error instanceof JinaReaderError) throw error;
      const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      throw new JinaReaderError(timedOut ? 'source_timeout' : 'source_unavailable', true);
    } finally {
      clearTimeout(timer);
      if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => undefined);
    }
  }
}
