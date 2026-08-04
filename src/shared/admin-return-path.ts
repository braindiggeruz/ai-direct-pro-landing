/**
 * Where the admin login is allowed to send a browser after a successful sign-in.
 *
 * The login at `/admin-tools/login` owns every admin session on this origin, so
 * both consoles use it: the SEO cockpit it was built for, and the Bormi Admin
 * panel served from `/admin/`. Until now it had one hard destination, which
 * meant an operator who opened `/admin/` signed in and landed in the *other*
 * console — the panel they asked for was never reached.
 *
 * A return path fixes that, and a return path is also the classic open-redirect
 * hole, so this module is the only place allowed to decide one. The rule is a
 * whitelist rather than a blacklist: the value must be a path this origin serves
 * under `/admin`, and everything else — an absolute URL, a protocol-relative
 * `//host`, a `javascript:` payload, a backslash variant, a path anywhere else
 * on this site — is rejected by not matching, not by being enumerated.
 *
 * No credential is ever carried here. The token lives in storage and travels in
 * an Authorization header; a URL that could hold one would put it in history.
 */

/** The query parameter the login reads. One name, used by both consoles. */
export const ADMIN_RETURN_PARAM = 'returnTo';

/** Where the login goes when it was not told anything, exactly as before. */
export const ADMIN_LOGIN_DEFAULT = '/admin-tools/';

/**
 * `/admin`, or `/admin/` followed by unreserved path characters. Deliberately
 * narrow: no query, no fragment, no escape, no percent sign. A filter that does
 * not survive a sign-in is a smaller loss than a redirect that survives review.
 */
const ADMIN_PATH = /^\/admin(?:\/[A-Za-z0-9\-._~/]*)?$/;

/** Longer than any route this panel has; a bound, so nothing unbounded is echoed. */
const MAX_LENGTH = 200;

/**
 * The candidate, if it is a path the Bormi Admin panel serves. Otherwise null,
 * and the caller falls back to its own default.
 */
export function safeAdminReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > MAX_LENGTH) return null;
  // Named explicitly so the intent is testable, even though the pattern below
  // would reject all three on its own.
  if (raw.startsWith('//')) return null;
  if (raw.includes('\\')) return null;
  if (raw.includes(':')) return null;
  // A dot segment climbs back out: a path that starts `/admin/..` matches the
  // pattern below and is then normalised by the browser into somewhere outside
  // the panel — which is the one destination this whole module exists to refuse.
  if (raw.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  if (!ADMIN_PATH.test(raw)) return null;
  return raw;
}
