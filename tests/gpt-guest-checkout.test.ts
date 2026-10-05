// Guest checkout: Click without signing in, the pack bound to a guest
// account of the browser, moved to Telegram on sign-in, restored by a link.
// Run: node --import tsx --test tests/gpt-guest-checkout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestGet as restorePage, onRequestPost as restore } from "../functions/api/gpt/restore";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { resolveConfig } from "../functions/lib/gpt-chat/config";
import { findOrder, restoreToken } from "../functions/lib/gpt-chat/guest-restore";
import { isGuestAccount } from "../functions/lib/gpt-chat/identity-store";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";

const ORIGIN = "https://gpt.test";
const cookieOf = (response: Response) =>
  /__Host-gpt_account=([a-f0-9]{64})/.exec(response.headers.get("Set-Cookie") || "")?.[1] ?? null;

async function guestPays(f: Awaited<ReturnType<typeof billingFixture>>, ip = "198.51.100.7") {
  const buy = (provider: string, cookie: string) =>
    subscribe(f.ctx(new Request(`${ORIGIN}/api/gpt/subscribe`, {
      method: "POST",
      headers: { cookie, Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ provider, requestId: crypto.randomUUID(), acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION, locale: "uz" }),
    })));
  // Other providers still need the account: no guest is made for them.
  assert.equal((await buy("payme", f.rehearsal)).status, 401);
  const response = await buy("click", f.rehearsal);
  assert.equal(response.status, 200);
  const token = cookieOf(response);
  assert.ok(token, "the guest's session cookie");
  assert.match(response.headers.get("Set-Cookie")!, /HttpOnly; Secure; SameSite=Lax; Max-Age=31536000/);
  const order = (await response.json()) as { mode: string; attemptId: string };
  assert.equal(order.mode, "test");
  const row = f.db.value(`SELECT seq FROM gpt_payment_orders WHERE id='${order.attemptId}'`) as number;
  const tx = String(randomBytes(4).readUInt32BE(0));
  assert.equal((await f.clickCall(order.attemptId, "0", { click_trans_id: tx })).error, 0);
  assert.equal((await f.clickCall(order.attemptId, "1", { click_trans_id: tx, merchant_prepare_id: String(row) })).error, 0);
  const guest = f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order.attemptId}'`) as string;
  assert.ok(isGuestAccount(guest));
  return { cookie: `__Host-gpt_account=${token}; ${f.rehearsal}`, order: order.attemptId, guest, tx };
}

test("a guest pays with Click, the pack is the browser's, and its free answers spare the neighbours", async () => {
  const f = await billingFixture();
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

test("signing in through Telegram moves the guest's pack once, and never another account's", async () => {
  const f = await billingFixture();
  const { cookie, order, guest } = await guestPays(f);
  const hash = randomBytes(32).toString("hex");
  const request = new Request(ORIGIN, { headers: { cookie } });
  await f.identity.login(hash);
  await f.identity.adoptGuest(request, hash);
  const tg = f.db.value(`SELECT id FROM gpt_accounts WHERE identity_hash='${hash}'`) as string;
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), tg);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_consents WHERE order_id='${order}'`), tg);
  assert.equal(f.db.value(`SELECT COUNT(*) FROM gpt_auth_sessions WHERE user_id='${guest}'`), 0);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 1, "moved, not copied");
  // A repeat finds nothing; a Telegram account signed in on the browser keeps its pack.
  await f.identity.adoptGuest(request, hash);
  const other = randomBytes(32).toString("hex");
  await f.identity.login(other);
  await f.identity.adoptGuest(new Request(ORIGIN, { headers: { cookie: f.cookie } }), other);
  await f.identity.adoptGuest(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${await f.identity.login(hash)}` } }), other);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), tg);
});

test("a restore link moves a lost guest pack to another browser once", async () => {
  const f = await billingFixture();
  const { order, tx } = await guestPays(f);
  // Support finds it by our number or Click's payment id.
  assert.equal((await findOrder(f.binding, tx))?.id, order);
  const found = (await findOrder(f.binding, order))!;
  const { token } = await restoreToken(f.env.GPT_IDENTITY_SECRET!, found);
  const page = await restorePage(f.ctx(new Request(`${ORIGIN}/api/gpt/restore?t=${token}`)));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");
  assert.equal(f.db.value(`SELECT user_id FROM gpt_payment_orders WHERE id='${order}'`), found.user_id, "a GET moves nothing");
  const post = (cookie = "") =>
    restore(f.ctx(new Request(`${ORIGIN}/api/gpt/restore`, {
      method: "POST",
      headers: { Origin: ORIGIN, cookie, "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "192.0.2.4" },
      body: new URLSearchParams({ t: token }),
    })));
  const moved = await post();
  assert.equal(moved.status, 303);
  assert.equal(moved.headers.get("Location"), "/uz/gpt-uzbek-tilida/");
  const fresh = cookieOf(moved);
  assert.ok(fresh);
  const owner = (await f.identity.user(new Request(ORIGIN, { headers: { cookie: `__Host-gpt_account=${fresh}` } })))!;
  assert.notEqual(owner, found.user_id);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), owner);
  // Used once: the same link moves nothing again.
  assert.equal((await post(f.cookie)).status, 410);
  assert.equal(f.db.value(`SELECT user_id FROM gpt_access_periods WHERE order_id='${order}'`), owner);
});
