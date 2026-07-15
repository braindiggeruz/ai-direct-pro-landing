// Wire types for /api/admin/cockpit. Kept in shared/ so the SPA and the
// server agree on the section shape.

import type { CockpitStats, Page, BlogArticle, GlobalSEO } from './types';
import type { NextBestAction } from './next-actions';

export interface CockpitSection<T> {
  ok: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  duration_ms: number;
}

export interface CockpitContent {
  pages: Page[];
  blog: BlogArticle[];
  global: GlobalSEO | null;
  redirects: unknown[];
  internalLinks: unknown[];
}

export interface CockpitAudit extends CockpitStats {
  totalBlog: number;
  publishedBlog: number;
  blogInSitemap: number;
  blogMissingFaq: number;
  blogMissingTitle: number;
  blogMissingDescription: number;
  blogDuplicateTitle: number;
}

export interface CockpitDrafts {
  pending_review: number;
  needs_revision: number;
  rejected: number;
  imported: number;
  last_pending_id: string | null;
  last_pending_admin_url: string | null;
  last_pending_title: string | null;
}

export interface CockpitAutopilot {
  total: number;
  in_flight: number;
  completed: number;
  active_failed: number;
  failed_24h: number;
  failed_total: number;
  stale_swept: number;
  last_completed: { id: string; draft_id: string | null; admin_url: string | null; finished_at: string | null } | null;
  last_failed: { id: string; error_code: string | null; error_message: string | null; created_at: string } | null;
  last_run: { id: string; status: string; created_at: string } | null;
  schedule_mode: 'disabled' | 'weekly' | 'twice_weekly';
  n8n_webhook_secret_configured: boolean;
  cron_secret_configured: boolean;
}

export interface CockpitHealth {
  randomUrl404: boolean; randomUrlStatus: number;
  adminNoindex: boolean; adminStatus: number;
  sitemap200Xml: boolean; sitemapStatus: number;
  robots200: boolean; robotsStatus: number;
  faviconLive: boolean; faviconStatus: number;
  sampleImageLive: boolean; sampleImageStatus: number;
  probedAt: string;
}

export interface CockpitGitHubHealth {
  ok: boolean;
  level: 'healthy' | 'limited' | 'failed' | 'not_configured';
  owner: string;
  repo: string;
  branch: string;
  details: {
    token_present: boolean;
    auth_ok: boolean | null;
    repo_reachable: boolean | null;
    branch_reachable: boolean | null;
    content_readable: boolean | null;
    sample_file: string | null;
    sample_bytes: number | null;
    error: string | null;
  };
}

export interface CockpitResponse {
  success: true;
  request_id: string;
  generated_at: string;
  audit: CockpitSection<CockpitAudit>;
  content: CockpitSection<CockpitContent>;
  drafts: CockpitSection<CockpitDrafts>;
  autopilot: CockpitSection<CockpitAutopilot>;
  health: CockpitSection<CockpitHealth>;
  github_health: CockpitGitHubHealth;
  next_best_actions: NextBestAction[];
  system: {
    github_token_configured: boolean;
    jwt_secret_configured: boolean;
    drafts_db_configured: boolean;
    n8n_webhook_secret_configured: boolean;
    serper_configured: boolean;
    openrouter_configured: boolean;
    gemini_configured: boolean;
    github: { owner: string; repo: string; branch: string };
  };
}
