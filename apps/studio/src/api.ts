/**
 * Typed calls to /api/studio/* (STUDIO-SPEC §6). Same origin only: every
 * path is a relative /api/studio/… path, cookies go with
 * `credentials: 'same-origin'`, and nothing here can be pointed at another
 * host.
 *
 * Every call resolves, never rejects. A failure is `{ ok: false, code }`
 * where `code` is the server's code from its closed list
 * (functions/lib/studio/http.ts STUDIO_ERRORS) or one of the browser's own:
 * `network` (no answer), `timeout`, `aborted`, or a code guessed from the
 * status when the body was not the studio's JSON (a 404 of a studio that is
 * off has the studio's body; a proxy's 502 page does not).
 *
 * Nothing the person typed is ever logged; the topic travels only in the
 * bodies of /presentations and /:job/slides.
 */

export const STUDIO_API_BASE = '/api/studio/';

export type StudioLocale = 'uz' | 'ru';
export type StudioAudience = 'maktab' | 'talaba' | 'umumiy';
export type DeckShapeName = 'free' | 'full';
export type SlideLayout = 'title-bullets' | 'image-right' | 'image-full' | 'two-columns';

/** Codes of the browser's own failures, next to the server's. */
export type ClientCode = 'network' | 'timeout' | 'aborted';

export interface Failure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  /** /:job/slides: the job has a call left for this part. */
  readonly retry?: boolean;
  /**
   * 429 free_limit / ip_ceiling / try_later and a day-long 503 studio_busy:
   * when the free day starts again; 409 job_in_progress: when the open job expires.
   */
  readonly resetsAt?: string;
  /** 422 topic_refused: the refusal's coarse category. */
  readonly category?: string;
  /** Retry-After, in seconds. */
  readonly retryAfter?: number;
  /** 409 order_open: the buyer's open order. */
  readonly orderId?: string;
}

export type Result<T> = { readonly ok: true; readonly status: number; readonly data: T } | Failure;

export interface DeckShapeLimits {
  readonly minSlides: number;
  readonly maxSlides: number;
  readonly images: number;
  readonly notes: boolean;
  readonly palettes: number;
}

export type StudioPlanId = 'kunlik' | 'oylik';
export type StudioProvider = 'payme' | 'click';

/** One tariff of the offer edition in force (/config `plans`; functions/lib/studio/plans.ts). */
export interface StudioPlanOffer {
  readonly id: StudioPlanId;
  readonly itemId: string;
  readonly amountTiyin: number;
  readonly amountUzs: number;
  readonly duration: { readonly hours: number } | { readonly calendarMonths: number };
  /** Full presentations. */
  readonly presentationFull: number;
  /** Photo tasks; 0 in the edition without the photo tool. */
  readonly photoTask: number;
  readonly regenPerUnit: number;
}

/** GET /config (functions/api/studio/config.ts). */
export interface StudioPublicConfig {
  readonly tools: { readonly freeDeck: boolean; readonly fullDeck: boolean; readonly photo: boolean };
  /**
   * `mode` null: sales are off (the page still shows prices and «To‘lov
   * vaqtincha to‘xtatilgan»); `providers` the ones that sell now, in the
   * order the window offers them (empty: the same message).
   */
  readonly payments: { readonly mode: null | 'test' | 'live'; readonly providers: readonly StudioProvider[] };
  readonly plans: readonly StudioPlanOffer[];
  readonly free: { readonly presentation: number; readonly photo: number; readonly resetsAt: string };
  readonly shapes: { readonly free: DeckShapeLimits; readonly full: DeckShapeLimits };
  readonly turnstileSiteKey: string | null;
  readonly termsVersion: string | null;
  /** The offer's links (https://gptbot.uz/…), null while unset. */
  readonly terms?: { readonly ru: string | null; readonly uz: string | null };
  readonly aiLabel: boolean;
}

/**
 * What is left of one free unit today. `openUntil` (ISO): an open job of this
 * person still holds one, until then; it may still be delivered, or it comes back.
 */
export interface FreeUnitLeft {
  readonly left: number;
  readonly limit: number;
  readonly openUntil?: string;
}

/** A running tariff of the account (/me `entitlements`). */
export interface StudioEntitlementView {
  readonly id: string;
  readonly orderId: string;
  readonly plan: StudioPlanId | 'credit';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly presentationsLeft: number;
  readonly presentationsLimit: number;
  readonly photosLeft: number;
  readonly photosLimit: number;
  /** Jobs of this tariff that may still be made once more (24 hours after the result). */
  readonly regenAvailable: readonly string[];
}

export type StudioOrderState = 'pending' | 'prepared' | 'paid' | 'cancelled' | 'refunded';

/** The account's newest order (/me `latestOrder`). */
export interface StudioOrderView {
  /** stu_…: the number the buyer keeps («To‘lov raqamini saqlang»). */
  readonly id: string;
  readonly state: StudioOrderState;
  readonly plan: StudioPlanId;
  readonly provider: StudioProvider;
  readonly amountUzs: number;
  readonly createdAt: string;
  readonly paidAt: string | null;
  /** The provider's document number once known (Payme receipt, Click payment), else null. */
  readonly paymentNumber: string | null;
  /** The buyer may still close it (no provider holds it). */
  readonly cancellable: boolean;
}

export interface StudioReceiptView {
  readonly orderId: string;
  readonly kind: 'PERFORM' | 'CANCEL';
  readonly url: string;
}

/** GET /me (functions/api/studio/me.ts): the free part and, with a studio account, the paid one. */
export interface StudioMe {
  readonly identity: boolean;
  readonly free: {
    readonly presentation: FreeUnitLeft;
    readonly photo: FreeUnitLeft;
    readonly resetsAt: string;
  };
  /** null: no studio account in this browser (or the paid service is off). */
  readonly account?: { readonly signedIn: boolean } | null;
  readonly entitlements?: readonly StudioEntitlementView[];
  readonly latestOrder?: StudioOrderView | null;
  readonly receipts?: readonly StudioReceiptView[];
}

/** POST /checkout (functions/api/studio/checkout.ts). */
export interface CheckoutBody {
  readonly plan: StudioPlanId;
  readonly requestId: string;
  readonly locale: StudioLocale;
  readonly acceptTerms: true;
  readonly termsVersion: string;
  readonly provider?: StudioProvider;
  /** The studio page to come back to (the server keeps only its own list). */
  readonly returnPath?: string;
  readonly turnstileToken?: string;
  readonly attribution?: { readonly last?: unknown; readonly first?: unknown };
  readonly ga?: { readonly clientId?: string; readonly sessionId?: string };
  readonly ym?: { readonly clientId?: string };
}

export type CheckoutAnswer =
  /** Go to the provider's page. */
  | { readonly mode: 'checkout'; readonly checkoutUrl: string; readonly orderId: string; readonly provider: StudioProvider }
  /** A local rehearsal: the order exists, the callbacks are simulated. */
  | { readonly mode: 'test'; readonly orderId: string; readonly amount: number; readonly provider: StudioProvider }
  /** Paid, closed, or a provider holds it: follow /me. */
  | { readonly mode: 'status'; readonly orderId: string };

/** What makes a deck; the server hashes exactly these fields into the job's input_mac. */
export interface DeckTask {
  readonly topic: string;
  readonly locale: StudioLocale;
  readonly audience: StudioAudience;
  readonly slides: number;
  readonly palette: number;
}

export interface CreateBody extends DeckTask {
  readonly requestId: string;
  readonly shape: DeckShapeName;
  readonly turnstileToken: string;
}

export interface CreatedJob {
  readonly jobId: string;
  readonly source: string;
  readonly shape: { readonly slides: number; readonly images: number; readonly notes: boolean; readonly palette: number; readonly parts: number };
  readonly next: 'slides' | 'outline';
  readonly expiresAt: string;
}

export interface DeckSlide {
  readonly index: number;
  readonly title: string;
  readonly bullets: readonly string[];
  readonly notes?: string;
  readonly layout: SlideLayout;
}

export interface Deck {
  readonly title: string;
  readonly subtitle: string;
  readonly slides: readonly DeckSlide[];
}

export interface SignedImagePrompt {
  readonly index: number;
  readonly prompt: string;
  readonly sig: string;
}

/** POST /:job/slides of a free deck. */
export interface FreeSlides {
  readonly part: number;
  readonly deck: Deck;
  readonly images: readonly SignedImagePrompt[];
  readonly done: boolean;
}

export type EventType =
  | 'studio_tool_started'
  | 'studio_result_ready'
  | 'studio_tariffs_viewed'
  | 'studio_checkout_started'
  | 'studio_checkout_result';

export interface EventBody {
  readonly id: string;
  readonly type: EventType;
  readonly detail: string;
  readonly viewId: string;
}

/** How long each call may take before the browser gives up (ms). */
export const TIMEOUTS = {
  read: 15_000,
  identity: 20_000,
  create: 30_000,
  /** One model step, up to two calls of ≈ 30 s on the server. */
  slides: 120_000,
  /** Flux (20 s) and the picture check, once. */
  image: 60_000,
  event: 10_000,
  /** A checkout may make the account first (Turnstile is checked on the server). */
  checkout: 30_000,
} as const;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The studio's error codes are snake_case words; anything else is not one. */
const CODE = /^[a-z][a-z0-9_]{1,40}$/;

function codeFromStatus(status: number): string {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'identity_required';
  if (status === 403) return 'turnstile_failed';
  if (status >= 500) return 'studio_busy';
  return 'invalid';
}

function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get('Retry-After'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function failureOf(response: Response): Promise<Failure> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not the studio's JSON (a proxy page, an empty body): the status says enough.
  }
  const fields = isRecord(body) ? body : {};
  const code = typeof fields.code === 'string' && CODE.test(fields.code) ? fields.code : codeFromStatus(response.status);
  return {
    ok: false,
    status: response.status,
    code,
    ...(typeof fields.retry === 'boolean' ? { retry: fields.retry } : {}),
    ...(typeof fields.resetsAt === 'string' ? { resetsAt: fields.resetsAt } : {}),
    ...(typeof fields.category === 'string' && CODE.test(fields.category) ? { category: fields.category } : {}),
    ...(retryAfter(response) ? { retryAfter: retryAfter(response) } : {}),
    ...(typeof fields.orderId === 'string' && ORDER_ID.test(fields.orderId) ? { orderId: fields.orderId } : {}),
  };
}

export interface CallOptions {
  /** The person cancelled, or the page is going away. */
  readonly signal?: AbortSignal;
}

export interface StudioApi {
  config(options?: CallOptions): Promise<Result<StudioPublicConfig>>;
  me(options?: CallOptions): Promise<Result<StudioMe>>;
  identity(turnstileToken: string, options?: CallOptions): Promise<Result<{ ok: true }>>;
  createPresentation(body: CreateBody, options?: CallOptions): Promise<Result<CreatedJob>>;
  freeSlides(jobId: string, task: DeckTask, options?: CallOptions): Promise<Result<FreeSlides>>;
  /** The picture's JPEG bytes, or the reason there is none. */
  image(jobId: string, image: SignedImagePrompt, options?: CallOptions): Promise<Result<Blob>>;
  /** Fire and forget: never waits for, nor reports, an answer. */
  event(body: EventBody): void;
  /** Order a tariff (functions/api/studio/checkout.ts). */
  checkout(body: CheckoutBody, options?: CallOptions): Promise<Result<CheckoutAnswer>>;
  /** Close the account's own open order no provider holds yet. */
  cancelOrder(orderId: string, options?: CallOptions): Promise<Result<{ readonly orderId: string }>>;
}

/** Job ids are the ledger's (functions/lib/studio/ledger.ts isJobId); nothing else is ever put in a path. */
export const JOB_ID = /^sj_[0-9a-f]{32}$/;

/** Order numbers are the store's (functions/lib/studio/store.ts STUDIO_ORDER_ID). */
export const ORDER_ID = /^stu_[0-9a-f]{32}$/;

/** The payment pages a checkout may send the buyer to: Payme (live and sandbox) and Click. */
export const PAYMENT_HOSTS: readonly string[] = ['checkout.paycom.uz', 'test.paycom.uz', 'my.click.uz'];

/** An https link on a payment host, else false: the browser never follows anything else. */
export function isPaymentPage(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 4096) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && PAYMENT_HOSTS.includes(parsed.hostname) && !parsed.username && !parsed.password && !parsed.port;
  } catch {
    return false;
  }
}

function checkoutAnswer(data: Record<string, unknown>): CheckoutAnswer | null {
  if (typeof data.orderId !== 'string' || !ORDER_ID.test(data.orderId)) return null;
  const provider = data.provider === 'payme' || data.provider === 'click' ? data.provider : null;
  if (data.mode === 'checkout') {
    return isPaymentPage(data.checkoutUrl) && provider ? { mode: 'checkout', checkoutUrl: data.checkoutUrl, orderId: data.orderId, provider } : null;
  }
  if (data.mode === 'test') return typeof data.amount === 'number' && provider ? { mode: 'test', orderId: data.orderId, amount: data.amount, provider } : null;
  if (data.mode === 'status') return { mode: 'status', orderId: data.orderId };
  return null;
}

/**
 * The studio's API over `fetchImpl` (the page's fetch by default; tests pass
 * their own). `timeouts` may be shortened by tests.
 */
export function createStudioApi(fetchImpl?: Fetch, timeouts: typeof TIMEOUTS = TIMEOUTS): StudioApi {
  const doFetch: Fetch = fetchImpl ?? ((input, init) => fetch(input, init));

  async function call(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; timeout: number; signal?: AbortSignal; keepalive?: boolean },
  ): Promise<Response | Failure> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, init.timeout);
    const onAbort = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else init.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await doFetch(STUDIO_API_BASE + path, {
        method: init.method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: init.body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        ...(init.keepalive ? { keepalive: true } : {}),
        signal: controller.signal,
      });
    } catch {
      const code: ClientCode = timedOut ? 'timeout' : init.signal?.aborted ? 'aborted' : 'network';
      return { ok: false, status: 0, code };
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function jsonCall<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; timeout: number; signal?: AbortSignal },
    accept: (data: Record<string, unknown>) => T | null,
  ): Promise<Result<T>> {
    const response = await call(path, init);
    if (!(response instanceof Response)) return response;
    if (!response.ok) return failureOf(response);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, status: response.status, code: 'invalid_output' };
    }
    const data = isRecord(body) && body.ok === true ? accept(body) : null;
    return data === null ? { ok: false, status: response.status, code: 'invalid_output' } : { ok: true, status: response.status, data };
  }

  return {
    config: (options) =>
      jsonCall('config', { method: 'GET', timeout: timeouts.read, signal: options?.signal }, (data) =>
        isRecord(data.tools) && isRecord(data.free) && isRecord(data.shapes) ? (data as unknown as StudioPublicConfig) : null,
      ),
    me: (options) =>
      jsonCall('me', { method: 'GET', timeout: timeouts.read, signal: options?.signal }, (data) =>
        typeof data.identity === 'boolean' && isRecord(data.free) ? (data as unknown as StudioMe) : null,
      ),
    identity: (turnstileToken, options) =>
      jsonCall('identity', { method: 'POST', body: { turnstileToken }, timeout: timeouts.identity, signal: options?.signal }, () => ({ ok: true as const })),
    createPresentation: (body, options) =>
      jsonCall('presentations', { method: 'POST', body, timeout: timeouts.create, signal: options?.signal }, (data) =>
        typeof data.jobId === 'string' && JOB_ID.test(data.jobId) && isRecord(data.shape) ? (data as unknown as CreatedJob) : null,
      ),
    freeSlides: (jobId, task, options) => {
      if (!JOB_ID.test(jobId)) return Promise.resolve({ ok: false, status: 0, code: 'invalid' });
      // Exactly the task's fields: the server hashes them against the job's input_mac.
      const body: DeckTask = { topic: task.topic, locale: task.locale, audience: task.audience, slides: task.slides, palette: task.palette };
      return jsonCall(`presentations/${jobId}/slides`, { method: 'POST', body, timeout: timeouts.slides, signal: options?.signal }, (data) =>
        isRecord(data.deck) && Array.isArray(data.deck.slides) && Array.isArray(data.images) ? (data as unknown as FreeSlides) : null,
      );
    },
    image: async (jobId, image, options) => {
      if (!JOB_ID.test(jobId)) return { ok: false, status: 0, code: 'invalid' };
      const response = await call(`presentations/${jobId}/images`, {
        method: 'POST',
        body: { index: image.index, prompt: image.prompt, sig: image.sig },
        timeout: timeouts.image,
        signal: options?.signal,
      });
      if (!(response instanceof Response)) return response;
      if (!response.ok) return failureOf(response);
      if (!(response.headers.get('Content-Type') ?? '').startsWith('image/jpeg')) return { ok: false, status: response.status, code: 'image_failed' };
      try {
        const bytes = await response.arrayBuffer();
        return { ok: true, status: response.status, data: new Blob([bytes], { type: 'image/jpeg' }) };
      } catch {
        return { ok: false, status: response.status, code: 'network' };
      }
    },
    event: (body) => {
      // keepalive: a step sent as the page closes still arrives.
      void call('event', { method: 'POST', body, timeout: timeouts.event, keepalive: true });
    },
    checkout: (body, options) =>
      jsonCall('checkout', { method: 'POST', body, timeout: timeouts.checkout, signal: options?.signal }, checkoutAnswer),
    cancelOrder: (orderId, options) => {
      if (!ORDER_ID.test(orderId)) return Promise.resolve({ ok: false, status: 0, code: 'invalid' });
      return jsonCall('order/cancel', { method: 'POST', body: { orderId }, timeout: timeouts.read, signal: options?.signal }, (data) =>
        data.orderId === orderId ? { orderId } : null,
      );
    },
  };
}
