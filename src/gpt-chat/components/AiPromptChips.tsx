import type { PromptCategory } from '../i18n';

export function AiPromptChips({
  categories,
  onPick,
  disabled,
}: {
  categories: PromptCategory[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3" role="list" aria-label="Категории запросов">
      {categories.map((cat) => (
        <div key={cat.label} className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40 min-w-[92px]">{cat.label}</span>
          {cat.prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              role="listitem"
              disabled={disabled}
              onClick={() => onPick(prompt)}
              className="min-h-11 text-[13px] px-3.5 py-2 rounded-xl bg-white/[0.03] text-white/65 hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
