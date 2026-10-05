// The Tashkent calendar the bot's free limits turn on. Its own module so that
// store.ts (the /delete_me wipe) and billing.ts (the quota decisions) share
// it without importing each other: billing.ts already imports store.ts.

/** Tashkent keeps UTC+5 all year (no daylight saving). */
const TASHKENT_OFFSET_MS = 5 * 3600_000;

/**
 * Where the Tashkent day and month holding `now` began, as the ISO instants
 * the ledger's created_at is compared with. The bot's limits turn at 00:00 in
 * Tashkent (19:00 UTC the day before), which is what the bot tells people.
 */
export function tashkentPeriodStarts(now = new Date()): { day: string; month: string } {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    day: new Date(Date.UTC(year, month, local.getUTCDate()) - TASHKENT_OFFSET_MS).toISOString(),
    month: new Date(Date.UTC(year, month, 1) - TASHKENT_OFFSET_MS).toISOString(),
  };
}

/**
 * SQL for the start of the Tashkent day that holds the ISO instant in
 * `column`, in the same form as tashkentPeriodStarts().day (store.ts groups
 * the /delete_me carry-over by it). Same UTC+5 offset as above.
 */
export function tashkentDayStartSql(column: string): string {
  const minutes = TASHKENT_OFFSET_MS / 60_000;
  return `strftime('%Y-%m-%dT%H:%M:%fZ', date(${column}, '+${minutes} minutes'), '-${minutes} minutes')`;
}
