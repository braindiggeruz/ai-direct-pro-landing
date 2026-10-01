// Dark test mode (plan WP-13, decision L7): a provider in test is offered and
// payable only in a rehearsal session (__Host-gpt_rehearsal), which only the
// Bearer endpoint issues; a synthetic rehearsal account never buys live; a
// test pack is drawn only in a rehearsal session.
// Run: node --import tsx --test tests/gpt-rehearsal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { billingFixture, liveSettings } from "./helpers/gpt-billing-fixture";
import { BILLING_ORG, type BillingEnv } from "../functions/lib/gpt-chat/billing-config";
import { IdentityStore } from "../functions/lib/gpt-chat/identity-store";
import {
  mintRehearsal,
  rehearsalActive,
  REHEARSAL_COOKIE,
  REHEARSAL_TTL_MS,
} from "../functions/lib/gpt-chat/rehearsal";
import { onRequestPost as session } from "../functions/api/internal/gpt-rehearsal-session";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestPost as chat } from "../functions/api/gpt/chat";

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

function open(f: Fixture, body?: unknown, authorization = `Bearer ${f.env.GPT_BILLING_MAINTENANCE_SECRET}`) {
  return session(f.ctx(new Request("https://gptbot.uz/api/internal/gpt-rehearsal-session", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })));
}

/** The name=value pairs of a response's Set-Cookie headers, and their attributes. */
function cookies(response: Response): Map<string, { value: string; attributes: string }> {
  return new Map(
    response.headers.getSetCookie().map((line) => {
      const [pair, ...attributes] = line.split("; ");
      const at = pair.indexOf("=");
      return [pair.slice(0, at), { value: pair.slice(at + 1), attributes: attributes.join("; ") }];
    }),
  );
}

async function view(f: Fixture, cookie: string) {
  return (await (await account(f.ctx(new Request("https://gptbot.uz/api/gpt/account", { headers: { cookie } })))).json()) as {
    providers: string[];
    mode: string | null;
    user: unknown;
    payment: { id: string } | null;
  };
}

function buy(f: Fixture, cookie: string, provider = "click") {
  return subscribe(f.ctx(new Request("https://gptbot.uz/api/gpt/subscribe", {
    method: "POST",
    headers: { cookie, Origin: "https://gptbot.uz", "Content-Type": "application/json" },
    body: JSON.stringify({ provider, requestId: randomUUID(), locale: "ru", acceptTerms: true, termsVersion: f.env.GPT_BILLING_TERMS_VERSION }),
  })));
}

test("the session endpoint: Bearer first, only while a provider is in test, cookies only in Set-Cookie", async () => {
  const f = await billingFixture();
  f.env.GPT_BILLING_MAINTENANCE_SECRET = hex(32);
  assert.equal((await open(f, {}, "")).status, 403);
  assert.equal((await open(f, {}, `Bearer ${hex(32)}`)).status, 403);
  // No provider in test: a missing route.
  f.env.GPT_BILLING_MODE = "live";
  assert.equal((await open(f, {})).status, 404);
  f.env.GPT_BILLING_MODE = "test";
  assert.equal((await open(f, { account: "yes" })).status, 400);
  const secret = f.env.GPT_IDENTITY_SECRET;
  f.env.GPT_IDENTITY_SECRET = hex(8);
  assert.equal((await open(f, {})).status, 409);
  f.env.GPT_IDENTITY_SECRET = secret;

  const plain = await open(f);
  assert.equal(plain.status, 200);
  const plainBody = (await plain.json()) as { ok: boolean; expiresAt: number; providers: string[]; account: string | null };
  assert.deepEqual(plainBody.providers, ["click", "payme"]);
  assert.equal(plainBody.account, null);
  assert.ok(Math.abs(plainBody.expiresAt - (Date.now() + REHEARSAL_TTL_MS)) < 5000);
  const issued = cookies(plain).get(REHEARSAL_COOKIE)!;
  assert.match(issued.value, /^v1\.\d{13}\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
  assert.equal(issued.attributes, "Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7200");
  assert.ok(!JSON.stringify(plainBody).includes(issued.value));
  assert.equal(cookies(plain).has("__Host-gpt_account"), false);

  // With a synthetic account: acct_rh_…, signed in for the same two hours.
  const withAccount = await open(f, { account: true });
  const body = (await withAccount.json()) as { account: string };
  assert.match(body.account, /^acct_rh_[0-9a-f]{32}$/);
  const signedIn = cookies(withAccount).get("__Host-gpt_account")!;
  assert.match(signedIn.value, /^[0-9a-f]{64}$/);
  assert.equal(signedIn.attributes, "Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7200");
  assert.ok(!JSON.stringify(body).includes(signedIn.value));
  const request = new Request("https://gptbot.uz", { headers: { cookie: `__Host-gpt_account=${signedIn.value}` } });
  assert.equal(await new IdentityStore(f.binding, BILLING_ORG).user(request), body.account);
  assert.equal(
    f.db.value("SELECT expires_at - ? <= ? FROM gpt_auth_sessions WHERE user_id=?", Date.now(), REHEARSAL_TTL_MS, body.account),
    1,
  );
  // Tenant isolation (AGENTS §3): another org does not know the account.
  assert.equal(await new IdentityStore(f.binding, "other-org").user(request), null);
});

test("without the cookie a test provider is invisible and unpayable; a forged or stale cookie is no cookie", async () => {
  const f = await billingFixture();
  const outside = await view(f, f.cookie);
  assert.deepEqual(outside.providers, []);
  assert.equal(outside.mode, null);
  const inside = await view(f, f.testCookie);
  assert.deepEqual(inside.providers, ["click", "payme"]);
  assert.equal(inside.mode, "test");

  assert.equal((await buy(f, f.cookie)).status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0);

  const minted = (await mintRehearsal(f.env))!;
  const [, at, nonce, signature] = minted.token.split(".");
  const probe = (token: string, env: BillingEnv = f.env) =>
    rehearsalActive(new Request("https://gptbot.uz", { headers: { cookie: `${REHEARSAL_COOKIE}=${token}` } }), env);
  assert.equal(await probe(minted.token), true);
  // Tampered signature, nonce or expiry; a token of another secret; expired.
  assert.equal(await probe(`v1.${at}.${nonce}.${signature.replace(/^./, (c) => (c === "0" ? "1" : "0"))}`), false);
  assert.equal(await probe(`v1.${at}.${hex(16)}.${signature}`), false);
  assert.equal(await probe(`v1.${Number(at) + 1000}.${nonce}.${signature}`), false);
  assert.equal(await probe((await mintRehearsal({ ...f.env, GPT_IDENTITY_SECRET: hex(32) }))!.token), false);
  assert.equal(await probe((await mintRehearsal(f.env, Date.now() - REHEARSAL_TTL_MS - 1000))!.token), false);
  assert.equal(await probe(`v1.${Date.now() + 10 * REHEARSAL_TTL_MS}.${nonce}.${signature}`), false);
  // Once no provider is in test, the cookie opens nothing.
  assert.equal(await probe(minted.token, { ...f.env, GPT_BILLING_MODE: "live" }), false);

  const paid = await buy(f, f.testCookie);
  assert.equal(paid.status, 200);
  assert.equal(((await paid.json()) as { mode: string }).mode, "test");
  // A test order shows only in the rehearsal session.
  assert.equal((await view(f, f.cookie)).payment, null);
  assert.ok((await view(f, f.testCookie)).payment);
});

test("live for everyone and test in a rehearsal side by side: each context sees its own provider", async () => {
  const f = await billingFixture();
  Object.assign(f.env, {
    ...liveSettings(),
    GPT_BILLING_MODE: "",
    GPT_BILLING_MODE_CLICK: "live",
    GPT_BILLING_MODE_UZUM: "test",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live: { service_id: 1, merchant_id: 2, secret_key: hex(16), merchant_user_id: 3 } }),
    UZUM_API: "checkout",
    UZUM_AUTOFISCAL: "true",
    UZUM_CREDENTIALS_JSON: JSON.stringify({ checkout: { test: { terminalId: randomUUID(), apiKey: hex(24) } } }),
  });
  const rehearsal = `${REHEARSAL_COOKIE}=${(await mintRehearsal(f.env))!.token}`;
  assert.deepEqual(await view(f, f.cookie).then((v) => [v.providers, v.mode]), [["click"], "live"]);
  assert.deepEqual(await view(f, `${f.cookie}; ${rehearsal}`).then((v) => [v.providers, v.mode]), [["uzum"], "test"]);
  // Each provider is bought only in its own context.
  assert.equal((await buy(f, f.cookie, "uzum")).status, 404);
  assert.equal((await buy(f, `${f.cookie}; ${rehearsal}`, "click")).status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders_all"), 0);
});

test("a synthetic rehearsal account never buys live", async () => {
  const f = await billingFixture();
  Object.assign(f.env, {
    ...liveSettings(),
    GPT_BILLING_MODE: "",
    GPT_BILLING_MODE_CLICK: "live",
    GPT_BILLING_MODE_UZUM: "test",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({ live: { service_id: 1, merchant_id: 2, secret_key: hex(16), merchant_user_id: 3 } }),
  });
  const opened = await open(f, { account: true });
  const signedIn = cookies(opened).get("__Host-gpt_account")!.value;
  // Even without the rehearsal cookie, in the live context, Click live is refused.
  const refused = await buy(f, `__Host-gpt_account=${signedIn}`);
  assert.equal(refused.status, 404);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders"), 0);
  // A real account in the same context buys.
  assert.equal((await buy(f, f.cookie)).status, 200);
});

test("the chat draws a test pack only in a rehearsal session", async () => {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = hex(16);
  const order = await f.store.createOrder(f.user, "click", "test", randomUUID());
  await f.store.transition(order.id, "prepared", "Prepare", { externalId: "4242" });
  await f.store.transition(order.id, "paid", "Complete");
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Javob" } }] })}\n\ndata: [DONE]\n\n`);
  try {
    const turn = async (cookie: string) => {
      const response = await chat(f.ctx(new Request("https://gptbot.uz/api/gpt/chat", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ message: "Salom", stream: true }),
      })));
      await response.text();
      await Promise.all(f.background);
    };
    await turn(f.cookie);
    await turn(f.testCookie);
    assert.deepEqual(
      f.db.rows<{ period_id: string | null }>("SELECT period_id FROM gpt_turn_reservations ORDER BY created_at").map((r) => r.period_id),
      [null, order.id],
    );
  } finally {
    globalThis.fetch = original;
  }
});
