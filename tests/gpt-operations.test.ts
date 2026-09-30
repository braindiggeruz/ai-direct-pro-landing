import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { onRequestGet as callback } from "../functions/api/gpt/auth/callback";
import { onRequestGet as account } from "../functions/api/gpt/account";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import {
  BILLING_ORG,
  providerReady,
} from "../functions/lib/gpt-chat/billing-config";
import {
  deliverServiceAlerts,
  maintainBilling,
  recordServiceAlert,
} from "../functions/lib/gpt-chat/billing-maintenance-store";
import { readJsonLimited } from "../functions/lib/gpt-chat/http";
import { resolveConfig, modelChain } from "../functions/lib/gpt-chat/config";
import { webChatChain } from "../functions/lib/gpt-chat/model-provider";
import { runGptBillingMaintenance } from "../workers/gpt-billing-maintenance";
import { IdentityStore } from "../functions/lib/gpt-chat/identity-store";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";
import { availableModels } from "../functions/lib/gpt-chat/model-health-store";
import {
  inspectBilling,
  checkBillingProviders,
} from "../functions/lib/gpt-chat/billing-operations-store";
import {
  PAID_PRICE_CEILING,
  FREE_PRICE_CEILING,
} from "../functions/lib/gpt-chat/model-pricing";
import { buildChatBody } from "../functions/lib/gpt-chat/openrouter-chat";
import { automationWorkerVars } from "./helpers/wrangler-vars";

test("another tenant cannot affect identity, entitlements, quota, model health, maintenance or diagnostics", async () => {
  const f = await billingFixture();
  const other = "other-org";
  const identityB = new IdentityStore(f.binding, other);
  assert.equal(
    await identityB.user(
      new Request("https://gpt.test", { headers: { cookie: f.cookie } }),
    ),
    null,
  );
  const storeB = new BillingStore(f.binding, other);
  const orderB = await storeB.createOrder(
    f.user,
    "payme",
    "live",
    crypto.randomUUID(),
  );
  await storeB.transition(orderB.id, "prepared", "prepare", {
    externalId: "other-tenant-tx",
  });
  await storeB.transition(orderB.id, "paid", "perform");
  const periodB = (await storeB.access(f.user, "live"))!;
  assert.equal(await f.store.order(orderB.id), null);
  assert.equal(
    await f.store.external("payme", "live", "other-tenant-tx"),
    null,
  );
  assert.equal(await f.store.access(f.user, "live"), null);
  assert.equal(await f.store.requestRefund(f.user, orderB.id), false);
  const turnsA = new TurnStore(f.binding, BILLING_ORG);
  const turnsB = new TurnStore(f.binding, other);
  const cfg = resolveConfig(f.env);
  const admitted = await turnsB.reserve(f.user, "synthetic-ip", periodB, cfg);
  assert.ok(admitted.id);
  await turnsB.finish(admitted.id, { outcome: "answered", charged: true });
  assert.equal(await turnsA.remaining(f.user, null, cfg), 15);
  assert.equal(
    (await turnsA.reserve(f.user, "synthetic-ip", periodB, cfg)).id,
    null,
  );
  assert.equal(await turnsA.admitModelAttempt(periodB), false);
  assert.equal(await turnsB.admitModelAttempt(periodB), true);
  const state = randomBytes(32).toString("hex");
  await identityB.challenge(state, "verifier", "uz");
  assert.equal(await f.identity.claim(state), null);
  assert.ok(await identityB.claim(state));
  const stale = Date.now() - 700000;
  await f.identity.challenge(state, "verifier", "uz", stale);
  await identityB.challenge(state, "verifier", "uz", stale);
  await f.binding
    .prepare("INSERT INTO gpt_model_health VALUES(?,?,?,?)")
    .bind(other, cfg.paidModel, Date.now() + 3600000, "rate_limit")
    .run();
  await f.binding
    .prepare(
      "INSERT INTO gpt_service_alerts(org_id,id,code,created_at) VALUES(?,?,?,?)",
    )
    .bind(other, "other-alert", "provider_error", Date.now())
    .run();
  await f.binding
    .prepare(
      "INSERT INTO gpt_service_alerts(org_id,id,code,created_at) VALUES(?,?,?,?)",
    )
    .bind(other, "other-drill", "drill", Date.now())
    .run();
  await f.binding
    .prepare("INSERT INTO gpt_billing_ops VALUES(?,?,?)")
    .bind(other, "catalogue", Date.now() + 3600000)
    .run();
  assert.ok(
    (await availableModels(f.binding, [cfg.paidModel])).includes(cfg.paidModel),
  );
  const diagnostics = await inspectBilling(f.env);
  assert.equal((diagnostics.outbox as { pending: number }).pending, 0);
  assert.equal(diagnostics.lastHour?.length, 0);
  assert.equal(diagnostics.blockedModels?.length, 0);
  const original = globalThis.fetch;
  let calls = 0;
  const chain = [
    ...new Set([...modelChain(cfg, "free"), ...modelChain(cfg, "paid")]),
  ];
  globalThis.fetch = async (input) => {
    calls++;
    const model = /^https:\/\/openrouter\.ai\/api\/v1\/models\/(.+)\/endpoints$/.exec(String(input))?.[1];
    assert.ok(model && chain.includes(model), String(input));
    return Response.json({
      data: { endpoints: [{ pricing: { prompt: "0", completion: "0" } }] },
    });
  };
  try {
    await checkBillingProviders(f.env);
    assert.equal(calls, chain.length);
    Object.assign(f.env, {
      GPT_BILLING_MODE: "live",
      GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString("hex"),
      GPT_NOTIFY_CHAT_ID: "123456789",
    });
    await maintainBilling(f.env);
    // Another tenant's urgent alert is never ours to page.
    assert.deepEqual(await deliverServiceAlerts(f.env), {
      status: "idle",
      codes: [],
    });
    assert.equal(calls, chain.length);
    assert.equal(
      f.db.value(
        "SELECT COUNT(*) FROM gpt_auth_challenges WHERE org_id=?",
        BILLING_ORG,
      ),
      0,
    );
    assert.equal(
      f.db.value(
        "SELECT COUNT(*) FROM gpt_auth_challenges WHERE org_id=?",
        other,
      ),
      1,
    );
    assert.equal(
      f.db.value(
        "SELECT COUNT(*) FROM gpt_billing_outbox WHERE org_id=? AND delivered_at IS NOT NULL",
        other,
      ),
      0,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("OIDC verifies signature, audience and expiry; state is cookie-bound and single-use", async () => {
  const f = await billingFixture();
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "local-fixture",
    alg: "RS256",
  };
  const original = globalThis.fetch;
  let token = "";
  let tokenCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/token")) {
      tokenCalls++;
      return Response.json({ id_token: token });
    }
    assert.equal(
      String(input),
      "https://oauth.telegram.org/.well-known/jwks.json",
    );
    return Response.json({ keys: [jwk] });
  };
  try {
    const issue = (
      aud = f.env.GPT_TELEGRAM_CLIENT_ID!,
      exp: number | string = "5m",
    ) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setSubject("synthetic-subject")
        .setIssuer("https://oauth.telegram.org")
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(privateKey);
    const invoke = async (cookieMatches = true) => {
      const state = randomBytes(32).toString("hex");
      await f.identity.challenge(state, randomBytes(32).toString("hex"), "uz");
      const request = new Request(
        `https://gpt.test/api/gpt/auth/callback?state=${state}&code=fixture`,
        {
          headers: {
            cookie: `__Host-gpt_login=${cookieMatches ? state : "wrong"}`,
          },
        },
      );
      return { response: await callback(f.ctx(request)), request };
    };
    token = await issue();
    assert.equal((await invoke(false)).response.status, 403);
    assert.equal(tokenCalls, 0);
    const valid = await invoke();
    assert.equal(
      valid.response.headers.get("location"),
      "/uz/gpt-uzbek-tilida/",
    );
    assert.match(
      valid.response.headers.get("set-cookie")!,
      /__Host-gpt_account=[a-f0-9]{64}/,
    );
    assert.match(
      valid.response.headers.get("set-cookie")!,
      /HttpOnly; Secure; SameSite=Lax/,
    );
    const repeated = await callback(f.ctx(valid.request));
    assert.match(repeated.headers.get("location")!, /login=failed/);
    assert.equal(tokenCalls, 1);
    for (const invalid of [
      await issue("wrong-audience"),
      await issue(f.env.GPT_TELEGRAM_CLIENT_ID!, 1),
      token.slice(0, -8) + "invalid!",
    ]) {
      token = invalid;
      const { response } = await invoke();
      assert.match(response.headers.get("location")!, /login=failed/);
      assert.doesNotMatch(
        response.headers.get("set-cookie")!,
        /__Host-gpt_account=/,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("fiscal receipt replay and refund request are owned, mode-separated and idempotent", async () => {
  const f = await billingFixture();
  const order = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  const tx = randomBytes(12).toString("hex");
  await f.rpc("CreateTransaction", {
    id: tx,
    time: Date.now(),
    amount: 2000000,
    account: { order_id: order.id },
  });
  await f.rpc("PerformTransaction", { id: tx });
  const params = {
    id: tx,
    type: "PERFORM",
    fiscal_data: {
      status_code: 0,
      qr_code_url: "https://fiscal.example/fixture",
    },
  };
  for (let i = 0; i < 2; i++)
    assert.equal((await f.rpc("SetFiscalData", params)).result.success, true);
  assert.equal(
    (
      await f.rpc("SetFiscalData", {
        ...params,
        fiscal_data: { status_code: 0, qr_code_url: "javascript:alert(1)" },
      })
    ).error.code,
    -32602,
  );
  assert.equal((await f.store.receipts(f.user, "test")).length, 1);
  assert.equal((await f.store.receipts("other-user", "test")).length, 0);
  assert.equal((await f.store.receipts(f.user, "live")).length, 0);
  assert.equal(
    (await new BillingStore(f.binding, "other-org").receipts(f.user, "test"))
      .length,
    0,
  );
  assert.equal(await f.store.requestRefund("other-user", order.id), false);
  await Promise.all(
    Array.from({ length: 8 }, () => f.store.requestRefund(f.user, order.id)),
  );
  assert.ok(await f.store.access(f.user, "test"));
  assert.equal(
    (await f.binding
      .prepare(
        "SELECT COUNT(*) AS n FROM gpt_payment_journal WHERE method='refund_requested'",
      )
      .first<{ n: number }>())!.n,
    1,
  );
  const view = await (
    await account(
      f.ctx(
        new Request("https://gpt.test/api/gpt/account", {
          headers: { cookie: f.cookie },
        }),
      ),
    )
  ).json();
  assert.equal(view.refundable.length, 1);
  assert.ok(view.refundable[0].refund_requested_at);
  assert.equal(
    (await f.rpc("CancelTransaction", { id: tx, reason: 10 })).result.state,
    -2,
  );
  assert.equal(await f.store.access(f.user, "test"), null);
  assert.equal((await f.store.refundable(f.user, "test")).length, 0);
  await Promise.all(f.background);
});

test("notification outbox leases concurrent drains, retries failures and never sends in test mode; alerts do", async () => {
  const f = await billingFixture();
  const order = await f.store.createOrder(
    f.user,
    "payme",
    "live",
    crypto.randomUUID(),
  );
  await f.store.transition(order.id, "prepared", "prepare");
  await f.store.transition(order.id, "paid", "perform");
  Object.assign(f.env, {
    GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString("hex"),
    GPT_NOTIFY_CHAT_ID: "123456789",
  });
  const original = globalThis.fetch;
  let calls = 0;
  let succeed = false;
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      succeed
        ? { ok: true, result: { message_id: 1 } }
        : { ok: false, error_code: 503, description: "synthetic failure" },
      { status: succeed ? 200 : 503 },
    );
  };
  try {
    // Test mode: the paid order's notice stays in the outbox, while an urgent
    // service alert goes out.
    await recordServiceAlert(f.env, "click_processing");
    await maintainBilling(f.env);
    assert.equal(calls, 0);
    succeed = true;
    assert.deepEqual(await deliverServiceAlerts(f.env), {
      status: "sent",
      codes: ["click_processing"],
    });
    assert.equal(calls, 1);
    calls = 0;
    succeed = false;
    f.env.GPT_BILLING_MODE = "live";
    const now = Date.now();
    await Promise.all([
      maintainBilling(f.env, now),
      maintainBilling(f.env, now),
    ]);
    assert.equal(calls, 1);
    await maintainBilling(f.env, now + 1000);
    assert.equal(calls, 1);
    succeed = true;
    await Promise.all([
      maintainBilling(f.env, now + 301000),
      maintainBilling(f.env, now + 301000),
    ]);
    assert.equal(calls, 2);
    assert.equal(
      (await f.binding
        .prepare(
          "SELECT COUNT(*) AS n FROM gpt_billing_outbox WHERE org_id=? AND delivered_at IS NOT NULL",
        )
        .bind(BILLING_ORG)
        .first<{ n: number }>())!.n,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("maintenance worker is opt-in and sends only fixed-origin bearer requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const secret = randomBytes(32).toString("hex");
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(
      input,
      "https://gptbot.uz/api/internal/gpt-billing-maintenance",
    );
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Bearer ${secret}`,
    );
    assert.equal(init?.redirect, "error");
    return Response.json({ ok: true });
  };
  try {
    await runGptBillingMaintenance({});
    await runGptBillingMaintenance({ GPT_BILLING_MAINTENANCE_SECRET: secret });
    assert.equal(calls, 0);
    // The switch ships on: the Worker calls as soon as the secret exists.
    const shipped = automationWorkerVars().get("GPT_BILLING_MAINTENANCE_ENABLED");
    assert.equal(shipped, "true");
    await runGptBillingMaintenance({
      GPT_BILLING_MAINTENANCE_SECRET: secret,
      GPT_BILLING_MAINTENANCE_ENABLED: shipped,
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("hourly catalogue check: only the chain's endpoints, the shared price ceiling, key state once a day", async () => {
  const f = await billingFixture();
  const key = randomBytes(24).toString("hex");
  Object.assign(f.env, {
    OPENROUTER_API_KEY: key,
    OPENROUTER_MODEL_FREE: "vendor/free-ok:free",
    OPENROUTER_MODEL_FREE_FALLBACKS:
      "vendor/free-retired:free,vendor/free-unknown:free",
    OPENROUTER_MODEL_PAID: "vendor/paid-ok",
    OPENROUTER_MODEL_PAID_FALLBACKS: "vendor/paid-pricey,vendor/free-ok:free",
  });
  const endpoints: Record<string, unknown[] | null> = {
    "vendor/free-ok:free": [{ pricing: { prompt: "0", completion: "0" } }],
    // A retired model keeps its page with no endpoints.
    "vendor/free-retired:free": [],
    // An unknown one answers 404.
    "vendor/free-unknown:free": null,
    // One endpoint over the ceiling, one exactly at it (0.1 / 0.32 per 1M).
    "vendor/paid-ok": [
      { pricing: { prompt: "0.0000002", completion: "0.0000005" } },
      { pricing: { prompt: "0.0000001", completion: "0.00000032" } },
    ],
    "vendor/paid-pricey": [
      { pricing: { prompt: "0.00000011", completion: "0.0000003" } },
      { pricing: { prompt: "0", completion: "0", request: "0.001" } },
    ],
  };
  let keyState: unknown = { data: { is_free_tier: true, limit_remaining: 0.5 } };
  let down = false;
  const seen: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seen.push(url);
    if (down) throw new TypeError("synthetic network failure");
    if (url === "https://openrouter.ai/api/v1/key") {
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${key}`,
      );
      return Response.json(keyState);
    }
    const model = /^https:\/\/openrouter\.ai\/api\/v1\/models\/(.+)\/endpoints$/.exec(url)?.[1];
    assert.ok(model && model in endpoints, url);
    const list = endpoints[model];
    return list === null
      ? Response.json({ error: { message: "Not Found", code: 404 } }, { status: 404 })
      : Response.json({ data: { id: model, endpoints: list } });
  };
  const day = Date.UTC(2026, 8, 30);
  const health = () =>
    f.db
      .rows<{ model: string; code: string; blocked_until: number }>(
        "SELECT model,code,blocked_until FROM gpt_model_health ORDER BY model",
      )
      .map((r) => [r.model, r.code, r.blocked_until]);
  const alerts = () =>
    f.db
      .rows<{ id: string }>("SELECT id FROM gpt_service_alerts ORDER BY id")
      .map((r) => r.id);
  try {
    const now = day + 3600_000;
    assert.deepEqual(await checkBillingProviders(f.env, now), {
      ran: true,
      unavailable: [
        "vendor/free-retired:free",
        "vendor/free-unknown:free",
        "vendor/paid-pricey",
      ],
    });
    assert.equal(seen.length, 6, "five chain models and the key, nothing else");
    assert.equal(new Set(seen).size, 6);
    assert.deepEqual(health(), [
      ["vendor/free-retired:free", "model_unavailable", now + 3600_000],
      ["vendor/free-unknown:free", "model_unavailable", now + 3600_000],
      ["vendor/paid-pricey", "model_unavailable", now + 3600_000],
    ]);
    const hour = Math.floor(now / 3600_000);
    const dayIndex = Math.floor(now / 86_400_000);
    assert.deepEqual(alerts(), [
      `catalogue_model_unavailable:${hour}`,
      `openrouter_free_tier_50rpd:d${dayIndex}`,
      `openrouter_key_credit_low:d${dayIndex}`,
    ]);
    // Hourly lease: a second call in the hour asks nobody.
    assert.deepEqual(await checkBillingProviders(f.env, now + 60_000), {
      ran: false,
      unavailable: [],
    });
    assert.equal(seen.length, 6);
    // OpenRouter unreachable: a check failure, and no model is blocked for it.
    down = true;
    await checkBillingProviders(f.env, now + 3600_000);
    assert.equal(health().length, 3);
    assert.ok(alerts().includes(`catalogue_check_failed:${hour + 1}`));
    assert.ok(alerts().includes(`openrouter_key_unavailable:${hour + 1}`));
    // The same key state later that day is still one row per day.
    down = false;
    keyState = { data: { is_free_tier: true, limit_remaining: null } };
    await checkBillingProviders(f.env, now + 2 * 3600_000);
    assert.equal(
      alerts().filter((id) => id.startsWith("openrouter_free_tier_50rpd")).length,
      1,
    );
    assert.equal(
      alerts().filter((id) => id.startsWith("openrouter_key_credit_low")).length,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
  // The request body is capped by the very same ceiling, as a copy.
  assert.deepEqual(buildChatBody("vendor/paid-ok", [], 900).provider.max_price, PAID_PRICE_CEILING);
  assert.deepEqual(buildChatBody("vendor/free-ok:free", [], 900).provider.max_price, FREE_PRICE_CEILING);
  buildChatBody("vendor/paid-ok", [], 900).provider.max_price.prompt = 99;
  assert.equal(PAID_PRICE_CEILING.prompt, 0.1);
});

test("oversized chunked bodies stop reading early; free tier rejects paid overrides; live checkout needs safe terms", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://gpt.test", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  assert.deepEqual(await readJsonLimited(request, 1500), {
    ok: false,
    code: "payload_too_large",
  });
  assert.equal(cancelled, true);
  const f = await billingFixture();
  f.env.OPENROUTER_MODEL_FREE = "some/paid-model";
  assert.ok(
    modelChain(resolveConfig(f.env), "free").every((m) => m.endsWith(":free")),
  );
  // The site's free chain is the ':free' chain until the paid primary flag is
  // on with a daily budget above 0; then the paid primary heads it, and the
  // budget (model-spend-store.ts) gates every attempt on it. modelChain(free)
  // itself never changes: Javob, AEO and the catalogue check stay ':free'.
  assert.deepEqual(webChatChain(resolveConfig(f.env), f.env, "free"), modelChain(resolveConfig(f.env), "free"));
  f.env.GPT_FREE_TIER_PAID_PRIMARY = "true";
  const siteCfg = resolveConfig(f.env);
  assert.equal(siteCfg.freeTierPaidPrimary, true);
  assert.deepEqual(webChatChain(siteCfg, f.env, "free"), [siteCfg.paidModel, ...modelChain(siteCfg, "free")]);
  assert.ok(modelChain(siteCfg, "free").every((m) => m.endsWith(":free")));
  f.env.GPT_FREE_PAID_DAILY_USD = "0";
  assert.deepEqual(webChatChain(resolveConfig(f.env), f.env, "free"), modelChain(siteCfg, "free"));
  assert.deepEqual(webChatChain(siteCfg, f.env, "paid"), modelChain(siteCfg, "paid"));
  Object.assign(f.env, {
    GPT_BILLING_MODE: "live",
    GPT_PAYME_KEY: randomBytes(32).toString("hex"),
    GPT_BILLING_LIVE_READY: "true",
    GPT_BILLING_TERMS_RU: "javascript:alert(1)",
    GPT_BILLING_TERMS_UZ: "https://gptbot.uz/terms/",
  });
  assert.equal(providerReady(f.env, "payme"), false);
  f.env.GPT_BILLING_TERMS_RU = "https://gptbot.uz/ru/terms/";
  assert.equal(providerReady(f.env, "payme"), true);
});
