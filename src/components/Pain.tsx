import type { Dict } from '../i18n';
import PremiumImage from './PremiumImage';

export default function Pain({ t }: { t: Dict }) {
  const isRu = t.pain.h.includes('Проблема');

  return (
    <section data-testid="pain" className="section-tone relative py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="relative hidden lg:col-span-5 lg:block">
            <div className="absolute -inset-6 bg-brand-violet/20 blur-3xl rounded-[40%]" />
            <PremiumImage
              name="unanswered-business-messages-night"
              sizes="(max-width: 1024px) 90vw, 40vw"
              alt={isRu
                ? 'Ночные обращения клиентов остаются без ответа и превращаются в потерянные заявки'
                : 'Tungi mijoz murojaatlari javobsiz qolib, yo‘qotilgan lidlarga aylanadi'}
              className="premium-scene relative w-full h-auto object-cover"
              loading="eager"
            />
          </div>
          <div className="lg:col-span-7">
            <div className="chip">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
              {t.pain.h.split('.')[0]}
            </div>
            <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">
              {t.pain.h}
            </h2>
            <p className="mt-4 text-white/70 max-w-2xl">{t.pain.t}</p>

            <ul className="editorial-list mt-7 grid gap-2.5">
              {t.pain.cards.slice(0, 3).map((c, i) => (
                <li
                  key={i}
                  data-testid={`pain-card-${i}`}
                  className="editorial-list__item flex items-start gap-3 rounded-2xl border border-rose-400/15 bg-rose-400/[0.035] p-4 sm:p-5"
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-400/15 border border-rose-400/40 text-rose-300">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5v.5M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L12.73 4.5c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  <span className="text-sm sm:text-[15px] text-white/90 leading-relaxed">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
