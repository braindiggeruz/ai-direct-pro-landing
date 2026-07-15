import type { Dict } from '../i18n';

export default function Trust({ t }: { t: Dict }) {
  return (
    <section data-testid="trust" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center reveal">
        <div className="chip mx-auto">Honest trust</div>
        <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.trust.h}</h2>
        <p className="mt-4 text-white/65 max-w-2xl mx-auto">{t.trust.t}</p>

        <div className="mt-10 flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {t.trust.badges.map((b, i) => (
            <span
              key={i}
              data-testid={`trust-badge-${i}`}
              className="glass px-4 py-2.5 text-sm text-white/85 inline-flex items-center gap-2 card-hover"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-brand-cyan/15 border border-brand-cyan/30">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
