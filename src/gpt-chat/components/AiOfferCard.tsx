import { useEffect, useState } from 'react';
import type { ChatStrings } from '../i18n';
import { leadStrings } from '../lead-strings';
import type { Locale } from '../types';
import { track, EV } from '../analytics';
import type { HandoffLink } from '../handoff';
import { studioBusinessLink } from '../contact';
import { AiTelegramCta } from './AiTelegramCta';
import { AiLeadForm } from './AiLeadForm';

/** GA4 `from` / test id of this card's buttons, and its lead's method. */
const STAGE = 'b2b';

// One impression per page view. A re-render, a scroll back up or a second
// answer must not inflate the denominator the two routes out are read against.
let seen = false;

/**
 * The B2B offer: after a few useful answers in the business tool, one
 * dismissible card. Never returns once dismissed (for the rest of the day).
 * Its Telegram button goes to the studio's own account with a B2B opener
 * prefilled, and mints nothing: a business buyer should reach a person — one
 * B2B bot is worth about fifty consumer packages — while a consumer who came
 * for a free "ChatGPT" belongs in the assistant bot. A limit is never sold
 * from here: the limit card above the composer handles it (limit-card.ts).
 */
export function AiOfferCard({
  t,
  locale,
  apiBase,
  sessionId,
  onDismiss,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  sessionId: string | null;
  /** The offer must be closable. */
  onDismiss: () => void;
}) {
  const copy = leadStrings(locale);
  const [leadOpen, setLeadOpen] = useState(false);

  useEffect(() => {
    if (seen) return;
    seen = true;
    track(EV.offerViewed, { surface: 'chat', locale });
  }, [locale]);

  // The studio's own Telegram, B2B opener prefilled, nothing minted. This is
  // the one chat surface where the personal account is the right destination
  // (see contact.ts).
  const businessLink: HandoffLink = { href: studioBusinessLink(locale), channel: 'studio', withSession: false };
  return (
    <aside
      className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
      data-testid="ai-offer-b2b"
      aria-label={copy.b2bTitle}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-brand-cyan/[0.1] px-2.5 py-1 text-[11px] font-medium text-brand-cyan">
            {copy.offerBadge}
          </span>
          <h3 className="mt-2.5 text-[15px] font-semibold leading-snug text-white">{copy.b2bTitle}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">{copy.offerBody}</p>
        </div>
        <button
          type="button"
          onClick={() => { track(EV.offerDismissed, { surface: 'chat', locale }); onDismiss(); }}
          aria-label={copy.dismissOffer}
          title={copy.dismissOffer}
          data-testid="ai-offer-dismiss"
          className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="mt-4 grid gap-2.5 sm:flex sm:flex-wrap">
        <AiTelegramCta link={businessLink} label={t.contactTelegram} stage={STAGE} variant="secondary" />
        {!leadOpen && (
          <button
            type="button"
            onClick={() => setLeadOpen(true)}
            data-testid={`offer-lead-${STAGE}`}
            className="inline-flex w-full min-h-12 items-center justify-center rounded-2xl border border-white/12 px-5 text-[14px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan sm:w-auto"
          >
            {copy.b2bDiscuss}
          </button>
        )}
      </div>
      {leadOpen && (
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <AiLeadForm
            t={t}
            locale={locale}
            apiBase={apiBase}
            sessionId={sessionId}
            intent="ai_bot_for_business"
            method="offer_b2b"
            intro={copy.leadIntro}
            autoFocus
          />
        </div>
      )}
    </aside>
  );
}
