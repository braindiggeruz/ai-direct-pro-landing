/**
 * The checkout of a studio tariff in the browser (STUDIO-SPEC §9.2, §5.3,
 * DECISIONS §12), without React: tests/studio-billing-island.test.ts drives
 * it with fakes.
 *
 * Order of calls:
 *   1. /config (kept for the page view): sales on, a provider, the offer
 *      edition and the Turnstile key; otherwise «To‘lov vaqtincha
 *      to‘xtatilgan» and nothing else is called;
 *   2. /me (kept): a studio account already? Then no Turnstile at all.
 *      Without one, the browser identity first (Turnstile studio_identity,
 *      POST /identity) when /me says there is none, then a Turnstile token
 *      of studio_checkout: the server makes the account only after it;
 *   3. POST /checkout with the edition the person saw, the provider, the
 *      page to come back to and the attribution the browser holds. The same
 *      request id on a retry, so a lost answer never makes two orders:
 *        - no answer → once more, as it was;
 *        - identity_required (the cookie went) → a new identity and token, once;
 *        - turnstile_required → a token, once;
 *        - order_open → the open order's number (the window offers to close it);
 *   4. a payment page answer is followed only to Payme's or Click's host
 *      (api.ts isPaymentPage).
 */
import type { CheckoutAnswer, CheckoutBody, Result, StudioApi, StudioLocale, StudioMe, StudioPlanId, StudioProvider, StudioPublicConfig } from '../api';
import { readAnalyticsIds, readFirstTouch, readLastTouch } from '../attribution';
import type { StudioSession } from '../config';
import type { TokenResult } from '../identity';

/** Turnstile actions of the checkout. */
export type CheckoutAction = 'studio_identity' | 'studio_checkout';

export interface CheckoutDeps {
  readonly api: Pick<StudioApi, 'checkout' | 'identity'>;
  readonly session: Pick<StudioSession, 'config' | 'me' | 'refreshMe'>;
  /** A fresh Turnstile token for `action` with the studio's site key. */
  readonly token: (action: CheckoutAction, siteKey: string) => Promise<TokenResult>;
  readonly requestId: () => string;
  /** What the browser holds about where the person came from (attribution.ts). */
  readonly attribution?: () => Pick<CheckoutBody, 'attribution' | 'ga' | 'ym'>;
  readonly signal?: AbortSignal;
}

export interface CheckoutChoice {
  readonly plan: StudioPlanId;
  readonly provider: StudioProvider | null;
  readonly locale: StudioLocale;
  /** The page to come back to: the current path. */
  readonly returnPath: string;
}

export type CheckoutOutcome =
  | { readonly kind: 'redirect'; readonly url: string; readonly orderId: string }
  | { readonly kind: 'test'; readonly orderId: string; readonly amount: number }
  | { readonly kind: 'status'; readonly orderId: string }
  | { readonly kind: 'open'; readonly orderId: string }
  | { readonly kind: 'error'; readonly code: string };

/** The providers the window may offer, or none when sales are off. */
export function sellingProviders(config: StudioPublicConfig): readonly StudioProvider[] {
  return config.payments.mode && config.termsVersion && config.plans.length ? config.payments.providers : [];
}

/** The attribution the browser holds, as checkout sends it (each value is cleaned again on the server). */
export function browserAttribution(): Pick<CheckoutBody, 'attribution' | 'ga' | 'ym'> {
  const last = readLastTouch();
  const first = readFirstTouch();
  const ids = readAnalyticsIds();
  return {
    attribution: { ...(last ? { last } : {}), ...(first ? { first } : {}) },
    ga: { ...(ids.gaClientId ? { clientId: ids.gaClientId } : {}), ...(ids.gaSessionId ? { sessionId: ids.gaSessionId } : {}) },
    ym: ids.ymClientId ? { clientId: ids.ymClientId } : {},
  };
}

function outcomeOf(answer: CheckoutAnswer): CheckoutOutcome {
  if (answer.mode === 'checkout') return { kind: 'redirect', url: answer.checkoutUrl, orderId: answer.orderId };
  if (answer.mode === 'test') return { kind: 'test', orderId: answer.orderId, amount: answer.amount };
  return { kind: 'status', orderId: answer.orderId };
}

/** Order the tariff `choice.plan`. Never rejects. */
export async function startCheckout(choice: CheckoutChoice, deps: CheckoutDeps): Promise<CheckoutOutcome> {
  const config = await deps.session.config();
  if (!config.ok) return { kind: 'error', code: config.code };
  const providers = sellingProviders(config.data);
  const provider = choice.provider && providers.includes(choice.provider) ? choice.provider : providers[0];
  if (!provider || !config.data.termsVersion) return { kind: 'error', code: 'checkout_unavailable' };
  const siteKey = config.data.turnstileSiteKey;
  const me: Result<StudioMe> = await deps.session.me();
  if (!me.ok) return { kind: 'error', code: me.code };

  const identity = async (): Promise<string | null> => {
    if (!siteKey) return 'studio_not_configured';
    const pass = await deps.token('studio_identity', siteKey);
    if (!pass.ok) return pass.code;
    const issued = await deps.api.identity(pass.token, { signal: deps.signal });
    return issued.ok ? null : issued.code;
  };
  const checkoutToken = async (): Promise<{ token?: string; code?: string }> => {
    if (!siteKey) return { code: 'studio_not_configured' };
    const pass = await deps.token('studio_checkout', siteKey);
    return pass.ok ? { token: pass.token } : { code: pass.code };
  };

  let token: string | undefined;
  if (!me.data.account?.signedIn) {
    if (!me.data.identity) {
      const failed = await identity();
      if (failed) return { kind: 'error', code: failed };
    }
    const pass = await checkoutToken();
    if (pass.code) return { kind: 'error', code: pass.code };
    token = pass.token;
  }

  const requestId = deps.requestId();
  const send = (turnstileToken: string | undefined) =>
    deps.api.checkout(
      {
        plan: choice.plan,
        requestId,
        locale: choice.locale,
        acceptTerms: true,
        termsVersion: config.data.termsVersion as string,
        provider,
        returnPath: choice.returnPath,
        ...(turnstileToken ? { turnstileToken } : {}),
        ...(deps.attribution?.() ?? {}),
      },
      { signal: deps.signal },
    );

  let answer = await send(token);
  if (!answer.ok && (answer.code === 'network' || answer.code === 'timeout')) answer = await send(token);
  if (!answer.ok && answer.code === 'identity_required') {
    const failed = await identity();
    if (failed) return { kind: 'error', code: failed };
    const pass = await checkoutToken();
    if (pass.code) return { kind: 'error', code: pass.code };
    answer = await send(pass.token);
  } else if (!answer.ok && answer.code === 'turnstile_required') {
    const pass = await checkoutToken();
    if (pass.code) return { kind: 'error', code: pass.code };
    answer = await send(pass.token);
  }
  // The account, the order or both may be new now: /me is asked again next time.
  deps.session.refreshMe();
  if (answer.ok) return outcomeOf(answer.data);
  if (answer.code === 'order_open' && answer.orderId) return { kind: 'open', orderId: answer.orderId };
  return { kind: 'error', code: answer.code };
}

/** The tariffs still running and the newest order, from /me (empty without a studio account). */
export function packOf(me: StudioMe | null): { readonly running: NonNullable<StudioMe['entitlements']>; readonly latest: StudioMe['latestOrder'] } {
  return { running: me?.entitlements ?? [], latest: me?.latestOrder ?? null };
}

// The pack hint lives in hint.ts (main.tsx reads it without loading billing code).
export { PACK_HINT_KEY, packRemembered, rememberPack } from './hint';
