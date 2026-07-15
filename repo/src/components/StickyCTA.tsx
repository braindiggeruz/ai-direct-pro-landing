import { useEffect, useState } from 'react';
import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function StickyCTA({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const ratio = h.scrollTop / Math.max(1, h.scrollHeight - window.innerHeight);
      setShow(ratio > 0.2);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      data-testid="sticky-cta"
      className={`sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-all duration-300 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/85 to-transparent -z-10" />
      <a
        data-testid="sticky-cta-btn"
        href={ctaUrl}
        target="_blank"
        rel="noopener"
        onClick={() => track('click_sticky_cta')}
        className="btn-primary w-full text-base !py-4 animate-pulse-glow"
      >
        {t.sticky}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 3 2.5 10.5c-.9.35-.88 1.65.05 1.95l4.7 1.5L9.5 21c.4 1.05 1.8 1.2 2.4.25l2.95-4.55 5.3 3.9c.95.7 2.3.15 2.5-1.05L23 4.3c.2-1.1-.95-2-1.95-1.3Z" fill="#04101A"/></svg>
      </a>
    </div>
  );
}
