import type { ChatStrings } from '../i18n';

export function AiUsageBadge({ remaining, t }: { remaining: number; t: ChatStrings }) {
  if (remaining < 0) return null; // unknown (no DB / not yet counted)
  const low = remaining <= 3;
  const full = t.remaining(remaining);
  return (
    <div
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs sm:px-3 ${
        low ? 'bg-brand-cyan/[0.08] text-brand-cyan' : 'bg-white/[0.04] text-white/45'
      }`}
      aria-live="polite"
      // The full sentence is what a screen reader and a hover both get; the
      // phone gets the number alone, because at 360px the sentence squeezed
      // the brand and the language switcher onto two lines.
      aria-label={full}
      title={full}
    >
      <span className="sm:hidden" aria-hidden="true">{remaining}</span>
      <span className="hidden sm:inline" aria-hidden="true">{full}</span>
    </div>
  );
}
