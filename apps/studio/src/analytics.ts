/**
 * The studio's funnel, measured three ways (STUDIO-SPEC §10.2, §10.5):
 *
 *   GA4      browser events through the gtag the page's <head> sets up
 *            (scripts/analytics-snippet.ts), from a closed catalogue with a
 *            closed list of parameters. Never anything the person typed.
 *            The browser never sends `purchase`: a paid order is reported
 *            by the server (GA4 Measurement Protocol, weeks 6–7).
 *   Metrika  goals of counter 111312750 from the studio's OWN closed list,
 *            STUDIO_YM_GOALS. The site's catalogue
 *            (src/lib/analytics/yandexMetrika.ts, scripts/analytics-metrika.ts)
 *            is not touched: tests/yandex-metrika.test.ts holds it verbatim.
 *            The owner creates these goals in the Metrika account.
 *   server   POST /api/studio/event with the closed types of
 *            functions/lib/studio/events.ts into gpt_ui_events. A 404 (the
 *            switch STUDIO_EVENTS is off) is ignored like any other answer.
 *
 * One call of a funnel step does all three. Every path is wrapped: absent,
 * blocked or throwing analytics never break the form.
 */
import type { EventBody, EventType } from './api';

/** Yandex Metrika counter of the site (the same as src/lib/analytics/yandexMetrika.ts). */
export const STUDIO_YM_COUNTER_ID = 111312750;

/** The studio's Metrika goals: closed. tests/studio-analytics.test.ts holds the list. */
export const STUDIO_YM_GOALS = {
  /** The person submitted the form of a tool. */
  toolStarted: 'studio_tool_started',
  /** A result was shown in full. */
  result: 'studio_result',
  /** The tariffs were shown: under a result, or at the free limit. */
  tariffsViewed: 'studio_tariffs_viewed',
  /** A checkout was started (kunlik or oylik). */
  checkout: 'studio_checkout',
} as const;

export type StudioYmGoal = (typeof STUDIO_YM_GOALS)[keyof typeof STUDIO_YM_GOALS];
const YM_GOALS: ReadonlySet<string> = new Set(Object.values(STUDIO_YM_GOALS));

/** The studio's GA4 browser events: closed. No `purchase` here, ever. */
export const STUDIO_GA4_EVENTS = {
  toolStarted: 'studio_tool_started',
  resultReady: 'studio_result_ready',
  /**
   * The download button was clicked and the browser was asked to save the
   * .pptx; whether it did is unknown (an in-app WebView often cannot).
   * `images` = pictures in it, `inapp` = instagram | facebook | telegram | none.
   */
  download: 'studio_download_clicked',
  /** The server refused a start for a limit; `code` free_limit | ip_ceiling | try_later | free_closed. */
  limitHit: 'studio_limit_hit',
  /** A step failed; `code` is the coarse code, never a text. */
  error: 'studio_error',
  tariffsViewed: 'studio_tariffs_viewed',
  checkoutStarted: 'studio_checkout_started',
  checkoutResult: 'studio_checkout_result',
} as const;

export type StudioGa4Event = (typeof STUDIO_GA4_EVENTS)[keyof typeof STUDIO_GA4_EVENTS];
const GA4_EVENTS: ReadonlySet<string> = new Set(Object.values(STUDIO_GA4_EVENTS));

/** GA4 parameters the studio may send; anything else is dropped. Funnel metadata only. */
export const STUDIO_GA4_PARAMS: ReadonlySet<string> = new Set([
  'tool', 'source', 'shape', 'slides', 'audience', 'images', 'code', 'where', 'plan', 'status', 'inapp', 'seconds',
]);

type Params = Record<string, string | number | boolean | null | undefined>;

interface AnalyticsWindow {
  dataLayer?: Array<Record<string, unknown>>;
  gtag?: (...args: unknown[]) => void;
  ym?: (...args: unknown[]) => void;
}

const analyticsWindow = (): AnalyticsWindow | null => (typeof window === 'undefined' ? null : (window as unknown as AnalyticsWindow));

/** The parameters GA4 may get: listed names, scalar values, strings cut to 40 characters. */
export function cleanGa4Params(params: Params): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (typeof location !== 'undefined') clean.route = location.pathname;
  if (typeof document !== 'undefined' && document.documentElement?.lang) clean.lang = document.documentElement.lang.slice(0, 2);
  for (const [key, value] of Object.entries(params)) {
    if (!STUDIO_GA4_PARAMS.has(key)) continue;
    if (typeof value === 'string') clean[key] = value.slice(0, 40);
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'boolean') clean[key] = value;
  }
  return clean;
}

/** One GA4 event from the catalogue; any other name is dropped. */
export function trackGa4(event: StudioGa4Event, params: Params = {}): void {
  if (!GA4_EVENTS.has(event)) return;
  try {
    const w = analyticsWindow();
    if (!w) return;
    const payload = cleanGa4Params(params);
    // gtag already writes into dataLayer; using both would count twice.
    if (typeof w.gtag === 'function') w.gtag('event', event, payload);
    else {
      if (!w.dataLayer) w.dataLayer = [];
      w.dataLayer.push({ event, ...payload });
    }
  } catch {
    /* analytics must never break the page */
  }
}

/** A Metrika goal from the studio's list; the name is the whole payload. */
export function reachStudioGoal(goal: StudioYmGoal): void {
  if (!YM_GOALS.has(goal)) return;
  try {
    const w = analyticsWindow();
    if (w && typeof w.ym === 'function') w.ym(STUDIO_YM_COUNTER_ID, 'reachGoal', goal);
  } catch {
    /* blocked, absent or throwing */
  }
}

/** A random UUID v4 (crypto.randomUUID where it exists; it needs a secure context). */
export function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // Fall through.
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type Tool = 'presentation' | 'photo';

export interface Funnel {
  toolStarted(tool: Tool, params?: Params): void;
  resultReady(tool: Tool, source: 'free' | 'paid', params?: Params): void;
  tariffsViewed(where: 'after_result' | 'limit'): void;
  checkoutStarted(plan: 'kunlik' | 'oylik'): void;
  checkoutResult(status: 'paid' | 'pending' | 'cancelled'): void;
  download(tool: Tool, images: number, inapp: string): void;
  limitHit(code: string): void;
  error(code: string): void;
}

/**
 * The funnel of one page view. `send` posts a server event (api.event);
 * `viewId` ties a view's events together without naming anyone. A step that
 * repeats on the page (a second deck the same day, a tariff card shown
 * twice) is counted once per view for Metrika and the server.
 */
export function createFunnel(send: (body: EventBody) => void, viewId: string = randomId()): Funnel {
  const once = new Set<string>();
  const server = (type: EventType, detail: string) => {
    const key = `${type}:${detail}`;
    if (once.has(key)) return false;
    once.add(key);
    try {
      send({ id: randomId(), type, detail, viewId });
    } catch {
      // The event is lost; the page goes on.
    }
    return true;
  };
  return {
    toolStarted(tool, params = {}) {
      trackGa4(STUDIO_GA4_EVENTS.toolStarted, { ...params, tool });
      if (server('studio_tool_started', tool)) reachStudioGoal(STUDIO_YM_GOALS.toolStarted);
    },
    resultReady(tool, source, params = {}) {
      trackGa4(STUDIO_GA4_EVENTS.resultReady, { ...params, tool, source });
      if (server('studio_result_ready', source)) reachStudioGoal(STUDIO_YM_GOALS.result);
    },
    tariffsViewed(where) {
      trackGa4(STUDIO_GA4_EVENTS.tariffsViewed, { where });
      if (server('studio_tariffs_viewed', where)) reachStudioGoal(STUDIO_YM_GOALS.tariffsViewed);
    },
    checkoutStarted(plan) {
      trackGa4(STUDIO_GA4_EVENTS.checkoutStarted, { plan });
      if (server('studio_checkout_started', plan)) reachStudioGoal(STUDIO_YM_GOALS.checkout);
    },
    checkoutResult(status) {
      trackGa4(STUDIO_GA4_EVENTS.checkoutResult, { status });
      server('studio_checkout_result', status);
    },
    download(tool, images, inapp) {
      trackGa4(STUDIO_GA4_EVENTS.download, { tool, images, inapp });
    },
    limitHit(code) {
      trackGa4(STUDIO_GA4_EVENTS.limitHit, { code });
    },
    error(code) {
      trackGa4(STUDIO_GA4_EVENTS.error, { code });
    },
  };
}
