import { assessLeadRadarPhone } from '../../../src/shared/lead-radar-contacts';
import { firecrawlPublicUrl } from './firecrawl-client';
import type { ExpectedCompanyWebsiteIdentity } from './sources';
import { normalizeCompanyKey } from './validation';

/** Extract only an identity-matched listing's structured website. Shared footer
 * links, directory support contacts and search snippets are not company proof. */
export function officialDomainsFromListing(html: string, expected: ExpectedCompanyWebsiteIdentity): string[] {
  const results = new Set<string>();
  const phone = expected.phone ? assessLeadRadarPhone(expected.phone).e164 : null;
  const name = normalizeCompanyKey(expected.name);
  const address = normalizeCompanyKey(expected.address ?? '');
  let visited = 0;
  const visit = (value: unknown, depth = 0) => {
    if (++visited > 300 || depth > 8 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.slice(0, 50).forEach((item) => visit(item, depth + 1)); return; }
    const node = value as Record<string, unknown>;
    const type = [node['@type']].flat();
    const types = ['LocalBusiness','Dentist','MedicalClinic','BeautySalon','HairSalon','Organization','Store','AutoRepair','EducationalOrganization','TravelAgency'];
    const phones = [node.telephone].flat().filter((item): item is string => typeof item === 'string');
    const sameName = typeof node.name === 'string' && normalizeCompanyKey(node.name) === name;
    const samePhone = !!phone && phones.some((item) => assessLeadRadarPhone(item).e164 === phone);
    const nodeAddress = typeof node.address === 'string' ? node.address
      : node.address && typeof node.address === 'object' ? String((node.address as Record<string, unknown>).streetAddress ?? '') : '';
    const sameAddress = address.length >= 12 && normalizeCompanyKey(nodeAddress) === address;
    if (type.some((item) => typeof item === 'string' && types.includes(item)) && sameName && (samePhone || sameAddress)) {
      for (const raw of [node.url, ...[node.sameAs].flat()]) {
        if (typeof raw !== 'string') continue;
        const url = firecrawlPublicUrl(raw);
        if (url) results.add(url.toString());
      }
    }
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  for (const match of html.slice(0, 900_000).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Invalid structured data conveys no ownership. */ }
  }
  return [...results].slice(0, 2);
}

export function officialDomainSearchQuery(expected: ExpectedCompanyWebsiteIdentity): string {
  // Use an exact public business identifier, not a generic niche + city only.
  const phone = expected.phone ? assessLeadRadarPhone(expected.phone).e164 : null;
  return `${expected.name} ${expected.city ?? ''} ${phone ?? expected.address ?? ''} официальный сайт`.slice(0, 240);
}
