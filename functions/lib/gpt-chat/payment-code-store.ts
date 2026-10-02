// Permanent payment codes for the Uzum Bank app (Merchant API, plan WP-15
// U1). A visitor who chose Uzum on the site gets one code for good: nine
// digits, the last one a Luhn check digit, so a typo in the app is caught
// before any account is looked up. The payer enters it in the Uzum Bank app
// (Payments -> gptbot.uz); Uzum sends it to /api/payments/uzum-merchant/check
// and /create as params.account, and /create opens the order on the fly.
//
// The row keeps the terms the account's owner accepted when the site showed
// the code (version, link, language, time): /create copies them into the
// order's consent, as the site does for every other order. When the offer
// changes, the code stops working until its owner accepts the new terms on
// the site; the code itself never changes. No phone, name or Telegram data.
// gpt_payment_codes comes from migrations/0068 (billing-schema.ts).

/** 8 digits that do not start with 0, then the Luhn check digit. */
const CODE = /^[1-9]\d{8}$/;
const BODY_MIN = 10_000_000;
const BODY_SPAN = 90_000_000;
/** A fresh code collides with an issued one about never; this bounds the loop. */
const ISSUE_ATTEMPTS = 5;

export interface PaymentCodeConsent {
  version: string;
  url: string;
  locale: "ru" | "uz";
}
export interface PaymentCodeRow {
  code: string;
  user_id: string;
  created_at: number;
  terms_version: string | null;
  terms_url: string | null;
  terms_locale: string | null;
  terms_accepted_at: number | null;
}

/** The Luhn check digit of a string of digits. */
export function luhnDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // Doubled from the rightmost digit of the body, as the check digit follows it.
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function validPaymentCode(code: string): boolean {
  return CODE.test(code) && luhnDigit(code.slice(0, -1)) === Number(code.slice(-1));
}

/**
 * The code in Uzum's params.account: a number (the spec's own example) or a
 * string, spaces and dashes allowed as the site groups it ("1234 5678 9").
 * Null unless it is nine digits with a valid check digit.
 */
export function paymentCodeFromAccount(value: unknown): string | null {
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string" && value.length <= 32
        ? value.replace(/[\s-]/g, "")
        : "";
  return validPaymentCode(text) ? text : null;
}

/** A new random code; uniform over the 90 million bodies (no modulo bias). */
function newCode(): string {
  const limit = Math.floor(0x1_0000_0000 / BODY_SPAN) * BODY_SPAN;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value);
  while (value[0] >= limit);
  const body = String(BODY_MIN + (value[0] % BODY_SPAN));
  return `${body}${luhnDigit(body)}`;
}

export class PaymentCodeStore {
  constructor(
    readonly db: D1Database,
    readonly org: string,
  ) {}
  byCode(code: string): Promise<PaymentCodeRow | null> {
    return this.db
      .prepare(
        "SELECT code,user_id,created_at,terms_version,terms_url,terms_locale,terms_accepted_at FROM gpt_payment_codes WHERE org_id=? AND code=?",
      )
      .bind(this.org, code)
      .first<PaymentCodeRow>();
  }
  forUser(user: string): Promise<PaymentCodeRow | null> {
    return this.db
      .prepare(
        "SELECT code,user_id,created_at,terms_version,terms_url,terms_locale,terms_accepted_at FROM gpt_payment_codes WHERE org_id=? AND user_id=?",
      )
      .bind(this.org, user)
      .first<PaymentCodeRow>();
  }
  /**
   * The account's code, created on first use, with the terms its owner has
   * just accepted. Concurrent calls for one account end with one code
   * (UNIQUE(org_id,user_id)); a collision with another account's code takes
   * a new random code (PRIMARY KEY(org_id,code)).
   */
  async issue(
    user: string,
    consent: PaymentCodeConsent,
    now = Date.now(),
  ): Promise<string> {
    let row = await this.forUser(user);
    for (let attempt = 0; !row && attempt < ISSUE_ATTEMPTS; attempt++) {
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO gpt_payment_codes(org_id,code,user_id,created_at) VALUES(?,?,?,?)",
        )
        .bind(this.org, newCode(), user, now)
        .run();
      row = await this.forUser(user);
    }
    if (!row) throw new Error("payment_code_unavailable");
    await this.db
      .prepare(
        "UPDATE gpt_payment_codes SET terms_version=?,terms_url=?,terms_locale=?,terms_accepted_at=? WHERE org_id=? AND user_id=?",
      )
      .bind(consent.version, consent.url, consent.locale, now, this.org, user)
      .run();
    return row.code;
  }
}
