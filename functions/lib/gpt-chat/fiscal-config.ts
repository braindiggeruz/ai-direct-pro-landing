// Fiscal receipt parameters of the AI pack, shared by every provider that
// prints a receipt (Click ofd_data, Uzum Checkout auto-fiscalization, the
// Uzum Fiscalization API): one set of public settings, validated here once.
//
//   GPT_FISCAL_IKPU          the 17-digit product code (IKPU/MXIK) from
//                            tasnif.soliq.uz
//   GPT_FISCAL_PACKAGE_CODE  its package code, the code and not its name
//                            (1514296 is "услуга (раз)")
//   GPT_FISCAL_VAT_PERCENT   the VAT rate, 0..100. The price INCLUDES the VAT:
//                            20 000 сум at 12 % carries 20 000 * 12 / 112 VAT.
//   GPT_FISCAL_TIN           the seller's TIN (9 digits) or PINFL (14 digits)
//
// Everything fails closed: a missing or malformed value is reported by name
// and never replaced by a default. The hosts a printed receipt may link to
// are named here too (ofdReceiptLink, receiptLink).

export interface FiscalEnv {
  GPT_FISCAL_IKPU?: string;
  GPT_FISCAL_PACKAGE_CODE?: string;
  GPT_FISCAL_VAT_PERCENT?: string;
  GPT_FISCAL_TIN?: string;
}

/**
 * The receipt line of the pack (decision L16): the AI pack, a service, one
 * month; at most 63 characters (Click Name, Uzum product_name).
 */
export const PACK_RECEIPT_NAME = "AI paket 300 (xizmat, 1 oy)";

/** What a receipt line needs; the TIN is read on its own (fiscalTin). */
export interface FiscalParams {
  ikpu: string;
  packageCode: string;
  vatPercent: number;
}

const IKPU = /^\d{17}$/;
const PACKAGE_CODE = /^[A-Za-z0-9]{1,20}$/;
const VAT_PERCENT = /^\d{1,3}$/;
const TIN = /^(?:\d{9}|\d{14})$/;

function vatPercent(env: FiscalEnv): number | null {
  const value = env.GPT_FISCAL_VAT_PERCENT || "";
  return VAT_PERCENT.test(value) && Number(value) <= 100 ? Number(value) : null;
}

/** The receipt line's codes and VAT rate, or null while any is missing or invalid. */
export function fiscalParams(env: FiscalEnv): FiscalParams | null {
  const ikpu = env.GPT_FISCAL_IKPU || "";
  const packageCode = env.GPT_FISCAL_PACKAGE_CODE || "";
  const vat = vatPercent(env);
  if (!IKPU.test(ikpu) || !PACKAGE_CODE.test(packageCode) || vat === null)
    return null;
  return { ikpu, packageCode, vatPercent: vat };
}

/** The seller's TIN or PINFL, or null. */
export function fiscalTin(env: FiscalEnv): string | null {
  const value = env.GPT_FISCAL_TIN || "";
  return TIN.test(value) ? value : null;
}

/**
 * Names of the fiscal settings that are missing or invalid. `tin` adds
 * GPT_FISCAL_TIN, which only the Click receipt carries (CommissionInfo).
 */
export function fiscalIssues(env: FiscalEnv, options: { tin: boolean }): string[] {
  const issues: string[] = [];
  if (!IKPU.test(env.GPT_FISCAL_IKPU || "")) issues.push("GPT_FISCAL_IKPU");
  if (!PACKAGE_CODE.test(env.GPT_FISCAL_PACKAGE_CODE || ""))
    issues.push("GPT_FISCAL_PACKAGE_CODE");
  if (vatPercent(env) === null) issues.push("GPT_FISCAL_VAT_PERCENT");
  if (options.tin && !fiscalTin(env)) issues.push("GPT_FISCAL_TIN");
  return issues;
}

/**
 * The VAT inside a VAT-inclusive amount, in the amount's own unit (tiyin),
 * rounded half up: 2 000 000 tiyin at 12 % carries 214 286 tiyin of VAT.
 */
export function includedVat(amount: number, percent: number): number {
  return Math.round((amount * percent) / (100 + percent));
}

/** The tax authority's receipt page: Click, Payme and Uzum receipts link here. */
const OFD_HOST = "ofd.soliq.uz";
/** Uzum's own domains, where an Uzum receipt may live as well (uzum-config.ts). */
const UZUM_RECEIPT_HOST = /(^|\.)(uzumbank\.uz|uzumcheckout\.uz|uzum\.uz)$/;

function httpsLink(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      ? url
      : null;
  } catch {
    return null;
  }
}

/** A receipt link on the tax authority's own host, or null (the Click receipt). */
export function ofdReceiptLink(value: unknown): string | null {
  const url = httpsLink(value);
  return url?.hostname === OFD_HOST ? url.href : null;
}

/**
 * A test receipt's link: any https link without credentials or port. The
 * test Fiscalization host's link format is not documented; the panel still
 * shows only what receiptLink() allows.
 */
export function testReceiptLink(value: unknown): string | null {
  return httpsLink(value)?.href ?? null;
}

/**
 * A receipt link the account panel may show: https on ofd.soliq.uz or on an
 * Uzum host. Anything else stays in D1 and never reaches the page.
 */
export function receiptLink(value: unknown): string | null {
  const url = httpsLink(value);
  return url && (url.hostname === OFD_HOST || UZUM_RECEIPT_HOST.test(url.hostname))
    ? url.href
    : null;
}
