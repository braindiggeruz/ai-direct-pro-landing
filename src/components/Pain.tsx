import type { Dict } from '../i18n';

export default function Pain({ t }: { t: Dict }) {
  return (
    <section data-testid="pain" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-violet/20 blur-3xl rounded-[40%]" />
            <img
              src="/assets/landing/3-800.webp"
              srcSet="/assets/landing/3-480.webp 480w, /assets/landing/3-800.webp 800w, /assets/landing/3.webp 1000w"
              sizes="(max-width: 1024px) 90vw, 40vw"
              alt="Бизнес теряет заявки в Instagram Direct без AI-менеджера"
              className="relative w-full h-auto rounded-3xl"
              loading="lazy"
              width={900}
              height={900}
            />
          </div>
          <div className="lg:col-span-7 reveal">
            <div className="chip">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
              {t.pain.h.split('.')[0]}
            </div>
            <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">
              {t.pain.h}
            </h2>
            <p className="mt-4 text-white/70 max-w-2xl">{t.pain.t}</p>

            <ul className="mt-8 grid sm:grid-cols-2 gap-3">
              {t.pain.cards.map((c, i) => (
                <li
                  key={i}
                  data-testid={`pain-card-${i}`}
                  className="glass card-hover p-4 sm:p-5 flex items-start gap-3 relative overflow-hidden"
                  style={{ background: 'linear-gradient(180deg, rgba(244,63,94,0.06), rgba(255,255,255,0.02))', borderColor: 'rgba(244,63,94,0.18)' }}
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
