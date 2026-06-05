import { useEffect, useRef, useState } from 'react';
import type { Dict } from '../i18n';
import { track } from '../lib/cta';

type ChatStep =
  | { type: 'msg'; from: 'client' | 'ai'; key: 'c1' | 'a1' | 'c2' | 'a2' }
  | { type: 'lead' };

const SEQUENCE: ChatStep[] = [
  { type: 'msg', from: 'client', key: 'c1' },
  { type: 'msg', from: 'ai', key: 'a1' },
  { type: 'msg', from: 'client', key: 'c2' },
  { type: 'msg', from: 'ai', key: 'a2' },
  { type: 'lead' },
];

export default function DemoChat({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  const [visible, setVisible] = useState<number>(0);
  const [typing, setTyping] = useState<boolean>(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const started = useRef<boolean>(false);

  useEffect(() => {
    if (!sectionRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          io.disconnect();
          runSequence();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(sectionRef.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSequence = async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < SEQUENCE.length; i++) {
      const step = SEQUENCE[i];
      if (step.type === 'msg' && step.from === 'ai') {
        setTyping(true);
        await sleep(900);
        setTyping(false);
      } else {
        await sleep(700);
      }
      setVisible((v) => v + 1);
      await sleep(500);
    }
  };

  return (
    <section
      id="demo"
      data-testid="demo-chat"
      ref={sectionRef}
      className="relative py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto reveal">
          <div className="chip mx-auto">Live demo · 1 min</div>
          <h2 className="h-display mt-4 text-3xl sm:text-4xl lg:text-5xl text-white">{t.demo.h}</h2>
          <p className="mt-3 text-white/65">{t.demo.sub}</p>
        </div>

        <div className="mt-12 grid lg:grid-cols-12 gap-6 items-start">
          {/* Chat card */}
          <div className="lg:col-span-7 reveal">
            <div className="glass-strong p-4 sm:p-6 shadow-card">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <img src="/assets/landing/2.png" alt="Логотип GPTBot" className="h-10 w-10 rounded-xl" width={40} height={40} loading="lazy" />
                <div>
                  <div className="text-sm font-semibold text-white">AI Sales Assistant</div>
                  <div className="text-[11px] text-brand-cyan flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse" />
                    online · {typing ? t.demo.typing : '24/7'}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 min-h-[280px]">
                {SEQUENCE.slice(0, visible).map((step, idx) => {
                  if (step.type === 'lead') return null;
                  const text = t.demo.msgs[step.key];
                  const isAi = step.from === 'ai';
                  return (
                    <div
                      key={idx}
                      className={`flex animate-pop-in ${isAi ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isAi
                            ? 'bg-white/[0.06] border border-white/10 text-white rounded-tl-md'
                            : 'bg-grad-cta text-[#04101A] font-medium rounded-tr-md'
                        }`}
                      >
                        {text}
                      </div>
                    </div>
                  );
                })}

                {typing && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="bg-white/[0.06] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-md flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-bounce" style={{ animationDelay: '240ms' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lead card */}
          <div className="lg:col-span-5 reveal">
            <div
              data-testid="lead-card"
              className={`glass-strong p-5 sm:p-6 shadow-card transition-all duration-500 ${
                visible >= SEQUENCE.length ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-cyan/15 border border-brand-cyan/30">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 13a4 4 0 100-8 4 4 0 000 8ZM4 21a8 8 0 0116 0" stroke="#2FE6D1" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </span>
                  <span className="text-xs font-semibold tracking-wider uppercase text-brand-cyan">{t.demo.lead.title}</span>
                </div>
                <span className="text-[10px] font-semibold text-rose-300 bg-rose-400/10 border border-rose-400/30 px-2 py-1 rounded-full animate-pulse">● LIVE</span>
              </div>

              <dl className="mt-5 grid gap-3">
                <Row k={t.demo.lead.name} v="Aziz" />
                <Row k={t.demo.lead.phone} v="+998 XX XXX XX XX" mono />
                <Row k={t.demo.lead.source} v="Instagram" />
                <Row k={t.demo.lead.status} v={t.demo.lead.statusVal} pill />
              </dl>

              <a
                data-testid="demo-cta"
                href={ctaUrl}
                target="_blank"
                rel="noopener"
                onClick={() => track('click_demo_cta', { source: 'demo_block' })}
                className="btn-primary mt-6 w-full text-sm"
              >
                {t.demo.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v, mono, pill }: { k: string; v: string; mono?: boolean; pill?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <dt className="text-xs uppercase tracking-wider text-white/45">{k}</dt>
      <dd className={`text-sm text-white ${mono ? 'font-mono' : 'font-semibold'} ${pill ? '!font-semibold' : ''}`}>
        {pill ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-cyan bg-brand-cyan/10 border border-brand-cyan/30 px-2.5 py-1 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse" />
            {v}
          </span>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
