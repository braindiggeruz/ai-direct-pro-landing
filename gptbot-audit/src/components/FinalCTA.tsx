import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function FinalCTA({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  return (
    <section data-testid="final-cta" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img
          src="/assets/landing/cta-bg.svg"
          srcSet="/assets/landing/cta-bg.svg 800w"
          sizes="100vw"
          alt="Фоновое изображение раздела «запустить демо в Telegram»"
          className="w-full h-full object-cover opacity-40"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070D]/85 via-[#05070D]/70 to-[#05070D]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(34,158,217,0.25),_transparent_60%)]" />
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center reveal">
        <div className="chip mx-auto">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse" />
          {t.nav.brand}
        </div>
        <h2 className="h-display mt-5 text-4xl sm:text-5xl lg:text-6xl text-white">
          <span className="text-grad">{t.final.h}</span>
        </h2>
        <p className="mt-5 text-base sm:text-lg text-white/75 max-w-2xl mx-auto">{t.final.sub}</p>

        <div className="mt-8 flex justify-center">
          <a
            data-testid="final-cta-btn"
            href={ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('click_final_cta')}
            className="btn-primary animate-pulse-glow text-base sm:text-lg !px-7 !py-4"
          >
            {t.final.cta}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 3 2.5 10.5c-.9.35-.88 1.65.05 1.95l4.7 1.5L9.5 21c.4 1.05 1.8 1.2 2.4.25l2.95-4.55 5.3 3.9c.95.7 2.3.15 2.5-1.05L23 4.3c.2-1.1-.95-2-1.95-1.3Z" fill="#04101A"/></svg>
          </a>
        </div>
        <p className="mt-3 text-xs text-white/55">{t.final.micro}</p>
      </div>
    </section>
  );
}
