import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function Solution({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  return (
    <section data-testid="solution" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7 reveal">
            <div className="flex items-center gap-3">
              <img src="/assets/landing/2.webp" alt="Логотип GPTBot" className="h-10 w-10 rounded-xl" width={40} height={40} loading="lazy" />
              <div className="chip">AI Sales Assistant</div>
            </div>
            <h2 className="h-display mt-5 text-3xl sm:text-4xl lg:text-5xl text-white">
              {t.solution.h}
            </h2>
            <p className="mt-4 text-white/70 max-w-2xl">{t.solution.t}</p>

            <div className="mt-8 grid sm:grid-cols-2 gap-3">
              {t.solution.benefits.map((b, i) => (
                <div
                  key={i}
                  data-testid={`benefit-${i}`}
                  className="glass card-hover p-4 sm:p-5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-grad-cta text-[#04101A]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    <h3 className="text-[15px] font-semibold text-white">{b.t}</h3>
                  </div>
                  <p className="mt-2 text-[13px] text-white/65 leading-relaxed">{b.d}</p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <a
                data-testid="solution-cta"
                href={ctaUrl}
                target="_blank"
                rel="noopener"
                onClick={() => track('click_demo_cta', { source: 'solution' })}
                className="btn-primary"
              >
                {t.solution.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </div>

          {/* Hot lead card visual using 4.png */}
          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-cyan/15 blur-3xl rounded-[40%]" />
            <div className="relative">
              <img
                src="/assets/landing/4.webp"
                alt="Карточка горячего лида: имя клиента и телефон, переданные менеджеру"
                className="w-full h-auto rounded-3xl"
                loading="lazy"
                width={900}
                height={900}
              />
              <div className="absolute -top-4 -right-4 glass-strong px-3 py-2 flex items-center gap-2 animate-pop-in">
                <span className="h-2 w-2 rounded-full bg-brand-cyan shadow-[0_0_10px_#2FE6D1]" />
                <span className="text-[11px] font-semibold text-white">HOT LEAD</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
