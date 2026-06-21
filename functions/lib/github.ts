// Thin GitHub Contents-API helper. Works in Cloudflare Workers runtime (no Node).
// Used by /api/content/* function routes to read & commit JSON files in the repo.
import type { Env } from '../_types';

const GH_API = 'https://api.github.com';

// Sane defaults used when the corresponding env var was forgotten in the
// Cloudflare Pages deployment config. This is exactly what hit production
// on 2026-06-21: only GITHUB_TOKEN was set, GITHUB_OWNER/REPO/BRANCH were
// missing, so every GitHub call went to /repos/undefined/undefined and
// the cockpit went red. Defaults make the deploy self-healing.
const DEFAULT_OWNER  = 'braindiggeruz';
const DEFAULT_REPO   = 'ai-direct-pro-landing';
const DEFAULT_BRANCH = 'main';

export function ghOwner(env: Env): string  { return env.GITHUB_OWNER  || DEFAULT_OWNER; }
export function ghRepo(env: Env): string   { return env.GITHUB_REPO   || DEFAULT_REPO; }
export function ghBranch(env: Env): string { return env.GITHUB_BRANCH || DEFAULT_BRANCH; }

function headers(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'gptbot-seo-admin',
  };
}

export async function getFile(env: Env, filePath: string): Promise<{ content: string; sha: string } | null> {
  const url = `${GH_API}/repos/${ghOwner(env)}/${ghRepo(env)}/contents/${filePath}?ref=${ghBranch(env)}`;
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
  const url = `${GH_API}/repos/${ghOwner(env)}/${ghRepo(env)}/contents/${dirPath}?ref=${ghBranch(env)}`;
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
  const url = `${GH_API}/repos/${ghOwner(env)}/${ghRepo(env)}/contents/${filePath}`;
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
    branch: ghBranch(env),
    sha: existing?.sha,
  });
  const res = await fetch(url, { method: 'PUT', headers: { ...headers(env), 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`GitHub putFile ${filePath} failed: ${res.status} ${await res.text()}`);
}

export async function deleteFile(env: Env, filePath: string, message: string): Promise<void> {
  const existing = await getFile(env, filePath);
  if (!existing) return;
  const url = `${GH_API}/repos/${ghOwner(env)}/${ghRepo(env)}/contents/${filePath}`;
  const body = JSON.stringify({ message, sha: existing.sha, branch: ghBranch(env) });
  const res = await fetch(url, { method: 'DELETE', headers: { ...headers(env), 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`GitHub deleteFile ${filePath} failed: ${res.status} ${await res.text()}`);
}

// --- Bulk read path -----------------------------------------------------
//
// The Cloudflare Workers FREE runtime caps each invocation at 50 subrequests.
// /api/content GET used to do ~5 listDir() + 1 fetch per file = 50+ once
// the corpus grew past ~40 JSON files. After session 3 (30 pages + 16 blog
// + 3 SEO configs) every authenticated GET to /api/content / /api/audit
// threw `Too many subrequests by single Worker invocation`.
//
// readContentBulk() solves it by traversing the entire `content/` tree
// inside ONE GitHub GraphQL request. Depth-5 covers
// `content/{pages|blog}/{locale}/*.json` and the flat `content/{global,seo}/*.json`.
// One subrequest, regardless of how many JSON files live under content/.
//
// Auth-only sprint scope: pure bulk-fetch, no semantic change to the API
// response shape that the admin SPA consumes.
type Blob = { __typename: 'Blob'; text: string };
type Tree = { __typename: 'Tree'; entries?: Entry[] };
type Entry = { name: string; type: 'tree' | 'blob'; object: Blob | Tree | null };

function flatten(prefix: string, entries: Entry[] | null | undefined, out: Record<string, string>): void {
  if (!entries) return;
  for (const e of entries) {
    const p = `${prefix}/${e.name}`;
    if (e.type === 'blob' && e.object && (e.object as Blob).text !== undefined) {
      out[p] = (e.object as Blob).text;
    } else if (e.type === 'tree' && e.object) {
      flatten(p, (e.object as Tree).entries, out);
    }
  }
}

export async function readContentBulk(env: Env): Promise<Record<string, string>> {
  const query = `query($owner:String!,$repo:String!,$expr:String!){
    repository(owner:$owner,name:$repo){
      object(expression:$expr){
        ... on Tree { entries { name type object {
          __typename
          ... on Blob { text }
          ... on Tree { entries { name type object {
            __typename
            ... on Blob { text }
            ... on Tree { entries { name type object {
              __typename
              ... on Blob { text }
              ... on Tree { entries { name type object {
                __typename
                ... on Blob { text }
              } } }
            } } }
          } } }
        } } }
      }
    }
  }`;
  const res = await fetch(`${GH_API}/graphql`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { owner: ghOwner(env), repo: ghRepo(env), expr: `${ghBranch(env)}:content` } }),
  });
  if (!res.ok) throw new Error(`GitHub graphql failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { data?: { repository?: { object?: Tree } }; errors?: unknown[] };
  if (data.errors && data.errors.length) throw new Error(`GitHub graphql errors: ${JSON.stringify(data.errors)}`);
  const out: Record<string, string> = {};
  flatten('content', data.data?.repository?.object?.entries, out);
  return out;
}

/**
 * Functional health check used by /api/admin/cockpit health section.
 *
 * Performs a *real* round-trip: auth → repo → branch → read one blob.
 * Catches every failure mode separately so the cockpit can report "limited"
 * (token works, can list repo, but `content/global/site.json` is missing)
 * vs. "down" (token rejected, repo unreachable, GraphQL errors).
 */
export interface GitHubHealth {
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

export async function checkGitHubHealth(env: Env): Promise<GitHubHealth> {
  const owner = ghOwner(env);
  const repo = ghRepo(env);
  const branch = ghBranch(env);
  const baseDetail = {
    token_present: !!env.GITHUB_TOKEN,
    auth_ok: null as boolean | null,
    repo_reachable: null as boolean | null,
    branch_reachable: null as boolean | null,
    content_readable: null as boolean | null,
    sample_file: null as string | null,
    sample_bytes: null as number | null,
    error: null as string | null,
  };

  if (!env.GITHUB_TOKEN) {
    return { ok: false, level: 'not_configured', owner, repo, branch, details: baseDetail };
  }

  // Combined GraphQL: viewer → repository → ref → known blob, single subrequest.
  const query = `query($owner:String!,$repo:String!,$expr:String!){
    viewer { login }
    repository(owner:$owner,name:$repo){
      name
      defaultBranchRef { name }
      ref(qualifiedName:$expr){ name target { oid } }
      object(expression:"HEAD:content/global/site.json"){ ... on Blob { byteSize } }
    }
  }`;
  try {
    const res = await fetch(`${GH_API}/graphql`, {
      method: 'POST',
      headers: { ...headers(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, repo, expr: `refs/heads/${branch}` } }),
    });
    const detail = { ...baseDetail };
    if (res.status === 401) {
      detail.auth_ok = false;
      detail.error = 'GitHub PAT rejected (401)';
      return { ok: false, level: 'failed', owner, repo, branch, details: detail };
    }
    if (!res.ok) {
      detail.error = `GitHub HTTP ${res.status}`;
      return { ok: false, level: 'failed', owner, repo, branch, details: detail };
    }
    const body = await res.json() as {
      data?: { viewer?: { login: string }; repository?: { name: string; defaultBranchRef?: { name: string }; ref?: { name: string }; object?: { byteSize?: number } } };
      errors?: Array<{ message: string }>;
    };
    detail.auth_ok = !!body.data?.viewer?.login;
    detail.repo_reachable = !!body.data?.repository?.name;
    detail.branch_reachable = !!body.data?.repository?.ref?.name;
    detail.content_readable = (body.data?.repository?.object?.byteSize ?? 0) > 0;
    detail.sample_file = 'content/global/site.json';
    detail.sample_bytes = body.data?.repository?.object?.byteSize ?? null;
    if (body.errors?.length) {
      detail.error = body.errors.map((e) => e.message).join('; ').slice(0, 240);
    }
    if (!detail.auth_ok) return { ok: false, level: 'failed', owner, repo, branch, details: detail };
    if (!detail.repo_reachable) return { ok: false, level: 'failed', owner, repo, branch, details: detail };
    if (!detail.branch_reachable) return { ok: false, level: 'limited', owner, repo, branch, details: detail };
    if (!detail.content_readable) return { ok: false, level: 'limited', owner, repo, branch, details: detail };
    return { ok: true, level: 'healthy', owner, repo, branch, details: detail };
  } catch (e) {
    return {
      ok: false, level: 'failed', owner, repo, branch,
      details: { ...baseDetail, error: (e as Error)?.message?.slice(0, 240) || 'fetch failed' },
    };
  }
}
