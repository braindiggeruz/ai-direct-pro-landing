// The pack window's funnel, counted on the server (plan WP-17): which button
// opened the window, sign-ins started and how they ended, checkouts started
// and how they ended. GA4 sees the same steps but misses everyone who blocks
// it; this table does not, and the admin (WP-19) counts from it. The chat's
// business line (plan WP-20) counts here too: shown and closed, by topic, so
// its false alarms can be read against the leads it brings (source chat_b2b).
//
// One row per event: a type and one qualifier, both from closed lists, the
// browser tab's random id and the time. No text, no IP, no account and no
// chat session: a row cannot be tied to a person or a conversation. The id is
// the browser's, fresh per event, so a request sent twice counts once.
// gpt_ui_events comes from migrations/0068 (PAID_CHAT_DDL in billing-schema.ts).

/** Every event type and the qualifiers it may carry. */
export const UI_EVENTS = {
  /** The pack window opened; the qualifier is the button that opened it (PackFrom in the chat). */
  pack_viewed: [
    "header",
    "limit_card",
    "low_limit",
    "after_10",
    "account_check",
    "login_failed",
    "login_resume",
    "pay_return",
  ],
  login_started: ["bot", "oidc"],
  login_result: ["done", "rejected", "expired", "failed"],
  /** A checkout began with this provider: its page opened, its app code showed, or a test order. */
  checkout_started: ["click", "uzum", "payme"],
  /** How the payment the browser waited for ended: paid, still pending after the wait, or cancelled. */
  checkout_result: ["paid", "pending", "cancelled"],
  /** The chat's business line showed under a first answer; the qualifier is the topic (business-intent.ts). */
  b2b_line_shown: ["bot", "site", "ads", "crm"],
  /** The visitor closed it. */
  b2b_line_dismissed: ["bot", "site", "ads", "crm"],
} as const satisfies Record<string, readonly string[]>;

export type UiEventType = keyof typeof UI_EVENTS;

/**
 * The pack window's steps: out of reach, and so not counted, while no payment
 * provider is offered (POST /api/gpt/event answers 404). The business line's
 * steps are counted whatever billing does.
 */
export const PACK_WINDOW_EVENTS: ReadonlySet<UiEventType> = new Set<UiEventType>([
  "pack_viewed",
  "login_started",
  "login_result",
  "checkout_started",
  "checkout_result",
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
