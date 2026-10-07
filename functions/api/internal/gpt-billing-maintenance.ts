// POST /api/internal/gpt-billing-maintenance — one maintenance tick.
// Auth: Authorization: Bearer GPT_BILLING_MAINTENANCE_SECRET. The automation
// Worker's cron calls it every 15 minutes (workers/gpt-billing-maintenance.ts,
// 20 s timeout), independent of GPT_BILLING_MODE.
//
// Steps, in order, each with its own try/catch and time budget so one broken
// step cannot starve the others (the budgets add up to less than the Worker's
// timeout):
//   providers    OpenRouter chain endpoints and key, at most hourly
//   watchdog     silence watchdog, at most every 10 minutes
//   fiscal       fiscal receipts that are due (Click, and Uzum's through the
//                Fiscalization API), at most 5 (fiscal-store.ts).
//   uzum         Uzum orders a callback or webhook left open: card payments to
//                settle from Uzum's status, missing receipts of auto-fiscalized
//                ones, app transactions to close or finish (uzum-maintenance.ts);
//                off while Uzum is.
//                fiscal and uzum start first and run beside providers and
//                watchdog: a receipt or a status is several calls to Click or
//                Uzum, too slow for a slice of their own. Alerts wait for
//                both, so click_fiscal_failed and the uzum_* codes go out this
//                tick.
//   alerts       deliver urgent service alerts to the owner
//   maintenance  retention sweeps; the payment outbox in live mode
//   rekey        after GPT_HASH_SALT_SINCE, one batch of legacy hashes per
//                table to their salted v2 (salt-rekey-store.ts)
//   retention    chat messages older than GPT_MESSAGES_RETENTION_DAYS; off
//                while that is empty (retention-store.ts)
//   diagnostics  outbox, last hour of turns, blocked models, and each payment
//                provider's mode with the names liveReadiness() still lacks
// Any failed step answers 503 with `failed`, so the Worker logs it; the other
// steps still ran.
//
// Body {"drill":true} first records the urgent code 'drill' (at most one per
// hour), so the same tick delivers a training alert end to end. Any other body
// is ignored except invalid JSON (400).
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import {
  deliverServiceAlerts,
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { internalAuthorized } from "../../lib/gpt-chat/internal-auth";
import { fail, json, readTextLimited } from "../../lib/gpt-chat/http";
import {
  inspectBilling,
  checkBillingProviders,
} from "../../lib/gpt-chat/billing-operations-store";
import { runWatchdog } from "../../lib/gpt-chat/watchdog-store";
import { rekeySaltedHashes } from "../../lib/gpt-chat/salt-rekey-store";
import { purgeChatMessages } from "../../lib/gpt-chat/retention-store";
import { fiscalizeDue } from "../../lib/gpt-chat/fiscal-store";
import { maintainUzum } from "../../lib/gpt-chat/uzum-maintenance";
import { maintainStudio } from "../../lib/studio/maintenance";

// 19 s together, under the Worker's 20 s timeout: fiscal and uzum run beside
// providers + watchdog (8 s each), then alerts and the rest follow one by one.
const STEP_BUDGET_MS = {
  providers: 6_000,
  watchdog: 2_000,
  fiscal: 8_000,
  uzum: 8_000,
  alerts: 4_500,
  maintenance: 2_500,
  rekey: 2_000,
  retention: 1_000,
  diagnostics: 1_000,
  studio: 1_000,
} as const;
type Step = keyof typeof STEP_BUDGET_MS;
/**
 * No receipt and no Uzum call starts after this. One already started may
 * still make up to three calls of 0.5 s at most (fiscal-store.ts,
 * uzum-maintenance.ts), so each step ends well inside its 8 s.
 */
const FISCAL_RUN_MS = 5_000;

async function withBudget<T>(run: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("step_timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
  if (!internalAuthorized(request, env.GPT_BILLING_MAINTENANCE_SECRET))
    return fail("forbidden", "Forbidden", 403);
  if (!env.GPTBOT_DRAFTS_DB) return fail("unavailable", "Unavailable", 503);
  const body = await readTextLimited(request, 256);
  if (!body.ok && body.code === "payload_too_large")
    return fail("payload_too_large", "Invalid request body", 413);
  let drill = false;
  if (body.ok && body.value.trim()) {
    try {
      const parsed: unknown = JSON.parse(body.value);
      drill =
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as { drill?: unknown }).drill === true;
    } catch {
      return fail("bad_json", "Invalid JSON body");
    }
  }
  try {
    // The chat tables too: the rekey and retention steps and the rate-limit
    // sweep work on them.
    await ensureSchema(env.GPTBOT_DRAFTS_DB);
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    if (drill) await recordServiceAlert(env, "drill");
  } catch {
    return fail("maintenance_failed", "Retry", 503);
  }
  const failed: Step[] = [];
  const step = async <T>(name: Step, run: () => Promise<T>) => {
    try {
      return await withBudget(run, STEP_BUDGET_MS[name]);
    } catch (error) {
      failed.push(name);
      console.warn(
        JSON.stringify({
          event: "gpt_maintenance_step_failed",
          step: name,
          timeout: error instanceof Error && error.message === "step_timeout",
        }),
      );
      return null;
    }
  };
  // Not awaited yet: receipts and Uzum run beside the next two steps.
  const fiscalRun = step("fiscal", () =>
    fiscalizeDue(env, { budgetMs: FISCAL_RUN_MS }),
  );
  const uzumRun = step("uzum", () => maintainUzum(env, { budgetMs: FISCAL_RUN_MS }));
  const providers = await step("providers", () => checkBillingProviders(env));
  const watchdog = await step("watchdog", () => runWatchdog(env));
  const fiscal = await fiscalRun;
  const uzum = await uzumRun;
  const alerts = await step("alerts", () => deliverServiceAlerts(env));
  const [maintenance, studio] = await Promise.all([
    step("maintenance", () => maintainBilling(env)),
    step("studio", () => maintainStudio(env)),
  ]);
  const rekey = await step("rekey", () => rekeySaltedHashes(env));
  const retention = await step("retention", () => purgeChatMessages(env));
  const diagnostics = await step("diagnostics", () => inspectBilling(env));
  return json(
    {
      ok: failed.length === 0,
      failed,
      providers,
      watchdog,
      fiscal,
      uzum,
      alerts,
      ...maintenance,
      studio,
      rekey,
      retention,
      ...diagnostics,
    },
    failed.length ? 503 : 200,
  );
};
