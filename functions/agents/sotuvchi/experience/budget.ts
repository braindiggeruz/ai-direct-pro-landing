import { BuyerQueryValidationError } from '../buyer/errors';
import { CATALOG_LIMITS } from '../catalog';

export type BudgetParseResult =
  | { status: 'none' }
  | { status: 'explicit'; maxPriceMinor: number }
  | { status: 'ambiguous'; amountMinor: number };

const EXPLICIT_CUE =
  /(?:^|\s)(?:до|дешевле|максимум|макс|бюджет|byudjet|arzonroq|gacha|minggacha)(?:\s|$)/u;

function checkedAmount(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > CATALOG_LIMITS.priceMinor
  ) {
    throw new BuyerQueryValidationError();
  }
  return value;
}

function parseNumeric(raw: string): number {
  const compact = raw.replace(/[\s_]/g, '');
  if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) {
    return checkedAmount(Number(compact.replace(/\./g, '')));
  }
  if (!/^\d+$/.test(compact)) throw new BuyerQueryValidationError();
  return checkedAmount(Number(compact));
}

function parseAmount(raw: string, multiplier: number): number {
  return checkedAmount(parseNumeric(raw) * multiplier);
}

/**
 * Parses only UZS budget shapes. A number with no budget cue remains
 * ambiguous so a model number, year, quantity, size or power is never silently
 * converted into a price constraint.
 */
export function parseBudget(
  normalized: string,
  raw: string,
): BudgetParseResult {
  const value = normalized
    .replace(/\bming\s*gacha\b/gu, 'minggacha')
    .replace(/\bтыс\.?(?=\s|$)/gu, 'тысяч')
    .trim();

  if (/(?:^|\s)-\s*\d/u.test(raw) || /\d+[,.]\d{1,2}(?:\s|$)/u.test(raw)) {
    if (EXPLICIT_CUE.test(value)) throw new BuyerQueryValidationError();
    return { status: 'none' };
  }

  const suffix = /(?:^|\s)(\d(?:[\d\s.]*\d)?)\s*(k|к|ming|minggacha|тысяч|тысячи|тысяча)(?:\s|$)/u
    .exec(value);
  if (suffix) {
    const amount = parseAmount(suffix[1], 1_000);
    return { status: 'explicit', maxPriceMinor: amount };
  }

  const digits = /(?:^|\s)(\d(?:[\d\s.]*\d)?)(?:\s|$)/u.exec(value);
  if (!digits) return { status: 'none' };

  const amount = parseNumeric(digits[1]);
  if (EXPLICIT_CUE.test(value)) {
    return { status: 'explicit', maxPriceMinor: amount };
  }
  if (/^\d(?:[\d\s.]*\d)?$/u.test(value)) {
    return { status: 'ambiguous', amountMinor: amount };
  }
  return { status: 'none' };
}
