// Derive a schema.org Offer for a money page's Service node from the hero trust
// chips the visitor can read on the page (Page.heroTrust). Nothing is invented:
// when no chip states a starting price, no Offer is emitted at all.
//
// Chips are authored as "От 1 990 000 сум", "Аудит от 990 000 сум",
// "1 990 000 so‘mdan", "Oyiga 2 490 000 so‘mdan" or "От 2 490 000 сум/мес".
// "от" / "-dan" means a starting price, so the value is emitted as minPrice,
// never as a fixed price. A monthly chip becomes a UnitPriceSpecification per
// month so "2 490 000 сум/мес" and "2 490 000 сум" cannot be confused.

export interface TrustChipOffer {
  minPrice: number;
  priceCurrency: 'UZS';
  perMonth: boolean;
  /** The visible chip the value was read from, kept for tests and audits. */
  source: string;
}

// Thousands are separated by a regular or a non-breaking space; JavaScript \s matches both.
const PRICE_RE = /(\d{1,3}(?:\s\d{3})+|\d{4,})\s*(?:сум|so[‘’'ʻ`]m)/iu;
const MONTH_RE = /\/\s*мес|в месяц|oyiga|\/\s*oy(?![a-z])/iu;

export function offerFromTrustChips(chips: readonly string[] | undefined): TrustChipOffer | null {
  for (const chip of chips ?? []) {
    const match = PRICE_RE.exec(chip);
    if (!match) continue;
    const minPrice = Number(match[1].replace(/\s/g, ''));
    if (!Number.isFinite(minPrice) || minPrice <= 0) continue;
    return { minPrice, priceCurrency: 'UZS', perMonth: MONTH_RE.test(chip), source: chip };
  }
  return null;
}

export function buildOfferLd(offer: TrustChipOffer, url: string): Record<string, unknown> {
  return {
    '@type': 'Offer',
    url,
    priceCurrency: offer.priceCurrency,
    priceSpecification: {
      '@type': offer.perMonth ? 'UnitPriceSpecification' : 'PriceSpecification',
      minPrice: offer.minPrice,
      priceCurrency: offer.priceCurrency,
      ...(offer.perMonth ? { unitCode: 'MON', billingIncrement: 1 } : {}),
    },
  };
}
