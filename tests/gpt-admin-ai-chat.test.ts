// The admin section «AI-чат» (paid-chat plan WP-19, D10; map 05 §2.8): owner
// only, Tashkent weeks, nothing private in any answer, org isolation, the
// keyset of the payments list, NS-1, readiness by name only, schema_pending,
// the Seller's refund record and the rehearsal session, and the page itself.
// Real SQLite (helpers/sqlite-d1.ts), fixed or relative clocks, no network.
// Run: node --import tsx --test tests/gpt-admin-ai-chat.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { billingFixture } from "./helpers/gpt-billing-fixture";
import { uzumFixture } from "./helpers/uzum-fixture";
import { SqliteD1 } from "./helpers/sqlite-d1";
import { signToken } from "../functions/lib/jwt";
import {
  onRequestGet as overview,
  onRequestPost as overviewPost,
} from "../functions/api/admin/ai-chat/overview";
import { onRequestGet as payments } from "../functions/api/admin/ai-chat/payments";
import { onRequestGet as visitors } from "../functions/api/admin/ai-chat/visitors";
import {
  onRequestGet as refundRecordGet,
  onRequestPost as refundRecord,
} from "../functions/api/admin/ai-chat/refund-record";
import { onRequestPost as rehearsalSession } from "../functions/api/admin/ai-chat/rehearsal-session";
import { onRequestPost as clickRefundRecord } from "../functions/api/internal/gpt-click-refund-record";
import { AiChatAdminStore } from "../functions/lib/gpt-chat/admin-store";
import {
  BILLING_ORG,
  liveReadiness,
  offeredProviders,
  type BillingEnv,
} from "../functions/lib/gpt-chat/billing-config";
import { ensureSchema } from "../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../functions/lib/gpt-chat/billing-schema";
import { rehearsalActive, REHEARSAL_COOKIE } from "../functions/lib/gpt-chat/rehearsal";
import { UzumStore } from "../functions/lib/gpt-chat/uzum-store";
import {
  tashkentWeekStart,
  type AiChatOverview,
  type AiChatPaymentRow,
  type AiChatSection,
  type AiChatVisitorRow,
} from "../src/shared/ai-chat-admin";
import { REQUIRED_FEATURES } from "../scripts/release/pages-production";
import { Sidebar } from "../src/admin/components/Sidebar.tsx";
import { AiChatView, type AiChatViewProps } from "../src/admin/components/ai-chat/AiChatView.tsx";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");
/**
 * The HS256 signing input of the tokens this file mints and verifies, in one
 * in-memory process. Not a credential, and named so (scan-secrets).
 */
const TEST_SIGNING_INPUT = "ai-chat-admin-test";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const API = "/api/admin/ai-chat";

async function tokensFor(env: BillingEnv) {
  return {
    owner: await signToken(env, { email: "owner@example.invalid", role: "platform_owner" }),
    admin: await signToken(env, { email: "owner@example.invalid", role: "admin" }),
    support: await signToken(env, { email: "support@example.invalid", role: "support_readonly" }),
  };
}

/** The chat's fixture with a salt and an admin signing input. */
async function adminFixture(extra: Partial<BillingEnv> = {}) {
  const f = await billingFixture();
  Object.assign(f.env, {
    JWT_SECRET: TEST_SIGNING_INPUT,
    GPT_HASH_SALT: hex(32),
    GPT_HASH_SALT_SINCE: "2026-09-01T00:00:00Z",
    ...extra,
  });
  return { ...f, tokens: await tokensFor(f.env) };
}

interface Answer {
  status: number;
  headers: Headers;
  text: string;
  body: Record<string, unknown> & { error?: string };
}

async function call(
  handler: unknown,
  env: BillingEnv,
  url: string,
  options: { token?: string; body?: unknown; method?: string } = {},
): Promise<Answer> {
  const background: Promise<unknown>[] = [];
  const request = new Request(`https://gptbot.uz${url}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = await (handler as (ctx: unknown) => Promise<Response>)({
    request,
    env,
    params: {},
    waitUntil: (task: Promise<unknown>) => background.push(task),
  });
  await Promise.allSettled(background);
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: text ? JSON.parse(text) : {} };
}

/** No test may reach the network: every fetch is refused and counted. */
function noNetwork(): { calls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    throw new TypeError("no network in this test");
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

interface TurnSeed {
  org?: string;
  ip: string;
  subject?: string;
  at: number;
  status?: "done" | "released" | "reserved";
  outcome?: string | null;
  model?: string | null;
  period?: string | null;
  ttft?: number | null;
  cost?: number | null;
}

function addTurn(db: SqliteD1, t: TurnSeed): void {
  const status = t.status ?? "done";
  db.prepare(
    `INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,period_id,status,created_at,expires_at,outcome,charged,model,ttft_ms,cost_micro_usd)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      t.org ?? BILLING_ORG,
      randomUUID(),
      t.subject ?? t.ip,
      t.ip,
      t.period ?? null,
      status,
      t.at,
      t.at + 120_000,
      t.outcome === undefined ? (status === "done" ? "answered" : null) : t.outcome,
      status === "done" ? 1 : 0,
      t.model ?? null,
      t.ttft ?? null,
      t.cost ?? null,
    )
    .runSync();
}

function addSession(db: SqliteD1, s: { id?: string; ip: string; locale: string; at: number }): void {
  const iso = new Date(s.at).toISOString();
  db.prepare(
    "INSERT INTO gpt_sessions(id,hashed_ip,locale,source,created_at,last_activity_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(s.id ?? randomUUID(), s.ip, s.locale, "gpt_chat", iso, iso)
    .runSync();
}

interface OrderSeed {
  table?: "gpt_payment_orders" | "gpt_uzum_orders";
  org?: string;
  id?: string;
  user?: string;
  provider?: "click" | "uzum" | "payme";
  mode?: "test" | "live";
  state?: string;
  at: number;
}

function addOrder(db: SqliteD1, o: OrderSeed): string {
  const uzum = o.table === "gpt_uzum_orders";
  const id = o.id ?? `${uzum ? "uzm" : "pay"}_${hex(16)}`;
  const state = o.state ?? "cancelled";
  db.prepare(
    `INSERT INTO ${uzum ? "gpt_uzum_orders" : "gpt_payment_orders"}
     (org_id,id,user_id,provider,mode,request_id,amount,currency,state,created_at,expires_at,perform_time)
     VALUES(?,?,?,?,?,?,2000000,'UZS',?,?,?,?)`,
  )
    .bind(
      o.org ?? BILLING_ORG,
      id,
      o.user ?? `acct_${hex(16)}`,
      o.provider ?? (uzum ? "uzum" : "click"),
      o.mode ?? "live",
      randomUUID(),
      state,
      o.at,
      o.at + 12 * HOUR,
      state === "paid" || state === "refunded" ? o.at + 60_000 : 0,
    )
    .runSync();
  return id;
}

/** Every key at any depth of a JSON value. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, out);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      out.add(key);
      keysOf(item, out);
    }
  return out;
}

test("1. owner only: no token 401, support_readonly 403 on every route, admin and platform_owner 200, a wrong method 405", async () => {
  const f = await adminFixture();
  const reads = [
    [overview, `${API}/overview`],
    [payments, `${API}/payments`],
    [visitors, `${API}/visitors`],
  ] as const;
  for (const [handler, url] of reads) {
    const anonymous = await call(handler, f.env, url);
    assert.deepEqual([anonymous.status, anonymous.body.error], [401, "missing_token"], url);
    const support = await call(handler, f.env, url, { token: f.tokens.support });
    assert.deepEqual([support.status, support.body.error], [403, "insufficient_role"], url);
    assert.equal((await call(handler, f.env, url, { token: f.tokens.admin })).status, 200, url);
    const owner = await call(handler, f.env, url, { token: f.tokens.owner });
    assert.equal(owner.status, 200, url);
    assert.equal(owner.headers.get("cache-control"), "no-store");
    assert.match(owner.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.match(String(owner.body.request_id), /^req_[0-9a-f]{32}$/);
  }
  const actions = [
    [refundRecord, `${API}/refund-record`, { orderId: `pay_${hex(16)}`, merchantRefundReference: "r-1", confirmedRefund: true }],
    [rehearsalSession, `${API}/rehearsal-session`, { account: false }],
  ] as const;
  for (const [handler, url, body] of actions) {
    assert.equal((await call(handler, f.env, url, { body })).status, 401, url);
    const support = await call(handler, f.env, url, { token: f.tokens.support, body });
    assert.deepEqual([support.status, support.body.error], [403, "insufficient_role"], url);
  }
  const post = await call(overviewPost, f.env, `${API}/overview`, { token: f.tokens.owner, body: {} });
  assert.deepEqual([post.status, post.headers.get("allow")], [405, "GET"]);
  const get = await call(refundRecordGet, f.env, `${API}/refund-record`, { token: f.tokens.owner });
  assert.deepEqual([get.status, get.headers.get("allow")], [405, "POST"]);
  // Closed query parameters: anything else is a 400 before D1.
  for (const [handler, url] of [
    [overview, `${API}/overview?weeks=13`],
    [overview, `${API}/overview?weeks=x`],
    [payments, `${API}/payments?provider=paypal`],
    [payments, `${API}/payments?state=lost`],
    [payments, `${API}/payments?cursor=1.click.nope`],
    [visitors, `${API}/visitors?days=31`],
  ] as const) {
    const bad = await call(handler, f.env, url, { token: f.tokens.owner });
    assert.deepEqual([bad.status, bad.body.error], [400, "invalid_query"], url);
  }
});

test("2. a week starts on Monday 00:00 in Tashkent: Sunday 19:30Z is the next week; a metric not written yet is null", async () => {
  const f = await adminFixture();
  const now = Date.parse("2026-10-03T10:00:00Z");
  assert.equal(new Date(tashkentWeekStart(now)).toISOString(), "2026-09-27T19:00:00.000Z");
  addTurn(f.db, { ip: "h2_a", at: Date.parse("2026-09-27T19:30:00Z") }); // Mon 28.09 00:30 Tashkent
  addTurn(f.db, { ip: "h2_b", at: Date.parse("2026-09-27T18:30:00Z") }); // Sun 27.09 23:30 Tashkent
  // Settled before migrations/0066: no outcome.
  addTurn(f.db, { ip: "h2_c", at: Date.parse("2026-09-21T10:00:00Z"), status: "released", outcome: null });
  addSession(f.db, { ip: "h2_a", locale: "uz", at: Date.parse("2026-09-27T19:30:00Z") });
  addSession(f.db, { ip: "h2_b", locale: "ru", at: Date.parse("2026-09-27T18:30:00Z") });
  f.db.prepare("INSERT INTO gpt_limit_hits(org_id,day,reason,tier,subject,n,first_at) VALUES(?,?,?,?,?,?,?)")
    .bind(BILLING_ORG, "2026-09-29", "daily", "free", "h2_a", 3, Date.parse("2026-09-29T08:00:00Z"))
    .runSync();
  f.db.prepare("INSERT INTO gpt_ui_events(org_id,id,type,view_id,detail,created_at) VALUES(?,?,?,?,?,?)")
    .bind(BILLING_ORG, randomUUID(), "pack_viewed", null, "limit_card", Date.parse("2026-09-30T08:00:00Z"))
    .runSync();
  // The business line (WP-20) counts in the same table, whatever billing does:
  // it neither starts the pack window's funnel nor counts in it.
  f.db.prepare("INSERT INTO gpt_ui_events(org_id,id,type,view_id,detail,created_at) VALUES(?,?,?,?,?,?)")
    .bind(BILLING_ORG, randomUUID(), "b2b_line_shown", null, "bot", Date.parse("2026-09-22T08:00:00Z"))
    .runSync();
  const { weeks } = await new AiChatAdminStore(f.binding).overview(BILLING_ORG, { now, weeks: 8, capUsd: 1 });
  assert.ok(weeks.ok);
  const byWeek = new Map(weeks.data.map((week) => [week.week, week]));
  assert.deepEqual([...byWeek.keys()], [
    "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31",
    "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
  ]);
  const current = byWeek.get("2026-09-28")!;
  const previous = byWeek.get("2026-09-21")!;
  const empty = byWeek.get("2026-09-14")!;
  assert.deepEqual([current.turns, previous.turns, empty.turns], [1, 2, 0]);
  assert.deepEqual(current.sessions, { ru: 0, uz: 1, other: 0 });
  assert.deepEqual(previous.sessions, { ru: 1, uz: 0, other: 0 });
  assert.deepEqual(current.outcomes, { answered: 1, truncated: 0, stopped: 0, failed: 0, refused: 0 });
  assert.deepEqual(current.limitHits, { daily: 3 });
  assert.deepEqual(previous.limitHits, {});
  // Never a calm zero: no outcome and no counted hit that week means «not written».
  assert.equal(empty.outcomes, null);
  assert.equal(empty.limitHits, null);
  // The funnel exists from its first event on.
  assert.deepEqual(current.funnel, { packViewed: 1, loginStarted: 0, loginDone: 0, checkoutStarted: 0, checkoutPaid: 0 });
  assert.equal(previous.funnel, null);
  assert.deepEqual(current.orders, { created: 0, paid: 0, refunded: 0 });
});

test("3. privacy: no message, contact, IP hash, subject, session or account id reaches any answer; the store names no text column", async () => {
  const f = await adminFixture();
  const guard = noNetwork();
  try {
    const now = Date.now();
    const mark = {
      content: `MSGMARK${hex(8)}`,
      contact: `CONTACTMARK${hex(8)}`,
      phone: `PHONEMARK${hex(8)}`,
      ip: `h2_IPMARK${hex(8)}`,
      subject: `acct_SUBMARK${hex(8)}`,
      session: `SESSMARK${hex(8)}`,
      user: `acct_USERMARK${hex(8)}`,
    };
    addSession(f.db, { id: mark.session, ip: mark.ip, locale: "ru", at: now - HOUR });
    f.db.prepare(
      "INSERT INTO gpt_messages(id,session_id,role,content,model_used,token_in,token_out,cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).bind(randomUUID(), mark.session, "user", mark.content, null, 10, 900, 0, new Date(now - HOUR).toISOString()).runSync();
    f.db.prepare(
      "INSERT INTO gpt_leads(id,request_id,session_id,contact_type,contact_value,name,phone,telegram,intent,source,page_url,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(randomUUID(), randomUUID(), mark.session, "phone", mark.contact, "Name", mark.phone, "@tgmark", "b2b", "gpt_chat", null, new Date(now - HOUR).toISOString()).runSync();
    addTurn(f.db, { ip: mark.ip, at: now - 2 * HOUR, model: "nvidia/model:free", ttft: 800, cost: 0 });
    addTurn(f.db, { ip: mark.ip, subject: mark.subject, at: now - HOUR, model: "nvidia/model:free" });
    f.db.prepare("INSERT INTO gpt_limit_hits(org_id,day,reason,tier,subject,n,first_at) VALUES(?,?,?,?,?,?,?)")
      .bind(BILLING_ORG, new Date(now).toISOString().slice(0, 10), "hourly", "free", mark.ip, 2, now - HOUR)
      .runSync();
    addOrder(f.db, { user: mark.user, state: "paid", at: now - HOUR });
    const answers = await Promise.all([
      call(overview, f.env, `${API}/overview`, { token: f.tokens.owner }),
      call(payments, f.env, `${API}/payments`, { token: f.tokens.owner }),
      call(visitors, f.env, `${API}/visitors`, { token: f.tokens.owner }),
    ]);
    for (const answer of answers) {
      assert.equal(answer.status, 200);
      for (const value of Object.values(mark)) assert.ok(!answer.text.includes(value), `${value} leaked`);
      assert.ok(!answer.text.includes("@tgmark"));
      for (const key of keysOf(answer.body))
        assert.doesNotMatch(key, /^(ip|ip_hash|hashed_ip|content|telegram|phone|subject|user_id|session_id|contact.*)$/i);
    }
    const [, list, groups] = answers;
    const row = (list.body.payments as { data: { rows: AiChatPaymentRow[] } }).data.rows[0];
    assert.match(String(row.buyer), /^B-[A-Z2-7]{8}$/);
    const group = (groups.body.visitors as { data: AiChatVisitorRow[] }).data[0];
    assert.match(group.alias, /^N-[A-Z2-7]{8}$/);
    assert.deepEqual(
      { turns: group.turns, answered: group.answered, limitHits: group.limitHits, account: group.account, locale: group.locale },
      { turns: 2, answered: 2, limitHits: 2, account: true, locale: "ru" },
    );
    // The same group keeps its pseudonym; another salt gives another one.
    const again = await call(visitors, f.env, `${API}/visitors?days=30`, { token: f.tokens.owner });
    assert.equal((again.body.visitors as { data: AiChatVisitorRow[] }).data[0].alias, group.alias);
    f.env.GPT_HASH_SALT = hex(32);
    const resalted = await call(visitors, f.env, `${API}/visitors`, { token: f.tokens.owner });
    assert.notEqual((resalted.body.visitors as { data: AiChatVisitorRow[] }).data[0].alias, group.alias);
    // Without the salt there is no pseudonym at all (fail closed).
    f.env.GPT_HASH_SALT = "";
    const unsalted = await call(visitors, f.env, `${API}/visitors`, { token: f.tokens.owner });
    assert.deepEqual(unsalted.body.visitors, { ok: false, data: null, error: "salt_missing" });
    const noBuyer = await call(payments, f.env, `${API}/payments`, { token: f.tokens.owner });
    assert.equal((noBuyer.body.payments as { data: { rows: AiChatPaymentRow[] } }).data.rows[0].buyer, null);
    assert.deepEqual(guard.calls, []);
  } finally {
    guard.restore();
  }
  // The store reads no text or contact column and writes nothing.
  const code = read("functions/lib/gpt-chat/admin-store.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bcontent\b/);
  assert.doesNotMatch(code, /contact_/);
  assert.doesNotMatch(code, /gpt_messages/);
  assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/);
  assert.doesNotMatch(code, /ensure\w*Schema/);
});

test("4. isolation: another org's turns, alerts, models, orders and IP groups are never counted", async () => {
  const f = await adminFixture();
  const now = Date.now();
  // Inside the current Tashkent week even right after Monday 00:00.
  const at = Math.max(tashkentWeekStart(now), now - HOUR);
  addTurn(f.db, { ip: "h2_mine", at, model: "m/ours" });
  addSession(f.db, { ip: "h2_mine", locale: "uz", at });
  for (let i = 0; i < 3; i++) addTurn(f.db, { org: "org_other", ip: "h2_theirs", at, model: "m/theirs" });
  for (const org of [BILLING_ORG, "org_other", "org_other"])
    f.db.prepare("INSERT INTO gpt_service_alerts(org_id,id,code,created_at) VALUES(?,?,?,?)")
      .bind(org, randomUUID(), org === BILLING_ORG ? "chat_silence" : "chat_degraded", now - HOUR)
      .runSync();
  f.db.prepare("INSERT INTO gpt_model_health(org_id,model,blocked_until,code) VALUES(?,?,?,?)")
    .bind("org_other", "m/theirs", now + HOUR, "rate_limit").runSync();
  addOrder(f.db, { org: "org_other", state: "paid", at });
  const mine = addOrder(f.db, { state: "paid", at });

  const answer = await call(overview, f.env, `${API}/overview`, { token: f.tokens.owner });
  const body = answer.body as unknown as AiChatOverview;
  assert.ok(body.weeks.ok && body.models.ok && body.alerts.ok);
  const current = body.weeks.data[body.weeks.data.length - 1];
  assert.equal(current.turns, 1);
  assert.equal(current.northStar.entries, 1);
  assert.deepEqual(current.orders, { created: 1, paid: 1, refunded: 0 });
  assert.deepEqual(body.models.data.last24h.map((row) => [row.model, row.turns]), [["m/ours", 1]]);
  assert.deepEqual(body.models.data.blocked, []);
  assert.deepEqual(body.alerts.data.last7d.map((row) => [row.code, row.n]), [["chat_silence", 1]]);
  const list = await call(payments, f.env, `${API}/payments`, { token: f.tokens.owner });
  assert.deepEqual((list.body.payments as { data: { rows: AiChatPaymentRow[] } }).data.rows.map((row) => row.id), [mine]);
  const groups = await call(visitors, f.env, `${API}/visitors`, { token: f.tokens.owner });
  assert.equal((groups.body.visitors as { data: AiChatVisitorRow[] }).data.length, 1);
  // The other org reads only its own rows, and never the chat's legacy tables.
  const theirs = await new AiChatAdminStore(f.binding).overview("org_other", { now, weeks: 1, capUsd: 1 });
  assert.ok(theirs.weeks.ok);
  assert.equal(theirs.weeks.data[0].turns, 3);
  assert.deepEqual(theirs.weeks.data[0].sessions, { ru: 0, uz: 0, other: 0 });
  assert.deepEqual(theirs.weeks.data[0].leads, {});
});

test("5. keyset: 120 orders in both tables with equal seq and equal times page as 50 + 50 + 20, no duplicate, no gap", async () => {
  const f = await adminFixture();
  const now = Date.now();
  const times = [now - 3 * HOUR, now - 2 * HOUR, now - HOUR];
  const expected: Array<{ id: string; provider: string; at: number }> = [];
  for (let i = 0; i < 60; i++) {
    const at = times[i % 3];
    expected.push({ id: addOrder(f.db, { at }), provider: "click", at });
    expected.push({ id: addOrder(f.db, { table: "gpt_uzum_orders", at }), provider: "uzum", at });
  }
  // seq repeats across the two tables: a cursor on seq would skip or repeat rows.
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_orders p JOIN gpt_uzum_orders u ON u.seq=p.seq"), 60);
  expected.sort((a, b) => b.at - a.at || (a.provider < b.provider ? 1 : a.provider > b.provider ? -1 : 0) || (a.id < b.id ? 1 : -1));
  const pages: string[][] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const answer = await call(payments, f.env, `${API}/payments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token: f.tokens.owner });
    const page = (answer.body.payments as { data: { rows: AiChatPaymentRow[]; next: string | null } }).data;
    pages.push(page.rows.map((row) => row.id));
    cursor = page.next;
    if (!cursor) break;
  }
  assert.deepEqual(pages.map((page) => page.length), [50, 50, 20]);
  assert.deepEqual(pages.flat(), expected.map((order) => order.id));
  assert.equal(new Set(pages.flat()).size, 120);
  // Filters narrow the same keyset.
  const uzum = await call(payments, f.env, `${API}/payments?provider=uzum`, { token: f.tokens.owner });
  const first = (uzum.body.payments as { data: { rows: AiChatPaymentRow[]; next: string | null } }).data;
  assert.equal(first.rows.length, 50);
  assert.ok(first.rows.every((row) => row.provider === "uzum" && row.state === "cancelled" && row.amountUzs === 20000));
  const rest = await call(payments, f.env, `${API}/payments?provider=uzum&cursor=${encodeURIComponent(first.next!)}`, { token: f.tokens.owner });
  const second = (rest.body.payments as { data: { rows: AiChatPaymentRow[]; next: string | null } }).data;
  assert.deepEqual([second.rows.length, second.next], [10, null]);
  const testMode = await call(payments, f.env, `${API}/payments?mode=test`, { token: f.tokens.owner });
  assert.deepEqual((testMode.body.payments as { data: { rows: AiChatPaymentRow[] } }).data.rows, []);
});

test("6. NS-1: two Tashkent days count, two UTC dates of one Tashkent day do not; a young cohort is not readable", async () => {
  const f = await adminFixture();
  const now = Date.parse("2026-10-03T10:00:00Z");
  const at = (iso: string) => Date.parse(iso);
  addTurn(f.db, { ip: "h2_old", at: at("2026-08-01T08:00:00Z") }); // the history kept starts here
  // Cohort of the week from 07.09 (Tashkent):
  addTurn(f.db, { ip: "h2_a", at: at("2026-09-07T05:00:00Z") });
  addTurn(f.db, { ip: "h2_a", at: at("2026-09-08T05:00:00Z") }); // a second Tashkent day: returned
  addTurn(f.db, { ip: "h2_b", at: at("2026-09-09T19:30:00Z") }); // 10.09 00:30 Tashkent
  addTurn(f.db, { ip: "h2_b", at: at("2026-09-10T10:00:00Z") }); // 10.09 15:00 Tashkent: same day
  addTurn(f.db, { ip: "h2_c", at: at("2026-09-11T18:00:00Z") }); // 11.09 23:00 Tashkent
  addTurn(f.db, { ip: "h2_c", at: at("2026-09-11T20:00:00Z") }); // 12.09 01:00 Tashkent: returned
  addTurn(f.db, { ip: "h2_d", at: at("2026-09-12T05:00:00Z") });
  addTurn(f.db, { ip: "h2_d", at: at("2026-09-13T05:00:00Z"), status: "released", outcome: "upstream_error" }); // no answer
  addTurn(f.db, { ip: "h2_a", at: at("2026-09-20T05:00:00Z") }); // a return after 7 days counts for nothing new
  // Cohort of the current week: too young to read.
  addTurn(f.db, { ip: "h2_e", at: at("2026-09-29T05:00:00Z") });
  addTurn(f.db, { ip: "h2_e", at: at("2026-09-30T05:00:00Z") });
  const { weeks } = await new AiChatAdminStore(f.binding).overview(BILLING_ORG, { now, weeks: 8, capUsd: 1 });
  assert.ok(weeks.ok);
  const byWeek = new Map(weeks.data.map((week) => [week.week, week.northStar]));
  assert.deepEqual(byWeek.get("2026-09-07"), { entries: 4, returned: 2, per100: 50, readable: true });
  assert.deepEqual(byWeek.get("2026-09-14"), { entries: 0, returned: 0, per100: null, readable: true });
  assert.deepEqual(byWeek.get("2026-09-28"), { entries: 1, returned: 1, per100: 100, readable: false });
  // Without 14 days of history before it a cohort is not readable either: its
  // «new» groups may be old ones whose first turns are no longer kept.
  f.db.exec(`DELETE FROM gpt_turn_reservations WHERE ip_hash='h2_old'`);
  const shortHistory = await new AiChatAdminStore(f.binding).overview(BILLING_ORG, { now, weeks: 8, capUsd: 1 });
  assert.ok(shortHistory.weeks.ok);
  assert.deepEqual(
    shortHistory.weeks.data.find((week) => week.week === "2026-09-07")!.northStar,
    { entries: 4, returned: 2, per100: 50, readable: false },
  );
});

test("7. readiness comes from liveReadiness(): setting names only, never a value", async () => {
  const MARK = "SECRETMARK";
  const marked = () => `${MARK}${hex(16)}`;
  const f = await adminFixture({
    GPT_BILLING_MODE: "",
    GPT_BILLING_MODE_CLICK: "test",
    GPT_CLICK_CREDENTIALS_JSON: JSON.stringify({
      test: { service_id: "1201", merchant_id: "3401", secret_key: marked(), merchant_user_id: "5601" },
      live: { service_id: "1202", secret_key: marked() },
    }),
    UZUM_API: "checkout",
    UZUM_CREDENTIALS_JSON: JSON.stringify({ checkout: { live: { terminalId: randomUUID(), apiKey: marked() } } }),
    GPT_HASH_SALT: `${marked()}${hex(16)}`,
    GPT_IDENTITY_SECRET: `${marked()}${hex(16)}`,
    GPT_BILLING_MAINTENANCE_SECRET: `${marked()}${hex(16)}`,
    GPT_NOTIFY_BOT_TOKEN: marked(),
    GPT_NOTIFY_CHAT_ID: "123456789",
    OPENROUTER_API_KEY: marked(),
    ZAI_API_KEY: marked(),
    JWT_SECRET: marked(),
  });
  const tokens = await tokensFor(f.env);
  const answer = await call(overview, f.env, `${API}/overview`, { token: tokens.owner });
  assert.equal(answer.status, 200);
  assert.ok(!answer.text.includes(MARK), "a secret value reached the answer");
  const body = answer.body as unknown as AiChatOverview;
  assert.ok(body.readiness.ok);
  const readiness = body.readiness.data;
  const click = readiness.providers.find((p) => p.provider === "click")!;
  const uzum = readiness.providers.find((p) => p.provider === "uzum")!;
  assert.deepEqual(click.liveMissing, liveReadiness(f.env, "click"));
  assert.deepEqual(uzum.liveMissing, liveReadiness(f.env, "uzum"));
  assert.deepEqual([click.mode, click.configured, uzum.mode, uzum.flow], ["test", true, null, "checkout"]);
  assert.ok(click.liveMissing.includes("GPT_CLICK_CREDENTIALS_JSON.live.merchant_id"));
  const NAME = /^(?:[A-Z][A-Z0-9_]*(?:\.[a-z][A-Za-z_]*){0,3}|payme_receipt_detail)$/;
  for (const name of [
    ...readiness.providers.flatMap((p) => p.liveMissing),
    ...readiness.fiscalMissing,
    ...readiness.models.zaiMissing,
  ])
    assert.match(name, NAME);
  assert.deepEqual(readiness.models.zaiMissing, ["GPT_MODEL_PROVIDER", "GPT_ZAI_EVAL_APPROVED"]);
  assert.deepEqual(readiness.salt, { set: true, since: "2026-09-01T00:00:00.000Z", active: true });
  assert.deepEqual(readiness.alerts, { enabled: true, channel: "dedicated" });
  assert.deepEqual(readiness.rehearsal, { testProviders: ["click"], available: true });
  assert.equal(readiness.terms.version, "fixture-v1");
});

test("8. before migrations/0065 the payments are schema_pending and every other section answers; without D1 a 503", async () => {
  const db = new SqliteD1();
  const binding = db.asD1();
  await ensureSchema(binding);
  await ensureBillingSchema(binding); // 0064 and 0066, not the 0065 view
  const env = { GPTBOT_DRAFTS_DB: binding, JWT_SECRET: TEST_SIGNING_INPUT, GPT_HASH_SALT: hex(32) } as unknown as BillingEnv;
  const { owner } = await tokensFor(env);
  addTurn(db, { ip: "h2_a", at: Math.max(tashkentWeekStart(Date.now()), Date.now() - HOUR) });
  const list = await call(payments, env, `${API}/payments`, { token: owner });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.payments, { ok: false, data: null, error: "schema_pending" });
  const answer = await call(overview, env, `${API}/overview`, { token: owner });
  const body = answer.body as unknown as AiChatOverview;
  assert.ok(body.readiness.ok && body.weeks.ok && body.models.ok && body.alerts.ok);
  const current = body.weeks.data[body.weeks.data.length - 1];
  assert.equal(current.turns, 1);
  assert.equal(current.orders, null);
  const groups = await call(visitors, env, `${API}/visitors`, { token: owner });
  assert.equal((groups.body.visitors as AiChatSection<AiChatVisitorRow[]>).ok, true);
  // A D1 that has none of the tables: each section says so instead of a 500.
  const bare = new SqliteD1();
  const bareEnv = { ...env, GPTBOT_DRAFTS_DB: bare.asD1() } as BillingEnv;
  const pending = (await call(overview, bareEnv, `${API}/overview`, { token: owner })).body as unknown as AiChatOverview;
  assert.deepEqual([pending.readiness.ok, pending.weeks.error, pending.models.error, pending.alerts.error], [true, "schema_pending", "schema_pending", "schema_pending"]);
  // No D1 binding at all.
  const none = await call(overview, { ...env, GPTBOT_DRAFTS_DB: undefined } as BillingEnv, `${API}/overview`, { token: owner });
  assert.deepEqual([none.status, none.body.error], [503, "storage_unavailable"]);
});

test("8b. a query D1 cannot answer is query_failed in its section and logged with the request id, without detail", async () => {
  const failing = {
    prepare: () => ({
      bind: () => ({ all: async () => { throw new Error("D1_ERROR: SECRETDETAIL"); } }),
    }),
  } as unknown as D1Database;
  const logged: string[] = [];
  const original = console.warn;
  console.warn = (line: unknown) => { logged.push(String(line)); };
  try {
    const store = new AiChatAdminStore(failing);
    const now = Date.now();
    assert.equal((await store.overview(BILLING_ORG, { now, weeks: 1, capUsd: 1, requestId: "req_ov" })).weeks.error, "query_failed");
    assert.equal((await store.payments(BILLING_ORG, { cursor: null, provider: null, state: null, mode: null }, { now, salt: null, requestId: "req_pay" })).error, "query_failed");
    assert.equal((await store.visitors(BILLING_ORG, { now, days: 7, salt: hex(32), requestId: "req_vis" })).error, "query_failed");
  } finally {
    console.warn = original;
  }
  assert.deepEqual(logged.map((line) => JSON.parse(line)), [
    { event: "gpt_admin_overview_failed", request_id: "req_ov" },
    { event: "gpt_admin_payments_failed", request_id: "req_pay" },
    { event: "gpt_admin_visitors_failed", request_id: "req_vis" },
  ]);
  assert.ok(!logged.join("").includes("SECRETDETAIL"));
});

test("9. refund-record (Click): typed order number and confirmation, one journal row, a repeat changes nothing, a closed order is refused", async () => {
  const f = await adminFixture();
  const guard = noNetwork();
  try {
    const url = `${API}/refund-record`;
    const order = await f.store.createOrder(f.user, "click", "test", randomUUID());
    await f.store.transition(order.id, "prepared", "prepare");
    await f.store.transition(order.id, "paid", "perform");
    const body = { orderId: order.id, merchantRefundReference: "click-77", confirmedRefund: true };
    const refused = async (input: unknown, status: number, code: string, token = f.tokens.owner) => {
      const answer = await call(refundRecord, f.env, url, { token, body: input });
      assert.deepEqual([answer.status, answer.body.error], [status, code], JSON.stringify(input));
    };
    await refused({ ...body, confirmedRefund: undefined }, 400, "confirmation_required");
    await refused({ ...body, confirmedRefund: "yes" }, 400, "confirmation_required");
    await refused({ ...body, orderId: "pay_123" }, 400, "invalid_order_id");
    await refused({ ...body, merchantRefundReference: " " }, 400, "invalid_reference");
    await refused({ ...body, merchantRefundReference: "<script>" }, 400, "invalid_reference");
    await refused(body, 403, "insufficient_role", f.tokens.support);
    await refused({ ...body, orderId: `pay_${hex(16)}` }, 409, "invalid_order");
    assert.equal((await f.store.order(order.id))!.state, "paid");

    const journal = () => Number(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE order_id=? AND method LIKE 'owner_refund_record:%'", order.id));
    const outbox = () => Number(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE order_id=? AND event='refunded'", order.id));
    const first = await call(refundRecord, f.env, url, { token: f.tokens.owner, body });
    assert.equal(first.status, 200);
    assert.deepEqual([first.body.ok, first.body.state, first.body.recorded], [true, "refunded", true]);
    assert.equal((await f.store.order(order.id))!.state, "refunded");
    assert.equal(await f.store.access(f.user, "test"), null);
    assert.deepEqual([journal(), outbox()], [1, 1]);
    assert.equal(f.db.value("SELECT actor FROM gpt_payment_journal WHERE order_id=? AND to_state='refunded'", order.id), "owner");
    for (const reference of ["click-77", "click-78"]) {
      const repeat = await call(refundRecord, f.env, url, { token: f.tokens.owner, body: { ...body, merchantRefundReference: reference } });
      assert.deepEqual([repeat.status, repeat.body.recorded], [200, false]);
    }
    assert.deepEqual([journal(), outbox()], [1, 1]);
    // A payment that started no pack is closed in the ledger: nothing to record.
    const closed = await f.store.createOrder(f.user, "click", "test", randomUUID());
    await f.store.transition(closed.id, "cancelled", "timeout");
    const answer = await call(refundRecord, f.env, url, { token: f.tokens.owner, body: { ...body, orderId: closed.id } });
    assert.deepEqual([answer.status, answer.body.error, answer.body.state], [409, "invalid_order", "cancelled"]);
    // The Bearer endpoint records through the same function, whatever Click's mode now.
    const later = await f.store.createOrder(f.user, "click", "test", randomUUID());
    await f.store.transition(later.id, "prepared", "prepare");
    await f.store.transition(later.id, "paid", "perform");
    f.env.GPT_BILLING_MODE = "";
    f.env.GPT_BILLING_MAINTENANCE_SECRET = hex(32);
    const internal = await clickRefundRecord(
      f.ctx(
        new Request("https://gptbot.uz/api/internal/gpt-click-refund-record", {
          method: "POST",
          headers: { Authorization: `Bearer ${f.env.GPT_BILLING_MAINTENANCE_SECRET}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: later.id, merchantRefundReference: "cab-1", confirmedRefund: true }),
        }),
      ) as never,
    );
    assert.equal(internal.status, 200);
    assert.equal((await f.store.order(later.id))!.state, "refunded");
    await Promise.allSettled(f.background);
  } finally {
    guard.restore();
  }
});

test("9b. refund-record (Uzum Checkout): recorded only once Uzum reports the full refund", async () => {
  const f = await uzumFixture();
  try {
    Object.assign(f.env, { JWT_SECRET: TEST_SIGNING_INPUT });
    const { owner } = await tokensFor(f.env);
    const started = await f.subscribeUzum(randomUUID());
    assert.equal(started.status, 200, JSON.stringify(started.body));
    const store = new UzumStore(f.binding, BILLING_ORG);
    const row = (await store.order(String(started.body.attemptId)))!;
    f.settleAtUzum(row.external_id!, { status: "COMPLETED", completedAmount: row.amount });
    await f.callback({ orderId: row.external_id, operationState: "SUCCESS", operationType: "COMPLETE", orderNumber: row.id });
    assert.equal((await store.order(row.id))!.state, "paid");
    const body = { orderId: row.id, merchantRefundReference: "uzum-cabinet-9", confirmedRefund: true };
    const early = await call(refundRecord, f.env, `${API}/refund-record`, { token: owner, body });
    assert.deepEqual([early.status, early.body.error], [409, "not_refunded_at_uzum"]);
    assert.equal((await store.order(row.id))!.state, "paid");
    f.fake.failPulls = 1;
    const down = await call(refundRecord, f.env, `${API}/refund-record`, { token: owner, body });
    assert.deepEqual([down.status, down.body.error], [502, "upstream_unavailable"]);
    f.settleAtUzum(row.external_id!, { status: "REFUNDED", refundedAmount: row.amount });
    const recorded = await call(refundRecord, f.env, `${API}/refund-record`, { token: owner, body });
    assert.deepEqual([recorded.status, recorded.body.recorded], [200, true]);
    assert.equal((await store.order(row.id))!.state, "refunded");
    const repeat = await call(refundRecord, f.env, `${API}/refund-record`, { token: owner, body });
    assert.deepEqual([repeat.status, repeat.body.recorded], [200, false]);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE order_id=? AND method LIKE 'owner_refund_record:%'", row.id), 1);
    // No refund call ever went to Uzum: the admin does not move money.
    assert.equal(f.calls.filter((c) => c.path === "/api/v1/acquiring/refund").length, 0);
    await f.drain();
  } finally {
    f.restore();
  }
});

test("9c. refund-record never closes a paid Payme order: Payme's own CancelTransaction records its refunds (PAYME-RU.md section 7)", async () => {
  const f = await adminFixture();
  const guard = noNetwork();
  try {
    const order = await f.store.createOrder(f.user, "payme", "live", randomUUID());
    await f.store.transition(order.id, "prepared", "CreateTransaction", { externalId: hex(12) });
    await f.store.transition(order.id, "paid", "PerformTransaction");
    const body = { orderId: order.id, merchantRefundReference: "payme-cabinet-1", confirmedRefund: true };
    const answer = await call(refundRecord, f.env, `${API}/refund-record`, { token: f.tokens.owner, body });
    assert.deepEqual([answer.status, answer.body.error, answer.body.state], [409, "invalid_order", "paid"]);
    f.env.GPT_BILLING_MAINTENANCE_SECRET = hex(32);
    const internal = await clickRefundRecord(
      f.ctx(
        new Request("https://gptbot.uz/api/internal/gpt-click-refund-record", {
          method: "POST",
          headers: { Authorization: `Bearer ${f.env.GPT_BILLING_MAINTENANCE_SECRET}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ) as never,
    );
    assert.equal(internal.status, 409);
    // The pack runs on, nothing was journaled and the owner was told nothing.
    assert.equal((await f.store.order(order.id))!.state, "paid");
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_payment_journal WHERE order_id=? AND method LIKE 'owner_refund_record:%'", order.id), 0);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_billing_outbox WHERE order_id=? AND event='refunded'", order.id), 0);
    await Promise.allSettled(f.background);
  } finally {
    guard.restore();
  }
});

test("rehearsal-session: only while a provider is in test; the cookie works and its value travels only in Set-Cookie", async () => {
  const f = await adminFixture();
  const url = `${API}/rehearsal-session`;
  const opened = await call(rehearsalSession, f.env, url, { token: f.tokens.owner, body: { account: true } });
  assert.equal(opened.status, 200);
  assert.deepEqual([opened.body.ok, opened.body.account, opened.body.providers], [true, true, offeredProviders(f.env, "test")]);
  const cookies = opened.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies[0].startsWith(`${REHEARSAL_COOKIE}=`));
  assert.ok(cookies[1].startsWith("__Host-gpt_account="));
  for (const cookie of cookies) {
    assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=7200/);
    assert.ok(!opened.text.includes(cookie.split(";")[0].split("=")[1]));
  }
  const jar = cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  assert.ok(await rehearsalActive(new Request("https://gptbot.uz/ru/", { headers: { cookie: jar } }), f.env));
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_accounts WHERE id LIKE 'acct_rh_%'"), 1);
  const plain = await call(rehearsalSession, f.env, url, { token: f.tokens.owner, body: { account: false } });
  assert.deepEqual([plain.status, plain.body.account, plain.headers.getSetCookie().length], [200, false, 1]);
  const bad = await call(rehearsalSession, f.env, url, { token: f.tokens.owner, body: { account: "yes" } });
  assert.deepEqual([bad.status, bad.body.error], [400, "invalid_body"]);
  f.env.GPT_BILLING_MODE = "";
  const off = await call(rehearsalSession, f.env, url, { token: f.tokens.owner, body: { account: false } });
  assert.deepEqual([off.status, off.body.error, off.headers.getSetCookie().length], [409, "no_test_provider", 0]);
  f.env.GPT_BILLING_MODE = "test";
  f.env.GPT_IDENTITY_SECRET = "short";
  const unsigned = await call(rehearsalSession, f.env, url, { token: f.tokens.owner, body: { account: false } });
  assert.deepEqual([unsigned.status, unsigned.body.error], [409, "identity_secret_missing"]);
});

function viewProps(extra: Partial<AiChatViewProps> = {}): AiChatViewProps {
  const at = Date.parse("2026-10-03T10:00:00Z");
  const week = {
    week: "2026-09-28",
    sessions: { ru: 3, uz: 9, other: 0 },
    turns: 40,
    answered: 30,
    released: 9,
    stuck: 1,
    outcomes: { answered: 30, truncated: 2, stopped: 1, failed: 6, refused: 0 },
    limitHits: { daily: 4 },
    funnel: null,
    orders: { created: 0, paid: 0, refunded: 0 },
    leads: { gpt_chat: 1 },
    northStar: { entries: 20, returned: 2, per100: 10, readable: false },
  };
  return {
    overview: {
      generatedAt: at,
      tz: "Asia/Tashkent",
      request_id: "req_view",
      readiness: {
        ok: true,
        error: null,
        data: {
          providers: [
            { provider: "click", listed: true, mode: "test", configured: true, flow: null, liveMissing: ["GPT_BILLING_MODE_CLICK", "GPT_BILLING_LIVE_READY"] },
            { provider: "uzum", listed: true, mode: null, configured: false, flow: "checkout", liveMissing: ["UZUM_CREDENTIALS_JSON.checkout.live"] },
          ],
          terms: { version: "ai-paket-2026-10-v2", ru: "https://gptbot.uz/ru/oferta/", uz: "https://gptbot.uz/uz/oferta/", approvedAt: "2026-10-03" },
          fiscalMissing: [],
          salt: { set: true, since: "2026-10-02T00:00:00.000Z", active: true },
          identitySecret: true,
          alerts: { enabled: true, channel: "dedicated" },
          retentionDays: null,
          models: { provider: "zai", zaiMissing: [], freeChain: ["zai/glm-4.7-flash", "nvidia/nemotron:free"], paidChain: ["zai/glm-4.5-air"], freeTierPaidPrimary: false, freePaidDailyUsd: 1 },
          rehearsal: { testProviders: ["click"], available: true },
        },
      },
      weeks: { ok: true, error: null, data: [week] },
      models: {
        ok: true,
        error: null,
        data: {
          last24h: [{ model: "zai/glm-4.7-flash", turns: 10, answered: 8, truncated: 1, failed: 1, ttftAvgMs: 900, costUsd: 0 }],
          last7d: [],
          blocked: [],
          spendToday: { usd: 0.12, reservedUsd: 0, capUsd: 1, attempts: 3 },
        },
      },
      alerts: {
        ok: true,
        error: null,
        data: {
          last7d: [{ code: "chat_silence", n: 1, delivered: 1, lastAt: at, urgent: true, text: "ходы были, но ни одного ответа за окно сторожа" }],
          watchdogLastRun: at,
          catalogueLastRun: null,
        },
      },
    },
    payments: {
      request_id: "req_list",
      payments: {
        ok: true,
        error: null,
        data: {
          rows: [{
            id: `pay_${"a".repeat(32)}`,
            provider: "click",
            mode: "test",
            state: "paid",
            amountUzs: 20000,
            createdAt: at,
            paidAt: at,
            cancelledAt: null,
            buyer: "B-ABCDEFGH",
            rehearsal: true,
            pack: { endsAt: at + 30 * DAY, limit: 300, used: 12, revokedAt: null },
            receipt: { status: 0, url: "https://ofd.soliq.uz/epi?t=EZ1" },
            refundReceipt: null,
          }, {
            id: `uzm_${"b".repeat(32)}`,
            provider: "uzum",
            mode: "live",
            state: "refunded",
            amountUzs: 20000,
            createdAt: at - 2 * DAY,
            paidAt: at - 2 * DAY,
            cancelledAt: Date.parse("2026-10-02T09:15:00Z"),
            buyer: "B-IJKLMNOP",
            rehearsal: false,
            pack: { endsAt: at + 28 * DAY, limit: 300, used: 3, revokedAt: Date.parse("2026-10-02T09:15:00Z") },
            receipt: null,
            refundReceipt: null,
          }],
          next: `${at}.click.pay_${"a".repeat(32)}`,
        },
      },
    },
    visitors: {
      request_id: "req_groups",
      days: 7,
      visitors: {
        ok: true,
        error: null,
        data: [{ alias: "N-QRSTUVWX", firstAt: at - DAY, lastAt: at, days: 2, turns: 5, answered: 4, limitHits: 1, account: false, paid: false, locale: "uz" }],
      },
    },
    failures: [],
    refreshing: false,
    filter: {},
    days: 7,
    loadingMore: false,
    onRefresh: () => undefined,
    onFilter: () => undefined,
    onMore: () => undefined,
    onDays: () => undefined,
    onRecordRefund: async () => ({ ok: true, state: "refunded", recorded: true, request_id: "req_x" }),
    onOpenRehearsal: async () => ({ ok: true, expiresAt: at, providers: ["click"], account: true, request_id: "req_y" }),
    ...extra,
  };
}

test("10. the page shows pseudonyms and setting names, no raw id; the menu has «AI-чат» for the owner only; no polling", () => {
  const markup = renderToStaticMarkup(React.createElement(AiChatView, viewProps()));
  for (const text of ["AI-чат", "Готовность", "Недели", "Модели и алерты", "Оплаты и возвраты", "IP-группы (не люди)", "Сессия репетиции", "Отметить возврат"])
    assert.ok(markup.includes(text), text);
  assert.ok(markup.includes("N-QRSTUVWX"));
  assert.ok(markup.includes("B-ABCDEFGH"));
  assert.ok(markup.includes("GPT_BILLING_LIVE_READY"));
  assert.ok(markup.includes("https://ofd.soliq.uz/epi?t=EZ1"));
  assert.doesNotMatch(markup, /h2_|acct_|ip_hash/);
  assert.match(markup, /data-testid="ai-chat-refresh"/);
  // The order number is typed by hand: the refund form starts empty.
  assert.match(markup, /id="ai-chat-refund-order"[^>]*value=""/);
  // An order shows when it was created, paid and closed (a refund: its time, Tashkent).
  assert.ok(markup.includes("Создан / оплачен / закрыт"));
  assert.ok(markup.includes("возврат 02.10, 14:15"));
  // The filters have Russian accessible names.
  for (const name of ["Провайдер", "Состояние", "Режим"]) assert.ok(markup.includes(`aria-label="${name}"`), name);
  // A section without data says why, the others still render; only a failed
  // query names its request id (the server logs it).
  const base = viewProps().overview!;
  const gaps = renderToStaticMarkup(React.createElement(AiChatView, viewProps({
    overview: { ...base, weeks: { ok: false, data: null, error: "schema_pending" } },
    visitors: { request_id: "req_groups", days: 7, visitors: { ok: false, data: null, error: "salt_missing" } },
    payments: { request_id: "req_list", payments: { ok: false, data: null, error: "query_failed" } },
  })));
  assert.match(gaps, /data-testid="ai-chat-gap-schema_pending"/);
  assert.match(gaps, /data-testid="ai-chat-gap-salt_missing"/);
  assert.match(gaps, /data-testid="ai-chat-gap-query_failed"/);
  assert.ok(gaps.includes("req_list"));
  assert.ok(!gaps.includes("req_groups") && !gaps.includes("req_view"));
  assert.ok(gaps.includes("Готовность"));

  const sidebar = (role?: string) =>
    renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: ["/admin-tools/ai-chat"] }, React.createElement(Sidebar, { role })),
    );
  assert.match(sidebar(), /data-testid="nav-ai-chat"/);
  assert.match(sidebar("platform_owner"), /href="\/admin-tools\/ai-chat"/);
  assert.doesNotMatch(sidebar("support_readonly"), /nav-ai-chat/);
  assert.match(read("src/admin/i18n/ru.ts"), /ai_chat:\s*'AI-чат'/);
  assert.match(read("src/admin/routes.ts"), /aiChat: 'ai-chat'/);
  const app = read("src/admin/AdminApp.tsx");
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/AiChat'\)\)/);
  assert.doesNotMatch(app, /import AiChat from/);
  // Refresh by button only: nothing on a timer.
  for (const file of ["src/admin/pages/AiChat.tsx", ...fs.readdirSync(path.join(ROOT, "src/admin/components/ai-chat")).map((name) => `src/admin/components/ai-chat/${name}`)])
    assert.doesNotMatch(read(file), /setInterval|setTimeout/, file);
  // The release guard rejects an admin bundle without the section.
  assert.ok(REQUIRED_FEATURES.some(([id, marker]) => id === "ai_chat_admin" && marker === "/api/admin/ai-chat/overview"));
  assert.match(read("src/admin/lib/ai-chat-api.ts"), /\/api\/admin\/ai-chat\/overview/);
});
