// Read-only queries of the admin section «AI-чат» (paid-chat plan WP-19, D10).
//
// SQL of the section lives only here, and it is SELECT only: the store never
// writes, never runs a bootstrap and never names a column that holds text or a
// contact (gpt_messages.content, gpt_leads.contact_*; tests/gpt-admin-ai-chat
// reads this file and fails if it does). Every method takes the org first
// (AGENTS.md §3) and every statement on a table with org_id filters by it.
//
// gpt_sessions and gpt_leads are legacy single-tenant tables without org_id
// (migrations/0008): only the chat's own org (BILLING_ORG) reads them, any
// other org gets zeros, like WatchdogStore.sessions().
//
// Privacy: the IP hash, the turn's subject and the account id are read only to
// count, group and pseudonymize, and never leave this module. An IP group is
// shown as «N-XXXXXXXX» = HMAC(GPT_HASH_SALT, "admin-alias:v1:" + ip_hash), a
// buyer as «B-XXXXXXXX» = HMAC(GPT_HASH_SALT, "admin-buyer:v1:" + user_id),
// 8 base32 characters of the MAC. Without the salt there are no pseudonyms:
// the visitors list says salt_missing and buyers show none (fail closed).
//
// The overview reads D1 in two round trips: which tables and views exist, then
// one db.batch of every statement whose objects exist. A missing object makes
// its section schema_pending (or its metric null) instead of failing the
// batch, which D1 runs as one transaction.
import { BILLING_ORG } from "./billing-config";
import { TELEMETRY_RETENTION_DAYS } from "./billing-maintenance-store";
import { alertText, isUrgentAlert } from "./alert-policy";
import { CATALOGUE_INTERVAL_MS } from "./billing-operations-store";
import { receiptLink } from "./fiscal-config";
import { FREE_PAID_BUCKET, spendDay } from "./model-spend-store";
import { REHEARSAL_ACCOUNT_PREFIX } from "./rehearsal";
import { WATCHDOG_LEASE_MS } from "./watchdog-store";
import {
  AI_CHAT_MODES,
  AI_CHAT_ORDER_STATES,
  AI_CHAT_PAGE_SIZE,
  AI_CHAT_PROVIDERS,
  encodePaymentsCursor,
  NORTH_STAR_SETTLE_DAYS,
  sectionError,
  sectionOk,
  tashkentWeeks,
  type AiChatAlerts,
  type AiChatModelRow,
  type AiChatModels,
  type AiChatPaymentRow,
  type AiChatPaymentsPage,
  type AiChatPaymentsQuery,
  type AiChatSection,
  type AiChatVisitorRow,
  type AiChatWeek,
} from "../../../src/shared/ai-chat-admin";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Rows of a model or alert list; the chain is a handful of models. */
const LIST_LIMIT = 20;
const VISITOR_LIMIT = 50;

/** The tables and views the section reads. */
const OBJECTS = [
  "gpt_turn_reservations",
  "gpt_sessions",
  "gpt_leads",
  "gpt_limit_hits",
  "gpt_ui_events",
  "gpt_payment_orders_all",
  "gpt_access_periods",
  "gpt_fiscal_receipts",
  "gpt_model_health",
  "gpt_model_spend",
  "gpt_service_alerts",
  "gpt_billing_ops",
] as const;
type SchemaObject = (typeof OBJECTS)[number];

// Week of a time in ms / of an ISO text, Monday 00:00 in Tashkent (UTC+5).
const WEEK_OF_MS = (column: string) =>
  `date(${column}/1000,'unixepoch','+5 hours','weekday 0','-6 days')`;
const WEEK_OF_ISO = (column: string) => `date(${column},'+5 hours','weekday 0','-6 days')`;
const DAY_OF_MS = (column: string) => `date(${column}/1000,'unixepoch','+5 hours')`;

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A closed-list value read back from D1, or `fallback`. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Key of a count bucket that came from a free-text column: [a-z0-9_] or "other". */
function bucket(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,32}$/.test(value) ? value : "other";
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * A pseudonym factory keyed by the salt: label + "-" + 8 base32 characters
 * (40 bits) of HMAC-SHA256(salt, input). One HMAC key per request.
 */
export function pseudonyms(salt: string): (label: "N" | "B", input: string) => Promise<string> {
  const key = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return async (label, input) => {
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", await key, new TextEncoder().encode(input)),
    );
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of mac.subarray(0, 5)) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += BASE32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
      value &= (1 << bits) - 1;
    }
    return `${label}-${out}`;
  };
}

export interface OverviewOptions {
  now: number;
  weeks: number;
  /** GPT_FREE_PAID_DAILY_USD: the cap the spend of today is shown against. */
  capUsd: number;
  /** The request's id: a query_failed section is logged with it (the page shows it). */
  requestId?: string;
}

/** A section that D1 could not answer, logged with the request id and no detail of the error. */
function queryFailed(event: string, requestId: string | undefined): void {
  console.warn(JSON.stringify({ event, request_id: requestId ?? null }));
}

export interface OverviewSections {
  weeks: AiChatSection<AiChatWeek[]>;
  models: AiChatSection<AiChatModels>;
  alerts: AiChatSection<AiChatAlerts>;
}

export class AiChatAdminStore {
  constructor(readonly db: D1Database) {}

  /** Which of the tables and views the section reads exist in D1. */
  async objects(): Promise<Set<SchemaObject>> {
    const rows = await this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN (${OBJECTS.map(() => "?").join(",")})`,
      )
      .bind(...OBJECTS)
      .all<{ name: SchemaObject }>();
    return new Set((rows.results ?? []).map((row) => row.name));
  }

  /** Weeks, models and alerts: each section ok, schema_pending or query_failed on its own. */
  async overview(orgId: string, options: OverviewOptions): Promise<OverviewSections> {
    try {
      return await this.loadOverview(orgId, options);
    } catch {
      queryFailed("gpt_admin_overview_failed", options.requestId);
      return {
        weeks: sectionError("query_failed"),
        models: sectionError("query_failed"),
        alerts: sectionError("query_failed"),
      };
    }
  }

  private async loadOverview(orgId: string, { now, weeks, capUsd }: OverviewOptions): Promise<OverviewSections> {
    const has = await this.objects();
    const db = this.db;
    const legacy = orgId === BILLING_ORG;
    const { since, labels } = tashkentWeeks(now, weeks);
    const sinceIso = new Date(since).toISOString();
    const history = now - TELEMETRY_RETENTION_DAYS * DAY_MS;
    const statements: Array<[string, D1PreparedStatement]> = [];
    const add = (key: string, statement: D1PreparedStatement) => statements.push([key, statement]);

    const weeksReady =
      has.has("gpt_turn_reservations") && (!legacy || (has.has("gpt_sessions") && has.has("gpt_leads")));
    if (weeksReady) {
      // W1: turns by week and how they ended (outcome from migrations/0066).
      add(
        "turns",
        db
          .prepare(
            `SELECT ${WEEK_OF_MS("created_at")} AS week, COUNT(*) AS turns,
          SUM(status='done') AS answered, SUM(status='released') AS released,
          SUM(status='reserved' AND expires_at<=?) AS stuck,
          SUM(outcome IS NOT NULL) AS settled,
          SUM(outcome='answered') AS o_answered, SUM(outcome='truncated') AS o_truncated,
          SUM(outcome='client_gone') AS o_stopped,
          SUM(outcome IN ('upstream_error','no_model')) AS o_failed,
          SUM(outcome IN ('refused','context_too_large')) AS o_refused
        FROM gpt_turn_reservations WHERE org_id=? AND created_at>=? GROUP BY week`,
          )
          .bind(now, orgId, since),
      );
      // W4 (NS-1): IP groups by the Tashkent week of their first turn in the
      // history kept, and how many came back with an answer on 2+ days of
      // their first 7. Cohorts outside the window are left out at the end.
      add(
        "northStar",
        db
          .prepare(
            `WITH t AS (SELECT ip_hash AS s, ${DAY_OF_MS("created_at")} AS d, status
             FROM gpt_turn_reservations WHERE org_id=? AND created_at>=?),
          f AS (SELECT s, MIN(d) AS fd FROM t GROUP BY s),
          v AS (SELECT f.fd AS fd,
                  COUNT(DISTINCT CASE WHEN t.status='done' AND t.d<date(f.fd,'+7 days') THEN t.d END) AS vd
                FROM f JOIN t ON t.s=f.s GROUP BY f.s, f.fd)
        SELECT date(fd,'weekday 0','-6 days') AS week, COUNT(*) AS entries, SUM(vd>=2) AS returned
        FROM v GROUP BY week`,
          )
          .bind(orgId, history),
      );
      add(
        "oldest",
        db
          .prepare("SELECT MIN(created_at) AS at FROM gpt_turn_reservations WHERE org_id=? AND created_at>=?")
          .bind(orgId, history),
      );
      if (legacy) {
        // W2: sessions by language; W8: leads by source (legacy, no org_id).
        add(
          "sessions",
          db
            .prepare(
              `SELECT ${WEEK_OF_ISO("created_at")} AS week, locale, COUNT(*) AS n
          FROM gpt_sessions WHERE created_at>=? GROUP BY week, locale`,
            )
            .bind(sinceIso),
        );
        add(
          "leads",
          db
            .prepare(
              `SELECT ${WEEK_OF_ISO("created_at")} AS week, COALESCE(source,'gpt_chat') AS source, COUNT(*) AS n
          FROM gpt_leads WHERE created_at>=? GROUP BY week, source`,
            )
            .bind(sinceIso),
        );
      }
      if (has.has("gpt_limit_hits"))
        // W11: one row per UTC day, reason and subject; its week is the
        // Tashkent week of the day's first hit.
        add(
          "limitHits",
          db
            .prepare(
              `SELECT ${WEEK_OF_MS("first_at")} AS week, reason, SUM(n) AS hits
          FROM gpt_limit_hits WHERE org_id=? AND day>=? AND first_at>=? GROUP BY week, reason`,
            )
            .bind(orgId, spendDay(since), since),
        );
      if (has.has("gpt_ui_events")) {
        // W12: the pack window's funnel, counted on the server.
        add(
          "funnel",
          db
            .prepare(
              `SELECT ${WEEK_OF_MS("created_at")} AS week, type, detail, COUNT(*) AS n
          FROM gpt_ui_events WHERE org_id=? AND created_at>=? GROUP BY week, type, detail`,
            )
            .bind(orgId, since),
        );
        add(
          "funnelSince",
          db.prepare("SELECT MIN(created_at) AS at FROM gpt_ui_events WHERE org_id=?").bind(orgId),
        );
      }
      if (has.has("gpt_payment_orders_all"))
        // W9: live orders by the week they were created.
        add(
          "orders",
          db
            .prepare(
              `SELECT ${WEEK_OF_MS("created_at")} AS week, COUNT(*) AS created,
            SUM(perform_time>0) AS paid, SUM(state='refunded') AS refunded
          FROM gpt_payment_orders_all WHERE org_id=? AND mode='live' AND created_at>=? GROUP BY week`,
            )
            .bind(orgId, since),
        );
    }

    const modelsReady = has.has("gpt_turn_reservations") && has.has("gpt_model_health");
    if (modelsReady) {
      // W7: answers by the model that settled the turn.
      const byModel = (from: number) =>
        db
          .prepare(
            `SELECT model, COUNT(*) AS turns, SUM(outcome='answered') AS answered,
          SUM(outcome='truncated') AS truncated, SUM(outcome IN ('upstream_error','no_model')) AS failed,
          AVG(CASE WHEN outcome IN ('answered','truncated') THEN ttft_ms END) AS ttft,
          SUM(cost_micro_usd) AS cost
        FROM gpt_turn_reservations WHERE org_id=? AND created_at>=? AND outcome IS NOT NULL
        GROUP BY model ORDER BY turns DESC LIMIT ${LIST_LIMIT}`,
          )
          .bind(orgId, from);
      add("models24h", byModel(now - DAY_MS));
      add("models7d", byModel(now - WEEK_MS));
      // W6: models cooling down now.
      add(
        "blocked",
        db
          .prepare(
            `SELECT model, code, blocked_until FROM gpt_model_health WHERE org_id=? AND blocked_until>?
        ORDER BY blocked_until DESC LIMIT ${LIST_LIMIT}`,
          )
          .bind(orgId, now),
      );
      if (has.has("gpt_model_spend"))
        add(
          "spend",
          db
            .prepare(
              "SELECT reserved_micro, actual_micro, attempts FROM gpt_model_spend WHERE org_id=? AND day=? AND bucket=?",
            )
            .bind(orgId, spendDay(now), FREE_PAID_BUCKET),
        );
    }

    const alertsReady = has.has("gpt_service_alerts");
    if (alertsReady) {
      // W5: alert codes of the last 7 days and whether they reached the owner.
      add(
        "alerts",
        db
          .prepare(
            `SELECT code, COUNT(*) AS n, SUM(delivered_at IS NOT NULL) AS delivered, MAX(created_at) AS last_at
        FROM gpt_service_alerts WHERE org_id=? AND created_at>=? GROUP BY code ORDER BY n DESC, code LIMIT 50`,
          )
          .bind(orgId, now - WEEK_MS),
      );
      if (has.has("gpt_billing_ops"))
        add(
          "ops",
          db
            .prepare(
              "SELECT task, next_at FROM gpt_billing_ops WHERE org_id=? AND task IN ('watchdog','catalogue')",
            )
            .bind(orgId),
        );
    }

    const results = statements.length
      ? await db.batch<Row>(statements.map(([, statement]) => statement))
      : [];
    const rows = new Map<string, Row[]>(
      statements.map(([key], index) => [key, (results[index]?.results ?? []) as Row[]]),
    );
    const get = (key: string) => rows.get(key) ?? [];

    return {
      weeks: weeksReady ? sectionOk(this.weeks(labels, get, rows, now)) : sectionError("schema_pending"),
      models: modelsReady
        ? sectionOk({
            last24h: get("models24h").map(modelRow),
            last7d: get("models7d").map(modelRow),
            blocked: get("blocked").map((row) => ({
              model: String(row.model),
              code: String(row.code),
              until: num(row.blocked_until),
            })),
            spendToday: rows.has("spend")
              ? {
                  usd: num(get("spend")[0]?.actual_micro) / 1e6,
                  reservedUsd: num(get("spend")[0]?.reserved_micro) / 1e6,
                  capUsd,
                  attempts: num(get("spend")[0]?.attempts),
                }
              : null,
          })
        : sectionError("schema_pending"),
      alerts: alertsReady
        ? sectionOk({
            last7d: get("alerts").map((row) => {
              const code = String(row.code);
              return {
                code,
                n: num(row.n),
                delivered: num(row.delivered),
                lastAt: num(row.last_at),
                urgent: isUrgentAlert(code),
                text: alertText(code),
              };
            }),
            watchdogLastRun: lastRun(get("ops"), "watchdog", WATCHDOG_LEASE_MS),
            catalogueLastRun: lastRun(get("ops"), "catalogue", CATALOGUE_INTERVAL_MS),
          })
        : sectionError("schema_pending"),
    };
  }

  /** One row per week label, oldest first; a metric not written yet is null. */
  private weeks(
    labels: string[],
    get: (key: string) => Row[],
    rows: Map<string, Row[]>,
    now: number,
  ): AiChatWeek[] {
    const byWeek = (key: string) => {
      const map = new Map<string, Row[]>();
      for (const row of get(key)) {
        const week = String(row.week);
        map.set(week, [...(map.get(week) ?? []), row]);
      }
      return map;
    };
    const turns = byWeek("turns");
    const sessions = byWeek("sessions");
    const leads = byWeek("leads");
    const hits = byWeek("limitHits");
    const funnel = byWeek("funnel");
    const orders = byWeek("orders");
    const cohorts = byWeek("northStar");
    const oldest = numOrNull(get("oldest")[0]?.at);
    const funnelSince = numOrNull(get("funnelSince")[0]?.at);
    return labels.map((week) => {
      const start = Date.parse(`${week}T00:00:00+05:00`);
      const t = turns.get(week)?.[0];
      const settled = num(t?.settled);
      const outcomes = settled
        ? {
            answered: num(t?.o_answered),
            truncated: num(t?.o_truncated),
            stopped: num(t?.o_stopped),
            failed: num(t?.o_failed),
            refused: num(t?.o_refused),
          }
        : null;
      const s = { ru: 0, uz: 0, other: 0 };
      for (const row of sessions.get(week) ?? []) {
        const locale = row.locale === "ru" || row.locale === "uz" ? row.locale : "other";
        s[locale] += num(row.n);
      }
      const leadCounts: Record<string, number> = {};
      for (const row of leads.get(week) ?? []) {
        const source = bucket(row.source);
        leadCounts[source] = (leadCounts[source] ?? 0) + num(row.n);
      }
      // The 429 counter shipped with the turn outcomes (release R1): a week
      // with outcomes, or with counted hits, has it; an older one has not.
      let limitHits: Record<string, number> | null = null;
      if (rows.has("limitHits") && (outcomes || hits.has(week))) {
        limitHits = {};
        for (const row of hits.get(week) ?? []) {
          const reason = bucket(row.reason);
          limitHits[reason] = (limitHits[reason] ?? 0) + num(row.hits);
        }
      }
      // The funnel is written from its first event on (release R4).
      let windowFunnel: AiChatWeek["funnel"] = null;
      if (funnelSince !== null && start + WEEK_MS > funnelSince) {
        const count = (type: string, detail?: string) =>
          (funnel.get(week) ?? [])
            .filter((row) => row.type === type && (detail === undefined || row.detail === detail))
            .reduce((sum, row) => sum + num(row.n), 0);
        windowFunnel = {
          packViewed: count("pack_viewed"),
          loginStarted: count("login_started"),
          loginDone: count("login_result", "done"),
          checkoutStarted: count("checkout_started"),
          checkoutPaid: count("checkout_result", "paid"),
        };
      }
      const o = orders.get(week)?.[0];
      const c = cohorts.get(week)?.[0];
      const entries = num(c?.entries);
      const returned = num(c?.returned);
      const settle = NORTH_STAR_SETTLE_DAYS * DAY_MS;
      return {
        week,
        sessions: s,
        turns: num(t?.turns),
        answered: num(t?.answered),
        released: num(t?.released),
        stuck: num(t?.stuck),
        outcomes,
        limitHits,
        funnel: windowFunnel,
        orders: rows.has("orders")
          ? { created: num(o?.created), paid: num(o?.paid), refunded: num(o?.refunded) }
          : null,
        leads: leadCounts,
        northStar: {
          entries,
          returned,
          per100: entries ? Math.round((1000 * returned) / entries) / 10 : null,
          // Final once 7 days of returns after the last first day have passed,
          // and only with 14 days of history before it: a «new» group earlier
          // than that may be an old one whose first turn is no longer kept.
          readable: start + settle <= now && oldest !== null && start >= oldest + settle,
        },
      };
    });
  }

  /**
   * W10: one page of orders across providers, newest first. Keyset by
   * (created_at, provider, id): seq repeats across the two order tables
   * (plan A4), the triple does not.
   */
  async payments(
    orgId: string,
    query: AiChatPaymentsQuery,
    options: { now: number; salt: string | null; requestId?: string },
  ): Promise<AiChatSection<AiChatPaymentsPage>> {
    try {
      const has = await this.objects();
      if (
        !has.has("gpt_payment_orders_all") ||
        !has.has("gpt_access_periods") ||
        !has.has("gpt_fiscal_receipts") ||
        !has.has("gpt_turn_reservations")
      )
        return sectionError("schema_pending");
      const where = ["o.org_id=?"];
      // Positional binds in the order of the text: the used count's subquery first.
      const binds: unknown[] = [options.now, orgId];
      if (query.provider) {
        where.push("o.provider=?");
        binds.push(query.provider);
      }
      if (query.state) {
        where.push("o.state=?");
        binds.push(query.state);
      }
      if (query.mode) {
        where.push("o.mode=?");
        binds.push(query.mode);
      }
      if (query.cursor) {
        where.push("(o.created_at<? OR (o.created_at=? AND (o.provider<? OR (o.provider=? AND o.id<?))))");
        const { createdAt, provider, id } = query.cursor;
        binds.push(createdAt, createdAt, provider, provider, id);
      }
      const result = await this.db
        .prepare(
          `SELECT o.id, o.user_id, o.provider, o.mode, o.state, o.amount, o.created_at, o.perform_time, o.cancel_time,
          p.ends_at, p.message_limit, p.revoked_at,
          (SELECT COUNT(*) FROM gpt_turn_reservations t WHERE t.org_id=o.org_id AND t.period_id=o.id
             AND (t.status='done' OR (t.status='reserved' AND t.expires_at>?))) AS used,
          f.status_code AS receipt_status, f.receipt_url AS receipt_url,
          r.status_code AS refund_status, r.receipt_url AS refund_url
        FROM gpt_payment_orders_all o
        LEFT JOIN gpt_access_periods p ON p.org_id=o.org_id AND p.order_id=o.id
        LEFT JOIN gpt_fiscal_receipts f ON f.org_id=o.org_id AND f.order_id=o.id AND f.kind='PERFORM'
        LEFT JOIN gpt_fiscal_receipts r ON r.org_id=o.org_id AND r.order_id=o.id AND r.kind='CANCEL'
        WHERE ${where.join(" AND ")}
        ORDER BY o.created_at DESC, o.provider DESC, o.id DESC LIMIT ${AI_CHAT_PAGE_SIZE + 1}`,
        )
        .bind(...binds)
        .all<Row>();
      const found = result.results ?? [];
      const page = found.slice(0, AI_CHAT_PAGE_SIZE);
      const alias = options.salt ? pseudonyms(options.salt) : null;
      const out: AiChatPaymentRow[] = [];
      for (const row of page) {
        const user = String(row.user_id);
        out.push({
          id: String(row.id),
          provider: oneOf(row.provider, AI_CHAT_PROVIDERS, "click"),
          mode: oneOf(row.mode, AI_CHAT_MODES, "test"),
          state: oneOf(row.state, AI_CHAT_ORDER_STATES, "pending"),
          amountUzs: num(row.amount) / 100,
          createdAt: num(row.created_at),
          paidAt: num(row.perform_time) || null,
          cancelledAt: num(row.cancel_time) || null,
          buyer: alias ? await alias("B", `admin-buyer:v1:${user}`) : null,
          rehearsal: user.startsWith(REHEARSAL_ACCOUNT_PREFIX),
          pack:
            row.ends_at === null || row.ends_at === undefined
              ? null
              : {
                  endsAt: num(row.ends_at),
                  limit: num(row.message_limit),
                  used: num(row.used),
                  revokedAt: numOrNull(row.revoked_at),
                },
          receipt:
            row.receipt_status === null || row.receipt_status === undefined
              ? null
              : { status: num(row.receipt_status), url: receiptLink(row.receipt_url) },
          refundReceipt:
            row.refund_status === null || row.refund_status === undefined
              ? null
              : { status: num(row.refund_status), url: receiptLink(row.refund_url) },
        });
      }
      const last = out[out.length - 1];
      return sectionOk({
        rows: out,
        next:
          found.length > AI_CHAT_PAGE_SIZE && last
            ? encodePaymentsCursor({ createdAt: last.createdAt, provider: last.provider, id: last.id })
            : null,
      });
    } catch {
      queryFailed("gpt_admin_payments_failed", options.requestId);
      return sectionError("query_failed");
    }
  }

  /**
   * W13: the 50 IP groups active last in the past `days` days, as pseudonyms.
   * One row is one network after the salt: behind an operator's shared IP
   * there may be many people, and one person may have several rows.
   */
  async visitors(
    orgId: string,
    options: { now: number; days: number; salt: string | null; requestId?: string },
  ): Promise<AiChatSection<AiChatVisitorRow[]>> {
    if (!options.salt) return sectionError("salt_missing");
    try {
      const has = await this.objects();
      if (!has.has("gpt_turn_reservations")) return sectionError("schema_pending");
      const since = options.now - options.days * DAY_MS;
      // Numbered binds: ?1 org, ?2 since (ms), ?3 since (ISO, legacy sessions only).
      const binds: unknown[] = [orgId, since];
      let locale = "NULL";
      if (orgId === BILLING_ORG && has.has("gpt_sessions")) {
        locale = `(SELECT s.locale FROM gpt_sessions s WHERE s.hashed_ip=t.ip_hash AND s.created_at>=?3
              ORDER BY s.created_at DESC LIMIT 1)`;
        binds.push(new Date(since).toISOString());
      }
      const hits = has.has("gpt_limit_hits")
        ? "(SELECT COALESCE(SUM(h.n),0) FROM gpt_limit_hits h WHERE h.org_id=?1 AND h.subject=t.ip_hash AND h.first_at>=?2)"
        : "0";
      const result = await this.db
        .prepare(
          `SELECT t.ip_hash AS h, MIN(t.created_at) AS first_at, MAX(t.created_at) AS last_at, COUNT(*) AS turns,
          SUM(t.status='done') AS answered, COUNT(DISTINCT ${DAY_OF_MS("t.created_at")}) AS days,
          MAX(substr(t.subject,1,5)='acct_') AS account, MAX(t.period_id IS NOT NULL) AS paid,
          ${hits} AS limit_hits, ${locale} AS locale
        FROM gpt_turn_reservations t WHERE t.org_id=?1 AND t.created_at>=?2
        GROUP BY t.ip_hash ORDER BY last_at DESC LIMIT ${VISITOR_LIMIT}`,
        )
        .bind(...binds)
        .all<Row>();
      const alias = pseudonyms(options.salt);
      const out: AiChatVisitorRow[] = [];
      for (const row of result.results ?? []) {
        const locale = text(row.locale);
        out.push({
          alias: await alias("N", `admin-alias:v1:${String(row.h)}`),
          firstAt: num(row.first_at),
          lastAt: num(row.last_at),
          days: num(row.days),
          turns: num(row.turns),
          answered: num(row.answered),
          limitHits: num(row.limit_hits),
          account: num(row.account) > 0,
          paid: num(row.paid) > 0,
          locale: locale === "ru" || locale === "uz" ? locale : null,
        });
      }
      return sectionOk(out);
    } catch {
      queryFailed("gpt_admin_visitors_failed", options.requestId);
      return sectionError("query_failed");
    }
  }
}

function modelRow(row: Row): AiChatModelRow {
  const ttft = numOrNull(row.ttft);
  const cost = numOrNull(row.cost);
  return {
    model: text(row.model),
    turns: num(row.turns),
    answered: num(row.answered),
    truncated: num(row.truncated),
    failed: num(row.failed),
    ttftAvgMs: ttft === null ? null : Math.round(ttft),
    costUsd: cost === null ? null : cost / 1e6,
  };
}

/** When a lease task last ran: its next_at minus its interval. */
function lastRun(rows: Row[], task: string, interval: number): number | null {
  const next = numOrNull(rows.find((row) => row.task === task)?.next_at);
  return next === null ? null : next - interval;
}
