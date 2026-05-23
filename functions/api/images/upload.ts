// Image upload — commits to /public/assets/{folder}/{filename} via GitHub Contents API.
import type { Env } from '../../_types';
import { requireAuth } from '../../lib/jwt';
import { putFile } from '../../lib/github';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => null) as null | { filename?: string; base64?: string; folder?: string };
  if (!body || !body.filename || !body.base64) return new Response(JSON.stringify({ error: 'filename + base64 required' }), { status: 400 });
  if (body.filename.includes('/') || body.filename.includes('..')) return new Response(JSON.stringify({ error: 'Invalid filename' }), { status: 400 });
  const ext = body.filename.split('.').pop()?.toLowerCase() || '';
  if (!['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) return new Response(JSON.stringify({ error: 'Unsupported format' }), { status: 400 });
  const folder = body.folder === 'blog' ? 'blog' : 'seo';
  let b64 = body.base64;
  if (b64.startsWith('data:')) b64 = b64.split(',', 2)[1] || '';
  // Validate size (4 MiB)
  const approxBytes = Math.floor(b64.length * 0.75);
  if (approxBytes > 4 * 1024 * 1024) return new Response(JSON.stringify({ error: 'Image too large (max 4 MiB)' }), { status: 400 });

  const repoPath = `frontend/public/assets/${folder}/${body.filename}`;
  // putFile expects raw string; for binary we need to commit base64 directly via Contents API.
  // Override: call the Contents API directly with the base64 we already have.
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${repoPath}`;
  // Check existing for sha
  const existingRes = await fetch(`${url}?ref=${env.GITHUB_BRANCH}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'gptbot-seo-admin',
    },
  });
  let sha: string | undefined;
  if (existingRes.ok) {
    const ex = await existingRes.json() as { sha?: string };
    sha = ex.sha;
  }
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gptbot-seo-admin',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `chore(seo): upload image ${body.filename}`,
      content: b64,
      branch: env.GITHUB_BRANCH,
      sha,
    }),
  });
  if (!putRes.ok) return new Response(JSON.stringify({ error: 'GitHub upload failed', detail: await putRes.text() }), { status: 502 });

  const publicUrl = `/assets/${folder}/${body.filename}`;
  // putFile is also fine; suppress unused warning
  void putFile;
  return new Response(JSON.stringify({ ok: true, url: publicUrl, committed: true }), { headers: { 'Content-Type': 'application/json' } });
};
