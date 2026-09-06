import { TelegramClient } from "../../channels/telegram/api";
import type { BridgeEnv } from "./bridge-env";
import { BILLING_ORG, type BillingEnv } from "./billing-config";
// Durable, coarse error codes only. One notice per code/hour prevents floods.
export async function recordServiceAlert(
  env: BillingEnv,
  code: string,
  now = Date.now(),
) {
  console.warn(JSON.stringify({ event: "gpt_service_failure", code }));
  if (env.GPT_BILLING_MODE === "test") return;
  if (!env.GPTBOT_DRAFTS_DB) return;
  await env.GPTBOT_DRAFTS_DB.prepare(
    "INSERT OR IGNORE INTO gpt_service_alerts(org_id,id,code,created_at) VALUES(?,?,?,?)",
  )
    .bind(BILLING_ORG, `${code}:${Math.floor(now / 3600_000)}`, code, now)
    .run();
}
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
    db
      .prepare(
        "DELETE FROM gpt_turn_reservations WHERE rowid IN (SELECT rowid FROM gpt_turn_reservations WHERE org_id=? AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - 93 * 86400_000),
    db
      .prepare(
        "DELETE FROM gpt_model_attempts WHERE rowid IN (SELECT rowid FROM gpt_model_attempts WHERE org_id=? AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - 93 * 86400_000),
    db
      .prepare(
        "DELETE FROM gpt_service_alerts WHERE rowid IN (SELECT rowid FROM gpt_service_alerts WHERE org_id=? AND delivered_at IS NOT NULL AND created_at<? LIMIT 500)",
      )
      .bind(BILLING_ORG, now - 93 * 86400_000),
  ]);
  const token = env.GPT_NOTIFY_BOT_TOKEN || env.TELEGRAM_ASSISTANT_BOT_TOKEN;
  const chat = Number(env.GPT_NOTIFY_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID);
  // Switching a preview into test mode must not drain any live notifications.
  if (env.GPT_BILLING_MODE !== "live")
    return { delivered: 0, configured: false };
  if (!token || !Number.isSafeInteger(chat) || !chat)
    return { delivered: 0, configured: false };
  const rows = await db
    .prepare(
      `SELECT o.id,o.order_id,o.event,p.provider,p.mode FROM gpt_billing_outbox o JOIN gpt_payment_orders p ON p.id=o.order_id AND p.org_id=o.org_id
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
    const result = await new TelegramClient(token).call(
      "sendMessage",
      {
        chat_id: chat,
        text: `GPTBot Plus: ${row.event}\n${row.provider} · 20 000 UZS\n${row.order_id}\nТекст разговора и данные Telegram-аккаунта не передаются.`,
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
  if (env.GPT_BILLING_MODE === "live") {
    const alerts = await db
      .prepare(
        "SELECT id,code FROM gpt_service_alerts WHERE org_id=? AND delivered_at IS NULL AND lease_until<=? ORDER BY created_at LIMIT 2",
      )
      .bind(BILLING_ORG, now)
      .all<{ id: string; code: string }>();
    for (const alert of alerts.results || []) {
      const claim = await db
        .prepare(
          "UPDATE gpt_service_alerts SET lease_until=? WHERE org_id=? AND id=? AND delivered_at IS NULL AND lease_until<=? RETURNING id",
        )
        .bind(now + 300_000, BILLING_ORG, alert.id, now)
        .first();
      if (!claim) continue;
      const sent = await new TelegramClient(token).call(
        "sendMessage",
        {
          chat_id: chat,
          text: `GPTBot: сбой ${alert.code}. Проверьте Workers logs, модели и баланс OpenRouter.`,
        },
        { timeoutMs: 4000, maxRetries: 0 },
      );
      if (sent.ok)
        await db
          .prepare(
            "UPDATE gpt_service_alerts SET delivered_at=? WHERE org_id=? AND id=?",
          )
          .bind(Date.now(), BILLING_ORG, alert.id)
          .run();
    }
  }
  return { delivered, configured: true };
}
