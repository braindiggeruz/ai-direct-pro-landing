// Guest checkout: Click or Payme without signing in, the pack bound to a
// guest account of the browser, moved to Telegram on sign-in, restored by a
// link. On in production since 2026-10-07 (edition ai-paket-2026-10-v3; v4 since one tap).
// Run: node --import tsx --test tests/gpt-guest-checkout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestGet as restorePage, onRequestPost as restore } from "../functions/api/gpt/restore";
import { onRequestPost as restoreLink } from "../functions/api/internal/gpt-guest-restore-link";
import { onRequest as middleware } from "../functions/_middleware";
import {
  BILLING_ORG,
  GUEST_PROVIDERS,
  guestCheckoutOn,
  guestProvider,
  PAYMENT_TTL_MS,
  type BillingEnv,
} from "../functions/lib/gpt-chat/billing-config";
import { BILLING_NOTICES_PER_HOUR, maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { resolveConfig } from "../functions/lib/gpt-chat/config";
import { findOrder, RESTORE_LINK_MS, restoreNotice } from "../functions/lib/gpt-chat/guest-restore";
import { addressKey } from "../functions/lib/gpt-chat/hash";
import { isGuestAccount, moveOrders } from "../functions/lib/gpt-chat/identity-store";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";
import { hydrateRuntimeConfig, RUNTIME_CONFIG_KEYS } from "../functions/lib/runtime-config";
import { BILLING_SETTINGS, committedRuntimeConfig } from "../scripts/release/live-gate";

type Fixture = Awaited<ReturnType<typeof billingFixture>>;

const ORIGIN = "https://gpt.test";
const cookieOf = (response: Response) =>
  /__Host-gpt_account=([a-f0-9]{64})/.exec(response.headers.get("Set-Cookie") || "")?.[1] ?? null;
const browser = (cookie: string) => new Request(ORIGIN, { headers: { cookie } });

/** Guest checkout is off unless GPT_GUEST_CHECKOUT is exactly "true". */
async function guestFixture() {
  const f = await billingFixture();
  f.env.GPT_GUEST_CHECKOUT = "true";
  f.env.GPT_BILLING_MAINTENANCE_SECRET = randomBytes(32).toString("hex");
  return f;
}

const checkout = (f: Fixture, provider: string, cookie: string, ip: string) =>
  subscribe(f.ctx(new Request(`${ORIGIN}/api/gpt/subscribe`, {
    method: "POST",
    headers: { cookie, Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ provider, requestId: crypto.randomUUID(), acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION, locale: "uz" }),
  })));

async function guestPays(f: Fixture, ip = "198.51.100.7", until: "pending" | "prepared" | "paid" = "paid") {
  const response = await checkout(f, "click", f.rehearsal, ip);
  assert.equal(response.status, 200);
  const token = cookieOf(response);
  assert.ok(token, "the guest's session cookie");
  assert.match(response.headers.get("Set-Cookie")!, /HttpOnly; Secure; SameSite=Lax; Max-Age=31536000/);
  const order = (await response.json()) as { mode: string; attemptId: string };
  assert.equal(order.mode, "test");
  const row = f.db.value(`SELECT seq FROM gpt_payment_orders WHERE id='${order.attemptId}'`) as number;
  const tx = String(randomBytes(4).readUInt32BE(0));
  // Click's payment number: the one in the buyer's SMS and receipt.
  const doc = String(randomBytes(4).readUInt32BE(0));
  if (until !== "pending")
    assert.equal((await f.clickCall(order.attemptId, "0", { click_trans_id: tx, click_paydoc_id: doc })).error, 0);
  if (until === "paid")
    assert.equal((await f.clickCall(order.attemptId, "1", { click_trans_id: tx, click_paydoc_id: doc, merchant_prepare_id: String(row) })).error, 0);
  const guest = f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order.attemptId}'`) as string;
  assert.ok(isGuestAccount(guest));
  return { cookie: `__Host-gpt_account=${token}; ${f.rehearsal}`, order: order.attemptId, guest, tx, doc };
}

/** A Telegram account signed in (its identity hash and id). */
async function telegram(f: Fixture) {
  const hash = randomBytes(32).toString("hex");
  await f.identity.login(hash);
  return { hash, id: f.db.value(`SELECT id FROM gpt_accounts WHERE identity_hash='${hash}'`) as string };
}

/** Support's restore link, by Click's payment id or our number (internal/gpt-guest-restore-link). */
const issueLink = (f: Fixture, query: string, bearer = f.env.GPT_BILLING_MAINTENANCE_SECRET) =>
  restoreLink(f.ctx(new Request(`${ORIGIN}/api/internal/gpt-guest-restore-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ order: query }),
  })));

const restorePost = (f: Fixture, token: string, cookie = "", ip = "192.0.2.4", path = "/api/gpt/restore") =>
  restore(f.ctx(new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: ORIGIN, cookie, "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": ip },
    body: new URLSearchParams({ t: token }),
  })));

test("guest checkout stays off unless GPT_GUEST_CHECKOUT is exactly \"true\"", async () => {
  const f = await billingFixture();
  for (const flag of [undefined, "", "1", "TRUE"]) {
    f.env.GPT_GUEST_CHECKOUT = flag;
    const response = await checkout(f, "click", f.rehearsal, "198.51.100.8");
    assert.equal(response.status, 401, String(flag));
    assert.equal(cookieOf(response), null);
    const view = (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, { headers: { cookie: f.rehearsal } })))).json()) as { guestCheckout: boolean };
    assert.equal(view.guestCheckout, false);
  }
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_accounts WHERE id LIKE 'acct_guest_%'"), 0);
});

test("the committed config turns GPT_GUEST_CHECKOUT on (\"true\") in both copies, with the edition that describes the guest account", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const packed = committedRuntimeConfig(toml);
  assert.equal(packed.GPT_GUEST_CHECKOUT, "true");
  assert.match(toml, /^GPT_GUEST_CHECKOUT = "true"$/m);
  // The offer edition of 2026-10-07 is the one that describes the guest account.
  assert.equal(packed.GPT_BILLING_TERMS_VERSION, "ai-paket-2026-10-v4");
  assert.ok((RUNTIME_CONFIG_KEYS as readonly string[]).includes("GPT_GUEST_CHECKOUT"));
  const env = hydrateRuntimeConfig({ GPTBOT_RUNTIME_CONFIG_JSON: JSON.stringify(packed) }) as unknown as BillingEnv;
  assert.equal(env.GPT_GUEST_CHECKOUT, "true");
  assert.equal(guestCheckoutOn(env), true);
  assert.equal(guestCheckoutOn({ ...env, GPT_GUEST_CHECKOUT: "false" }), false);
  // A Pages variable of the same name would override the reviewed JSON.
  assert.ok(BILLING_SETTINGS.has("GPT_GUEST_CHECKOUT"));
});

test("a guest pays with Click, the pack is the browser's, and its free answers spare the neighbours", async () => {
  const f = await guestFixture();
  const { cookie, guest } = await guestPays(f);
  const view = (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, { headers: { cookie } })))).json()) as {
    user: { guest?: boolean }; access: { remaining: number } | null; guestCheckout: boolean;
  };
  assert.equal(view.user.guest, true);
  assert.equal(view.guestCheckout, true);
  assert.equal(view.access?.remaining, 300);
  // The offer acceptance is recorded for the guest's order, with its edition.
  assert.equal(f.db.value(`SELECT version FROM gpt_payment_consents WHERE user_id='${guest}'`), f.env.GPT_BILLING_TERMS_VERSION);
  // Free answers first, counted by the guest account alone (R2).
  const turns = new TurnStore(f.binding, BILLING_ORG);
  const cfg = resolveConfig(f.env);
  const period = await new BillingStore(f.binding, BILLING_ORG).access(guest, "test");
  assert.ok(period);
  const before = (await turns.allowance("ip-shared", "ip-shared", null, cfg)).remaining;
  const turn = await turns.reserve(guest, "ip-shared", period, cfg);
  assert.equal(turn.bucket, "free");
  assert.equal((await turns.allowance("ip-shared", "ip-shared", null, cfg)).remaining, before, "the neighbour keeps the free day");
  // At most five new guests an hour per address.
  for (let i = 0; i < 5; i++) await guestPays(f, "203.0.113.9");
  await assert.rejects(guestPays(f, "203.0.113.9"));
});

test("a guest may pay with Click or Payme, never Uzum: the providers whose orders sign-in and support can move", () => {
  assert.deepEqual(GUEST_PROVIDERS, ["click", "payme"]);
  assert.equal(guestProvider("click"), true);
  assert.equal(guestProvider("payme"), true);
  for (const provider of ["uzum", "", undefined, "Click"]) assert.equal(guestProvider(provider), false, String(provider));
});

test("a guest pays with Payme live: checkout.paycom.uz, the pack is the browser's, the owner's notice names Payme's transaction, support restores it by our number, sign-in moves it", async () => {
  const f = await billingFixture();
  // Production's shape since 2026-10-07: Payme live by its own switch, guest checkout on.
  Object.assign(f.env, liveSettings(), {
    GPT_BILLING_MODE: "",
    GPT_BILLING_MODE_PAYME: "live",
    GPT_PAYME_KEY: randomBytes(32).toString("hex"),
    GPT_GUEST_CHECKOUT: "true",
  });
  // The owner's notices go to a stub of the Bot API, never to Telegram.
  const original = globalThis.fetch;
  const sent: string[] = [];
  globalThis.fetch = async (_input, init) => {
    sent.push(String((JSON.parse(String(init?.body)) as { text: string }).text));
    return Response.json({ ok: true, result: { message_id: sent.length } });
  };
  try {
    const ip = "198.51.100.77";
    // No cookie at all: a visitor in live, offered Payme with nothing signed in.
    const offered = await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`)))).json() as {
      user: null; guestCheckout: boolean; providers: string[]; mode: string;
    };
    assert.deepEqual([offered.user, offered.guestCheckout, offered.providers, offered.mode], [null, true, ["payme"], "live"]);
    const response = await checkout(f, "payme", "", ip);
    const body = (await response.json()) as { mode: string; checkoutUrl: string; attemptId: string };
    assert.equal(response.status, 200, JSON.stringify(body));
    const token = cookieOf(response);
    assert.ok(token, "the guest's session cookie");
    assert.match(response.headers.get("Set-Cookie")!, /HttpOnly; Secure; SameSite=Lax; Max-Age=31536000/);
    assert.equal(body.mode, "checkout");
    const page = new URL(body.checkoutUrl);
    assert.equal(page.origin, "https://checkout.paycom.uz");
    assert.equal(
      atob(page.pathname.slice(1)),
      `m=${f.env.GPT_PAYME_MERCHANT_ID};ac.order_id=${body.attemptId};a=2000000;c=${ORIGIN}/uz/gpt-uzbek-tilida/?pay=return;l=uz;ct=15000`,
    );
    const order = body.attemptId;
    const guest = f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`) as string;
    assert.ok(isGuestAccount(guest));
    assert.equal(f.db.value(`SELECT mode FROM gpt_payment_orders WHERE id='${order}'`), "live");
    const cookie = `__Host-gpt_account=${token}`;
    // The guest's own open invoice, as the pack window shows it before Payme takes it up.
    const pending = (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, { headers: { cookie } })))).json()) as {
      user: { guest?: boolean }; payment: { id: string; state: string; provider: string } | null; providers: string[]; mode: string;
    };
    assert.deepEqual([pending.user.guest, pending.payment?.id, pending.payment?.state, pending.payment?.provider], [true, order, "pending", "payme"]);
    assert.deepEqual([pending.providers, pending.mode], [["payme"], "live"]);
    // Payme with the production key: in live the test key opens no payment
    // (it only settles test transactions, payme.ts SETTLE_ONLY).
    const live = (method: string, params: Record<string, unknown>) => f.rpc(method, params, f.env.GPT_PAYME_KEY);
    assert.equal(((await f.rpc("CheckPerformTransaction", { amount: 2_000_000, account: { order_id: order } })) as { error?: { code: number } }).error?.code, -31050);
    assert.equal(((await f.rpc("CheckPerformTransaction", { amount: 2_000_000, account: { order_id: order } }, "x".repeat(32))) as { error?: { code: number } }).error?.code, -32504);
    const allowed = (await live("CheckPerformTransaction", { amount: 2_000_000, account: { order_id: order } })) as { result?: { allow: boolean } };
    assert.equal(allowed.result?.allow, true);
    const id = randomBytes(12).toString("hex");
    assert.equal(((await live("CreateTransaction", { id, time: Date.now(), amount: 2_000_000, account: { order_id: order } })) as { result?: { state: number } }).result?.state, 1);
    assert.equal(((await live("PerformTransaction", { id })) as { result?: { state: number } }).result?.state, 2);
    const view = (await (await account(f.ctx(new Request(`${ORIGIN}/api/gpt/account`, { headers: { cookie } })))).json()) as {
      user: { guest?: boolean }; access: { remaining: number } | null; payment: { state: string } | null;
    };
    assert.deepEqual([view.user.guest, view.access?.remaining, view.payment?.state], [true, 300, "paid"]);
    // The owner's "paid" notice: bought without signing in, Payme's transaction, the time in Tashkent.
    const paid = new Date((f.db.value(`SELECT perform_time FROM gpt_payment_orders WHERE id='${order}'`) as number) + 5 * 3600_000);
    const two = (n: number) => String(n).padStart(2, "0");
    const stamp = `${two(paid.getUTCHours())}:${two(paid.getUTCMinutes())} ${two(paid.getUTCDate())}.${two(paid.getUTCMonth() + 1)}`;
    const line = `\nКуплен без входа · Payme: транзакция ${id} · оплачен ${stamp} (Ташкент)`;
    assert.equal(await restoreNotice(f.binding, order), line);
    while (f.background.length) await Promise.allSettled(f.background.splice(0));
    await maintainBilling(f.env);
    const notice = sent.find((text) => /AI paket: paid/.test(text));
    assert.ok(notice, JSON.stringify(sent));
    assert.ok(notice.includes(`payme · 20 000 UZS\n${order}`) && notice.endsWith(line), notice);
    // Support finds it by our number (the order_id on the Payme receipt); Payme's id is not a query.
    assert.equal((await findOrder(f.binding, order))?.provider, "payme");
    assert.equal((await issueLink(f, id)).status, 400);
    const issued = (await (await issueLink(f, order)).json()) as {
      order: string; provider: string; clickId: unknown; paydocId: unknown; paymeId: string; url: string;
    };
    assert.deepEqual([issued.order, issued.provider, issued.clickId, issued.paydocId, issued.paymeId], [order, "payme", null, null, id]);
    assert.ok(issued.url.startsWith("https://gptbot.uz/api/gpt/restore?t="));
    // Signing in through Telegram moves the Payme pack like a Click one.
    const a = await telegram(f);
    await f.identity.adoptGuest(browser(cookie), a.hash);
    assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`), a.id);
    assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), a.id);
    assert.equal(await restoreNotice(f.binding, order), "", "a Telegram account's order needs no restore");
  } finally {
    globalThis.fetch = original;
  }
});

test("new guests count an IPv6 network as one address, and the site has a ceiling", async () => {
  assert.equal(addressKey("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
  assert.equal(addressKey("2001:DB8:1:2::9"), "2001:db8:1:2::/64");
  assert.equal(addressKey("2001:db8::"), "2001:db8:0:0::/64");
  assert.equal(addressKey("203.0.113.9"), "203.0.113.9");
  assert.equal(addressKey("::ffff:203.0.113.9"), "::ffff:203.0.113.9");
  assert.equal(addressKey(undefined), undefined);
  const f = await guestFixture();
  for (let i = 1; i <= 5; i++) assert.equal((await checkout(f, "click", f.rehearsal, `2001:db8:1:2::${i}`)).status, 200);
  assert.equal((await checkout(f, "click", f.rehearsal, "2001:db8:1:2:ffff::7")).status, 429, "another address of the same /64");
  assert.equal((await checkout(f, "click", f.rehearsal, "2001:db8:1:3::1")).status, 200, "another network");
  // Sixty an hour across the site, whatever the addresses.
  f.db.exec("UPDATE gpt_rate_limits SET count=60 WHERE action='guest_account_global'");
  assert.equal((await checkout(f, "click", f.rehearsal, "198.51.100.200")).status, 429);
});

test("signing in through Telegram moves the guest's pack once, and never another account's", async () => {
  const f = await guestFixture();
  const { cookie, order, guest } = await guestPays(f);
  const hash = randomBytes(32).toString("hex");
  const request = browser(cookie);
  await f.identity.login(hash);
  await f.identity.adoptGuest(request, hash);
  const tg = f.db.value(`SELECT id FROM gpt_accounts WHERE identity_hash='${hash}'`) as string;
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), tg);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_consents WHERE order_id='${order}'`), tg);
  assert.equal(f.db.value(`SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id='${guest}'`), 0);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 1, "moved, not copied");
  assert.equal(await restoreNotice(f.binding, order), "", "a Telegram account's order needs no restore");
  // Support's link: the order is found, but it is no longer a guest's running pack.
  const kept = await issueLink(f, order);
  assert.equal(kept.status, 409);
  assert.equal(((await kept.json()) as { code: string }).code, "invalid_order");
  // A repeat finds nothing; a Telegram account signed in on the browser keeps its pack.
  await f.identity.adoptGuest(request, hash);
  const other = randomBytes(32).toString("hex");
  await f.identity.login(other);
  await f.identity.adoptGuest(new Request(ORIGIN, { headers: { cookie: f.cookie } }), other);
  await f.identity.adoptGuest(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${await f.identity.login(hash)}` } }), other);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), tg);
});

test("sign-in moves a guest's open invoice past the account's forgotten one, or fails and leaves the guest as it was", async () => {
  const f = await guestFixture();
  const store = new BillingStore(f.binding, BILLING_ORG);
  const userOf = (order: string) => f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`);
  const stateOf = (order: string) => f.db.value(`SELECT state FROM gpt_payment_orders WHERE id='${order}'`);
  const clickTx = () => String(randomBytes(4).readUInt32BE(0));
  {
    // The account's own invoice no provider has seen gives way to the guest's.
    const g = await guestPays(f, "198.51.100.11", "pending");
    const a = await telegram(f);
    const forgotten = await store.createOrder(a.id, "click", "test", crypto.randomUUID());
    await f.identity.adoptGuest(browser(g.cookie), a.hash);
    assert.equal(stateOf(forgotten.id), "cancelled");
    assert.equal(userOf(g.order), a.id);
    assert.equal(f.db.value(`SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id='${g.guest}'`), 0);
    // It moved no money: the owner hears nothing of it.
    assert.equal(f.db.value(`SELECT COUNT(*) FROM gpt_billing_outbox WHERE order_id='${forgotten.id}'`), 0);
  }
  {
    // One past its time is closed as createOrder closes it, even one Click took up.
    const g = await guestPays(f, "198.51.100.12", "prepared");
    const a = await telegram(f);
    const old = await store.createOrder(a.id, "click", "test", crypto.randomUUID(), Date.now() - PAYMENT_TTL_MS - 60_000);
    await store.transition(old.id, "prepared", "Prepare", { externalId: clickTx() });
    await f.identity.adoptGuest(browser(g.cookie), a.hash);
    assert.equal(stateOf(old.id), "cancelled");
    assert.equal(userOf(g.order), a.id);
  }
  {
    // One Click holds now keeps the guest's invoice where it is: sign-in fails,
    // nothing moves, and the guest keeps its session.
    const g = await guestPays(f, "198.51.100.13", "prepared");
    const a = await telegram(f);
    const held = await store.createOrder(a.id, "click", "test", crypto.randomUUID());
    await store.transition(held.id, "prepared", "Prepare", { externalId: clickTx() });
    await assert.rejects(f.identity.adoptGuest(browser(g.cookie), a.hash), /guest_not_moved/);
    assert.equal(stateOf(held.id), "prepared");
    assert.equal(userOf(g.order), g.guest);
    assert.equal(await f.identity.user(browser(g.cookie)), g.guest);
  }
  {
    // A paid guest order whose request id the account used already does not
    // stay behind in silence: sign-in fails, the pack stays with the guest.
    const g = await guestPays(f, "198.51.100.14");
    const a = await telegram(f);
    await store.createOrder(a.id, "click", "test", f.db.value(`SELECT request_id FROM gpt_payment_orders WHERE id='${g.order}'`) as string);
    await assert.rejects(f.identity.adoptGuest(browser(g.cookie), a.hash), /guest_not_moved/);
    assert.equal(userOf(g.order), g.guest);
    assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${g.order}'`), g.guest);
    assert.equal(await f.identity.user(browser(g.cookie)), g.guest);
  }
});

test("a payment settling while sign-in moves its order opens the pack for the account holding it now", async () => {
  const f = await guestFixture();
  const g = await guestPays(f, "198.51.100.21", "prepared");
  const a = await telegram(f);
  let race = true;
  // Sign-in commits between the payment's read of the order and its batch.
  const raced = new Proxy(f.binding, {
    get(target, name) {
      if (name === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (race) {
            race = false;
            await target.batch(moveOrders(target, BILLING_ORG, g.guest, a.id, null));
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, name);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await new BillingStore(raced, BILLING_ORG).transition(g.order, "paid", "Complete");
  assert.equal(race, false);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${g.order}'`), a.id);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${g.order}'`), a.id);
  assert.ok(await new BillingStore(f.binding, BILLING_ORG).access(a.id, "test"));
});

test("support's restore link moves a lost guest pack once, into an account the browser already holds", async () => {
  const f = await guestFixture();
  const { order, tx, doc, guest } = await guestPays(f);
  // The owner's "paid" notice of a guest order: the payment number the buyer
  // sees in the Click SMS, the transaction id and the time paid in Tashkent;
  // no link.
  const notice = await restoreNotice(f.binding, order);
  const paid = new Date((f.db.value(`SELECT perform_time FROM gpt_payment_orders WHERE id='${order}'`) as number) + 5 * 3600_000);
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${two(paid.getUTCHours())}:${two(paid.getUTCMinutes())} ${two(paid.getUTCDate())}.${two(paid.getUTCMonth() + 1)}`;
  assert.equal(notice, `\nКуплен без входа · Click: номер платежа (SMS) ${doc} · trans ${tx} · оплачен ${stamp} (Ташкент)`);
  assert.doesNotMatch(notice, /restore\?t=/);
  // Found by either of Click's numbers, or by ours.
  for (const query of [doc, tx, order]) assert.equal((await findOrder(f.binding, query))?.id, order, query);
  assert.equal((await findOrder(f.binding, "1"))?.id, undefined);
  // Support asks for a link when a buyer needs one: 48 hours at most.
  assert.equal((await issueLink(f, doc, randomBytes(32).toString("hex"))).status, 403);
  assert.equal((await issueLink(f, "not-an-order")).status, 400);
  // A number no Click order has is "not found", not "already moved".
  const unknown = await issueLink(f, "1");
  assert.equal(unknown.status, 404);
  assert.equal(((await unknown.json()) as { code: string }).code, "not_found");
  assert.equal(((await (await issueLink(f, tx)).json()) as { order: string }).order, order);
  const issued = (await (await issueLink(f, doc)).json()) as { order: string; url: string; expiresAt: number; clickId: string; paydocId: string };
  assert.equal(issued.order, order);
  assert.deepEqual([issued.clickId, issued.paydocId], [tx, doc]);
  assert.ok(issued.expiresAt <= Date.now() + RESTORE_LINK_MS && issued.expiresAt > Date.now() + RESTORE_LINK_MS - 60_000);
  assert.ok(issued.url.startsWith("https://gptbot.uz/api/gpt/restore?t="));
  const token = new URL(issued.url).searchParams.get("t")!;
  const page = await restorePage(f.ctx(new Request(`${ORIGIN}/api/gpt/restore?t=${token}`)));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`), guest, "a GET moves nothing");
  // No account yet: a guest account first, its cookie with a 307 that repeats
  // the POST. Nothing moves before the browser holds that account.
  const minted = await restorePost(f, token);
  assert.equal(minted.status, 307);
  assert.equal(minted.headers.get("Location"), "/api/gpt/restore?guest=1");
  assert.equal(minted.headers.get("Referrer-Policy"), "same-origin");
  const fresh = cookieOf(minted);
  assert.ok(fresh);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`), guest);
  // A browser that did not keep the cookie is told so; no second guest is made.
  const guests = f.db.value("SELECT COUNT(*) FROM gpt_accounts WHERE id LIKE 'acct_guest_%'");
  assert.equal((await restorePost(f, token, "", "192.0.2.4", "/api/gpt/restore?guest=1")).status, 400);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_accounts WHERE id LIKE 'acct_guest_%'"), guests);
  const moved = await restorePost(f, token, `__Host-gpt_account=${fresh}`, "192.0.2.4", "/api/gpt/restore?guest=1");
  assert.equal(moved.status, 303);
  assert.equal(moved.headers.get("Location"), "/uz/gpt-uzbek-tilida/");
  const owner = (await f.identity.user(browser(`__Host-gpt_account=${fresh}`)))!;
  assert.notEqual(owner, guest);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), owner);
  // The chat it opens gets no referrer: the site's middleware keeps the route's policy.
  const served = await middleware({ request: new Request(`${ORIGIN}/api/gpt/restore`, { method: "POST" }), env: {}, next: async () => moved } as never);
  assert.equal(served.headers.get("Referrer-Policy"), "no-referrer");
  // A second tap, or a retry after a lost answer: the chat, not "link used".
  assert.equal((await restorePost(f, token, `__Host-gpt_account=${fresh}`)).status, 303);
  // Used once: another browser moves nothing.
  assert.equal((await restorePost(f, token, f.cookie)).status, 410);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), owner);
});

test("Click's payment number is kept from Prepare, once, and never changes what Click is answered", async () => {
  const f = await guestFixture();
  const { order, tx, doc } = await guestPays(f, "198.51.100.40", "prepared");
  const stored = () => f.db.value(`SELECT provider_doc_id FROM gpt_payment_orders WHERE id='${order}'`);
  assert.equal(stored(), doc);
  const seq = f.db.value(`SELECT seq FROM gpt_payment_orders WHERE id='${order}'`) as number;
  // Click repeats Prepare, then completes with another paydoc in the form:
  // the answers are the protocol's, and the first number stays.
  assert.deepEqual(await f.clickCall(order, "0", { click_trans_id: tx, click_paydoc_id: "999" }), {
    click_trans_id: Number(tx), merchant_trans_id: order, merchant_prepare_id: seq, error: 0, error_note: "Success",
  });
  assert.deepEqual(await f.clickCall(order, "1", { click_trans_id: tx, click_paydoc_id: "999", merchant_prepare_id: String(seq) }), {
    click_trans_id: Number(tx), merchant_trans_id: order, merchant_confirm_id: seq, error: 0, error_note: "Success",
  });
  assert.equal(stored(), doc);
  assert.equal(f.db.value(`SELECT state FROM gpt_payment_orders WHERE id='${order}'`), "paid");
  // An order Click never prepared has none.
  const open = await guestPays(f, "198.51.100.41", "pending");
  assert.equal(f.db.value(`SELECT provider_doc_id FROM gpt_payment_orders WHERE id='${open.order}'`), null);
  // The Uzum table has no such column: the store refuses rather than guess.
  await assert.rejects(
    new BillingStore(f.binding, BILLING_ORG, "gpt_uzum_orders").transition("uzm_x", "prepared", "Prepare", { docId: "1" }),
    /doc_id_unsupported/,
  );
});

test("a valid restore link that meets the limit on new guests says to try later, and still works", async () => {
  const f = await guestFixture();
  const { tx, order, guest } = await guestPays(f, "198.51.100.31");
  const token = new URL(((await (await issueLink(f, tx)).json()) as { url: string }).url).searchParams.get("t")!;
  // Five new guests from one address this hour: checkout made them.
  for (let i = 0; i < 5; i++) assert.equal((await checkout(f, "click", f.rehearsal, "192.0.2.50")).status, 200);
  const busy = await restorePost(f, token, "", "192.0.2.50");
  assert.equal(busy.status, 429);
  assert.ok(Number(busy.headers.get("Retry-After")) > 0);
  assert.match(await busy.text(), /Откройте эту ссылку снова через час/);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`), guest, "nothing moved");
  // The link was not spent: from another network it goes on.
  assert.equal((await restorePost(f, token, "", "192.0.2.51")).status, 307);
});

test("an invoice closed before any provider saw it tells the owner nothing; other notices wait past the hour's share, paid ones first", async () => {
  const f = await billingFixture();
  Object.assign(f.env, {
    GPT_BILLING_MODE: "live",
    GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString("hex"),
    GPT_NOTIFY_CHAT_ID: "123456789",
  });
  for (let i = 0; i < 3; i++) {
    const invoice = await f.store.createOrder(f.user, "click", "live", crypto.randomUUID());
    assert.equal(await f.store.cancelInvoice(f.user, "live", invoice.id), "cancelled");
  }
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox"), 0);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE method='invoice_cancelled'"), 3, "the journal keeps them");
  // A backlog of other notices, and one sale after them.
  const order = f.db.value("SELECT id FROM gpt_payment_orders LIMIT 1") as string;
  const now = Date.now();
  const queue = (event: string, at: number) =>
    f.binding
      .prepare("INSERT INTO gpt_billing_outbox(org_id,id,order_id,event,created_at,available_at) VALUES(?,?,?,?,?,?)")
      .bind(BILLING_ORG, crypto.randomUUID(), order, event, at, at)
      .run();
  for (let i = 0; i < BILLING_NOTICES_PER_HOUR + 5; i++) await queue("cancelled", now - 60_000 + i);
  await queue("paid", now - 1000);
  const original = globalThis.fetch;
  const sent: string[] = [];
  globalThis.fetch = async (_input, init) => {
    sent.push(String((JSON.parse(String(init?.body)) as { text: string }).text));
    return Response.json({ ok: true, result: { message_id: sent.length } });
  };
  try {
    for (let i = 0; i < 20; i++) await maintainBilling(f.env, now);
  } finally {
    globalThis.fetch = original;
  }
  assert.match(sent[0], /AI paket: paid/);
  assert.equal(sent.length, 1 + BILLING_NOTICES_PER_HOUR);
  const waiting = f.db.rows<{ available_at: number }>("SELECT available_at FROM gpt_billing_outbox WHERE delivered_at IS NULL");
  assert.equal(waiting.length, 5);
  for (const row of waiting) assert.ok(row.available_at > now, "the next hour");
});
