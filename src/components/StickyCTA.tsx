import { useEffect, useState } from 'react';
import type { Dict, Lang } from '../i18n';
import { trackContact } from '../lib/cta';
import { STUDIO_CONTACT_PROPS, STUDIO_PHONE, STUDIO_TELEGRAM_URL } from '../shared/studio-contact';

// The mobile call bar: the studio phone and, once content/global/site.json
// names one, the work Telegram (src/shared/studio-contact.ts); without it the
// phone takes the whole bar, as on the landings (plan decision L14).
export default function StickyCTA({ t, lang }: { t: Dict; lang: Lang }) {
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
      <div className={`grid ${STUDIO_TELEGRAM_URL ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'} gap-2 rounded-2xl border border-white/10 bg-bg-base/95 p-2 shadow-2xl backdrop-blur`}>
        <a
          data-testid="sticky-call-btn"
          href={`tel:${STUDIO_PHONE}`}
          tabIndex={show ? 0 : -1}
          onClick={() => trackContact('phone', 'sticky_bar', lang)}
          className="bg-grad-cta text-bg-base font-semibold px-4 py-3 rounded-xl text-center text-sm"
        >
          {callLabel}
        </a>
        {STUDIO_TELEGRAM_URL && (
          <a
            data-testid="sticky-telegram-btn"
            {...STUDIO_CONTACT_PROPS}
            href={STUDIO_TELEGRAM_URL}
            target="_blank"
            rel="nofollow noopener noreferrer"
            tabIndex={show ? 0 : -1}
            onClick={() => trackContact('telegram', 'sticky_bar', lang)}
            className="px-4 py-3 rounded-xl border border-white/15 text-white/80 text-sm"
          >
            Telegram
          </a>
        )}
      </div>
      <div className="sr-only">{t.sticky}</div>
    </div>
  );
}
