import type { QuickAction } from '../i18n';

export function AiQuickActions({
  actions,
  onPick,
  disabled,
}: {
  actions: QuickAction[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="list" aria-label="Быстрые действия">
      {actions.map((a, i) => (
        <button
          key={a.label}
          type="button"
          role="listitem"
          disabled={disabled}
          onClick={() => onPick(a.prompt)}
          className="card-hover group text-left rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] p-4 flex items-center gap-3.5 disabled:opacity-40 transition-colors"
        >
          <span
            className="shrink-0 grid place-items-center w-9 h-9 rounded-xl text-brand-cyan"
            style={{ background: 'rgba(47,230,209,0.08)' }}
            aria-hidden="true"
          >
            <ActionIcon i={i} />
          </span>
          <span className="text-[14px] text-white/85 group-hover:text-white leading-snug">{a.label}</span>
          <span className="ml-auto text-white/25 group-hover:text-brand-cyan transition-colors" aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  );
}

function ActionIcon({ i }: { i: number }) {
  const paths = [
    'M3 5h18M3 12h12M3 19h18',            // offer / lines
    'M4 7h16M8 7v10m8-10v10M4 17h16',      // translate / grid
    'M12 2l3 6 6 .9-4.5 4.4 1 6.2L12 17l-5.5 2.5 1-6.2L3 8.9 9 8z', // plan / star
    'M4 6h16v12H4zM8 10h8M8 14h5',         // product / doc
  ];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[i % paths.length]} />
    </svg>
  );
}
