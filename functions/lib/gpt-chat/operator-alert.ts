// Owner alerts from the web chat, delivered right away instead of waiting for
// the maintenance cron.
//
// alertOperator records one service alert (recordServiceAlert: one row per
// code per hour), optionally runs the silence watchdog (a failed turn is the
// watchdog's second circuit when the cron is down), then delivers whatever is
// urgent (deliverServiceAlerts). That is one path for every code in every
// billing mode: the Z.ai balance/key alerts (zai_balance_exhausted,
// zai_auth_failed) used to bypass it with a push of their own only because
// delivery was tied to live billing. The global GPT_ALERTS_MAX_PER_HOUR
// ceiling is not the 'lead_notify' one, so a lead flood cannot mute these
// alerts and they cannot mute leads.
//
// Best-effort by contract: never throws, and the alert carries no user text,
// no key and no provider message. No retention sweep runs on this path.
import type { BridgeEnv } from "./bridge-env";
import {
  deliverServiceAlerts,
  recordServiceAlert,
} from "./billing-maintenance-store";
import { runWatchdog } from "./watchdog-store";

export async function alertOperator(
  env: BridgeEnv,
  code: string,
  options: { watchdog?: boolean } = {},
  now = Date.now(),
): Promise<void> {
  try {
    await recordServiceAlert(env, code, now);
  } catch {
    console.warn("gpt_operator_alert_record_failed");
  }
  if (options.watchdog)
    try {
      await runWatchdog(env, now);
    } catch {
      console.warn("gpt_watchdog_failed");
    }
  try {
    await deliverServiceAlerts(env, now);
  } catch {
    console.warn("gpt_operator_alert_failed");
  }
}
