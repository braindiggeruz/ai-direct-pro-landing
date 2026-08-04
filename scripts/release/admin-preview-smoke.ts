import { readFile } from 'node:fs/promises';

interface Result {
  path: string;
  status: number;
  contentType: string;
  cacheControl: string;
  robots: string;
  bytes: number;
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function assertPreview(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:'
    || !url.hostname.endsWith('.pages.dev')
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.username
    || url.password
  ) {
    throw new Error('base must be a credential-free Cloudflare Pages preview origin');
  }
  return url.origin;
}

function includesToken(value: string, token: string): boolean {
  return value.toLowerCase().split(/\s*,\s*/).some((part) => part.includes(token));
}

async function request(base: string, path: string): Promise<{ result: Result; body: string }> {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  const body = await response.text();
  return {
    result: {
      path,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      cacheControl: response.headers.get('cache-control') ?? '',
      robots: response.headers.get('x-robots-tag') ?? '',
      bytes: Buffer.byteLength(body),
    },
    body,
  };
}

function assertShell(result: Result, body: string): void {
  if (result.status !== 200) throw new Error(`${result.path}: expected 200, got ${result.status}`);
  if (!result.contentType.includes('text/html')) throw new Error(`${result.path}: expected HTML`);
  if (!includesToken(result.cacheControl, 'no-store')) throw new Error(`${result.path}: missing no-store`);
  if (!result.robots.toLowerCase().includes('noindex')) throw new Error(`${result.path}: missing noindex header`);
  if (!result.robots.toLowerCase().includes('nofollow')) throw new Error(`${result.path}: missing nofollow header`);
  if (!body.includes('id="root"')) throw new Error(`${result.path}: Admin root is absent`);
  if (!/<meta[^>]+robots[^>]+noindex/i.test(body)) throw new Error(`${result.path}: robots meta is absent`);
}

async function main(): Promise<void> {
  const base = assertPreview(arg('--base'));
  const source = arg('--source');
  if (!/^[0-9a-f]{7}$/.test(source)) throw new Error('--source must be a seven-character Git SHA');

  const builtShell = await readFile('dist/admin/index.html', 'utf8');
  const asset = builtShell.match(/src="(\/admin\/assets\/[^"]+\.js)"/)?.[1];
  if (!asset) throw new Error('built Admin entry asset was not found');

  const results: Result[] = [];
  for (const path of ['/admin/', '/admin/listings', '/admin/system']) {
    const response = await request(base, path);
    assertShell(response.result, response.body);
    results.push(response.result);
  }

  const assetResponse = await request(base, asset);
  if (assetResponse.result.status !== 200) throw new Error('Admin entry asset is not reachable');
  if (!assetResponse.result.contentType.includes('javascript')) throw new Error('Admin entry asset is not JavaScript');
  if (/^\s*</.test(assetResponse.body)) throw new Error('Admin asset fell through to HTML');
  for (const token of ['public', 'max-age=31536000', 'immutable']) {
    if (!assetResponse.result.cacheControl.toLowerCase().includes(token)) {
      throw new Error(`Admin entry asset cache policy is missing ${token}`);
    }
  }
  results.push(assetResponse.result);

  const legacy = await request(base, '/admin-tools/agents');
  if (legacy.result.status !== 200 || !legacy.result.contentType.includes('text/html')) {
    throw new Error('legacy Admin fallback is not reachable');
  }
  results.push(legacy.result);

  console.log(JSON.stringify({
    verdict: 'PASS',
    target: `preview:${source}`,
    checks: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
