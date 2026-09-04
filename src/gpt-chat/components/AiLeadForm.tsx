import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ChatStrings } from '../i18n';
import type { Locale } from '../types';
import { fetchTurnstileConfig, sendLead } from '../api';
import { EV, track, trackLeadSubmitted } from '../analytics';
import { parseContact, telegramContact } from '../contact';
import { TurnstileChallenge, type TurnstileChallengeHandle } from './TurnstileChallenge';

/** Which surface produced the lead. Also the GA4 `method` parameter. */
export type LeadMethod = 'offer_b2b' | 'hourly_limit' | 'daily_limit';

type Status = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * The chat's only lead capture. Two fields and a consent box — name, one
 * contact, nothing else — posted to /api/gpt/lead, which needs consent plus a
 * reachable contact and stores the row in gpt_leads.
 *
 * generate_lead fires only after the server acknowledges the write; a submit
 * click is not a lead.
 */
export function AiLeadForm({
  t,
  locale,
  apiBase,
  sessionId,
  intent,
  method,
  intro,
  autoFocus,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  sessionId: string | null;
  /** Short slug stored with the lead so the operator knows what was asked. */
  intent: string;
  method: LeadMethod;
  /** One line above the fields explaining why we are asking. */
  intro?: string;
  /** Set when the form replaced a button the person just pressed. */
  autoFocus?: boolean;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [contactError, setContactError] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const uid = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const tg = telegramContact(locale);
  const privacyHref = locale === 'uz' ? '/uz/maxfiylik-siyosati/' : '/ru/politika-konfidentsialnosti/';
  const telegramLink =
    'inline-flex min-h-11 items-center text-[13px] text-brand-cyan underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded-lg';

  // The form is only ever mounted once it has been revealed, so mounting IS
  // the "lead form opened" moment. Measured here rather than at each call site
  // so every surface reports it the same way.
  useEffect(() => {
    track(EV.leadFormOpened, { method, intent, locale });
    if (autoFocus) firstFieldRef.current?.focus({ preventScroll: true });
    // Intentionally once per mount: re-firing on a prop change would inflate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'sending') return;
    const parsed = parseContact(contact);
    if (!parsed || !consent || (turnstileRequired && !turnstileToken)) {
      setContactError(!parsed);
      setConsentError(!consent);
      return;
    }
    setContactError(false);
    setConsentError(false);
    setStatus('sending');
    requestIdRef.current ??= `lead_${crypto.randomUUID().replace(/-/g, '')}`;
    const res = await sendLead(apiBase, {
      requestId: requestIdRef.current,
      turnstileToken: turnstileToken || undefined,
      name: name.trim() || undefined,
      contactType: parsed.type,
      contactValue: parsed.value,
      phone: parsed.type === 'phone' ? parsed.value : undefined,
      telegram: parsed.type === 'telegram' ? parsed.value : undefined,
      intent,
      sessionId,
      consent: true,
      // Path only — a query string can carry personal data into the record.
      pageUrl: typeof location === 'undefined' ? undefined : location.pathname,
    });
    if (res.ok) {
      setStatus('sent');
      trackLeadSubmitted(method, { mode: parsed.type, intent, locale });
    } else {
      if (res.code === 'turnstile_required' || res.code === 'turnstile_failed') {
        setTurnstileRequired(true);
        setTurnstileToken(null);
        turnstileRef.current?.reset();
        try {
          const config = await fetchTurnstileConfig(apiBase);
          setTurnstileSiteKey(config.siteKey);
        } catch {
          setTurnstileSiteKey(null);
        }
        setStatus('idle');
        return;
      }
      setStatus('failed');
      track(EV.leadFormFailed, { method, intent, code: res.code, locale });
    }
  };

  if (status === 'sent') {
    return (
      <div
        className="rounded-2xl border border-brand-cyan/25 bg-brand-cyan/[0.06] px-4 py-3.5"
        role="status"
        data-testid="ai-lead-success"
      >
        <p className="text-[14px] font-medium text-brand-cyan">{t.leadSuccess}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{t.leadSuccessNext}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-white/60">
          {t.leadSuccessTelegram}{' '}
          <a
            href={tg.href}
            target="_blank"
            rel="nofollow noopener noreferrer"
            onClick={() => track(EV.telegramCtaClicked, { from: 'lead_success', channel: tg.channel, locale })}
            className={telegramLink}
          >
            {tg.channel === 'bot' ? t.telegramCta : t.contactTelegram}
          </a>
        </p>
      </div>
    );
  }

  return (
    // ym-disable-submit: the contact values must stay out of Metrika Form
    // Analysis. Nothing typed here is ever passed to an analytics payload.
    <form onSubmit={onSubmit} noValidate className="ym-disable-submit" data-testid="ai-lead-form">
      {intro && <p className="mb-3 text-[13px] leading-relaxed text-white/60">{intro}</p>}
      <label htmlFor={`${uid}-name`} className="block text-[13px] text-white/70">
        {t.leadName} <span className="text-white/35">({t.leadNameOptional})</span>
      </label>
      <input
        id={`${uid}-name`}
        ref={firstFieldRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
        maxLength={120}
        placeholder={t.leadNamePlaceholder}
        // ym-disable-keys: a visitor's name is never recorded.
        className="mt-1.5 min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-brand-cyan/50 focus-visible:ring-2 focus-visible:ring-brand-cyan/30 ym-disable-keys"
      />

      <label htmlFor={`${uid}-contact`} className="mt-3.5 block text-[13px] text-white/70">
        {t.leadContact} <span aria-hidden="true" className="text-brand-cyan">*</span>
      </label>
      <input
        id={`${uid}-contact`}
        value={contact}
        onChange={(event) => { setContact(event.target.value); if (contactError) setContactError(false); }}
        autoComplete="tel"
        maxLength={200}
        placeholder={t.leadContactPlaceholder}
        aria-required="true"
        aria-invalid={contactError}
        aria-describedby={contactError ? `${uid}-contact-error` : `${uid}-contact-hint`}
        // ym-disable-keys: the phone number / Telegram handle is never recorded.
        className={`mt-1.5 min-h-12 w-full rounded-xl border bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-brand-cyan/30 ym-disable-keys ${contactError ? 'border-red-400/60' : 'border-white/10 focus:border-brand-cyan/50'}`}
      />
      {contactError ? (
        <p id={`${uid}-contact-error`} role="alert" className="mt-1.5 text-[12px] leading-relaxed text-red-300">
          {t.leadContactError}
        </p>
      ) : (
        <p id={`${uid}-contact-hint`} className="mt-1.5 text-[12px] leading-relaxed text-white/40">
          {t.leadContactHint}
        </p>
      )}

      <label className="mt-3.5 flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-white/60">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => { setConsent(event.target.checked); if (consentError) setConsentError(false); }}
          aria-invalid={consentError}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#2FE6D1]"
        />
        <span>
          {t.leadConsent}.{' '}
          <a href={privacyHref} className="text-brand-cyan underline underline-offset-4 hover:no-underline">
            {t.leadPrivacy}
          </a>
        </span>
      </label>
      {/* Exactly what leaves the browser, in plain words. The payload below is
          name + one contact + the intent slug + this session's id + the page
          path — never the conversation itself. */}
      <p className="mt-2 pl-8 text-[12px] leading-relaxed text-white/35">{t.leadConsentDetail}</p>
      {consentError && (
        <p role="alert" className="mt-1.5 text-[12px] leading-relaxed text-red-300">{t.leadConsentError}</p>
      )}

      {turnstileRequired && turnstileSiteKey && (
        <div className="mt-4">
          <TurnstileChallenge
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            action="gpt_lead"
            loadingText={t.turnstileLoading}
            promptText={t.turnstilePrompt}
            verifiedText={t.turnstileVerified}
            errorText={t.turnstileError}
            onTokenChange={setTurnstileToken}
          />
        </div>
      )}
      {turnstileRequired && !turnstileSiteKey && (
        <p role="alert" className="mt-3 text-[13px] text-red-200">{t.turnstileError}</p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="btn-primary mt-4 min-h-12 w-full text-[14px] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {status === 'sending' ? t.leadSending : t.leadSubmit}
      </button>

      {status === 'failed' && (
        <p role="alert" className="mt-3 text-[13px] leading-relaxed text-red-200">
          {t.leadError}{' '}
          <a
            href={tg.href}
            target="_blank"
            rel="nofollow noopener noreferrer"
            onClick={() => track(EV.telegramCtaClicked, { from: 'lead_error', channel: tg.channel, locale })}
            className={telegramLink}
          >
            {tg.channel === 'bot' ? t.telegramCta : t.contactTelegram}
          </a>
        </p>
      )}
    </form>
  );
}
