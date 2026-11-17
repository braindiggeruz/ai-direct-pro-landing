// The packs the chat sells (owner's order of 2026-11-17): the monthly AI pack
// and the 3-day one. One closed list. The money, the size and the term of an
// order come from this list when the order is made and from the order's own
// row afterwards: never from a request, a link or a constant at the place of use.
//
// Where the orders live. gpt_payment_orders accepts one sum only (its CHECK is
// fixed at 2 000 000 tiyin, migrations/0064), so the 3-day pack's orders live in
// a sibling table, gpt_payment_orders_v2 (migrations/0085), under their own id
// prefix. An order's table and pack are read from its id, the way stu_ and
// uzm_ ids are routed. The monthly pack keeps its table and its pay_ ids.
import {
  addCalendarMonth,
  PAID_MESSAGES,
  PLAN_ID,
  PRICE_TIYIN,
  type BillingEnv,
  type BillingMode,
} from "./billing-config";
import { PACK_RECEIPT_NAME } from "./fiscal-config";

export type PackSku = "month" | "once";

/** The table of the 3-day pack's orders (migrations/0085). */
export const ONCE_ORDERS = "gpt_payment_orders_v2";
/** Their ids: pk_ and 32 hex, 35 characters (Click's transaction_param and Payme's account take them). */
export const ONCE_PREFIX = "pk_";

export interface Pack {
  sku: PackSku;
  /** The price in tiyin: what the order row holds and what the provider is asked for. */
  amountTiyin: number;
  /** Answers in the pack. */
  answers: number;
  /** How long it runs from the payment: one calendar month, or whole hours. */
  term: { months: 1 } | { hours: number };
  /** gpt_subscriptions.plan */
  planId: string;
  /** The receipt line (Click Name, Payme title): a service, at most 63 characters. */
  receiptName: string;
}

export const PACKS: Readonly<Record<PackSku, Readonly<Pack>>> = Object.freeze({
  month: Object.freeze({
    sku: "month",
    amountTiyin: PRICE_TIYIN,
    answers: PAID_MESSAGES,
    term: { months: 1 },
    planId: PLAN_ID,
    receiptName: PACK_RECEIPT_NAME,
  } as const),
  once: Object.freeze({
    sku: "once",
    amountTiyin: 500_000,
    answers: 30,
    term: { hours: 72 },
    planId: "ai_paket_once",
    receiptName: "AI paket 30 (xizmat, 3 kun)",
  } as const),
});

/** The pack a request names; null for anything but the two skus (an absent sku is the monthly pack, at the caller). */
export function packBySku(value: unknown): Pack | null {
  return value === "month" || value === "once" ? PACKS[value] : null;
}

/** An order of the 3-day pack, by its id. */
export function isOnceOrder(id: string): boolean {
  return id.startsWith(ONCE_PREFIX);
}

/** The pack an order bought, by its id: pk_ is the 3-day pack, every other chat order the monthly one. */
export function packOfOrder(id: string): Pack {
  return isOnceOrder(id) ? PACKS.once : PACKS.month;
}

/** When a pack paid at `paidAt` ends. */
export function packEnd(pack: Pack, paidAt: number): number {
  return "hours" in pack.term ? paidAt + pack.term.hours * 3_600_000 : addCalendarMonth(paidAt);
}

/** The longest a pack of this kind runs, in ms (the account view's «ends soon»): a calendar month is at most 31 days. */
export function packSpanMs(pack: Pack): number {
  return "hours" in pack.term ? pack.term.hours * 3_600_000 : 31 * 86_400_000;
}

/**
 * GPT_PACK_ONCE: "live" sells the 3-day pack to everyone, "test" only inside a
 * rehearsal session (a test order), anything else, the absent value included,
 * to nobody. The switch only opens new sales: an order already made is
 * finished by the callbacks whatever it says.
 */
export function oncePackMode(env: Pick<BillingEnv, "GPT_PACK_ONCE">): "live" | "test" | null {
  const value = (env.GPT_PACK_ONCE || "").trim();
  return value === "live" || value === "test" ? value : null;
}

/** The packs a visitor of this mode (rehearsal.ts viewerMode) is offered, the monthly one first. */
export function offeredPacks(env: Pick<BillingEnv, "GPT_PACK_ONCE">, viewer: BillingMode): Pack[] {
  const once = oncePackMode(env);
  return once === "live" || (once === "test" && viewer === "test") ? [PACKS.month, PACKS.once] : [PACKS.month];
}
