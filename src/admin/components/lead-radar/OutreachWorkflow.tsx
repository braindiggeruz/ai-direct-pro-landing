import { ArrowRight, Inbox, MessageSquareText, Search, UsersRound } from 'lucide-react';

export type OutreachStep = 'search' | 'audience' | 'message' | 'inbox';

type Props = {
  currentStep: OutreachStep;
  onSearch: () => void;
  onAudience: () => void;
  onInbox: () => void;
};

/** Navigation shows the current workspace, never an unverified completion state. */
export function OutreachWorkflow({ currentStep, onSearch, onAudience, onInbox }: Props) {
  const steps = [
    { id: 'search', label: 'Найти компании', detail: 'Ниша, город и нужная услуга', icon: Search, action: onSearch },
    { id: 'audience', label: 'Проверить контакты', detail: 'Общая база и сохранённая аудитория', icon: UsersRound, action: onAudience },
    { id: 'message', label: 'Сообщение и запуск', detail: 'Предпросмотр, проверка и результаты', icon: MessageSquareText, action: undefined },
    { id: 'inbox', label: 'Ответы компаний', detail: 'Входящие и интерес к предложению', icon: Inbox, action: onInbox },
  ] as const;

  return (
    <nav aria-label="Путь от компании к кампании" data-testid="outreach-workflow" className="rounded-2xl border border-white/10 bg-[#08111f]/80 p-2">
      <ol className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
        {steps.map(({ id, label, detail, icon: Icon, action }, index) => {
          const active = currentStep === id;
          const content = <>
            <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${active ? 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan' : 'border-white/10 bg-white/[0.025] text-white/65'}`}><Icon size={18} /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className={`block text-sm font-semibold ${active ? 'text-white' : 'text-white/80'}`}><span className="mr-2 text-xs text-white/55">0{index + 1}</span>{label}</span>
              <span className="mt-1 block text-xs leading-5 text-white/65">{detail}</span>
            </span>
            {action && <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-white/45" />}
          </>;
          const className = `flex min-h-20 w-full items-center gap-3 rounded-xl border px-3 py-3 sm:px-4 ${active ? 'border-brand-cyan/25 bg-brand-cyan/[0.04]' : 'border-transparent'} ${action ? 'transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan' : ''}`;
          return <li key={id}>{action
            ? <button type="button" className={className} aria-current={active ? 'step' : undefined} onClick={action}>{content}</button>
            : <div className={className} aria-current={active ? 'step' : undefined}>{content}</div>}
          </li>;
        })}
      </ol>
    </nav>
  );
}
