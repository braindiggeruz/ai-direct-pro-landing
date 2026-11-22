// Read-only check of GPTBot's Click Merchant API access, the access every
// Click fiscal receipt needs (docs/paid-chat/CLICK-FISCAL-RU.md, «Если чек
// не пробивается»).
//
// Since the first live payment (07.10.2026) every Click receipt has stopped
// at its first step: GET status_by_mti answers error_code -12, «Неверные
// данные поставщика». Click gives that same answer to a request with no Auth
// header at all and to a made-up merchant user (probe of 22.11.2026), so -12
// there cannot tell a merchant user Click does not accept from a lookup that
// failed. payment/status can: a made-up Auth gets -15 («Неверная строка
// подписи данных») there and a missing one -12. This script asks, with the
// credentials of the owner's click.json (the file
// scripts/paid-chat/ingest-keys.ts puts into GPT_CLICK_CREDENTIALS_JSON,
// parsed here by the site's own parser), for each paid live order read from
// D1 beforehand:
//   1. GET status_by_mti, exactly as the receipt queue does (fiscal-store.ts);
//   2. GET payment/status for the click_trans_id and the click_paydoc_id the
//      order keeps from Prepare: error_code 0 means Click accepts our Auth
//      and knows that number as the payment id;
//   3. GET ofd_data, only for a payment id that 1 or 2 confirmed with an
//      accepted Auth: does a receipt exist (Click's own, from the OFD set-up
//      of 05.10.2026)?
// The verdict names the fix: lookup_works (the queue will print on its own),
// lookup_only_fails (the payment id can come from the order instead),
// auth_rejected (Click must confirm merchant_user_id and Merchant API access:
// no code change helps), unclear (read the answers).
//
//   node --import tsx scripts/paid-chat/click-merchant-check.ts \
//       --inbox F:/Claude/gptbot-keys-inbox --orders <file|->
//       [--no-lookup] [--codes-only] [--max-calls N]
// --no-lookup skips step 1 (its answer is in D1 already, last_error), so the
// verdict can only be access_works, auth_rejected or unclear; --codes-only
// leaves Click's notes out; --max-calls caps the GETs of the whole run.
// <file> ("-": stdin, so the ids never touch the disk) holds what wrangler
// prints for this read-only query (or its rows):
//   wrangler d1 execute gptbot-ai-drafts --remote --json --command
//     "SELECT id,external_id,provider_doc_id,perform_time,provider_time
//      FROM gpt_payment_orders WHERE provider='click' AND mode='live'
//      AND state='paid' ORDER BY perform_time DESC LIMIT 2"
//
// GET only, to https://api.click.uz only, redirects never followed: nothing
// goes to the OFD, nothing is reversed, D1 is not touched, the inbox is read
// and never written. Printed: HTTP statuses, Click's error codes and notes
// (any key or number of ours cut out), the payment days and yes/no flags.
// Never printed: the key, the merchant user, an order id, a payment id or an
// amount; orders are #1, #2, #3.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { clickCredentials, type BillingEnv } from "../../functions/lib/gpt-chat/billing-config";
import {
  CLICK_MERCHANT_API,
  clickAuthHeader,
  clickPaymentDate,
  type ClickMerchantAuth,
} from "../../functions/lib/gpt-chat/click-merchant";
import { ofdReceiptLink } from "../../functions/lib/gpt-chat/fiscal-config";

/** At most this many orders per run: seven GETs each at most. */
export const MAX_ORDERS = 3;
const TIMEOUT_MS = 10_000;
const MAX_REPLY_BYTES = 16_384;
const MAX_NOTE = 120;
const ORDER_ID = /^[a-z]{2,4}_[0-9a-f]{32}$/;
const PAYMENT_ID = /^[1-9]\d{0,14}$/;
/** Click's answers to an Auth it does not accept (probe of 22.11.2026). */
export const AUTH_REFUSALS: readonly number[] = [-12, -15];

/** A paid live Click order as D1 keeps it. */
export interface CheckOrder {
  id: string;
  /** click_trans_id, stored at Prepare. */
  external_id: string | null;
  /** click_paydoc_id, stored at Prepare. */
  provider_doc_id: string | null;
  perform_time: number;
  provider_time: number | null;
}
export type IdKind = "click_trans_id" | "click_paydoc_id";
export interface Answer {
  /** null: no HTTP answer (network failure, timeout). */
  http: number | null;
  /** Click's error_code, or null when the answer carried none. */
  code: number | null;
  note: string | null;
}
export interface OrderCheck {
  order: string;
  statusByMti: (Answer & { day: string; paymentId: IdKind | "other" | null })[];
  paymentStatus: Partial<Record<IdKind, Answer & { status: number | null }>>;
  ofdData: Partial<Record<IdKind | "other", Answer & { receipt: "ofd" | "other_host" | "none" }>>;
}
/** access_works: payment/status accepted our Auth while the lookup was not asked (--no-lookup). */
export type Verdict = "lookup_works" | "lookup_only_fails" | "access_works" | "auth_rejected" | "unclear";
export interface CheckReport {
  readOnly: true;
  /** Every call was a GET to the Click Merchant API. */
  calls: number;
  /** The call budget (--max-calls) stopped further calls. */
  capped: boolean;
  orders: OrderCheck[];
  verdict: Verdict;
  /** Which number of ours Click knows as the payment id, when one answer says so. */
  paymentIdIs: IdKind | "other" | null;
  /** Receipt links on ofd.soliq.uz that Click already holds. */
  clickReceipts: number;
}
export interface CheckOptions {
  fetch?: typeof fetch;
  now?: () => number;
  /** false: status_by_mti is not asked (its answer is in D1 already: last_error). */
  lookup?: boolean;
  /** At most this many calls in all; the rest are not made. */
  maxCalls?: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function errorCode(value: unknown): number | null {
  const code = typeof value === "string" && /^-?\d{1,9}$/.test(value) ? Number(value) : value;
  return typeof code === "number" && Number.isSafeInteger(code) ? code : null;
}
function digits(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && PAYMENT_ID.test(text) ? text : null;
}

/** Click's note without anything of ours in it, one short printable line. */
function cleanNote(value: unknown, hidden: string[]): string | null {
  if (typeof value !== "string") return null;
  let note = value;
  for (const item of hidden) if (item) note = note.split(item).join("[cut]");
  note = Array.from(note, (char) => (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return note ? note.slice(0, MAX_NOTE) : null;
}

/**
 * Reads the owner's click.json and returns its live Merchant API access, or
 * the reason it has none. The reason never quotes the file.
 */
export function inboxAccess(text: string): ClickMerchantAuth | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    // The parser's message quotes the input: it is never shown.
    return { error: "click.json is not valid JSON" };
  }
  const live = record(record(parsed)?.live);
  if (!live) return { error: "click.json has no live block" };
  const credentials = clickCredentials({ GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live }) } as BillingEnv, "live");
  if (!credentials) return { error: "click.json live: the site's parser rejects service_id or secret_key" };
  if (!credentials.merchantUserId) return { error: "click.json live: merchant_user_id missing or not digits" };
  return {
    serviceId: credentials.serviceId,
    merchantUserId: credentials.merchantUserId,
    secretKey: credentials.secretKey,
  };
}

/** The orders of wrangler's --json output (or a plain array of rows); invalid rows are refused. */
export function parseOrders(text: string): CheckOrder[] | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { error: "the orders file is not valid JSON" };
  }
  const first = Array.isArray(parsed) ? record(parsed[0]) : null;
  const rows: unknown[] = Array.isArray(first?.results) ? (first.results as unknown[]) : Array.isArray(parsed) ? parsed : [];
  const orders: CheckOrder[] = [];
  for (const raw of rows) {
    const row = record(raw);
    if (!row || typeof row.id !== "string" || !ORDER_ID.test(row.id) || !Number.isSafeInteger(row.perform_time))
      return { error: `order #${orders.length + 1}: needs id, external_id, provider_doc_id, perform_time, provider_time` };
    orders.push({
      id: row.id,
      external_id: digits(row.external_id),
      provider_doc_id: digits(row.provider_doc_id),
      perform_time: row.perform_time as number,
      provider_time: Number.isSafeInteger(row.provider_time) ? (row.provider_time as number) : null,
    });
  }
  if (!orders.length) return { error: "the orders file holds no order" };
  if (orders.length > MAX_ORDERS) return { error: `at most ${MAX_ORDERS} orders per run` };
  return orders;
}

/** Asks Click about each order (GET only) and names what the answers mean. */
export async function checkMerchantAccess(
  auth: ClickMerchantAuth,
  orders: CheckOrder[],
  options: CheckOptions = {},
): Promise<CheckReport> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let calls = 0;
  let capped = false;
  /** One GET, or null when the call budget is spent (the call is not made). */
  const get = async (pathPart: string, hidden: string[]) => {
    if (options.maxCalls !== undefined && calls >= options.maxCalls) {
      capped = true;
      return null;
    }
    calls += 1;
    let response: Response;
    try {
      response = await fetchImpl(`${CLICK_MERCHANT_API}${pathPart}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Auth: await clickAuthHeader(auth, now()),
        },
        // Never followed: the key cannot reach another host.
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { answer: { http: null, code: null, note: null } as Answer, reply: null };
    }
    let reply: Record<string, unknown> | null = null;
    try {
      const text = await response.text();
      if (text.length <= MAX_REPLY_BYTES) reply = record(JSON.parse(text));
    } catch {
      reply = null;
    }
    const answer: Answer = {
      http: response.status,
      code: errorCode(reply?.error_code),
      note: cleanNote(reply?.error_note, hidden),
    };
    return { answer, reply };
  };

  const checks: OrderCheck[] = [];
  for (const [index, order] of orders.entries()) {
    const ids: Partial<Record<IdKind, string>> = {};
    if (order.external_id) ids.click_trans_id = order.external_id;
    if (order.provider_doc_id) ids.click_paydoc_id = order.provider_doc_id;
    const hidden = [auth.secretKey, auth.merchantUserId, order.id, order.external_id ?? "", order.provider_doc_id ?? ""];
    const kindOf = (paymentId: string): IdKind | "other" =>
      paymentId === ids.click_trans_id ? "click_trans_id" : paymentId === ids.click_paydoc_id ? "click_paydoc_id" : "other";
    const check: OrderCheck = { order: `#${index + 1}`, statusByMti: [], paymentStatus: {}, ofdData: {} };
    /** Payment ids an accepted Auth confirmed: the only ones ofd_data is asked about. */
    const confirmed = new Map<IdKind | "other", string>();

    const days =
      options.lookup === false
        ? []
        : [...new Set([order.perform_time, order.provider_time ?? 0].filter((at) => at > 0).map(clickPaymentDate))];
    for (const day of days) {
      const asked = await get(`/status_by_mti/${auth.serviceId}/${encodeURIComponent(order.id)}/${day}`, hidden);
      if (!asked) break;
      const { answer, reply } = asked;
      const found = answer.code === 0 ? digits(reply?.payment_id) : null;
      const echoed = reply?.merchant_trans_id;
      const ours = found && (echoed === undefined || String(echoed) === order.id) ? found : null;
      if (ours) hidden.push(ours);
      check.statusByMti.push({ ...answer, note: cleanNote(answer.note, hidden), day, paymentId: ours ? kindOf(ours) : null });
      if (ours) {
        confirmed.set(kindOf(ours), ours);
        break;
      }
    }
    for (const kind of ["click_trans_id", "click_paydoc_id"] as const) {
      const id = ids[kind];
      if (!id) continue;
      const asked = await get(`/status/${auth.serviceId}/${id}`, hidden);
      if (!asked) break;
      const { answer, reply } = asked;
      check.paymentStatus[kind] = { ...answer, status: answer.code === 0 ? errorCode(reply?.payment_status) : null };
      if (answer.code === 0 && (reply?.payment_id === undefined || digits(reply.payment_id) === id)) confirmed.set(kind, id);
    }
    for (const [kind, id] of confirmed) {
      const asked = await get(`/ofd_data/${auth.serviceId}/${id}`, hidden);
      if (!asked) break;
      const { answer, reply } = asked;
      const url = typeof reply?.qrCodeURL === "string" && reply.qrCodeURL.trim() ? reply.qrCodeURL : null;
      check.ofdData[kind] = { ...answer, receipt: url ? (ofdReceiptLink(url) ? "ofd" : "other_host") : "none" };
    }
    checks.push(check);
  }

  const lookups = checks.flatMap((check) => check.statusByMti);
  const statuses = checks.flatMap((check) => Object.values(check.paymentStatus));
  const lookupWorks = lookups.some((answer) => answer.paymentId !== null);
  const acceptedKinds = new Set(
    checks.flatMap((check) =>
      (Object.entries(check.paymentStatus) as [IdKind, Answer][]).filter(([, answer]) => answer.code === 0).map(([kind]) => kind),
    ),
  );
  const refused = (answer: Answer) => answer.code !== null && AUTH_REFUSALS.includes(answer.code);
  const verdict: Verdict = lookupWorks
    ? "lookup_works"
    : acceptedKinds.size
      ? options.lookup === false
        ? "access_works"
        : "lookup_only_fails"
      : lookups.length + statuses.length > 0 && [...lookups, ...statuses].every(refused)
        ? "auth_rejected"
        : "unclear";
  const named = lookups.find((answer) => answer.paymentId !== null)?.paymentId ?? null;
  return {
    readOnly: true,
    calls,
    capped,
    orders: checks,
    verdict,
    paymentIdIs: named ?? (acceptedKinds.size === 1 ? [...acceptedKinds][0] : null),
    clickReceipts: checks.reduce(
      (sum, check) => sum + Object.values(check.ofdData).filter((answer) => answer.receipt === "ofd").length,
      0,
    ),
  };
}

function option(args: string[], name: string): string | null {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : null;
}

export interface Dependencies {
  readText?: (file: string) => string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** 0: the check ran (whatever its verdict); 2: a usage or file problem, nothing sent. */
export async function main(
  args: string[],
  log: (line: string) => void = console.log,
  deps: Dependencies = {},
): Promise<number> {
  const inbox = option(args, "--inbox");
  const ordersFile = option(args, "--orders");
  const capText = args.includes("--max-calls") ? (option(args, "--max-calls") ?? "") : null;
  const maxCalls = capText === null ? undefined : /^\d{1,2}$/.test(capText) ? Number(capText) : 0;
  if (!inbox || !ordersFile || (maxCalls !== undefined && (maxCalls < 1 || maxCalls > 20))) {
    log(
      "usage: node --import tsx scripts/paid-chat/click-merchant-check.ts --inbox <dir> --orders <file|->" +
        " [--no-lookup] [--codes-only] [--max-calls 1..20]",
    );
    return 2;
  }
  // "-": the orders come on stdin (wrangler piped in), so their ids never touch the disk.
  const readText = deps.readText ?? ((file: string) => readFileSync(file === "-" ? 0 : file, "utf8"));
  let accessText: string;
  let ordersText: string;
  try {
    accessText = readText(path.join(inbox, "click.json"));
  } catch {
    log("click.json: cannot be read in the inbox");
    return 2;
  }
  try {
    ordersText = readText(ordersFile);
  } catch {
    log("the orders file cannot be read");
    return 2;
  }
  const access = inboxAccess(accessText);
  if ("error" in access) {
    log(access.error);
    return 2;
  }
  const orders = parseOrders(ordersText);
  if ("error" in orders) {
    log(orders.error);
    return 2;
  }
  const report = await checkMerchantAccess(access, orders, {
    fetch: deps.fetch,
    now: deps.now,
    lookup: !args.includes("--no-lookup"),
    maxCalls,
  });
  // --codes-only: statuses, codes and flags only, without Click's notes.
  const codesOnly = args.includes("--codes-only");
  log(JSON.stringify(report, (key, value) => (codesOnly && key === "note" ? undefined : value), 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
