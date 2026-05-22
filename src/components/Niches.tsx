import type { Dict } from '../i18n';

const ICONS = [
  // clinic
  'M12 3v18M3 12h18M7 7h10M7 17h10',
  // beauty
  'M12 2v6m0 0a4 4 0 100 8 4 4 0 000-8Zm0 8v12',
  // edu
  'M3 8l9-4 9 4-9 4-9-4Zm4 3v6c2.5 2 7.5 2 10 0v-6',
  // shop
  'M3 8h18l-2 11H5L3 8Zm5-3a4 4 0 018 0',
  // realestate
  'M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9Z',
  // tourism
  'M2 22l10-19 10 19H2Zm10-19v19',
  // horeca
  'M4 21h16M6 11a6 6 0 0012 0V5H6v6Zm14-4h2v6h-2',
  // service
  'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4L15 12l-3-3 2.7-2.7Z',
];

export default function Niches({ t }: { t: Dict }) {
  return (
    <section data-testid="niches" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 lg:sticky lg:top-24 reveal">
            <h2 className="h-display text-3xl sm:text-4xl lg:text-5xl text-white">{t.niches.h}</h2>
            <p className="mt-4 text-white/65 max-w-md">{t.niches.sub}</p>
            <div className="mt-8 relative">
              <div className="absolute -inset-6 bg-brand-cyan/15 blur-3xl rounded-[40%]" />
              <img src="/assets/landing/7.png" alt="" className="relative w-full h-auto rounded-3xl" loading="lazy" width={900} height={900} />
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {t.niches.items.map((n, i) => (
              <div
                key={i}
                data-testid={`niche-${i}`}
                className="glass card-hover p-5 reveal"
                style={{ transitionDelay: `${i * 50}ms`, background: 'linear-gradient(180deg, rgba(34,158,217,0.06), rgba(255,255,255,0.02))' }}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-grad-cta text-[#04101A] shadow-glow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d={ICONS[i % ICONS.length]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3 className="mt-3.5 text-base sm:text-lg font-semibold text-white">{n}</h3>
                <p className="mt-1.5 text-[13px] sm:text-sm text-white/65 leading-relaxed">{t.niches.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
