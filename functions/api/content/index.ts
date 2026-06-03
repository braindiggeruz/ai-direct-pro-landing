// /api/content
//   GET                              → { pages, blog, redirects, internalLinks, global }
//   POST  body={kind,locale?,slug,data,message?}  → upsert
//   DELETE body={kind,locale?,slug,message?}      → delete
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { getFile, putFile, deleteFile, readContentBulk } from '../../lib/github';
import { detectMojibake } from '../../../src/shared/audit';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function pathFor(kind: string, locale?: string, slug?: string): string {
  switch (kind) {
    case 'page': return `content/pages/${locale}/${slug}.json`;
    case 'blog': return `content/blog/${locale}/${slug}.json`;
    case 'global': return `content/global/site.json`;
    case 'redirects': return `content/seo/redirects.json`;
    case 'internal-links': return `content/seo/internal-links.json`;
    default: throw new Error(`Unknown kind: ${kind}`);
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  // Single-subrequest bulk read of the whole content/ tree.
  // Replaces the prior 5×listDir + N×getFile path that exceeded the
  // Cloudflare Workers Free runtime 50-subrequest cap once corpus > 40.
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
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  let body: { kind: string; locale?: string; slug?: string; data: unknown; message?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid body' }, 400); }
  if (!body.kind || !body.data) return json({ error: 'Missing kind/data' }, 400);
  // PUBLISH GUARD: block save of pages/blog with mojibake when status=published.
  if ((body.kind === 'page' || body.kind === 'blog') && body.data && typeof body.data === 'object') {
    const d = body.data as Record<string, unknown>;
    if (d.status === 'published') {
      const hit = detectMojibake(d);
      if (hit) {
        return json({ error: `Encoding issue detected: "${hit.field}" contains mojibake characters (${hit.sample}). Publish blocked. Fix the text before publishing.` }, 400);
      }
    }
  }
  try {
    const file = pathFor(body.kind, body.locale, body.slug);
    const content = JSON.stringify(body.data, null, 2) + '\n';
    const message = body.message || `chore(seo): update ${body.kind}${body.slug ? ` ${body.locale}/${body.slug}` : ''} via admin`;
    await putFile(env, file, content, message);
    return json({ ok: true, file });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  let body: { kind: string; locale?: string; slug?: string; message?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid body' }, 400); }
  try {
    const file = pathFor(body.kind, body.locale, body.slug);
    await deleteFile(env, file, body.message || `chore(seo): delete ${body.kind} ${body.locale}/${body.slug}`);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
