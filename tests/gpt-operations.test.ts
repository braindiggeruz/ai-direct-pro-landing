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
import { maintainBilling } from "../functions/lib/gpt-chat/billing-maintenance-store";
import { readJsonLimited } from "../functions/lib/gpt-chat/http";
import { resolveConfig, modelChain } from "../functions/lib/gpt-chat/config";
import { runGptBillingMaintenance } from "../workers/gpt-billing-maintenance";
import { IdentityStore } from "../functions/lib/gpt-chat/identity-store";
import { TurnStore } from "../functions/lib/gpt-chat/turn-store";
import { availableModels } from "../functions/lib/gpt-chat/model-health-store";
import {
  inspectBilling,
  checkBillingProviders,
} from "../functions/lib/gpt-chat/billing-operations-store";

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
  await turnsB.finish(admitted.id, true);
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
  globalThis.fetch = async (input) => {
    calls++;
    assert.equal(input, "https://openrouter.ai/api/v1/models");
    return Response.json({
      data: [...modelChain(cfg, "free"), ...modelChain(cfg, "paid")].map(
        (id) => ({ id, pricing: { prompt: "0", completion: "0" } }),
      ),
    });
  };
  try {
    await checkBillingProviders(f.env);
    assert.equal(calls, 1);
    Object.assign(f.env, {
      GPT_BILLING_MODE: "live",
      GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString("hex"),
      GPT_NOTIFY_CHAT_ID: "123456789",
    });
    await maintainBilling(f.env);
    assert.equal(calls, 1);
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

test("notification outbox leases concurrent drains, retries failures and never sends in test mode", async () => {
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
    await maintainBilling(f.env);
    assert.equal(calls, 0);
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
    await runGptBillingMaintenance({
      GPT_BILLING_MAINTENANCE_SECRET: secret,
      GPT_BILLING_MAINTENANCE_ENABLED: "true",
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
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
