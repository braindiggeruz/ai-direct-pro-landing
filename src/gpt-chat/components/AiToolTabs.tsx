import type { Locale } from '../types';
import type { AiToolId } from '../templates';

const TOOLS: Array<{ id: AiToolId; ru: string; uz: string; icon: string }> = [
  { id: 'chat', ru: 'Chat', uz: 'Chat', icon: 'M4 5h16v11H9l-5 4V5z' },
  { id: 'images', ru: 'Images', uz: 'Images', icon: 'M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5' },
  { id: 'smm', ru: 'SMM', uz: 'SMM', icon: 'M5 18V9m7 9V5m7 13v-6' },
  { id: 'business', ru: 'Business', uz: 'Biznes', icon: 'M4 8h16v11H4zM9 8V5h6v3m-2 5h-2' },
  { id: 'study', ru: 'Study', uz: 'O‘qish', icon: 'M3 9l9-5 9 5-9 5-9-5zm4 3v4c3 2 7 2 10 0v-4' },
];

export function AiToolTabs({ locale, active, onChange }: { locale: Locale; active: AiToolId; onChange: (tool: AiToolId) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 p-2 border-b border-white/8 bg-black/10" role="tablist" aria-label={locale === 'uz' ? 'AI kabinet bo‘limlari' : 'Разделы AI-кабинета'}>
      {TOOLS.map((tool) => {
        const selected = tool.id === active;
        return (
          <button
            key={tool.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`ai-tool-${tool.id}`}
            onClick={() => onChange(tool.id)}
            className={`min-h-12 rounded-xl px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[10px] sm:text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${
              selected ? 'bg-brand-cyan/12 border border-brand-cyan/35 text-white' : 'border border-transparent text-white/55 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tool.icon} /></svg>
            <span>{locale === 'uz' ? tool.uz : tool.ru}</span>
          </button>
        );
      })}
    </div>
  );
}
