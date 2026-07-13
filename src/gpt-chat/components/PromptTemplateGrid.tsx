import { useState } from 'react';
import type { Locale } from '../types';
import { getTemplates, type AiToolId, type PromptTemplate } from '../templates';

const INITIAL_COUNT = 4;

export function PromptTemplateGrid({ locale, tool, onPick, disabled }: { locale: Locale; tool: AiToolId; onPick: (template: PromptTemplate, prompt: string) => void; disabled?: boolean }) {
  const templates = getTemplates(tool, locale);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!templates.length) return null;
  const visible = expanded ? templates : templates.slice(0, INITIAL_COUNT);
  const ru = locale === 'ru';
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-white">{ru ? 'Выберите сценарий' : 'Ssenariyni tanlang'}</p><p className="mt-0.5 text-xs text-white/50">{ru ? 'Шаблон сразу отправится в чат.' : 'Shablon darhol chatga yuboriladi.'}</p></div>
        <span className="shrink-0 text-xs text-white/45">{visible.length}/{templates.length}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="list" aria-label={ru ? 'Готовые шаблоны' : 'Tayyor shablonlar'}>
        {visible.map((item) => {
          const selected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="listitem"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => { setSelectedId(item.id); onPick(item, item.localizedPrompt); }}
              className={`min-h-[84px] text-left rounded-2xl border p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-45 ${selected ? 'border-brand-cyan/45 bg-brand-cyan/[0.09]' : 'border-white/10 bg-white/[0.03] hover:border-brand-cyan/35 hover:bg-brand-cyan/[0.06]'}`}
            >
              <span className="flex items-start gap-2"><span className="block min-w-0 flex-1 text-sm font-medium text-white leading-snug">{item.localizedLabel}</span>{selected && <span className="text-brand-cyan" aria-hidden="true">✓</span>}</span>
              <span className="block mt-1.5 text-xs text-white/55 leading-snug line-clamp-2">{item.localizedDescription}</span>
              <span className="mt-2 block text-[11px] font-medium text-brand-cyan/85">{selected ? (ru ? 'Запущено' : 'Yuborildi') : (ru ? 'Запустить →' : 'Yuborish →')}</span>
            </button>
          );
        })}
      </div>
      {templates.length > INITIAL_COUNT && (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-3 min-h-11 rounded-xl px-3 text-sm text-brand-cyan hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan" aria-expanded={expanded}>
          {expanded ? (ru ? 'Показать меньше' : 'Kamroq ko‘rsatish') : (ru ? `Показать ещё ${templates.length - INITIAL_COUNT}` : `Yana ${templates.length - INITIAL_COUNT} ta ko‘rsatish`)}
        </button>
      )}
    </div>
  );
}
