import { TelegramClient } from "../../channels/telegram/api";
import { boundedNum, type BridgeEnv } from "./bridge-env";
import {
  BILLING_ORG,
  providersInMode,
  type BillingEnv,
} from "./billing-config";
import {
  alertRowId,
  renderAlertMessage,
  URGENT_ALERT_PATTERNS,
  type UrgentLine,
} from "./alert-policy";
import { spendDay } from "./model-spend-store";
import { resolveOwnerNotify } from "./notify";
import { restoreNotice } from "./guest-restore";
import { consumeRateLimit, DAY_MS, HOUR_MS } from "./rate-limit";

/**
 * Record one durable, coarse error code, whatever GPT_BILLING_MODE is: a
 * test-mode rehearsal has to see its alerts too. One row per code per hour
 * (per day for state alerts, alert-policy.ts) prevents floods. Recording never
 * sends anything; deliverServiceAlerts does.
 */
export async function recordServiceAlert(
  env: BillingEnv,
  code: string,
  now = Date.now(),
) {
  console.warn(JSON.stringify({ event: "gpt_service_failure", code }));
  if (!env.GPTBOT_DRAFTS_DB) return;
  await env.GPTBOT_DRAFTS_DB.prepare(
    "INSERT OR IGNORE INTO gpt_service_alerts(org_id,id,code,created_at) VALUES(?,?,?,?)",
  )
    .bind(BILLING_ORG, alertRowId(code, now), code, now)
    .run();
}

/** An undelivered urgent alert older than this is stale news, not a page. */
const ALERT_LOOKBACK_MS = 24 * HOUR_MS;
/** A claimed batch whose send failed (or whose isolate died) is retried after this. */
const ALERT_LEASE_MS = 5 * 60_000;
const ALERT_BATCH = 40;
const URGENT_SQL = `(${URGENT_ALERT_PATTERNS.map(() => "code GLOB ?").join(" OR ")})`;

export type AlertDeliveryStatus =
  | "disabled"
  | "unconfigured"
  | "idle"
  | "capped"
  | "sent"
  | "failed";

export interface AlertDelivery {
  status: AlertDeliveryStatus;
  /** Urgent codes in the batch; codes only, never text or identifiers. */
  codes: string[];
}

/**
 * Send pending URGENT service alerts to the owner as one Telegram message,
 * independent of GPT_BILLING_MODE. It needs a channel (GPT_NOTIFY_* or the
 * assistant-bot fallback, see notify.ts) and GPT_ALERTS_ENABLED other than
 * "false", the emergency switch.
 *
 * - The batch is claimed with one UPDATE, so concurrent callers (the cron, a
 *   failing chat turn) never send the same alert twice.
 * - Every message spends one slot of GPT_ALERTS_MAX_PER_HOUR (default 6)
 *   across all callers. A batch over the ceiling waits for the next window.
 * - Background codes never send. Those of the last hour ride along as context.
 * - A failed send keeps its lease and is retried after ALERT_LEASE_MS.
 */
export async function deliverServiceAlerts(
  env: BillingEnv & BridgeEnv,
  now = Date.now(),
): Promise<AlertDelivery> {
  if (env.GPT_ALERTS_ENABLED === "false")
    return { status: "disabled", codes: [] };
  const db = env.GPTBOT_DRAFTS_DB;
  const channel = resolveOwnerNotify(env);
  if (!db || !channel.configured) return { status: "unconfigured", codes: [] };
  const claimed = await db
    .prepare(
      `UPDATE gpt_service_alerts SET lease_until=? WHERE rowid IN (SELECT rowid FROM gpt_service_alerts
      WHERE org_id=? AND delivered_at IS NULL AND lease_until<=? AND created_at>=? AND ${URGENT_SQL}
      ORDER BY created_at LIMIT ${ALERT_BATCH}) RETURNING id,code,created_at`,
    )
    .bind(
      now + ALERT_LEASE_MS,
      BILLING_ORG,
      now,
      now - ALERT_LOOKBACK_MS,
      ...URGENT_ALERT_PATTERNS,
    )
    .all<{ id: string; code: string; created_at: number }>();
  const rows = (claimed.results || []).sort(
    (a, b) => a.created_at - b.created_at,
  );
  if (!rows.length) return { status: "idle", codes: [] };
  const lines: UrgentLine[] = [];
  for (const row of rows) {
    const line = lines.find((l) => l.code === row.code);
    if (line) line.count++;
    else lines.push({ code: row.code, count: 1 });
  }
  const codes = lines.map((l) => l.code);
  const ids = rows.map((r) => r.id);
  const inIds = `id IN (${ids.map(() => "?").join(",")})`;
  const slot = await consumeRateLimit(
    db,
    "service_alert",
    "global",
    {
      limit: boundedNum(env.GPT_ALERTS_MAX_PER_HOUR, 6, 1, 60),
      windowMs: HOUR_MS,
    },
    new Date(now),
  );
  // A degraded counter still sends: the claim above already bounds this batch
  // to one message, and staying quiet would lose an urgent alert.
  if (!slot.allowed) {
    await db
      .prepare(
        `UPDATE gpt_service_alerts SET lease_until=? WHERE org_id=? AND ${inIds}`,
      )
      .bind(now + slot.retryAfterSeconds * 1000, BILLING_ORG, ...ids)
      .run();
    return { status: "capped", codes };
  }
  const background = await db
    .prepare(
      `SELECT DISTINCT code FROM gpt_service_alerts WHERE org_id=? AND created_at>=? AND NOT ${URGENT_SQL} ORDER BY code LIMIT 10`,
    )
    .bind(BILLING_ORG, now - HOUR_MS, ...URGENT_ALERT_PATTERNS)
    .all<{ code: string }>();
  const sent = await new TelegramClient(channel.token).call(
    "sendMessage",
    {
      // Numeric ids are the normal case; a @channel target stays a string.
      chat_id: /^-?\d+$/.test(channel.chatId)
        ? Number(channel.chatId)
        : channel.chatId,
      text: renderAlertMessage(
        lines,
        (background.results || []).map((r) => r.code),
      ),
    },
    { timeoutMs: 4000, maxRetries: 0 },
  );
  if (!sent.ok) return { status: "failed", codes };
  await db
    .prepare(
      `UPDATE gpt_service_alerts SET delivered_at=?,lease_until=0 WHERE org_id=? AND ${inIds}`,
    )
    .bind(now, BILLING_ORG, ...ids)
    .run();
  return { status: "sent", codes };
}

/**
 * Days the text-free telemetry is kept: turns, model attempts, service
 * alerts, spend and limit counters, the pack window's funnel steps, and the
 * chat's breadcrumbs of leads and of the way to the bot (gpt_events). The
 * privacy policy states this number (tests/legal-oferta.test.ts).
 */
export const TELEMETRY_RETENTION_DAYS = 93;

/**
 * Retention sweeps and the payment outbox. Service alerts are delivered by
 * deliverServiceAlerts; only the outbox is gated on live billing (some
 * provider live), and it carries live orders only.
 */
export async function maintainBilling(
  env: BillingEnv & BridgeEnv,
  now = Date.now(),
) {
  const db = env.GPTBOT_DRAFTS_DB!;
  // Bounded retention sweeps; financial rows are retained for reconciliation.
  await db.batch([
    db
      .prepare(
        "DELETE FROM gpt_auth_challenges WHERE rowid IN (SELECT rowid FROM gpt_auth_challenges WHERE org_id=? AND expires_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now),
    db
      .prepare(
        "DELETE FROM gpt_auth_sessions WHERE rowid IN (SELECT rowid FROM gpt_auth_sessions WHERE org_id=? AND expires_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now),
    // Sign-in attempts through the bot (bot-login-store.ts): a day after their 10 minutes.
    db
      .prepare(
        "DELETE FROM gpt_bot_logins WHERE rowid IN (SELECT rowid FROM gpt_bot_logins WHERE org_id=? AND expires_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - DAY_MS),
    db
      .prepare(
        "DELETE FROM gpt_turn_reservations WHERE rowid IN (SELECT rowid FROM gpt_turn_reservations WHERE org_id=? AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - TELEMETRY_RETENTION_DAYS * DAY_MS),
    db
      .prepare(
        "DELETE FROM gpt_model_attempts WHERE rowid IN (SELECT rowid FROM gpt_model_attempts WHERE org_id=? AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - TELEMETRY_RETENTION_DAYS * DAY_MS),
    // Background alerts are never delivered on their own, so age alone decides.
    db
      .prepare(
        "DELETE FROM gpt_service_alerts WHERE rowid IN (SELECT rowid FROM gpt_service_alerts WHERE org_id=? AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - TELEMETRY_RETENTION_DAYS * DAY_MS),
    // The pack window's funnel steps (WP-17): no text, IP or account.
    db
      .prepare(
        "DELETE FROM gpt_ui_events WHERE rowid IN (SELECT rowid FROM gpt_ui_events WHERE org_id=? AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - TELEMETRY_RETENTION_DAYS * DAY_MS),
    // The chat's breadcrumbs (migrations/0008, no org_id): a lead sent, the
    // way to the bot taken, with the session, intent and page and, once
    // claimed, the bot user's pseudonym. No message text. Kept as long as
    // the other text-free telemetry; created_at is ISO text (0069 indexes it).
    db
      .prepare(
        "DELETE FROM gpt_events WHERE rowid IN (SELECT rowid FROM gpt_events WHERE created_at<? LIMIT 500)",
      )
      .bind(new Date(now - TELEMETRY_RETENTION_DAYS * DAY_MS).toISOString()),
    // migrations/0066: daily counters, keyed by UTC day.
    db
      .prepare(
        "DELETE FROM gpt_model_spend WHERE rowid IN (SELECT rowid FROM gpt_model_spend WHERE org_id=? AND day<? LIMIT 500)",
      )
      .bind(BILLING_ORG, spendDay(now - TELEMETRY_RETENTION_DAYS * DAY_MS)),
    db
      .prepare(
        "DELETE FROM gpt_limit_hits WHERE rowid IN (SELECT rowid FROM gpt_limit_hits WHERE org_id=? AND day<? LIMIT 500)",
      )
      .bind(BILLING_ORG, spendDay(now - TELEMETRY_RETENTION_DAYS * DAY_MS)),
    // Closed anti-abuse windows (none is longer than a day). They are keyed by
    // the IP hash and are not rekeyed with the salt (salt-rekey-store.ts), so
    // they must not outlive their window by weeks either.
    db
      .prepare(
        "DELETE FROM gpt_rate_limits WHERE rowid IN (SELECT rowid FROM gpt_rate_limits WHERE window_start<? LIMIT 500)",
      )
      .bind(new Date(now - 2 * DAY_MS).toISOString()),
  ]);
  const token = env.GPT_NOTIFY_BOT_TOKEN || env.TELEGRAM_ASSISTANT_BOT_TOKEN;
  const chat = Number(env.GPT_NOTIFY_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID);
  // Only while some provider is live: a deployment with every provider in
  // test (or off) must not drain any live notifications.
  if (!providersInMode(env, "live").length)
    return { delivered: 0, configured: false };
  if (!token || !Number.isSafeInteger(chat) || !chat)
    return { delivered: 0, configured: false };
  const rows = await db
    .prepare(
      `SELECT o.id,o.order_id,o.event,p.provider,p.mode FROM gpt_billing_outbox o JOIN gpt_payment_orders_all p ON p.id=o.order_id AND p.org_id=o.org_id
    WHERE o.org_id=? AND p.mode='live' AND o.delivered_at IS NULL AND o.available_at<=? AND o.lease_until<=? ORDER BY o.created_at LIMIT 3`,
    )
    .bind(BILLING_ORG, now, now)
    .all<{
      id: string;
      order_id: string;
      event: string;
      provider: string;
      mode: string;
    }>();
  let delivered = 0;
  for (const row of rows.results || []) {
    if (row.mode !== "live") continue;
    const lease = crypto.randomUUID();
    const claimed = await db
      .prepare(
        "UPDATE gpt_billing_outbox SET lease_until=?,lease_token=?,attempts=attempts+1 WHERE org_id=? AND id=? AND delivered_at IS NULL AND lease_until<=? RETURNING id",
      )
      .bind(now + 60_000, lease, BILLING_ORG, row.id, now)
      .first();
    if (!claimed) continue;
    // A guest's paid order: Click's payment id and the restore link (guest-restore.ts).
    const guest =
      row.event === "paid" && row.provider === "click"
        ? await restoreNotice(db, env.GPT_IDENTITY_SECRET, row.order_id, now)
        : "";
    const result = await new TelegramClient(token).call(
      "sendMessage",
      {
        chat_id: chat,
        text: `GPTBot.uz · AI paket: ${row.event}\n${row.provider} · 20 000 UZS\n${row.order_id}\nТекст разговора и данные Telegram-аккаунта не передаются.${guest}`,
      },
      { timeoutMs: 4000, maxRetries: 0 },
    );
    await db
      .prepare(
        "UPDATE gpt_billing_outbox SET delivered_at=?,available_at=?,lease_until=0 WHERE org_id=? AND id=? AND lease_token=?",
      )
      .bind(
        result.ok ? Date.now() : null,
        now + 300_000,
        BILLING_ORG,
        row.id,
        lease,
      )
      .run();
    if (result.ok) delivered++;
  }
  return { delivered, configured: true };
}
