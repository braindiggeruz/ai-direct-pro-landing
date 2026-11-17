// The pack window's second lazy part, chat-pay (chat CRO 2026-11-17): the
// checkout's counted steps, its retry messages, the payment link for someone
// else and the unpaid-return card. Fetched from inside the window, so
// neither the start bundle nor the window's own part carries it. `PayIn`
// draws one of its screens once it is here, and `fallback` (nothing by
// default) while it loads or if it cannot.
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { LazyPart, part } from '../lazy-part';

export const payPart = part(() => import('../parts/chat-pay'));
/** The Uzum Bank app's code screen (Uzum is off in production): its own part, so it stays out of the window's. */
export const uzumPart = part(() => import('../parts/chat-uzum'));
/** Signing in through the Telegram bot: opened by few, so it is fetched when asked for. */
export const loginPart = part(() => import('../parts/chat-login'));

type Screens = Pick<Awaited<ReturnType<typeof payPart.load>>, 'PayStall' | 'PayShare' | 'PayExtras' | 'PayPacks' | 'CheckoutReturn'>;

export function PayIn<K extends keyof Screens>({ is, fallback = null, failed = fallback, ...props }:
  { is: K; fallback?: ReactNode; failed?: ReactNode } & ComponentProps<Screens[K]>) {
  return (
    <LazyPart part={payPart} fallback={fallback} failed={failed}>
      {(screens) => {
        const Screen = screens[is] as unknown as ComponentType<Record<string, unknown>>;
        return <Screen {...props} />;
      }}
    </LazyPart>
  );
}
