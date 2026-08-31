export const LEAD_RADAR_CRAWLER_JOB_STATUSES = [
  'queued', 'running', 'deferred', 'completed', 'partial', 'failed', 'cancelled',
] as const;
export type LeadRadarCrawlerJobStatus = typeof LEAD_RADAR_CRAWLER_JOB_STATUSES[number];

export interface LeadRadarCrawlerJobReadModel {
  id: string;
  companyId: string;
  status: LeadRadarCrawlerJobStatus;
  reason: string | null;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  pagesAccepted: number;
  contactsFound: number;
}

export interface LeadRadarCrawlerWorkerReadModel {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
}

export interface LeadRadarCrawlerStatusResponse {
  enabled: boolean;
  ready: boolean;
  reason: 'crawler_disabled' | 'crawler_not_configured' | 'crawler_offline' | null;
  worker: LeadRadarCrawlerWorkerReadModel | null;
  jobs: LeadRadarCrawlerJobReadModel[];
}

export interface LeadRadarCrawlerJobMutationResponse { job: LeadRadarCrawlerJobReadModel }
