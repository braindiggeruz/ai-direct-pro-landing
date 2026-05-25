// Thin GitHub Contents-API helper. Works in Cloudflare Workers runtime (no Node).
// Used by /api/content/* function routes to read & commit JSON files in the repo.
import type { Env } from '../_types';

const GH_API = 'https://api.github.com';

function headers(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gptbot-seo-admin',
  };
}

export async function getFile(env: Env, filePath: string): Promise<{ content: string; sha: string } | null> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: headers(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub getFile ${filePath} failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { content: string; sha: string; encoding: string };
  // CRITICAL: atob() returns a Latin-1 binary string. We must decode it as UTF-8
  // to correctly read Cyrillic / Uzbek Latin characters. Using atob() alone
  // produces mojibake (e.g. "AI-Ð…" instead of "AI-бот для бизнеса").
  let content: string;
  if (data.encoding === 'base64') {
    const binary = atob(data.content.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    content = new TextDecoder('utf-8').decode(bytes);
  } else {
    content = data.content;
  }
  return { content, sha: data.sha };
}

export async function listDir(env: Env, dirPath: string): Promise<string[]> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${dirPath}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: headers(env) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub listDir ${dirPath} failed: ${res.status}`);
  const items = await res.json() as Array<{ name: string; type: string; path: string }>;
  const files: string[] = [];
  for (const item of items) {
    if (item.type === 'file') files.push(item.path);
    else if (item.type === 'dir') {
      const sub = await listDir(env, item.path);
      files.push(...sub);
    }
  }
  return files;
}

export async function putFile(env: Env, filePath: string, content: string, message: string): Promise<void> {
  const existing = await getFile(env, filePath);
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  // CRITICAL: Encode content as UTF-8 bytes, then base64. Cloudflare runtime has btoa()
  // but it only works on Latin-1 strings. Using TextEncoder ensures Cyrillic /
  // Uzbek Latin characters survive the round-trip without mojibake.
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const encoded = btoa(binary);
  const body = JSON.stringify({
    message,
    content: encoded,
    branch: env.GITHUB_BRANCH,
    sha: existing?.sha,
  });
  const res = await fetch(url, { method: 'PUT', headers: { ...headers(env), 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`GitHub putFile ${filePath} failed: ${res.status} ${await res.text()}`);
}

export async function deleteFile(env: Env, filePath: string, message: string): Promise<void> {
  const existing = await getFile(env, filePath);
  if (!existing) return;
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  const body = JSON.stringify({ message, sha: existing.sha, branch: env.GITHUB_BRANCH });
  const res = await fetch(url, { method: 'DELETE', headers: { ...headers(env), 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`GitHub deleteFile ${filePath} failed: ${res.status} ${await res.text()}`);
}
