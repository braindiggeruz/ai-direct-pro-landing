import type { Dict } from '../i18n';
import { track } from '../lib/cta';

type Props = { t: Dict; ctaUrl: string };

export default function Hero({ t, ctaUrl }: Props) {
  return (
    <section id="top" data-testid="hero" className="relative pt-28 sm:pt-32 lg:pt-36 pb-16 sm:pb-24 overflow-hidden">
      {/* glow blobs */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-brand-blue/20 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -left-32 h-[360px] w-[360px] rounded-full bg-brand-violet/20 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          <div className="lg:col-span-7 animate-fade-up">
            <div className="chip" data-testid="hero-badge">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse" />
              {t.hero.badge}
            </div>

            <h1 data-testid="hero-h1" className="h-display mt-5 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl text-white">
              {t.hero.h1a}
              <br />
              <span className="text-grad">{t.hero.h1b}</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base sm:text-lg text-white/70 leading-relaxed">
              {t.hero.sub}
            </p>

            <ul className="mt-7 grid sm:grid-cols-2 gap-2.5 max-w-xl">
              {t.hero.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-white/80"
                  style={{ animationDelay: `${100 + i * 80}ms` }}
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-cyan/15 border border-brand-cyan/30">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <a
                data-testid="hero-cta-primary"
                href={ctaUrl}
                target="_blank"
                rel="noopener"
                onClick={() => track('click_hero_cta')}
                className="btn-primary animate-pulse-glow text-base"
              >
                {t.hero.cta}
                <TgIcon />
              </a>
              <a
                data-testid="hero-cta-secondary"
                href="#demo"
                onClick={() => track('click_hero_cta_secondary')}
                className="btn-secondary text-base"
              >
                {t.hero.ctaSecondary}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>

            <p className="mt-4 text-xs text-white/50">{t.hero.micro}</p>

            <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
              {t.hero.stats.map((s, i) => (
                <div
                  key={i}
                  data-testid={`hero-stat-${i}`}
                  className="glass px-3 sm:px-4 py-3 sm:py-4"
                >
                  <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/50">{s.k}</div>
                  <div className="mt-1 text-sm sm:text-base font-semibold text-white">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero image */}
          <div className="lg:col-span-5 relative animate-fade-up" style={{ animationDelay: '120ms' }}>
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="absolute -inset-6 bg-grad-cta opacity-25 blur-3xl rounded-[50%] animate-float" />
              <img
                src="/assets/landing/1.png"
                alt="AI chat assistant"
                className="relative w-full h-auto rounded-3xl object-cover"
                width={900}
                height={1100}
                loading="eager"
                fetchPriority="high"
              />
              <div className="absolute -bottom-3 -left-3 sm:-left-6 glass-strong px-4 py-3 flex items-center gap-3 animate-pop-in" style={{ animationDelay: '350ms' }}>
                <img src="/assets/landing/2.png" alt="" className="h-8 w-8 rounded-lg" width={32} height={32} />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/50">AI Sales Assistant</div>
                  <div className="text-xs font-semibold text-white">online · 24/7</div>
                </div>
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-brand-cyan shadow-[0_0_10px_#2FE6D1]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22 3 2.5 10.5c-.9.35-.88 1.65.05 1.95l4.7 1.5L9.5 21c.4 1.05 1.8 1.2 2.4.25l2.95-4.55 5.3 3.9c.95.7 2.3.15 2.5-1.05L23 4.3c.2-1.1-.95-2-1.95-1.3Z" fill="#04101A"/>
    </svg>
  );
}
