// Read-only check of the Click Merchant API access behind every Click fiscal
// receipt: scripts/paid-chat/click-merchant-check.ts.
// Runtime-only random credentials and ids, never real ones.
// Run: node --import tsx --test tests/paid-chat-click-merchant-check.test.ts
import assert from "node:assert/strict";
import { createHash, randomBytes, randomInt } from "node:crypto";
import path from "node:path";
import test from "node:test";
import {
  checkMerchantAccess,
  inboxAccess,
  main,
  MAX_ORDERS,
  parseOrders,
  type CheckOrder,
} from "../scripts/paid-chat/click-merchant-check";

const SECRET = randomBytes(16).toString("hex");
const USER = String(randomInt(100_000, 999_999));
const SERVICE = String(randomInt(10_000, 99_999));
const AUTH = { serviceId: SERVICE, merchantUserId: USER, secretKey: SECRET };
/** 2026-11-11 12:14:44 Tashkent. */
const PAID_AT = Date.UTC(2026, 10, 11, 7, 14, 44);

const tenDigits = () => String(randomInt(1_000_000_000, 9_999_999_999));
function order(): CheckOrder {
  return {
    id: `pay_${randomBytes(16).toString("hex")}`,
    external_id: tenDigits(),
    provider_doc_id: tenDigits(),
    perform_time: PAID_AT,
    provider_time: PAID_AT - 2_000,
  };
}

type Op = "status_by_mti" | "status" | "ofd_data";
interface Call {
  method: string;
  url: URL;
  auth: string | null;
  redirect: RequestRedirect | undefined;
  op: Op;
  id: string;
}
type Route = (op: Op, id: string) => { status?: number; body: unknown } | "network";

/** A Click Merchant API behind fetch; `route` answers by operation and the id in the path. */
function fakeClick(route: Route) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const parts = url.pathname.split("/").filter(Boolean);
    const op = parts[3] as Op;
    // status_by_mti/:service/:mti/:day, status/:service/:payment, ofd_data/:service/:payment
    const id = decodeURIComponent(parts[5] ?? "");
    calls.push({ method: init?.method ?? "GET", url, auth: new Headers(init?.headers).get("Auth"), redirect: init?.redirect, op, id });
    const answer = route(op, id);
    if (answer === "network") throw new TypeError("fetch failed");
    return Response.json(answer.body, { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const REFUSED_MTI = { body: { error_code: -12, error_note: "Неверные данные поставщика" } };
const BAD_SIGNATURE = { body: { error_code: -15, error_note: "Неверная строка подписи данных." } };
const NOT_FOUND = { body: { error_code: -32500, error_note: "Платеж не найден" } };
const qr = (id: string) => `https://ofd.soliq.uz/epi?t=EZ000000000030&r=${id}&c=20261111121444&s=854971301623`;

function assertQuiet(text: string, orders: CheckOrder[]) {
  for (const value of [SECRET, USER, ...orders.flatMap((o) => [o.id, o.external_id ?? "", o.provider_doc_id ?? ""])])
    assert.ok(value && !text.includes(value), "the report must not carry a key, the merchant user or an id");
}

test("today's production answers: Click refuses the merchant user everywhere — auth_rejected, ofd_data never asked", async () => {
  const orders = [order(), order()];
  const click = fakeClick((op) => (op === "status_by_mti" ? REFUSED_MTI : op === "status" ? BAD_SIGNATURE : NOT_FOUND));
  const report = await checkMerchantAccess(AUTH, orders, { fetch: click.impl, now: () => PAID_AT + 3_600_000 });
  assert.equal(report.verdict, "auth_rejected");
  assert.equal(report.paymentIdIs, null);
  assert.equal(report.clickReceipts, 0);
  assert.equal(click.calls.filter((c) => c.op === "ofd_data").length, 0, "no receipt read without an accepted Auth");
  // Two days (Complete and Prepare share one here) => one lookup, two payment/status per order.
  assert.equal(report.calls, 6);
  assert.deepEqual(report.orders[0].statusByMti, [
    { http: 200, code: -12, note: "Неверные данные поставщика", day: "2026-11-11", paymentId: null },
  ]);
  assert.equal(report.orders[1].paymentStatus.click_paydoc_id?.code, -15);
  assertQuiet(JSON.stringify(report), orders);
});

test("only GETs, only to api.click.uz/v2/merchant/payment, redirects never followed, Auth as Click documents it", async () => {
  const orders = [order()];
  const now = PAID_AT + 60_000;
  const click = fakeClick((op, id) =>
    op === "status_by_mti"
      ? { body: { error_code: 0, payment_id: Number(orders[0].external_id), merchant_trans_id: id } }
      : op === "status"
        ? { body: { error_code: 0, payment_id: Number(id), payment_status: 2 } }
        : { body: { paymentId: Number(id), qrCodeURL: qr(id) } },
  );
  await checkMerchantAccess(AUTH, orders, { fetch: click.impl, now: () => now });
  assert.ok(click.calls.length > 0);
  const stamp = String(Math.floor(now / 1000));
  const digest = createHash("sha1").update(stamp + SECRET).digest("hex");
  for (const call of click.calls) {
    assert.equal(call.method, "GET");
    assert.equal(call.url.origin, "https://api.click.uz");
    assert.ok(call.url.pathname.startsWith(`/v2/merchant/payment/${call.op}/${SERVICE}/`));
    assert.equal(call.redirect, "manual");
    assert.equal(call.auth, `${USER}:${digest}:${stamp}`);
  }
  assert.ok(click.calls.some((c) => c.op === "status_by_mti" && c.url.pathname.endsWith(`/${orders[0].id}/2026-11-11`)));
});

test("the lookup fails but payment/status knows click_trans_id: lookup_only_fails, and Click's own receipt is found", async () => {
  const orders = [order()];
  const trans = orders[0].external_id!;
  const click = fakeClick((op, id) =>
    op === "status_by_mti"
      ? REFUSED_MTI
      : op === "status"
        ? id === trans
          ? { body: { error_code: 0, error_note: "Success", payment_id: Number(id), payment_status: 2 } }
          : NOT_FOUND
        : { body: { paymentId: Number(id), qrCodeURL: qr(id) } },
  );
  const report = await checkMerchantAccess(AUTH, orders, { fetch: click.impl });
  assert.equal(report.verdict, "lookup_only_fails");
  assert.equal(report.paymentIdIs, "click_trans_id");
  assert.equal(report.clickReceipts, 1);
  assert.equal(report.orders[0].paymentStatus.click_trans_id?.status, 2);
  assert.equal(report.orders[0].paymentStatus.click_paydoc_id?.code, -32500);
  assert.deepEqual(
    click.calls.filter((c) => c.op === "ofd_data").map((c) => c.id),
    [trans],
    "ofd_data only for the number Click confirmed",
  );
  assert.deepEqual(report.orders[0].ofdData.click_trans_id, { http: 200, code: null, note: null, receipt: "ofd" });
  assertQuiet(JSON.stringify(report), orders);
});

test("the lookup works: the payment id it names is classified, a receipt without a link is none", async () => {
  const orders = [order()];
  const paydoc = orders[0].provider_doc_id!;
  const click = fakeClick((op, id) =>
    op === "status_by_mti"
      ? { body: { error_code: 0, error_note: "Success", payment_id: Number(paydoc), merchant_trans_id: id } }
      : op === "status"
        ? id === paydoc
          ? { body: { error_code: 0, payment_id: Number(id), payment_status: 2 } }
          : NOT_FOUND
        : { body: { paymentId: Number(id), qrCodeURL: "" } },
  );
  const report = await checkMerchantAccess(AUTH, orders, { fetch: click.impl });
  assert.equal(report.verdict, "lookup_works");
  assert.equal(report.paymentIdIs, "click_paydoc_id");
  assert.equal(report.orders[0].statusByMti[0].paymentId, "click_paydoc_id");
  assert.equal(report.orders[0].ofdData.click_paydoc_id?.receipt, "none");
  assert.equal(click.calls.filter((c) => c.op === "ofd_data").length, 1);
  assert.equal(report.clickReceipts, 0);
});

test("a payment id of another order, or a receipt off ofd.soliq.uz, is never taken as ours", async () => {
  const orders = [order()];
  const click = fakeClick((op, id) =>
    op === "status_by_mti"
      ? { body: { error_code: 0, payment_id: 1234567, merchant_trans_id: "pay_" + "0".repeat(32) } }
      : op === "status"
        ? { body: { error_code: 0, payment_id: Number(id), payment_status: 2 } }
        : { body: { paymentId: Number(id), qrCodeURL: "https://example.com/receipt" } },
  );
  const report = await checkMerchantAccess(AUTH, orders, { fetch: click.impl });
  assert.equal(report.orders[0].statusByMti.every((a) => a.paymentId === null), true);
  assert.equal(report.verdict, "lookup_only_fails");
  assert.equal(report.paymentIdIs, null, "both numbers accepted: ambiguous");
  assert.equal(report.orders[0].ofdData.click_trans_id?.receipt, "other_host");
  assert.equal(report.clickReceipts, 0);
});

test("Click's note never carries our key or numbers; a network failure is unclear, not a refusal", async () => {
  const orders = [order()];
  const click = fakeClick((op) =>
    op === "status_by_mti"
      ? { body: { error_code: -12, error_note: `Нет\n${orders[0].id} ${SECRET} ${USER}` } }
      : "network",
  );
  const report = await checkMerchantAccess(AUTH, orders, { fetch: click.impl });
  assert.equal(report.orders[0].statusByMti[0].note, "Нет [cut] [cut] [cut]");
  assert.deepEqual(report.orders[0].paymentStatus.click_trans_id, { http: null, code: null, note: null, status: null });
  assert.equal(report.verdict, "unclear");
  assertQuiet(JSON.stringify(report), orders);
});

test("parseOrders: wrangler's --json output or plain rows; a bad row or too many orders is refused without quoting it", () => {
  const rows = [order(), order()];
  const wrangler = JSON.stringify([{ results: rows, success: true, meta: {} }]);
  const parsed = parseOrders(String.fromCharCode(0xfeff) + wrangler);
  assert.ok(Array.isArray(parsed));
  assert.deepEqual(parsed, rows);
  assert.deepEqual(parseOrders(JSON.stringify(rows)), rows);
  // Numbers as wrangler may print them are kept as digits.
  const numeric = parseOrders(JSON.stringify([{ ...rows[0], external_id: Number(rows[0].external_id) }]));
  assert.ok(Array.isArray(numeric) && numeric[0].external_id === rows[0].external_id);
  const bad = parseOrders(JSON.stringify([{ ...rows[0], id: "not an order" }]));
  assert.ok("error" in bad && !bad.error.includes("not an order"));
  const many = parseOrders(JSON.stringify(Array.from({ length: MAX_ORDERS + 1 }, order)));
  assert.ok("error" in many && /at most/.test(many.error));
  assert.ok("error" in parseOrders("[]"));
  assert.ok("error" in parseOrders("{oops"));
});

test("inboxAccess: the site's own parser reads click.json; every refusal names the field, never the value", () => {
  const live = { service_id: SERVICE, merchant_id: "54321", secret_key: SECRET, merchant_user_id: USER };
  assert.deepEqual(inboxAccess(String.fromCharCode(0xfeff) + JSON.stringify({ live })), AUTH);
  assert.deepEqual(inboxAccess(JSON.stringify({ live: { ...live, merchant_user_id: Number(USER) } })), AUTH);
  for (const [text, reason] of [
    [`{"live": ${SECRET}`, /not valid JSON/],
    [JSON.stringify({ test: live }), /no live block/],
    [JSON.stringify({ live: { ...live, secret_key: "short" } }), /service_id or secret_key/],
    [JSON.stringify({ live: { ...live, merchant_user_id: undefined } }), /merchant_user_id/],
  ] as const) {
    const result = inboxAccess(text);
    assert.ok("error" in result);
    assert.match(result.error, reason);
    assert.ok(!result.error.includes(SECRET) && !result.error.includes(USER));
  }
});

test("main: reads the inbox and the orders file, prints only the report; a problem stops before any call", async () => {
  const orders = [order()];
  const files: Record<string, string> = {
    [path.join("inbox", "click.json")]: JSON.stringify({
      live: { service_id: SERVICE, merchant_id: "54321", secret_key: SECRET, merchant_user_id: USER },
    }),
    "orders.json": JSON.stringify([{ results: orders }]),
  };
  const readText = (file: string) => {
    if (!(file in files)) throw new Error("ENOENT");
    return files[file];
  };
  const click = fakeClick((op) => (op === "status_by_mti" ? REFUSED_MTI : BAD_SIGNATURE));
  const lines: string[] = [];
  assert.equal(await main(["--inbox", "inbox", "--orders", "orders.json"], (l) => lines.push(l), { readText, fetch: click.impl }), 0);
  const printed = lines.join("\n");
  assert.equal(JSON.parse(printed).verdict, "auth_rejected");
  assertQuiet(printed, orders);

  const quiet = fakeClick(() => {
    throw new Error("no call may be made");
  });
  const usage: string[] = [];
  assert.equal(await main(["--inbox", "inbox"], (l) => usage.push(l), { readText, fetch: quiet.impl }), 2);
  assert.match(usage.join("\n"), /usage/);
  files[path.join("inbox", "click.json")] = JSON.stringify({ live: { service_id: SERVICE, secret_key: SECRET } });
  const refused: string[] = [];
  assert.equal(await main(["--inbox", "inbox", "--orders", "orders.json"], (l) => refused.push(l), { readText, fetch: quiet.impl }), 2);
  assert.match(refused.join("\n"), /merchant_user_id/);
  assert.ok(!refused.join("\n").includes(SECRET));
  assert.equal(await main(["--inbox", "missing", "--orders", "orders.json"], () => {}, { readText, fetch: quiet.impl }), 2);
  assert.equal(quiet.calls.length, 0);
});

test("--no-lookup: no status_by_mti, payment/status decides (access_works); the call budget is never exceeded", async () => {
  const orders = [order()];
  const trans = orders[0].external_id!;
  const click = fakeClick((op, id) =>
    op === "status"
      ? id === trans
        ? { body: { error_code: 0, payment_id: Number(id), payment_status: 2 } }
        : NOT_FOUND
      : op === "ofd_data"
        ? { body: { paymentId: Number(id), qrCodeURL: qr(id) } }
        : REFUSED_MTI,
  );
  const report = await checkMerchantAccess(AUTH, orders, { fetch: click.impl, lookup: false, maxCalls: 4 });
  assert.equal(click.calls.filter((c) => c.op === "status_by_mti").length, 0);
  assert.deepEqual(click.calls.map((c) => c.op), ["status", "status", "ofd_data"]);
  assert.equal(report.verdict, "access_works");
  assert.equal(report.paymentIdIs, "click_trans_id");
  assert.equal(report.clickReceipts, 1);
  assert.equal(report.capped, false);
  assert.deepEqual(report.orders[0].statusByMti, []);

  // Refused everywhere without the lookup: still auth_rejected.
  const refusing = fakeClick(() => BAD_SIGNATURE);
  const refused = await checkMerchantAccess(AUTH, [order()], { fetch: refusing.impl, lookup: false });
  assert.equal(refused.verdict, "auth_rejected");

  // Two orders, budget 3: the fourth call is never made.
  const busy = fakeClick((op, id) => (op === "status" ? { body: { error_code: 0, payment_id: Number(id), payment_status: 2 } } : { body: { paymentId: Number(id), qrCodeURL: "" } }));
  const capped = await checkMerchantAccess(AUTH, [order(), order()], { fetch: busy.impl, lookup: false, maxCalls: 3 });
  assert.equal(busy.calls.length, 3);
  assert.equal(capped.calls, 3);
  assert.equal(capped.capped, true);
});

test("main: --orders - reads stdin; --codes-only prints no Click note; a bad --max-calls stops before any call", async () => {
  const orders = [order()];
  const files: Record<string, string> = {
    [path.join("inbox", "click.json")]: JSON.stringify({
      live: { service_id: SERVICE, merchant_id: "54321", secret_key: SECRET, merchant_user_id: USER },
    }),
    "-": JSON.stringify([{ results: orders }]),
  };
  const readText = (file: string) => {
    if (!(file in files)) throw new Error("ENOENT");
    return files[file];
  };
  const click = fakeClick(() => BAD_SIGNATURE);
  const lines: string[] = [];
  const args = ["--inbox", "inbox", "--orders", "-", "--no-lookup", "--codes-only", "--max-calls", "4"];
  assert.equal(await main(args, (l) => lines.push(l), { readText, fetch: click.impl }), 0);
  const printed = lines.join("\n");
  assert.ok(!printed.includes("note") && !printed.includes("Неверная"), "codes and flags only");
  const report = JSON.parse(printed);
  assert.equal(report.verdict, "auth_rejected");
  assert.equal(report.orders[0].paymentStatus.click_trans_id.code, -15);
  assert.equal(click.calls.filter((c) => c.op === "status_by_mti").length, 0);
  assertQuiet(printed, orders);

  const quiet = fakeClick(() => {
    throw new Error("no call may be made");
  });
  for (const cap of ["0", "21", "x", "2.5"]) {
    const out: string[] = [];
    assert.equal(await main(["--inbox", "inbox", "--orders", "-", "--max-calls", cap], (l) => out.push(l), { readText, fetch: quiet.impl }), 2);
    assert.match(out.join("\n"), /usage/);
  }
  assert.equal(await main(["--inbox", "inbox", "--orders", "-", "--max-calls"], () => {}, { readText, fetch: quiet.impl }), 2);
  assert.equal(quiet.calls.length, 0);
});
