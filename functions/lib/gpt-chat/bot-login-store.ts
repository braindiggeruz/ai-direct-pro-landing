// Sign-in on gptbot.uz through the bot @gptbotuz_bot (plan WP-16, decision
// L11). Every SQL statement of gpt_bot_logins lives here; every method runs
// inside one org (AGENTS.md §3).
//
// One row per attempt, alive BOT_LOGIN_TTL_MS:
//
//   pick (default)  pending ──/start login_<nonce>──▶ claimed ──right number──▶ confirmed ──poll──▶ consumed
//                                                       └──wrong number or «not me»──▶ rejected
//   code            pending ──/start login_<nonce>──▶ claimed ──site enters the code──▶ consumed
//                                                       └──wrong code or «not me»──▶ rejected
//
// pending   the site created it; the nonce is in the deep link, its hash here;
// claimed   a Telegram user opened the link; their identity hash is bound and
//           no other Telegram user can take it over: another one opening it
//           rejects the attempt (claimed or confirmed);
// confirmed (pick) that user pressed the number the site shows: one press,
//           so a person who never saw the site (a forwarded link) guesses one
//           of three; (code) skipped: the bot sends the code and the browser
//           that started the attempt types it in, once;
// consumed  the browser holding the attempt's cookie signed in. Exactly once:
//           every step is one conditional UPDATE and decides on its own result.
//
// Expiry is read from expires_at, never written. Only hashes are stored: the
// nonce (sha256), the browser's cookie (sha256) and the Telegram identity
// (telegram-identity.ts). Rows are swept a day after they expire
// (billing-maintenance-store.ts maintainBilling).
import { sha256Hex } from "./hash";

export type BotLoginMode = "pick" | "code";
export type BotLoginStatus = "pending" | "claimed" | "confirmed" | "rejected" | "consumed";
export type BotLoginLocale = "ru" | "uz";

/** How long an attempt lives: the deep link, the number and the cookie. */
export const BOT_LOGIN_TTL_MS = 600_000;
/** Attempts one browser may have in flight at once. */
export const BOT_LOGIN_MAX_ACTIVE = 5;

export interface BotLoginRow {
  id: string;
  mode: BotLoginMode;
  /** pick: the 2-digit number the site shows; code: the 6 digits the bot sends. */
  code: string;
  /** pick: the three numbers the bot offers, "47,12,85"; code: null. */
  choices: string | null;
  locale: BotLoginLocale;
  /** Browser family and OS of the browser that started it, e.g. "Chrome, Android". */
  client: string | null;
  status: BotLoginStatus;
  tg_hash: string | null;
  created_at: number;
  expires_at: number;
}

export interface NewBotLogin {
  /** 32 hex from the deep link (start=login_<nonce>); only its hash is stored. */
  nonce: string;
  /** sha256 of the browser's __Host-gpt_botlogin cookie. */
  browserHash: string;
  mode: BotLoginMode;
  locale: BotLoginLocale;
  client: string | null;
}

/** What opening the deep link in the bot found. */
export type BotLoginOpening =
  /** The link was waiting: this Telegram user holds it now. */
  | { result: "claimed"; row: BotLoginRow }
  /** The same user opened it again before deciding. */
  | { result: "reopened"; row: BotLoginRow }
  /** The same user already confirmed it (or the site already signed in). */
  | { result: "decided"; row: BotLoginRow }
  /** Another Telegram user holds it; while in flight it is rejected now. */
  | { result: "taken" }
  /** Unknown, expired or rejected. */
  | { result: "stale" };

/** A press in the bot: what it did, or why it did nothing. */
export type BotLoginDecision = "confirmed" | "rejected" | "repeat" | "foreign" | "stale";

/** A press and the language of the site page its attempt began on (null: no such attempt). */
export interface BotLoginPress {
  result: BotLoginDecision;
  locale: BotLoginLocale | null;
}

/** What the browser's poll learns; "done" carries the identity to sign in. */
export type BotLoginPoll =
  | { status: "pending" | "claimed" | "rejected" | "expired" }
  | { status: "done"; identityHash: string };

const COLUMNS =
  "id,mode,code,choices,locale,client,status,tg_hash,created_at,expires_at";
/** States an attempt is still in flight in. */
const ACTIVE = "('pending','claimed','confirmed')";

/** A uniform integer in [min, max] from the CSPRNG (rejection sampling, no modulo bias). */
export function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const word = new Uint32Array(1);
  do crypto.getRandomValues(word);
  while (word[0] >= limit);
  return min + (word[0] % range);
}

/** `bytes` random bytes as lowercase hex. */
export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The secret of one attempt: 10..99 for pick, 100000..999999 for code. */
export function loginCode(mode: BotLoginMode): string {
  return String(mode === "pick" ? randomInt(10, 99) : randomInt(100_000, 999_999));
}

/** The right number and two other 2-digit numbers, shuffled: "47,12,85". */
export function loginChoices(code: string): string {
  const choices = [code];
  while (choices.length < 3) {
    const decoy = String(randomInt(10, 99));
    if (!choices.includes(decoy)) choices.push(decoy);
  }
  for (let i = choices.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices.join(",");
}

export class BotLoginStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}

  /**
   * A new attempt in one statement, or null when the browser already has
   * BOT_LOGIN_MAX_ACTIVE in flight. Returns the code the site shows (pick)
   * or keeps to itself (code: the bot sends it).
   */
  async create(
    input: NewBotLogin,
    now = Date.now(),
  ): Promise<{ id: string; code: string; expiresAt: number } | null> {
    const id = randomHex(8);
    const code = loginCode(input.mode);
    const expiresAt = now + BOT_LOGIN_TTL_MS;
    const result = await this.db
      .prepare(
        `INSERT INTO gpt_bot_logins(org_id,id,nonce_hash,browser_hash,mode,code,choices,locale,client,status,created_at,expires_at)
         SELECT ?,?,?,?,?,?,?,?,?,'pending',?,?
         WHERE (SELECT COUNT(*) FROM gpt_bot_logins WHERE org_id=? AND browser_hash=? AND expires_at>? AND status IN ${ACTIVE})<?`,
      )
      .bind(
        this.org,
        id,
        await sha256Hex(input.nonce),
        input.browserHash,
        input.mode,
        code,
        input.mode === "pick" ? loginChoices(code) : null,
        input.locale,
        input.client,
        now,
        expiresAt,
        this.org,
        input.browserHash,
        now,
        BOT_LOGIN_MAX_ACTIVE,
      )
      .run();
    return (result.meta?.changes ?? 0) > 0 ? { id, code, expiresAt } : null;
  }

  /**
   * The bot opened `login_<nonce>` for the Telegram identity `tgHash`. The
   * first opener binds the attempt; the same person may open it again. A
   * second Telegram account opening it means the link reached someone else:
   * the attempt still in flight is rejected, so the browser that started it
   * signs in to nobody's account through it (a stolen link and one lucky
   * press would otherwise sign it in to the thief's) and is told to start
   * again.
   */
  async openByNonce(
    nonce: string,
    tgHash: string,
    now = Date.now(),
  ): Promise<BotLoginOpening> {
    const nonceHash = await sha256Hex(nonce);
    const claimed = await this.db
      .prepare(
        `UPDATE gpt_bot_logins SET status='claimed', tg_hash=?, claimed_at=?
         WHERE org_id=? AND nonce_hash=? AND status='pending' AND expires_at>?
         RETURNING ${COLUMNS}`,
      )
      .bind(tgHash, now, this.org, nonceHash, now)
      .first<BotLoginRow>();
    if (claimed) return { result: "claimed", row: claimed };
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM gpt_bot_logins WHERE org_id=? AND nonce_hash=?`)
      .bind(this.org, nonceHash)
      .first<BotLoginRow>();
    if (!row || row.expires_at <= now || row.status === "rejected" || row.status === "pending")
      return { result: "stale" };
    if (row.tg_hash !== tgHash) {
      await this.db
        .prepare(
          `UPDATE gpt_bot_logins SET status='rejected', decided_at=?
           WHERE org_id=? AND nonce_hash=? AND status IN ('claimed','confirmed') AND expires_at>?`,
        )
        .bind(now, this.org, nonceHash, now)
        .run();
      return { result: "taken" };
    }
    return row.status === "claimed" ? { result: "reopened", row } : { result: "decided", row };
  }

  /** A number pressed in the bot (pick): the one press the attempt gets. */
  async decide(
    id: string,
    tgHash: string,
    pick: string,
    now = Date.now(),
  ): Promise<BotLoginPress> {
    const row = await this.db
      .prepare(
        `UPDATE gpt_bot_logins SET status=CASE WHEN code=? THEN 'confirmed' ELSE 'rejected' END, decided_at=?
         WHERE org_id=? AND id=? AND tg_hash=? AND mode='pick' AND status='claimed' AND expires_at>?
         RETURNING status,locale`,
      )
      .bind(pick, now, this.org, id, tgHash, now)
      .first<{ status: "confirmed" | "rejected"; locale: BotLoginLocale }>();
    return row ? { result: row.status, locale: row.locale } : this.unchanged(id, tgHash, now);
  }

  /** «Это не я» / «Bu men emas»: the attempt ends here, whatever its mode. */
  async reject(id: string, tgHash: string, now = Date.now()): Promise<BotLoginPress> {
    const row = await this.db
      .prepare(
        `UPDATE gpt_bot_logins SET status='rejected', decided_at=?
         WHERE org_id=? AND id=? AND tg_hash=? AND status='claimed' AND expires_at>?
         RETURNING locale`,
      )
      .bind(now, this.org, id, tgHash, now)
      .first<{ locale: BotLoginLocale }>();
    return row ? { result: "rejected", locale: row.locale } : this.unchanged(id, tgHash, now);
  }

  /** Why a press changed nothing: not this person's, gone, or already decided. */
  private async unchanged(id: string, tgHash: string, now: number): Promise<BotLoginPress> {
    const row = await this.db
      .prepare("SELECT tg_hash,expires_at,locale FROM gpt_bot_logins WHERE org_id=? AND id=?")
      .bind(this.org, id)
      .first<{ tg_hash: string | null; expires_at: number; locale: BotLoginLocale }>();
    if (!row) return { result: "stale", locale: null };
    const result = row.tg_hash !== tgHash ? "foreign" : row.expires_at <= now ? "stale" : "repeat";
    return { result, locale: row.locale };
  }

  /**
   * The browser's poll of attempt `id`; only the browser that started it (its
   * cookie's hash) sees it. A confirmed attempt is consumed here, once. In
   * code mode the typed `code` gets one try while the attempt is claimed.
   */
  async consume(
    id: string,
    browserHash: string,
    now = Date.now(),
    code?: string,
  ): Promise<BotLoginPoll> {
    const row = await this.db
      .prepare(
        "SELECT mode,status,expires_at FROM gpt_bot_logins WHERE org_id=? AND id=? AND browser_hash=?",
      )
      .bind(this.org, id, browserHash)
      .first<{ mode: BotLoginMode; status: BotLoginStatus; expires_at: number }>();
    if (!row || row.status === "consumed" || row.expires_at <= now) return { status: "expired" };
    if (row.status === "rejected" || row.status === "pending") return { status: row.status };
    if (row.status === "claimed") {
      if (row.mode !== "code" || code === undefined) return { status: "claimed" };
      const typed = await this.db
        .prepare(
          `UPDATE gpt_bot_logins SET status=CASE WHEN code=? THEN 'consumed' ELSE 'rejected' END,
             decided_at=?, consumed_at=CASE WHEN code=? THEN ? END
           WHERE org_id=? AND id=? AND browser_hash=? AND mode='code' AND status='claimed' AND expires_at>?
           RETURNING status,tg_hash`,
        )
        .bind(code, now, code, now, this.org, id, browserHash, now)
        .first<{ status: "consumed" | "rejected"; tg_hash: string }>();
      if (!typed) return this.consume(id, browserHash, now);
      return typed.status === "consumed"
        ? { status: "done", identityHash: typed.tg_hash }
        : { status: "rejected" };
    }
    const done = await this.db
      .prepare(
        `UPDATE gpt_bot_logins SET status='consumed', consumed_at=?
         WHERE org_id=? AND id=? AND browser_hash=? AND status='confirmed' AND expires_at>?
         RETURNING tg_hash`,
      )
      .bind(now, this.org, id, browserHash, now)
      .first<{ tg_hash: string }>();
    // Another poll of the same browser consumed it in between: that one signed in.
    return done ? { status: "done", identityHash: done.tg_hash } : { status: "expired" };
  }

  /**
   * «Выйти на всех устройствах»: every web session of the account behind
   * `identityHash` ends, and its attempts still in flight are rejected, so a
   * browser that was about to consume one gets nothing. Repeating it changes
   * nothing more.
   */
  async revokeSessions(
    identityHash: string,
    now = Date.now(),
  ): Promise<{ sessions: number; attempts: number }> {
    const account = await this.db
      .prepare("SELECT id FROM gpt_accounts WHERE org_id=? AND identity_hash=?")
      .bind(this.org, identityHash)
      .first<{ id: string }>();
    const statements = [
      this.db
        .prepare(
          `UPDATE gpt_bot_logins SET status='rejected', decided_at=?
           WHERE org_id=? AND tg_hash=? AND status IN ('claimed','confirmed')`,
        )
        .bind(now, this.org, identityHash),
    ];
    if (account)
      statements.push(
        this.db
          .prepare("DELETE FROM gpt_auth_sessions WHERE org_id=? AND user_id=?")
          .bind(this.org, account.id),
      );
    const [attempts, sessions] = await this.db.batch(statements);
    return {
      attempts: attempts.meta?.changes ?? 0,
      sessions: sessions?.meta?.changes ?? 0,
    };
  }
}
