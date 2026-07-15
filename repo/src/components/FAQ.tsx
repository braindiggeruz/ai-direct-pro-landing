import { useState } from 'react';
import type { Dict } from '../i18n';
import { track } from '../lib/cta';

// Self-contained accessible accordion. Replaces the animate-ui accordion
// (@base-ui + motion/react) so the landing bundle ships zero animation
// libraries. Height animation is pure CSS (grid-template-rows 0fr -> 1fr),
// answers stay in the DOM at all times for SEO parity with the old
// keepRendered behavior.
export default function FAQ({ t }: { t: Dict }) {
  const [open, setOpen] = useState(0);

  const toggle = (i: number) => {
    const next = open === i ? -1 : i;
    setOpen(next);
    if (next >= 0) track('faq_open', { index: next });
  };

  return (
    <section id="faq" data-testid="faq" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center reveal">
          <div className="chip mx-auto">FAQ</div>
          <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.faq.h}</h2>
        </div>

        <div className="mt-10 space-y-3">
          {t.faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                data-testid={`faq-item-${i}`}
                className={`glass overflow-hidden transition-colors ${isOpen ? 'border-brand-cyan/35' : ''}`}
              >
                <h3>
                  <button
                    type="button"
                    id={`faq-trigger-${i}`}
                    data-testid={`faq-trigger-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => toggle(i)}
                    className="flex w-full items-center justify-between gap-4 text-left px-5 sm:px-6 py-4 sm:py-5"
                  >
                    <span className="text-[15px] sm:text-base font-semibold text-white">{item.q}</span>
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-transform ${
                        isOpen ? 'rotate-45 bg-grad-cta border-transparent text-[#04101A]' : 'text-white/70'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${i}`}
                  aria-hidden={!isOpen}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 sm:px-6 pb-4 sm:pb-5 text-sm sm:text-[15px] text-white/70 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
