import type { ChatStrings } from '../i18n';

/**
 * The header's count of free messages: whichever runs out first, this hour's
 * or today's, and 0 while the hourly limit stands. It used to show the day's
 * «10» to someone the hour had just stopped (map 04 U-01). It turns saffron
 * at the same point as the warning above the composer: 2 left this hour, 3
 * today.
 */
export function AiUsageBadge({ remaining, hourLeft, hourBlocked, t }: {
  remaining: number;
  /** Free messages left in the rolling hour from the last answered turn; null when unknown. */
  hourLeft: number | null;
  /** The hourly limit stands now. */
  hourBlocked: boolean;
  t: ChatStrings;
}) {
  if (remaining < 0) return null; // unknown (no DB / not yet counted)
  const hourly = hourBlocked || (hourLeft !== null && hourLeft < remaining);
  const n = hourBlocked ? 0 : hourly && hourLeft !== null ? hourLeft : remaining;
  const full = hourly ? t.hourRemaining(n) : t.remaining(n);
  const low = hourly ? n <= 2 : n <= 3;
  return (
    <div
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs sm:px-3 ${
        low ? 'bg-brand-saffron/[0.06] text-brand-saffron' : 'bg-white/[0.04] text-white/45'
      }`}
      // The phone gets the number alone, because at 360px the sentence
      // squeezed the brand and the language switcher onto two lines; a hover
      // and a screen reader get the sentence (the status says it when it changes).
      title={full}
    >
      <span className="sm:hidden" aria-hidden="true">{n}</span>
      <span className="hidden sm:inline" aria-hidden="true">{full}</span>
      <span className="sr-only" role="status">{full}</span>
    </div>
  );
}
