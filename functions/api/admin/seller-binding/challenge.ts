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
import { ownerError, ownerJson, withOwnerRole, methodNotAllowed } from '../../../platform/admin/http';
import {
  SellerBindingError,
  bindingEnabled,
  createSellerBindingChallenge,
} from '../../../platform/admin/seller-binding';

const FAILURE_STATUS: Record<string, number> = {
  binding_disabled: 404,
  store_unavailable: 409,
  // More than one active store means the assumption this rests on has stopped
  // holding. The owner is told, rather than a store being chosen for them.
  store_ambiguous: 409,
  challenge_exists: 409,
  rate_limited: 429,
};

export const onRequestPost: PagesFunction<Env> = withOwnerRole(
  'platform_owner',
  async ({ env, db, actor, requestId }) => {
    // Off, the endpoint does not exist as far as a caller can tell. A 403 would
    // confirm the route is real and worth coming back to.
    if (!bindingEnabled(env)) return ownerError('not_found', requestId, 404);
    try {
      const created = await createSellerBindingChallenge(env, db, actor.email, new Date());
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
