// Restoring a studio buyer's tariff to a new browser (spec §5.3, DECISIONS
// §8(б, в)). A buyer who lost the account cookie (cleared the browser,
// another phone) writes to support with:
//   - the order number (stu_…, shown after payment: «To‘lov raqamini
//     saqlang») or the payment number of Payme or Click (the provider's
//     transaction id or document number);
//   - the amount (5 900 or 39 900 so‘m) and the date paid (±1 day).
// Never the card's digits. Support asks for a link
// (POST /api/internal/studio-restore-link); the buyer opens it in the
// browser that should hold the tariff (GET /api/studio/restore shows one
// button; its POST moves the order and every entitlement of it to that
// browser's studio account in one guarded batch, store.ts moveToAccount).
//
// The link is stateless and single-use: an HMAC (GPT_IDENTITY_SECRET, its
// own domain prefix) over the order, the account holding it now and the
// link's end, 48 hours after it is made and the tariff's end at the latest.
// Once the order has moved its holder is another account and the same link
// no longer matches. One restore per order in 7 days (restored_at): a link
// for an order restored less than 7 days ago is refused (restore_recent).
import { STUDIO_ORDER_ID, StudioStore, type StudioEntitlement, type StudioOrder } from "./store";

/** Where a restore link points the buyer (the production site). */
const SITE = "https://gptbot.uz";
/** How long a restore link works, at most: support sends it at once. */
export const STUDIO_RESTORE_LINK_MS = 48 * 3_600_000;
/** One restore per order in this long. */
export const STUDIO_RESTORE_GAP_MS = 7 * 86_400_000;
/** The paid date may be off by a day (time zones, a payment after midnight). */
export const RESTORE_DATE_SLACK_DAYS = 1;
const DAY_MS = 86_400_000;
/** Tashkent is UTC+5 all year. */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

export const STUDIO_RESTORE_TOKEN = /^v1\.(\d{13})\.(stu_[0-9a-f]{32})\.([0-9a-f]{64})$/;
/** What support may type as the number: our order id, a Payme transaction id (24 hex) or digits. */
export const RESTORE_QUERY = /^(stu_[0-9a-f]{32}|[0-9a-f]{24}|\d{1,20})$/;

/** An order a link may restore: paid, a tariff of it still running, not restored in 7 days. */
export interface RestoreTarget {
  readonly order: StudioOrder;
  /** The latest end among the order's live, unrevoked entitlements. */
  readonly endsAt: number;
}

export type RestoreLookup =
  | { readonly ok: true; readonly target: RestoreTarget }
  | { readonly ok: false; readonly code: "not_found" | "invalid_order" | "restore_recent" };

async function mac(secret: string, order: string, holder: string, expires: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`studio-restore:v1:${order}:${holder}:${expires}`));
  return Array.from(new Uint8Array(sig), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The latest end of a running, unrevoked entitlement of the order, or null. */
export function runningEnd(entitlements: readonly StudioEntitlement[], now: number): number | null {
  let end: number | null = null;
  for (const row of entitlements) {
    if (row.revoked_at !== null || row.ends_at <= now) continue;
    end = Math.max(end ?? 0, row.ends_at);
  }
  return end;
}

/** The Tashkent calendar day (YYYY-MM-DD) of `at`. */
export function tashkentDay(at: number): string {
  return new Date(at + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** `paidDate` (YYYY-MM-DD) is within a day of the Tashkent day the order was paid. */
export function sameDayish(paidDate: string, performTime: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return false;
  const named = Date.parse(`${paidDate}T00:00:00Z`);
  const actual = Date.parse(`${tashkentDay(performTime)}T00:00:00Z`);
  return Number.isFinite(named) && Math.abs(named - actual) <= RESTORE_DATE_SLACK_DAYS * DAY_MS;
}

/** The live orders `query` may name: our id, a provider transaction id, or a provider document number. */
export async function ordersFor(store: StudioStore, query: string): Promise<StudioOrder[]> {
  if (STUDIO_ORDER_ID.test(query)) {
    const order = await store.byId(query);
    return order ? [order] : [];
  }
  const found = new Map<string, StudioOrder>();
  const byPayme = /^[0-9a-f]{24}$/.test(query) ? await store.byExternal("payme", "live", query) : null;
  if (byPayme) found.set(byPayme.id, byPayme);
  if (/^\d{1,20}$/.test(query)) {
    const byClick = await store.byExternal("click", "live", query);
    if (byClick) found.set(byClick.id, byClick);
  }
  for (const order of await store.byDocId(query)) found.set(order.id, order);
  return [...found.values()].filter((order) => order.mode === "live");
}

/**
 * The order support may restore for this number, amount (so‘m) and paid
 * date: not_found when no paid live order matches all three;
 * invalid_order when it matches but holds no running tariff (ended,
 * refunded); restore_recent when it was restored less than 7 days ago.
 */
export async function findRestorable(
  store: StudioStore,
  request: { readonly query: string; readonly amountUzs: number; readonly paidDate: string },
  now = Date.now(),
): Promise<RestoreLookup> {
  const matches = (await ordersFor(store, request.query)).filter(
    (order) =>
      (order.state === "paid" || order.state === "refunded") &&
      order.amount === Math.round(request.amountUzs * 100) &&
      order.perform_time > 0 &&
      sameDayish(request.paidDate, order.perform_time),
  );
  if (!matches.length) return { ok: false, code: "not_found" };
  const order = matches[0];
  if (order.state !== "paid") return { ok: false, code: "invalid_order" };
  const endsAt = runningEnd(await store.orderEntitlements(order.id), now);
  if (endsAt === null) return { ok: false, code: "invalid_order" };
  if (order.restored_at !== null && now - order.restored_at < STUDIO_RESTORE_GAP_MS) return { ok: false, code: "restore_recent" };
  return { ok: true, target: { order, endsAt } };
}

/** The link for the order as it is held now: 48 hours, the tariff's end at the latest. */
export async function studioRestoreLink(
  secret: string,
  target: RestoreTarget,
  now = Date.now(),
): Promise<{ readonly url: string; readonly expiresAt: number }> {
  const expiresAt = Math.min(target.endsAt, now + STUDIO_RESTORE_LINK_MS);
  const token = `v1.${expiresAt}.${target.order.id}.${await mac(secret, target.order.id, target.order.user_id, expiresAt)}`;
  return { url: `${SITE}/api/studio/restore?t=${token}`, expiresAt };
}

/**
 * The order a token names, if the token is current, its signature matches
 * the order's present holder, and the order still holds a running tariff.
 */
export async function verifyStudioRestoreToken(
  store: StudioStore,
  secret: string,
  token: string,
  now = Date.now(),
): Promise<RestoreTarget | null> {
  const parts = STUDIO_RESTORE_TOKEN.exec(token);
  if (!parts || !secret) return null;
  const expires = Number(parts[1]);
  if (expires <= now) return null;
  const order = await store.byId(parts[2]);
  if (!order || order.state !== "paid") return null;
  const endsAt = runningEnd(await store.orderEntitlements(order.id), now);
  if (endsAt === null || expires > endsAt) return null;
  const expected = await mac(secret, order.id, order.user_id, expires);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0 ? { order, endsAt } : null;
}
