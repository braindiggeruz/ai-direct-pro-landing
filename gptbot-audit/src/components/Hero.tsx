import type { Dict } from '../i18n';
import { track } from '../lib/cta';
import { GradientBackground } from './animate-ui/components/backgrounds/gradient';

type Props = { t: Dict; ctaUrl: string };

// Words to visually emphasize inside short bullets (per language by index)
const BULLET_ACCENTS: Record<string, string[]> = {
  ru: ['секунды', 'автоматически', 'сразу', 'RU + UZ'],
  uz: ['soniyada', 'avtomatik', 'darhol', 'RU + UZ'],
};

function HighlightBullet({ text, accent }: { text: string; accent?: string }) {
  if (!accent) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(accent.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-brand-cyan font-semibold">
        {text.slice(idx, idx + accent.length)}
      </span>
      {text.slice(idx + accent.length)}
    </>
  );
}

export default function Hero({ t, ctaUrl }: Props) {
  // crude language detection from the bullet text (RU vs UZ)
  const isRu = t.hero.bullets[0].includes('секунд');
  const accents = isRu ? BULLET_ACCENTS.ru : BULLET_ACCENTS.uz;

  return (
    <section id="top" data-testid="hero" className="relative pt-28 sm:pt-32 lg:pt-36 pb-16 sm:pb-24 overflow-hidden">
      {/* animated gradient wash */}
      <GradientBackground
        className="pointer-events-none absolute inset-0 opacity-[0.16] blur-3xl from-brand-blue via-brand-violet to-brand-cyan"
        aria-hidden
      />

      {/* glow blobs */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-brand-blue/20 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -left-32 h-[360px] w-[360px] rounded-full bg-brand-violet/20 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-8 items-center">
          <div className="lg:col-span-7 animate-fade-up">
            <div className="chip" data-testid="hero-badge">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse" />
              {t.hero.badge}
            </div>

            <h1
              data-testid="hero-h1"
              className="h-display mt-4 text-[2.25rem] leading-[1.05] sm:text-5xl lg:text-6xl xl:text-[4.25rem] text-white"
            >
              {t.hero.h1a}{' '}
              <span className="text-grad">{t.hero.h1b}</span>
            </h1>

            <p className="mt-4 max-w-xl text-[15px] sm:text-lg text-white/75 leading-relaxed">
              {t.hero.sub}
            </p>

            <ul className="mt-5 grid sm:grid-cols-2 gap-2 max-w-xl">
              {t.hero.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-[13.5px] sm:text-sm text-white/85"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-cyan/15 border border-brand-cyan/30">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <HighlightBullet text={b} accent={accents[i]} />
                </li>
              ))}
            </ul>

            {/* Primary CTA — single focused button */}
            <div className="mt-6 flex flex-col items-stretch sm:items-start gap-3">
              <a
                data-testid="hero-cta-primary"
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('click_hero_cta')}
                className="btn-primary animate-pulse-glow text-base !py-4 sm:!py-3.5 w-full sm:w-auto"
              >
                {t.hero.cta}
                <TgIcon />
              </a>

              {/* Trust micro-badges right under CTA */}
              <ul
                data-testid="hero-trust-badges"
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] sm:text-xs text-white/65"
              >
                {t.trust.badges.slice(0, 4).map((b, i) => (
                  <li key={i} className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan shadow-[0_0_8px_#2FE6D1]" />
                    {b}
                  </li>
                ))}
              </ul>

              <p className="text-xs text-white/60">{t.hero.micro}</p>

              {/* Secondary CTA — subtle ghost link instead of competing button */}
              <a
                data-testid="hero-cta-secondary"
                href="#demo"
                onClick={() => track('click_hero_cta_secondary')}
                className="group inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-brand-cyan transition mt-1"
              >
                {t.hero.ctaSecondary}
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  className="transition-transform group-hover:translate-y-0.5"
                >
                  <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>

            <div className="mt-7 grid grid-cols-3 gap-2.5 max-w-xl">
              {t.hero.stats.map((s, i) => (
                <div
                  key={i}
                  data-testid={`hero-stat-${i}`}
                  className="glass px-3 sm:px-4 py-3"
                >
                  <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/50">{s.k}</div>
                  <div className="mt-1 text-sm sm:text-base font-semibold text-brand-cyan">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero image */}
          <div className="lg:col-span-5 relative animate-fade-up" style={{ animationDelay: '120ms' }}>
            <div className="relative mx-auto max-w-sm lg:max-w-none">
              <div className="absolute -inset-6 bg-grad-cta opacity-25 blur-3xl rounded-[50%] animate-float" />
              <img
                src="/assets/landing/hero.svg"
                srcSet="/assets/landing/hero.svg 800w"
                sizes="(max-width: 1024px) 90vw, 40vw"
                alt="AI chat assistant"
                className="relative w-full h-auto rounded-3xl object-cover"
                width={900}
                height={1100}
                loading="eager"
                fetchPriority="high"
              />
              <div className="absolute -bottom-3 -left-3 sm:-left-6 glass-strong px-4 py-3 flex items-center gap-3 animate-pop-in" style={{ animationDelay: '350ms' }}>
                <img src="/assets/landing/logo-sq.svg" alt="Логотип GPTBot" className="h-8 w-8 rounded-lg" width={32} height={32} />
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
