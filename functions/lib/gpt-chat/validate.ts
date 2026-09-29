// Input validation for the AI-chat endpoints. Pure — unit-tested.
import type { Locale } from '../../../src/shared/types';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function normLocale(v: unknown): Locale {
  return v === 'uz' ? 'uz' : 'ru';
}

export interface MessageValidation {
  ok: boolean;
  value?: string;
  error?: string;
}

export function validateMessage(raw: unknown, maxChars: number): MessageValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'message must be a string' };
  const value = raw.trim();
  if (!value) return { ok: false, error: 'message is empty' };
  if (value.length > maxChars) return { ok: false, error: `message exceeds ${maxChars} chars` };
  return { ok: true, value };
}

export interface LeadInput {
  name?: string;
  contactType?: string;
  contactValue?: string;
  phone?: string;
  telegram?: string;
  email?: string;
  intent?: string;
  needType?: string;
  sessionId?: string;
  consent?: boolean;
  /**
   * A SECOND, separate consent: may the conversation itself be forwarded to
   * the studio along with the contact? Absent or false means the owner's
   * Telegram alert carries the contact only. It is deliberately not implied
   * by `consent`, because the sentence next to that box promises one thing
   * (we may contact you) and this promises another (we may read what you
   * wrote). Only the lead form's own consent line may set it.
   */
  shareConversation?: boolean;
  utm?: Record<string, unknown>;
  pageUrl?: string;
  /** Client-generated idempotency key. Stable across safe retries. */
  requestId?: string;
  /** Single-use challenge token, verified and discarded at the edge. */
  turnstileToken?: string;
  /**
   * Which surface produced the lead. Whitelisted by `normalizeLeadSource`;
   * anything else, or nothing, is the AI chat — the endpoint's original caller.
   */
  source?: string;
  /** Service slug the visitor asked about (e.g. `telegram-bot`). */
  service?: string;
  /**
   * First-touch attribution recorded by the browser. Strictly sanitised by
   * `sanitizeLeadAttribution`; unknown keys are dropped. Never carries PII.
   */
  attribution?: Record<string, unknown>;
}

export const LEAD_SOURCES = ['gpt_chat', 'calculator', 'page_form'] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

/** The sanitised first-touch record stored under utm_json.attribution. */
export interface LeadAttribution {
  landing?: string;
  referrerHost?: string;
  gclid?: string;
  yclid?: string;
  fbclid?: string;
  firstSeenAt?: string;
}

export interface LeadValidation {
  ok: boolean;
  error?: string;
  value?: {
    name: string | null;
    contactType: string;
    contactValue: string;
    phone: string | null;
    telegram: string | null;
    intent: string | null;
    sessionId: string | null;
    utmJson: string | null;
    pageUrl: string | null;
    shareConversation: boolean;
    requestId: string | null;
    source: LeadSource;
    service: string | null;
    attribution: LeadAttribution | null;
  };
}

const TELEGRAM_HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]{1,190}\.[^\s@]{2,63}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,80}$/;
/**
 * What a typed phone number looks like: digits with an optional leading +,
 * spaces, brackets, dots and dashes. Nothing else. Without this gate the digit
 * extraction below turned '@aziz901234567', 'aziz901234567@gmail.com' or
 * 't.me/aziz901234567' into +998901234567 \u2014 a number the visitor never gave,
 * which may belong to someone else.
 */
const PHONE_SHAPE_RE = /^\+?[\d\s().\-\u2010-\u2015]+$/;
/** A Telegram contact announces itself: a leading @ or a t.me link. */
const TELEGRAM_SHAPE_RE = /^(?:@|(?:https?:\/\/)?t\.me\/)/i;

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const compact = raw.replace(/^tel:/i, '').replace(/\u00a0/g, ' ').trim();
  if (!PHONE_SHAPE_RE.test(compact)) return null;
  const digits = compact.replace(/\D/g, '');
  const withCountry = digits.length === 9
    ? `+998${digits}`
    : digits.length === 12 && digits.startsWith('998')
      ? `+${digits}`
      : compact;
  const parsed = parsePhoneNumberFromString(withCountry, 'UZ');
  return parsed?.isValid() ? parsed.number : null;
}

function normalizeTelegram(raw: string | null): string | null {
  if (!raw) return null;
  const handle = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@/, '')
    .trim();
  return TELEGRAM_HANDLE_RE.test(handle) ? `@${handle}` : null;
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  return value.length <= 254 && EMAIL_RE.test(value) ? value : null;
}

function normalizeTypedContact(type: string, raw: string | null): string | null {
  if (type === 'phone') return normalizePhone(raw);
  if (type === 'telegram') return normalizeTelegram(raw);
  if (type === 'email') return normalizeEmail(raw);
  return null;
}

/**
 * One untyped contact field (the calculator and the page form send no
 * contactType). Route by shape, and try exactly one parser: a leading @ or a
 * t.me link is Telegram, any other @ is e-mail, digits-and-punctuation is a
 * phone, and whatever is left can only be a bare Telegram handle. A value that
 * fails its parser is rejected, never re-read as a different kind of contact.
 */
function detectContact(raw: string): readonly [string, string] | null {
  const value = raw.replace(/\u00a0/g, ' ').trim();
  const [type, normalize] = TELEGRAM_SHAPE_RE.test(value)
    ? ['telegram', normalizeTelegram] as const
    : value.includes('@')
      ? ['email', normalizeEmail] as const
      : PHONE_SHAPE_RE.test(value.replace(/^tel:/i, '').trim())
        ? ['phone', normalizePhone] as const
        : ['telegram', normalizeTelegram] as const;
  const normalized = normalize(value);
  return normalized ? [type, normalized] as const : null;
}

/**
 * Keep the stored page to a same-site PATH. A full URL from an untrusted body
 * can carry a query string with personal data into a database row and from
 * there into a Telegram message, and an absolute off-site URL in an owner
 * alert is a link the owner might tap. Anything else becomes null.
 */
export function normalizePagePath(v: unknown): string | null {
  const raw = clean(v);
  if (!raw) return null;
  let path = raw;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path.slice(0, 200);
}

const SERVICE_RE = /^[a-z0-9-]{1,60}$/;
const REFERRER_HOST_RE = /^[a-z0-9.-]{1,100}$/;
const CLICK_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Whitelisted lead source; anything else (or nothing) is the AI chat. */
export function normalizeLeadSource(v: unknown): LeadSource {
  return typeof v === 'string' && (LEAD_SOURCES as readonly string[]).includes(v)
    ? v as LeadSource
    : 'gpt_chat';
}

/** A lowercase slug such as `telegram-bot`; anything else is dropped. */
export function normalizeLeadService(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const value = v.trim();
  return SERVICE_RE.test(value) ? value : null;
}

function matchOrNull(v: unknown, re: RegExp): string | null {
  if (typeof v !== 'string') return null;
  const value = v.trim();
  return re.test(value) ? value : null;
}

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const value = v.trim();
  if (value.length > 40 || !ISO_DATE_RE.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * Keep only the known first-touch keys, each in a strict shape. A value that
 * does not fit is dropped rather than truncated: a clipped click id or host is
 * wrong data, not partial data. Returns null when nothing survives.
 */
export function sanitizeLeadAttribution(v: unknown): LeadAttribution | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  const out: LeadAttribution = {};
  const landing = normalizePagePath(raw.landing);
  if (landing) out.landing = landing;
  const referrerHost = typeof raw.referrerHost === 'string'
    ? matchOrNull(raw.referrerHost.toLowerCase(), REFERRER_HOST_RE)
    : null;
  if (referrerHost) out.referrerHost = referrerHost;
  for (const key of ['gclid', 'yclid', 'fbclid'] as const) {
    const id = matchOrNull(raw[key], CLICK_ID_RE);
    if (id) out[key] = id;
  }
  const firstSeenAt = isoDateOrNull(raw.firstSeenAt);
  if (firstSeenAt) out.firstSeenAt = firstSeenAt;
  return Object.keys(out).length ? out : null;
}

const MAX_UTM_JSON_CHARS = 2000;

/**
 * The stored utm_json. Without service/attribution it is byte-for-byte what it
 * always was. With them, they are added under one "attribution" key so they
 * can never replace a utm key the client sent; if the client already used that
 * key, or the merge would not fit the column budget, the legacy form wins.
 */
export function buildLeadUtmJson(
  utm: unknown,
  service: string | null,
  attribution: LeadAttribution | null,
): string | null {
  const base = utm && typeof utm === 'object' ? utm : null;
  const legacy = base ? JSON.stringify(base).slice(0, MAX_UTM_JSON_CHARS) : null;
  const extra: Record<string, string> = {
    ...(service ? { service } : {}),
    ...(attribution ?? {}),
  };
  if (!Object.keys(extra).length) return legacy;
  if (Array.isArray(base)) return legacy;
  if (base && Object.prototype.hasOwnProperty.call(base, 'attribution')) return legacy;
  const merged = JSON.stringify({ ...((base ?? {}) as Record<string, unknown>), attribution: extra });
  return merged.length <= MAX_UTM_JSON_CHARS ? merged : legacy;
}

/**
 * A lead needs consent + at least one reachable contact (phone, telegram,
 * email, or an explicit contactValue). Keeps the softwall honest without
 * demanding every field.
 */
export function validateLead(input: LeadInput): LeadValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid body' };
  if (input.consent !== true) return { ok: false, error: 'consent required' };

  const rawPhone = clean(input.phone);
  const rawTelegram = clean(input.telegram);
  const rawEmail = clean(input.email);
  const phone = normalizePhone(rawPhone);
  const telegram = normalizeTelegram(rawTelegram);
  const email = normalizeEmail(rawEmail);
  let contactType = clean(input.contactType) || '';
  const explicit = clean(input.contactValue);
  let contactValue: string | null = null;

  if (explicit) {
    if (contactType) {
      contactValue = normalizeTypedContact(contactType, explicit);
      if (!contactValue) return { ok: false, error: 'contact does not match contactType' };
    } else {
      const detected = detectContact(explicit);
      if (detected) [contactType, contactValue] = detected;
    }
  } else {
    if (phone) { contactType = 'phone'; contactValue = phone; }
    else if (telegram) { contactType = 'telegram'; contactValue = telegram; }
    else if (email) { contactType = 'email'; contactValue = email; }
  }
  if (!contactValue) return { ok: false, error: 'at least one contact is required' };

  const requestId = clean(input.requestId);
  if (requestId && !REQUEST_ID_RE.test(requestId)) return { ok: false, error: 'invalid requestId' };

  const service = normalizeLeadService(input.service);
  const attribution = sanitizeLeadAttribution(input.attribution);

  return {
    ok: true,
    value: {
      name: clean(input.name),
      contactType: contactType || 'unknown',
      contactValue,
      phone,
      telegram,
      intent: clean(input.intent) || clean(input.needType),
      sessionId: clean(input.sessionId),
      utmJson: buildLeadUtmJson(input.utm, service, attribution),
      pageUrl: normalizePagePath(input.pageUrl),
      shareConversation: input.shareConversation === true,
      requestId,
      source: normalizeLeadSource(input.source),
      service,
      attribution,
    },
  };
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, 500) : null;
}
