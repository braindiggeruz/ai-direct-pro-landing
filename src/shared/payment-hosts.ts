// The hosts a payment link may point at, one rule for the browser and the
// server: the Uzum Bank pages the chat sends a visitor to, and the fiscal
// receipts the pack window links. What an Uzum receipt callback may store
// (functions/lib/gpt-chat/uzum-config.ts allowedUzumReceipt), what the
// account view hands out (functions/lib/gpt-chat/fiscal-config.ts
// receiptLink) and what «Paketim» opens (src/gpt-chat/types.ts
// safeAccountLink) are then the same set by construction.

/**
 * Uzum Bank's own domains: its card page, its API and its receipts.
 * UNVERIFIED: the public spec names no host; these are the bank's domains.
 */
export const UZUM_HOST = /(^|\.)(uzumbank\.uz|uzumcheckout\.uz|uzum\.uz)$/;

/** The tax authority's receipt page: Click, Payme and Uzum receipts link here. */
export const OFD_RECEIPT_HOST = 'ofd.soliq.uz';

/** A host a fiscal receipt link may have: exactly ofd.soliq.uz, or an Uzum host. */
export function receiptHost(hostname: string): boolean {
  return hostname === OFD_RECEIPT_HOST || UZUM_HOST.test(hostname);
}
