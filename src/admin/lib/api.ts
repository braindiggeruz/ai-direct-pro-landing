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

async function request<T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number }): Promise<T> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let signal: AbortSignal | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts?.timeoutMs && opts.timeoutMs > 0) {
    const ctrl = new AbortController();
    signal = ctrl.signal;
    timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  }
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
    if (res.status === 401) {
      setToken(null);
      window.location.assign('/admin-tools/login');
      throw Object.assign(new Error('Session expired'), { code: 'UNAUTHENTICATED', requestId: res.headers.get('x-request-id') });
    }
    if (!res.ok) {
      let err = `${res.status}`;
      let code: string | undefined;
      let requestId = res.headers.get('x-request-id') || undefined;
      let endpoint: string | undefined;
      let retryable: boolean | undefined;
      try {
        const d = await res.json();
        if (d?.error && typeof d.error === 'object') {
          // Structured shape from withErrorHandler.
          err = d.error.message || err;
          code = d.error.code;
          requestId = d.error.request_id || requestId;
          endpoint = d.error.endpoint;
          retryable = d.error.retryable;
        } else {
          err = d.error || d.detail || d.error_message || err;
        }
      } catch { /* ignore non-JSON */ }
      const e = new Error(err) as Error & {
        code?: string; requestId?: string; endpoint?: string; retryable?: boolean; status?: number;
      };
      e.code = code; e.requestId = requestId; e.endpoint = endpoint; e.retryable = retryable; e.status = res.status;
      throw e;
    }
    return res.json() as Promise<T>;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  // SEO Mission Control aggregator — single call, partial-success per
  // section so the cockpit renders even when one upstream is down.
  cockpit: () => request<import('../../shared/cockpit').CockpitResponse>('GET', '/api/admin/cockpit'),
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
  // Optimize a single locale of an AI draft via OpenRouter. Returns a
  // preview only — the operator must call aiDraftsApplyOptimization to save.
  aiDraftsOptimize: (id: string, locale: 'ru' | 'uz') =>
    request<{
      ok: true;
      locale: 'ru' | 'uz';
      model: string;
      original: import('../../shared/ai-drafts').AiDraftArticle;
      optimized_article: import('../../shared/ai-drafts').AiDraftArticle;
      changes: string[];
      kept: string[];
      validation_before: { passed: boolean; issues: { path: string; message: string }[] };
      validation_after:  { passed: boolean; issues: { path: string; message: string }[] };
      warnings: string[];
    }>(
      'POST',
      `/api/admin/ai-drafts/${encodeURIComponent(id)}/optimize`,
      { locale },
      { timeoutMs: 2 * 60 * 1000 }, // OpenRouter calls can take 30-90s
    ),
  aiDraftsApplyOptimization: (
    id: string,
    locale: 'ru' | 'uz',
    optimized_article: import('../../shared/ai-drafts').AiDraftArticle,
    model?: string,
  ) =>
    request<{ ok: true; draft: import('../../shared/ai-drafts').AiDraftRecord }>(
      'POST',
      `/api/admin/ai-drafts/${encodeURIComponent(id)}/apply-optimization`,
      { locale, optimized_article, model },
    ),
  // -- SEO Autopilot Control Center -----------------------------------------
  seoAutopilotLaunch: (overrides: Record<string, unknown> = {}) =>
    request<import('../../shared/seo-autopilot').AutopilotLaunchResult>(
      'POST',
      '/api/admin/seo-autopilot/run',
      overrides,
      { timeoutMs: 5 * 60 * 1000 }, // n8n full generation can take 1–4 min
    ),
  seoAutopilotJobs: () =>
    request<{
      jobs: import('../../shared/seo-autopilot').AutopilotJobRow[];
      system: import('../../shared/seo-autopilot').AutopilotSystemFlags;
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

  // ─── Intent Guard / Anti-cannibalization ─────────────────────────────────
  contentInventory: () =>
    request<{
      generated_at: string;
      counts: import('../../shared/intent-guard').ContentInventory['counts'];
      items: Array<{
        id: string; source_type: string; url: string | null; locale: 'ru' | 'uz';
        title: string; slug: string; status: string; target_keyword: string;
        target_money_page: string | null; intent_key: string;
        fingerprint: import('../../shared/intent-guard').IntentFingerprint;
      }>;
    }>('GET', '/api/admin/seo/content-inventory'),
  cannibalizationAnalyze: (body: {
    source: 'draft' | 'editor' | 'plan_item';
    draftId?: string;
    locale?: 'ru' | 'uz';
    article?: import('../../shared/ai-drafts').AiDraftArticle;
    planItemId?: string;
    useSerper?: boolean | 'auto';
    useSemantic?: boolean | 'auto';
  }) => request<{
    ok: true;
    analysis_id: string | null;
    locale: 'ru' | 'uz';
    risk_score: number;
    risk_level: 'low' | 'medium' | 'high';
    fingerprint: import('../../shared/intent-guard').IntentFingerprint;
    intent_key: string;
    conflicts: import('../../shared/intent-guard').IntentConflict[];
    inventory_counts: import('../../shared/intent-guard').ContentInventory['counts'];
    recommendation: import('../../shared/intent-guard').SemanticVerdict['recommendation'];
    serper: { used: boolean; queries_run: number; overlap_score: number };
    semantic: { used: boolean; summary: string; model?: string };
  }>('POST', '/api/admin/seo/cannibalization/analyze', body, { timeoutMs: 2 * 60 * 1000 }),
  cannibalizationRetarget: (body: {
    source: 'draft' | 'editor';
    draftId?: string;
    locale?: 'ru' | 'uz';
    article?: import('../../shared/ai-drafts').AiDraftArticle;
    userHint?: string;
  }) => request<{
    ok: true;
    analysis_id: string | null;
    proposal: import('../../shared/intent-guard').RetargetProposal;
    risk_score_before: number;
    risk_level_before: 'low' | 'medium' | 'high';
    conflicts: import('../../shared/intent-guard').IntentConflict[];
    fingerprint_before: import('../../shared/intent-guard').IntentFingerprint;
    semantic_used: boolean;
  }>('POST', '/api/admin/seo/cannibalization/retarget', body, { timeoutMs: 3 * 60 * 1000 }),
  cannibalizationApplyRetarget: (body: {
    draftId: string;
    locale: 'ru' | 'uz';
    optimized_article: import('../../shared/ai-drafts').AiDraftArticle;
    analysis_id?: string;
    model?: string;
    decision?: string;
    strategy?: string;
  }) => request<{
    ok: true;
    draft: import('../../shared/ai-drafts').AiDraftRecord;
    recheck: {
      analysis_id: string | null;
      risk_score_after: number;
      risk_level_after: 'low' | 'medium' | 'high';
      conflicts: import('../../shared/intent-guard').IntentConflict[];
      fingerprint: import('../../shared/intent-guard').IntentFingerprint;
      semantic_used: boolean;
    };
  }>('POST', '/api/admin/seo/cannibalization/apply-retarget', body, { timeoutMs: 2 * 60 * 1000 }),
  topicPlanCreate: (body: {
    name?: string;
    count?: number;
    locale_mode?: 'ru' | 'uz' | 'ru+uz';
    params?: Record<string, unknown>;
  }) => request<{ ok: true; plan: import('../../shared/intent-guard').TopicPlan }>(
    'POST', '/api/admin/seo/topic-plans', body, { timeoutMs: 60_000 },
  ),
  topicPlanList: () => request<{ plans: import('../../shared/intent-guard').TopicPlan[] }>('GET', '/api/admin/seo/topic-plans'),
  topicPlanGet: (id: string) => request<{ plan: import('../../shared/intent-guard').TopicPlan }>(
    'GET', `/api/admin/seo/topic-plans/${encodeURIComponent(id)}`,
  ),
  topicPlanPatch: (id: string, body: { name?: string; status?: import('../../shared/intent-guard').TopicPlanStatus }) =>
    request<{ plan: import('../../shared/intent-guard').TopicPlan }>(
      'PATCH', `/api/admin/seo/topic-plans/${encodeURIComponent(id)}`, body,
    ),
  topicPlanItemReplace: (planId: string, itemId: string) =>
    request<{ ok: true; item: import('../../shared/intent-guard').TopicPlanItem }>(
      'POST',
      `/api/admin/seo/topic-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/replace`,
    ),
  topicPlanItemDelete: (planId: string, itemId: string) =>
    request<{ ok: true }>(
      'DELETE',
      `/api/admin/seo/topic-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`,
    ),
  topicPlanItemLaunch: (planId: string, itemId: string) =>
    request<{
      ok: true;
      item_id: string;
      plan_id: string;
      draft_id: string | null;
      job_id: string | null;
      risk_results: Array<{ locale: 'ru' | 'uz'; risk_score: number; risk_level: 'low' | 'medium' | 'high' }>;
    }>(
      'POST',
      `/api/admin/seo/topic-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/launch`,
      {},
      { timeoutMs: 5 * 60 * 1000 },
    ),
};
