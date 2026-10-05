import { hashToken, sha256Hex } from "./hash";
export function cookieValue(request: Request, name: string): string {
  return (
    (request.headers.get("cookie") || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}
export function authCookie(
  name: string,
  value: string,
  seconds: number,
): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export class IdentityStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  async ownsChat(request: Request, id: string): Promise<boolean> {
    if (
      cookieValue(request, "gpt_sid") !== id ||
      !cookieValue(request, "gpt_sat")
    )
      return false;
    try {
      return !!(await this.db
        .prepare("SELECT id FROM gpt_sessions WHERE id=? AND anon_token=?")
        .bind(id, await hashToken(cookieValue(request, "gpt_sat")))
        .first());
    } catch {
      return false;
    }
  }
  async user(request: Request, now = Date.now()): Promise<string | null> {
    const token = cookieValue(request, "__Host-gpt_account");
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = await this.db
      .prepare(
        "SELECT user_id FROM gpt_auth_sessions WHERE org_id=? AND token_hash=? AND expires_at>?",
      )
      .bind(this.org, await sha256Hex(token), now)
      .first<{ user_id: string }>();
    return row?.user_id || null;
  }
  async challenge(
    state: string,
    verifier: string,
    locale: string,
    now = Date.now(),
  ) {
    await this.db
      .prepare(
        "INSERT INTO gpt_auth_challenges(org_id,state_hash,verifier,locale,expires_at) VALUES(?,?,?,?,?)",
      )
      .bind(this.org, await sha256Hex(state), verifier, locale, now + 600_000)
      .run();
  }
  async claim(state: string, now = Date.now()) {
    return this.db
      .prepare(
        "DELETE FROM gpt_auth_challenges WHERE org_id=? AND state_hash=? AND expires_at>? RETURNING verifier,locale",
      )
      .bind(this.org, await sha256Hex(state), now)
      .first<{ verifier: string; locale: string }>();
  }
  async login(identityHash: string, now = Date.now()): Promise<string> {
    const id = `acct_${crypto.randomUUID().replace(/-/g, "")}`;
    await this.db
      .prepare(
        `INSERT INTO gpt_accounts(org_id,id,identity_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)
      ON CONFLICT(org_id,identity_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at`,
      )
      .bind(this.org, id, identityHash, now, now)
      .run();
    const account = await this.db
      .prepare("SELECT id FROM gpt_accounts WHERE org_id=? AND identity_hash=?")
      .bind(this.org, identityHash)
      .first<{ id: string }>();
    if (!account) throw new Error("account_missing");
    const token = randomToken();
    await this.db
      .prepare(
        "INSERT INTO gpt_auth_sessions(org_id,token_hash,user_id,expires_at) VALUES(?,?,?,?)",
      )
      .bind(this.org, await sha256Hex(token), account.id, now + 30 * 86400_000)
      .run();
    return token;
  }
  /**
   * A fresh account with no identity behind it (a rehearsal, rehearsal.ts),
   * signed in for `ttlMs`. Its identity_hash names only the account itself.
   */
  async syntheticLogin(
    idPrefix: string,
    ttlMs: number,
    now = Date.now(),
  ): Promise<{ id: string; token: string }> {
    const id = `${idPrefix}${randomToken().slice(0, 32)}`;
    const token = randomToken();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO gpt_accounts(org_id,id,identity_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)",
        )
        .bind(this.org, id, `synthetic:${id}`, now, now),
      this.db
        .prepare(
          "INSERT INTO gpt_auth_sessions(org_id,token_hash,user_id,expires_at) VALUES(?,?,?,?)",
        )
        .bind(this.org, await sha256Hex(token), id, now + ttlMs),
    ]);
    return { id, token };
  }
  /**
   * Signing in through Telegram from a browser that paid as a guest: the
   * guest's orders and packs move to the Telegram account just signed in
   * (`identityHash`), with the guest's answers of the day, and the guest
   * account is left with no session. Only a guest account moves, and only
   * into the account this sign-in proved: a Telegram account signed in
   * before on this browser keeps its pack. A repeat finds nothing to move.
   */
  async adoptGuest(request: Request, identityHash: string, now = Date.now()): Promise<void> {
    const guest = await this.user(request, now);
    if (!guest || !isGuestAccount(guest)) return;
    const account = await this.db
      .prepare("SELECT id FROM gpt_accounts WHERE org_id=? AND identity_hash=?")
      .bind(this.org, identityHash)
      .first<{ id: string }>();
    if (!account || account.id === guest) return;
    await this.db.batch([
      ...moveOrders(this.db, this.org, guest, account.id, null),
      this.db
        .prepare("UPDATE gpt_turn_reservations SET subject=? WHERE org_id=? AND subject=?")
        .bind(account.id, this.org, guest),
      this.db.prepare("DELETE FROM gpt_auth_sessions WHERE org_id=? AND user_id=?").bind(this.org, guest),
    ]);
  }
  async logout(request: Request) {
    await this.db
      .prepare("DELETE FROM gpt_auth_sessions WHERE org_id=? AND token_hash=?")
      .bind(
        this.org,
        await sha256Hex(cookieValue(request, "__Host-gpt_account")),
      )
      .run();
  }
}
/**
 * Guest checkout: a browser pays without signing in. Its pack belongs to a
 * guest account (syntheticLogin, no identity behind it) whose only key is
 * this browser's __Host-gpt_account session: a random token stored hashed,
 * httpOnly, minted by the server. A year, past the pack's month and a
 * renewal. Signing in through Telegram later moves the pack over
 * (adoptGuest); support moves a lost one with a restore link (guest-restore.ts).
 */
export const GUEST_ACCOUNT_PREFIX = "acct_guest_";
export const GUEST_SESSION_MS = 365 * 86400_000;
export function isGuestAccount(user: string): boolean {
  return user.startsWith(GUEST_ACCOUNT_PREFIX);
}

/**
 * Hand orders of `from` to `to`: the orders (one, or all), their packs and
 * offer acceptances, in one atomic batch. An open invoice that would make
 * `to` hold two open ones of a provider stays where it is (OR IGNORE).
 * Packs follow only the orders that moved, so a pack is never in two places.
 * The statements, for the caller's batch.
 */
export function moveOrders(
  db: D1Database,
  org: string,
  from: string,
  to: string,
  order: string | null,
): D1PreparedStatement[] {
  const one = order ? " AND id=?" : "";
  const only = (sql: string, ...binds: unknown[]) =>
    db.prepare(sql + (order ? " AND order_id=?" : "")).bind(...binds, ...(order ? [order] : []));
  const moved = "order_id IN (SELECT id FROM gpt_payment_orders WHERE org_id=? AND user_id=?)";
  return [
    db
      .prepare(`UPDATE OR IGNORE gpt_payment_orders SET user_id=? WHERE org_id=? AND user_id=?${one}`)
      .bind(to, org, from, ...(order ? [order] : [])),
    only(`UPDATE gpt_access_periods SET user_id=? WHERE org_id=? AND user_id=? AND ${moved}`, to, org, from, org, to),
    only(`UPDATE gpt_payment_consents SET user_id=? WHERE org_id=? AND user_id=? AND ${moved}`, to, org, from, org, to),
  ];
}

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
