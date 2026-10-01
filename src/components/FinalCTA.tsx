import type { Dict, Lang } from '../i18n';
import { trackContact } from '../lib/cta';
import {
  STUDIO_CONTACT_PROPS,
  STUDIO_EMAIL,
  STUDIO_PHONE,
  STUDIO_PHONE_DISPLAY,
  STUDIO_TELEGRAM_URL,
} from '../shared/studio-contact';

// The homepage's contact section (#contact), where every demo button on the
// page leads: the studio phone, the e-mail and, once content/global/site.json
// names one, the work Telegram (src/shared/studio-contact.ts). The owner's
// personal Telegram is no longer offered (paid-chat plan, decision L14).
// scripts/prerender-home.ts writes the same section into the crawler shell.
export default function FinalCTA({ t, lang }: { t: Dict; lang: Lang }) {
  return (
    <section id="contact" data-testid="final-cta" aria-labelledby="contact-heading" className="relative scroll-mt-24 py-20 sm:py-28 lg:py-32 overflow-hidden">
      <div className="final-network absolute inset-0 -z-10" aria-hidden="true">
        <div className="final-network__orb final-network__orb--one" />
        <div className="final-network__orb final-network__orb--two" />
        <div className="final-network__orb final-network__orb--three" />
        <span className="final-network__line final-network__line--one" />
        <span className="final-network__line final-network__line--two" />
        <span className="final-network__line final-network__line--three" />
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center reveal">
        <div className="chip mx-auto">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-cyan" />
          {t.nav.brand}
        </div>
        <h2 id="contact-heading" className="h-display mt-5 text-4xl sm:text-5xl lg:text-6xl text-white">
          <span className="text-grad">{t.final.h}</span>
        </h2>
        <p className="mt-5 text-base sm:text-lg text-white/75 max-w-2xl mx-auto">{t.final.sub}</p>

        <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3">
          <a
            data-testid="final-cta-btn"
            href={`tel:${STUDIO_PHONE}`}
            onClick={() => trackContact('phone', 'final', lang)}
            className="btn-primary text-base sm:text-lg !px-7 !py-4"
          >
            {t.final.call}: {STUDIO_PHONE_DISPLAY}
          </a>
          <a
            data-testid="final-cta-email"
            href={`mailto:${STUDIO_EMAIL}`}
            onClick={() => trackContact('email', 'final', lang)}
            className="btn-secondary text-base !px-7 !py-4"
          >
            E-mail: {STUDIO_EMAIL}
          </a>
          {STUDIO_TELEGRAM_URL && (
            <a
              data-testid="final-cta-telegram"
              {...STUDIO_CONTACT_PROPS}
              href={STUDIO_TELEGRAM_URL}
              target="_blank"
              rel="nofollow noopener noreferrer"
              onClick={() => trackContact('telegram', 'final', lang)}
              className="btn-secondary text-base !px-7 !py-4"
            >
              {t.final.telegram}
            </a>
          )}
        </div>
        <p className="mt-3 text-xs text-white/65">{t.final.micro}</p>
      </div>
    </section>
  );
}
