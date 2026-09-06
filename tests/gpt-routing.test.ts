import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { resolveConfig, modelChain } from "../functions/lib/gpt-chat/config";
import {
  chatComplete,
  buildChatBody,
} from "../functions/lib/gpt-chat/openrouter-chat";
import { chatStreamStart } from "../functions/lib/gpt-chat/openrouter-stream";
import { buildMessages } from "../functions/lib/gpt-chat/prompt";
import { onRequestPost as chat } from "../functions/api/gpt/chat";
import { BillingStore } from "../functions/lib/gpt-chat/billing-store";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
const sse = (text: string) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );

test("stream falls back before content, cooldown shared with a second request", async () => {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = randomBytes(32).toString("hex");
  const cfg = resolveConfig(f.env);
  const chain = modelChain(cfg, "paid");
  const original = globalThis.fetch;
  const called: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const p = JSON.parse(String(init?.body));
    called.push(p.model);
    assert.ok(p.provider.max_price.prompt <= 0.1);
    assert.equal(p.provider.allow_fallbacks, false);
    return called.length === 1
      ? new Response("", { status: 429 })
      : sse("Hello");
  };
  try {
    const first = await chatStreamStart(
      f.env,
      cfg,
      chain,
      buildMessages([], "Salom", 10, "uz"),
    );
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.model, chain[1]);
      await new Response(first.body).text();
      first.abort();
    }
    const second = await chatStreamStart(f.env, cfg, chain, []);
    assert.equal(second.ok, true);
    if (second.ok) {
      await new Response(second.body).text();
      second.abort();
    }
    assert.deepEqual(called, [chain[0], chain[1], chain[1]]);
  } finally {
    globalThis.fetch = original;
  }
});
test("shared account 402 stops all models and later requests respect cooldown", async () => {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = randomBytes(32).toString("hex");
  const cfg = resolveConfig(f.env);
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return new Response("", { status: 402 });
  };
  try {
    assert.equal(
      (await chatComplete(f.env, cfg, modelChain(cfg, "paid"), [])).errorCode,
      "account_unavailable",
    );
    assert.equal(calls, 1);
    await chatComplete(f.env, cfg, modelChain(cfg, "paid"), []);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("empty SSE 200 uses fallback; caller abort makes no provider request", async () => {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = randomBytes(32).toString("hex");
  const cfg = resolveConfig(f.env);
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    ++calls === 1 ? new Response("data: [DONE]\n\n") : sse("OK");
  try {
    const result = await chatStreamStart(
      f.env,
      cfg,
      modelChain(cfg, "paid"),
      [],
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      await new Response(result.body).text();
      result.abort();
    }
    assert.equal(calls, 2);
    const aborted = new AbortController();
    aborted.abort();
    await chatStreamStart(
      f.env,
      cfg,
      modelChain(cfg, "paid"),
      [],
      900,
      60000,
      aborted.signal,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("real chat endpoint uses paid account, bounds context, charges one answer across fallback", async () => {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = randomBytes(32).toString("hex");
  const order = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  await f.store.transition(order.id, "prepared", "prepare");
  await f.store.transition(order.id, "paid", "perform");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1 ? new Response("", { status: 503 }) : sse("Paid answer");
  try {
    const response = await chat(
      f.ctx(
        new Request("https://gpt.test/api/gpt/chat", {
          method: "POST",
          headers: { cookie: f.cookie, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Salom",
            locale: "uz",
            stream: true,
            sessionId: "someone-elses-session",
          }),
        }),
      ),
    );
    const wire = await response.text();
    assert.ok(wire.includes("Paid answer"));
    assert.ok(wire.includes('"remaining":299'));
    await Promise.all(f.background);
    assert.equal(
      f.db.value(
        "SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='done'",
      ),
      1,
    );
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_model_attempts"), 2);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_messages"), 0);
    const messages = buildMessages(
      Array.from({ length: 20 }, () => ({
        role: "user" as const,
        content: "Я".repeat(8000),
      })),
      "Я".repeat(3000),
      10,
      "ru",
    );
    assert.ok(
      messages.reduce(
        (n, m) => n + new TextEncoder().encode(m.content).length + 32,
        0,
      ) <= 5700,
    );
    assert.equal(
      buildChatBody("vendor/model:free", messages, 900).provider.max_price
        .prompt,
      0,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("concurrent Create with different external IDs cannot acknowledge wrong transaction", async () => {
  const f = await billingFixture();
  const o = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  const results = await Promise.all(
    ["first", "second"].map((id) =>
      f.rpc("CreateTransaction", {
        id,
        time: Date.now(),
        amount: 2000000,
        account: { order_id: o.id },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.result).length, 1);
  assert.equal(results.filter((r) => r.error?.code === -31008).length, 1);
});
test("failed D1 batch rolls back journal, payment and entitlement together", async () => {
  const f = await billingFixture();
  const o = await f.store.createOrder(
    f.user,
    "payme",
    "test",
    crypto.randomUUID(),
  );
  await f.store.transition(o.id, "prepared", "prepare");
  const broken = {
    prepare: f.binding.prepare.bind(f.binding),
    batch: (statements: D1PreparedStatement[]) =>
      f.binding.batch([
        ...statements,
        f.binding.prepare("INSERT INTO missing_table VALUES(1)"),
      ]),
  } as D1Database;
  await assert.rejects(() =>
    new BillingStore(broken, BILLING_ORG).transition(o.id, "paid", "perform"),
  );
  assert.equal((await f.store.order(o.id))?.state, "prepared");
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods"), 0);
  assert.equal(
    f.db.value(
      "SELECT COUNT(*) FROM gpt_payment_journal WHERE to_state='paid'",
    ),
    0,
  );
});
