import { useEffect } from 'react';
import type { ChatStrings } from '../i18n';
import { leadStrings } from '../lead-strings';
import type { Locale } from '../types';
import { track, EV } from '../analytics';
import { recordUiEvent } from '../ui-events';
import type { BusinessTopic } from '../business-intent';
import { AiLeadForm } from './AiLeadForm';

/**
 * The service page each topic links to: a page that carries the same lead
 * form (scripts/lead-form.ts LEAD_FORM_PAGES, asserted in
 * tests/gpt-chat-business-line.test.ts).
 */
export const BUSINESS_LINE_PAGES: Readonly<Record<BusinessTopic, Readonly<Record<Locale, string>>>> = {
  bot: { ru: '/ru/ai-bot-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/' },
  crm: { ru: '/ru/gpt-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/' },
  site: { ru: '/boss-digital/', uz: '/uz/boss-digital/' },
  ads: { ru: '/ru/internet-reklama-tashkent/', uz: '/uz/internet-reklama-toshkent/' },
};

// One impression per page view. The chat reveals the line once per browser
// session, but a trip to the business tool and back mounts it again.
let seen = false;

/**
 * The business line (plan WP-20, map 03 §9): one quiet offer under the first
 * answer of a conversation that asked for a bot, a site, ads or a CRM
 * (business-intent.ts). Marked as the studio's own line, so it never reads as
 * part of the model's answer; closable, and gone for the day once closed.
 * Its form files the lead as chat_b2b. The chat decides when it shows (once
 * per browser session); the line only counts that it did and that it was
 * closed, by topic, never by anything typed.
 */
export function AiBusinessLine({
  t,
  locale,
  apiBase,
  sessionId,
  topic,
  open,
  onOpen,
  onDismiss,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  sessionId: string | null;
  topic: BusinessTopic;
  /** The form is open in place of the buttons. */
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const copy = leadStrings(locale);

  // Mounted = shown, counted once per page view.
  useEffect(() => {
    if (seen) return;
    seen = true;
    track(EV.b2bLineShown, { topic, locale });
    recordUiEvent(apiBase, 'b2b_line_shown', topic);
    // Intentionally once per mount: a re-render is not another impression.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    track(EV.b2bLineDismissed, { topic, locale });
    recordUiEvent(apiBase, 'b2b_line_dismissed', topic);
    onDismiss();
  };

  return (
    <aside
      className="mt-4 rounded-2xl border border-brand-cyan/15 bg-brand-cyan/[0.04] p-4"
      data-testid="ai-business-line"
      data-topic={topic}
      aria-label={copy.lineLabel}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full bg-brand-cyan/[0.1] px-2.5 py-1 text-[11px] font-medium text-brand-cyan">
            {copy.lineLabel}
          </span>
          <p className="mt-2 text-[14px] leading-relaxed text-white/75">{copy.lineText}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.lineDismiss}
          title={copy.lineDismiss}
          data-testid="ai-business-line-dismiss"
          className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {open ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <AiLeadForm
            t={t}
            locale={locale}
            apiBase={apiBase}
            sessionId={sessionId}
            intent={`business_${topic}`}
            method="chat_b2b_line"
            source="chat_b2b"
            autoFocus
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
          <button
            type="button"
            onClick={onOpen}
            data-testid="ai-business-line-open"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-brand-cyan/30 px-5 text-[14px] font-medium text-brand-cyan transition-colors hover:bg-brand-cyan/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {copy.lineCta}
          </button>
          <a
            href={BUSINESS_LINE_PAGES[topic][locale]}
            className="inline-flex min-h-11 items-center rounded-lg text-[13px] text-white/55 underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {copy.lineMore}
          </a>
        </div>
      )}
    </aside>
  );
}
