import { useEffect, useRef, useState, type ReactNode } from "react";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AccountView, Locale, PaymentProvider } from "../types";
import type { ChatStrings } from "../i18n";
import type { AccountStrings } from "../account-strings";
import { CHECKOUT_FAST_FOR_MS, settledCheckout, type CheckoutOutcome, type CheckoutWatch } from "../checkout";
import { PayHolderless, PayUnpaid } from "../parts/pay-screens";
import type { PackOffer } from "../pack-offers";

/** How often the screen re-reads the clock, to say "still waiting" after two minutes. */
const CLOCK_MS = 5_000;
/** Back from the provider with the order untouched (no Prepare, no CreateTransaction) for this long: not paid. */
const UNPAID_AFTER_MS = 5_000;

/**
 * Back from a payment (plan WP-17, map 03 §3.4): "checking the payment" while
 * the account view is read on the checkout schedule (AiAccountPanel), then
 * one of three ends. Paid: the pack and the way back to the chat, where the
 * question waits in the composer. Not confirmed after two minutes: do not
 * pay again, check the status, where to ask. Cancelled: try again, where to
 * ask. The server's account view decides; returning from a payment page
 * proves nothing by itself.
 *
 * While the watched invoice is open, "continue or change the way to pay"
 * leads back to the pay step (WP-24), where it is resumed, or closed if no
 * provider has seen it yet: at once when none has (nobody can be paying
 * it), after the two minutes otherwise.
 *
 * Chat CRO 2026-11-17 (the second lazy part, chat-pay): an order no provider
 * has touched, five seconds after this screen opened, or a cancelled one, is
 * «Оплата не завершена» with three ways on (continue, another way, ask
 * someone to pay); and a return that cannot see the order's holder (this
 * browser has no order: the payer paid from a link, or in another browser)
 * says what is true for that payer instead of promising a pack here.
 */
export function CheckoutReturn({
  t,
  copy,
  locale,
  apiBase,
  busy,
  onPay,
  cheaper,
  watch,
  outcome,
  data,
  error,
  loading,
  summary,
  support,
  onCheck,
  onAgain,
  onChange,
  onSave,
  onClose,
}: {
  t: ChatStrings;
  copy: AccountStrings;
  locale: Locale;
  apiBase: string;
  busy: boolean;
  /** Pay with this provider again (the same open order, or a new one when it closed), or make a link for someone else (`ask`). */
  onPay: (provider: PaymentProvider, ask?: boolean) => void;
  /** The 3-day pack, offered where a monthly order was left unpaid; null when it is not on offer or the order is that pack. */
  cheaper: { offer: PackOffer; onPay: () => void } | null;
  watch: CheckoutWatch;
  outcome: CheckoutOutcome | null;
  data: AccountView | null;
  error: boolean;
  loading: boolean;
  /** The pack on screen once paid (PackPanel's AccessSummary) and the support line: drawn by the window, whose part carries them. */
  summary: ReactNode;
  support: ReactNode;
  onCheck: () => void;
  onAgain: () => void;
  /** Back to the pay step, the watched invoice still open. */
  onChange: () => void;
  /** A guest's pack: open sign-in through Telegram to keep it on any phone. */
  onSave?: () => void;
  onClose: () => void;
}) {
  const result = settledCheckout(data, watch);
  const payment = data?.payment;
  const open = !result && !!payment && (!watch.attemptId || payment.id === watch.attemptId)
    && ["pending", "prepared"].includes(payment.state);
  const [opened] = useState(() => Date.now());
  const [now, setNow] = useState(opened);
  // «No payment» is said only from a read of the account that ended while this
  // screen was open (for a browser with no order at all, also from a view that
  // had already answered), and once said it stays: the watch reads again every
  // few seconds, and the screen must not blink or decide on what it remembers.
  const [answered] = useState(() => !loading && !!data);
  const [reads, setReads] = useState(0);
  const reading = useRef(loading);
  useEffect(() => {
    if (reading.current && !loading && !error) setReads((count) => count + 1);
    reading.current = loading;
  }, [loading, error]);
  useEffect(() => {
    if (result) return;
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, [result]);
  const notices = (
    <>
      {data?.mode === "test" && <p className="gpt-notice">{copy.test}</p>}
      {error && <p role="alert" className="gpt-error">{copy.failed}</p>}
    </>
  );
  const back = (primary: boolean) => (
    <button type="button" className={primary ? "gpt-primary" : "gpt-text-button"} onClick={onClose}>
      {copy.payBackToChat}
    </button>
  );

  const again = <button type="button" className="gpt-primary" onClick={onAgain}>{copy.payAgain}</button>;
  // «Оплата не завершена» (chat-pay); until it is here, or if it cannot load, the screen it replaces.
  const provider = payment?.provider ?? watch.provider;
  const card = (closed: boolean, whole = false) => (
    <PayUnpaid
      heading={whole}
      orderId={payment?.id ?? watch.attemptId}
      locale={locale}
      apiBase={apiBase}
      provider={provider ?? null}
      since={watch.at}
      closed={closed}
      busy={busy}
      onContinue={() => { if (provider) onPay(provider); }}
      onOther={closed ? onAgain : onChange}
      onAsk={provider === "click" || provider === "payme" ? () => onPay(provider, true) : null}
      cheaper={cheaper}
      top={whole ? notices : null}
    >
      {whole && back(false)}
    </PayUnpaid>
  );

  if (result === "paid")
    return (
      <>
        <DialogTitle>{copy.active}</DialogTitle>
        {notices}
        <DialogDescription asChild>
          <p role="status" className="gpt-notice" data-testid="ai-pay-result" data-result="paid">{copy.payPaid}</p>
        </DialogDescription>
        {summary}
        {back(true)}
        {data?.user?.guest && data.loginAvailable && onSave && (
          <div className="gpt-panel-note" data-testid="ai-pack-save">
            <p>{copy.saveLine}</p>
            <button type="button" className="gpt-text-button" onClick={onSave}>{copy.saveButton}</button>
          </div>
        )}
      </>
    );
  if (result === "cancelled")
    return (
      <>
        <DialogTitle>{copy.title}</DialogTitle>
        {notices}
        <DialogDescription asChild>
          <p role="alert" className="gpt-error" data-testid="ai-pay-result" data-result="cancelled">{copy.cancelled}</p>
        </DialogDescription>
        {support}
        {payment?.state === "cancelled" ? card(true) : again}
        {back(false)}
      </>
    );
  // This browser has no order: the payer paid from a link, or in another browser (chat-pay says what is true then).
  if (!watch.attemptId && !watch.provider && !!data && !payment && (answered || reads > 0))
    return (
      <>
        {notices}
        <PayHolderless locale={locale}>
          {support}
          {back(true)}
        </PayHolderless>
      </>
    );
  const long = outcome === "pending" || now - watch.at >= CHECKOUT_FAST_FOR_MS;
  const change = open && (payment?.cancellable === true || long) && (
    <div className="gpt-panel-note" data-testid="ai-pay-change">
      <p>{copy.payChangeNote}</p>
      <button type="button" className="gpt-text-button" onClick={onChange}>{copy.payChange}</button>
    </div>
  );
  const waiting = (
    <>
      <DialogTitle>{copy.payChecking}</DialogTitle>
      {notices}
      {watch.flow === "test" && <p className="gpt-notice">{copy.payTestNoPage}</p>}
      {long ? (
        <>
          <DialogDescription asChild>
            <p role="status" className="gpt-notice" data-testid="ai-pay-result" data-result="pending">{copy.payPendingLong}</p>
          </DialogDescription>
          <button type="button" className="gpt-primary" disabled={loading} onClick={onCheck}>{t.premium.check}</button>
          {change}
          {support}
          {back(false)}
        </>
      ) : (
        <>
          <DialogDescription asChild>
            <p role="status" className="gpt-panel-note" data-testid="ai-pay-result" data-result="checking">{copy.payCheckingNote}</p>
          </DialogDescription>
          <div className="gpt-part-loading gpt-pay-checking" aria-hidden="true" />
          {change}
          {back(true)}
        </>
      )}
    </>
  );
  // An order no provider has touched, a few seconds after the visitor is back: the card instead of the wait.
  if (open && payment?.state === "pending" && reads > 0 && now - opened >= UNPAID_AFTER_MS)
    return card(false, true);
  return waiting;
}
