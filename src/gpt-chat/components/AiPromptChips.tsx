import type { PromptChip } from '../i18n';

// Empty-state prompt chips (max 6). A tap prefills the composer and focuses
// it — never auto-sends. Horizontal wrap on desktop, 2-column grid on mobile.
export function AiPromptChips({
  chips,
  onPick,
  disabled,
  label,
}: {
  chips: PromptChip[];
  onPick: (chip: PromptChip) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2" role="list" aria-label={label}>
      {chips.slice(0, 6).map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="listitem"
          disabled={disabled}
          onClick={() => onPick(chip)}
          className="min-h-11 text-[13px] px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
