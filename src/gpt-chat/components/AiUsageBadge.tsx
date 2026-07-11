import type { ChatStrings } from '../i18n';

export function AiUsageBadge({ remaining, t }: { remaining: number; t: ChatStrings }) {
  if (remaining < 0) return null; // unknown (no DB / not yet counted)
  const low = remaining <= 3;
  return (
    <div
      className={`text-xs px-3 py-1 rounded-full border ${
        low ? 'border-brand-cyan/50 text-brand-cyan' : 'border-white/10 text-white/60'
      }`}
      aria-live="polite"
    >
      {t.remaining(remaining)}
    </div>
  );
}
