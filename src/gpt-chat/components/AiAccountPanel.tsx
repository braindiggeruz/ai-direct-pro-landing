import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import type { Locale, PaymentProvider } from "../types";
import type { ChatStrings } from "../i18n";
import { showsAccountPill, type AccountView } from "../types";
import { useAccount, type AccountCause } from "../use-account";
import { accountPart, LazyPart, PartFailed, PartLoading } from "../lazy-part";
import { preloadsAccountWindow } from "../preload";
import type { AccountWindowMemory, CheckoutControls } from "../account/AccountDialog";
import { track, trackMetaPackView, trackPurchase, EV } from "../analytics";
import { loadBotLogin } from "../bot-login";
import { recordUiEvent, type PackFrom } from "../ui-events";
import {
  checkoutReport,
  firstReport,
  loadCheckout,
  pendingDelay,
  saveCheckout,
  settledCheckout,
  type CheckoutOutcome,
  type CheckoutWatch,
} from "../checkout";
export type { AccountView } from "../types";
export type { PackFrom } from "../ui-events";

/** Ask the panel to open; a new `seq` is a new request. */
export interface PackOpenRequest {
  seq: number;
  from: PackFrom;
  /** One tap (07.10): pay with this provider as soon as the window can. */
  pay?: PaymentProvider;
  /** Offer shown when the visitor pressed the provider button; never persisted. */
  offerKey?: string | null;
}

/**
 * The header pill and the pack window's frame. The account data (use-account.ts)
 * and this frame are on the chat's start bundle; the window's body is the lazy
 * part chat-account, fetched ahead of time when someone is about to need it.
 *
 * The frame also follows a payment this browser went to make (checkout.ts):
 * back from the payment page (`?pay=return`, or a stored trip of the last 30
 * minutes) the window opens by itself to say how it went, the account view is
 * read on the checkout schedule until the payment ends, and the result reaches
 * GA4 and the server's counter once, with the window open or not.
 */
export function AiAccountPanel({
  t,
  locale,
  apiBase,
  onAccount,
  refreshKey,
  openRequest,
  remaining,
  limited,
  onLeave,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  onAccount: (account: AccountView | null, cause: AccountCause) => void;
  refreshKey: number;
  openRequest?: PackOpenRequest;
  /** Free messages or pack answers left; -1 while unknown. */
  remaining: number;
  /** The server refused a turn and the limit stands. */
  limited: boolean;
  /** The browser is about to leave for a payment page or the Uzum Bank app: keep what the chat must find again. */
  onLeave?: () => void;
}) {
  const [payReturn] = useState(() => new URLSearchParams(window.location.search).get("pay") === "return");
  // A trip stored by this browser, or, back from a payment page with nothing
  // stored (storage blocked), a wait from now for the newest payment.
  const [checkout, setCheckout] = useState<CheckoutWatch | null>(() =>
    loadCheckout() ?? (payReturn ? { provider: null, flow: "redirect", at: Date.now(), attemptId: null, before: null } : null));
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null);
  // Read on the checkout schedule while the payment has not ended; a payment
  // that ends after the ten minutes still counts once the view says so.
  const account = useAccount(apiBase, onAccount, refreshKey, checkout && !outcome ? checkout.at : null);
  const { data } = account;
  const [open, setOpen] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const windowMemory = useRef<AccountWindowMemory>({ requestKeys: {}, refusedForTerms: null, paymentCode: null, autoPaid: null });
  // One pack_viewed per opening, with the button that opened it.
  const openPack = useCallback((from: PackFrom) => {
    setOpen(true);
    track(EV.packViewed, { from, locale });
    trackMetaPackView(from, locale);
    recordUiEvent(apiBase, "pack_viewed", from);
  }, [apiBase, locale]);
  // What the address and this tab bring along, once: a failed Telegram
  // sign-in, the way back from a payment page, or a sign-in through the bot
  // still running (the phone may have reloaded the tab while Telegram was in
  // front). Their parameters leave the address bar.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    const url = new URL(window.location.href);
    const failed = url.searchParams.get("login") === "failed";
    if (failed || payReturn) {
      url.searchParams.delete("login");
      url.searchParams.delete("pay");
      window.history.replaceState(null, "", url.href);
    }
    if (failed) {
      setLoginFailed(true);
      track(EV.loginResult, { method: "oidc", status: "failed", locale });
      recordUiEvent(apiBase, "login_result", "failed");
      openPack("login_failed");
    } else if (checkout) openPack("pay_return");
    else if (loadBotLogin()) openPack("login_resume");
  }, [apiBase, checkout, locale, openPack, payReturn]);
  useEffect(() => {
    if (openRequest) openPack(openRequest.from);
  }, [openRequest, openPack]);

  const settle = useCallback((result: CheckoutOutcome) => {
    if (!checkout) return;
    setOutcome(result);
    saveCheckout(null);
    const report = checkoutReport(data, checkout, result);
    track(EV.checkoutResult, { provider: report.result.provider, status: result, mode: report.result.mode, locale });
    recordUiEvent(apiBase, "checkout_result", result);
    // Revenue for real money only, once per order on this browser.
    if (report.purchase && firstReport(report.purchase.transactionId)) trackPurchase(report.purchase);
  }, [apiBase, checkout, data, locale]);
  // The payment ended (paid, or cancelled); a wait that outlived the
  // schedule, counted from an answered view, is reported as pending and may
  // still end later. A view that already says how it ended arms no pending
  // timer: back after the ten minutes, a 0 ms timer set beside "paid" could
  // fire before React clears it and report pending, then paid again.
  useEffect(() => {
    if (!checkout || (outcome && outcome !== "pending")) return;
    const result = settledCheckout(data, checkout);
    if (result) settle(result);
  }, [checkout, data, outcome, settle]);
  useEffect(() => {
    if (!checkout || outcome) return;
    const delay = pendingDelay(data, checkout);
    if (delay === null) return;
    const timer = window.setTimeout(() => settle("pending"), delay);
    return () => window.clearTimeout(timer);
  }, [checkout, data, outcome, settle]);
  const checkoutControls: CheckoutControls = {
    watch: checkout,
    outcome,
    start: (watch) => {
      saveCheckout(watch);
      setOutcome(null);
      setCheckout(watch);
      // Off to the payment page, or to the Uzum Bank app with the code: a
      // phone may unload this tab meanwhile, so the composer's question is kept.
      if (watch.flow === "redirect" || watch.flow === "code") onLeave?.();
    },
    dismiss: () => {
      setOutcome(null);
      setCheckout(null);
    },
  };

  const reachable = showsAccountPill(data);
  const paymentPending = !!data?.payment && ["pending", "prepared"].includes(data.payment.state);
  useEffect(() => {
    if (preloadsAccountWindow({ reachable, remaining, limited, payReturn: !!checkout, paymentPending })) accountPart.preload();
  }, [reachable, remaining, limited, checkout, paymentPending]);
  // An ended payment is said once: closing the window leaves it behind.
  const close = () => {
    // A closed or still-loading window must not execute this intent on reopen.
    if (openRequest?.pay) windowMemory.current.autoPaid = openRequest.seq;
    windowMemory.current.generation = (windowMemory.current.generation ?? 0) + 1;
    setOpen(false);
    if (outcome) checkoutControls.dismiss();
  };
  return (
    // Opening goes through openPack (the pill, a request from the chat, a
    // failed login, the way back from a payment), so the Dialog itself only
    // ever closes.
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      {reachable && (
        <DialogTrigger asChild>
        <Button variant="secondary"
          type="button"
          className="gpt-account-trigger"
          onClick={() => openPack("header")}
          data-testid="ai-account-trigger"
        >
          <Sparkles data-icon="inline-start" />
          <span className="gpt-account-label">{data?.access ? t.premium.accountActive : t.premium.account}</span>
        </Button>
        </DialogTrigger>
      )}
      <DialogContent
        showCloseButton={false}
        className="gpt-account-dialog ym-hide-content"
      >
        <div className="gpt-panel-top">
          <Badge variant="secondary"><Sparkles data-icon="inline-start" /> {t.brand}</Badge>
          <Button variant="ghost" size="icon-lg"
            type="button"
            className="gpt-icon-button"
            onClick={close}
            aria-label={t.premium.close}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
        <LazyPart
          part={accountPart}
          fallback={<><DialogTitle>{t.premium.account}</DialogTitle><PartLoading label={t.partLoading} className="gpt-part-loading-window" /></>}
          failed={<><DialogTitle>{t.premium.account}</DialogTitle><PartFailed message={t.partFailed} reload={t.partReload} /></>}
        >
          {({ AccountDialog }) => (
            <AccountDialog
              t={t}
              locale={locale}
              apiBase={apiBase}
              account={account}
              memoryRef={windowMemory}
              loginFailed={loginFailed}
              checkout={checkoutControls}
              autoPay={openRequest?.pay ? { seq: openRequest.seq, provider: openRequest.pay, offerKey: openRequest.offerKey ?? null } : null}
              onClose={close}
            />
          )}
        </LazyPart>
      </DialogContent>
    </Dialog>
  );
}
