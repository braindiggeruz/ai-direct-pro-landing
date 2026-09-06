import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Check } from 'lucide-react';
import type { Locale } from "../types";
import type { ChatStrings } from "../i18n";
import { validAccountView, canStartCheckout, canResumeCheckout, safeAccountLink, safeTermsLink, type AccountView } from "../types";
import { track } from "../analytics";
export type { AccountView } from "../types";
export function AiAccountPanel({
  t,
  locale,
  apiBase,
  onAccount,
  refreshKey,
  openRequest = 0,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  onAccount: (account: AccountView | null) => void;
  refreshKey: number;
  openRequest?: number;
}) {
  const [data, setData] = useState<AccountView | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [open, setOpen] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [termsChanged, setTermsChanged] = useState<string | null>(null);
  const requestKeys = useRef<Partial<Record<"click" | "payme", string>>>({});
  const copy = t.premium;
  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const res = await fetch(`${apiBase}/api/gpt/account`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const next = (await res.json()) as AccountView;
      if (!res.ok || !validAccountView(next)) throw new Error();
      if (generation !== refreshGeneration.current) return;
      if (next.access && next.access.ends_at <= Date.now()) next.access = null;
      setData(next);
      onAccount(next);
      setError(false);
    } catch {
      if (generation === refreshGeneration.current) {
        setError(true);
        setData(null);
        onAccount(null);
      }
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [apiBase, onAccount]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") === "failed") {
      setLoginFailed(true);
      track("account_login_result", { status: "failed", locale });
      setOpen(true);
      url.searchParams.delete("login");
      window.history.replaceState(null, "", url.href);
    }
    const generation = refreshGeneration;
    return () => {
      generation.current++;
    };
  }, [locale]);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);
  useEffect(() => {
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);
  const pendingId = data?.payment && ["pending", "prepared"].includes(data.payment.state) ? data.payment.id : null;
  useEffect(() => {
    if (!pendingId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refresh();
      if (attempts >= 6) window.clearInterval(timer);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [pendingId, refresh]);
  const currentTerms = data?.terms[locale];
  useEffect(() => { setTerms(false); }, [data?.termsVersion, currentTerms, data?.user?.storageKey, locale]);
  useEffect(() => {
    if (open) track("account_opened", { locale, surface: "chat" });
  }, [open, locale]);
  const checkoutReady = !error && !loading && canStartCheckout(data, locale);
  const resumeReady = !error && !loading && canResumeCheckout(data, locale) && termsChanged !== data?.payment?.id;
  const termsUrl = safeTermsLink(data?.terms[locale]);
  const billingAvailable = !!data?.mode && !!data.providers.length;
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
    setError(false);
    try {
      await action();
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'terms_changed') {
        setTerms(false);
        setTermsChanged(data?.payment?.id || 'offer_changed');
        track("account_action_failed", { locale, code: "terms_changed" });
        await refresh();
        return;
      }
      setError(true);
      setData(null);
      onAccount(null);
      track("account_action_failed", { locale, code: "request_failed" });
    } finally {
      setBusy(false);
    }
  };
  const pay = (provider: "click" | "payme") =>
    run(async () => {
      const resume = resumeReady && data?.payment?.provider === provider;
      if ((!checkoutReady && !resume) || !terms || !data?.providers.includes(provider)) throw new Error();
      if (
        data?.payment &&
        !["pending", "prepared"].includes(data.payment.state)
      )
        requestKeys.current[provider] = undefined;
      requestKeys.current[provider] ??= crypto.randomUUID();
      const result = await post("/api/gpt/subscribe", {
        provider,
        locale,
        acceptTerms: true,
        termsVersion: data.termsVersion,
        requestId: requestKeys.current[provider],
      });
      if (
        result.mode === "checkout" &&
        typeof result.checkoutUrl === "string"
      ) {
        const url = new URL(result.checkoutUrl);
        if (
          !["checkout.paycom.uz", "my.click.uz"].includes(url.hostname) ||
          url.protocol !== "https:" || url.username || url.password
        )
          throw new Error();
        track(resume ? "checkout_resumed" : "checkout_started", { method: provider, locale, mode: data.mode || "unavailable" });
        location.assign(url.href);
      } else await refresh();
    });
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
      <Button variant="secondary"
        type="button"
        className="gpt-account-trigger"
        onClick={() => setOpen(true)}
        aria-label={copy.account}
      >
        <Sparkles data-icon="inline-start" />
        <span className="gpt-account-full-label">{data?.access ? "Plus" : copy.account}</span>
        <span className="gpt-account-short-label" aria-hidden="true">Plus</span>
      </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="gpt-account-dialog ym-hide-content"
      >
        <div className="gpt-panel-top">
          <Badge variant="secondary"><Sparkles data-icon="inline-start" /> GPTBot Plus{!billingAvailable && !data?.access ? (locale === "uz" ? " · Tez orada" : " · Скоро") : ""}</Badge>
          <Button variant="ghost" size="icon-lg"
            type="button"
            className="gpt-icon-button"
            onClick={close}
            aria-label={copy.close}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
        <DialogTitle>
          {data?.access ? copy.active : copy.title}
        </DialogTitle>
        <DialogDescription className="sr-only">{copy.benefits}</DialogDescription>
        {loading && <p role="status">{locale === "uz" ? "Akkaunt holati tekshirilmoqda…" : "Проверяем состояние аккаунта…"}</p>}
        {!loading && !data?.access && (
          <Card className="gpt-plan-card">
            <CardHeader><Badge variant="outline">Plus</Badge><CardTitle className="gpt-price">{copy.price}</CardTitle></CardHeader>
            <CardContent><ul className="gpt-plan-features">{(locale === 'uz' ? [
              'Oyiga 300 ta javob. Soatiga 20 va kuniga 50 tagacha.',
              'Uzilishlarda zaxira modellarga avtomatik o‘tish.',
              'Telegram orqali kirib, boshqa qurilmada ham foydalanish.',
            ] : [
              '300 ответов в месяц. До 20 в час и 50 в день.',
              'Автоматический переход на резервные модели при сбоях.',
              'Доступ с разных устройств через вход в Telegram.',
            ]).map(feature => <li key={feature}><Check aria-hidden="true" /><span>{feature}</span></li>)}</ul></CardContent>
            <CardFooter><p className="gpt-panel-note"><Check aria-hidden="true" className="inline size-3 mr-1" />{copy.manual}</p></CardFooter>
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
        {termsChanged && <p role="alert" className="gpt-notice">{locale === 'uz' ? 'To‘lov shartlari yangilandi. Kutilayotgan to‘lovni takrorlamang — avval holatini tekshiring.' : 'Условия оплаты обновились. Не повторяйте ожидающий платёж — сначала проверьте его статус.'}</p>}
        {data?.access && (
          <div className="gpt-access-summary">
            <strong>{data.access.remaining}</strong>
            <span>{copy.remaining}</span>
            <p>
              {copy.expires}:{" "}
              {new Date(data.access.ends_at).toLocaleDateString(
                locale === "uz" ? "uz-UZ" : "ru-RU",
              )}
            </p>
            {data.access.renewSoon && <p>{copy.renew}</p>}
          </div>
        )}
        {data?.scheduled && (
          <p className="gpt-notice">
            {copy.scheduled}:{" "}
            {new Date(data.scheduled.starts_at).toLocaleDateString(
              locale === "uz" ? "uz-UZ" : "ru-RU",
            )}
          </p>
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
                  : !data.access && !data.scheduled
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
                  track("account_login_started", { method: "telegram", locale });
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
                    {copy.price}. {copy.manual}
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
                      {provider === "click" ? "Click" : "Payme"}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
                {data.payment?.provider && ['pending', 'prepared'].includes(data.payment.state) && (
                  <div className="gpt-panel-note">
                    <p>{locale === 'uz' ? 'Bu mavjud hisobga qaytish. Yangi hisob yaratilmaydi.' : 'Возврат к существующему счёту. Новый счёт не создаётся.'}</p>
                    <button type="button" className="gpt-primary" disabled={busy || !terms || !resumeReady} onClick={() => { if (data.payment?.provider) void pay(data.payment.provider); }}>
                      {locale === 'uz' ? 'Shu to‘lovni davom ettirish' : 'Продолжить этот платёж'}
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
                {new Date(period.starts_at).toLocaleDateString(
                  locale === "uz" ? "uz-UZ" : "ru-RU",
                )}
              </button>
            ))}
            <button
              type="button"
              className="gpt-text-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post("/api/gpt/auth/logout", {});
                  setData(null);
                  setConsent(false);
                  setTerms(false);
                  onAccount(null);
                  track("account_logout", { locale });
                  await refresh();
                })
              }
            >
              {copy.logout}
            </button>
          </>
        ))}
        {billingAvailable && (!termsUrl || !data?.termsVersion?.trim()) && <p role="status">{locale === "uz" ? "To‘lov shartlari hali mavjud emas." : "Условия оплаты пока недоступны."}</p>}
        {!loading && !data?.providers.length && (
          <p className="gpt-panel-note">{copy.unavailable}</p>
        )}
        <button
          type="button"
          className="gpt-text-button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {copy.check}
        </button>
        <p className="gpt-panel-note">{copy.historyNote}</p>
      </DialogContent>
    </Dialog>
  );
}
