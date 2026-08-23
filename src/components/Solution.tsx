import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function Solution({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  return (
    <section data-testid="solution" className="relative py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7 reveal">
            <div className="flex items-center gap-3">
              <img src="/assets/landing/logo-sq-40.webp" srcSet="/assets/landing/logo-sq-40.webp 1x, /assets/landing/logo-sq-80.webp 2x" alt="Логотип GPTBot" className="h-10 w-10 rounded-xl" width={40} height={40} loading="lazy" />
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
                rel="noopener noreferrer"
                onClick={() => track('click_demo_cta', { source: 'solution' })}
                className="btn-primary"
              >
                {t.solution.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-cyan/15 blur-3xl rounded-[40%]" />
            <div className="product-flow relative" role="img" aria-label={t.solution.h}>
              <div className="product-flow__topbar">
                <span className="product-flow__status" />
                <span>GPTBot · routing</span>
                <span className="product-flow__live">LIVE</span>
              </div>
              <div className="product-flow__channels">
                <div><span className="product-flow__channel-dot product-flow__channel-dot--blue" />Instagram</div>
                <div><span className="product-flow__channel-dot" />Telegram</div>
              </div>
              <div className="product-flow__connector" aria-hidden="true"><span /></div>
              <div className="product-flow__ai">
                <span className="product-flow__ai-mark">AI</span>
                <div>
                  <strong>GPTBot</strong>
                  <small>{t.solution.benefits[2].t}</small>
                </div>
              </div>
              <div className="product-flow__connector product-flow__connector--out" aria-hidden="true"><span /></div>
              <div className="product-flow__lead">
                <div className="product-flow__lead-head">
                  <span>{t.demo.lead.title}</span>
                  <span className="product-flow__hot">HOT</span>
                </div>
                <dl>
                  <div><dt>{t.demo.lead.name}</dt><dd>Aziz</dd></div>
                  <div><dt>{t.demo.lead.phone}</dt><dd>+998 •• ••• •• ••</dd></div>
                  <div><dt>{t.demo.lead.status}</dt><dd>{t.demo.lead.statusVal}</dd></div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
