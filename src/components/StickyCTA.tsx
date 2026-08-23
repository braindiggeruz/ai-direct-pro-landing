import { useEffect, useState } from 'react';
import type { Dict } from '../i18n';
import { track } from '../lib/cta';

export default function StickyCTA({ t, ctaUrl }: { t: Dict; ctaUrl: string }) {
  const [pastProof, setPastProof] = useState(false);
  const [nearFooter, setNearFooter] = useState(false);

  useEffect(() => {
    const proof = document.querySelector('[data-testid="demo-chat"]');
    const footer = document.querySelector('[data-testid="site-footer"]');
    if (!proof || !footer) return;

    const proofObserver = new IntersectionObserver(
      ([entry]) => setPastProof(!entry.isIntersecting && entry.boundingClientRect.bottom < 0),
      { threshold: 0 },
    );
    const footerObserver = new IntersectionObserver(
      ([entry]) => setNearFooter(entry.isIntersecting),
      { rootMargin: '96px 0px 0px 0px', threshold: 0 },
    );
    proofObserver.observe(proof);
    footerObserver.observe(footer);
    return () => {
      proofObserver.disconnect();
      footerObserver.disconnect();
    };
  }, []);

  const show = pastProof && !nearFooter;

  return (
    <div
      data-testid="sticky-cta"
      data-visible={show ? 'true' : 'false'}
      aria-hidden={!show}
      className="sticky-cta-shell fixed inset-x-0 bottom-0 z-40 mx-auto max-w-sm px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/85 to-transparent -z-10" />
      <a
        data-testid="sticky-cta-btn"
        href={ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={show ? 0 : -1}
        onClick={() => track('click_sticky_cta')}
        className="btn-primary w-full !py-3 text-sm"
      >
        {t.sticky}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 3 2.5 10.5c-.9.35-.88 1.65.05 1.95l4.7 1.5L9.5 21c.4 1.05 1.8 1.2 2.4.25l2.95-4.55 5.3 3.9c.95.7 2.3.15 2.5-1.05L23 4.3c.2-1.1-.95-2-1.95-1.3Z" fill="#04101A"/></svg>
      </a>
    </div>
  );
}
