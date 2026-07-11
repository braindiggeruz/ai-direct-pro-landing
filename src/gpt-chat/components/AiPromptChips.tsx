export function AiPromptChips({ chips, onPick, disabled }: { chips: string[]; onPick: (c: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="Примеры запросов">
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          role="listitem"
          disabled={disabled}
          onClick={() => onPick(c)}
          className="text-sm px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/80 hover:border-brand-cyan/40 hover:text-white transition-colors disabled:opacity-40"
        >
          {c}
        </button>
      ))}
    </div>
  );
}
