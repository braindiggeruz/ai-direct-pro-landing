import { useEffect, useState, type RefObject } from "react";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import type { Locale, PackTerms, PaymentProvider } from "../types";
import type { ChatStrings } from "../i18n";
import { accountStrings, groupDigits, type AccountStrings } from "../account-strings";
import {
  PAYMENT_CODE,
  allowedCheckoutUrl,
  billingOpen,
  canResumeCheckout,
  canStartCheckout,
  isPaymentProvider,
  safeTermsLink,
} from "../types";
import type { AccountHandle } from "../use-account";
import { orderId, type CheckoutOutcome, type CheckoutWatch } from "../checkout";
import { track, EV } from "../analytics";
import { recordUiEvent } from "../ui-events";
import { BotLoginScreen } from "./BotLoginScreen";
import { CheckoutReturn } from "./CheckoutReturn";
import { UzumCodeScreen } from "./UzumCodeScreen";
import { PackPanel } from "./PackPanel";

/**
 * What the window must not forget when it closes and opens again: it unmounts
 * with the Dialog, the panel that holds this does not. The same payment request
 * goes out under the same key, so the server answers a repeat with the same
 * invoice, and an invoice refused for changed terms stays refused.
 */
export interface AccountWindowMemory {
  requestKeys: Partial<Record<PaymentProvider, string>>;
  refusedForTerms: string | null;
  /** The Uzum Bank app code subscribe answered with, until the account view carries it. */
  paymentCode: string | null;
}

/** The payment this browser waits for, as AiAccountPanel (start bundle) follows it. */
export interface CheckoutControls {
  watch: CheckoutWatch | null;
  /** How it ended for this page; null while it has not. */
  outcome: CheckoutOutcome | null;
  /** A checkout began: kept (with the composer's question) before the browser may leave. */
  start: (watch: CheckoutWatch) => void;
  /** Leave the result behind: the window shows the pack and the pay step again. */
  dismiss: () => void;
}

/** The providers' own names, in every language. */
export const PROVIDER_NAMES: Record<PaymentProvider, string> = { click: "Click", uzum: "Uzum Bank", payme: "Payme" };

/** A refused request, with the server's code. */
class RequestError extends Error {
  readonly code: string;
  /** pending_elsewhere: the provider whose invoice is still open. */
  readonly provider: PaymentProvider | null;
  constructor(code: string, provider: PaymentProvider | null) {
    super(code);
    this.code = code;
    this.provider = provider;
  }
}

/** The pack on sale: price, what it gives, no automatic renewal, what it is not. */
function PlanCard({ t, copy, pack }: { t: ChatStrings; copy: AccountStrings; pack: PackTerms }) {
  return (
    <>
      <Card className="gpt-plan-card">
        <CardHeader>
          <Badge variant="outline">{t.premium.account}</Badge>
          <CardTitle className="gpt-price">{copy.price(groupDigits(pack.priceUzs), pack.months, pack.messageLimit)}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="gpt-plan-features">
            {copy.packFeatures(pack.months, pack.messageLimit, pack.dailyLimit).map((feature) => (
              <li key={feature}><Check aria-hidden="true" /><span>{feature}</span></li>
            ))}
          </ul>
        </CardContent>
        <CardFooter><p className="gpt-panel-note"><Check aria-hidden="true" className="inline size-3 mr-1" />{t.premium.manual}</p></CardFooter>
      </Card>
      <p className="gpt-panel-note" data-testid="ai-pack-honesty">{copy.honesty}</p>
    </>
  );
}

/**
 * The pack window's body (lazy part chat-account, plan WP-17, map 03
 * §3.2–3.6): the pack and its price for a guest, sign-in through the bot,
 * then «Paketim» with the pay step (the offer's checkbox and one button per
 * provider the server offers, Click first), the way back from a payment, and
 * the Uzum Bank app code. The Dialog, its top bar, the account data and the
 * checkout watch stay on the chat's start bundle (AiAccountPanel,
 * use-account.ts), so the pill and the limit card never wait for this file.
 * Every number of the pack comes from the account view.
 */
export function AccountDialog({
  t,
  locale,
  apiBase,
  account,
  memoryRef,
  loginFailed,
  checkout,
  onClose,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  account: AccountHandle;
  memoryRef: RefObject<AccountWindowMemory>;
  loginFailed: boolean;
  checkout: CheckoutControls;
  onClose: () => void;
}) {
  const { data, error, loading, refresh } = account;
  const copy = accountStrings(locale);
  const [busy, setBusy] = useState(false);
  // On the way to the payment page: nothing to check before the browser leaves.
  const [leaving, setLeaving] = useState(false);
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [termsChanged, setTermsChanged] = useState(() => memoryRef.current.refusedForTerms);
  const [elsewhere, setElsewhere] = useState<PaymentProvider | null>(null);
  const currentTerms = data?.terms[locale];
  useEffect(() => { setTerms(false); }, [data?.termsVersion, currentTerms, data?.user?.storageKey, locale]);
  // Back from the payment page out of the browser's page cache: the page is
  // as it was left, mid-way to the payment page; now it waits for the result.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaving(false);
    };
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);
  const checkoutReady = !error && !loading && canStartCheckout(data, locale);
  const resumeReady = !error && !loading && canResumeCheckout(data, locale) && termsChanged !== data?.payment?.id;
  const termsUrl = safeTermsLink(currentTerms);
  const billingAvailable = billingOpen(data);
  const pack = data?.pack;
  const date = (at: number) => new Date(at).toLocaleDateString(locale === "uz" ? "uz-UZ" : "ru-RU");
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const value = await res.json();
    if (!res.ok || !value.ok)
      throw new RequestError(
        typeof value.code === "string" ? value.code : "request_failed",
        isPaymentProvider(value.provider) ? value.provider : null,
      );
    return value;
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setElsewhere(null);
    account.clearError();
    try {
      await action();
    } catch (cause) {
      const code = cause instanceof RequestError ? cause.code : "request_failed";
      if (code === "terms_changed") {
        setTerms(false);
        memoryRef.current.refusedForTerms = data?.payment?.id || "offer_changed";
        setTermsChanged(memoryRef.current.refusedForTerms);
        track(EV.accountActionFailed, { locale, code });
        await refresh();
        return;
      }
      // Another provider's invoice is still open (U7): say which, and offer it.
      if (code === "pending_elsewhere" && cause instanceof RequestError && cause.provider) {
        setElsewhere(cause.provider);
        track(EV.accountActionFailed, { locale, code });
        await refresh();
        return;
      }
      account.fail();
      track(EV.accountActionFailed, { locale, code: "request_failed" });
    } finally {
      setBusy(false);
    }
  };
  const pay = (provider: PaymentProvider) =>
    run(async () => {
      const resume = resumeReady && data?.payment?.provider === provider;
      if ((!checkoutReady && !resume) || !terms || !data?.providers.includes(provider)) throw new Error();
      if (data.payment && !["pending", "prepared"].includes(data.payment.state))
        memoryRef.current.requestKeys[provider] = undefined;
      memoryRef.current.requestKeys[provider] ??= crypto.randomUUID();
      const result = await post("/api/gpt/subscribe", {
        provider,
        locale,
        acceptTerms: true,
        termsVersion: data.termsVersion,
        requestId: memoryRef.current.requestKeys[provider],
      });
      const attemptId = orderId(result.attemptId);
      const started = () => {
        track(EV.checkoutStarted, { provider, resume, locale, mode: data.mode || "unavailable" });
        recordUiEvent(apiBase, "checkout_started", provider);
      };
      if (result.mode === "checkout") {
        const url = allowedCheckoutUrl(result.checkoutUrl);
        if (!url) throw new Error();
        started();
        setLeaving(true);
        checkout.start({ provider, flow: "redirect", at: Date.now(), attemptId, before: null });
        location.assign(url);
      } else if (result.mode === "code" && typeof result.paymentCode === "string" && PAYMENT_CODE.test(result.paymentCode)) {
        memoryRef.current.paymentCode = result.paymentCode;
        started();
        checkout.start({ provider, flow: "code", at: Date.now(), attemptId: null, before: orderId(data.payment?.id) });
      } else if (result.mode === "test" || result.mode === "status") {
        if (result.mode === "test") started();
        checkout.start({ provider, flow: result.mode, at: Date.now(), attemptId, before: null });
        await refresh();
      } else await refresh();
    });
  const requestRefund = (order: string) =>
    run(async () => {
      await post("/api/gpt/account", { action: "refund_request", orderId: order });
      await refresh();
    });
  const logout = () =>
    void run(async () => {
      await post("/api/gpt/auth/logout", {});
      account.forget();
      setConsent(false);
      setTerms(false);
      track(EV.accountLogout, { locale });
      await refresh();
    });

  const watch = checkout.watch;
  if (watch && leaving)
    return (
      <>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription asChild>
          <p role="status" className="gpt-notice">{copy.payRedirecting}</p>
        </DialogDescription>
      </>
    );
  const appCode = [data?.paymentCode, memoryRef.current.paymentCode].find(
    (code): code is string => typeof code === "string" && PAYMENT_CODE.test(code),
  );
  if (watch?.flow === "code" && appCode && pack && checkout.outcome !== "paid" && checkout.outcome !== "cancelled")
    return (
      <UzumCodeScreen t={t} copy={copy} code={appCode} sum={groupDigits(pack.priceUzs)} loading={loading} onCheck={() => void refresh()} onClose={onClose} />
    );
  if (watch)
    return (
      <CheckoutReturn
        t={t}
        copy={copy}
        watch={watch}
        outcome={checkout.outcome}
        data={data}
        error={error}
        loading={loading}
        date={date}
        onCheck={() => void refresh()}
        onAgain={checkout.dismiss}
        onClose={onClose}
      />
    );

  const offered = data?.providers ?? [];
  const appFlow = (provider: PaymentProvider) => provider === "uzum" && data?.uzumFlow === "code";
  const payStep = billingAvailable && pack && data?.user && (
    <>
      {data.access ? (
        <p className="gpt-panel-note">
          {copy.price(groupDigits(pack.priceUzs), pack.months, pack.messageLimit)}. {t.premium.manual}
        </p>
      ) : (
        <PlanCard t={t} copy={copy} pack={pack} />
      )}
      <label className="gpt-check">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>
          {termsUrl && data.termsVersion ? (
            <a href={termsUrl} target="_blank" rel="noopener noreferrer">{copy.terms}</a>
          ) : (
            copy.terms
          )}
        </span>
      </label>
      <div className="gpt-payment-buttons">
        {offered.map((provider) => (
          <button
            type="button"
            key={provider}
            className="gpt-primary"
            data-provider={provider}
            disabled={busy || !terms || !checkoutReady}
            onClick={() => void pay(provider)}
          >
            {appFlow(provider) ? copy.payInApp : copy.payVia(PROVIDER_NAMES[provider])}
            {!appFlow(provider) && <span aria-hidden="true">↗</span>}
          </button>
        ))}
      </div>
      <p className="gpt-panel-note">{copy.payNote(offered.map((provider) => PROVIDER_NAMES[provider]).join(copy.or))}</p>
      {data.payment?.provider && ["pending", "prepared"].includes(data.payment.state) && (
        <div className="gpt-panel-note">
          <p>{copy.resumeNote}</p>
          <button type="button" className="gpt-primary" disabled={busy || !terms || !resumeReady} onClick={() => { if (data.payment?.provider) void pay(data.payment.provider); }}>
            {copy.resume}
          </button>
        </div>
      )}
    </>
  );
  const paymentState = data?.payment
    ? ["pending", "prepared"].includes(data.payment.state)
      ? copy.pending
      : data.payment.state === "refunded"
        ? copy.refunded
        : data.payment.state === "cancelled"
          ? copy.cancelled
          : !data.access
            ? copy.expired
            : ""
    : "";

  return (
    <>
      <DialogTitle>{data?.access ? copy.active : copy.title}</DialogTitle>
      <DialogDescription className="sr-only">
        {pack ? copy.benefits(pack.months, pack.messageLimit, pack.dailyLimit) : copy.title}
      </DialogDescription>
      {loading && <p role="status">{copy.checking}</p>}
      {data?.mode === "test" && <p className="gpt-notice">{copy.test}</p>}
      {error && <p role="alert" className="gpt-error">{copy.failed}</p>}
      {loginFailed && <p role="alert" className="gpt-error">{copy.loginFailed}</p>}
      {termsChanged && <p role="alert" className="gpt-notice">{copy.termsChanged}</p>}
      {elsewhere && <p role="alert" className="gpt-notice">{copy.payPendingElsewhere(PROVIDER_NAMES[elsewhere])}</p>}
      {data && !data.user && (
        <>
          {/* A price only while the pack can really be bought (F6). */}
          {billingAvailable && pack && <PlanCard t={t} copy={copy} pack={pack} />}
          {data.loginAvailable && (
            <>
              <p className="gpt-panel-note">{copy.loginWhy}</p>
              <label className="gpt-check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  {copy.loginConsent}{" "}
                  <a href={locale === "uz" ? "/uz/maxfiylik-siyosati/" : "/ru/politika-konfidentsialnosti/"}>{t.leadPrivacy}</a>
                </span>
              </label>
              {/* The bot first (no BotFather client needed); Telegram's OIDC
                  when the server offers only that. */}
              {data.loginMethods?.includes("bot") ? (
                <BotLoginScreen
                  locale={locale}
                  apiBase={apiBase}
                  copy={copy}
                  consent={consent}
                  disabled={busy || error || loading}
                  onSignedIn={refresh}
                />
              ) : (
                <button
                  type="button"
                  className="gpt-primary"
                  disabled={busy || error || loading || !consent}
                  onClick={() =>
                    void run(async () => {
                      if (!data.loginAvailable || !consent) return;
                      track(EV.loginStarted, { method: "oidc", locale });
                      recordUiEvent(apiBase, "login_started", "oidc");
                      const result = await post("/api/gpt/auth/start", { locale, consent });
                      const url = new URL(result.url);
                      if (url.origin !== "https://oauth.telegram.org") throw new Error();
                      location.assign(url.href);
                    })
                  }
                >
                  {copy.login}
                </button>
              )}
            </>
          )}
        </>
      )}
      {data?.user && (
        <PackPanel copy={copy} data={data} busy={busy} date={date} onRefund={requestRefund} onLogout={logout}>
          {payStep}
          {paymentState && <p className="gpt-panel-note" role="status">{paymentState}</p>}
        </PackPanel>
      )}
      {billingAvailable && (!termsUrl || !data?.termsVersion?.trim()) && <p role="status">{copy.termsMissing}</p>}
      {!loading && !offered.length && <p className="gpt-panel-note">{copy.unavailable}</p>}
      <button type="button" className="gpt-text-button" disabled={busy} onClick={() => void refresh()}>
        {t.premium.check}
      </button>
      <p className="gpt-panel-note">{t.premium.historyNote}</p>
    </>
  );
}
