// The studio's funnel steps, counted on the server (spec §10.2): the same
// table as the chat's (gpt_ui_events, migrations/0068), with the studio's
// own closed lists. One row per event: a type and one qualifier, the
// browser's fresh id for the event (a request sent twice counts once), the
// tab's random id and the time. No text, no IP, no identity, no account:
// a row cannot be tied to a person or a topic.
import { STUDIO_ORG } from "./schema";

/** Every studio event type and the qualifiers it may carry (spec §10.2). */
export const STUDIO_UI_EVENTS = {
  /** The person submitted a tool's form. */
  studio_tool_started: ["presentation", "photo"],
  /** A result was shown in full. */
  studio_result_ready: ["free", "paid"],
  /** The tariffs section was shown: under a result, or at the free limit. */
  studio_tariffs_viewed: ["after_result", "limit"],
  studio_checkout_started: ["kunlik", "oylik"],
  /** How the payment the browser waited for ended. */
  studio_checkout_result: ["paid", "pending", "cancelled"],
} as const satisfies Record<string, readonly string[]>;

export type StudioEventType = keyof typeof STUDIO_UI_EVENTS;

/** Steps of a purchase: not counted while payments are off (nothing can be bought, so such a row is noise). */
export const STUDIO_PAYMENT_EVENTS: ReadonlySet<StudioEventType> = new Set<StudioEventType>([
  "studio_checkout_started",
  "studio_checkout_result",
]);

/** Events per address (hashed) and hour; past it the request is answered 204 and nothing is written. */
export const STUDIO_EVENTS_PER_HOUR = 60;
/** gpt_rate_limits action of the event counter. */
export const STUDIO_EVENT_RATE_ACTION = "studio_event";

export interface StudioEvent {
  /** The browser's id for this one event (a UUID). */
  readonly id: string;
  readonly type: StudioEventType;
  readonly detail: string;
  /** The tab's random id (a UUID), or null. */
  readonly viewId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isType(value: unknown): value is StudioEventType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STUDIO_UI_EVENTS, value);
}

/** The event in a request body {id, type, detail, viewId}, or null unless every field is well formed. Nothing else is read. */
export function parseStudioEvent(value: unknown): StudioEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { id, type, detail, viewId } = value as Record<string, unknown>;
  if (typeof id !== "string" || !UUID.test(id) || !isType(type)) return null;
  if (typeof detail !== "string" || !(STUDIO_UI_EVENTS[type] as readonly string[]).includes(detail)) return null;
  if (viewId !== undefined && viewId !== null && (typeof viewId !== "string" || !UUID.test(viewId))) return null;
  return { id, type, detail, viewId: typeof viewId === "string" ? viewId : null };
}

export class StudioEventStore {
  constructor(
    readonly db: D1Database,
    readonly org: string = STUDIO_ORG,
  ) {}

  /** Count one event; false when this id was counted before (a resent request). */
  async record(event: StudioEvent, now = Date.now()): Promise<boolean> {
    const result = await this.db
      .prepare("INSERT OR IGNORE INTO gpt_ui_events(org_id,id,type,view_id,detail,created_at) VALUES(?,?,?,?,?,?)")
      .bind(this.org, event.id, event.type, event.viewId, event.detail, now)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }
}
