// Input validation for the AI-chat endpoints. Pure — unit-tested.
import type { Locale } from '../../../src/shared/types';

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
  };
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

  const phone = clean(input.phone);
  const telegram = clean(input.telegram);
  const email = clean(input.email);
  let contactType = clean(input.contactType) || '';
  let contactValue = clean(input.contactValue) || '';

  if (!contactValue) {
    if (phone) { contactType = 'phone'; contactValue = phone; }
    else if (telegram) { contactType = 'telegram'; contactValue = telegram; }
    else if (email) { contactType = 'email'; contactValue = email; }
  }
  if (!contactValue) return { ok: false, error: 'at least one contact is required' };
  if (contactValue.length > 200) return { ok: false, error: 'contact too long' };

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
    },
  };
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, 500) : null;
}
