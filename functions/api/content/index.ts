// /api/content
//   GET                              → { pages, blog, redirects, internalLinks, global }
//   POST  body={kind,locale?,slug,data,message?}  → upsert
//   DELETE body={kind,locale?,slug,message?}      → delete
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { getFile, putFile, deleteFile, readContentBulk } from '../../lib/github';
import { detectMojibake } from '../../../src/shared/audit';
import { withErrorHandler, errorResponse } from '../../lib/api-errors';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Reject anything that could escape the content/ tree. locale and slug are
// interpolated straight into the repo path, so a value like "../../wrangler"
// would let an authenticated caller write outside content/. Slugs across the
// repo are lowercase kebab-case; locales are only ru/uz.
const SLUG_RE = /^[a-z0-9-]+$/;
function assertPathSafe(locale?: string, slug?: string): void {
  if (locale !== 'ru' && locale !== 'uz') throw new Error(`Invalid locale: ${locale}`);
  if (!slug || !SLUG_RE.test(slug)) throw new Error(`Invalid slug: ${slug}`);
}

function pathFor(kind: string, locale?: string, slug?: string): string {
  switch (kind) {
    case 'page': assertPathSafe(locale, slug); return `content/pages/${locale}/${slug}.json`;
    case 'blog': assertPathSafe(locale, slug); return `content/blog/${locale}/${slug}.json`;
    case 'global': return `content/global/site.json`;
    case 'redirects': return `content/seo/redirects.json`;
    case 'internal-links': return `content/seo/internal-links.json`;
    default: throw new Error(`Unknown kind: ${kind}`);
  }
}

export const onRequestGet: PagesFunction<Env> = withErrorHandler('content.get', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  // Single-subrequest bulk read of the whole content/ tree.
  const all = await readContentBulk(env);
  const pages: unknown[] = [];
  const blog: unknown[] = [];
  let globalObj: unknown = null;
  let redirects: unknown[] = [];
  let internalLinks: unknown[] = [];
  for (const [path, text] of Object.entries(all)) {
    if (!path.endsWith('.json')) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { continue; }
    if (path.startsWith('content/pages/')) pages.push(parsed);
    else if (path.startsWith('content/blog/')) blog.push(parsed);
    else if (path === 'content/global/site.json') globalObj = parsed;
    else if (path === 'content/seo/redirects.json') redirects = (parsed as unknown[]) || [];
    else if (path === 'content/seo/internal-links.json') internalLinks = (parsed as unknown[]) || [];
  }

  return json({ pages, blog, global: globalObj, redirects, internalLinks });
});

export const onRequestPost: PagesFunction<Env> = withErrorHandler('content.post', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  let body: { kind: string; locale?: string; slug?: string; data: unknown; message?: string };
  try { body = await request.json(); } catch { return errorResponse('content.post', 'BAD_REQUEST', 'Invalid JSON body'); }
  if (!body.kind || !body.data) return errorResponse('content.post', 'BAD_REQUEST', 'Missing kind/data');
  // PUBLISH GUARD: block save of pages/blog with mojibake when status=published.
  if ((body.kind === 'page' || body.kind === 'blog') && body.data && typeof body.data === 'object') {
    const d = body.data as Record<string, unknown>;
    if (d.status === 'published') {
      const hit = detectMojibake(d);
      if (hit) {
        return errorResponse('content.post', 'BAD_REQUEST',
          `Encoding issue: field "${hit.field}" contains mojibake (${hit.sample}). Fix the text before publishing.`,
          { detail: { field: hit.field } });
      }
    }
  }
  const file = pathFor(body.kind, body.locale, body.slug);
  const content = JSON.stringify(body.data, null, 2) + '\n';
  const message = body.message || `chore(seo): update ${body.kind}${body.slug ? ` ${body.locale}/${body.slug}` : ''} via admin`;
  await putFile(env, file, content, message);
  return json({ ok: true, file });
});

export const onRequestDelete: PagesFunction<Env> = withErrorHandler('content.delete', async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  let body: { kind: string; locale?: string; slug?: string; message?: string };
  try { body = await request.json(); } catch { return errorResponse('content.delete', 'BAD_REQUEST', 'Invalid JSON body'); }
  if (!body.kind) return errorResponse('content.delete', 'BAD_REQUEST', 'Missing kind');
  const file = pathFor(body.kind, body.locale, body.slug);
  await deleteFile(env, file, body.message || `chore(seo): delete ${body.kind} ${body.locale}/${body.slug}`);
  return json({ ok: true });
});

// Used by tests as a smoke endpoint.
export { getFile };
