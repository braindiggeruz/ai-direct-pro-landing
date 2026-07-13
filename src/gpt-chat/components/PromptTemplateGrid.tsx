import type { Locale } from '../types';
import { getTemplates, type AiToolId, type PromptTemplate } from '../templates';

export function PromptTemplateGrid({ locale, tool, onPick, disabled }: { locale: Locale; tool: AiToolId; onPick: (template: PromptTemplate, prompt: string) => void; disabled?: boolean }) {
  const templates = getTemplates(tool, locale);
  if (!templates.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="list" aria-label={locale === 'uz' ? 'Tayyor shablonlar' : 'Готовые шаблоны'}>
      {templates.map((item) => (
        <button
          key={item.id}
          type="button"
          role="listitem"
          disabled={disabled}
          onClick={() => onPick(item, item.localizedPrompt)}
          className="min-h-[76px] text-left rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 transition-colors hover:border-brand-cyan/35 hover:bg-brand-cyan/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-45"
        >
          <span className="block text-sm font-medium text-white leading-snug">{item.localizedLabel}</span>
          <span className="block mt-1.5 text-xs text-white/48 leading-snug">{item.localizedDescription}</span>
        </button>
      ))}
    </div>
  );
}
