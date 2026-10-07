// Turnstile for the studio, fail-closed (spec §5.2).
//
// The studio has its own widget: STUDIO_TURNSTILE_SITE_KEY (public, in
// STUDIO_RUNTIME_CONFIG_JSON) and the secret STUDIO_TURNSTILE_SECRET_KEY. The
// chat's TURNSTILE_SECRET_KEY is never used: setting it would make the chat
// demand a token (functions/api/gpt/chat.ts).
//
// The shared checkTurnstile (functions/lib/turnstile.ts, unchanged) lets
// everybody through when its secret is unset. This wrapper does the opposite:
// no secret, no pass (503 studio_not_configured). A Siteverify outage refuses
// too (503 studio_busy). Every token must carry the action of its path and the
// request's own hostname.
//
// Cloudflare's published test secrets (always pass / always fail / spent)
// count only under `wrangler pages dev` on a local host with
// STUDIO_LOCAL_DEV=true, where their dummy answers carry neither our action
// nor our hostname. On gptbot.uz a test secret counts as no secret at all, so
// a mistaken test key can never open the free tier to scripts.
import type { Env } from "../../_types";
import { checkTurnstile } from "../turnstile";
import { getClientIp } from "../gpt-chat/hash";
import { STUDIO_HOST, studioHostAllowed, type StudioEnv } from "./config";

export type TurnstileEnv = StudioEnv & Pick<Env, "STUDIO_TURNSTILE_SECRET_KEY">;

/** Where a token is required (spec §5.2); each path checks its own action. */
export type StudioTurnstileAction = "studio_identity" | "studio_free_deck" | "studio_free_photo" | "studio_checkout";

/** Cloudflare's dummy secrets (developers.cloudflare.com/turnstile/troubleshooting/testing/). */
export const TURNSTILE_TEST_SECRETS: readonly string[] = [
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
];

export type StudioTurnstileVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "studio_not_configured" | "turnstile_required" | "turnstile_failed" | "studio_busy" };

/** The request comes to a local host that STUDIO_LOCAL_DEV lets see the studio. */
function localDev(request: Request, env: StudioEnv): boolean {
  const url = new URL(request.url);
  return url.hostname !== STUDIO_HOST && studioHostAllowed(url, env);
}

/** Cloudflare's public dummy widget repeats one token. Only local rehearsals
 * with the public test secret may use it repeatedly; real tokens stay single-use. */
export function repeatingLocalTestWidget(request: Request, env: TurnstileEnv): boolean {
  return localDev(request,env) && TURNSTILE_TEST_SECRETS.includes(env.STUDIO_TURNSTILE_SECRET_KEY ?? '');
}

/** The secret this request may be checked with, or null (fail-closed). */
function secretFor(request: Request, env: TurnstileEnv): string | null {
  const secret = (env.STUDIO_TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return null;
  if (TURNSTILE_TEST_SECRETS.includes(secret) && !localDev(request, env)) return null;
  return secret;
}

/** A token can be checked for this request: without that the free paths answer 503. */
export function studioTurnstileConfigured(request: Request, env: TurnstileEnv): boolean {
  return secretFor(request, env) !== null;
}

/**
 * Check `token` for `action`. Refuses without a usable secret
 * (studio_not_configured), without a token (turnstile_required), with a token
 * Siteverify rejects or that names another action or host (turnstile_failed),
 * and when Siteverify cannot be reached (studio_busy).
 */
export async function verifyStudioTurnstile(
  request: Request,
  env: TurnstileEnv,
  token: unknown,
  action: StudioTurnstileAction,
): Promise<StudioTurnstileVerdict> {
  const secret = secretFor(request, env);
  if (!secret) return { ok: false, code: "studio_not_configured" };
  if (typeof token !== "string" || !token.trim()) return { ok: false, code: "turnstile_required" };
  const expectations = TURNSTILE_TEST_SECRETS.includes(secret)
    ? {}
    : { expectedAction: action, expectedHostname: new URL(request.url).hostname };
  // checkTurnstile reads only TURNSTILE_SECRET_KEY; it gets the studio's secret here.
  const result = await checkTurnstile({ TURNSTILE_SECRET_KEY: secret } as Env, token, getClientIp(request), expectations);
  if (result.ok) return { ok: true };
  return { ok: false, code: result.reason === "unavailable" ? "studio_busy" : "turnstile_failed" };
}
