import type { ChatStrings } from './i18n';

/**
 * The header's count of free messages (chat design §5.1): whichever runs out
 * first, this hour's or today's, and 0 while the hourly limit stands. It used
 * to show the day's «10» to someone the hour had just stopped (map 04 U-01).
 * `low` turns it saffron at the same points as the line at the end of the
 * thread: 2 left this hour, 3 today. Null while the server has not counted.
 * It was the AiUsageBadge pill; the header's subtitle says it now.
 */
export function usageLine(
  remaining: number,
  /** Free messages left in the rolling hour from the last answered turn; null when unknown. */
  hourLeft: number | null,
  /** The hourly limit stands now. */
  hourBlocked: boolean,
  t: ChatStrings,
): { text: string; low: boolean } | null {
  if (remaining < 0) return null;
  const hourly = hourBlocked || (hourLeft !== null && hourLeft < remaining);
  const n = hourBlocked ? 0 : hourly && hourLeft !== null ? hourLeft : remaining;
  return { text: hourly ? t.hourRemaining(n) : t.remaining(n), low: hourly ? n <= 2 : n <= 3 };
}
