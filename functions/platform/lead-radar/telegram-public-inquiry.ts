import type { LeadRadarTelegramContact } from './types';
import { LeadRadarTelegramBusinessStore } from './telegram-business-store';

export const PUBLIC_BUSINESS_INQUIRY_BASIS = 'public_business_inquiry' as const;
export const PUBLIC_BUSINESS_INQUIRY_VERSION = 'public-business-inquiry-v1' as const;
export const PUBLIC_BUSINESS_INQUIRY_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export interface PublicBusinessInquiryProof {
  policyVersion: typeof PUBLIC_BUSINESS_INQUIRY_VERSION;
  sourceUrlDigest: string;
  approvalId: string;
  selectionDigest: string;
  contentDigest: string;
  recipientId: string;
  firstContactOnly: true;
}

/** Stored evidence only: no network lookups or recipient-controlled fetches. */
export function publicBusinessEvidenceUrl(value: string): string | null {
  if (value.length < 8 || value.length > 200
    || [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || !url.hostname.includes('.') || /^(?:\[|\d{1,3}(?:\.\d{1,3}){3}$)/u.test(url.hostname)
      || /(?:^|\.)(?:localhost|local|internal|test)$/iu.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function host(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./u, ''); } catch { return null; }
}

function matchesUsername(value: string, username: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === username || normalized === `@${username}`) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['t.me', 'telegram.me'].includes(url.hostname)
      && url.pathname.replace(/\/$/u, '').toLowerCase() === `/${username}`
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/**
 * A source URL proves only a published corporate endpoint, never subscription.
 * The existing account-bound resolver and owner approval remain separate gates.
 * Even an opaque provider ref must retain its observed public username here.
 */
export async function publicBusinessInquiryEvidenceUrls(input: {
  db: D1Database;
  orgId: string;
  companies: readonly { companyId: string; website: string | null; contact: LeadRadarTelegramContact }[];
  now: Date;
}): Promise<Map<string, string[]>> {
  const candidates = input.companies.filter(({ contact }) => {
    const verifiedAt = Date.parse(contact.verifiedAt);
    return contact.type === 'business' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(contact.username)
      && matchesUsername(contact.url, contact.username.toLowerCase())
      && Number.isFinite(contact.confidence) && contact.confidence >= 0.8 && contact.confidence <= 1
      && Number.isFinite(verifiedAt) && verifiedAt <= input.now.getTime() + 300_000
      && verifiedAt >= input.now.getTime() - PUBLIC_BUSINESS_INQUIRY_MAX_AGE_MS
      && contact.evidenceIds.length > 0 && contact.evidenceIds.length <= 10
      && new Set(contact.evidenceIds).size === contact.evidenceIds.length;
  });
  const result = new Map<string, string[]>();
  if (!candidates.length) return result;
  const evidence = await new LeadRadarTelegramBusinessStore(input.db).findCompanyEvidenceForCampaignSelection(
    input.orgId, candidates.map(({ companyId, contact }) => ({ companyId, evidenceIds: contact.evidenceIds })),
  );
  for (const company of candidates) {
    const companyHost = host(company.website);
    if (!companyHost) continue;
    const rows = evidence.filter((row) => row.company_id === company.companyId);
    if (rows.length !== company.contact.evidenceIds.length) continue;
    const urls: string[] = [];
    for (const row of rows) {
      const url = publicBusinessEvidenceUrl(row.source_url);
      const observedAt = Date.parse(row.observed_at);
      if (row.org_id !== input.orgId || !company.contact.evidenceIds.includes(row.id)
        || row.source_type !== 'company_website' || row.classification !== 'fact'
        || !Number.isFinite(Number(row.confidence)) || Number(row.confidence) < 0.8 || Number(row.confidence) > 1
        || !/(?:^|\.)telegram(?:\.|$)/iu.test(row.field_path)
        || !matchesUsername(row.value, company.contact.username.toLowerCase())
        || !url || host(url) !== companyHost || !Number.isFinite(observedAt)
        || observedAt < input.now.getTime() - PUBLIC_BUSINESS_INQUIRY_MAX_AGE_MS
        || observedAt > input.now.getTime() + 300_000) { urls.length = 0; break; }
      urls.push(url);
    }
    if (urls.length) result.set(company.companyId, [...new Set(urls)].sort());
  }
  return result;
}
