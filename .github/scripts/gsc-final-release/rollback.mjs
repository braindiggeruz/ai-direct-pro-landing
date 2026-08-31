import {
  cloudflareProject,
  eventually,
  request,
  required,
  safeDeployment,
  writeJson,
} from './lib.mjs';

const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const apiToken = required('CLOUDFLARE_API_TOKEN');
const project = required('PROJECT');
const oldDeploymentId = required('EXPECTED_OLD_DEPLOYMENT_ID');
const oldCommit = required('EXPECTED_OLD_COMMIT');
const oldArtifact = required('EXPECTED_OLD_ARTIFACT');

const rollbackResponse = await request(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments/${oldDeploymentId}/rollback`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
    body: '{}',
  },
);
if (!rollbackResponse.ok) throw new Error(`rollback request HTTP ${rollbackResponse.status}`);
const rollbackBody = await rollbackResponse.json().catch(() => ({}));
if (rollbackBody.success === false) throw new Error('Cloudflare rejected rollback request');

const restored = await eventually('canonical rollback deployment', async () => {
  const current = (await cloudflareProject()).canonical_deployment;
  if (current?.id !== oldDeploymentId
    || current?.environment !== 'production'
    || current?.latest_stage?.status !== 'success'
    || current?.deployment_trigger?.metadata?.commit_hash !== oldCommit) {
    throw new Error(`current=${current?.id ?? 'missing'} commit=${current?.deployment_trigger?.metadata?.commit_hash ?? 'missing'}`);
  }
  return current;
}, 72, 5_000);

const apexManifest = await eventually('rollback apex artifact propagation', async () => {
  const response = await request(`https://gptbot.uz/gptbot-release.json?rollback=${Date.now()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.commit !== oldCommit || manifest.artifactSha256 !== oldArtifact) {
    throw new Error(`commit=${manifest.commit} artifact=${manifest.artifactSha256}`);
  }
  return manifest;
}, 72, 5_000);

const immutableResponse = await request(`https://6da93a09.ai-direct-pro-landing.pages.dev/gptbot-release.json?rollback=${Date.now()}`);
if (!immutableResponse.ok) throw new Error(`predecessor immutable manifest HTTP ${immutableResponse.status}`);
const immutableManifest = await immutableResponse.json();
if (immutableManifest.commit !== oldCommit || immutableManifest.artifactSha256 !== oldArtifact) {
  throw new Error('predecessor immutable artifact mismatch');
}

const workerResponse = await request('https://gptbot.uz/api/lead-radar/crawler/jobs', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
});
const workerBody = await workerResponse.json().catch(() => ({}));
if (workerResponse.status !== 401 || workerBody.error !== 'crawler_unauthorized') {
  throw new Error('Local Collector contract was not restored');
}

writeJson('evidence/rollback-safe.json', {
  rolledBackAt: new Date().toISOString(),
  deployment: safeDeployment(restored),
  apex: {
    commit: apexManifest.commit,
    artifactSha256: apexManifest.artifactSha256,
    fileCount: apexManifest.fileCount,
  },
  immutable: {
    commit: immutableManifest.commit,
    artifactSha256: immutableManifest.artifactSha256,
  },
  workerRouteAuthFirst: true,
  status: 'confirmed',
});
console.log('AUTOMATIC_ROLLBACK=confirmed');
