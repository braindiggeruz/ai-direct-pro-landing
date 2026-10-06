// The dark rehearsal of a purchase on the production site (paid-chat plan
// WP-22, layer 2; decision L7). Click and Uzum (Merchant API) run in "test"
// with credentials the agent generated, so only a rehearsal session sees and
// pays them: every visitor still sees no provider. The script drives the
// site's production routes the way a browser, Click's server and Uzum Bank
// would, and checks the result through the admin API.
//
// Nothing here prints or records a credential, a cookie, a token, an order
// id, a payment code or a response body: step names, HTTP statuses and
// protocol codes only. The receipt holds the same.
//
//   1. node --import tsx scripts/paid-chat/dark-rehearsal.ts credentials --out <dir outside Git>
//        writes GPT_CLICK_CREDENTIALS_JSON.json ({"test":{service_id, merchant_id,
//        secret_key, merchant_user_id}}: fictitious ids, a random key) and
//        UZUM_CREDENTIALS_JSON.json ({"merchant":{"test":{serviceId, login,
//        password}}}: random). Refuses a folder inside the repository and never
//        overwrites a file: the secrets already put stay matched to their files.
//   2. The lead puts both secrets, sets GPT_BILLING_MODE_CLICK="test",
//      UZUM_API="merchant", GPT_BILLING_MODE_UZUM="test" and deploys
//      (docs/paid-chat/DARK-REHEARSAL-RU.md).
//   3. node --import tsx scripts/paid-chat/dark-rehearsal.ts run --site https://gptbot.uz
//        --credentials <dir> --admin-token-file <file> [--bearer-file <file>]
//        [--provider click|uzum|all] [--drill] [--receipt <path>]
//        The admin token (the owner's sign-in, 12 h) opens the rehearsal
//        session, reads the payments list and records the refund; without it,
//        --bearer-file (GPT_BILLING_MAINTENANCE_SECRET) does the first and the
//        last through the internal routes. The bearer secret also runs one
//        maintenance tick (provider modes; with --drill, a training alert).
//        Writes docs/paid-chat/releases/R7-dark-rehearsal.json by default.
//   4. The lead removes the three settings and deploys.
//   5. node --import tsx scripts/paid-chat/dark-rehearsal.ts verify-off --site https://gptbot.uz
//        (--admin-token-file <file> | --bearer-file <file>) [--receipt <path>]
//        Everything is a missing route again; added to the same receipt.
//   Offline: run --simulate local [--receipt <path>] — the site's own handlers
//   on 127.0.0.1 over a throwaway SQLite database with freshly generated
//   credentials and admin token; steps 3 and 5 over HTTP; nothing leaves the
//   machine (Telegram is answered in process). Exit code 1 when a step fails.
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BILLING_ORG,
  clickCredentials,
  PAID_MESSAGES,
  PRICE_TIYIN,
  type BillingEnv,
  type ClickCredentials,
} from "../../functions/lib/gpt-chat/billing-config";
import { clickSignature } from "../../functions/lib/gpt-chat/payment-protocol";
import { REHEARSAL_COOKIE } from "../../functions/lib/gpt-chat/rehearsal";
import { PACK_WINDOW_EVENTS } from "../../functions/lib/gpt-chat/ui-event-store";
import {
  merchantCredentials,
  type UzumEnv,
  type UzumMerchantCredentials,
} from "../../functions/lib/gpt-chat/uzum-config";
import { rehearseMerchant, type RehearsalStep, type WebhookSend } from "../uzum-sandbox-rehearsal";

export const PRODUCTION_SITE = "https://gptbot.uz";
export const CLICK_SECRET = "GPT_CLICK_CREDENTIALS_JSON";
export const UZUM_SECRET = "UZUM_CREDENTIALS_JSON";
/**
 * The public settings of step 2, in the packed JSON and the nested table of
 * wrangler.toml; step 4 sets each back to "".
 */
export const DARK_REHEARSAL_SETTINGS = {
  GPT_BILLING_MODE_CLICK: "test",
  UZUM_API: "merchant",
  GPT_BILLING_MODE_UZUM: "test",
} as const;
const ACCOUNT_COOKIE = "__Host-gpt_account";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RECEIPT = path.join(REPO_ROOT, "docs/paid-chat/releases/R7-dark-rehearsal.json");
const REQUEST_TIMEOUT_MS = 15_000;
/** Pages of 50 the admin's payments list is read for the counts by mode. */
const MAX_PAYMENT_PAGES = 20;

export type Provider = "click" | "uzum";
export type Transport = (request: Request) => Promise<Response>;
export interface Answer {
  status: number;
  body: Record<string, unknown>;
}

// ── test credentials ────────────────────────────────────────────────────────

/** A nine-digit id from 9xxxxxxxx: no real Click or Uzum account looks like that. */
function fictitiousId(): number {
  return 900_000_000 + (randomBytes(4).readUInt32BE(0) % 100_000_000);
}

/** The two secrets the site reads (decision L9), with a test block only. */
export interface GeneratedCredentials {
  [CLICK_SECRET]: { test: { service_id: number; merchant_id: number; secret_key: string; merchant_user_id: number } };
  [UZUM_SECRET]: { merchant: { test: UzumMerchantCredentials } };
}

/** Fresh test credentials: fictitious ids, random keys. */
export function generateTestCredentials(): GeneratedCredentials {
  return {
    [CLICK_SECRET]: {
      test: {
        service_id: fictitiousId(),
        merchant_id: fictitiousId(),
        secret_key: randomBytes(32).toString("hex"),
        merchant_user_id: fictitiousId(),
      },
    },
    [UZUM_SECRET]: {
      merchant: {
        test: {
          serviceId: fictitiousId(),
          login: `rh${randomBytes(6).toString("hex")}`,
          password: randomBytes(24).toString("hex"),
        },
      },
    },
  };
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative));
}

/**
 * Write fresh test credentials into `dir`, one file per secret, readable by
 * the owner only. Refuses a folder inside the repository and an existing
 * file (nothing is half-written). Returns the two paths.
 */
export function writeTestCredentials(dir: string): string[] {
  const target = path.resolve(dir);
  if (inside(REPO_ROOT, target))
    throw new Error("refusing to write credentials inside the repository: choose a folder outside Git");
  const files = Object.entries(generateTestCredentials()).map(
    ([name, value]) => [path.join(target, `${name}.json`), JSON.stringify(value)] as const,
  );
  const taken = files.filter(([file]) => existsSync(file));
  if (taken.length)
    throw new Error(`refusing to overwrite ${taken.map(([file]) => path.basename(file)).join(", ")}: the site may hold these already`);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const [file, content] of files) writeFileSync(file, content, { flag: "wx", mode: 0o600 });
  return files.map(([file]) => file);
}

export interface TestCredentials {
  click: ClickCredentials | null;
  uzum: UzumMerchantCredentials | null;
}

/**
 * The test credentials in `dir`, validated by the site's own parsers: what
 * the site will accept is exactly what the rehearsal signs with.
 */
export function readTestCredentials(dir: string): TestCredentials {
  const raw = (name: string) => {
    const file = path.join(dir, `${name}.json`);
    return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
  };
  const clickRaw = raw(CLICK_SECRET);
  const uzumRaw = raw(UZUM_SECRET);
  const click = clickRaw ? clickCredentials({ GPT_CLICK_CREDENTIALS_JSON: clickRaw } as BillingEnv, "test") : null;
  const uzum = uzumRaw ? merchantCredentials({ UZUM_CREDENTIALS_JSON: uzumRaw } as UzumEnv, "test") : null;
  if (clickRaw && !click) throw new Error(`${CLICK_SECRET}.json has no valid "test" block`);
  if (uzumRaw && !uzum) throw new Error(`${UZUM_SECRET}.json has no valid "merchant.test" block`);
  return { click, uzum };
}

/** A secret kept in a file outside Git: its first line, trimmed. */
function secretFrom(file: string, shape: RegExp, name: string): string {
  const value = readFileSync(file, "utf8").split(/\r?\n/)[0].trim();
  if (!shape.test(value)) throw new Error(`${name} does not hold a usable value`);
  return value;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

/**
 * Plain HTTP. A redirect is never followed: an answer that moved elsewhere
 * is a failed step, and a token never travels to another host.
 */
export function httpTransport(timeoutMs = REQUEST_TIMEOUT_MS): Transport {
  return (request) => fetch(request, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
}

async function objectBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * A browser on the site: it keeps the cookies the site sets (Max-Age=0
 * deletes) and sends its own Origin with every POST, as the chat page does.
 * Cookies never leave this object except in the Cookie header.
 */
export class Browser {
  private readonly jar = new Map<string, string>();
  constructor(
    readonly site: string,
    private readonly transport: Transport,
  ) {}

  has(name: string): boolean {
    return this.jar.has(name);
  }

  /** Another browser that holds only `names` of this one's cookies: a copied cookie. */
  copy(names: string[]): Browser {
    const other = new Browser(this.site, this.transport);
    for (const name of names) {
      const value = this.jar.get(name);
      if (value !== undefined) other.jar.set(name, value);
    }
    return other;
  }

  async send(
    pathname: string,
    init: { json?: unknown; form?: Record<string, string>; headers?: Record<string, string>; origin?: boolean } = {},
  ): Promise<Answer> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", [...this.jar].map(([name, value]) => `${name}=${value}`).join("; "));
    let body: string | URLSearchParams | undefined;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    } else if (init.form) body = new URLSearchParams(init.form);
    const method = body === undefined ? "GET" : "POST";
    if (method === "POST" && init.origin !== false) headers.set("Origin", this.site);
    const response = await this.transport(new Request(`${this.site}${pathname}`, { method, headers, body }));
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (!value || /;\s*max-age=0\s*(?:;|$)/i.test(line)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return { status: response.status, body: await objectBody(response) };
  }

  get(pathname: string, headers?: Record<string, string>): Promise<Answer> {
    return this.send(pathname, { headers });
  }

  post(pathname: string, json: unknown, headers?: Record<string, string>): Promise<Answer> {
    return this.send(pathname, { json, headers });
  }
}

// ── who opens the session and records the refund ──────────────────────────

export interface PaymentRow {
  id: string;
  provider: string;
  mode: string;
  state: string;
  rehearsal: boolean;
  pack: { limit: number; used: number; revokedAt: number | null } | null;
  receipt: { status: number; url: string | null } | null;
}
export type RowsByMode = Record<string, Record<string, Record<string, number>>>;

export interface Operator {
  readonly kind: "admin" | "bearer";
  /** Opens a rehearsal session in `browser` (cookies arrive in Set-Cookie). */
  openSession(browser: Browser, account: boolean): Promise<Answer>;
  /** The Seller's refund record (decision L12): never moves money. */
  recordRefund(orderId: string, reference: string): Promise<Answer>;
  /** One order as the admin's payments list shows it; undefined without the admin. */
  paymentRow(orderId: string, provider: Provider): Promise<PaymentRow | null | undefined>;
  /** Orders counted by mode, provider and state from the payments list; null without the admin. */
  rowsByMode(): Promise<RowsByMode | null>;
}

function rowsOf(answer: Answer): { rows: PaymentRow[]; next: string | null } | null {
  const section = answer.body.payments as { ok?: boolean; data?: { rows?: PaymentRow[]; next?: string | null } } | undefined;
  return answer.status === 200 && section?.ok && Array.isArray(section.data?.rows)
    ? { rows: section.data.rows, next: section.data.next ?? null }
    : null;
}

/** The owner's admin token: /api/admin/ai-chat/* (platform_owner). */
export function adminOperator(site: string, transport: Transport, token: string): Operator {
  const auth = { Authorization: `Bearer ${token}` };
  const api = new Browser(site, transport);
  return {
    kind: "admin",
    openSession: (browser, account) => browser.post("/api/admin/ai-chat/rehearsal-session", { account }, auth),
    recordRefund: (orderId, reference) =>
      api.post("/api/admin/ai-chat/refund-record", { orderId, merchantRefundReference: reference, confirmedRefund: true }, auth),
    async paymentRow(orderId, provider) {
      const page = rowsOf(await api.get(`/api/admin/ai-chat/payments?mode=test&provider=${provider}`, auth));
      return page ? (page.rows.find((row) => row.id === orderId) ?? null) : null;
    },
    async rowsByMode() {
      const counts: RowsByMode = {};
      for (const mode of ["test", "live"]) {
        counts[mode] = {};
        let cursor: string | null = null;
        for (let pageNo = 0; pageNo < MAX_PAYMENT_PAGES; pageNo++) {
          const query = new URLSearchParams({ mode, ...(cursor ? { cursor } : {}) });
          const page = rowsOf(await api.get(`/api/admin/ai-chat/payments?${query}`, auth));
          if (!page) return null;
          for (const row of page.rows) {
            const byState = (counts[mode][row.provider] ??= {});
            byState[row.state] = (byState[row.state] ?? 0) + 1;
          }
          if (!page.next) break;
          cursor = page.next;
        }
      }
      return counts;
    },
  };
}

/** GPT_BILLING_MAINTENANCE_SECRET: the internal routes, no payments list. */
export function bearerOperator(site: string, transport: Transport, secret: string): Operator {
  const auth = { Authorization: `Bearer ${secret}` };
  const api = new Browser(site, transport);
  return {
    kind: "bearer",
    openSession: (browser, account) => browser.post("/api/internal/gpt-rehearsal-session", { account }, auth),
    recordRefund: (orderId, reference) =>
      api.post(
        orderId.startsWith("uzm_") ? "/api/internal/gpt-uzum-refund" : "/api/internal/gpt-click-refund-record",
        { orderId, merchantRefundReference: reference, confirmedRefund: true },
        auth,
      ),
    paymentRow: async () => undefined,
    rowsByMode: async () => null,
  };
}

/** One maintenance tick (Bearer); `drill` records a training alert first. */
function maintenanceTick(site: string, transport: Transport, secret: string, drill: boolean): Promise<Answer> {
  return new Browser(site, transport).send("/api/internal/gpt-billing-maintenance", {
    json: drill ? { drill: true } : {},
    headers: { Authorization: `Bearer ${secret}` },
    origin: false,
  });
}

// ── steps ───────────────────────────────────────────────────────────────────

class Steps {
  readonly list: RehearsalStep[] = [];
  check(step: string, ok: boolean, got: string): boolean {
    this.list.push({ step, ok, got });
    return ok;
  }
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const field = (body: Record<string, unknown>, key: string) => body[key] as Record<string, unknown> | null | undefined;
const requestId = () => randomBytes(16).toString("hex");

/** Click's sign_time: Tashkent wall clock, "YYYY-MM-DD HH:mm:ss". */
function clickSignTime(now = Date.now()): string {
  return new Date(now + 5 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
}

function clickTransId(): string {
  return String(1_000_000_000 + (randomBytes(4).readUInt32BE(0) % 4_000_000_000));
}

/** Prepare (action 0) or Complete (action 1) as Click's server sends it: a signed form, no cookie, no Origin. */
async function clickCallback(
  site: string,
  transport: Transport,
  credentials: ClickCredentials,
  order: string,
  action: "0" | "1",
  over: { tx: string; prepareId?: string; amount?: string; secret?: string },
): Promise<Answer> {
  const p: Record<string, string> = {
    click_trans_id: over.tx,
    click_paydoc_id: clickTransId(),
    service_id: credentials.serviceId,
    merchant_trans_id: order,
    amount: over.amount ?? (PRICE_TIYIN / 100).toFixed(2),
    action,
    sign_time: clickSignTime(),
    error: "0",
    ...(action === "1" ? { merchant_prepare_id: over.prepareId ?? "" } : {}),
  };
  const form = { ...p, sign_string: clickSignature(p, over.secret ?? credentials.secretKey) };
  return new Browser(site, transport).send("/api/payments/click", { form, origin: false });
}

const clickError = (answer: Answer) => (typeof answer.body.error === "number" ? answer.body.error : null);

export interface RehearsalContext {
  site: string;
  transport: Transport;
  operator: Operator;
  credentials: TestCredentials;
}

/** What a visitor without the rehearsal cookie sees: no provider, no sign-in, no pack window. */
async function visitorSeesNothing(ctx: RehearsalContext, steps: Steps, provider: Provider): Promise<void> {
  const visitor = new Browser(ctx.site, ctx.transport);
  const view = await visitor.get("/api/gpt/account");
  steps.check(
    "visitor: account offers no provider and no sign-in",
    view.status === 200 && list(view.body.providers).length === 0 && list(view.body.loginMethods).length === 0 && view.body.mode === null,
    `${view.status} providers=${list(view.body.providers).length} login=${list(view.body.loginMethods).length}`,
  );
  const bought = await visitor.post("/api/gpt/subscribe", {
    provider,
    requestId: requestId(),
    locale: "ru",
    acceptTerms: true,
    termsVersion: view.body.termsVersion,
  });
  steps.check(`visitor: subscribe ${provider} -> 404`, bought.status === 404, `${bought.status}`);
  const event = await visitor.post("/api/gpt/event", { id: randomUUID(), type: "pack_viewed", detail: "header" });
  steps.check("visitor: a pack-window event -> 404 (not counted)", event.status === 404, `${event.status}`);
}

/** A rehearsal session with a fresh synthetic account, offered `provider` in test. */
async function openSession(ctx: RehearsalContext, steps: Steps, provider: Provider): Promise<Browser | null> {
  const browser = new Browser(ctx.site, ctx.transport);
  const opened = await ctx.operator.openSession(browser, true);
  const offered = list(opened.body.providers);
  if (
    !steps.check(
      `${ctx.operator.kind}: rehearsal session with a synthetic account, offered ${provider}`,
      opened.status === 200 && offered.includes(provider) && browser.has(REHEARSAL_COOKIE) && browser.has(ACCOUNT_COOKIE),
      `${opened.status} providers=${offered.join(",") || "-"}`,
    )
  )
    return null;
  const view = await browser.get("/api/gpt/account");
  const user = field(view.body, "user");
  return steps.check(
    "session: account in test, signed in, no pack yet",
    view.status === 200 && view.body.mode === "test" && list(view.body.providers).includes(provider) && user?.signedIn === true && view.body.access === null,
    `${view.status} mode=${String(view.body.mode)}`,
  )
    ? browser
    : null;
}

/**
 * Click in test, start to end: an order, Prepare and Complete signed with the
 * test secret (with a forged signature, a wrong amount, two Completes at once
 * and a replay), the pack, the Seller's refund record, the pack revoked.
 */
export async function rehearseClick(ctx: RehearsalContext): Promise<RehearsalStep[]> {
  const steps = new Steps();
  const credentials = ctx.credentials.click;
  if (!steps.check("click: test credentials loaded", !!credentials, credentials ? "ok" : "missing")) return steps.list;
  await visitorSeesNothing(ctx, steps, "click");
  const browser = await openSession(ctx, steps, "click");
  if (!browser || !credentials) return steps.list;
  const terms = (await browser.get("/api/gpt/account")).body.termsVersion;
  const sub = await browser.post("/api/gpt/subscribe", { provider: "click", requestId: requestId(), locale: "ru", acceptTerms: true, termsVersion: terms });
  const order = typeof sub.body.attemptId === "string" ? sub.body.attemptId : "";
  if (
    !steps.check(
      "session: subscribe click -> a test order of 20 000 UZS",
      sub.status === 200 && sub.body.mode === "test" && /^pay_[0-9a-f]{32}$/.test(order) && sub.body.amount === PRICE_TIYIN,
      `${sub.status} mode=${String(sub.body.mode)}`,
    )
  )
    return steps.list;
  const call = (action: "0" | "1", over: Parameters<typeof clickCallback>[5]) =>
    clickCallback(ctx.site, ctx.transport, credentials, order, action, over);
  const tx = clickTransId();
  const forged = await call("0", { tx, secret: randomBytes(32).toString("hex") });
  steps.check("click: Prepare with a forged signature -> -1", clickError(forged) === -1, `${forged.status} error=${clickError(forged)}`);
  const cheaper = await call("0", { tx, amount: ((PRICE_TIYIN - 100) / 100).toFixed(2) });
  steps.check("click: Prepare with another amount -> -2", clickError(cheaper) === -2, `${cheaper.status} error=${clickError(cheaper)}`);
  const prepared = await call("0", { tx });
  const prepareId = String(prepared.body.merchant_prepare_id ?? "");
  if (!steps.check("click: Prepare signed with the test secret -> 0", clickError(prepared) === 0 && /^\d+$/.test(prepareId), `${prepared.status} error=${clickError(prepared)}`))
    return steps.list;
  const completes = await Promise.all([call("1", { tx, prepareId }), call("1", { tx, prepareId })]);
  const codes = completes.map(clickError);
  steps.check(
    "click: two Completes at once -> each 0 or -4",
    codes.includes(0) && codes.every((code) => code === 0 || code === -4),
    codes.join(","),
  );
  const replay = await call("1", { tx, prepareId });
  steps.check("click: the Complete replayed -> -4", clickError(replay) === -4, `${replay.status} error=${clickError(replay)}`);
  const paid = await browser.get("/api/gpt/account");
  const access = field(paid.body, "access");
  steps.check(
    "session: the pack is on (300 answers, one pack)",
    field(paid.body, "payment")?.state === "paid" && access?.remaining === PAID_MESSAGES && access?.packs === 1,
    `${paid.status} payment=${String(field(paid.body, "payment")?.state)} remaining=${String(access?.remaining)}`,
  );
  const row = await ctx.operator.paymentRow(order, "click");
  if (row !== undefined)
    steps.check(
      "admin: the order is test, paid, a rehearsal, receipt skipped (-2)",
      !!row && row.mode === "test" && row.state === "paid" && row.rehearsal && row.receipt?.status === -2 && row.pack?.limit === PAID_MESSAGES,
      row ? `${row.mode} ${row.state} receipt=${row.receipt?.status ?? "-"}` : "not listed",
    );
  const reference = `dark-rehearsal-${new Date().toISOString().slice(0, 10)}`;
  const refunded = await ctx.operator.recordRefund(order, reference);
  steps.check(
    `${ctx.operator.kind}: the Seller's refund record`,
    refunded.status === 200 && refunded.body.ok === true && (ctx.operator.kind === "bearer" || refunded.body.recorded === true),
    `${refunded.status} recorded=${String(refunded.body.recorded)}`,
  );
  const again = await ctx.operator.recordRefund(order, reference);
  steps.check(
    `${ctx.operator.kind}: the refund record repeated changes nothing`,
    again.status === 200 && (ctx.operator.kind === "bearer" || again.body.recorded === false),
    `${again.status} recorded=${String(again.body.recorded)}`,
  );
  const after = await browser.get("/api/gpt/account");
  steps.check(
    "session: the pack is revoked, the order refunded",
    after.body.access === null && field(after.body, "payment")?.state === "refunded",
    `${after.status} payment=${String(field(after.body, "payment")?.state)}`,
  );
  const revoked = await ctx.operator.paymentRow(order, "click");
  if (revoked !== undefined)
    steps.check(
      "admin: refunded, the pack revoked",
      !!revoked && revoked.state === "refunded" && !!revoked.pack?.revokedAt,
      revoked ? `${revoked.state} revoked=${revoked.pack?.revokedAt ? "yes" : "no"}` : "not listed",
    );
  // The account cookie alone, in a browser without the rehearsal cookie.
  const copied = browser.copy([ACCOUNT_COOKIE]);
  const outside = await copied.get("/api/gpt/account");
  steps.check(
    "another browser with the account cookie only: no provider, no test order",
    outside.status === 200 && list(outside.body.providers).length === 0 && outside.body.payment === null && outside.body.access === null,
    `${outside.status} providers=${list(outside.body.providers).length} payment=${outside.body.payment === null ? "none" : "shown"}`,
  );
  return steps.list;
}

/** Uzum Bank's webhooks as Uzum sends them, through `transport`. */
export function webhookSender(site: string, transport: Transport): WebhookSend {
  return async (op, body, authorization) => {
    const response = await transport(
      new Request(`${site}/api/payments/uzum-merchant/${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await objectBody(response) };
  };
}

/**
 * Uzum Merchant API in test: the payment code a rehearsal session is shown,
 * then Uzum Bank's side of scripts/uzum-sandbox-rehearsal.ts (check, create,
 * a lost confirm, status, reverse, a replaced transaction, every refusal).
 */
export async function rehearseUzumMerchant(ctx: RehearsalContext): Promise<RehearsalStep[]> {
  const steps = new Steps();
  const credentials = ctx.credentials.uzum;
  if (!steps.check("uzum: test credentials loaded", !!credentials, credentials ? "ok" : "missing")) return steps.list;
  await visitorSeesNothing(ctx, steps, "uzum");
  const browser = await openSession(ctx, steps, "uzum");
  if (!browser || !credentials) return steps.list;
  const view = await browser.get("/api/gpt/account");
  const issued = await browser.post("/api/gpt/subscribe", {
    provider: "uzum",
    requestId: requestId(),
    locale: "uz",
    acceptTerms: true,
    termsVersion: view.body.termsVersion,
  });
  const code = typeof issued.body.paymentCode === "string" ? issued.body.paymentCode : "";
  if (
    !steps.check(
      "session: subscribe uzum -> the payment code for the Uzum Bank app",
      view.body.uzumFlow === "code" && issued.status === 200 && issued.body.mode === "code" && /^[1-9]\d{8}$/.test(code),
      `${issued.status} flow=${String(view.body.uzumFlow)} mode=${String(issued.body.mode)}`,
    )
  )
    return steps.list;
  const played = await rehearseMerchant({ send: webhookSender(ctx.site, ctx.transport), credentials, code });
  for (const step of played) steps.check(`uzum: ${step.step}`, step.ok, step.got);
  const after = await browser.get("/api/gpt/account");
  steps.check(
    "session: both paid transactions reversed, no pack left",
    after.status === 200 && after.body.access === null && field(after.body, "payment")?.state === "refunded",
    `${after.status} payment=${String(field(after.body, "payment")?.state)}`,
  );
  return steps.list;
}

/** After the test modes are removed and deployed: every way in is a missing route again. */
export async function verifyOff(ctx: Omit<RehearsalContext, "credentials">): Promise<RehearsalStep[]> {
  const steps = new Steps();
  const visitor = new Browser(ctx.site, ctx.transport);
  const view = await visitor.get("/api/gpt/account");
  steps.check(
    "account: providers [] and no sign-in",
    view.status === 200 && list(view.body.providers).length === 0 && list(view.body.loginMethods).length === 0 && view.body.mode === null,
    `${view.status} providers=${list(view.body.providers).length}`,
  );
  for (const provider of ["click", "uzum"] as const) {
    const bought = await visitor.post("/api/gpt/subscribe", { provider, requestId: requestId(), locale: "ru", acceptTerms: true, termsVersion: view.body.termsVersion });
    steps.check(`subscribe ${provider} -> 404`, bought.status === 404, `${bought.status}`);
  }
  const clickRoute = await visitor.send("/api/payments/click", { form: { action: "0" }, origin: false });
  steps.check("Click callback -> 404", clickRoute.status === 404, `${clickRoute.status}`);
  const uzumRoute = await visitor.send("/api/payments/uzum-merchant/check", { json: {}, origin: false });
  steps.check("Uzum Merchant API webhook -> 404", uzumRoute.status === 404, `${uzumRoute.status}`);
  const session = await ctx.operator.openSession(new Browser(ctx.site, ctx.transport), false);
  const expected = ctx.operator.kind === "admin" ? 409 : 404;
  steps.check(`${ctx.operator.kind}: no rehearsal session while nothing is in test -> ${expected}`, session.status === expected, `${session.status}`);
  return steps.list;
}

// ── the receipt ─────────────────────────────────────────────────────────────

export interface Phase {
  steps: RehearsalStep[];
  passed: number;
  failed: number;
}
export interface Receipt {
  release: "R7";
  kind: "dark-rehearsal";
  plan: string;
  site: string;
  production_commit: string | null;
  operator: "admin" | "bearer";
  started_at: string;
  finished_at: string;
  status: "pass" | "fail";
  phases: Record<string, Phase>;
  provider_modes: Record<string, string | null> | null;
  rows_by_mode: RowsByMode | null;
  owner_checks: string[];
  lead_aggregates: LeadAggregate[];
}
/** A read-only D1 aggregate for the lead (wr.py d1 execute --remote): no text, no ids. */
export interface LeadAggregate {
  sql: string;
  expect: string;
}

function phase(steps: RehearsalStep[]): Phase {
  const failed = steps.filter((step) => !step.ok).length;
  return { steps, passed: steps.length - failed, failed };
}

function statusOf(phases: Record<string, Phase>): "pass" | "fail" {
  const all = Object.values(phases);
  return all.length && all.every((p) => p.failed === 0 && p.steps.length > 0) ? "pass" : "fail";
}

/** The production commit the site says it runs (gptbot-release.json), or null. */
async function siteCommit(site: string, transport: Transport): Promise<string | null> {
  try {
    const answer = await new Browser(site, transport).get("/gptbot-release.json");
    return typeof answer.body.commit === "string" && /^[0-9a-f]{40}$/.test(answer.body.commit) ? answer.body.commit : null;
  } catch {
    return null;
  }
}

/** What the lead reads back from D1 after the run, from its start on. */
function leadAggregates(startedAt: number): LeadAggregate[] {
  const packSteps = [...PACK_WINDOW_EVENTS].map((type) => `'${type}'`).join(",");
  return [
    {
      sql: "SELECT mode, provider, state, COUNT(*) AS n FROM gpt_payment_orders_all GROUP BY 1,2,3",
      expect: "no live row; the test rows are this rehearsal's (rows_by_mode)",
    },
    {
      sql: `SELECT type, COUNT(*) AS n FROM gpt_ui_events WHERE created_at >= ${startedAt} AND type IN (${packSteps}) GROUP BY 1`,
      expect: "none, unless the owner walked the screens in a rehearsal session: visitors cannot send these steps",
    },
    {
      sql: `SELECT COUNT(*) AS n FROM gpt_billing_outbox o JOIN gpt_payment_orders_all p ON p.org_id=o.org_id AND p.id=o.order_id WHERE p.org_id='${BILLING_ORG}' AND p.mode='test' AND o.delivered_at IS NOT NULL`,
      expect: "0: a test order never reaches the owner's chat",
    },
  ];
}

export interface RunOptions extends RehearsalContext {
  providers: Provider[];
  /** GPT_BILLING_MAINTENANCE_SECRET: one tick for the provider modes; null skips it. */
  bearer: string | null;
  /** A training alert through the maintenance tick: needs `bearer`. */
  drill: boolean;
}

/** Layer 2, step 3: the rehearsal itself. */
export async function runRehearsal(options: RunOptions): Promise<Receipt> {
  // Refused before any request: a drill nobody sent must not reach the
  // receipt's owner checks as one to confirm.
  if (options.drill && !options.bearer)
    throw new Error("--drill needs --bearer-file (GPT_BILLING_MAINTENANCE_SECRET): the training alert goes through the maintenance tick");
  const startedAt = Date.now();
  const phases: Record<string, Phase> = {};
  if (options.providers.includes("click")) phases.click = phase(await rehearseClick(options));
  if (options.providers.includes("uzum")) phases.uzum_merchant = phase(await rehearseUzumMerchant(options));
  let modes: Record<string, string | null> | null = null;
  if (options.bearer) {
    const tick = await maintenanceTick(options.site, options.transport, options.bearer, options.drill);
    const payments = field(tick.body, "payments") as Record<string, { mode?: string | null }> | null | undefined;
    if (payments) modes = Object.fromEntries(Object.entries(payments).map(([name, value]) => [name, value?.mode ?? null]));
    if (options.drill) {
      const alerts = field(tick.body, "alerts");
      const sent = list(alerts?.codes).includes("drill");
      phases.drill = phase([
        {
          step: "maintenance tick with a drill alert",
          ok: tick.status === 200 && sent,
          got: `${tick.status} alerts=${String(alerts?.status)} ${sent ? "drill sent" : "drill not sent"}`,
        },
      ]);
    }
  }
  return {
    release: "R7",
    kind: "dark-rehearsal",
    plan: "10-PROD-PLAN.md section 4 WP-22, layer 2 (decision L7)",
    site: options.site,
    production_commit: await siteCommit(options.site, options.transport),
    operator: options.operator.kind,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    status: statusOf(phases),
    phases,
    provider_modes: modes,
    rows_by_mode: await options.operator.rowsByMode(),
    owner_checks: [
      "No owner Telegram message 'GPTBot.uz · AI paket: …' for this rehearsal: the outbox delivers live orders only.",
      ...(options.drill ? ["The training alert 'drill' reached the owner's alert chat."] : []),
    ],
    lead_aggregates: leadAggregates(startedAt),
  };
}

/** Adds the after-off phase to a receipt (read from `file` when it exists). */
export function withAfterOff(previous: Receipt | null, steps: RehearsalStep[], site: string, operator: Operator["kind"]): Receipt {
  const base: Receipt = previous ?? {
    release: "R7",
    kind: "dark-rehearsal",
    plan: "10-PROD-PLAN.md section 4 WP-22, layer 2 (decision L7)",
    site,
    production_commit: null,
    operator,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    status: "fail",
    phases: {},
    provider_modes: null,
    rows_by_mode: null,
    owner_checks: [],
    lead_aggregates: [],
  };
  const phases = { ...base.phases, after_off: phase(steps) };
  return { ...base, phases, finished_at: new Date().toISOString(), status: statusOf(phases) };
}

export function writeReceipt(file: string, receipt: Receipt): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
}

function printPhases(receipt: Receipt, log: (line: string) => void): void {
  for (const [name, p] of Object.entries(receipt.phases)) {
    log(`-- ${name}`);
    for (const s of p.steps) log(`${s.ok ? "PASS" : "FAIL"}  ${s.step}  [${s.got}]`);
  }
  const all = Object.values(receipt.phases);
  const failed = all.reduce((sum, p) => sum + p.failed, 0);
  const total = all.reduce((sum, p) => sum + p.steps.length, 0);
  log(`${total - failed}/${total} steps passed: ${receipt.status}`);
}

// ── offline: the site's handlers on 127.0.0.1 ───────────────────────────────

export interface LocalStub {
  site: string;
  credentialsDir: string;
  adminTokenFile: string;
  bearerFile: string;
  /** First lines of the owner messages Telegram would have got. */
  ownerMessages: string[];
  /** What the lead's step 4 does: the test modes removed. */
  switchOff(): void;
  close(): Promise<void>;
}

/**
 * The production setup after layer-2 step 2, offline: the site's own
 * handlers on 127.0.0.1 over a throwaway SQLite database, Click and Uzum
 * (Merchant API) in test with credentials written by writeTestCredentials,
 * an owner admin token and the maintenance secret in files of a temporary
 * folder. While it runs, fetch reaches the stub only; Telegram (the owner's
 * alert chat) is answered in process and recorded.
 */
export async function startLocalStub(): Promise<LocalStub> {
  const { billingFixture, liveSettings } = await import("../../tests/helpers/gpt-billing-fixture");
  const { committedBillingSettings, serveOnLoopback, siteDispatcher } = await import("../../tests/helpers/paid-chat-site");
  const { signToken } = await import("../../functions/lib/jwt");
  const dir = mkdtempSync(path.join(os.tmpdir(), "gptbot-dark-rehearsal-"));
  const credentialsDir = path.join(dir, "credentials");
  writeTestCredentials(credentialsDir);
  const secretFile = (name: string) => readFileSync(path.join(credentialsDir, `${name}.json`), "utf8");
  const f = await billingFixture();
  // The secrets production holds (random here), the billing settings
  // committed in wrangler.toml, then step 2's settings and secrets. This
  // rehearsal covers Click and Uzum: Payme's sandbox has its own runbook
  // (docs/paid-chat/PAYME-RU.md), so Payme is off here and step 5 still
  // means "nothing is in test".
  Object.assign(f.env, liveSettings(), committedBillingSettings(), DARK_REHEARSAL_SETTINGS, {
    GPT_BILLING_MODE_PAYME: "",
    GPT_CLICK_CREDENTIALS_JSON: secretFile(CLICK_SECRET),
    UZUM_CREDENTIALS_JSON: secretFile(UZUM_SECRET),
    // Production has no Telegram OIDC client and no legacy Click variables.
    GPT_TELEGRAM_CLIENT_ID: "",
    GPT_TELEGRAM_CLIENT_SECRET: "",
    GPT_CLICK_TEST_SERVICE_ID: "",
    GPT_CLICK_TEST_SECRET: "",
    JWT_SECRET: randomBytes(32).toString("hex"),
  } satisfies Partial<BillingEnv>);
  // The hourly OpenRouter catalogue check is not part of a purchase: marked
  // as just done, so the offline tick makes no call for it.
  f.db.exec(`INSERT INTO gpt_billing_ops(org_id,task,next_at) VALUES('${BILLING_ORG}','catalogue',${Date.now() + 3600_000})`);
  const adminTokenFile = path.join(dir, "admin-token.txt");
  const bearerFile = path.join(dir, "maintenance-secret.txt");
  writeFileSync(adminTokenFile, await signToken(f.env, { email: "owner@example.invalid", role: "platform_owner" }), { mode: 0o600 });
  writeFileSync(bearerFile, f.env.GPT_BILLING_MAINTENANCE_SECRET!, { mode: 0o600 });
  const background: Promise<unknown>[] = [];
  const served = await serveOnLoopback(siteDispatcher(f.env, background));
  const ownerMessages: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.telegram.org") {
      const text = String((JSON.parse(String(init?.body ?? "{}")) as { text?: unknown }).text ?? "");
      ownerMessages.push(text.split("\n")[0]);
      return Response.json({ ok: true, result: { message_id: ownerMessages.length } });
    }
    if (url.origin !== served.origin) throw new Error(`offline rehearsal: refused ${url.hostname}`);
    return original(input, init);
  }) as typeof fetch;
  return {
    site: served.origin,
    credentialsDir,
    adminTokenFile,
    bearerFile,
    ownerMessages,
    switchOff() {
      for (const name of Object.keys(DARK_REHEARSAL_SETTINGS)) Object.assign(f.env, { [name]: "" });
    },
    async close() {
      await served.close();
      await Promise.allSettled(background);
      globalThis.fetch = original;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ── command line ────────────────────────────────────────────────────────────

function option(args: string[], name: string): string | null {
  const at = args.indexOf(name);
  const value = at >= 0 ? args[at + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SECRET_SHAPE = /^\S{32,}$/;

/** The operator a command line names; the admin token wins when both are given. */
function operatorFrom(args: string[], site: string, transport: Transport): { operator: Operator; bearer: string | null } {
  const tokenFile = option(args, "--admin-token-file");
  const bearerFile = option(args, "--bearer-file");
  const bearer = bearerFile ? secretFrom(bearerFile, SECRET_SHAPE, "--bearer-file") : null;
  if (tokenFile) return { operator: adminOperator(site, transport, secretFrom(tokenFile, JWT_SHAPE, "--admin-token-file")), bearer };
  if (bearer) return { operator: bearerOperator(site, transport, bearer), bearer };
  throw new Error("pass --admin-token-file (the owner's admin sign-in) or --bearer-file (GPT_BILLING_MAINTENANCE_SECRET)");
}

function providersFrom(args: string[]): Provider[] {
  const value = option(args, "--provider") ?? "all";
  if (value === "all") return ["click", "uzum"];
  if (value === "click" || value === "uzum") return [value];
  throw new Error("--provider is click, uzum or all");
}

/** Only the production site: the script carries the owner's token and test secrets. */
function productionSite(args: string[]): string {
  const value = option(args, "--site");
  if (value === null) throw new Error(`--site ${PRODUCTION_SITE} is required`);
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    throw new Error("--site is not a URL");
  }
  if (origin !== PRODUCTION_SITE) throw new Error(`--site must be ${PRODUCTION_SITE}; use --simulate local offline`);
  return origin;
}

function readReceipt(file: string): Receipt | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Receipt;
  } catch {
    return null;
  }
}

async function runLocal(args: string[], log: (line: string) => void): Promise<boolean> {
  const stub = await startLocalStub();
  try {
    log(`local site: ${stub.site} (Click and Uzum Merchant API in test, generated credentials, offline)`);
    const transport = httpTransport();
    const bearer = secretFrom(stub.bearerFile, SECRET_SHAPE, "bearer");
    const operator = adminOperator(stub.site, transport, secretFrom(stub.adminTokenFile, JWT_SHAPE, "admin token"));
    const receipt = await runRehearsal({
      site: stub.site,
      transport,
      operator,
      credentials: readTestCredentials(stub.credentialsDir),
      providers: providersFrom(args),
      bearer,
      drill: true,
    });
    stub.switchOff();
    const final = withAfterOff(receipt, await verifyOff({ site: stub.site, transport, operator }), stub.site, operator.kind);
    const leaked = stub.ownerMessages.filter((line) => line.includes("AI paket"));
    final.phases.owner_messages = phase([
      { step: "no owner message about a test order", ok: leaked.length === 0, got: `${leaked.length}` },
    ]);
    final.status = statusOf(final.phases);
    printPhases(final, log);
    const file = option(args, "--receipt");
    if (file) writeReceipt(path.resolve(file), final);
    return final.status === "pass";
  } finally {
    await stub.close();
  }
}

/** The command line; returns the exit code. `log` gets every line printed. */
export async function main(args: string[], log: (line: string) => void = console.log): Promise<number> {
  const [command] = args;
  try {
    if (command === "credentials") {
      const out = option(args, "--out");
      if (!out) throw new Error("--out <folder outside Git> is required");
      for (const file of writeTestCredentials(out)) log(`written (values not shown): ${file}`);
      log("Put each as the Pages secret of its file name, through stdin: python F:/Claude/gptbot-tools/wr.py --stdin <file> -- pages secret put <NAME> --project-name ai-direct-pro-landing");
      log(`Then in wrangler.toml (packed JSON and nested table): ${Object.entries(DARK_REHEARSAL_SETTINGS).map(([name, value]) => `${name}="${value}"`).join(", ")}; deploy.`);
      return 0;
    }
    if (command === "run" && option(args, "--simulate") === "local") return (await runLocal(args, log)) ? 0 : 1;
    if (command === "run") {
      const site = productionSite(args);
      const credentialsDir = option(args, "--credentials");
      if (!credentialsDir) throw new Error("--credentials <folder with the two secret files> is required");
      const transport = httpTransport();
      const { operator, bearer } = operatorFrom(args, site, transport);
      const receipt = await runRehearsal({
        site,
        transport,
        operator,
        credentials: readTestCredentials(credentialsDir),
        providers: providersFrom(args),
        bearer,
        drill: args.includes("--drill"),
      });
      printPhases(receipt, log);
      const file = path.resolve(option(args, "--receipt") ?? DEFAULT_RECEIPT);
      writeReceipt(file, receipt);
      log(`receipt: ${file}`);
      return receipt.status === "pass" ? 0 : 1;
    }
    if (command === "verify-off") {
      const site = productionSite(args);
      const transport = httpTransport();
      const { operator } = operatorFrom(args, site, transport);
      const file = path.resolve(option(args, "--receipt") ?? DEFAULT_RECEIPT);
      const receipt = withAfterOff(readReceipt(file), await verifyOff({ site, transport, operator }), site, operator.kind);
      printPhases(receipt, log);
      writeReceipt(file, receipt);
      log(`receipt: ${file}`);
      return receipt.status === "pass" ? 0 : 1;
    }
    throw new Error("usage: credentials --out <dir> | run --site https://gptbot.uz --credentials <dir> ... | run --simulate local | verify-off --site https://gptbot.uz ...");
  } catch (error) {
    // A message of this script only: never a response body or a value.
    log(`error: ${error instanceof Error ? error.message : "dark rehearsal failed"}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  void main(process.argv.slice(2)).then((code) => process.exit(code));
