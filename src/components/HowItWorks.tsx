import { useState } from 'react';
import type { Dict } from '../i18n';

export default function HowItWorks({ t }: { t: Dict }) {
  const [activeStep, setActiveStep] = useState(0);
  const step = t.how.steps[activeStep];

  return (
    <section data-testid="how-it-works" className="section-tone relative py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto reveal">
          <div className="chip mx-auto">3 steps</div>
          <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.how.h}</h2>
        </div>

        <div className="mt-12 grid lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-5 relative reveal">
            <div className="absolute -inset-6 bg-brand-blue/15 blur-3xl rounded-[40%]" />
            <div className="journey-console" aria-live="polite">
              <div className="journey-console__head">
                <span className="journey-console__signal" />
                <span>GPTBot workspace</span>
                <span>{step.n} / 03</span>
              </div>
              <div className="journey-console__body">
                <div className="journey-console__channel" aria-hidden="true">
                  <span>IG</span><span>TG</span>
                </div>
                <div className="journey-console__pulse" aria-hidden="true"><span /></div>
                <div className="journey-console__stage" key={activeStep}>
                  <span className="journey-console__number">{step.n}</span>
                  <small>{t.nav.brand}</small>
                  <strong>{step.t}</strong>
                  <p>{step.d}</p>
                </div>
                <div className="journey-console__result" aria-hidden="true">
                  <span className={activeStep === 2 ? 'is-ready' : ''} />
                  <i /><i /><i />
                </div>
              </div>
              <div className="journey-console__footer">
                {t.how.steps.map((item, index) => (
                  <span key={item.n} className={index <= activeStep ? 'is-complete' : ''} />
                ))}
              </div>
            </div>
          </div>

          <ol className="lg:col-span-7 grid gap-3" aria-label={t.how.h}>
            {t.how.steps.map((item, index) => (
              <li key={item.n}>
                <button
                  type="button"
                  data-testid={`how-step-${index}`}
                  aria-pressed={activeStep === index}
                  onClick={() => setActiveStep(index)}
                  className="journey-step reveal"
                  style={{ transitionDelay: `${index * 45}ms` }}
                >
                  <span className="journey-step__number">{item.n}</span>
                  <span className="journey-step__copy">
                    <strong>{item.t}</strong>
                    <small>{item.d}</small>
                  </span>
                  <span className="journey-step__arrow" aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
