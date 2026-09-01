import { useEffect, useState } from 'react';
import type { Dict, Lang } from '../i18n';
import { track } from '../lib/cta';

const PHONE_HREF = 'tel:+998505870720';

export default function StickyCTA({ t, ctaUrl, lang }: { t: Dict; ctaUrl: string; lang: Lang }) {
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
  const callLabel = lang === 'uz' ? 'Qo‘ng‘iroq qilish' : 'Позвонить';

  return (
    <div
      data-testid="sticky-cta"
      data-visible={show ? 'true' : 'false'}
      aria-hidden={!show}
      className="sticky-cta-shell fixed inset-x-0 bottom-0 z-40 mx-auto max-w-sm px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/85 to-transparent -z-10" />
      <div className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-white/10 bg-bg-base/95 p-2 shadow-2xl backdrop-blur">
        <a
          data-testid="sticky-call-btn"
          href={PHONE_HREF}
          tabIndex={show ? 0 : -1}
          onClick={() => track('contact_click', { contact_method: 'phone', contact_kind: 'contact', locale: lang, page_kind: 'homepage', target_url: 'phone_contact', cta_zone: 'sticky_bar' })}
          className="bg-grad-cta text-bg-base font-semibold px-4 py-3 rounded-xl text-center text-sm"
        >
          {callLabel}
        </a>
        <a
          data-testid="sticky-telegram-btn"
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={show ? 0 : -1}
          onClick={() => track('click_sticky_cta', { contact_method: 'telegram', contact_kind: 'contact', locale: lang, page_kind: 'homepage', target_url: ctaUrl, cta_zone: 'sticky_bar' })}
          className="px-4 py-3 rounded-xl border border-white/15 text-white/80 text-sm"
        >
          Telegram
        </a>
      </div>
      <div className="sr-only">{t.sticky}</div>
    </div>
  );
}
