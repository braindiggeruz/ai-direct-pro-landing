import { BillingStore } from "./billing-store";
import { hashToken, sha256Hex } from "./hash";
import { consumeRateLimit, HOUR_MS, type RateLimitResult } from "./rate-limit";
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
    stableSuffix?: string,
  ): Promise<{ id: string; token: string }> {
    if (stableSuffix !== undefined && !/^[a-f0-9]{32}$/.test(stableSuffix)) throw new Error('invalid_account_suffix');
    const id = `${idPrefix}${stableSuffix ?? randomToken().slice(0, 32)}`;
    const token = randomToken();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO gpt_accounts(org_id,id,identity_hash,created_at,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(org_id,id) DO NOTHING",
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
   *
   * The account holds one open invoice per provider (idx_gpt_orders_pending).
   * Its own open one gives way to the guest's while no provider can be paying
   * it (no provider has seen it, or its time is over), closed as createOrder
   * closes it; one a provider holds keeps the guest's invoice where it is.
   * An open invoice or a pack that did not move throws "guest_not_moved":
   * the guest keeps its session, sign-in answers an error, and the invoice
   * or pack stays with this browser (LOGIN-RU.md).
   */
  async adoptGuest(request: Request, identityHash: string, now = Date.now()): Promise<void> {
    const guest = await this.user(request, now);
    if (!guest || !isGuestAccount(guest)) return;
    const account = await this.db
      .prepare("SELECT id FROM gpt_accounts WHERE org_id=? AND identity_hash=?")
      .bind(this.org, identityHash)
      .first<{ id: string }>();
    if (!account || account.id === guest) return;
    const held = await this.db
      .prepare(
        `SELECT a.id,a.state,a.external_id,a.expires_at FROM gpt_payment_orders g JOIN gpt_payment_orders a
        ON a.org_id=g.org_id AND a.user_id=? AND a.provider=g.provider AND a.mode=g.mode AND a.state IN ('pending','prepared')
        WHERE g.org_id=? AND g.user_id=? AND g.state IN ('pending','prepared')`,
      )
      .bind(account.id, this.org, guest)
      .all<{ id: string; state: "pending" | "prepared"; external_id: string | null; expires_at: number }>();
    const billing = new BillingStore(this.db, this.org);
    for (const invoice of held.results || []) {
      const unseen = invoice.state === "pending" && !invoice.external_id;
      if (invoice.expires_at > now && !unseen) throw new Error("guest_not_moved");
      // Only from the state it was read in: one paid since throws "state".
      await billing.transition(invoice.id, "cancelled", invoice.expires_at > now ? "invoice_superseded" : "invoice_expired", {
        now,
        reason: 4,
        from: [invoice.state],
        unseen,
      });
    }
    const live = "SELECT 1 FROM gpt_payment_orders WHERE org_id=? AND user_id=? AND state IN ('pending','prepared','paid')";
    await this.db.batch([
      ...moveOrders(this.db, this.org, guest, account.id, null),
      this.db
        .prepare("UPDATE gpt_turn_reservations SET subject=? WHERE org_id=? AND subject=?")
        .bind(account.id, this.org, guest),
      this.db
        .prepare(`DELETE FROM gpt_auth_sessions WHERE org_id=? AND user_id=? AND NOT EXISTS(${live})`)
        .bind(this.org, guest, this.org, guest),
    ]);
    if (await this.db.prepare(live).bind(this.org, guest).first()) throw new Error("guest_not_moved");
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
 * May this address get one more guest account (checkout, restore link)?
 * Five an hour per address, `address` being hashIp(addressKey(ip)): an IPv6
 * client counts by its /64, from which it can send as many addresses as it
 * likes. Sixty an hour across the site, whatever the addresses.
 */
export async function paceGuestAccount(
  db: D1Database,
  address: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const one = await consumeRateLimit(db, "guest_account", address, { limit: 5, windowMs: HOUR_MS }, now);
  if (!one.allowed || one.degraded) return one;
  return consumeRateLimit(db, "guest_account_global", "all", { limit: 60, windowMs: HOUR_MS }, now);
}

/**
 * Hand orders of `from` to `to`: the orders (one, or all), their packs and
 * offer acceptances, in one atomic batch. An order that would make `to` hold
 * two open invoices of a provider, or reuse one of its request ids, stays
 * where it is (OR IGNORE): the caller checks what moved. Packs follow only
 * the orders that moved, so a pack is never in two places. A moved order's
 * version steps, so a payment settling it at the same moment (transition)
 * reads it again and opens its pack for the account that holds it now.
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
      .prepare(`UPDATE OR IGNORE gpt_payment_orders SET user_id=?,version=version+1 WHERE org_id=? AND user_id=?${one}`)
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
