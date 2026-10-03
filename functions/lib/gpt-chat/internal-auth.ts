// The Bearer of the internal AI-chat routes: functions/api/internal/gpt-*
// and javob-setup. They return money (gpt-click-reversal, gpt-uzum-refund),
// record refunds, open rehearsal sessions and change the bot's profile, so
// the secret they share with the automation Worker's cron,
// GPT_BILLING_MAINTENANCE_SECRET, must be one nobody can guess: shorter than
// 32 characters it counts as unset, as every secret of billing-config.ts
// does, and the routes stay closed. Compared in constant time.
import { sameSecret } from "./payment-protocol";

/** Below this length the Bearer secret counts as unset (billing-config.ts). */
export const MIN_INTERNAL_SECRET_LENGTH = 32;

/** `Authorization: Bearer <secret>`, with a secret long enough to count as set. */
export function internalAuthorized(
  request: Request,
  secret: string | undefined,
): boolean {
  return (
    !!secret &&
    secret.length >= MIN_INTERNAL_SECRET_LENGTH &&
    sameSecret(request.headers.get("authorization") || "", `Bearer ${secret}`)
  );
}
