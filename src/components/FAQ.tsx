import { useState } from 'react';
import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function FAQ({ t }: { t: Dict }) {
  const [open, setOpen] = useState<number | null>(0);

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
                className={`glass overflow-hidden transition-all ${isOpen ? 'border-brand-cyan/35' : ''}`}
              >
                <button
                  data-testid={`faq-trigger-${i}`}
                  className="w-full text-left px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4"
                  onClick={() => {
                    const next = isOpen ? null : i;
                    setOpen(next);
                    if (next !== null) track('faq_open', { index: i });
                  }}
                  aria-expanded={isOpen}
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
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 sm:px-6 pb-5 text-sm sm:text-[15px] text-white/70 leading-relaxed">{item.a}</p>
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
