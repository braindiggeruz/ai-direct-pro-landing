import type { Dict } from '../i18n';

export default function HowItWorks({ t }: { t: Dict }) {
  return (
    <section data-testid="how-it-works" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto reveal">
          <div className="chip mx-auto">3 steps</div>
          <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.how.h}</h2>
        </div>

        <div className="mt-12 grid lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-blue/20 blur-3xl rounded-[40%]" />
            <img
              src="/assets/landing/5.png"
              alt=""
              className="relative w-full h-auto rounded-3xl"
              loading="lazy"
              width={900}
              height={900}
            />
          </div>

          <ol className="lg:col-span-7 grid gap-4 sm:gap-5">
            {t.how.steps.map((s, i) => (
              <li
                key={i}
                data-testid={`how-step-${i}`}
                className="glass card-hover p-5 sm:p-6 flex gap-5 reveal"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="shrink-0">
                  <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-grad-cta text-[#04101A] font-extrabold flex items-center justify-center shadow-glow">
                    {s.n}
                  </div>
                  {i < t.how.steps.length - 1 && (
                    <div className="hidden sm:flex mt-3 ml-5 h-10 w-px bg-gradient-to-b from-brand-cyan/60 to-transparent" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-semibold text-white">{s.t}</h3>
                    <span className="inline-flex items-center text-brand-cyan animate-arrow-flow">
                      <svg width="20" height="14" viewBox="0 0 28 14" fill="none">
                        <path d="M2 7h22M18 2l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </div>
                  <p className="mt-2 text-sm sm:text-[15px] text-white/65 leading-relaxed max-w-xl">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
