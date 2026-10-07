/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The checkout of one tariff, under the tariff the person chose
 * (DECISIONS §1(б), §11, §12; spec §9.2).
 *
 *   - what is bought: «Oylik — 39 900 so‘m, 1 oy»;
 *   - the offer checkbox, unticked, with the parents' line (С-3):
 *     «Ommaviy oferta shartlariga roziman. 18 yoshga to‘lmagan bo‘lsam —
 *     ota-onam rozi.» and the link to the offer;
 *   - the refund line and «Obunasiz…»;
 *   - the provider: the one that sells, or a choice when there are two;
 *   - «To‘lovga o‘tish». flow.ts does the calls; a payment page answer is
 *     followed only to Payme's or Click's host.
 * Another open order of the buyer: its number and «Uni bekor qilish»,
 * which closes it (POST /order/cancel) and orders again.
 * Webvisor records none of it (ym-disable-submit, ym-hide-content).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { StudioLocale, StudioPlanOffer, StudioProvider, StudioPublicConfig } from '../api';
import { randomId } from '../analytics';
import { turnstileToken, type StudioTurnstileAction } from '../identity';
import { browserAttribution, rememberPack, sellingProviders, startCheckout, type CheckoutAction, type CheckoutOutcome } from './flow';
import { billingRuntime, type BillingRuntime } from './runtime';
import { BILLING_TEXTS, billingMessage, type BillingMessage } from './texts';

export interface CheckoutProps {
  readonly locale: StudioLocale;
  readonly plan: StudioPlanOffer;
  readonly config: StudioPublicConfig;
  readonly onClose: () => void;
  /** Tests pass their own. */
  readonly runtime?: BillingRuntime;
  /** Where the browser goes for a payment page (tests pass their own). */
  readonly navigate?: (url: string) => void;
}

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'message'; readonly message: BillingMessage }
  | { readonly kind: 'open'; readonly orderId: string }
  | { readonly kind: 'done'; readonly outcome: Extract<CheckoutOutcome, { kind: 'test' | 'status' }> };

const PAY =
  'st:w-full st:rounded-xl st:bg-linear-to-br st:from-studio-blue st:to-studio-cyan st:px-4 st:py-3 st:text-base st:font-semibold st:text-studio-bg st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';
const LINE = 'st:text-sm st:leading-snug st:text-studio-muted';

/** An order request id the ledger's rules accept. */
export function newOrderRequestId(): string {
  return `o_${randomId().replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 64);
}

export function Checkout({ locale, plan, config, onClose, runtime, navigate }: CheckoutProps) {
  const texts = BILLING_TEXTS[locale];
  const id = useId();
  const providers = sellingProviders(config);
  const [consent, setConsent] = useState(false);
  const [provider, setProvider] = useState<StudioProvider | null>(providers[0] ?? null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const turnstileBox = useRef<HTMLDivElement>(null);
  const run = useRef<AbortController | null>(null);
  const termsUrl = config.terms?.[locale] ?? null;

  useEffect(() => () => run.current?.abort(), []);

  const live = () => runtime ?? billingRuntime();

  const order = async () => {
    const { api, session, funnel } = live();
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    setStatus({ kind: 'working' });
    funnel.checkoutStarted(plan.id);
    const outcome = await startCheckout(
      { plan: plan.id, provider, locale, returnPath: typeof window !== 'undefined' ? window.location.pathname : '/' },
      {
        api,
        session,
        token: (action: CheckoutAction, siteKey: string) =>
          turnstileBox.current
            ? // identity.ts names the free tool's actions; the server checks studio_checkout as its own (turnstile.ts).
              turnstileToken({ container: turnstileBox.current, siteKey, action: action as StudioTurnstileAction, signal: controller.signal })
            : Promise.resolve({ ok: false as const, code: 'turnstile_unavailable' as const }),
        requestId: newOrderRequestId,
        attribution: browserAttribution,
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) return;
    if (outcome.kind === 'redirect') {
      rememberPack();
      (navigate ?? ((url: string) => window.location.assign(url)))(outcome.url);
      return;
    }
    if (outcome.kind === 'open') {
      setStatus({ kind: 'open', orderId: outcome.orderId });
      return;
    }
    if (outcome.kind === 'error') {
      setStatus({ kind: 'message', message: billingMessage(outcome.code) });
      return;
    }
    rememberPack();
    setStatus({ kind: 'done', outcome });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind === 'working') return;
    if (!consent) {
      setStatus({ kind: 'message', message: 'consent' });
      return;
    }
    void order();
  };

  const cancelOpen = async (orderId: string) => {
    setStatus({ kind: 'working' });
    const closed = await live().api.cancelOrder(orderId);
    live().session.refreshMe();
    if (!closed.ok) {
      setStatus({ kind: 'message', message: closed.code === 'in_progress' ? 'order_open' : billingMessage(closed.code) });
      return;
    }
    await order();
  };

  const working = status.kind === 'working';
  return (
    <div className="ym-hide-content st:mt-3 st:rounded-2xl st:border st:border-studio-line st:bg-studio-surface st:p-4" data-studio-checkout={plan.id}>
      <form className="ym-disable-submit st:space-y-3" noValidate onSubmit={onSubmit} aria-busy={working}>
        <p className="st:text-base st:font-semibold st:text-studio-text">{texts.summary(plan.id, plan)}</p>
        <label className="st:flex st:items-start st:gap-2 st:text-sm st:text-studio-text" htmlFor={`${id}-consent`}>
          <input
            id={`${id}-consent`}
            type="checkbox"
            className="st:mt-1"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={working}
          />
          <span>
            {texts.consent}
            {termsUrl ? (
              <>
                {' '}
                <a className="st:text-studio-cyan st:underline" href={termsUrl} target="_blank" rel="noopener">
                  {texts.offer}
                </a>
              </>
            ) : null}
          </span>
        </label>
        <p className={LINE}>{texts.refund}</p>
        <p className={LINE}>{texts.noSubscription}</p>
        {providers.length > 1 ? (
          <fieldset className="st:space-y-1">
            <legend className="st:text-sm st:font-medium st:text-studio-text">{texts.providerLabel}</legend>
            {providers.map((option) => (
              <label key={option} className="st:mr-4 st:inline-flex st:items-center st:gap-2 st:text-sm st:text-studio-text">
                <input type="radio" name={`${id}-provider`} value={option} checked={provider === option} onChange={() => setProvider(option)} disabled={working} />
                {option === 'payme' ? 'Payme' : 'Click'}
              </label>
            ))}
          </fieldset>
        ) : providers.length === 1 ? (
          <p className={LINE}>{texts.payWith(providers)}</p>
        ) : (
          <p className="st:text-sm st:text-studio-saffron">{texts.paused}</p>
        )}
        <button type="submit" className={PAY} disabled={working || providers.length === 0}>
          {working ? texts.paying : texts.pay}
        </button>
        <div ref={turnstileBox} className="st:flex st:justify-center st:empty:hidden" data-studio-turnstile="" />
        <p role="status" aria-live="polite" className="st:text-sm st:text-studio-danger" data-studio-checkout-message={status.kind === 'message' ? status.message : ''}>
          {status.kind === 'message' ? texts.messages[status.message] : ''}
        </p>
        {status.kind === 'open' ? (
          <div className="st:space-y-2 st:text-sm st:text-studio-text" data-studio-open-order={status.orderId}>
            <p>
              {texts.orderOpen} {texts.orderNumber}: <span className="st:font-mono">{status.orderId}</span>
            </p>
            <button type="button" className="st:text-studio-cyan st:underline" onClick={() => void cancelOpen(status.orderId)}>
              {texts.cancelOpen}
            </button>
          </div>
        ) : null}
        {status.kind === 'done' ? (
          <p className="st:text-sm st:text-studio-text" data-studio-order={status.outcome.orderId}>
            {status.outcome.kind === 'test' ? texts.testOrder(status.outcome.orderId) : texts.statusOrder}
          </p>
        ) : null}
        <button type="button" className="st:text-sm st:text-studio-muted st:underline" onClick={onClose}>
          {texts.close}
        </button>
      </form>
    </div>
  );
}
