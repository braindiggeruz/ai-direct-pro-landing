import crypto from 'node:crypto';
import fs from 'node:fs';

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable: ${name}`);
  return value;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function request(url, options = {}, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
        ...options,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(600 * attempt);
    }
  }
  throw lastError;
}

export async function cloudflareProject() {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const token = required('CLOUDFLARE_API_TOKEN');
  const project = required('PROJECT');
  const response = await request(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Cloudflare project HTTP ${response.status}`);
  const body = await response.json();
  if (!body.success || !body.result) throw new Error('Cloudflare project lookup failed');
  return body.result;
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function writeJson(path, value) {
  fs.mkdirSync(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.', { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function appendGithubEnv(values) {
  const target = required('GITHUB_ENV');
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value)}`).join('\n');
  fs.appendFileSync(target, `${lines}\n`, 'utf8');
}

export function canonicalOf(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/\brel=["'][^"']*canonical[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href) return href;
  }
  return null;
}

export function safeDeployment(item) {
  return {
    id: item?.id ?? null,
    url: item?.url ?? null,
    environment: item?.environment ?? null,
    status: item?.latest_stage?.status ?? null,
    createdOn: item?.created_on ?? null,
    modifiedOn: item?.modified_on ?? null,
    branch: item?.deployment_trigger?.metadata?.branch ?? null,
    commit: item?.deployment_trigger?.metadata?.commit_hash ?? null,
    commitMessage: item?.deployment_trigger?.metadata?.commit_message ?? null,
    commitDirty: item?.deployment_trigger?.metadata?.commit_dirty ?? null,
    aliases: item?.aliases ?? [],
  };
}
