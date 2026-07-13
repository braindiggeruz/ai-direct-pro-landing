import type { Locale } from '../types';

export function CreditBalance({ locale, remaining, onUpgrade }: { locale: Locale; remaining: number; onUpgrade: () => void }) {
  const known = remaining >= 0;
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.025] p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-white/45">{locale === 'uz' ? 'Limitlar' : 'Лимиты'}</span>
        <button type="button" onClick={onUpgrade} className="min-h-11 px-2 text-xs text-brand-cyan hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded-lg">
          {locale === 'uz' ? 'Plus' : 'Улучшить'}
        </button>
      </div>
      <p className="text-sm text-white/80">
        {known ? (locale === 'uz' ? `${remaining} ta matn so‘rovi qoldi` : `Текстовые запросы: осталось ${remaining}`) : (locale === 'uz' ? 'Limit birinchi so‘rovdan keyin ko‘rinadi' : 'Лимит появится после первого запроса')}
      </p>
      <p className="mt-1 text-[11px] text-white/42">{locale === 'uz' ? 'Images: prompt generator mavjud, generatsiya tez orada' : 'Images: prompt generator доступен, генерация скоро'}</p>
    </div>
  );
}
