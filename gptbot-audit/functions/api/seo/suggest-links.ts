// Suggests up to 5 internal-link targets for a given page.
// Heuristic: shares keywords + cross page-type boost + under-linked targets.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { getFile, listDir } from '../../lib/github';
import type { Page } from '../../../src/shared/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') || 'ru';
  const slug = url.searchParams.get('slug') || '';
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), { status: 400 });

  const files = await listDir(env, 'content/pages').catch(() => []);
  const allPages: Page[] = [];
  for (const f of files.filter((p) => p.endsWith('.json'))) {
    const fr = await getFile(env, f);
    if (fr) allPages.push(JSON.parse(fr.content));
  }
  const targetUrl = `/${locale}/${slug}/`;
  const target = allPages.find((p) => p.url === targetUrl);
  if (!target) return new Response(JSON.stringify({ ok: true, suggestions: [] }), { headers: { 'Content-Type': 'application/json' } });

  const existing = new Set((target.internalLinks || []).map((l) => l.target));
  const primary = (target.primaryKeyword || '').toLowerCase();
  const out: { target: string; anchor: string; reason: string; score: number }[] = [];
  for (const p of allPages) {
    if (p.url === target.url) continue;
    if (p.locale !== locale) continue;
    if (p.status !== 'published') continue;
    if (existing.has(p.url)) continue;
    let s = 0;
    const reasons: string[] = [];
    const their = (p.primaryKeyword || '').toLowerCase();
    if (primary && their) {
      const shared = primary.split(/\s+/).filter((w) => w.length > 3 && their.includes(w));
      if (shared.length) { s += 30; reasons.push(`shares: ${shared.slice(0, 3).join(', ')}`); }
    }
    if (target.pageType === 'blog' && p.pageType === 'money') { s += 25; reasons.push('money-page target boost'); }
    if (target.pageType === 'money' && p.pageType === 'blog') { s += 15; reasons.push('supporting blog content'); }
    if (target.pageType === p.pageType && (p.pageType === 'money' || p.pageType === 'niche')) { s += 10; reasons.push('sibling page'); }
    const incoming = allPages.reduce((acc, q) => acc + (q.url !== p.url && (q.internalLinks || []).some((l) => l.target === p.url) ? 1 : 0), 0);
    if (incoming < 2) { s += 20; reasons.push('under-linked'); }
    out.push({ target: p.url, anchor: p.h1 || p.title || p.url, reason: reasons.join('; ') || 'topical match', score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return new Response(JSON.stringify({ ok: true, suggestions: out.slice(0, 5) }), { headers: { 'Content-Type': 'application/json' } });
};
