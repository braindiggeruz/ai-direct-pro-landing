// The free allowance, drawn as a thread of segments under the app header.
//
// Why this exists as a graphic and not just the number in AiUsageBadge: the
// moment the allowance runs out is the moment this product asks the visitor for
// something (Telegram, or a contact). A cap that arrives unannounced reads as a
// paywall ambush; a cap the person watched approach for ten messages reads as
// the deal they already accepted. The badge states the number for anyone who
// wants it; the thread makes it peripheral, so nobody has to read anything to
// know where they stand.
//
// Drawn in CSS, no images and no library: the audience is Uzbek mobile on slow
// connections, and this element must cost nothing.
import type { ChatStrings } from '../i18n';

interface Props {
  /** Messages left today; -1 means the server has not told us yet. */
  remaining: number;
  /**
   * The day's full allowance, for the number of segments. The server only ever
   * reports what is left, so the caller passes FREE_DAILY_SEGMENTS, which
   * mirrors GPT_FREE_DAILY_LIMIT in wrangler.toml. If the two ever drift the
   * guard below hides the thread rather than drawing a wrong one.
   */
  total: number;
  t: ChatStrings;
}

/** Segments left in this state switch from cyan to saffron. */
const LOW_AT = 3;

export function AiQuotaThread({ remaining, total, t }: Props) {
  // Unknown allowance, or a paid plan with a large cap: a 600-segment thread is
  // noise, not information. Say nothing rather than draw something wrong.
  if (remaining < 0 || total <= 0 || total > 40 || remaining > total) return null;

  const left = Math.min(remaining, total);
  const low = left > 0 && left <= LOW_AT;

  return (
    <div
      className="shrink-0 px-3 pt-px sm:px-4"
      // The number is already announced by AiUsageBadge in the header; a second
      // live region repeating it after every message would double-speak.
      aria-hidden="true"
      data-testid="ai-quota-thread"
      title={t.remaining(Math.max(0, remaining))}
    >
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-[3px]">
        {Array.from({ length: total }, (_, i) => {
          const spent = i >= left;
          return (
            <span
              key={i}
              className={[
                'h-[3px] flex-1 rounded-full',
                // Only the colour transitions. Animating width or transform here
                // would re-lay-out a 15-item flex row on every answer, on the
                // slowest device this site serves.
                'motion-safe:transition-colors motion-safe:duration-500',
                spent ? 'bg-white/[0.07]' : low ? 'bg-brand-saffron/80' : 'bg-brand-cyan/60',
              ].join(' ')}
            />
          );
        })}
      </div>
    </div>
  );
}
