import { appendGithubEnv, request, required, sleep, writeJson } from './lib.mjs';

const previewUrl = required('PREVIEW_URL');
const token = required('PROBE_TOKEN');
const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const apiToken = required('CLOUDFLARE_API_TOKEN');
const project = required('PROJECT');
const probeUrl = `${previewUrl}/api/internal/release-directory-probe?token=${encodeURIComponent(token)}`;

async function readSnapshot(sample) {
  let lastStatus = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request(`${probeUrl}&sample=${sample}&t=${Date.now()}`).catch(() => null);
    lastStatus = response?.status ?? null;
    if (response?.status === 200) {
      const snapshot = await response.json();
      if (snapshot.error) throw new Error(snapshot.error);
      return snapshot;
    }
    await sleep(3_000);
  }
  throw new Error(`preview directory probe HTTP ${lastStatus}`);
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

const deploymentsResponse = await request(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments?env=preview&per_page=50`,
  { headers: { Authorization: `Bearer ${apiToken}` } },
);
if (!deploymentsResponse.ok) throw new Error(`preview deployment list HTTP ${deploymentsResponse.status}`);
const deploymentsBody = await deploymentsResponse.json();
if (!deploymentsBody.success) throw new Error('preview deployment list failed');
const deployment = (deploymentsBody.result ?? []).find((item) => item.url === previewUrl);
if (!deployment?.id) throw new Error(`preview deployment id not found for ${previewUrl}`);

writeJson('evidence/directory-predeploy-safe.json', { samples: snapshots });
appendGithubEnv({ PREVIEW_DEPLOYMENT_ID: deployment.id });
console.log(`DIRECTORY_COMPANIES=${current.directory.companyCount}`);
console.log(`DIRECTORY_GROUPS=${current.directory.groupCount}`);
console.log(`DIRECTORY_ELAPSED_MS=${current.directory.elapsedMs}`);
console.log('LIVE_D1_PREFLIGHT=pass');
