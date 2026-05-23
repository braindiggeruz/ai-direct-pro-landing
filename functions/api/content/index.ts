// /api/content
//   GET                              → { pages, blog, redirects, internalLinks, global }
//   POST  body={kind,locale?,slug,data,message?}  → upsert
//   DELETE body={kind,locale?,slug,message?}      → delete
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { getFile, listDir, putFile, deleteFile } from '../../lib/github';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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

  const [pageFiles, blogFiles, globalFile, redirectsFile, linksFile] = await Promise.all([
    listDir(env, 'content/pages').catch(() => []),
    listDir(env, 'content/blog').catch(() => []),
    getFile(env, 'content/global/site.json').catch(() => null),
    getFile(env, 'content/seo/redirects.json').catch(() => null),
    getFile(env, 'content/seo/internal-links.json').catch(() => null),
  ]);

  const pages = await Promise.all(
    pageFiles.filter((p) => p.endsWith('.json')).map(async (p) => {
      const f = await getFile(env, p);
      return f ? JSON.parse(f.content) : null;
    }),
  );
  const blog = await Promise.all(
    blogFiles.filter((p) => p.endsWith('.json')).map(async (p) => {
      const f = await getFile(env, p);
      return f ? JSON.parse(f.content) : null;
    }),
  );

  return json({
    pages: pages.filter(Boolean),
    blog: blog.filter(Boolean),
    global: globalFile ? JSON.parse(globalFile.content) : null,
    redirects: redirectsFile ? JSON.parse(redirectsFile.content) : [],
    internalLinks: linksFile ? JSON.parse(linksFile.content) : [],
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  let body: { kind: string; locale?: string; slug?: string; data: unknown; message?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid body' }, 400); }
  if (!body.kind || !body.data) return json({ error: 'Missing kind/data' }, 400);
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
