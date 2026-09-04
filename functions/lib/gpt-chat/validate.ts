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
  };
}

const TELEGRAM_HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]{1,190}\.[^\s@]{2,63}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,80}$/;

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const compact = raw.replace(/^tel:/i, '').replace(/\u00a0/g, ' ').trim();
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
      const candidates = [
        ['phone', normalizePhone(explicit)],
        ['telegram', normalizeTelegram(explicit)],
        ['email', normalizeEmail(explicit)],
      ] as const;
      const detected = candidates.find(([, value]) => !!value);
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
      utmJson: input.utm && typeof input.utm === 'object' ? JSON.stringify(input.utm).slice(0, 2000) : null,
      pageUrl: normalizePagePath(input.pageUrl),
      shareConversation: input.shareConversation === true,
      requestId,
    },
  };
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, 500) : null;
}
