// The budget a visitor may name on a lead form: one closed list for the page
// forms (scripts/lead-form.ts), the chat's lead form (AiLeadForm, lazy part
// chat-lead), the server (normalizeLeadBudget in
// functions/lib/gpt-chat/validate.ts, column gpt_leads.budget from
// migrations/0070) and the owner's alert (notify.ts). Optional everywhere: a
// form left at its empty option sends nothing and the lead is stored with
// budget NULL, which means "not asked or not said"; `unknown` is the visitor's
// own answer "I do not know yet".
import type { Locale } from './types';

export const LEAD_BUDGETS = ['lt1m', '1-2m', '2-5m', 'gt5m', 'unknown'] as const;
export type LeadBudget = (typeof LEAD_BUDGETS)[number];

/** What the select shows, in the order of LEAD_BUDGETS. Sums in so‘m, as on the price pages. */
export const LEAD_BUDGET_LABELS: Readonly<Record<Locale, Readonly<Record<LeadBudget, string>>>> = {
  ru: {
    lt1m: 'до 1 млн сум',
    '1-2m': '1–2 млн сум',
    '2-5m': '2–5 млн сум',
    gt5m: 'больше 5 млн сум',
    unknown: 'пока не знаю',
  },
  uz: {
    lt1m: '1 mln so‘mgacha',
    '1-2m': '1–2 mln so‘m',
    '2-5m': '2–5 mln so‘m',
    gt5m: '5 mln so‘mdan ko‘p',
    unknown: 'Hali bilmayman',
  },
};

/** The select's own label and its empty first option. */
export const LEAD_BUDGET_FIELD: Readonly<Record<Locale, { label: string; optional: string; empty: string }>> = {
  ru: { label: 'Бюджет', optional: '(необязательно)', empty: 'Не выбран' },
  uz: { label: 'Byudjet', optional: '(ixtiyoriy)', empty: 'Tanlanmagan' },
};

export function isLeadBudget(value: unknown): value is LeadBudget {
  return typeof value === 'string' && (LEAD_BUDGETS as readonly string[]).includes(value);
}
