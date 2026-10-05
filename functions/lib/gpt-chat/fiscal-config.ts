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
//
// Who prints a Click receipt (clickFiscalPolicy). On 2026-10-05 Click set up
// OFD for our service on its side, from our letter, and may now print the
// receipt of every payment itself; it has not said whether it does. Two
// receipts for one payment, or none, are both wrong, so:
//   GPT_CLICK_AUTOFISCAL     "true": Click prints them; we only read the link
//                            (ofd_data) and never send our receipt line;
//                            "false": we send ours right after the payment,
//                            as before 2026-10-05;
//                            "" or anything else: check first. We look for
//                            Click's link right after the payment and send
//                            ours only when there is still none after the
//                            delay, checking once more right before.
//   GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES  that delay, counted from the
//                            payment: whole minutes 0..1440 (more is 1440),
//                            10 when empty or malformed.
// These two fall back to the safe default instead of failing closed: the
// check-first path never sends a receipt blindly and never leaves one unsent.

import { OFD_RECEIPT_HOST, receiptHost } from "../../../src/shared/payment-hosts";

export interface FiscalEnv {
  GPT_FISCAL_IKPU?: string;
  GPT_FISCAL_PACKAGE_CODE?: string;
  GPT_FISCAL_VAT_PERCENT?: string;
  GPT_FISCAL_TIN?: string;
  GPT_CLICK_AUTOFISCAL?: string;
  GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES?: string;
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
 * auto: only Click's own receipt (read its link); submit: ours at once;
 * check: Click's first, ours after the delay when Click has none.
 */
export type ClickFiscalMode = "auto" | "submit" | "check";
export interface ClickFiscalPolicy {
  mode: ClickFiscalMode;
  /** From the payment to the earliest submit of ours (check mode). */
  delayMs: number;
}
export const CLICK_FISCAL_DELAY_MINUTES = 10;
const MAX_CLICK_FISCAL_DELAY_MINUTES = 1440;

/** GPT_CLICK_AUTOFISCAL and GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES, read the safe way. */
export function clickFiscalPolicy(env: FiscalEnv): ClickFiscalPolicy {
  const flag = (env.GPT_CLICK_AUTOFISCAL ?? "").trim().toLowerCase();
  const minutes = (env.GPT_CLICK_FISCAL_SUBMIT_DELAY_MINUTES ?? "").trim();
  return {
    mode: flag === "true" ? "auto" : flag === "false" ? "submit" : "check",
    delayMs:
      Math.min(
        /^\d{1,6}$/.test(minutes) ? Number(minutes) : CLICK_FISCAL_DELAY_MINUTES,
        MAX_CLICK_FISCAL_DELAY_MINUTES,
      ) * 60_000,
  };
}

/**
 * The VAT inside a VAT-inclusive amount, in the amount's own unit (tiyin),
 * rounded half up: 2 000 000 tiyin at 12 % carries 214 286 tiyin of VAT.
 */
export function includedVat(amount: number, percent: number): number {
  return Math.round((amount * percent) / (100 + percent));
}


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
  return url?.hostname === OFD_RECEIPT_HOST ? url.href : null;
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
 * Uzum host (src/shared/payment-hosts.ts, the rule the panel applies too).
 * Anything else stays in D1 and never reaches the page.
 */
export function receiptLink(value: unknown): string | null {
  const url = httpsLink(value);
  return url && receiptHost(url.hostname) ? url.href : null;
}
