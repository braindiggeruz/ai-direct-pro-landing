import { useEffect, useState } from "react";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AccountView } from "../types";
import type { ChatStrings } from "../i18n";
import type { AccountStrings } from "../account-strings";
import { CHECKOUT_FAST_FOR_MS, settledCheckout, type CheckoutOutcome, type CheckoutWatch } from "../checkout";
import { AccessSummary, SupportLine } from "./PackPanel";

/** How often the screen re-reads the clock, to say "still waiting" after two minutes. */
const CLOCK_MS = 5_000;

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
 */
export function CheckoutReturn({
  t,
  copy,
  watch,
  outcome,
  data,
  error,
  loading,
  date,
  onCheck,
  onAgain,
  onChange,
  onClose,
}: {
  t: ChatStrings;
  copy: AccountStrings;
  watch: CheckoutWatch;
  outcome: CheckoutOutcome | null;
  data: AccountView | null;
  error: boolean;
  loading: boolean;
  date: (at: number) => string;
  onCheck: () => void;
  onAgain: () => void;
  /** Back to the pay step, the watched invoice still open. */
  onChange: () => void;
  onClose: () => void;
}) {
  const result = settledCheckout(data, watch);
  const payment = data?.payment;
  const open = !result && !!payment && (!watch.attemptId || payment.id === watch.attemptId)
    && ["pending", "prepared"].includes(payment.state);
  const [now, setNow] = useState(() => Date.now());
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

  if (result === "paid")
    return (
      <>
        <DialogTitle>{copy.active}</DialogTitle>
        {notices}
        <DialogDescription asChild>
          <p role="status" className="gpt-notice" data-testid="ai-pay-result" data-result="paid">{copy.payPaid}</p>
        </DialogDescription>
        {data?.access && <AccessSummary copy={copy} access={data.access} pack={data.pack} date={date} />}
        {back(true)}
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
        <SupportLine copy={copy} />
        <button type="button" className="gpt-primary" onClick={onAgain}>{copy.payAgain}</button>
        {back(false)}
      </>
    );
  const long = outcome === "pending" || now - watch.at >= CHECKOUT_FAST_FOR_MS;
  const change = open && (payment?.cancellable === true || long) && (
    <div className="gpt-panel-note" data-testid="ai-pay-change">
      <p>{copy.payChangeNote}</p>
      <button type="button" className="gpt-text-button" onClick={onChange}>{copy.payChange}</button>
    </div>
  );
  return (
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
          <SupportLine copy={copy} />
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
}
