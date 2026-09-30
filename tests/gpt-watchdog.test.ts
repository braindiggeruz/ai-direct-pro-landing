// D6: service alerts independent of the billing mode, the silence watchdog
// and the maintenance tick. Real SQLite (tests/helpers/sqlite-d1.ts) behind the
// billing fixture; only fetch (Telegram, OpenRouter) is faked.
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { BILLING_ORG } from "../functions/lib/gpt-chat/billing-config";
import {
  deliverServiceAlerts,
  maintainBilling,
  recordServiceAlert,
} from "../functions/lib/gpt-chat/billing-maintenance-store";
import {
  alertRowId,
  isUrgentAlert,
} from "../functions/lib/gpt-chat/alert-policy";
import {
  runWatchdog,
  watchdogCodes,
  watchdogConfig,
  WatchdogStore,
  type TurnStats,
} from "../functions/lib/gpt-chat/watchdog-store";
import { onRequestPost as chat } from "../functions/api/gpt/chat";
import { onRequestPost as maintenance } from "../functions/api/internal/gpt-billing-maintenance";

const MIN = 60_000;
const HOUR = 60 * MIN;
/** 2026-09-30 06:00 UTC: a fixed clock keeps hour and day buckets predictable. */
const T0 = Date.UTC(2026, 8, 30, 6, 0, 0);
const OTHER = "other-org";

type Fixture = Awaited<ReturnType<typeof billingFixture>>;
interface Sent {
  chat_id: number | string;
  text: string;
}

function notify(f: Fixture, extra: Record<string, string | undefined> = {}) {
  Object.assign(f.env, {
    GPT_NOTIFY_BOT_TOKEN: randomBytes(24).toString("hex"),
    GPT_NOTIFY_CHAT_ID: "424242",
    ...extra,
  });
}

/** Fake Telegram (and optionally OpenRouter); records every sendMessage body. */
function telegram(
  t: TestContext,
  options: { ok?: () => boolean; openrouter?: (url: string) => Response } = {},
) {
  const sent: Sent[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const host = new URL(url).host;
      if (host === "api.telegram.org") {
        const ok = options.ok ? options.ok() : true;
        if (ok) sent.push(JSON.parse(String(init?.body)) as Sent);
        return Response.json(
          ok
            ? { ok: true, result: { message_id: sent.length } }
            : { ok: false, error_code: 502, description: "synthetic" },
          { status: ok ? 200 : 502 },
        );
      }
      if (host === "openrouter.ai" && options.openrouter)
        return options.openrouter(url);
      throw new Error(`unexpected fetch ${host}`);
    },
  );
  return sent;
}

function turn(
  f: Fixture,
  status: "reserved" | "done" | "released",
  createdAt: number,
  options: { org?: string; expiresAt?: number } = {},
) {
  f.db
    .prepare(
      "INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at) VALUES(?,?,?,?,NULL,?,?,?)",
    )
    .bind(
      options.org ?? BILLING_ORG,
      randomUUID(),
      "synthetic-subject",
      "synthetic-ip",
      status,
      createdAt,
      options.expiresAt ?? createdAt + 120_000,
    )
    .runSync();
}

function session(f: Fixture, createdAt: number) {
  f.db
    .prepare("INSERT INTO gpt_sessions(id,locale,created_at) VALUES(?,'uz',?)")
    .bind(`sess_${randomUUID()}`, new Date(createdAt).toISOString())
    .runSync();
}

const alertCodes = (f: Fixture, org = BILLING_ORG) =>
  f.db
    .rows<{ code: string }>(
      "SELECT code FROM gpt_service_alerts WHERE org_id=? ORDER BY code",
      org,
    )
    .map((r) => r.code);

const stats = (over: Partial<TurnStats>): TurnStats => ({
  settled: 0,
  done: 0,
  reserved: 0,
  hourSettled: 0,
  hourDone: 0,
  hourStale: 0,
  ...over,
});

test("watchdog decisions: every check needs traffic and has an exact threshold", () => {
  const cfg = { windowMs: 180 * MIN, minTurns: 3 };
  const codes = (
    turns: Partial<TurnStats>,
    sessions = 0,
    truncation: { turns: number; truncated: number } | null = null,
  ) => watchdogCodes({ turns: stats(turns), sessions, truncation }, cfg);
  // A quiet night raises nothing.
  assert.deepEqual(codes({}), []);
  // Silence: at least MIN_TURNS settled turns, none answered.
  assert.deepEqual(codes({ settled: 2, reserved: 2 }), []);
  assert.deepEqual(codes({ settled: 3, reserved: 3 }), ["chat_silence"]);
  assert.deepEqual(codes({ settled: 9, done: 1, reserved: 9 }), []);
  // Degraded: 4+ settled in the hour and fewer than half answered; silence
  // already says more, so the two never fire together.
  assert.deepEqual(
    codes({ settled: 5, done: 2, reserved: 5, hourSettled: 5, hourDone: 2 }),
    ["chat_degraded"],
  );
  assert.deepEqual(
    codes({ settled: 4, done: 2, reserved: 4, hourSettled: 4, hourDone: 2 }),
    [],
  );
  assert.deepEqual(
    codes({ settled: 3, done: 1, reserved: 3, hourSettled: 3, hourDone: 1 }),
    [],
  );
  assert.deepEqual(
    codes({ settled: 4, reserved: 4, hourSettled: 4, hourDone: 0 }),
    ["chat_silence"],
  );
  // No turns: sessions open but nothing is ever reserved.
  assert.deepEqual(codes({}, 3), ["chat_no_turns"]);
  assert.deepEqual(codes({}, 2), []);
  assert.deepEqual(codes({ reserved: 1 }, 5), []);
  // Stale: more than three expired-but-reserved turns in the hour.
  assert.deepEqual(
    codes({ settled: 3, done: 3, reserved: 3, hourSettled: 3, hourDone: 3, hourStale: 3 }),
    [],
  );
  assert.deepEqual(
    codes({ settled: 8, done: 4, reserved: 8, hourSettled: 8, hourDone: 4, hourStale: 4 }),
    ["stale_reservations"],
  );
  // Truncation: > 15 % of at least 20 turns with an outcome; absent column → skipped.
  const busy = { settled: 30, done: 30, reserved: 30 };
  assert.deepEqual(codes(busy, 0, { turns: 20, truncated: 4 }), ["chat_truncation_high"]);
  assert.deepEqual(codes(busy, 0, { turns: 20, truncated: 3 }), []);
  assert.deepEqual(codes(busy, 0, { turns: 19, truncated: 19 }), []);
  assert.deepEqual(codes(busy, 0, null), []);
  // Config: defaults, clamps and garbage.
  assert.deepEqual(watchdogConfig({}), { windowMs: 180 * MIN, minTurns: 3 });
  assert.deepEqual(
    watchdogConfig({ GPT_WATCHDOG_WINDOW_MINUTES: "5", GPT_WATCHDOG_MIN_TURNS: "0" }),
    { windowMs: 60 * MIN, minTurns: 1 },
  );
  assert.deepEqual(
    watchdogConfig({ GPT_WATCHDOG_WINDOW_MINUTES: "99999", GPT_WATCHDOG_MIN_TURNS: "x" }),
    { windowMs: 1440 * MIN, minTurns: 3 },
  );
});

test("watchdog store counts only its own org's turns inside the window; org B never sees org A", async () => {
  const f = await billingFixture();
  const now = T0;
  // Outside the 180-minute window.
  turn(f, "done", now - 181 * MIN);
  // In the window, before the last hour.
  turn(f, "done", now - 2 * HOUR);
  turn(f, "released", now - 2 * HOUR);
  turn(f, "released", now - 2 * HOUR);
  // The last hour: one answer, two failures, four stale, one still in flight.
  turn(f, "done", now - 30 * MIN);
  turn(f, "released", now - 30 * MIN);
  turn(f, "released", now - 20 * MIN);
  for (let i = 0; i < 4; i++) turn(f, "reserved", now - 10 * MIN);
  turn(f, "reserved", now - MIN, { expiresAt: now + MIN });
  // Another tenant's failures in the same hour.
  for (let i = 0; i < 10; i++)
    turn(f, "released", now - 5 * MIN, { org: OTHER });
  session(f, now - 200 * MIN);
  session(f, now - 100 * MIN);
  session(f, now - MIN);

  const mine = new WatchdogStore(f.binding, BILLING_ORG);
  assert.deepEqual(await mine.turns(now, 180 * MIN), {
    settled: 10,
    done: 2,
    reserved: 11,
    hourSettled: 7,
    hourDone: 1,
    hourStale: 4,
  });
  assert.equal(await mine.sessions(now - 180 * MIN), 2);
  const theirs = new WatchdogStore(f.binding, OTHER);
  assert.deepEqual(await theirs.turns(now, 180 * MIN), {
    settled: 10,
    done: 0,
    reserved: 10,
    hourSettled: 10,
    hourDone: 0,
    hourStale: 0,
  });
  // gpt_sessions has no org_id: only the consumer chat's org reads it.
  assert.equal(await theirs.sessions(now - 180 * MIN), 0);

  // Before migrations/0066 there is no outcome column: the check is skipped.
  assert.equal(await mine.truncation(now), null);
  f.db.exec("ALTER TABLE gpt_turn_reservations ADD COLUMN outcome TEXT");
  f.db.exec(`UPDATE gpt_turn_reservations SET outcome='answered' WHERE status='done'`);
  f.db.exec(`UPDATE gpt_turn_reservations SET outcome='truncated' WHERE status='released' AND org_id='${BILLING_ORG}'`);
  assert.deepEqual(await mine.truncation(now), { turns: 7, truncated: 4 });
  assert.deepEqual(await theirs.truncation(now), { turns: 0, truncated: 0 });
});

test("runWatchdog takes a 10-minute lease per org and records what it raises", async () => {
  const f = await billingFixture();
  // Org B holds its own lease and has failures of its own: neither matters.
  f.db
    .prepare("INSERT INTO gpt_billing_ops VALUES(?,?,?)")
    .bind(OTHER, "watchdog", T0 + 24 * HOUR)
    .runSync();
  for (let i = 0; i < 5; i++)
    turn(f, "released", T0 - 5 * MIN, { org: OTHER });
  assert.deepEqual(await runWatchdog(f.env, T0), { ran: true, raised: [] });
  assert.deepEqual(alertCodes(f), []);

  for (let i = 0; i < 3; i++) turn(f, "released", T0 + MIN);
  // Inside the lease nothing runs, even with a silence to find.
  assert.deepEqual(await runWatchdog(f.env, T0 + 10 * MIN - 1), { ran: false, raised: [] });
  assert.deepEqual(await runWatchdog(f.env, T0 + 10 * MIN), {
    ran: true,
    raised: ["chat_silence"],
  });
  assert.deepEqual(alertCodes(f), ["chat_silence"]);
  assert.deepEqual(alertCodes(f, OTHER), []);
  // The same silence an hour later is a new row; within the hour it is not.
  await runWatchdog(f.env, T0 + 20 * MIN);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_service_alerts"), 1);
  assert.equal(
    f.db.value("SELECT next_at FROM gpt_billing_ops WHERE org_id=? AND task='watchdog'", BILLING_ORG),
    T0 + 30 * MIN,
  );
});

test("urgent alerts reach the owner in test mode and with no billing mode at all", async (t) => {
  for (const mode of ["test", undefined]) {
    const f = await billingFixture();
    f.env.GPT_BILLING_MODE = mode;
    notify(f);
    const sent = telegram(t);
    await recordServiceAlert(f.env, "chat_silence", T0);
    assert.deepEqual(await deliverServiceAlerts(f.env, T0), {
      status: "sent",
      codes: ["chat_silence"],
    });
    assert.equal(sent.length, 1, `mode ${mode}`);
    assert.equal(sent[0].chat_id, 424242);
    assert.match(sent[0].text, /^GPTBot\.uz AI-чат: срочно\n• chat_silence — /);
    assert.ok(!sent[0].text.includes(f.env.GPT_NOTIFY_BOT_TOKEN!));
    assert.equal(
      f.db.value("SELECT delivered_at FROM gpt_service_alerts WHERE code='chat_silence'"),
      T0,
    );
    // Delivered once: the next caller finds nothing.
    assert.deepEqual(await deliverServiceAlerts(f.env, T0 + MIN), { status: "idle", codes: [] });
    // The payment outbox stays live-only whatever happens to alerts.
    assert.deepEqual(await maintainBilling(f.env, T0), { delivered: 0, configured: false });
    t.mock.restoreAll();
  }
});

test("only urgent codes page; background codes ride along and stay undelivered", async (t) => {
  for (const code of [
    "chat_no_key",
    "chat_account_unavailable",
    "chat_model_unavailable",
    "catalogue_model_unavailable",
    "catalogue_check_failed",
    "openrouter_free_tier_50rpd",
    "chat_silence",
    "chat_degraded",
    "chat_no_turns",
    "zai_balance_exhausted",
    "bot_silent",
    "click_processing",
    "uzum_amount_mismatch",
    "drill",
  ])
    assert.equal(isUrgentAlert(code), true, code);
  for (const code of [
    "chat_rate_limit",
    "chat_timeout",
    "chat_provider_error",
    "chat_empty",
    "chat_budget_exhausted",
    "stale_reservations",
    "chat_truncation_high",
    "openrouter_key_unavailable",
    "payme_processing",
    "catalogue",
    "chat_silence_x",
  ])
    assert.equal(isUrgentAlert(code), false, code);
  // State alerts are daily, everything else hourly.
  assert.equal(alertRowId("openrouter_free_tier_50rpd", T0), `openrouter_free_tier_50rpd:d${Math.floor(T0 / 86_400_000)}`);
  assert.equal(alertRowId("chat_silence", T0), `chat_silence:${Math.floor(T0 / HOUR)}`);

  const f = await billingFixture();
  notify(f);
  const sent = telegram(t);
  await recordServiceAlert(f.env, "chat_timeout", T0);
  await recordServiceAlert(f.env, "chat_rate_limit", T0);
  // Yesterday's background noise is not "the last hour".
  await recordServiceAlert(f.env, "chat_empty", T0 - 2 * HOUR);
  assert.deepEqual(await deliverServiceAlerts(f.env, T0), { status: "idle", codes: [] });
  assert.equal(sent.length, 0);

  await recordServiceAlert(f.env, "catalogue_model_unavailable", T0 - HOUR);
  await recordServiceAlert(f.env, "catalogue_model_unavailable", T0);
  await recordServiceAlert(f.env, "chat_degraded", T0);
  assert.deepEqual(await deliverServiceAlerts(f.env, T0 + MIN), {
    status: "sent",
    codes: ["catalogue_model_unavailable", "chat_degraded"],
  });
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].text,
    [
      "GPTBot.uz AI-чат: срочно",
      "• catalogue_model_unavailable ×2 — модель цепочки пропала из OpenRouter или вышла за потолок цены; она выключена на час",
      "• chat_degraded — за час ответ получили меньше половины ходов",
      "Фон за час: chat_rate_limit, chat_timeout",
      "Проверьте Workers logs, модели и баланс OpenRouter.",
    ].join("\n"),
  );
  assert.equal(
    f.db.value("SELECT COUNT(*) FROM gpt_service_alerts WHERE delivered_at IS NULL"),
    3,
    "background rows are never marked delivered",
  );
});

test("the hourly ceiling holds a batch until the window rolls over; one claim per batch", async (t) => {
  const f = await billingFixture();
  notify(f, { GPT_ALERTS_MAX_PER_HOUR: "2" });
  const sent = telegram(t);
  const hour = Math.floor(T0 / HOUR) * HOUR;
  await recordServiceAlert(f.env, "chat_silence", hour + MIN);
  // Two callers at once (the cron and a failing turn): one message.
  const [a, b] = await Promise.all([
    deliverServiceAlerts(f.env, hour + MIN),
    deliverServiceAlerts(f.env, hour + MIN),
  ]);
  assert.deepEqual([a.status, b.status].sort(), ["idle", "sent"]);
  await recordServiceAlert(f.env, "chat_no_key", hour + 2 * MIN);
  assert.equal((await deliverServiceAlerts(f.env, hour + 2 * MIN)).status, "sent");
  await recordServiceAlert(f.env, "drill", hour + 3 * MIN);
  assert.deepEqual(await deliverServiceAlerts(f.env, hour + 3 * MIN), {
    status: "capped",
    codes: ["drill"],
  });
  assert.equal(sent.length, 2);
  // Held until the next window: retries inside the hour claim nothing.
  assert.equal(
    f.db.value("SELECT lease_until FROM gpt_service_alerts WHERE code='drill'"),
    hour + HOUR,
  );
  assert.deepEqual(await deliverServiceAlerts(f.env, hour + 30 * MIN), { status: "idle", codes: [] });
  assert.deepEqual(await deliverServiceAlerts(f.env, hour + HOUR), {
    status: "sent",
    codes: ["drill"],
  });
  assert.equal(sent.length, 3);
  assert.match(sent[2].text, /• drill — учебный алерт/);
});

test("a failed send is retried after the lease; the switch and a missing channel send nothing", async (t) => {
  const f = await billingFixture();
  notify(f);
  let up = false;
  const sent = telegram(t, { ok: () => up });
  t.mock.method(console, "error", () => undefined);
  await recordServiceAlert(f.env, "zai_auth_failed", T0);
  assert.equal((await deliverServiceAlerts(f.env, T0)).status, "failed");
  assert.equal((await deliverServiceAlerts(f.env, T0 + 4 * MIN)).status, "idle");
  up = true;
  assert.equal((await deliverServiceAlerts(f.env, T0 + 5 * MIN)).status, "sent");
  assert.equal(sent.length, 1);

  await recordServiceAlert(f.env, "chat_no_key", T0 + 6 * MIN);
  f.env.GPT_ALERTS_ENABLED = "false";
  assert.deepEqual(await deliverServiceAlerts(f.env, T0 + 6 * MIN), { status: "disabled", codes: [] });
  f.env.GPT_ALERTS_ENABLED = "true";
  f.env.GPT_NOTIFY_BOT_TOKEN = undefined;
  assert.deepEqual(await deliverServiceAlerts(f.env, T0 + 6 * MIN), { status: "unconfigured", codes: [] });
  assert.equal(sent.length, 1);
  // The assistant-bot pair is the fallback channel.
  Object.assign(f.env, {
    TELEGRAM_ASSISTANT_BOT_TOKEN: randomBytes(24).toString("hex"),
    GPT_NOTIFY_CHAT_ID: undefined,
    TELEGRAM_ADMIN_CHAT_ID: "-1001234567",
  });
  assert.equal((await deliverServiceAlerts(f.env, T0 + 6 * MIN)).status, "sent");
  assert.equal(sent[1].chat_id, -1001234567);
  assert.match(sent[1].text, /chat_no_key/);
});

test("stale undelivered alerts are not paged; retention removes old rows delivered or not", async (t) => {
  const f = await billingFixture();
  notify(f);
  const sent = telegram(t);
  await recordServiceAlert(f.env, "chat_silence", T0 - 25 * HOUR);
  assert.deepEqual(await deliverServiceAlerts(f.env, T0), { status: "idle", codes: [] });
  assert.equal(sent.length, 0);

  const old = T0 - 94 * 24 * HOUR;
  await recordServiceAlert(f.env, "chat_timeout", old);
  await recordServiceAlert(f.env, "drill", old + HOUR);
  f.db.exec(`UPDATE gpt_service_alerts SET delivered_at=${old + HOUR} WHERE code='drill'`);
  f.db
    .prepare("INSERT INTO gpt_service_alerts(org_id,id,code,created_at) VALUES(?,?,?,?)")
    .bind(OTHER, "other-old", "chat_timeout", old)
    .runSync();
  await maintainBilling(f.env, T0);
  assert.deepEqual(alertCodes(f), ["chat_silence"]);
  assert.deepEqual(alertCodes(f, OTHER), ["chat_timeout"]);
});

test("a failed chat turn runs the watchdog and pages the owner itself, with no retention sweep", async (t) => {
  const f = await billingFixture();
  notify(f, { OPENROUTER_API_KEY: randomBytes(24).toString("hex") });
  let openrouterCalls = 0;
  const sent = telegram(t, {
    openrouter: () => {
      openrouterCalls++;
      return Response.json({ error: { message: "synthetic" } }, { status: 500 });
    },
  });
  t.mock.method(console, "warn", () => undefined);
  const now = Date.now();
  // Two earlier turns failed; this one is the third.
  turn(f, "released", now - 20 * MIN);
  turn(f, "released", now - 10 * MIN);
  // An expired login challenge: only the maintenance cron may sweep it.
  await f.identity.challenge(randomBytes(32).toString("hex"), "verifier", "uz", now - 700_000);
  const request = new Request("https://gpt.test/api/gpt/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify({ message: "Salom", locale: "uz" }),
  });
  const response = await chat(f.ctx(request) as never);
  const body = (await response.json()) as { ok: boolean; code: string };
  for (let i = 0; i < f.background.length; i++) await f.background[i];
  assert.deepEqual([body.ok, body.code], [false, "provider_error"]);
  assert.ok(openrouterCalls > 0);
  assert.deepEqual(alertCodes(f), ["chat_provider_error", "chat_silence"]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /• chat_silence — /);
  assert.match(sent[0].text, /Фон за час: chat_provider_error/);
  assert.equal(
    f.db.value("SELECT COUNT(*) FROM gpt_auth_challenges WHERE org_id=?", BILLING_ORG),
    1,
  );
});

function tick(f: Fixture, secret: string, body?: string, auth = `Bearer ${secret}`) {
  const request = new Request("https://gptbot.uz/api/internal/gpt-billing-maintenance", {
    method: "POST",
    headers: { Authorization: auth },
    ...(body === undefined ? {} : { body }),
  });
  return maintenance(f.ctx(request) as never);
}

test("the maintenance tick: bearer only, a drill delivers end to end, one broken step never stops the rest", async (t) => {
  const f = await billingFixture();
  const secret = randomBytes(32).toString("hex");
  notify(f, { GPT_BILLING_MAINTENANCE_SECRET: secret });
  const endpoints: string[] = [];
  const sent = telegram(t, {
    openrouter: (url) => {
      endpoints.push(url);
      return Response.json({
        data: { endpoints: [{ pricing: { prompt: "0", completion: "0" } }] },
      });
    },
  });
  t.mock.method(console, "warn", () => undefined);

  assert.equal((await tick(f, secret, undefined, "Bearer wrong")).status, 403);
  assert.equal((await tick(f, secret, undefined, "")).status, 403);
  assert.equal((await tick(f, secret, "{not json")).status, 400);
  assert.equal(sent.length + endpoints.length, 0);

  // The cron's own call carries no body.
  const first = await tick(f, secret);
  const plain = (await first.json()) as Record<string, unknown>;
  assert.equal(first.status, 200);
  assert.equal(plain.ok, true);
  assert.deepEqual(plain.failed, []);
  assert.deepEqual(plain.watchdog, { ran: true, raised: [] });
  assert.deepEqual(plain.alerts, { status: "idle", codes: [] });
  assert.equal((plain.providers as { ran: boolean }).ran, true);
  assert.ok(endpoints.length > 0 && endpoints.every((u) => u.endsWith("/endpoints")));
  assert.ok("outbox" in plain && "blockedModels" in plain);

  const drill = (await (await tick(f, secret, JSON.stringify({ drill: true }))).json()) as Record<string, unknown>;
  assert.deepEqual(drill.alerts, { status: "sent", codes: ["drill"] });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /• drill — учебный алерт: канал доставки работает/);
  // One drill an hour: the row id is drill:<hour>.
  const again = (await (await tick(f, secret, JSON.stringify({ drill: true }))).json()) as Record<string, unknown>;
  assert.deepEqual(again.alerts, { status: "idle", codes: [] });
  assert.equal(sent.length, 1);

  // A broken retention table fails "maintenance"; alerts before it and the
  // diagnostics after it still run, and the Worker sees a 503.
  f.db.exec("DROP TABLE gpt_model_attempts");
  await recordServiceAlert(f.env, "chat_no_key");
  const broken = await tick(f, secret);
  const result = (await broken.json()) as Record<string, unknown>;
  assert.equal(broken.status, 503);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, ["maintenance"]);
  assert.deepEqual(result.alerts, { status: "sent", codes: ["chat_no_key"] });
  assert.ok(Array.isArray(result.blockedModels));
  assert.equal(sent.length, 2);
});

test("a step that hangs is cut at its budget and the tick goes on", async (t) => {
  const f = await billingFixture();
  const secret = randomBytes(32).toString("hex");
  notify(f, { GPT_BILLING_MAINTENANCE_SECRET: secret });
  // OpenRouter never answers and ignores the abort signal.
  t.mock.method(globalThis, "fetch", (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).host === "openrouter.ai") return new Promise<Response>(() => undefined);
    throw new Error(`unexpected fetch ${url}`);
  });
  t.mock.method(console, "warn", () => undefined);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = tick(f, secret);
  // Let the request reach the first step, then let its 6 s budget run out.
  for (let i = 0; i < 50; i++) await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(6_000);
  const response = await pending;
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 503);
  assert.deepEqual(body.failed, ["providers"]);
  assert.deepEqual(body.watchdog, { ran: true, raised: [] });
  assert.deepEqual(body.alerts, { status: "idle", codes: [] });
});
