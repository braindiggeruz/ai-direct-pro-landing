import fs from 'node:fs';
import {
  appendGithubEnv,
  canonicalOf,
  eventually,
  request,
  required,
  writeJson,
} from './lib.mjs';

const previewUrl = required('PREVIEW_URL');
const token = required('PROBE_TOKEN');
const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const apiToken = required('CLOUDFLARE_API_TOKEN');
const project = required('PROJECT');
const expectedManifest = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));
const probeUrl = `${previewUrl}/api/internal/release-directory-probe?token=${encodeURIComponent(token)}`;

async function readSnapshot(sample) {
  return eventually(`preview D1 snapshot ${sample}`, async () => {
    const response = await request(`${probeUrl}&sample=${sample}&t=${Date.now()}`);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot;
  }, 20, 3_000);
}

const snapshots = [await readSnapshot(0), await readSnapshot(1)];
const current = snapshots.at(-1);
if (!current.migrations?.some((row) => row.name === '0056_lead_radar_crawler.sql')) {
  throw new Error('crawler migration ledger entry is missing');
}
const names = new Set((current.objects ?? []).map((row) => row.name));
for (const name of [
  'lead_radar_crawler_workers',
  'lead_radar_crawler_jobs',
  'lead_radar_crawler_receipts',
  'lead_radar_crawler_hosts',
  'idx_lr_crawler_workers_org',
  'idx_lr_crawler_jobs_ready',
  'idx_lr_crawler_jobs_company',
  'idx_lr_crawler_jobs_host',
  'idx_lr_crawler_jobs_active_company',
]) {
  if (!names.has(name)) throw new Error(`crawler D1 object is missing: ${name}`);
}
if (Number(current.workers?.count ?? 0) < 1 || Number(current.workers?.active_count ?? 0) < 1) {
  throw new Error('no active Local Collector worker registration exists');
}
for (const snapshot of snapshots) {
  const values = [snapshot.directory?.companyCount, snapshot.directory?.groupCount, snapshot.directory?.elapsedMs];
  if (!values.every(Number.isSafeInteger)) throw new Error('invalid directory projection metrics');
  if (snapshot.directory.elapsedMs > 20_000) {
    throw new Error(`directory projection exceeded 20s safety budget: ${snapshot.directory.elapsedMs}ms`);
  }
}

const manifest = await eventually('preview release manifest', async () => {
  const response = await request(`${previewUrl}/gptbot-release.json?preflight=${Date.now()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value = await response.json();
  if (JSON.stringify(value) !== JSON.stringify(expectedManifest)) throw new Error('manifest mismatch');
  return value;
}, 20, 3_000);

async function expectApexRedirect(path, target) {
  return eventually(`${path} redirect`, async () => {
    const response = await request(`${previewUrl}${path}`, { redirect: 'manual' });
    if (response.status !== 301) throw new Error(`expected 301, got ${response.status}`);
    const location = new URL(response.headers.get('location'), `${previewUrl}${path}`).href;
    if (location !== `https://gptbot.uz${target}`) throw new Error(`unexpected location ${location}`);
    return { status: response.status, location };
  }, 20, 3_000);
}

async function expectLocalOrApexRedirect(path, target) {
  return eventually(`${path} redirect`, async () => {
    const response = await request(`${previewUrl}${path}`, { redirect: 'manual' });
    if (response.status !== 301) throw new Error(`expected 301, got ${response.status}`);
    const location = new URL(response.headers.get('location'), `${previewUrl}${path}`).href;
    const allowed = new Set([`${previewUrl}${target}`, `https://gptbot.uz${target}`]);
    if (!allowed.has(location)) throw new Error(`unexpected location ${location}`);
    return { status: response.status, location };
  }, 20, 3_000);
}

const ruBlogQuery = await expectApexRedirect('/ru/blog/?q=%7Bsearch_term_string%7D', '/ru/blog/');
const uzBlogQuery = await expectApexRedirect('/uz/blog/?q=sinov&utm_source=gsc', '/uz/blog/?utm_source=gsc');
const telegramLegacy = await expectLocalOrApexRedirect('/ru/telegram-bot-uzbekistan/', '/ru/telegram-bot-dlya-biznesa/');
const gptUzLegacy = await expectLocalOrApexRedirect('/gpt-uzbek-tilida/', '/uz/gpt-uzbek-tilida/');
const gptChatLegacy = await expectLocalOrApexRedirect('/gpt-chat/', '/ru/gpt-chat/');

const cleanBlog = await eventually('clean blog index', async () => {
  const response = await request(`${previewUrl}/ru/blog/?utm_source=preflight`);
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const canonical = canonicalOf(html);
  if (canonical !== 'https://gptbot.uz/ru/blog/') throw new Error(`canonical ${canonical}`);
  if (/SearchAction|search_term_string|query-input/.test(html)) throw new Error('obsolete SearchAction remains');
  return { status: response.status, canonical };
}, 20, 3_000);

const article = await eventually('blog article remains static and available', async () => {
  const response = await request(`${previewUrl}/ru/blog/telegram-bot-dlya-biznesa/?preflight=1`);
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const canonical = canonicalOf(html);
  if (canonical !== 'https://gptbot.uz/ru/blog/telegram-bot-dlya-biznesa/') {
    throw new Error(`canonical ${canonical}`);
  }
  return { status: response.status, canonical };
}, 20, 3_000);

const home = await eventually('preview homepage', async () => {
  const response = await request(`${previewUrl}/?preflight=${Date.now()}`);
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (/SearchAction|search_term_string|query-input/.test(html)) throw new Error('obsolete SearchAction remains');
  return { status: response.status };
}, 20, 3_000);

const worker = await eventually('crawler worker auth contract', async () => {
  const response = await request(`${previewUrl}/api/lead-radar/crawler/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 401 || body.error !== 'crawler_unauthorized') {
    throw new Error(`${response.status} ${body.error ?? ''}`);
  }
  return { status: response.status, error: body.error };
}, 20, 3_000);

const owner = await eventually('crawler owner auth contract', async () => {
  const response = await request(`${previewUrl}/api/admin/lead-radar/crawler/status?companyId=test`);
  const body = await response.json().catch(() => ({}));
  if (response.status !== 401 || body.error !== 'missing_token') {
    throw new Error(`${response.status} ${body.error ?? ''}`);
  }
  return { status: response.status, error: body.error };
}, 20, 3_000);

writeJson('evidence/preflight-safe.json', {
  checkedAt: new Date().toISOString(),
  origin: previewUrl,
  manifest: {
    commit: manifest.commit,
    artifactSha256: manifest.artifactSha256,
    fileCount: manifest.fileCount,
  },
  d1: { samples: snapshots },
  routes: {
    ruBlogQuery,
    uzBlogQuery,
    telegramLegacy,
    gptUzLegacy,
    gptChatLegacy,
    cleanBlog,
    article,
    home,
    worker,
    owner,
  },
  result: 'pass',
});

// Cleanup metadata is best-effort only. The verified preview itself and D1
// probes above are release gates; an API listing quirk must not block them.
const deploymentsResponse = await request(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments?per_page=25`,
  { headers: { Authorization: `Bearer ${apiToken}` } },
).catch(() => null);
if (deploymentsResponse?.ok) {
  const deploymentsBody = await deploymentsResponse.json().catch(() => null);
  const deployment = deploymentsBody?.success
    ? (deploymentsBody.result ?? []).find((item) => item.url === previewUrl)
    : null;
  if (deployment?.id) appendGithubEnv({ PREVIEW_DEPLOYMENT_ID: deployment.id });
}

console.log(`DIRECTORY_COMPANIES=${current.directory.companyCount}`);
console.log(`DIRECTORY_GROUPS=${current.directory.groupCount}`);
console.log(`DIRECTORY_ELAPSED_MS=${current.directory.elapsedMs}`);
console.log('LIVE_D1_AND_PAGES_PREFLIGHT=pass');
