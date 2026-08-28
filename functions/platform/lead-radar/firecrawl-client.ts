import { readTextBounded } from './sources';
import { safePublicHttpUrl } from './validation';
import { FirecrawlStore, type FirecrawlJobContext, type FirecrawlLimits } from './firecrawl-store';

export interface FirecrawlEnvironment {
  FIRECRAWL_API_KEY?: string;
  LEAD_RADAR_FIRECRAWL_ENABLED?: string;
  LEAD_RADAR_FIRECRAWL_MODE?: string;
  LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS?: string;
  LEAD_RADAR_FIRECRAWL_DAILY_CREDITS?: string;
  LEAD_RADAR_FIRECRAWL_SEARCH_CREDITS?: string;
  LEAD_RADAR_FIRECRAWL_DOMAIN_CREDITS?: string;
}

export interface FirecrawlConfig {
  key: string;
  mode: 'shadow' | 'fallback';
  limits: FirecrawlLimits;
}

export function firecrawlConfig(env: FirecrawlEnvironment, orgId: string): FirecrawlConfig | null {
  const orgs = (env.LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (env.LEAD_RADAR_FIRECRAWL_ENABLED !== 'true'
    || !['shadow', 'fallback'].includes(env.LEAD_RADAR_FIRECRAWL_MODE ?? '')
    || !orgs.includes(orgId) || !env.FIRECRAWL_API_KEY?.trim()) return null;
  const limit = (value: string | undefined, fallback: number, max: number): number => {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) return 0;
    return Math.min(max, Number(value));
  };
  const limits = {
    dailyCredits: limit(env.LEAD_RADAR_FIRECRAWL_DAILY_CREDITS, 200, 200),
    searchCredits: limit(env.LEAD_RADAR_FIRECRAWL_SEARCH_CREDITS, 140, 200),
    domainCredits: limit(env.LEAD_RADAR_FIRECRAWL_DOMAIN_CREDITS, 14, 14),
    companyCredits: 7,
  };
  if (Object.values(limits).some((n) => !Number.isSafeInteger(n) || n < 1)) return null;
  return { key: env.FIRECRAWL_API_KEY.trim(), mode: env.LEAD_RADAR_FIRECRAWL_MODE as 'shadow' | 'fallback', limits };
}

export class FirecrawlError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly retryAt: string | null = null) {
    super(`firecrawl_${code}`);
    this.name = 'FirecrawlError';
  }
}

const NON_COMPANY_HOSTS = /(^|\.)(t\.me|telegram\.me|instagram\.com|facebook\.com|youtube\.com|google\.[a-z.]+|yandex\.[a-z.]+|2gis\.[a-z.]+|gptbot\.uz)$/i;

/** Never relay secrets, arbitrary query strings, logins or local addresses. */
export function firecrawlPublicUrl(value: string): URL | null {
  const url = safePublicHttpUrl(value);
  if (!url || url.search || NON_COMPANY_HOSTS.test(url.hostname)
    || /(?:^|\/)(?:admin|admin-tools|login|oauth|auth|logout|account|private)(?:\/|$)/i.test(url.pathname)
    || /\.(?:pdf|zip|docx?|xlsx?|exe|png|jpe?g|webp|svg|mp[34])$/i.test(url.pathname)) return null;
  return url;
}

export function firecrawlObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FirecrawlError('invalid_response');
  return value as Record<string, unknown>;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export { digest as firecrawlDigest };

export class FirecrawlClient {
  private submissions = 0;
  private completed: Promise<Map<string, unknown>> | undefined;
  constructor(
    private readonly config: FirecrawlConfig,
    private readonly store: FirecrawlStore,
    private readonly ctx: FirecrawlJobContext,
    private readonly transport: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async request<T>(operation: 'search' | 'map' | 'scrape', domain: string, body: Record<string, unknown>,
    decode: (value: Record<string, unknown>, observedAt: string) => Promise<T> | T,
    variant = ''): Promise<T> {
    const at = this.now().toISOString();
    const key = await digest(JSON.stringify(['firecrawl:v1', this.ctx.orgId, this.ctx.jobId, operation, body, variant]));
    const cached = await (this.completed ??= this.store.completedResults(this.ctx, at));
    if (cached.has(key)) return cached.get(key) as T;
    const preflight = await this.store.preflight(this.ctx.orgId, key, at);
    const previous = preflight?.id ? preflight : null;
    let attempt = 1;
    if (previous) {
      if (previous.state === 'completed') {
        if (!previous.result_json || !previous.result_expires_at || previous.result_expires_at <= at) {
          throw new FirecrawlError('result_expired');
        }
        return JSON.parse(previous.result_json) as T;
      }
      if (previous.state === 'started' || previous.state === 'unknown') throw new FirecrawlError('request_unknown');
      if (previous.error_code !== 'rate_limited' || previous.attempt >= 2) {
        throw new FirecrawlError(previous.error_code ?? 'provider_failed');
      }
      if (previous.retry_at && previous.retry_at > at) throw new FirecrawlError('rate_limited', true, previous.retry_at);
      attempt = 2;
    }
    // A bounded delivery stays below the Workers Free D1/subrequest ceiling.
    // The next Queue delivery reuses all completed results from this job.
    if (this.submissions >= 2) throw new FirecrawlError('continuation', true);
    const blocked = preflight?.blocked;
    if (blocked) throw new FirecrawlError(blocked, blocked === 'rate_limited');
    const rateLimited = () => new FirecrawlError('rate_limited', true, new Date(Date.parse(at) + 60_000).toISOString());
    if ((preflight?.recent ?? 0) >= 10 || (preflight?.active ?? 0) >= 2) throw rateLimited();
    const id = await this.store.reserve(this.ctx, key, operation, domain, attempt, this.config.limits, at);
    if (!id) {
      if (await this.store.throttled(at)) throw rateLimited();
      throw new FirecrawlError('budget_or_lease_blocked');
    }
    this.submissions++;
    const controller = new AbortController();
    // Includes reading the body. No silent SDK retries or optional billable AI.
    const timer = setTimeout(() => controller.abort(), 35_000);
    let response: Response | undefined;
    try {
      // Native workerd fetch is receiver-sensitive. Calling this.transport(...)
      // binds the client as `this` and throws before any request reaches Firecrawl.
      const request = this.transport;
      response = await request(`https://api.firecrawl.dev/v2/${operation}`, {
        // workerd supports manual/follow, not redirect:error. Manual also keeps
        // the API credential from being forwarded to a redirected destination.
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const code = response.status === 402 ? 'credits_exhausted'
          : response.status === 401 || response.status === 403 ? 'authentication_failed'
            : response.status === 429 ? 'rate_limited' : 'provider_failed';
        const seconds = Math.min(900, Math.max(60, Number(response.headers.get('retry-after')) || 60));
        const retryAt = code === 'rate_limited' ? new Date(this.now().getTime() + seconds * 1000).toISOString() : null;
        if (code === 'credits_exhausted' || code === 'authentication_failed' || retryAt) {
          await this.store.trip(code, this.now().toISOString(), retryAt ?? undefined);
        }
        throw new FirecrawlError(code, code === 'rate_limited' && attempt < 2, retryAt);
      }
      const parsed = firecrawlObject(JSON.parse(await readTextBounded(response, 2_000_000)));
      if (parsed.success !== true) throw new FirecrawlError('invalid_response');
      const value = await decode(parsed, at);
      await this.store.finish(id, 'completed', value, null, null, this.now().toISOString());
      return value;
    } catch (error) {
      const failure = error instanceof FirecrawlError ? error : new FirecrawlError('request_unknown');
      // Neither errors from the upstream body nor headers/key enter diagnostics.
      await this.store.finish(id, failure.code === 'request_unknown' ? 'unknown' : 'failed', null,
        failure.code, failure.retryAt, this.now().toISOString());
      throw failure;
    } finally {
      clearTimeout(timer);
      if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => undefined);
    }
  }
}
