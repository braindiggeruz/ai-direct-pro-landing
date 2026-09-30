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
//   alerts       deliver urgent service alerts to the owner
//   maintenance  retention sweeps; the payment outbox in live mode
//   diagnostics  outbox, last hour of turns, blocked models
// Any failed step answers 503 with `failed`, so the Worker logs it; the other
// steps still ran.
//
// Body {"drill":true} first records the urgent code 'drill' (at most one per
// hour), so the same tick delivers a training alert end to end. Any other body
// is ignored except invalid JSON (400).
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import {
  deliverServiceAlerts,
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { sameSecret } from "../../lib/gpt-chat/payment-protocol";
import { fail, json, readTextLimited } from "../../lib/gpt-chat/http";
import {
  inspectBilling,
  checkBillingProviders,
} from "../../lib/gpt-chat/billing-operations-store";
import { runWatchdog } from "../../lib/gpt-chat/watchdog-store";

const STEP_BUDGET_MS = {
  providers: 6_000,
  watchdog: 2_000,
  alerts: 5_000,
  maintenance: 4_000,
  diagnostics: 2_000,
} as const;
type Step = keyof typeof STEP_BUDGET_MS;

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
  const secret = env.GPT_BILLING_MAINTENANCE_SECRET;
  if (
    !secret ||
    !sameSecret(request.headers.get("authorization") || "", `Bearer ${secret}`)
  )
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
  const providers = await step("providers", () => checkBillingProviders(env));
  const watchdog = await step("watchdog", () => runWatchdog(env));
  const alerts = await step("alerts", () => deliverServiceAlerts(env));
  const maintenance = await step("maintenance", () => maintainBilling(env));
  const diagnostics = await step("diagnostics", () => inspectBilling(env));
  return json(
    {
      ok: failed.length === 0,
      failed,
      providers,
      watchdog,
      alerts,
      ...maintenance,
      ...diagnostics,
    },
    failed.length ? 503 : 200,
  );
};
