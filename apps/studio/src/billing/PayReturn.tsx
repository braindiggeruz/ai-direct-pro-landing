/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The page after payment: Payme or Click sends the buyer back to the studio
 * page with ?pay=return (checkout.ts studioReturnUrl). main.tsx mounts this
 * in its own box above the form (never inside the hydrated form).
 *
 * It reads /me again every few seconds until the newest order is paid,
 * cancelled or refunded, or a minute has passed:
 *   paid      «To‘lov qabul qilindi. Tarif faol.», the tariff, and the order
 *             number with «To‘lov raqamini saqlang» (support restores a lost
 *             tariff by it);
 *   cancelled «To‘lov bekor qilindi…»;
 *   pending   «To‘lov hali tasdiqlanmadi…» (Payme's callback may come later).
 * The funnel records the result once; the query is taken out of the address
 * so a reload or a shared link does not repeat it.
 */
import { useEffect, useState } from 'react';
import type { StudioLocale, StudioMe } from '../api';
import { rememberPack } from './flow';
import { PackPanel } from './MyPack';
import { billingRuntime, type BillingRuntime } from './runtime';
import { BILLING_TEXTS } from './texts';

export interface PayReturnProps {
  readonly locale: StudioLocale;
  /** Tests pass their own. */
  readonly runtime?: BillingRuntime;
  /** Reads of /me and the wait between them (ms). */
  readonly attempts?: number;
  readonly intervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export type ReturnState = 'checking' | 'paid' | 'pending' | 'cancelled' | 'none';

/** What the newest order of /me says about the payment just made. */
export function returnState(me: StudioMe | null, final: boolean): ReturnState {
  const order = me?.latestOrder ?? null;
  if (!order) return final ? 'none' : 'checking';
  if (order.state === 'paid') return 'paid';
  if (order.state === 'cancelled' || order.state === 'refunded') return 'cancelled';
  return final ? 'pending' : 'checking';
}

/** The query ?pay=return taken out of the address, the rest kept. */
export function withoutPayReturn(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('pay');
  return `${url.pathname}${url.search}${url.hash}`;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function PayReturn({ locale, runtime, attempts = 20, intervalMs = 3_000, sleep = wait }: PayReturnProps) {
  const texts = BILLING_TEXTS[locale];
  const [me, setMe] = useState<StudioMe | null>(null);
  const [state, setState] = useState<ReturnState>('checking');

  useEffect(() => {
    let alive = true;
    try {
      window.history.replaceState(window.history.state, '', withoutPayReturn(window.location.href));
    } catch {
      // An address that cannot be rewritten keeps its query; nothing else depends on it.
    }
    const { session, funnel } = runtime ?? billingRuntime();
    void (async () => {
      let last: StudioMe | null = null;
      for (let attempt = 1; attempt <= attempts && alive; attempt++) {
        session.refreshMe();
        const result = await session.me();
        if (!alive) return;
        if (result.ok) {
          last = result.data;
          setMe(last);
        }
        const now = returnState(last, attempt === attempts);
        if (now !== 'checking') {
          setState(now);
          if (now === 'paid') rememberPack();
          if (now !== 'none') funnel.checkoutResult(now === 'paid' ? 'paid' : now === 'cancelled' ? 'cancelled' : 'pending');
          return;
        }
        await sleep(intervalMs);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempts, intervalMs, runtime, sleep]);

  const line = {
    checking: texts.returnChecking,
    paid: texts.returnPaid,
    pending: texts.returnPending,
    cancelled: texts.returnCancelled,
    none: texts.returnNone,
  }[state];
  return (
    <div className="st:mb-4" data-studio-pay-return={state}>
      <p role="status" aria-live="polite" className={state === 'paid' ? 'st:text-sm st:font-semibold st:text-studio-cyan' : 'st:text-sm st:text-studio-text'}>
        {line}
      </p>
      {state === 'paid' || state === 'pending' ? <PackPanel locale={locale} me={me} /> : null}
    </div>
  );
}
