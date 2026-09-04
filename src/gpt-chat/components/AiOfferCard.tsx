import { useEffect, useState } from 'react';
import type { ChatStrings } from '../i18n';
import type { Locale } from '../types';
import { track, EV } from '../analytics';
import { useTelegramHandoff, type HandoffSource } from '../handoff';
import { AiTelegramCta } from './AiTelegramCta';
import { AiLeadForm, type LeadMethod } from './AiLeadForm';

/**
 * Stage 2 — 'b2b': after a few useful answers, one dismissible line of
 *   commercial offer. Never returns once dismissed (for the rest of the day).
 * Stage 3 — 'hourly': the hourly cap. Telegram is the PRIMARY action because
 *   it is a real continuation — the assistant bot has its own separate
 *   allowance. The day is not over, so "try again later" stays available.
 * Stage 4 — 'daily': the daily cap. Same card, leading with Telegram, with the
 *   contact form underneath.
 */
export type OfferStage = 'b2b' | 'hourly' | 'daily';

const HANDOFF_SOURCE: Record<OfferStage, HandoffSource> = {
  b2b: 'offer',
  hourly: 'hourly_limit',
  daily: 'daily_limit',
};
const LEAD_METHOD: Record<OfferStage, LeadMethod> = {
  b2b: 'offer_b2b',
  hourly: 'hourly_limit',
  daily: 'daily_limit',
};
const LEAD_INTENT: Record<OfferStage, string> = {
  b2b: 'ai_bot_for_business',
  hourly: 'hourly_limit',
  daily: 'daily_limit',
};

// One impression per stage per page view. A re-render, a scroll back up or a
// second answer must not inflate the denominator the two routes are read
// against.
const seen = new Set<OfferStage>();

export function AiOfferCard({
  t,
  locale,
  apiBase,
  sessionId,
  stage,
  pricingHref,
  onDismiss,
  onRetry,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  sessionId: string | null;
  stage: OfferStage;
  pricingHref: string;
  /** Stage 2 only — the offer must be closable. */
  onDismiss?: () => void;
  /** Stage 3 only — the hourly window may already have passed. */
  onRetry?: () => void;
}) {
  const [leadOpen, setLeadOpen] = useState(false);
  const link = useTelegramHandoff(apiBase, sessionId, locale, HANDOFF_SOURCE[stage]);
  const isCap = stage !== 'b2b';

  useEffect(() => {
    if (seen.has(stage)) return;
    seen.add(stage);
    track(EV.offerViewed, { stage, locale, surface: 'chat' });
    if (isCap) track(EV.paywallViewed, { stage, locale, surface: 'chat' });
  }, [stage, locale, isCap]);

  const openLead = () => {
    setLeadOpen(true);
    track(EV.leadIntent, { from: stage });
  };

  // Without a configured bot the link goes to a person, not to the assistant:
  // the label says so, and the note about the bot's own allowance is dropped
  // rather than describing a bot the visitor is not being sent to.
  const toBot = link.channel === 'bot';
  const telegramLabel = toBot ? (isCap ? t.capTelegramCta : t.telegramCta) : t.contactTelegram;

  const telegramBlock = (
    <>
      <AiTelegramCta
        link={link}
        label={telegramLabel}
        stage={stage}
        variant={isCap ? 'primary' : 'secondary'}
      />
      {!leadOpen && (
        <button
          type="button"
          onClick={openLead}
          data-testid={`offer-lead-${stage}`}
          className="inline-flex w-full min-h-12 items-center justify-center rounded-2xl border border-white/12 px-5 text-[14px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan sm:w-auto"
        >
          {isCap ? t.capLeadCta : t.b2bDiscuss}
        </button>
      )}
    </>
  );

  const retryBlock = stage === 'hourly' && onRetry && (
    <p className="mt-3 text-[12px] text-white/40">
      <button
        type="button"
        onClick={onRetry}
        data-testid="offer-retry"
        className="rounded-lg underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        {t.hourlyRetry}
      </button>
      <span className="ml-1.5 text-white/25">— {t.hourlyRetryHint}</span>
    </p>
  );

  const leadBlock = leadOpen && (
    <div className="mt-5 border-t border-white/[0.06] pt-5">
      <AiLeadForm
        t={t}
        locale={locale}
        apiBase={apiBase}
        sessionId={sessionId}
        intent={LEAD_INTENT[stage]}
        method={LEAD_METHOD[stage]}
        intro={isCap ? t.leadIntroCap : t.leadIntro}
        autoFocus
      />
    </div>
  );

  // Honest, and only where it is true: the note about the bot's own limit is
  // shown at the caps, and the "this conversation continues there" line only
  // once the server actually minted a session-carrying link.
  const notes = (
    <>
      {isCap && toBot && <p className="mt-3 text-[12px] leading-relaxed text-white/40">{t.capTelegramNote}</p>}
      {link.withSession && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">{t.telegramContextNote}</p>
      )}
    </>
  );

  if (!isCap) {
    return (
      <aside
        className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5"
        data-testid="ai-offer-b2b"
        aria-label={t.b2bTitle}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-brand-cyan/[0.1] px-2.5 py-1 text-[11px] font-medium text-brand-cyan">
              {t.offerBadge}
            </span>
            <h3 className="mt-2.5 text-[15px] font-semibold leading-snug text-white">{t.b2bTitle}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t.offerBody}</p>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={() => { track(EV.offerDismissed, { stage, locale }); onDismiss(); }}
              aria-label={t.dismissOffer}
              title={t.dismissOffer}
              data-testid="ai-offer-dismiss"
              className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-2.5 sm:flex sm:flex-wrap">{telegramBlock}</div>
        {notes}
        {leadBlock}
      </aside>
    );
  }

  return (
    <div
      className="glass-strong rounded-3xl p-5 sm:p-7 msg-in"
      style={{ boxShadow: '0 20px 60px -20px rgba(34,158,217,0.3)' }}
      data-testid="ai-paywall"
      data-stage={stage}
      // Live only until the form appears: a live region wrapped around form
      // controls re-announces the whole card on every keystroke-driven change.
      role={leadOpen ? undefined : 'status'}
    >
      <h3 className="h-display mb-1.5 text-[22px] leading-tight text-white sm:text-2xl">
        {stage === 'hourly' ? t.hourlyTitle : t.paywallTitle}
      </h3>
      <p className="mb-4 text-[14px] leading-relaxed text-white/70">
        {stage === 'hourly' ? t.hourlyBody : t.dailyBody}
      </p>
      <div className="grid gap-2.5 sm:flex sm:flex-wrap">{telegramBlock}</div>
      {retryBlock}
      {notes}
      {leadBlock}
      <p className="mt-4 text-[12px] text-white/35">
        <a
          href={pricingHref}
          onClick={() => { track(EV.viewPricing, { from: stage }); track(EV.pricingClicked, { from: stage }); }}
          className="underline underline-offset-4 hover:text-white/70"
        >
          {t.pricingLink}
        </a>
      </p>
    </div>
  );
}
