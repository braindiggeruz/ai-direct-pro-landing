// Restoring a guest's pack (guest checkout, identity-store.ts). A browser
// that paid without signing in and then lost its cookie (another phone,
// cleared data) loses the pack with it. The owner's "AI paket: paid" notice
// of a guest order (billing-maintenance-store.ts) carries Click's payment
// number (click_paydoc_id, the one in the buyer's SMS and receipt), the
// transaction id and the time it was paid; support matches the buyer's
// Click receipt to it, asks for a restore link
// (internal/gpt-guest-restore-link) and sends it; the buyer opens it in the
// browser that should have the pack, and the order with its pack moves
// there (api/gpt/restore.ts). No link waits in the owner's chat.
//
// The link is stateless and single-use: an HMAC (GPT_IDENTITY_SECRET) over
// the order, the account holding it now and the expiry, 48 hours after it
// is made and the pack's end at the latest. Once the order has moved
// (restored, or kept through Telegram), its holder is another account and
// the same link no longer matches.
import { BILLING_ORG } from "./billing-config";
import { isGuestAccount } from "./identity-store";

/** Where a restore link points the buyer (the production site). */
const SITE = "https://gptbot.uz";
/** How long a restore link works, at most: support sends it at once. */
export const RESTORE_LINK_MS = 48 * 3600_000;
const TOKEN = /^v1\.(\d{13})\.(pay_[0-9a-f]{32})\.([0-9a-f]{64})$/;

/** The paid Click order a link can restore: its holder and its running pack. */
export interface RestorableOrder {
  id: string;
  user_id: string;
  state: string;
  /** click_trans_id: one payment attempt. */
  external_id: string | null;
  /** click_paydoc_id: the payment number in the buyer's Click SMS and receipt. */
  provider_doc_id: string | null;
  perform_time: number;
  ends_at: number | null;
  revoked_at: number | null;
  message_limit: number | null;
  locale: string | null;
}

async function mac(secret: string, order: string, holder: string, expires: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`guest-restore:v1:${order}:${holder}:${expires}`),
  );
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A Click order with its pack, by our number (pay_…) or by either of Click's:
 * the payment number of the buyer's SMS and receipt (click_paydoc_id) or the
 * transaction id (click_trans_id). Both are digits: a payment number that
 * matches goes first.
 */
export function findOrder(db: D1Database, query: string): Promise<RestorableOrder | null> {
  const byId = /^pay_[0-9a-f]{32}$/.test(query);
  return db
    .prepare(
      `SELECT o.id,o.user_id,o.state,o.external_id,o.provider_doc_id,o.perform_time,p.ends_at,p.revoked_at,p.message_limit,c.locale
      FROM gpt_payment_orders o
      LEFT JOIN gpt_access_periods p ON p.org_id=o.org_id AND p.order_id=o.id
      LEFT JOIN gpt_payment_consents c ON c.org_id=o.org_id AND c.order_id=o.id
      WHERE o.org_id=? AND o.provider='click' AND ${byId ? "o.id=?" : "(o.external_id=? OR o.provider_doc_id=?)"}
      ORDER BY ${byId ? "" : "o.provider_doc_id=? DESC,"}o.created_at DESC LIMIT 1`,
    )
    .bind(BILLING_ORG, query, ...(byId ? [] : [query, query]))
    .first<RestorableOrder>();
}

/** Whether a link may move this order: paid, a guest's, its pack still running. */
export function restorable(order: RestorableOrder, now = Date.now()): boolean {
  return (
    order.state === "paid" &&
    isGuestAccount(order.user_id) &&
    order.ends_at !== null &&
    order.ends_at > now &&
    order.revoked_at === null
  );
}

/** The link's token for the order as it is held now, valid until `expiresAt`. */
export async function restoreToken(
  secret: string,
  order: RestorableOrder,
  expiresAt: number,
): Promise<string> {
  return `v1.${expiresAt}.${order.id}.${await mac(secret, order.id, order.user_id, expiresAt)}`;
}

/** HH:MM dd.MM in Tashkent (UTC+5, no daylight saving). */
function tashkentStamp(at: number): string {
  const d = new Date(at + 5 * 3600_000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} ${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}`;
}

/**
 * The line the owner's "paid" notice gets for a guest order, to match the
 * buyer's receipt: Click's payment number (the one in the buyer's SMS and
 * receipt), the transaction id and when it was paid, in Tashkent. Every
 * order costs the same, so the number and the time are what tell buyers
 * apart. No link: support asks for one when a buyer needs it (restoreLink).
 * Empty for an account's order or on any failure: the notice goes out anyway.
 */
export async function restoreNotice(
  db: D1Database,
  orderId: string,
  now = Date.now(),
): Promise<string> {
  try {
    const order = await findOrder(db, orderId);
    if (!order || !restorable(order, now)) return "";
    const paid = order.perform_time > 0 ? tashkentStamp(order.perform_time) : "—";
    return `\nКуплен без входа · Click: номер платежа (SMS) ${order.provider_doc_id ?? "—"} · trans ${order.external_id ?? "—"} · оплачен ${paid} (Ташкент)`;
  } catch {
    return "";
  }
}

/** A restore link for the order as it is held now: RESTORE_LINK_MS, the pack's end at the latest. */
export async function restoreLink(
  secret: string,
  order: RestorableOrder,
  now = Date.now(),
): Promise<{ url: string; expiresAt: number }> {
  const expiresAt = Math.min(order.ends_at!, now + RESTORE_LINK_MS);
  return { url: `${SITE}/api/gpt/restore?t=${await restoreToken(secret, order, expiresAt)}`, expiresAt };
}

/** The order a token names, if the token is current and still matches its holder. */
export async function verifyRestoreToken(
  db: D1Database,
  secret: string,
  token: string,
  now = Date.now(),
): Promise<RestorableOrder | null> {
  const parts = TOKEN.exec(token);
  if (!parts || !secret) return null;
  const expires = Number(parts[1]);
  if (expires <= now) return null;
  const order = await findOrder(db, parts[2]);
  if (!order || !restorable(order, now) || expires > order.ends_at!) return null;
  const expected = await mac(secret, order.id, order.user_id, expires);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0 ? order : null;
}
