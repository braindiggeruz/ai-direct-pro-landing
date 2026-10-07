// Where a studio buyer came from, as the order keeps it (spec §10.1).
//
// The island sends, with an order the person chose to place, what its
// browser holds (apps/studio/src/attribution.ts): the last PAID touch
// (gptbot_studio_lt_v1: gclid, gbraid, wbraid, yclid, utm_*, the landing
// path, its time), the site's first touch (gptbot_ft_v1, written by
// FIRST_TOUCH_SCRIPT) and the analytics ids of the site's own tags (GA4
// client and session, Metrika). None of it is trusted: every value is
// cleaned here again by the lead rules (functions/lib/gpt-chat/validate.ts:
// click ids ^[A-Za-z0-9._-]{1,200}$, UTM values of 1–100 printable
// characters, a path without its query, a referrer host only). A value that
// does not fit is dropped, never clipped: a clipped id is wrong data.
//
// The order keeps the last paid touch; when there is none, the first touch
// (`touch` says which). The referrer host and the first-seen time are the
// first touch's own. fbclid is never kept (Meta is not used, R-B12).
//
// Pseudonymous data, named in the privacy policy (DECISIONS §5(е, ж)): never
// a name, phone, e-mail or IP, and wiped from the order after 93 days
// (attrib_purged_at, the maintenance tick).
import { normalizePagePath, sanitizeLeadAttribution } from "../gpt-chat/validate";

export interface OrderAttribution {
  readonly touch: "last" | "first" | null;
  readonly gclid: string | null;
  readonly gbraid: string | null;
  readonly wbraid: string | null;
  readonly yclid: string | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly utmTerm: string | null;
  readonly utmContent: string | null;
  /** A path on the site without its query, ≤ 200 characters. */
  readonly landingPath: string | null;
  readonly referrerHost: string | null;
  /** ISO time of the first visit. */
  readonly firstSeenAt: string | null;
  /** "<random>.<timestamp>" of _ga. */
  readonly gaClientId: string | null;
  /** The GA4 session id of _ga_<measurement id>. */
  readonly gaSessionId: string | null;
  /** _ym_uid. */
  readonly ymClientId: string | null;
}

const CLICK_ID = /^[A-Za-z0-9._-]{1,200}$/;
/** UTM values: printable, no control characters, 1–100 characters. */
const UTM_VALUE = /^[^\u0000-\u001f\u007f]{1,100}$/;
const GA_CLIENT_ID = /^\d{1,20}\.\d{1,20}$/;
const GA_SESSION_ID = /^\d{1,20}$/;
const YM_CLIENT_ID = /^\d{1,30}$/;

const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "yclid"] as const;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

type ClickKey = (typeof CLICK_KEYS)[number];
type UtmKey = (typeof UTM_KEYS)[number];
type Touch = Partial<Record<ClickKey | UtmKey, string>> & { landing?: string };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function matching(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return pattern.test(text) ? text : null;
}

/** The click ids, UTM tags and landing path of one stored touch, cleaned; null when nothing survives. */
function cleanTouch(raw: Record<string, unknown> | null): Touch | null {
  if (!raw) return null;
  const touch: Touch = {};
  for (const key of CLICK_KEYS) {
    const id = matching(raw[key], CLICK_ID);
    if (id) touch[key] = id;
  }
  for (const key of UTM_KEYS) {
    const value = matching(raw[key], UTM_VALUE);
    if (value) touch[key] = value;
  }
  const landing = normalizePagePath(raw.landing);
  if (landing) touch.landing = landing;
  return Object.keys(touch).length ? touch : null;
}

/** A touch says where the person came from: a click id or a UTM tag. */
const tagged = (touch: Touch | null): touch is Touch =>
  !!touch && [...CLICK_KEYS, ...UTM_KEYS].some((key) => key in touch);

/**
 * The order's attribution from the checkout body's `attribution: {last,
 * first}`, `ga: {clientId, sessionId}` and `ym: {clientId}`. Anything
 * malformed is left out; null when nothing at all survives.
 */
export function orderAttribution(body: { readonly attribution?: unknown; readonly ga?: unknown; readonly ym?: unknown }): OrderAttribution | null {
  const sources = record(body.attribution);
  const lastRaw = record(sources?.last);
  const firstRaw = record(sources?.first);
  const last = cleanTouch(lastRaw);
  // The first touch through the lead rules (landing, referrer host, gclid,
  // yclid, first-seen time; fbclid falls away below), and its UTM tags.
  const lead = sanitizeLeadAttribution(firstRaw);
  const first = cleanTouch(firstRaw);
  const chosen: { touch: "last" | "first"; values: Touch } | null = tagged(last)
    ? { touch: "last", values: last }
    : tagged(first)
      ? { touch: "first", values: first }
      : null;
  const ga = record(body.ga);
  const ym = record(body.ym);
  const values = chosen?.values ?? {};
  const result: OrderAttribution = {
    touch: chosen?.touch ?? null,
    gclid: values.gclid ?? null,
    gbraid: values.gbraid ?? null,
    wbraid: values.wbraid ?? null,
    yclid: values.yclid ?? null,
    utmSource: values.utm_source ?? null,
    utmMedium: values.utm_medium ?? null,
    utmCampaign: values.utm_campaign ?? null,
    utmTerm: values.utm_term ?? null,
    utmContent: values.utm_content ?? null,
    landingPath: values.landing ?? lead?.landing ?? last?.landing ?? null,
    referrerHost: lead?.referrerHost ?? null,
    firstSeenAt: lead?.firstSeenAt ?? null,
    gaClientId: matching(ga?.clientId, GA_CLIENT_ID),
    gaSessionId: matching(ga?.sessionId, GA_SESSION_ID),
    ymClientId: matching(ym?.clientId, YM_CLIENT_ID),
  };
  return Object.values(result).some((value) => value !== null) ? result : null;
}
