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
};
