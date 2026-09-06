import { sha256Hex } from "./hash";
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
  async ownsChat(request: Request, id: string, salt: string): Promise<boolean> {
    if (
      cookieValue(request, "gpt_sid") !== id ||
      !cookieValue(request, "gpt_sat")
    )
      return false;
    try {
      return !!(await this.db
        .prepare("SELECT id FROM gpt_sessions WHERE id=? AND anon_token=?")
        .bind(id, await sha256Hex(`${cookieValue(request, "gpt_sat")}${salt}`))
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
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
