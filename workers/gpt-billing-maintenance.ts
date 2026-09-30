// Existing automation worker invokes this optional task every 15 minutes.
// Pages owns the payment ledger, the alerts and the watchdog; no second DB
// authority or provider credentials in this worker. Opt-in: the var
// GPT_BILLING_MAINTENANCE_ENABLED="true" (wrangler.automation.toml) and the
// secret GPT_BILLING_MAINTENANCE_SECRET, equal on this Worker and on Pages.
export async function runGptBillingMaintenance(env: {
  GPT_BILLING_MAINTENANCE_ENABLED?: string;
  GPT_BILLING_MAINTENANCE_SECRET?: string;
}): Promise<void> {
  if (
    env.GPT_BILLING_MAINTENANCE_ENABLED !== "true" ||
    !env.GPT_BILLING_MAINTENANCE_SECRET
  )
    return;
  try {
    const response = await fetch(
      "https://gptbot.uz/api/internal/gpt-billing-maintenance",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GPT_BILLING_MAINTENANCE_SECRET}`,
        },
        // The hook runs first in scheduled() and delays Lead Radar behind it;
        // the endpoint's step budgets add up to less than this.
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error();
    const body = (await response.json()) as { ok?: boolean };
    if (body.ok !== true) throw new Error();
  } catch {
    console.warn("gpt_billing_maintenance_failed");
  }
}
