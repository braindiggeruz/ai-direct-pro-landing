import type { ChatStrings } from '../i18n';

export function AiUsageBadge({ remaining, t }: { remaining: number; t: ChatStrings }) {
  if (remaining < 0) return null; // unknown (no DB / not yet counted)
  const low = remaining <= 3;
  return (
    <div
      className={`text-xs px-3 py-1.5 rounded-full ${
        low ? 'bg-brand-cyan/[0.08] text-brand-cyan' : 'bg-white/[0.04] text-white/45'
      }`}
      aria-live="polite"
    >
      {t.remaining(remaining)}
    </div>
  );
}
