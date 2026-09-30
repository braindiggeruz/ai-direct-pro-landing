// Operator alerts from the chat's model chain.
//
// Every code goes through recordServiceAlert (one gpt_service_alerts row per
// code per hour; maintainBilling delivers those to Telegram only in live
// billing mode). Two Z.ai conditions cannot wait for billing to go live,
// because nothing but a human fixes them and until then every paid answer
// silently runs on the fallback:
//   zai_balance_exhausted  Z.ai 1113 — the prepaid balance is empty
//   zai_auth_failed        Z.ai 401/1000-series/1220 — the key was rejected
// Those two are also pushed straight to the owner, at most once per code per
// hour, with their own counter ('operator_alert') — never the 'lead_notify'
// ceiling, so a lead flood cannot mute them and they cannot mute leads.
//
// Best-effort by contract: never throws, and the alert text carries no user
// text, no key and no provider message.
import type { BridgeEnv } from "./bridge-env";
import { recordServiceAlert } from "./billing-maintenance-store";
import { consumeRateLimit, HOUR_MS } from "./rate-limit";
import { sendOwnerAlert } from "./notify";

const OWNER_PUSH: Readonly<Record<string, string>> = {
  zai_balance_exhausted:
    "GPTBot AI-чат: Z.ai — закончился баланс. Ответы идут через резервные модели OpenRouter.",
  zai_auth_failed:
    "GPTBot AI-чат: Z.ai — ключ отклонён. Ответы идут через резервные модели OpenRouter.",
};

export async function alertOperator(
  env: BridgeEnv,
  db: D1Database | undefined,
  code: string,
  now = Date.now(),
): Promise<void> {
  try {
    await recordServiceAlert(env, code, now);
  } catch {
    console.warn("gpt_operator_alert_record_failed");
  }
  const text = OWNER_PUSH[code];
  if (!text || !db) return;
  try {
    const slot = await consumeRateLimit(
      db,
      "operator_alert",
      code,
      { limit: 1, windowMs: HOUR_MS },
      new Date(now),
    );
    // A degraded counter (D1 unreachable) stays quiet: the model cooldown
    // lives in the same database, so without it every turn would page.
    if (!slot.allowed || slot.degraded) return;
    const result = await sendOwnerAlert(env, { text });
    console.warn(JSON.stringify({ event: "gpt_operator_alert", code, status: result.status }));
  } catch {
    console.warn("gpt_operator_alert_failed");
  }
}
