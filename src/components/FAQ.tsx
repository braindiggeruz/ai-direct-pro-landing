import { useState } from 'react';
import type { Dict } from '../i18n';
import { track } from '../lib/cta';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from './animate-ui/components/base/accordion';

export default function FAQ({ t }: { t: Dict }) {
  const [open, setOpen] = useState<string[]>(['0']);

  return (
    <section id="faq" data-testid="faq" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center reveal">
          <div className="chip mx-auto">FAQ</div>
          <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.faq.h}</h2>
        </div>

        <Accordion
          className="mt-10 space-y-3"
          multiple={false}
          value={open}
          onValueChange={(v) => {
            const next = v as string[];
            setOpen(next);
            if (next.length > 0) track('faq_open', { index: Number(next[0]) });
          }}
        >
          {t.faq.items.map((item, i) => {
            const isOpen = open.includes(String(i));
            return (
              <AccordionItem
                key={i}
                value={String(i)}
                data-testid={`faq-item-${i}`}
                className={`glass overflow-hidden !border-b-0 transition-colors ${isOpen ? 'border-brand-cyan/35' : ''}`}
              >
                <AccordionTrigger
                  data-testid={`faq-trigger-${i}`}
                  showArrow={false}
                  className="!rounded-none px-5 sm:px-6 !py-4 sm:!py-5 hover:!no-underline"
                >
                  <span className="text-[15px] sm:text-base font-semibold text-white">{item.q}</span>
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-transform ${
                      isOpen ? 'rotate-45 bg-grad-cta border-transparent text-[#04101A]' : 'text-white/70'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                  </span>
                </AccordionTrigger>
                <AccordionPanel keepRendered className="!pt-0">
                  <p className="px-5 sm:px-6 text-sm sm:text-[15px] text-white/70 leading-relaxed">{item.a}</p>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </section>
  );
}
