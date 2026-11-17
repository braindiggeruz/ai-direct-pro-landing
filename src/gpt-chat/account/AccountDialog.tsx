import { useEffect, useRef, useState, type RefObject } from "react";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AccountView, Locale, PackTerms, PaymentProvider } from "../types";
import type { ChatStrings } from "../i18n";
import { accountStrings, groupDigits, type AccountStrings } from "../account-strings";
import {
  PAYMENT_CODE,
  allowedCheckoutUrl,
  billingOpen,
  canPayAsGuest,
  canResumeCheckout,
  canStartCheckout,
  isPaymentProvider,
  offeredProviders,
  checkoutOfferKey,
  safeTermsLink,
} from "../types";
import type { AccountHandle } from "../use-account";
import { PayIn, payPart, uzumPart } from "./pay-part";
import { loadBotLogin } from "../bot-login";
import { orderId, type CheckoutOutcome, type CheckoutWatch } from "../checkout";
import { track, trackMetaCheckout, EV } from "../analytics";
import { recordUiEvent } from "../ui-events";
import { BotLoginScreen } from "./BotLoginScreen";
import { LazyPart } from "../lazy-part";
import { AccessSummary, PackPanel, SupportLine } from "./PackPanel";

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
  /** The limit card's tap (PackOpenRequest.seq) this window already paid for: one order per tap. */
  autoPaid?: number | null;
  /** Synchronous guard shared across lazy-window remounts and rapid taps. */
  inFlight?: boolean;
  /** Closing the frame invalidates continuations of requests already sent. */
  generation?: number;
  /** The payment this tap is making: chat-pay counts its steps (loaded beside the request) and speaks for it. */
  trace?: { provider: PaymentProvider; ask: boolean; t0: number; loaded: Promise<Awaited<ReturnType<typeof payPart.load>> | null> } | null;
  /** «Попросить оплатить»: the provider's link made for someone else, shown instead of leaving. */
  shared?: { provider: PaymentProvider; url: string; at: number; id: string | null } | null;
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

/** This page still here this long after the browser was sent to the provider's page: it did not leave. */
const STAYED_MS = 12_000;

/** What a tap on a pay button was made on: the account, its open order, the offer and the price. */
function tapKey(view: AccountView | null): string | null {
  return view && JSON.stringify([
    view.user?.storageKey ?? null, view.payment?.id ?? null, view.payment?.state ?? null,
    view.mode, view.termsVersion, view.pack?.priceUzs ?? null, view.pack?.messageLimit ?? null,
  ]);
}

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

/**
 * The pack on sale, compact (one tap, 07.10): the price big, the facts in one
 * line (months, answers, the day cap, no automatic renewal), and the notes
 * folded behind «Подробнее»: what it gives, that a paid pack is not refundable
 * (the offer, section 8), what it is not, where the card data goes, and the
 * caller's `notes` (a guest's). A <details>: the notes are in the page for a
 * reader who opens them and for a screen reader, without a line of state.
 */
function PlanCard({ t, copy, pack, notes = [] }: { t: ChatStrings; copy: AccountStrings; pack: PackTerms; notes?: string[] }) {
  return (
    <Card className="gpt-plan-card">
      <CardHeader>
        <Badge variant="outline">{t.premium.account}</Badge>
        <CardTitle className="gpt-price">{copy.sum(groupDigits(pack.priceUzs))}</CardTitle>
        <p className="gpt-plan-line">{t.premium.packLine(pack)}</p>
      </CardHeader>
      <CardContent>
        <details className="gpt-plan-more">
          <summary><span>{copy.fine}</span> <span className="gpt-plan-more-link">{t.limitMore}</span></summary>
          <ul className="gpt-plan-features">
            {copy.packFeatures(pack.months, pack.messageLimit, pack.dailyLimit).map((feature) => (
              <li key={feature}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>{feature}</span></li>
            ))}
          </ul>
          <p className="gpt-panel-note">{t.premium.manual}</p>
          <p className="gpt-panel-note" data-testid="ai-pack-no-refund">{copy.noRefund}</p>
          <p className="gpt-panel-note" data-testid="ai-pack-honesty">{copy.honesty}</p>
          {notes.map((note) => <p key={note} className="gpt-panel-note">{note}</p>)}
        </details>
      </CardContent>
    </Card>
  );
}

/**
 * The pack window's body (lazy part chat-account, plan WP-17, map 03
 * §3.2–3.6): the pack and its price for a guest, sign-in through the bot,
 * then «Paketim» with the pay step (one button per provider the visitor may
 * pay with, Click first, live at once; under them, that pressing «Оплатить»
 * accepts the offer — one tap, owner's order of 07.10), the way back from a
 * payment, and the Uzum Bank app code. A tap on the limit card's provider
 * button opens the window with `autoPay`: the order is created and the
 * browser leaves for the provider's page without a second screen. The Dialog, its top bar, the account data and the
 * checkout watch stay on the chat's start bundle (AiAccountPanel,
 * use-account.ts), so the pill and the limit card never wait for this file.
 * Every number of the pack comes from the account view.
 *
 * One open invoice per account (U7, WP-24): the pay step offers to resume it,
 * or, while no provider has seen it, to close it and pay another way; the
 * way back from a payment and the app code lead there too, and a provider
 * refused for another's open invoice (409 pending_elsewhere) is pointed there.
 */
export function AccountDialog({
  t,
  locale,
  apiBase,
  account,
  memoryRef,
  loginFailed,
  checkout,
  autoPay = null,
  onClose,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  account: AccountHandle;
  memoryRef: RefObject<AccountWindowMemory>;
  loginFailed: boolean;
  checkout: CheckoutControls;
  /** The limit card's tap: pay with this provider as soon as the view allows (once per `seq`). */
  autoPay?: { seq: number; provider: PaymentProvider; offerKey: string | null } | null;
  onClose: () => void;
}) {
  const { data, error, loading, refresh } = account;
  const latestAccount = useRef(data);
  latestAccount.current = data;
  const copy = accountStrings(locale);
  const [busy, setBusy] = useState(false);
  // From the tap to the payment page: nothing to check before the browser leaves.
  const [leaving, setLeaving] = useState<PaymentProvider | null>(null);
  const redirecting = useRef(false);
  // The flow stopped before the provider's page: said, with a retry (chat-pay).
  const [stall, setStall] = useState<{ provider: PaymentProvider; ask: boolean; kind: "stale" | "bad_url" | "failed" } | null>(null);
  const [consent, setConsent] = useState(false);
  // Sign-in through Telegram, opened on request: beside guest checkout, and
  // for a guest's pack, to keep it on any phone (IdentityStore.adoptGuest).
  // Open by itself while this tab is in a sign-in through the bot (a reload,
  // or an account read that failed and came back): its screen polls it to
  // the end (AiAccountPanel reopened the window for it).
  const [signIn, setSignIn] = useState(() => loadBotLogin() !== null);
  // The browser did not keep the guest account's cookie (guest checkout).
  const [cookiesBlocked, setCookiesBlocked] = useState(false);
  const [termsChanged, setTermsChanged] = useState(() => memoryRef.current.refusedForTerms);
  const [elsewhere, setElsewhere] = useState<PaymentProvider | null>(null);
  // The provider took up the invoice the account tried to close.
  const [held, setHeld] = useState(false);
  // Back at the pay step while a payment is still watched (CheckoutReturn,
  // UzumCodeScreen): to resume the invoice or to pay another way.
  const [choosing, setChoosing] = useState(false);
  const currentTerms = data?.terms[locale];
  useEffect(() => { setSignIn(loadBotLogin() !== null); }, [data?.user?.storageKey]);
  // The payment's steps and messages (chat-pay) are fetched with the window, so a tap never waits for them.
  useEffect(() => { payPart.preload(); }, []);
  // Back from the payment page out of the browser's page cache: the page is
  // as it was left, mid-way to the payment page; now it waits for the result.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) {
        redirecting.current = false;
        setLeaving(null);
      }
    };
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);
  // Sent to the provider's page, and this page is still here: in view again
  // (an app took the link and the visitor came back), or twelve seconds on
  // (the browser held the link). Back to the wait, which reads the order and
  // has the ways on, instead of «Открываем…» for ever.
  useEffect(() => {
    if (!leaving) return;
    let waited = 0;
    const stay = () => {
      if (!redirecting.current || document.visibilityState === "hidden") return;
      redirecting.current = false;
      setLeaving(null);
    };
    const timer = window.setInterval(() => {
      if (redirecting.current && (waited += 1_000) >= STAYED_MS) stay();
    }, 1_000);
    document.addEventListener("visibilitychange", stay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", stay);
    };
  }, [leaving]);
  const cookiesReady = !cookiesBlocked && globalThis.navigator?.cookieEnabled !== false;
  // What the last read of the account allows; a payment starts only once no
  // read is in flight (`…Ready`), and a tap during one waits for it (payWhenRead).
  const startable = !error && cookiesReady && canStartCheckout(data, locale);
  const resumable = !error && cookiesReady && canResumeCheckout(data, locale) && termsChanged !== data?.payment?.id;
  const checkoutReady = startable && !loading;
  const resumeReady = resumable && !loading;
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
    if (memoryRef.current.inFlight) return;
    const generation = memoryRef.current.generation ?? 0;
    memoryRef.current.inFlight = true;
    setBusy(true);
    setElsewhere(null);
    setHeld(false);
    setStall(null);
    memoryRef.current.trace = null;
    account.clearError();
    try {
      await action();
    } catch (cause) {
      if (generation !== (memoryRef.current.generation ?? 0)) return;
      const code = cause instanceof RequestError ? cause.code : "request_failed";
      // Read again, not narrowed to the null it was reset to: the payment sets it.
      const trace = (memoryRef as RefObject<AccountWindowMemory>).current.trace ?? null;
      void trace?.loaded.then((m) => m?.payEvent(apiBase, "checkout_aborted", trace.provider, trace.t0, m.abortReason(code)));
      if (code === "terms_changed") {
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
      // The provider took the invoice up while it was being closed.
      if (code === "invoice_in_progress") {
        setHeld(true);
        track(EV.accountActionFailed, { locale, code });
        await refresh();
        return;
      }
      // A payment says so, with a retry; any other action fails as before.
      if (trace) setStall({ provider: trace.provider, ask: trace.ask, kind: "failed" });
      else account.fail();
      track(EV.accountActionFailed, { locale, code: "request_failed" });
    } finally {
      memoryRef.current.inFlight = false;
      if (!redirecting.current) setLeaving(null);
      setBusy(false);
    }
  };
  const pay = (provider: PaymentProvider, ask = false) =>
    run(async () => {
      const resume = resumeReady && data?.payment?.provider === provider;
      if ((!checkoutReady && !resume) || !data || !offeredProviders(data).includes(provider)
        || globalThis.navigator?.cookieEnabled === false) throw new Error();
      const generation = memoryRef.current.generation ?? 0;
      // A guest has no account until subscribe makes one: that change is this order's own.
      const stillCurrent = () => generation === (memoryRef.current.generation ?? 0)
        && (!data.user || latestAccount.current?.user?.storageKey === data.user.storageKey);
      // The tap: the window says at once that it is working, and chat-pay
      // (fetched beside the request) counts the steps.
      const t0 = Date.now();
      const loaded = payPart.load().catch(() => null);
      memoryRef.current.trace = { provider, ask, t0, loaded };
      if (!ask) {
        memoryRef.current.shared = null;
        setLeaving(provider);
      }
      // Pressing the button is the acceptance (the offer, section 7): the
      // server records the edition and the time on the order, as before.
      if (data.payment && !["pending", "prepared"].includes(data.payment.state))
        memoryRef.current.requestKeys[provider] = undefined;
      memoryRef.current.requestKeys[provider] ??= crypto.randomUUID();
      const result = await post("/api/gpt/subscribe", {
        provider,
        locale,
        // Back to this page after paying; the server keeps only a listed chat page (return-path.ts).
        returnPath: location.pathname,
        acceptTerms: true,
        termsVersion: data.termsVersion,
        requestId: memoryRef.current.requestKeys[provider],
      });
      const m = await loaded;
      m?.payEvent(apiBase, "checkout_created", provider, t0);
      // Stopping after the order exists is never silent: the step is counted and the window says so.
      const stop = (reason: "stale" | "bad_url" | "cookies") => {
        m?.payEvent(apiBase, "checkout_aborted", provider, t0, reason);
        if (reason !== "cookies") setStall({ provider, ask, kind: reason });
      };
      // The order may already exist server-side. Closing or changing accounts
      // stops this continuation; it never silently cancels a provider invoice.
      if (!stillCurrent()) return stop("stale");
      const attemptId = orderId(result.attemptId);
      const started = () => {
        track(EV.checkoutStarted, { provider, resume, locale, mode: data.mode || "unavailable" });
        recordUiEvent(apiBase, "checkout_started", provider);
        setChoosing(false);
      };
      if (result.mode === "checkout") {
        const url = allowedCheckoutUrl(result.checkoutUrl);
        if (!url) return stop("bad_url");
        // A guest's pack is this browser's cookie: never leave for Click
        // unless the browser kept the one subscribe just set.
        if (!data.user) {
          const probing = Date.now();
          let current: { user?: { guest?: unknown } | null; payment?: { id?: unknown } | null } | null;
          try {
            const probe = await fetch(`${apiBase}/api/gpt/account`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
            if (!probe.ok) throw new Error();
            current = await probe.json();
          } catch {
            m?.payEvent(apiBase, "checkout_probe_failed", provider, probing);
            throw new RequestError("request_failed", null);
          }
          if (!stillCurrent()) return stop("stale");
          if (current?.user?.guest !== true || current?.payment?.id !== attemptId) {
            m?.payEvent(apiBase, "checkout_probe_failed", provider, probing);
            stop("cookies");
            setCookiesBlocked(true);
            await refresh();
            return;
          }
        }
        // Someone else pays: the same order and link, shown instead of leaving. The pack turns on here.
        if (ask) {
          memoryRef.current.shared = { provider, url, at: Date.now(), id: attemptId };
          setChoosing(false);
          checkout.start({ provider, flow: "status", at: Date.now(), attemptId, before: null });
          // Watched while this page lives, never stored: nobody left for a payment
          // page, so a reload must not open the window to say «не завершена».
          // (checkout.ts keeps the trip under this key; removed here, not through
          // an export the start bundle would have to carry.)
          try { localStorage.removeItem("gptchat_checkout"); } catch { /* storage blocked: nothing was stored */ }
          return;
        }
        started();
        if (!resume && data.mode === "live" && attemptId && data.pack)
          trackMetaCheckout({ transactionId: attemptId, value: data.pack.priceUzs, itemId: `ai_paket_${data.pack.messageLimit}` });
        redirecting.current = true;
        // The last step counted: fetch with keepalive, so it survives the navigation.
        m?.payEvent(apiBase, "checkout_redirect", provider, t0);
        checkout.start({ provider, flow: "redirect", at: Date.now(), attemptId, before: null });
        location.assign(url);
      } else if (result.mode === "code" && typeof result.paymentCode === "string" && PAYMENT_CODE.test(result.paymentCode)) {
        memoryRef.current.paymentCode = result.paymentCode;
        started();
        checkout.start({ provider, flow: "code", at: Date.now(), attemptId: null, before: orderId(data.payment?.id) });
      } else if (result.mode === "test" || result.mode === "status") {
        if (result.mode === "test") started();
        setChoosing(false);
        checkout.start({ provider, flow: result.mode, at: Date.now(), attemptId, before: null });
        await refresh();
      } else await refresh();
    });
  // A tap while the account view is being read again (a watched payment reads
  // it every few seconds) is neither refused nor lost: it waits for that read
  // and pays only if the read shows the same account, order and offer the
  // visitor tapped on. Anything else changed the screen: the tap is dropped.
  const [queued, setQueued] = useState<{ provider: PaymentProvider; ask: boolean; seen: string | null } | null>(null);
  const payWhenRead = (provider: PaymentProvider, ask = false) => {
    if (!loading || error || !data) return void pay(provider, ask);
    if (!ask) setLeaving(provider);
    setQueued({ provider, ask, seen: tapKey(data) });
  };
  useEffect(() => {
    if (!queued || loading) return;
    setQueued(null);
    if (memoryRef.current.inFlight || error || queued.seen !== tapKey(data)) {
      setLeaving(null);
      return;
    }
    void pay(queued.provider, queued.ask);
    // It waits for the tap and for the end of the read; the rest is as that render has it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, loading]);
  // Close the account's own invoice no provider has seen yet (BillingStore.cancelInvoice).
  const cancelInvoice = (order: string) =>
    run(async () => {
      await post("/api/gpt/account", { action: "cancel_invoice", orderId: order });
      await refresh();
    });
  const logout = () =>
    void run(async () => {
      await post("/api/gpt/auth/logout", {});
      // The next account must not send this one's payment request keys.
      memoryRef.current.requestKeys = {};
      account.forget();
      setConsent(false);
      track(EV.accountLogout, { locale });
      await refresh();
    });

  // The providers this visitor pays with (types.ts): a guest Click and a live Payme.
  const offered = offeredProviders(data);
  // The limit card's tap pays here, once per tap, as soon as a checkout can
  // start with that provider (never over an open invoice: the pay step then
  // offers to resume it instead). The tap's number lives in the window's
  // memory, so reopening the window does not pay again.
  useEffect(() => {
    if (!autoPay || memoryRef.current.autoPaid === autoPay.seq) return;
    // Consume even a blocked intent: cancelling another invoice, a later
    // account refresh or a new offer must never resurrect an earlier tap.
    memoryRef.current.autoPaid = autoPay.seq;
    if (!checkoutReady || busy || memoryRef.current.inFlight || !offered.includes(autoPay.provider)
      || !autoPay.offerKey || autoPay.offerKey !== checkoutOfferKey(data, locale)) return;
    void pay(autoPay.provider);
  });

  const watch = checkout.watch;
  if (leaving)
    return (
      <>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription asChild>
          <p role="status" className="gpt-notice" data-testid="ai-pay-opening">{copy.payOpening(PROVIDER_NAMES[leaving])}</p>
        </DialogDescription>
      </>
    );
  // The message of a flow that stopped, above whatever screen follows.
  const gone = <p role="alert" className="gpt-error">{copy.failed}</p>;
  const stalled = stall && <PayIn is="PayStall" failed={gone} locale={locale} {...stall} busy={busy || !!queued} onRetry={() => payWhenRead(stall.provider, stall.ask)} />;
  // Someone else pays (chat-pay): the link, until the pack is here.
  const shared = memoryRef.current.shared;
  if (shared && checkout.outcome === "paid") memoryRef.current.shared = null;
  else if (shared && watch && !choosing)
    return (
      <>
        {stalled}
        <PayIn
          is="PayShare"
          failed={gone}
          locale={locale}
          {...shared}
          orderState={data?.payment?.id === shared.id ? data.payment.state : null}
          priceUzs={pack?.priceUzs ?? 0}
          busy={busy || !!queued}
          onCheck={() => void refresh()}
          onNew={() => { memoryRef.current.shared = null; payWhenRead(shared.provider, true); }}
          onPayMyself={() => { memoryRef.current.shared = null; payWhenRead(shared.provider); }}
          onBack={() => { memoryRef.current.shared = null; setChoosing(true); }}
        />
      </>
    );
  const appCode = [data?.paymentCode, memoryRef.current.paymentCode].find(
    (code): code is string => typeof code === "string" && PAYMENT_CODE.test(code),
  );
  if (watch?.flow === "code" && appCode && pack && !choosing && checkout.outcome !== "paid" && checkout.outcome !== "cancelled")
    return (
      <LazyPart part={uzumPart} fallback={<DialogTitle>{copy.uzumCodeTitle}</DialogTitle>} failed={gone}>
        {({ UzumCodeScreen }) => (
          <UzumCodeScreen
            t={t}
            copy={copy}
            code={appCode}
            sum={groupDigits(pack.priceUzs)}
            loading={loading}
            onCheck={() => void refresh()}
            onChange={() => setChoosing(true)}
            onClose={onClose}
          />
        )}
      </LazyPart>
    );
  // A payment that turned out paid is said even after "change the way to pay".
  if (watch && (!choosing || checkout.outcome === "paid"))
    return (
      <>
      {stalled}
      <PayIn
        is="CheckoutReturn"
        fallback={<><DialogTitle>{copy.payChecking}</DialogTitle><p role="status" className="gpt-panel-note">{copy.payCheckingNote}</p><button type="button" className="gpt-text-button" onClick={onClose}>{copy.payBackToChat}</button></>}
        t={t}
        copy={copy}
        locale={locale}
        apiBase={apiBase}
        busy={busy || !!queued}
        onPay={payWhenRead}
        watch={watch}
        outcome={checkout.outcome}
        data={data}
        error={error}
        loading={loading}
        summary={data?.access && <AccessSummary copy={copy} access={data.access} pack={data.pack} date={date} />}
        support={<SupportLine copy={copy} />}
        onCheck={() => void refresh()}
        onAgain={checkout.dismiss}
        onChange={() => setChoosing(true)}
        onSave={() => {
          setSignIn(true);
          checkout.dismiss();
        }}
        onClose={onClose}
      />
      </>
    );

  // Without an account (guest checkout): subscribe makes this browser a guest.
  const guestPay = !!data && !data.user && billingAvailable && !!pack && canPayAsGuest(data)
    && !cookiesBlocked && globalThis.navigator?.cookieEnabled !== false;
  const openPayment = data?.payment && ["pending", "prepared"].includes(data.payment.state) ? data.payment : null;
  const appFlow = (provider: PaymentProvider) => provider === "uzum" && data?.uzumFlow === "code";
  const payStep = billingAvailable && pack && (data?.user || guestPay) && (
    <>
      {data?.access ? (
        <>
          <p className="gpt-panel-note">
            {copy.price(groupDigits(pack.priceUzs), pack.months, pack.messageLimit)}. {t.premium.manual}
          </p>
          <p className="gpt-panel-note" data-testid="ai-pack-no-refund">{copy.noRefund}</p>
          <p className="gpt-panel-note">{copy.payNote(offered.map((provider) => PROVIDER_NAMES[provider]).join(copy.or))}</p>
        </>
      ) : (
        // A guest saw the price card above the pay step already.
        !guestPay && <PlanCard t={t} copy={copy} pack={pack} notes={[copy.payNote(offered.map((provider) => PROVIDER_NAMES[provider]).join(copy.or))]} />
      )}
      {/* One tap: the pay buttons, live at once, and under them that the press
          accepts the offer (acceptance by action, the offer's section 7). Both
          stay in sight at the bottom of the window (REV-9). */}
      <div className="gpt-sticky-action">
        <div className="gpt-payment-buttons">
          {offered.map((provider) => (
            <button
              type="button"
              key={provider}
              className="gpt-primary"
              data-provider={provider}
              disabled={busy || !!queued || !startable}
              onClick={() => payWhenRead(provider)}
            >
              {appFlow(provider) ? copy.payInApp : copy.payVia(PROVIDER_NAMES[provider])}
              {!appFlow(provider) && <span aria-hidden="true">↗</span>}
            </button>
          ))}
        </div>
        <PayIn is="PayExtras" locale={locale} pack={pack} providers={offered} busy={busy || !!queued || !startable} termsUrl={termsUrl} onAsk={(provider) => payWhenRead(provider, true)} />
        {termsUrl && data?.termsVersion && (
          <p className="gpt-pay-accept">
            {t.premium.acceptByPay.before}
            <a href={termsUrl} target="_blank" rel="noopener noreferrer">{t.premium.acceptByPay.link}</a>
            {t.premium.acceptByPay.after}
          </p>
        )}
      </div>
      {openPayment?.provider && (
        <div className="gpt-panel-note" data-testid="ai-pay-open">
          <p>{copy.resumeNote}</p>
          <button type="button" className="gpt-primary" disabled={busy || !!queued || !resumable} onClick={() => { if (openPayment.provider) payWhenRead(openPayment.provider); }}>
            {copy.resume}
          </button>
          {openPayment.cancellable ? (
            <>
              <p>{copy.cancelInvoiceNote(PROVIDER_NAMES[openPayment.provider])}</p>
              <button type="button" className="gpt-text-button" disabled={busy} onClick={() => void cancelInvoice(openPayment.id)}>
                {copy.cancelInvoice}
              </button>
            </>
          ) : (
            <p>{copy.invoiceHeld(PROVIDER_NAMES[openPayment.provider])}</p>
          )}
        </div>
      )}
    </>
  );
  // The consent and the sign-in button stay in sight at the bottom of the
  // window (REV-9); the bot's steps, once started, scroll with the rest.
  const loginBlock = (
    <div className="gpt-sticky-action">
      <label className="gpt-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {copy.loginConsent}{" "}
          <a href={t.privacyHref}>{t.leadPrivacy}</a>
        </span>
      </label>
      {/* The bot first (no BotFather client needed); Telegram's OIDC
          when the server offers only that. */}
      {data?.loginMethods?.includes("bot") ? (
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
              if (!data?.loginAvailable || !consent) return;
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
    </div>
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
      {held && <p role="alert" className="gpt-notice">{copy.cancelFailed}</p>}
      {cookiesBlocked && <p role="alert" className="gpt-notice" data-testid="ai-pay-cookies">{copy.cookiesBlocked}</p>}
      {stalled}
      {data && !data.user && (
        <>
          {/* A price only while the pack can really be bought (F6); a guest's notes fold into its card. */}
          {billingAvailable && pack && <PlanCard t={t} copy={copy} pack={pack} notes={guestPay ? [copy.payNote(offered.map((provider) => PROVIDER_NAMES[provider]).join(copy.or)), copy.guestPayNote, copy.otherBrowser] : []} />}
          {guestPay ? (
            <>
              {payStep}
              {data.loginAvailable && (signIn ? (
                <>
                  <p className="gpt-panel-note">{copy.haveAccount}</p>
                  {loginBlock}
                </>
              ) : (
                <div className="gpt-panel-note" data-testid="ai-pack-have-account">
                  <p>{copy.haveAccount}</p>
                  <button type="button" className="gpt-text-button" onClick={() => setSignIn(true)}>{copy.login}</button>
                </div>
              ))}
              <SupportLine copy={copy} />
            </>
          ) : data.loginAvailable && (
            <>
              <p className="gpt-panel-note">{copy.loginWhy}</p>
              {loginBlock}
            </>
          )}
        </>
      )}
      {data?.user && (
        <PackPanel copy={copy} data={data} busy={busy} date={date} onLogout={data.user.guest ? null : logout}>
          {data.user.guest && data.loginAvailable && (
            <>
              <div className="gpt-panel-note" data-testid="ai-pack-save">
                <p>{data.access ? copy.saveLine : copy.haveAccount}</p>
                {!signIn && (
                  <button type="button" className="gpt-text-button" onClick={() => setSignIn(true)}>
                    {data.access ? copy.saveButton : copy.login}
                  </button>
                )}
              </div>
              {signIn && loginBlock}
            </>
          )}
          {payStep}
          {paymentState && <p className="gpt-panel-note" role="status">{paymentState}</p>}
        </PackPanel>
      )}
      {billingAvailable && (!termsUrl || !data?.termsVersion?.trim()) && <p role="status">{copy.termsMissing}</p>}
      {!loading && !billingAvailable && <p className="gpt-panel-note">{copy.unavailable}</p>}
      <button type="button" className="gpt-text-button" disabled={busy} onClick={() => void refresh()}>
        {t.premium.check}
      </button>
      <p className="gpt-panel-note">{t.premium.historyNote}</p>
    </>
  );
}
