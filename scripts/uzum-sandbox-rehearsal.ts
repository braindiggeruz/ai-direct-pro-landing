// Uzum rehearsals (paid-chat plan WP-15). Nothing here prints a credential,
// a header or a response body: step names, HTTP statuses and Uzum codes only.
//
// 1. Checkout against Uzum's TEST terminal, with the same client code the site
//    uses (functions/lib/gpt-chat/uzum-checkout.ts). Nothing touches D1: this
//    proves the protocol, not the ledger (tests/gpt-uzum-payments.test.ts).
//      node --import tsx scripts/uzum-sandbox-rehearsal.ts --dry-run   # config check + request body, no network
//      node --import tsx scripts/uzum-sandbox-rehearsal.ts             # register, print the payment page, poll the status
//      node --import tsx scripts/uzum-sandbox-rehearsal.ts --refund    # ... then refund the full amount once COMPLETED
//    Environment, for this one command: UZUM_CREDENTIALS_JSON with
//    checkout.test.{terminalId, apiKey}; UZUM_CHECKOUT_TEST_BASE_URL (optional,
//    the default host is UNVERIFIED); UZUM_AUTOFISCAL and GPT_FISCAL_* (optional).
//    Test cards: docs/paid-chat/uzum-spec/en_checkout.yaml, "Testing".
//
// 2. Merchant API, simulated: this script plays Uzum Bank against our webhooks
//    (<site>/api/payments/uzum-merchant/<op>) with the TEST Basic credentials:
//    a wrong password, a mistyped code, check with the code as a number and a
//    lower-case "basic" scheme, a wrong amount, create, a repeated transId,
//    status, a /confirm whose answer is lost, status after it (the payment is
//    finished, not failed: U8), a repeated confirm, reverse twice, a newer app
//    transaction that replaces an unconfirmed one, an unknown transId.
//      node --import tsx scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate https://gptbot.uz
//      node --import tsx scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate local
//      ... --code 123456789   # a payment code the site already showed
//      ... --dry-run          # list the steps, no request
//    Against a site: Uzum in test mode with UZUM_API=merchant there, and
//    UZUM_CREDENTIALS_JSON (merchant.test) here. Without --code,
//    GPT_BILLING_MAINTENANCE_SECRET here opens a rehearsal session with a
//    synthetic account (POST /api/internal/gpt-rehearsal-session) and the
//    site's /api/gpt/subscribe issues its code, as for a visitor.
//    "local" starts the site's own handlers on 127.0.0.1 over a throwaway
//    SQLite database with generated test credentials, runs the same steps
//    over HTTP and stops: the locally runnable acceptance check.
//    Exit code 1 when any step fails.
// Sources: https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml (1.10.3),
// en_merchant.yaml (1.0.0).
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  merchantCredentials,
  uzumCheckoutConfig,
  type UzumEnv,
  type UzumMerchantCredentials,
} from "../functions/lib/gpt-chat/uzum-config";
import {
  getOrderStatus,
  refund,
  registerBody,
  registerPayment,
  type UzumFailure,
} from "../functions/lib/gpt-chat/uzum-checkout";

export interface WebhookAnswer {
  status: number;
  body: Record<string, unknown>;
}
/** One Merchant API webhook as Uzum sends it: POST JSON with an Authorization header. */
export type WebhookSend = (
  op: string,
  body: Record<string, unknown>,
  authorization: string,
) => Promise<WebhookAnswer>;
export interface RehearsalStep {
  step: string;
  ok: boolean;
  /** What came back: HTTP status, Uzum status, error code. */
  got: string;
}

const PRICE = 2_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function basicHeader(login: string, password: string, scheme = "Basic"): string {
  return `${scheme} ${btoa(`${login}:${password}`)}`;
}

/** The same nine digits with a wrong check digit. */
function mistyped(code: string): string {
  return `${code.slice(0, -1)}${(Number(code.slice(-1)) + 1) % 10}`;
}

/**
 * Plays Uzum Bank's side of the Merchant API against `send`. `loseConfirm`
 * sends one /confirm whose answer Uzum never gets; by default its answer is
 * simply dropped, and an in-process test breaks the database once instead,
 * so the route really fails half-way.
 */
export async function rehearseMerchant(options: {
  send: WebhookSend;
  credentials: Pick<UzumMerchantCredentials, "serviceId" | "login" | "password">;
  code: string;
  loseConfirm?: (confirm: () => Promise<WebhookAnswer>) => Promise<unknown>;
  transId?: () => string;
}): Promise<RehearsalStep[]> {
  const { send, credentials: c, code } = options;
  const newTransId = options.transId ?? (() => randomUUID());
  const auth = basicHeader(c.login, c.password);
  const steps: RehearsalStep[] = [];
  const call = (op: string, body: Record<string, unknown>, authorization = auth) =>
    send(op, { serviceId: c.serviceId, timestamp: Date.now(), ...body }, authorization);
  /** `want`: an Uzum status for a 200 answer, or "E<code>" for a 400 FAILED. */
  const expect = async (
    step: string,
    op: string,
    body: Record<string, unknown>,
    want: string,
    authorization = auth,
    extra: (answer: WebhookAnswer) => boolean = () => true,
  ) => {
    const answer = await call(op, body, authorization);
    const errorCode = typeof answer.body.errorCode === "string" ? answer.body.errorCode : null;
    const ok =
      (want.startsWith("E")
        ? answer.status === 400 && answer.body.status === "FAILED" && errorCode === want.slice(1)
        : answer.status === 200 && answer.body.status === want) && extra(answer);
    steps.push({
      step,
      ok,
      got: `${answer.status} ${String(answer.body.status ?? "-")}${errorCode ? ` ${errorCode}` : ""}`,
    });
    return answer;
  };
  const account = { params: { account: code } };
  const a = newTransId();
  const b = newTransId();
  const d = newTransId();

  await expect("wrong Basic password -> 10001", "check", account, "E10001", basicHeader(c.login, `${c.password}x`));
  await expect("another service id -> 10006", "check", { ...account, serviceId: c.serviceId + 1 }, "E10006");
  await expect("mistyped code (check digit) -> 10007", "check", { params: { account: mistyped(code) } }, "E10007");
  await expect(
    "check: code as a number, scheme 'basic' -> OK",
    "check",
    { params: { account: Number(code) } },
    "OK",
    basicHeader(c.login, c.password, "basic"),
    (answer) =>
      (answer.body.data as { account?: { value?: unknown } } | undefined)?.account?.value === code,
  );
  await expect("create with a wrong amount -> 10011", "create", { ...account, transId: a, amount: PRICE - 100 }, "E10011");
  await expect("create -> CREATED", "create", { ...account, transId: a, amount: PRICE }, "CREATED", auth, (answer) => answer.body.amount === PRICE);
  await expect("the same transId again -> 10010", "create", { ...account, transId: a, amount: PRICE }, "E10010");
  await expect("status -> CREATED", "status", { transId: a }, "CREATED");
  await (options.loseConfirm ?? ((confirm) => confirm().catch(() => undefined)))(() =>
    call("confirm", { transId: a, paymentSource: "UZCARD", phone: "998900000000" }),
  );
  steps.push({ step: "confirm sent, its answer lost", ok: true, got: "-" });
  await expect("status after the lost confirm -> CONFIRMED (U8)", "status", { transId: a }, "CONFIRMED");
  await expect("confirm again -> 10016", "confirm", { transId: a, paymentSource: "UZCARD", phone: "998900000000" }, "E10016");
  await expect("check after a payment -> OK (a new pack may follow)", "check", account, "OK");
  await expect("reverse -> REVERSED", "reverse", { transId: a }, "REVERSED");
  await expect("reverse again -> 10018", "reverse", { transId: a }, "E10018");
  await expect("status after reverse -> REVERSED", "status", { transId: a }, "REVERSED");
  await expect("create B -> CREATED", "create", { ...account, transId: b, amount: PRICE }, "CREATED");
  await expect("create D replaces the unconfirmed B -> CREATED", "create", { ...account, transId: d, amount: PRICE }, "CREATED");
  await expect("confirm B -> 10015", "confirm", { transId: b, paymentSource: "HUMO", phone: "998900000000" }, "E10015");
  await expect("status B -> FAILED 10015", "status", { transId: b }, "E10015");
  await expect("confirm D -> CONFIRMED", "confirm", { transId: d, paymentSource: "HUMO", phone: "998900000000" }, "CONFIRMED");
  await expect("reverse D -> REVERSED", "reverse", { transId: d }, "REVERSED");
  await expect("status of an unknown transId -> 10014", "status", { transId: newTransId() }, "E10014");
  return steps;
}

/** Webhooks over HTTP, as Uzum Bank sends them. */
export function httpSender(site: string): WebhookSend {
  return async (op, body, authorization) => {
    const response = await fetch(`${site}/api/payments/uzum-merchant/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return {
      status: response.status,
      body: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {},
    };
  };
}

/**
 * The payment code of a fresh synthetic rehearsal account, the way a visitor
 * gets one: a rehearsal session, the account view (offer version, flow), then
 * /api/gpt/subscribe. Cookies stay in memory and are never printed.
 */
export async function rehearsalCode(site: string, maintenanceSecret: string): Promise<string> {
  const origin = new URL(site).origin;
  const opened = await fetch(`${origin}/api/internal/gpt-rehearsal-session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${maintenanceSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ account: true }),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (opened.status !== 200) throw new Error(`rehearsal session: HTTP ${opened.status}`);
  const cookie = opened.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  const view = (await (
    await fetch(`${origin}/api/gpt/account`, {
      headers: { cookie },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  ).json()) as { providers?: string[]; uzumFlow?: string | null; termsVersion?: string | null };
  if (!view.providers?.includes("uzum") || view.uzumFlow !== "code")
    throw new Error(`the rehearsal session is not offered the Uzum app flow (uzumFlow: ${view.uzumFlow ?? "none"})`);
  const issued = await fetch(`${origin}/api/gpt/subscribe`, {
    method: "POST",
    headers: { cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "uzum",
      requestId: randomBytes(16).toString("hex"),
      locale: "uz",
      acceptTerms: true,
      termsVersion: view.termsVersion,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const answer = (await issued.json()) as { mode?: string; paymentCode?: unknown };
  if (issued.status !== 200 || answer.mode !== "code" || typeof answer.paymentCode !== "string")
    throw new Error(`subscribe: HTTP ${issued.status}, mode ${answer.mode ?? "none"}`);
  return answer.paymentCode;
}

/**
 * The site's own handlers on 127.0.0.1 over a throwaway SQLite database:
 * Uzum in test mode with the Merchant API and generated credentials.
 */
export async function startLocalSite(): Promise<{
  site: string;
  credentials: UzumMerchantCredentials;
  maintenanceSecret: string;
  close: () => Promise<void>;
}> {
  const { createServer } = await import("node:http");
  const { billingFixture } = await import("../tests/helpers/gpt-billing-fixture");
  const merchant = await import("../functions/api/payments/uzum-merchant/[op]");
  const session = await import("../functions/api/internal/gpt-rehearsal-session");
  const account = await import("../functions/api/gpt/account");
  const subscribe = await import("../functions/api/gpt/subscribe");
  const f = await billingFixture();
  const credentials: UzumMerchantCredentials = {
    serviceId: randomBytes(3).readUIntBE(0, 3) + 1,
    login: `rh${randomBytes(6).toString("hex")}`,
    password: randomBytes(20).toString("hex"),
  };
  const maintenanceSecret = randomBytes(32).toString("hex");
  Object.assign(f.env, {
    GPT_PAYMENT_PROVIDERS: "click,uzum",
    GPT_BILLING_MODE_UZUM: "test",
    UZUM_API: "merchant",
    UZUM_CREDENTIALS_JSON: JSON.stringify({ merchant: { test: credentials } }),
    GPT_BILLING_MAINTENANCE_SECRET: maintenanceSecret,
  });
  const background: Promise<unknown>[] = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(key, value);
      const request = new Request(url, {
        method: req.method,
        headers,
        ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
      });
      const op = /^\/api\/payments\/uzum-merchant\/([a-z]+)$/.exec(url.pathname)?.[1];
      const ctx = {
        request,
        env: f.env,
        params: op ? { op } : {},
        waitUntil: (task: Promise<unknown>) => background.push(task),
      } as never;
      const response = op
        ? await merchant.onRequestPost(ctx)
        : url.pathname === "/api/internal/gpt-rehearsal-session"
          ? await session.onRequestPost(ctx)
          : url.pathname === "/api/gpt/account"
            ? await account.onRequestGet(ctx)
            : url.pathname === "/api/gpt/subscribe"
              ? await subscribe.onRequestPost(ctx)
              : Response.json({ ok: false, code: "local_fixture_only" }, { status: 404 });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no local port");
  return {
    site: `http://127.0.0.1:${address.port}`,
    credentials,
    maintenanceSecret,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.allSettled(background);
    },
  };
}

function report(steps: RehearsalStep[]): boolean {
  for (const s of steps) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.step}  [${s.got}]`);
  const failed = steps.filter((s) => !s.ok).length;
  console.log(`${steps.length - failed}/${steps.length} steps passed`);
  return failed === 0;
}

async function runMerchant(args: string[]): Promise<boolean> {
  const target = args[args.indexOf("--simulate") + 1];
  const codeIndex = args.indexOf("--code");
  if (!target || target.startsWith("--")) throw new Error("--simulate needs a site URL or 'local'");
  if (args.includes("--dry-run")) {
    const steps = await rehearseMerchant({
      send: async () => ({ status: 0, body: {} }),
      credentials: { serviceId: 1, login: "dry", password: "dry-run-only" },
      code: "100000009",
    });
    for (const s of steps) console.log(`step  ${s.step}`);
    return true;
  }
  if (target === "local") {
    const local = await startLocalSite();
    try {
      console.log(`local site: ${local.site} (Uzum test mode, Merchant API, generated credentials)`);
      const code = await rehearsalCode(local.site, local.maintenanceSecret);
      return report(await rehearseMerchant({ send: httpSender(local.site), credentials: local.credentials, code }));
    } finally {
      await local.close();
    }
  }
  const site = new URL(target).origin;
  const credentials = merchantCredentials(
    { UZUM_CREDENTIALS_JSON: process.env.UZUM_CREDENTIALS_JSON } as UzumEnv,
    "test",
  );
  if (!credentials) throw new Error("UZUM_CREDENTIALS_JSON has no valid merchant.test block");
  const secret = process.env.GPT_BILLING_MAINTENANCE_SECRET;
  const code =
    codeIndex >= 0
      ? args[codeIndex + 1]
      : secret
        ? await rehearsalCode(site, secret)
        : null;
  if (!code) throw new Error("pass --code, or set GPT_BILLING_MAINTENANCE_SECRET to open a rehearsal session");
  console.log(`site: ${site}`);
  return report(await rehearseMerchant({ send: httpSender(site), credentials, code }));
}

function explain(step: string, failure: UzumFailure): never {
  // Codes only: never headers, keys or response bodies.
  console.error(`${step} failed: ${failure.error}${failure.code !== undefined ? ` (code ${failure.code})` : ""}`);
  process.exit(1);
}

async function runCheckout(args: string[]): Promise<boolean> {
  const dryRun = args.includes("--dry-run");
  const withRefund = args.includes("--refund");
  const pollMs = 5000;
  const pollLimit = 72; // 6 minutes
  const env = { ...process.env, GPT_BILLING_MODE: "test", UZUM_API: "checkout" } as unknown as UzumEnv;
  const cfg = uzumCheckoutConfig(env, "test");
  if (!cfg) {
    console.error(
      "Uzum test config incomplete: set UZUM_CREDENTIALS_JSON with checkout.test.{terminalId (uuid), apiKey}, " +
        "an allowlisted https UZUM_CHECKOUT_TEST_BASE_URL (or the default), and complete fiscal values if UZUM_AUTOFISCAL=true.",
    );
    return dryRun;
  }
  const order = {
    id: `uzm_${randomBytes(16).toString("hex")}`,
    amount: PRICE,
    user_id: `acct_rehearsal_${randomBytes(4).toString("hex")}`,
  };
  const returnUrl = "https://gptbot.uz/ru/gpt-chat/";
  console.log(`base: ${cfg.baseUrl}`);
  console.log(`auto-fiscalization: ${cfg.fiscal ? "on" : "off"}`);
  console.log("register body:", JSON.stringify(registerBody(cfg, order, returnUrl), null, 2));
  if (dryRun) return true;

  const registered = await registerPayment(cfg, order, "ru", returnUrl);
  if (!registered.ok) explain("register", registered);
  console.log(`Uzum orderId: ${registered.orderId}`);
  console.log(`Open and pay with a test card: ${registered.redirectUrl}`);

  let status = "REGISTERED";
  for (let i = 0; i < pollLimit; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const pulled = await getOrderStatus(cfg, registered.orderId);
    if (!pulled.ok) explain("getOrderStatus", pulled);
    if (pulled.status.status !== status) {
      status = pulled.status.status;
      console.log(
        `status: ${status} amount=${pulled.status.amount} completed=${pulled.status.completedAmount} ` +
          `refunded=${pulled.status.refundedAmount} merchantOrderId=${pulled.status.merchantOrderId === order.id ? "matches" : "MISMATCH"}`,
      );
    }
    if (["COMPLETED", "DECLINED", "REVERSED", "REFUNDED"].includes(status)) break;
  }
  if (!withRefund || status !== "COMPLETED") return true;
  const operationId = randomUUID();
  console.log(`refund X-Operation-Id: ${operationId} (a retry must reuse it)`);
  // The cart goes with the refund exactly when it went with the payment.
  const refunded = await refund(cfg, registered.orderId, order.amount, operationId, cfg.fiscal);
  if (!refunded.ok) explain("refund", refunded);
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const pulled = await getOrderStatus(cfg, registered.orderId);
    if (!pulled.ok) explain("getOrderStatus", pulled);
    if (pulled.status.status === "REFUNDED") {
      console.log(`status: REFUNDED refunded=${pulled.status.refundedAmount}`);
      return true;
    }
  }
  console.log("refund accepted; REFUNDED not reported yet — check again later");
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const api = args.includes("--api") ? args[args.indexOf("--api") + 1] : "checkout";
  try {
    const ok = api === "merchant" ? await runMerchant(args) : await runCheckout(args);
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "rehearsal failed");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  void main();
