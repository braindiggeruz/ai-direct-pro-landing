/** Website collection is evidence acquisition, never Telegram admission. */
export const LEAD_RADAR_CRAWLER_SCHEMA = 'gptbot.lead-radar.crawler.v2' as const;
export const LEAD_RADAR_CRAWLER_EXTRACTOR = 'gptbot.lead-radar.extractor.v1' as const;
export const CRAWLER_LIMITS = Object.freeze({ maxPages: 5, maxPageBytes: 131_072,
  maxTotalBytes: 524_288, maxRedirects: 3 });
export type LeadRadarCrawlerJobState = 'queued' | 'running' | 'deferred' | 'completed'
  | 'partial' | 'failed' | 'cancelled';
export interface LeadRadarCrawlerJobSummary {
  id: string; companyId: string; status: LeadRadarCrawlerJobState; reason: string | null;
  availableAt: string; updatedAt: string; pagesAccepted: number; contactsFound: number;
}
export interface LeadRadarCrawlerStatus {
  enabled: boolean; ready: boolean; reason?: string;
  worker: { online: boolean; lastSeenAt: string | null } | null;
  jobs: LeadRadarCrawlerJobSummary[];
}
export interface LeadRadarCrawlerClaim {
  schema: typeof LEAD_RADAR_CRAWLER_SCHEMA; id: string; orgId: string; companyId: string;
  identityDigest: string; url: string; leaseGeneration: number; leaseExpiresAt: string;
  deadlineAt: string; limits: typeof CRAWLER_LIMITS; resumeUrls: string[];
  identity: { name: string; phone: string | null; address: string | null; city: string;
    website: string; canonical_key: string };
}
export const CRAWLER_REASONS = ['ok', 'no_contact_links', 'fetch_error', 'page_limit',
  'source_rate_limited', 'source_unavailable', 'robots_unavailable', 'host_cooldown',
  'invalid_url', 'non_public_address', 'robots_disallowed', 'unsupported_content_type',
  'body_too_large', 'deadline_exceeded', 'worker_unavailable', 'lease_lost',
  'identity_changed', 'cancelled', 'partial_result', 'source_denied', 'invalid_response',
  'source_timeout', 'tls_error', 'robots_redirect', 'no_relevant_evidence'] as const;
export interface LeadRadarCrawlerPage {
  requestedUrl: string; url: string; bytes: number; status: 200; fetchedAt: string; sha256: string;
}
/** Observations by the authenticated, isolated collector, not remote attestation
 * or permission to message. The server assigns evidence IDs and trust metadata. */
export interface LeadRadarCrawlerFact {
  pageIndex: number;
  fieldPath: 'company_contacts.phone' | 'company_contacts.generic_email'
    | 'web.telegram.human' | 'web.telegram.bot' | 'web.telegram.channel'
    | 'web.telegram.group' | 'web.telegram.business' | 'web.telegram.unknown';
  value: string; confidence: number;
}
export interface LeadRadarCrawlerResult {
  schema: typeof LEAD_RADAR_CRAWLER_SCHEMA; jobId: string; leaseGeneration: number;
  receiptId: string; identityDigest: string;
  status: 'completed' | 'partial' | 'deferred' | 'failed'; reason: typeof CRAWLER_REASONS[number];
  pages: LeadRadarCrawlerPage[]; retryAt: string | null; resumeUrls: string[];
  extractorVersion: typeof LEAD_RADAR_CRAWLER_EXTRACTOR;
  binding: { method: 'phone' | 'company_name'; pageIndex: number } | null;
  evidence: LeadRadarCrawlerFact[];
}
