/** Local-only canonical HTML admission. This module never performs network I/O. */
import { createHash } from 'node:crypto';
import { extractCompanyPageFacts, verifyCompanyWebsiteBinding } from '../../functions/platform/lead-radar/sources';
import { safePublicHttpUrl } from '../../functions/platform/lead-radar/validation';
import {
  CRAWLER_LIMITS, CRAWLER_REASONS, LEAD_RADAR_CRAWLER_EXTRACTOR, LEAD_RADAR_CRAWLER_SCHEMA,
  type LeadRadarCrawlerClaim, type LeadRadarCrawlerFact, type LeadRadarCrawlerResult,
} from '../../src/shared/lead-radar-crawler';

export const CRAWLER_EXTRACTOR_MAX_INPUT = 1_048_576;
export const CRAWLER_EXTRACTOR_MAX_OUTPUT = 65_536;
const MAX_CONTACT_FACTS = 55; // server reserves another five website-anchor facts
const FIELDS = new Set<LeadRadarCrawlerFact['fieldPath']>([
  'company_contacts.phone', 'company_contacts.generic_email', 'web.telegram.human',
  'web.telegram.bot', 'web.telegram.channel', 'web.telegram.group', 'web.telegram.business', 'web.telegram.unknown',
]);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
type RecordValue = Record<string, unknown>;

export class CrawlerExtractionError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'CrawlerExtractionError'; }
}
function fail(): never { throw new CrawlerExtractionError('extractor_invalid_input'); }
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as RecordValue;
}
function string(value: unknown, max = 2_048, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value) || value.includes('\0')) fail();
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value, 24);
  if (!ISO.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) fail();
  return result;
}
function publicUrl(value: unknown, expectedOrigin?: string): URL {
  const text = string(value);
  if (/\s/.test(text) || [...text].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      || text.includes('#') || !/^https?:\/\//.test(text)) fail();
  const result = safePublicHttpUrl(text);
  if (!result || (expectedOrigin && result.origin !== expectedOrigin)) fail();
  return result;
}
function digest(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function validFact(fieldPath: LeadRadarCrawlerFact['fieldPath'], value: string): boolean {
  if (!value || value.length > 512 || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return false;
  if (fieldPath === 'company_contacts.phone') return /^\+[1-9][0-9]{7,14}$/.test(value);
  if (fieldPath === 'company_contacts.generic_email') return value.length <= 254 && value === value.toLowerCase()
    && /^(info|sales|office|hello|contact|support|admin|marketing|reception|booking|zakaz|order|mail)@[^\s@]+\.[^\s@]+$/.test(value);
  const path = value.startsWith('https://t.me/') ? value.slice(13) : '';
  if (/^\+[1-9][0-9]{7,14}$/.test(path) || /^m\/[A-Za-z0-9_-]{4,128}$/.test(path)) return true;
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(path)
    && !['share', 'joinchat', 'login', 'proxy', 'socks', 'addstickers', 'addemoji', 'invoice', 'contact'].includes(path.toLowerCase())
    && (!/bot$/i.test(path) || fieldPath === 'web.telegram.bot');
}
function positiveLimit(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) fail();
  return value;
}

/** Same property order as the server's DB identity projection (including nulls). */
function identityOf(job: LeadRadarCrawlerClaim): LeadRadarCrawlerClaim['identity'] {
  const raw = record(job.identity);
  const identity = {
    name: string(raw.name, 512),
    phone: raw.phone === null ? null : string(raw.phone, 512, true),
    address: raw.address === null ? null : string(raw.address, 2_048, true),
    city: string(raw.city, 512, true),
    website: string(raw.website),
    canonical_key: string(raw.canonical_key, 1_024),
  };
  if (digest(JSON.stringify(identity)) !== job.identityDigest) fail();
  return identity;
}

/** Trusted local collector protocol, not remote attestation or messaging consent.
 * Raw HTML exists only in process memory and never enters the durable outbox. */
export async function extractCrawlerResult(
  job: LeadRadarCrawlerClaim,
  rawResult: unknown,
): Promise<LeadRadarCrawlerResult> {
  record(job);
  if (job.schema !== LEAD_RADAR_CRAWLER_SCHEMA || !ID.test(string(job.id, 128))
      || !ID.test(string(job.orgId, 128)) || !ID.test(string(job.companyId, 128))
      || !HASH.test(string(job.identityDigest, 64))
      || !Number.isSafeInteger(job.leaseGeneration) || job.leaseGeneration < 1) fail();
  const identity = identityOf(job);
  const root = publicUrl(job.url);
  if (publicUrl(identity.website).href !== root.href) fail();
  const deadline = Date.parse(timestamp(job.deadlineAt));
  const leaseExpires = Date.parse(timestamp(job.leaseExpiresAt));
  const limits = record(job.limits);
  const maxPages = positiveLimit(limits.maxPages, CRAWLER_LIMITS.maxPages);
  const maxPageBytes = positiveLimit(limits.maxPageBytes, CRAWLER_LIMITS.maxPageBytes);
  const maxTotalBytes = positiveLimit(limits.maxTotalBytes, CRAWLER_LIMITS.maxTotalBytes);
  const raw = record(rawResult);
  if (raw.schema !== job.schema || raw.jobId !== job.id || raw.leaseGeneration !== job.leaseGeneration
      || raw.identityDigest !== job.identityDigest || !/^[A-Za-z0-9_-]{8,80}$/.test(string(raw.receiptId, 80))) fail();
  const status = string(raw.status) as LeadRadarCrawlerResult['status'];
  const reason = string(raw.reason) as LeadRadarCrawlerResult['reason'];
  if (!['completed', 'partial', 'deferred', 'failed'].includes(status)
      || !(CRAWLER_REASONS as readonly string[]).includes(reason)
      || !Array.isArray(raw.pages) || raw.pages.length > maxPages
      || !Array.isArray(raw.resumeUrls) || raw.resumeUrls.length > CRAWLER_LIMITS.maxPages) fail();
  const resumeUrls = raw.resumeUrls.map(value => publicUrl(value, root.origin).href);
  if (new Set(resumeUrls).size !== resumeUrls.length) fail();
  const retryAt = raw.retryAt === null ? null : timestamp(raw.retryAt);
  if (status === 'deferred' ? !retryAt || !resumeUrls.length : retryAt !== null || resumeUrls.length > 0) fail();
  if ((status === 'completed' || status === 'partial') && !raw.pages.length) fail();
  if (status === 'failed' && raw.pages.length) fail();
  let totalBytes = 0;
  const seen = new Set<string>();
  const pages = raw.pages.map(value => {
    const page = record(value);
    const requestedUrl = publicUrl(page.requestedUrl, root.origin);
    const url = publicUrl(page.url, root.origin);
    const html = string(page.html, maxPageBytes);
    const bytes = Buffer.byteLength(html, 'utf8');
    totalBytes += bytes;
    const fetchedAt = timestamp(page.fetchedAt);
    const fetchedMs = Date.parse(fetchedAt);
    if (page.status !== 200 || bytes > maxPageBytes || totalBytes > maxTotalBytes || seen.has(url.href)
        || !html.trim() || !/<[a-z][^>]*>/i.test(html)
        || /<title[^>]*>[^<]*(?:just a moment|access denied|attention required|captcha)/i.test(html)
        || digest(html) !== page.sha256 || fetchedMs > Math.min(deadline, leaseExpires)
        || fetchedMs < deadline - 120_000) fail();
    seen.add(url.href);
    return { requestedUrl: requestedUrl.href, url, html, bytes, status: 200 as const,
      fetchedAt, sha256: string(page.sha256, 64) };
  });
  const matched = verifyCompanyWebsiteBinding(identity, pages);
  const bindingIndex = matched.sourceUrl ? pages.findIndex(page => page.url.href === matched.sourceUrl) : -1;
  const binding = matched.verified && matched.method && bindingIndex >= 0
    ? { method: matched.method, pageIndex: bindingIndex } : null;
  const evidence = new Map<string, LeadRadarCrawlerFact>();
  if (binding) for (const [pageIndex, page] of pages.entries()) {
    // Full people/footer parsing remains essential to correct Telegram classification.
    const facts = extractCompanyPageFacts(page.url, page.html, true, page.fetchedAt, identity, { includeSignals: false });
    for (const fact of facts.evidence) {
      const fieldPath = fact.fieldPath as LeadRadarCrawlerFact['fieldPath'];
      if (!FIELDS.has(fieldPath) || typeof fact.value !== 'string' || !validFact(fieldPath, fact.value)
          || !Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) continue;
      const key = JSON.stringify([pageIndex, fieldPath, fact.value]);
      const previous = evidence.get(key);
      if (previous) previous.confidence = Math.max(previous.confidence, fact.confidence);
      else evidence.set(key, { pageIndex, fieldPath, value: fact.value, confidence: fact.confidence });
    }
  }
  const result: LeadRadarCrawlerResult = {
    schema: LEAD_RADAR_CRAWLER_SCHEMA, jobId: job.id, leaseGeneration: job.leaseGeneration,
    receiptId: raw.receiptId as string, identityDigest: job.identityDigest, status, reason,
    pages: pages.map(page => ({ requestedUrl: page.requestedUrl, url: page.url.href, bytes: page.bytes,
      status: page.status, fetchedAt: page.fetchedAt, sha256: page.sha256 })),
    retryAt, resumeUrls, extractorVersion: LEAD_RADAR_CRAWLER_EXTRACTOR, binding,
    evidence: [...evidence.values()].slice(0, MAX_CONTACT_FACTS),
  };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > CRAWLER_EXTRACTOR_MAX_OUTPUT) fail();
  return result;
}
