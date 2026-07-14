import { useRef } from 'react';
import type { Locale } from '../types';
import type { AiToolId } from '../templates';

const TOOLS: Array<{ id: AiToolId; ru: string; uz: string; icon: string; helperRu: string; helperUz: string }> = [
  { id: 'chat', ru: 'Chat', uz: 'Chat', icon: 'M4 5h16v11H9l-5 4V5z', helperRu: 'Свободный запрос и быстрые действия.', helperUz: 'Erkin so‘rov va tezkor amallar.' },
  { id: 'images', ru: 'Промты', uz: 'Promptlar', icon: 'M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5', helperRu: 'Создаёт текстовый промт для изображения. Генерация картинок ещё не запущена.', helperUz: 'Tasvir uchun matnli prompt tayyorlaydi. Tasvir generatsiyasi hali ishga tushmagan.' },
  { id: 'smm', ru: 'SMM', uz: 'SMM', icon: 'M5 18V9m7 9V5m7 13v-6', helperRu: 'Готовые сценарии для Instagram и Telegram внутри AI-чата.', helperUz: 'AI chat ichida Instagram va Telegram uchun tayyor ssenariylar.' },
  { id: 'business', ru: 'Бизнес', uz: 'Biznes', icon: 'M4 8h16v11H4zM9 8V5h6v3m-2 5h-2', helperRu: 'Шаблоны для клиентов, продаж и плана AI-бота.', helperUz: 'Mijoz, sotuv va AI-bot rejasi uchun shablonlar.' },
  { id: 'study', ru: 'Учёба', uz: 'O‘qish', icon: 'M3 9l9-5 9 5-9 5-9-5zm4 3v4c3 2 7 2 10 0v-4', helperRu: 'Сценарии для объяснения, проверки и подготовки.', helperUz: 'Tushunish, tekshirish va tayyorlanish ssenariylari.' },
];

export function AiToolTabs({ locale, active, onChange }: { locale: Locale; active: AiToolId; onChange: (tool: AiToolId) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TOOLS.length - 1;
    else next = (index + (event.key === 'ArrowRight' ? 1 : -1) + TOOLS.length) % TOOLS.length;
    onChange(TOOLS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="border-b border-white/[0.06]">
      <div className="overflow-x-auto overscroll-x-contain px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={locale === 'uz' ? 'AI kabinet bo‘limlari' : 'Разделы AI-кабинета'}>
        <div className="flex min-w-max gap-1 sm:grid sm:min-w-0 sm:grid-cols-5">
          {TOOLS.map((tool, index) => {
            const selected = tool.id === active;
            return (
              <button
                ref={(element) => { refs.current[index] = element; }}
                id={`ai-tool-tab-${tool.id}`}
                key={tool.id}
                type="button"
                role="tab"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                aria-controls={`ai-tool-${tool.id}`}
                title={locale === 'uz' ? tool.helperUz : tool.helperRu}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => onChange(tool.id)}
                className={`relative min-h-12 min-w-[80px] rounded-xl px-3 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[12px] sm:text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${
                  selected ? 'text-white bg-white/[0.04]' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.02]'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tool.icon} /></svg>
                <span>{locale === 'uz' ? tool.uz : tool.ru}</span>
                {selected && <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-brand-cyan" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
