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
  };
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
      pageUrl: clean(input.pageUrl),
    },
  };
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, 500) : null;
}
