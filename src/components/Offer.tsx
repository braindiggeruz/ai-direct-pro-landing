import type { Dict } from '../i18n';
import { track } from '../lib/cta';
import PremiumImage from './PremiumImage';

export default function Offer({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  const isRu = t.offer.h.includes('Получите');

  return (
    <section data-testid="offer" className="relative py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-blue/20 blur-3xl rounded-[40%]" />
            <PremiumImage
              name="tashkent-business-owner-ai-leads"
              sizes="(max-width: 1024px) 90vw, 40vw"
              alt={isRu
                ? 'Предприниматель в Ташкенте получает квалифицированную заявку от AI-бота GPTBot'
                : 'Toshkentdagi tadbirkor GPTBot AI botidan saralangan lidni qabul qilmoqda'}
              className="premium-scene relative w-full h-auto object-cover"
            />
          </div>

          <div className="lg:col-span-7 reveal">
            <div className="chip">Demo</div>
            <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.offer.h}</h2>
            <p className="mt-4 text-white/70 max-w-2xl">{t.offer.t}</p>

            <div className="mt-7 divide-y divide-white/8 border-y border-white/8">
              {t.offer.cards.map((c, i) => (
                <div key={i} data-testid={`offer-card-${i}`} className="grid gap-1 py-4 sm:grid-cols-[2.5rem_10rem_1fr] sm:items-start sm:gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-cyan">0{i + 1}</div>
                  <h3 className="text-sm font-semibold text-white sm:text-base">{c.t}</h3>
                  <p className="text-[13px] leading-relaxed text-white/60">{c.d}</p>
                </div>
              ))}
            </div>

            <a
              data-testid="offer-cta"
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('click_demo_cta', { source: 'offer' })}
              className="btn-primary mt-7"
            >
              {t.offer.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/55">{t.trust.t}</p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label={t.trust.h}>
              {t.trust.badges.slice(0, 3).map((badge) => (
                <li key={badge} className="inline-flex items-center gap-2 text-xs text-white/65">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" aria-hidden="true" />
                  {badge}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
