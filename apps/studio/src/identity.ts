/**
 * The browser identity and the Turnstile tokens of the studio
 * (STUDIO-SPEC §5.1, §5.2).
 *
 * `__Host-studio_bid` is HttpOnly: the island never sees it. It learns
 * whether the browser has one from /me (`identity`), and gets one by
 * passing Turnstile with the action `studio_identity` and posting the token
 * to /identity, which answers with the Set-Cookie.
 *
 * Each free deck needs its own token (action `studio_free_deck`). A token
 * is good for one check, so every call of `turnstileToken` renders a fresh
 * widget, waits for its token and removes it. The widget appears only when
 * Cloudflare wants an interaction (`appearance: 'interaction-only'`); a
 * visitor who passes silently sees nothing. The Turnstile script itself is
 * loaded on the first call, i.e. after the person submitted the form,
 * never on page load.
 */
import type { Result, StudioApi } from './api';
import { loadTurnstile, responsiveTurnstileSize, type TurnstileApi, type TurnstileWidgetOptions } from './turnstile';

export type StudioTurnstileAction = 'studio_identity' | 'studio_free_deck';

/** Options the copied loader's type does not list (Cloudflare's explicit-render API has them). */
type StudioWidgetOptions = TurnstileWidgetOptions & {
  appearance?: 'always' | 'execute' | 'interaction-only';
  'timeout-callback'?: () => void;
  'refresh-expired'?: 'auto' | 'manual' | 'never';
};

/** How long a person may take over an interactive challenge before the form gives up (ms). */
export const TURNSTILE_WAIT_MS = 120_000;

export type TokenResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly code: 'turnstile_failed' | 'turnstile_unavailable' };

export interface TokenRequest {
  /** Where the widget may appear: a box inside the form. */
  readonly container: HTMLElement;
  readonly siteKey: string;
  readonly action: StudioTurnstileAction;
  readonly signal?: AbortSignal;
  /** Tests pass their own loader. */
  readonly load?: () => Promise<TurnstileApi>;
  readonly waitMs?: number;
}

/** One fresh Turnstile token for `action`, or the reason there is none. Never rejects. */
export async function turnstileToken(request: TokenRequest): Promise<TokenResult> {
  let api: TurnstileApi;
  try {
    api = await (request.load ?? loadTurnstile)();
  } catch {
    return { ok: false, code: 'turnstile_unavailable' };
  }
  if (request.signal?.aborted) return { ok: false, code: 'turnstile_failed' };
  const slot = document.createElement('div');
  request.container.append(slot);
  let widgetId: string | null = null;
  try {
    return await new Promise<TokenResult>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, code: 'turnstile_failed' }), request.waitMs ?? TURNSTILE_WAIT_MS);
      const finish = (result: TokenResult) => {
        clearTimeout(timer);
        resolve(result);
      };
      request.signal?.addEventListener('abort', () => finish({ ok: false, code: 'turnstile_failed' }), { once: true });
      const options: StudioWidgetOptions = {
        sitekey: request.siteKey,
        action: request.action,
        theme: 'dark',
        size: responsiveTurnstileSize(),
        appearance: 'interaction-only',
        'refresh-expired': 'never',
        callback: (token) => finish(token ? { ok: true, token } : { ok: false, code: 'turnstile_failed' }),
        'error-callback': () => finish({ ok: false, code: 'turnstile_failed' }),
        'expired-callback': () => finish({ ok: false, code: 'turnstile_failed' }),
        'timeout-callback': () => finish({ ok: false, code: 'turnstile_failed' }),
      };
      try {
        widgetId = api.render(slot, options);
      } catch {
        finish({ ok: false, code: 'turnstile_unavailable' });
      }
    });
  } finally {
    try {
      if (widgetId !== null) api.remove(widgetId);
    } catch {
      // A widget that is already gone needs no removing.
    }
    slot.remove();
  }
}

export type IdentityResult = { readonly ok: true } | { readonly ok: false; readonly code: string };

/**
 * Makes sure the browser holds `__Host-studio_bid`: when /me said it has
 * none (or the server just answered identity_required), pass Turnstile
 * (`studio_identity`) and post the token to /identity.
 */
export async function obtainIdentity(
  api: Pick<StudioApi, 'identity'>,
  token: (action: StudioTurnstileAction) => Promise<TokenResult>,
): Promise<IdentityResult> {
  const pass = await token('studio_identity');
  if (!pass.ok) return pass;
  const issued: Result<{ ok: true }> = await api.identity(pass.token);
  return issued.ok ? { ok: true } : { ok: false, code: issued.code };
}
