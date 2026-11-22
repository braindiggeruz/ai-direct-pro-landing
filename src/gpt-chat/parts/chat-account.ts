// Lazy part chat-account: the pack window's body, its screens and its copy.
// Loaded through lazy-part.tsx only; a static import from the start would put
// it back on every visitor's first load (scripts/chat-bundle-budget.ts fails
// on that).
export { AccountDialog } from '../account/AccountDialog';
import { payPart } from '../account/pay-part';
import type { AccountView } from '../types';
import type { CheckoutWatch } from '../checkout';

/**
 * A watched payment ended paid: the purchase report (account/purchase-report.ts)
 * rides in chat-pay, which the window fetches as it opens; asked for through
 * this part, so the start bundle names one part only.
 */
export const reportPurchase = (account: AccountView | null, watch: CheckoutWatch): Promise<void> =>
  payPart.load().then((part) => part.reportPurchase(account, watch));

/** A watched payment's ending with the client class (conversion audit 2026-11-22, C2), counted from chat-pay. */
export const reportResultClass = (apiBase: string, result: 'paid' | 'pending' | 'cancelled'): Promise<void> =>
  payPart.load().then((part) => part.resultClass(apiBase, result));
