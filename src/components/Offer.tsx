import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function Offer({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  return (
    <section data-testid="offer" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-blue/20 blur-3xl rounded-[40%]" />
            <img src="/assets/landing/6.webp" alt="Преимущества GPTBot: AI-консультант 24/7, сбор заявок, передача менеджеру" className="relative w-full h-auto rounded-3xl" loading="lazy" width={900} height={900} />
          </div>

          <div className="lg:col-span-7 reveal">
            <div className="chip">Demo</div>
            <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.offer.h}</h2>
            <p className="mt-4 text-white/70 max-w-2xl">{t.offer.t}</p>

            <div className="mt-7 grid sm:grid-cols-3 gap-3">
              {t.offer.cards.map((c, i) => (
                <div key={i} data-testid={`offer-card-${i}`} className="glass card-hover p-4 sm:p-5">
                  <div className="text-[11px] uppercase tracking-wider text-brand-cyan font-semibold">0{i + 1}</div>
                  <h3 className="mt-2 text-base font-semibold text-white">{c.t}</h3>
                  <p className="mt-1.5 text-[13px] text-white/60 leading-relaxed">{c.d}</p>
                </div>
              ))}
            </div>

            <a
              data-testid="offer-cta"
              href={ctaUrl}
              target="_blank"
              rel="noopener"
              onClick={() => track('click_demo_cta', { source: 'offer' })}
              className="btn-primary mt-7"
            >
              {t.offer.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
