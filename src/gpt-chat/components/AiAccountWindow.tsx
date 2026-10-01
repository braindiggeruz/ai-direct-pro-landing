import { useEffect, useState, type RefObject } from "react";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import type { Locale } from "../types";
import type { ChatStrings } from "../i18n";
import { accountStrings } from "../account-strings";
import { billingOpen, canStartCheckout, canResumeCheckout, safeAccountLink, safeTermsLink, allowedCheckoutUrl, type PaymentProvider } from "../types";
import type { AccountHandle } from "../use-account";
import { track, EV } from "../analytics";

/**
 * What the window must not forget when it closes and opens again: it unmounts
 * with the Dialog, the panel that holds this does not. The same payment request
 * goes out under the same key, so the server answers a repeat with the same
 * invoice, and an invoice refused for changed terms stays refused.
 */
export interface AccountWindowMemory {
  requestKeys: Partial<Record<PaymentProvider, string>>;
  refusedForTerms: string | null;
}

/**
 * The pack window's body (lazy part chat-account): the price, sign-in, the
 * payment buttons, the active pack, receipts and refunds. The Dialog, its top
 * bar and the account data stay on the chat's start bundle (AiAccountPanel,
 * use-account.ts), so the pill and the limit card never wait for this file.
 */
export function AiAccountWindow({
  t,
  locale,
  apiBase,
  account,
  memoryRef,
  loginFailed,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  account: AccountHandle;
  memoryRef: RefObject<AccountWindowMemory>;
  loginFailed: boolean;
}) {
  const { data, error, loading, refresh } = account;
  const copy = accountStrings(locale);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [termsChanged, setTermsChanged] = useState(() => memoryRef.current.refusedForTerms);
  const currentTerms = data?.terms[locale];
  useEffect(() => { setTerms(false); }, [data?.termsVersion, currentTerms, data?.user?.storageKey, locale]);
  const checkoutReady = !error && !loading && canStartCheckout(data, locale);
  const resumeReady = !error && !loading && canResumeCheckout(data, locale) && termsChanged !== data?.payment?.id;
  const termsUrl = safeTermsLink(data?.terms[locale]);
  const billingAvailable = billingOpen(data);
  const date = (at: number) => new Date(at).toLocaleDateString(locale === "uz" ? "uz-UZ" : "ru-RU");
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const value = await res.json();
    if (!res.ok || !value.ok) throw new Error(value.code === 'terms_changed' ? 'terms_changed' : 'request_failed');
    return value;
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    account.clearError();
    try {
      await action();
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'terms_changed') {
        setTerms(false);
        memoryRef.current.refusedForTerms = data?.payment?.id || 'offer_changed';
        setTermsChanged(memoryRef.current.refusedForTerms);
        track(EV.accountActionFailed, { locale, code: "terms_changed" });
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
      if (
        data?.payment &&
        !["pending", "prepared"].includes(data.payment.state)
      )
        memoryRef.current.requestKeys[provider] = undefined;
      memoryRef.current.requestKeys[provider] ??= crypto.randomUUID();
      const result = await post("/api/gpt/subscribe", {
        provider,
        locale,
        acceptTerms: true,
        termsVersion: data.termsVersion,
        requestId: memoryRef.current.requestKeys[provider],
      });
      if (
        result.mode === "checkout" &&
        typeof result.checkoutUrl === "string"
      ) {
        const url = allowedCheckoutUrl(result.checkoutUrl);
        if (!url) throw new Error();
        track(EV.checkoutStarted, { provider, resume, locale, mode: data.mode || "unavailable" });
        location.assign(url);
      } else await refresh();
    });
  return (
    <>
      <DialogTitle>
        {data?.access ? copy.active : copy.title}
      </DialogTitle>
      <DialogDescription className="sr-only">{copy.benefits}</DialogDescription>
      {loading && <p role="status">{copy.checking}</p>}
      {/* A price only while the pack can really be bought (F6). */}
      {!loading && billingAvailable && !data?.access && (
        <Card className="gpt-plan-card">
          <CardHeader><Badge variant="outline">{t.premium.account}</Badge><CardTitle className="gpt-price">{copy.price}</CardTitle></CardHeader>
          <CardContent><ul className="gpt-plan-features">{copy.packFeatures.map(feature => <li key={feature}><Check aria-hidden="true" /><span>{feature}</span></li>)}</ul></CardContent>
          <CardFooter><p className="gpt-panel-note"><Check aria-hidden="true" className="inline size-3 mr-1" />{t.premium.manual}</p></CardFooter>
        </Card>
      )}
      {data?.mode === "test" && <p className="gpt-notice">{copy.test}</p>}
      {error && (
        <p role="alert" className="gpt-error">
          {copy.failed}
        </p>
      )}
      {loginFailed && (
        <p role="alert" className="gpt-error">
          {copy.loginFailed}
        </p>
      )}
      {termsChanged && <p role="alert" className="gpt-notice">{copy.termsChanged}</p>}
      {data?.access && (
        <div className="gpt-access-summary">
          <strong>{data.access.remaining}</strong>
          <span>{copy.remaining}</span>
          <p>
            {copy.expires}: {date(data.access.ends_at)}
          </p>
          {data.access.renewSoon && <p>{copy.renew}</p>}
        </div>
      )}
      {data?.receipts?.filter(receipt => safeAccountLink(receipt.receipt_url)).map((receipt, i) => (
        <a
          key={i}
          className="gpt-text-button"
          href={safeAccountLink(receipt.receipt_url)!}
          target="_blank"
          rel="noopener noreferrer"
        >
          {receipt.kind === "CANCEL" ? copy.refundReceipt : copy.receipt}
        </a>
      ))}
      {data?.payment && (
        <p className="gpt-panel-note" role="status">
          {["pending", "prepared"].includes(data.payment.state)
            ? copy.pending
            : data.payment.state === "refunded"
              ? copy.refunded
              : data.payment.state === "cancelled"
                ? copy.cancelled
                : !data.access
                  ? copy.expired
                  : ""}
        </p>
      )}
      {data && (!data.user ? (data.loginAvailable ? (
        <>
          <label className="gpt-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {copy.loginConsent}{" "}
              <a
                href={
                  locale === "uz"
                    ? "/uz/maxfiylik-siyosati/"
                    : "/ru/politika-konfidentsialnosti/"
                }
              >
                {t.leadPrivacy}
              </a>
            </span>
          </label>
          <button
            type="button"
            className="gpt-primary"
            disabled={busy || error || loading || !consent || !data?.loginAvailable}
            onClick={() =>
              void run(async () => {
                if (!data?.loginAvailable || !consent) return;
                track(EV.loginStarted, { method: "telegram", locale });
                const result = await post("/api/gpt/auth/start", {
                  locale,
                  consent,
                });
                const url = new URL(result.url);
                if (url.origin !== "https://oauth.telegram.org")
                  throw new Error();
                location.assign(url.href);
              })
            }
          >
            {copy.login}
          </button>
        </>
      ) : null) : (
        <>
          {billingAvailable && (
            <>
              {data.access && (
                <p className="gpt-panel-note">
                  {copy.price}. {t.premium.manual}
                </p>
              )}
              <label className="gpt-check">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                <span>
                  {termsUrl && data.termsVersion ? (
                    <a
                      href={termsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {copy.terms}
                    </a>
                  ) : (
                    copy.terms
                  )}
                </span>
              </label>
              <div className="gpt-payment-buttons">
                {data.providers.map((provider) => (
                  <button
                    type="button"
                    key={provider}
                    className="gpt-primary"
                    disabled={busy || !terms || !checkoutReady}
                    onClick={() => void pay(provider)}
                  >
                    {provider === "click" ? "Click" : provider === "uzum" ? "Uzum Bank" : "Payme"}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              {data.payment?.provider && ['pending', 'prepared'].includes(data.payment.state) && (
                <div className="gpt-panel-note">
                  <p>{copy.resumeNote}</p>
                  <button type="button" className="gpt-primary" disabled={busy || !terms || !resumeReady} onClick={() => { if (data.payment?.provider) void pay(data.payment.provider); }}>
                    {copy.resume}
                  </button>
                </div>
              )}
            </>
          )}
          {data.refundable?.map((period) => (
            <button
              key={period.order_id}
              type="button"
              className="gpt-text-button"
              disabled={busy || !!period.refund_requested_at}
              onClick={() =>
                void run(async () => {
                  await post("/api/gpt/account", {
                    action: "refund_request",
                    orderId: period.order_id,
                  });
                  await refresh();
                })
              }
            >
              {period.refund_requested_at ? copy.refundPending : copy.refund}
              {" · "}
              {date(period.starts_at)}
            </button>
          ))}
          <button
            type="button"
            className="gpt-text-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await post("/api/gpt/auth/logout", {});
                account.forget();
                setConsent(false);
                setTerms(false);
                track(EV.accountLogout, { locale });
                await refresh();
              })
            }
          >
            {copy.logout}
          </button>
        </>
      ))}
      {billingAvailable && (!termsUrl || !data?.termsVersion?.trim()) && <p role="status">{copy.termsMissing}</p>}
      {!loading && !data?.providers.length && (
        <p className="gpt-panel-note">{copy.unavailable}</p>
      )}
      <button
        type="button"
        className="gpt-text-button"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {t.premium.check}
      </button>
      <p className="gpt-panel-note">{t.premium.historyNote}</p>
    </>
  );
}
