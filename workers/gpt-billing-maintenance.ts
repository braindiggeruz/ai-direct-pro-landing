// Existing automation worker invokes this optional task. Pages owns the
// payment ledger; no second DB authority or provider credentials in this worker.
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
        signal: AbortSignal.timeout(30_000),
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
