import { useState } from "react";
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { ChatStrings } from "../i18n";
import type { AccountStrings } from "../account-strings";

/**
 * The service as the Uzum Bank app lists it under Payments. Uzum's manager
 * names it when the Merchant API contract is signed (plan section 8, item 6):
 * check it before Uzum goes live in this flow.
 */
export const UZUM_APP_SERVICE = "GPTBot.uz";

/** "123456789" → "1234 5678 9", as the app's keypad is read back. */
export function groupPaymentCode(code: string): string {
  return code.replace(/^(\d{4})(\d{4})(\d)$/, "$1 $2 $3");
}

/**
 * Uzum through the Merchant API (plan WP-17, map 03 §3.5): the account's
 * permanent code for the Uzum Bank app, the steps there, the amount, and a
 * copy button. The pack switches on by itself: the account view is read on
 * the checkout schedule meanwhile, and the window then says it is paid.
 * Showing the code opens no order, so another way to pay is one press away.
 */
export function UzumCodeScreen({
  t,
  copy,
  code,
  sum,
  loading,
  onCheck,
  onChange,
  onClose,
}: {
  t: ChatStrings;
  copy: AccountStrings;
  /** Nine digits (types.ts PAYMENT_CODE). */
  code: string;
  /** The price, digits grouped ("20 000"). */
  sum: string;
  loading: boolean;
  onCheck: () => void;
  /** Back to the pay step: another way to pay. */
  onChange: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const steps = copy.uzumCodeSteps(UZUM_APP_SERVICE, sum);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* no clipboard: the code stays on screen to type in */
    }
  };
  return (
    <>
      <DialogTitle>{copy.uzumCodeTitle}</DialogTitle>
      <DialogDescription asChild>
        <ol className="gpt-login-steps">
          {steps.map((step, index) => (
            <li key={step}>
              {step}
              {index === 1 && (
                <strong className="gpt-login-code gpt-pay-code ym-hide-content" data-testid="ai-uzum-code">
                  {groupPaymentCode(code)}
                </strong>
              )}
            </li>
          ))}
        </ol>
      </DialogDescription>
      <button type="button" className="gpt-primary" onClick={() => void copyCode()}>
        {copied ? copy.uzumCodeCopied : copy.uzumCodeCopy}
      </button>
      <p className="gpt-panel-note">{copy.uzumCodeNote}</p>
      <p role="status" className="gpt-panel-note">{copy.payChecking}</p>
      <button type="button" className="gpt-text-button" disabled={loading} onClick={onCheck}>{t.premium.check}</button>
      <button type="button" className="gpt-text-button" onClick={onChange}>{copy.payChange}</button>
      <button type="button" className="gpt-text-button" onClick={onClose}>{copy.payBackToChat}</button>
    </>
  );
}
