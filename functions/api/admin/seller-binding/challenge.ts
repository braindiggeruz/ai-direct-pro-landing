/**
 * Mint one single-use challenge for the owner-assisted Telegram seller binding.
 *
 * `POST /api/admin/seller-binding/challenge`
 *
 * Owner half of the handshake. `withOwnerRole('platform_owner', …)` means the
 * caller has presented a signed admin token whose role claim allows mutation;
 * there is no body field, header or query parameter that can select a role, an
 * organization or a store, so this endpoint has nothing for a caller to steer.
 *
 * The response carries the raw challenge exactly once. It is not stored — only
 * its SHA-256 is — so it cannot be recovered afterwards, by us or by anyone
 * reading the table. A second call while one is still live is refused rather
 * than quietly rotating: two outstanding secrets is two chances to spend the
 * wrong one.
 */
import type { Env } from '../../../_types';
import {
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
  methodNotAllowed,
} from '../../../platform/admin/http';
import {
  SellerBindingError,
  bindingEnabled,
  createSellerBindingChallenge,
  parseCanaryWindow,
} from '../../../platform/admin/seller-binding';

const FAILURE_STATUS: Record<string, number> = {
  binding_disabled: 404,
  // Told apart for the owner standing in front of the console, who is the only
  // caller that can reach them: a mistyped key and a window that has already
  // closed need different next moves, and neither answer is available to
  // anyone without a signed owner token.
  canary_invalid: 403,
  canary_expired: 403,
  canary_consumed: 403,
  store_unavailable: 409,
  // More than one active store means the assumption this rests on has stopped
  // holding. The owner is told, rather than a store being chosen for them.
  store_ambiguous: 409,
  challenge_exists: 409,
  rate_limited: 429,
};

export const onRequestPost: PagesFunction<Env> = withOwnerRole(
  'platform_owner',
  async ({ request, env, db, actor, requestId }) => {
    // Off and with no canary configured, the endpoint does not exist as far as
    // a caller can tell. A 403 would confirm the route is real and worth
    // coming back to.
    const canaryConfigured = parseCanaryWindow(env) !== null;
    if (!bindingEnabled(env) && !canaryConfigured) {
      return ownerError('not_found', requestId, 404);
    }
    // The body is read only on the canary path, so the ordinary flag-on route
    // keeps working exactly as it did — including for a caller that sends no
    // body at all, which is what the console does.
    let canaryKey: unknown;
    if (!bindingEnabled(env)) {
      const body = await readOwnerBody(request).catch(() => null);
      if (body && typeof body === 'object') {
        canaryKey = (body as Record<string, unknown>).canary;
      }
    }
    try {
      const created = await createSellerBindingChallenge(
        env,
        db,
        actor.email,
        new Date(),
        canaryKey,
      );
      return ownerJson({
        // Shown once. The operator is expected to hand it over out of band and
        // not to paste it anywhere that keeps history.
        challenge: created.challenge,
        expiresAt: created.expiresAt,
        storeName: created.storeName,
        instructions: 'Open the Bormi Mini App from the owner Telegram account and confirm the binding with this code. It expires in 10 minutes and works once.',
      }, requestId, 201);
    } catch (error) {
      if (error instanceof SellerBindingError) {
        return ownerError(error.code, requestId, FAILURE_STATUS[error.code] ?? 400);
      }
      throw error;
    }
  },
);

export const onRequestGet = methodNotAllowed('POST');
export const onRequestPut = methodNotAllowed('POST');
export const onRequestDelete = methodNotAllowed('POST');
