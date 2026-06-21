// API client used by the admin UI.
// Base URL precedence:
//   1. VITE_API_BASE (set in .env for Emergent dev → full Emergent URL)
//   2. window.location.origin (production → Cloudflare Pages same origin)
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';

const TOKEN_KEY = 'gptbot_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    setToken(null);
    window.location.assign('/admin-tools/login');
    throw new Error('Session expired');
  }
  if (!res.ok) {
    let err = `${res.status}`;
    try { const d = await res.json(); err = d.error || d.detail || err; } catch { /* ignore */ }
    throw new Error(err);
  }
  return res.json() as Promise<T>;
}

export const api = {
  config: () => request<{ turnstileSiteKey: string | null }>('GET', '/api/auth/config'),
  login: (email: string, password: string, turnstileToken?: string) => request<{ token: string; email: string; role: string }>('POST', '/api/auth/login', { email, password, turnstileToken }),
  me: () => request<{ email: string; role: string }>('GET', '/api/auth/me'),
  getContent: () => request<{ pages: any[]; blog: any[]; global: any; redirects: any[]; internalLinks: any[] }>('GET', '/api/content'),
  saveContent: (kind: string, locale: string | undefined, slug: string | undefined, data: unknown, message?: string) =>
    request<{ ok: true; file: string }>('POST', '/api/content', { kind, locale, slug, data, message }),
  deleteContent: (kind: string, locale: string | undefined, slug: string | undefined, message?: string) =>
    request<{ ok: true }>('DELETE', '/api/content', { kind, locale, slug, message }),
  audit: () => request<any>('GET', '/api/audit'),
  publishToGitHub: (message?: string) => request<{ ok: true; committed: number; commitSha?: string }>('POST', '/api/content/publish-to-github', { message }),
  anchors: () => request<{ ru: string[]; uz: string[] }>('GET', '/api/seo/anchors'),
  aiFill: (payload: { primaryKeyword: string; locale: string; pageType: string; h1?: string }) =>
    request<{ ok: true; draft: { title?: string; description?: string; h1?: string; heroSubtitle?: string; faq?: { q: string; a: string }[]; anchors?: string[]; raw?: string } }>('POST', '/api/ai/fill', payload),
  uploadImage: (payload: { filename: string; base64: string; folder: 'seo' | 'blog' }) =>
    request<{ ok: true; url: string; committed: boolean }>('POST', '/api/images/upload', payload),
  suggestLinks: (slug: string, locale: string) =>
    request<{ ok: true; suggestions: { target: string; anchor: string; reason: string; score: number }[] }>('GET', `/api/seo/suggest-links?locale=${locale}&slug=${encodeURIComponent(slug)}`),
  // SEO Booster Engine — read-only report (items + clusters + cannibalization + summary).
  booster: () => request<import('../../shared/booster').BoosterReport>('GET', '/api/seo/booster'),
  // Submit URLs to IndexNow. Server validates every URL against /content/* and
  // rejects admin/api/draft/noindex/mojibake/duplicate/host-mismatch entries.
  indexnowSubmit: (urls: string[]) =>
    request<{ ok: boolean; submitted?: number; safeUrls?: string[]; rejected?: { url: string; reason: string }[]; upstreamStatus?: number; upstreamBody?: string; error?: string }>('POST', '/api/seo/indexnow', { urls }),
  // AI SEO Autopilot — Free LLM (Puter/Mock primary, Gemini optional backend).
  aiProviderStatus: () =>
    request<{ providers: import('../../shared/ai-seo').AiProviderStatus[]; serper: { configured: boolean; note: string }; generatedAt: string }>('GET', '/api/seo/ai/provider-status'),
  aiValidatePatch: (candidate: import('../../shared/ai-seo').AiSeoPatchCandidate) =>
    request<{ patch: import('../../shared/ai-seo').AiSeoPatch }>('POST', '/api/seo/ai/validate-patch', { candidate }),
  aiApplyPatch: (patch: import('../../shared/ai-seo').AiSeoPatch, approvedFieldIds: string[]) =>
    request<{ ok: boolean; runId?: string; appliedFieldCount?: number; error?: string }>('POST', '/api/seo/ai/apply-patch', { patch, approvedFieldIds }),
  aiLogs: () =>
    request<{ runs: import('../../shared/ai-seo').AiSeoRunLog[] }>('GET', '/api/seo/ai/logs'),
  // Editor Bridge — fetch approved-fields snapshot for a previously applied run
  // so the Page/Blog editor can prefill its local draft.
  aiGetPatch: (runId: string) =>
    request<{
      ok: boolean;
      runId: string;
      url: string;
      target: 'page' | 'blog';
      locale: 'ru' | 'uz';
      slug: string;
      action: string;
      provider: string;
      model?: string;
      createdAt: string;
      approvedFields: string[];
      applied: Record<string, unknown>;
      skipped: string[];
      error?: string;
    }>('GET', `/api/seo/ai/patch?runId=${encodeURIComponent(runId)}`),
  // Serper SERP Intelligence
  serperStatus: () =>
    request<import('../../shared/serp').SerperProviderStatus>('GET', '/api/seo/serper/status'),
  serperQuery: (req: import('../../shared/serp').SerperQueryRequest) =>
    request<import('../../shared/serp').SerperQueryResult>('POST', '/api/seo/serper/query', req),
  serperAnalyzeUrl: (req: import('../../shared/serp').SerperAnalyzeUrlRequest) =>
    request<import('../../shared/serp').SerperQueryResult>('POST', '/api/seo/serper/analyze-url', req),
  serperBatch: (req: import('../../shared/serp').SerperBatchRequest) =>
    request<import('../../shared/serp').SerperBatchResult>('POST', '/api/seo/serper/batch', req),
  serperLogs: () =>
    request<{ runs: import('../../shared/serp').SerpRunLog[] }>('GET', '/api/seo/serper/logs'),
  // AI Draft Inbox — n8n SEO Autopilot delivers RU/UZ bundles into D1.
  aiDraftsList: (filters: { status?: string; locale?: string; source?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (filters.status) q.set('status', filters.status);
    if (filters.locale) q.set('locale', filters.locale);
    if (filters.source) q.set('source', filters.source);
    if (filters.limit) q.set('limit', String(filters.limit));
    const qs = q.toString();
    return request<{ drafts: import('../../shared/ai-drafts').AiDraftListRow[]; error?: string }>(
      'GET',
      `/api/admin/ai-drafts${qs ? `?${qs}` : ''}`,
    );
  },
  aiDraftsGet: (id: string) =>
    request<{
      draft: import('../../shared/ai-drafts').AiDraftRecord;
      audit: import('../../shared/ai-drafts').AiDraftAuditEntry[];
    }>('GET', `/api/admin/ai-drafts/${encodeURIComponent(id)}`),
  aiDraftsStatus: (id: string, status: 'needs_revision' | 'rejected' | 'pending_review', note?: string) =>
    request<{ draft: import('../../shared/ai-drafts').AiDraftRecord }>(
      'POST',
      `/api/admin/ai-drafts/${encodeURIComponent(id)}/status`,
      { status, note },
    ),
  aiDraftsImport: (id: string, locale: 'ru' | 'uz') =>
    request<{ draft: import('../../shared/ai-drafts').AiDraftRecord }>(
      'POST',
      `/api/admin/ai-drafts/${encodeURIComponent(id)}/import`,
      { locale },
    ),
  aiDraftsDelete: (id: string) =>
    request<{ ok: boolean }>('DELETE', `/api/admin/ai-drafts/${encodeURIComponent(id)}`),
  // -- SEO Autopilot Control Center -----------------------------------------
  seoAutopilotLaunch: (overrides: Record<string, unknown> = {}) =>
    request<{
      success: boolean;
      job_id: string;
      run_id: string;
      status: string;
      status_url: string;
      polling: { retry_after_seconds: number; max_polls: number; expected_completion_seconds: number };
      source: string;
      requested_by: string;
      manual_approval_required: boolean;
      ready_for_publish: boolean;
    }>('POST', '/api/admin/seo-autopilot/run', overrides),
  seoAutopilotJobs: () =>
    request<{
      jobs: import('../../shared/seo-autopilot').AutopilotJobRow[];
      system: {
        n8n_webhook_secret_configured: boolean;
        cron_secret_configured: boolean;
        drafts_db_configured: boolean;
        external_trigger_enabled: boolean;
      };
    }>('GET', '/api/admin/seo-autopilot/jobs'),
  seoAutopilotJob: (id: string) =>
    request<import('../../shared/seo-autopilot').AutopilotJobDetail>(
      'GET',
      `/api/seo-autopilot/jobs/${encodeURIComponent(id)}`,
    ),
  seoAutopilotGetSchedule: () =>
    request<{
      schedule: { mode: 'disabled' | 'weekly' | 'twice_weekly'; active_days: number[]; updated_at?: string; updated_by?: string };
      system: { n8n_webhook_secret_configured: boolean; cron_secret_configured: boolean; external_trigger_enabled: boolean; drafts_db_configured: boolean };
    }>('GET', '/api/admin/seo-autopilot/schedule'),
  seoAutopilotSetSchedule: (mode: 'disabled' | 'weekly' | 'twice_weekly') =>
    request<{ schedule: { mode: string; active_days: number[]; updated_at?: string; updated_by?: string } }>(
      'POST',
      '/api/admin/seo-autopilot/schedule',
      { mode },
    ),
};
