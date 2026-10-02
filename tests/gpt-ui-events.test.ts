// The pack window's funnel counter (plan WP-17): POST /api/gpt/event and
// functions/lib/gpt-chat/ui-event-store.ts. Real SQLite through the billing
// fixture (tests/helpers/gpt-billing-fixture.ts): billing in test, so only a
// rehearsal session is offered a provider, and so only it reaches the counter.
//
// Run: node --import tsx --test tests/gpt-ui-events.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { onRequest as eventOther, onRequestPost as event } from "../functions/api/gpt/event";
import { BILLING_ORG, type BillingEnv } from "../functions/lib/gpt-chat/billing-config";
import { parseUiEvent, UI_EVENTS, UiEventStore, type UiEvent } from "../functions/lib/gpt-chat/ui-event-store";

const ORIGIN = "https://gpt.test";
const ENDPOINT = `${ORIGIN}/api/gpt/event`;
const COLUMNS = ["org_id", "id", "type", "view_id", "detail", "created_at"];

const fresh = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  type: "pack_viewed",
  detail: "limit_card",
  view: crypto.randomUUID(),
  ...over,
});

async function counter() {
  const f = await billingFixture();
  const send = (payload: unknown, headers: Record<string, string> = {}, env: BillingEnv = f.env) =>
    event({
      ...f.ctx(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { Origin: ORIGIN, "Content-Type": "application/json", cookie: f.rehearsal, ...headers },
          body: typeof payload === "string" ? payload : JSON.stringify(payload),
        }),
      ),
      env,
    } as unknown as Parameters<typeof event>[0]);
  const rows = () => f.db.rows<Record<string, unknown>>("SELECT * FROM gpt_ui_events ORDER BY created_at, id");
  return { f, send, rows };
}

test("a step of the pack window is one row: closed type and qualifier, the tab's id, the time — nothing a visitor typed", async () => {
  const { send, rows } = await counter();
  const step = fresh({ type: "checkout_started", detail: "uzum" });
  const before = Date.now();
  const response = await send({
    ...step,
    // Whatever else a page could send is neither read nor stored.
    text: "my secret question", message: "hello", ip: "203.0.113.7", orderId: `pay_${"a".repeat(32)}`, amount: 2_000_000,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const [row, ...more] = rows();
  assert.equal(more.length, 0);
  assert.deepEqual(Object.keys(row), COLUMNS);
  assert.deepEqual(
    { ...row, created_at: undefined },
    { org_id: BILLING_ORG, id: step.id, type: "checkout_started", view_id: step.view, detail: "uzum", created_at: undefined },
  );
  assert.ok(Number(row.created_at) >= before && Number(row.created_at) <= Date.now());
  assert.doesNotMatch(JSON.stringify(rows()), /secret|hello|203\.0\.113|pay_a|2000000/);
});

test("a resent event counts once (AGENTS §4): the id is the browser's, per event", async () => {
  const { send, rows } = await counter();
  const step = fresh();
  for (let i = 0; i < 3; i++) assert.equal((await send(step)).status, 200);
  assert.equal(rows().length, 1);
  assert.equal((await send({ ...step, id: crypto.randomUUID() })).status, 200, "the same step again is a new event");
  assert.equal(rows().length, 2);
  // Without a tab id the event still counts.
  assert.equal((await send({ ...fresh(), view: null })).status, 200);
  assert.equal(rows().at(-1)?.view_id, null);
});

test("every type with every qualifier of its closed list, and nothing outside them", async () => {
  const { send, rows } = await counter();
  let sent = 0;
  for (const [type, details] of Object.entries(UI_EVENTS))
    for (const detail of details) {
      assert.equal((await send(fresh({ type, detail }))).status, 200, `${type}/${detail}`);
      sent++;
    }
  assert.equal(rows().length, sent);
  for (const broken of [
    { type: "b2b_line_shown", detail: "bot" }, // WP-20 adds its own steps
    { type: "purchase", detail: "click" },
    { type: "pack_viewed", detail: "paid" },
    { type: "checkout_result", detail: "limit_card" },
    { type: "toString", detail: "x" },
    { detail: undefined },
    { id: "1" },
    { id: "pay_" + "a".repeat(32) },
    { view: "tab-1" },
    { view: 7 },
  ])
    assert.equal((await send(fresh(broken))).status, 400, JSON.stringify(broken));
  assert.equal((await send("{")).status, 400, "not JSON");
  assert.equal((await send(fresh({ pad: "x".repeat(2_000) }))).status, 400, "over 1 KB");
  assert.equal(rows().length, sent);
  assert.equal(parseUiEvent(null), null);
  assert.equal(parseUiEvent([fresh()]), null);
});

test("out of reach while no provider is offered: 404 before the body and D1; another origin 403; only POST", async () => {
  const { f, send, rows } = await counter();
  const bomb = { prepare() { throw new Error("DB touched"); }, batch() { throw new Error("DB touched"); } } as unknown as D1Database;
  // Billing in test: a visitor outside the rehearsal session is offered nothing.
  assert.equal((await send(fresh(), { cookie: f.cookie }, { ...f.env, GPTBOT_DRAFTS_DB: bomb })).status, 404);
  // Billing off, as in production after R4: nobody is.
  const off = { ...f.env, GPTBOT_DRAFTS_DB: bomb, GPT_BILLING_MODE: "", GPT_BILLING_MODE_CLICK: "", GPT_BILLING_MODE_UZUM: "" };
  assert.equal((await send(fresh(), {}, off)).status, 404);
  assert.equal((await send("not even JSON", {}, off)).status, 404, "the body is never read");
  for (const origin of ["https://evil.example", ""])
    assert.equal((await send(fresh(), { Origin: origin })).status, 403, origin || "no Origin");
  assert.equal((await eventOther({} as Parameters<typeof eventOther>[0])).status, 405);
  assert.equal(rows().length, 0);
});

test("60 events an hour per IP hash, then 429; another address is counted on its own", async () => {
  const { send, rows } = await counter();
  const ip = { "CF-Connecting-IP": "198.51.100.10" };
  for (let i = 0; i < 60; i++) assert.equal((await send(fresh(), ip)).status, 200, String(i));
  assert.equal((await send(fresh(), ip)).status, 429);
  assert.equal((await send(fresh(), { "CF-Connecting-IP": "198.51.100.11" })).status, 200);
  assert.equal(rows().length, 61);
});

test("org B does not see or deduplicate against org A (AGENTS §3)", async () => {
  const { f } = await counter();
  const a = new UiEventStore(f.binding, "org-a");
  const b = new UiEventStore(f.binding, "org-b");
  const step: UiEvent = { id: crypto.randomUUID(), type: "login_result", detail: "done", view: null };
  assert.equal(await a.record(step), true);
  assert.equal(await a.record(step), false, "a repeat in org A");
  assert.equal(await b.record(step), true, "the same id in org B is org B's own event");
  const count = (org: string) => Number(f.db.value("SELECT COUNT(*) FROM gpt_ui_events WHERE org_id=?", org));
  assert.deepEqual([count("org-a"), count("org-b"), count(BILLING_ORG)], [1, 1, 0]);
});
