// The pack window's funnel, counted on the server (plan WP-17): which button
// opened the window, sign-ins started and how they ended, checkouts started
// and how they ended. GA4 sees the same steps but misses everyone who blocks
// it; this table does not, and the admin (WP-19) counts from it. The chat's
// business line (plan WP-20) counts here too: shown and closed, by topic, so
// its false alarms can be read against the leads it brings (source chat_b2b).
// The trial's paywall (roadmap 2026-10-25 §5.2) adds the page role it showed
// on and the answer to «Nega hozir emas?»: closed lists, so no migration
// (the table has no CHECK on type or detail).
//
// One row per event: a type and one qualifier, both from closed lists, the
// browser tab's random id and the time. No text, no IP, no account and no
// chat session: a row cannot be tied to a person or a conversation. The id is
// the browser's, fresh per event, so a request sent twice counts once.
// gpt_ui_events comes from migrations/0068 (PAID_CHAT_DDL in billing-schema.ts).
//
// The checkout steps between the tap and the provider's page (chat CRO
// 2026-11-17, P1) carry one qualifier too, built only from closed lists
// (src/shared/checkout-events.ts): [reason.]provider.time.app.os, for example
// click.s1_3.telegram.android. The time is a bucket, the app and the system a
// class the browser computed: no user agent, order id or text is ever sent
// or kept, and the table keeps its columns.

import {
  ABORT_REASONS,
  CHECKOUT_APPS,
  CHECKOUT_BUCKETS,
  CHECKOUT_OS,
  CHECKOUT_PROVIDERS,
  RETURN_OUTCOMES,
  cross,
} from "../../../src/shared/checkout-events";

/** provider.time.app.os, every walk through the lists. */
const CHECKOUT_TAIL = cross(cross(cross(CHECKOUT_PROVIDERS, CHECKOUT_BUCKETS), CHECKOUT_APPS), CHECKOUT_OS);
/** A return from the provider's page may not know which provider it was (storage blocked). */
const RETURN_TAIL = cross(cross(cross([...CHECKOUT_PROVIDERS, "unknown"] as const, CHECKOUT_BUCKETS), CHECKOUT_APPS), CHECKOUT_OS);
const TRIAL_ROLES = ["general", "translator", "teacher", "smm", "marketer", "business", "writer"] as const;

/** Every event type and the qualifiers it may carry. */
export const UI_EVENTS = {
  /** The pack window opened; the qualifier is the button that opened it (PackFrom in the chat). */
  pack_viewed: [
    "header",
    "limit_card",
    "low_limit",
    "after_10",
    "after_value",
    "account_check",
    "login_failed",
    "login_resume",
    "pay_return",
  ],
  login_started: ["bot", "oidc"],
  /** The pack offered in the thread or in the trial's window; trial_last is the card at one trial answer left (Ш7). */
  pack_prompt_viewed: ["after_answer", "near_limit", "trial_exhausted", "trial_last"],
  pack_prompt_dismissed: ["after_answer", "near_limit", "trial_exhausted", "trial_last"],
  /**
   * The trial's paywall showed (once per owner); the qualifier is the page's
   * role (data-chat-role, CHAT_ROLE_PRESETS in src/shared/types.ts), or
   * general on the two main chats: which tool's visitors reach it.
   */
  trial_paywall_role: TRIAL_ROLES,
  /** «Nega hozir emas?» after the paywall closed without a payment: expensive, needed once, no card, later. */
  trial_exit_reason: ["price", "once", "no_card", "later"],
  login_result: ["done", "rejected", "expired", "failed"],
  /** A checkout began with this provider: its page opened, its app code showed, or a test order. */
  checkout_started: ["click", "uzum", "payme"],
  /** How the payment the browser waited for ended: paid, still pending after the wait, or cancelled. */
  checkout_result: ["paid", "pending", "cancelled"],
  /** The order exists: subscribe answered; the time is subscribe's. */
  checkout_created: CHECKOUT_TAIL,
  /** The browser did not keep the guest cookie (or could not tell); the time is the probe's. */
  checkout_probe_failed: CHECKOUT_TAIL,
  /** The checkout stopped before the provider's page: why, then provider.time.app.os; the time runs from the tap. */
  checkout_aborted: cross(ABORT_REASONS, CHECKOUT_TAIL),
  /** Immediately before the browser leaves for the provider's page; the time runs from the tap. */
  checkout_redirect: CHECKOUT_TAIL,
  /** Back from the provider's page with no payment (none) or with the order cancelled; the time is the trip's. */
  checkout_return_unpaid: cross(RETURN_OUTCOMES, RETURN_TAIL),
  /** An answer rated up or down on a page with this role (general on the main chats): the verdict and the role, no text. */
  answer_rating: (["up", "down"] as const).flatMap((verdict) => TRIAL_ROLES.map((role) => `${verdict}_${role}` as const)),
  /** The chat's business line showed under an answer; the qualifier is the topic (business-intent.ts): smm and uzum follow a ready text. */
  b2b_line_shown: ["bot", "site", "ads", "crm", "smm", "uzum"],
  /** The visitor closed it. */
  b2b_line_dismissed: ["bot", "site", "ads", "crm", "smm", "uzum"],
} as const satisfies Record<string, readonly string[]>;

export type UiEventType = keyof typeof UI_EVENTS;

/**
 * The pack window's steps: out of reach, and so not counted, while no payment
 * provider is offered (POST /api/gpt/event answers 404). The business line's
 * steps are counted whatever billing does.
 */
export const PACK_WINDOW_EVENTS: ReadonlySet<UiEventType> = new Set<UiEventType>([
  "pack_viewed",
  "pack_prompt_viewed",
  "pack_prompt_dismissed",
  "login_started",
  "login_result",
  "checkout_started",
  "checkout_result",
  "checkout_created",
  "checkout_probe_failed",
  "checkout_aborted",
  "checkout_redirect",
  "checkout_return_unpaid",
  // The trial's paywall shows only while a pack can be bought.
  "trial_paywall_role",
  "trial_exit_reason",
]);

export interface UiEvent {
  /** The browser's id for this one event (a UUID). */
  id: string;
  type: UiEventType;
  detail: string;
  /** The tab's random id (a UUID), or null. */
  view: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isType(value: unknown): value is UiEventType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(UI_EVENTS, value);
}

/**
 * The event in a request body, or null unless every field is well formed.
 * Only these four fields are read; anything else in the body is ignored.
 */
export function parseUiEvent(value: unknown): UiEvent | null {
  if (!value || typeof value !== "object") return null;
  const { id, type, detail, view } = value as Record<string, unknown>;
  if (typeof id !== "string" || !UUID.test(id) || !isType(type)) return null;
  if (typeof detail !== "string" || !(UI_EVENTS[type] as readonly string[]).includes(detail))
    return null;
  if (view !== undefined && view !== null && (typeof view !== "string" || !UUID.test(view)))
    return null;
  return { id, type, detail, view: typeof view === "string" ? view : null };
}

export class UiEventStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  /** Count one event; false when this id was counted before (a resent request). */
  async record(event: UiEvent, now = Date.now()): Promise<boolean> {
    const result = await this.db
      .prepare(
        "INSERT OR IGNORE INTO gpt_ui_events(org_id,id,type,view_id,detail,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(this.org, event.id, event.type, event.view, event.detail, now)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }
}
