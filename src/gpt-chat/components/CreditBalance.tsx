import type { Locale } from '../types';

export function CreditBalance({ locale, remaining, limitReached, onUpgrade }: { locale: Locale; remaining: number; limitReached: boolean; onUpgrade: () => void }) {
  const known = remaining >= 0;
  const ru = locale === 'ru';
  const status = limitReached || remaining === 0
    ? (ru ? 'Бесплатный лимит исчерпан' : 'Bepul limit tugadi')
    : known
      ? (ru ? `Осталось запросов: ${remaining}` : `${remaining} ta so‘rov qoldi`)
      : (ru ? 'Лимит обновится после ответа сервера' : 'Limit server javobidan keyin yangilanadi');
  return (
    <div className={`min-w-0 flex-1 rounded-2xl p-4 ${limitReached || remaining === 0 ? 'bg-amber-300/[0.04]' : 'bg-white/[0.025]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-white/40">{ru ? 'Лимиты' : 'Limitlar'}</span>
        <button type="button" onClick={onUpgrade} className="min-h-12 px-3 text-xs text-brand-cyan hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded-lg">
          {ru ? 'Тарифы' : 'Tariflar'}
        </button>
      </div>
      <p className="text-sm font-medium text-white/80 mt-1" aria-live="polite">{status}</p>
      <p className="mt-1 text-xs leading-snug text-white/35">{ru ? 'Изображения: доступен только генератор промтов; создание картинок ещё не запущено.' : 'Tasvirlar: faqat prompt generator mavjud; tasvir yaratish hali ishga tushmagan.'}</p>
    </div>
  );
}
