// A fake Click Merchant API (https://api.click.uz/v2/merchant/payment) behind
// globalThis.fetch, for the fiscal receipt and reversal tests. It checks the
// Auth header of every call the way Click documents it, keeps the payments
// it "knows", the receipts it accepted and the reversals it made, and can be
// told to fail. Runtime-only random credentials, never real ones.
import { createHash } from "node:crypto";
import { clickPaymentDate } from "../../functions/lib/gpt-chat/click-merchant";

export interface ClickAccess {
  serviceId: string;
  merchantUserId: string;
  secretKey: string;
}
export interface FakeClickCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}
/** A queued failure: an HTTP 500, a dropped connection, or a Click error_code. */
export type FakeFailure = "http" | "network" | number;
type Operation = "mti" | "submit" | "ofd" | "reversal";

const PREFIX = "/v2/merchant/payment";

export function fakeClickMerchant(accounts: ClickAccess[]) {
  const payments = new Map<string, { paymentId: number; day: string; serviceId: string }>();
  const receipts = new Map<number, { items: unknown[]; pendingReads: number }>();
  const reversed = new Set<number>();
  const calls: FakeClickCall[] = [];
  const telegram: string[] = [];
  let nextPaymentId = 1_946_296_773;
  const fake = {
    calls,
    receipts,
    reversed,
    telegram,
    failures: { mti: [], submit: [], ofd: [], reversal: [] } as Record<Operation, FakeFailure[]>,
    /** The next submit is accepted, but its answer never arrives. */
    loseSubmitAnswers: 0,
    /** ofd_data answers without a link this many times after a submit. */
    qrDelay: 0,
    /** Every Click call takes this long; the caller's timeout aborts it, as with a real fetch. */
    latencyMs: 0,
    qrUrl: (paymentId: number) =>
      `https://ofd.soliq.uz/epi?t=EZ000000000030&r=${paymentId}&c=20261001120000&s=854971301623`,
    /** Click learns of a payment of our order at `at` (it answers status_by_mti for that day). */
    pay(merchantTransId: string, at: number, serviceId = accounts[0].serviceId): number {
      const paymentId = nextPaymentId++;
      payments.set(merchantTransId, { paymentId, day: clickPaymentDate(at), serviceId });
      return paymentId;
    },
    count(method: string, pathPart: string): number {
      return calls.filter((c) => c.method === method && c.path.includes(pathPart)).length;
    },
  };

  const reply = (body: unknown, status = 200) => Response.json(body, { status });
  const roundTrip = (signal: AbortSignal | null | undefined) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer = setTimeout(resolve, fake.latencyMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });
  const authorized = (header: string | null, serviceId: string): boolean => {
    const account = accounts.find((a) => a.serviceId === serviceId);
    const match = /^(\d+):([0-9a-f]{40}):(\d{10})$/.exec(header ?? "");
    if (!account || !match || match[1] !== account.merchantUserId) return false;
    const digest = createHash("sha1").update(match[3] + account.secretKey).digest("hex");
    return digest === match[2];
  };

  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.telegram.org") {
      telegram.push(String(JSON.parse(String(init?.body ?? "{}")).text ?? ""));
      return reply({ ok: true, result: { message_id: telegram.length } });
    }
    if (url.hostname === "openrouter.ai")
      return reply({ data: { endpoints: [{ pricing: { prompt: "0", completion: "0" } }] } });
    if (url.origin !== "https://api.click.uz" || !url.pathname.startsWith(PREFIX))
      throw new Error(`unexpected outbound request ${url.origin}${url.pathname}`);
    const method = init?.method ?? "GET";
    const path = url.pathname.slice(PREFIX.length);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, path, body });
    if (fake.latencyMs > 0) await roundTrip(init?.signal);
    const headers = new Headers(init?.headers);
    const parts = path.split("/").filter(Boolean);
    const serviceId = parts[0] === "ofd_data" && parts[1] === "submit_items" ? String(body?.service_id) : parts[1];
    if (headers.get("accept") !== "application/json" || !authorized(headers.get("auth"), serviceId))
      return reply({ error_code: -401, error_note: "Not Authorized" }, 401);
    const operation: Operation =
      parts[0] === "status_by_mti" ? "mti" : parts[0] === "reversal" ? "reversal" : method === "POST" ? "submit" : "ofd";
    const failure = fake.failures[operation].shift();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "http") return reply({ error: "internal" }, 500);
    if (typeof failure === "number") return reply({ error_code: failure, error_note: "fixture error" });

    if (operation === "mti" && method === "GET") {
      const [, , mti, day] = parts;
      const payment = payments.get(decodeURIComponent(mti));
      if (!payment || payment.day !== day || payment.serviceId !== serviceId)
        return reply({ error_code: -16, error_note: "Payment not found" });
      return reply({ error_code: 0, error_note: "Success", payment_id: payment.paymentId, merchant_trans_id: decodeURIComponent(mti) });
    }
    if (operation === "submit" && path === "/ofd_data/submit_items") {
      const paymentId = Number(body?.payment_id);
      if (![...payments.values()].some((p) => p.paymentId === paymentId))
        return reply({ error_code: -16, error_note: "Payment not found" });
      if (receipts.has(paymentId)) return reply({ error_code: -31, error_note: "Already fiscalized" });
      receipts.set(paymentId, { items: body?.items as unknown[], pendingReads: fake.qrDelay });
      if (fake.loseSubmitAnswers > 0) {
        fake.loseSubmitAnswers--;
        throw new TypeError("fetch failed");
      }
      return reply({ error_code: 0, error_note: "Success" });
    }
    if (operation === "ofd" && method === "GET" && parts[0] === "ofd_data") {
      const paymentId = Number(parts[2]);
      const receipt = receipts.get(paymentId);
      if (!receipt) return reply({ error_code: -16, error_note: "Receipt not found" }, 404);
      if (receipt.pendingReads > 0) {
        receipt.pendingReads--;
        return reply({ paymentId });
      }
      return reply({ paymentId, qrCodeURL: fake.qrUrl(paymentId) });
    }
    if (operation === "reversal" && method === "DELETE") {
      const paymentId = Number(parts[2]);
      if (reversed.has(paymentId)) return reply({ error_code: -9, error_note: "Already cancelled" });
      reversed.add(paymentId);
      return reply({ error_code: 0, error_note: "Success", payment_id: paymentId });
    }
    return reply({ error_code: -404, error_note: "Not found" }, 404);
  }) as typeof fetch;
  const restore = () => {
    globalThis.fetch = original;
  };
  return { fake, restore };
}
