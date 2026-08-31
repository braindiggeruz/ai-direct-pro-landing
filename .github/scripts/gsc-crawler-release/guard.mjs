import { cloudflareProject, request, required, safeDeployment, sha256, writeJson } from './lib.mjs';

const oldDeploymentId = required('EXPECTED_OLD_DEPLOYMENT_ID');
const oldCommit = required('EXPECTED_OLD_COMMIT');
const oldArtifact = required('EXPECTED_OLD_ARTIFACT');
const oldAdminHash = required('EXPECTED_OLD_ADMIN_HASH');

const project = await cloudflareProject();
const current = project.canonical_deployment;
if (!current) throw new Error('canonical production deployment is missing');
if (current.id !== oldDeploymentId) throw new Error(`production race: expected ${oldDeploymentId}, got ${current.id}`);
if (current.environment !== 'production' || current.latest_stage?.status !== 'success') {
  throw new Error('current production is not a successful production deployment');
}
if (current.deployment_trigger?.metadata?.commit_hash !== oldCommit) {
  throw new Error(`production commit drift: ${current.deployment_trigger?.metadata?.commit_hash}`);
}
if (current.deployment_trigger?.metadata?.commit_dirty !== true) {
  throw new Error('expected dirty live Functions superset metadata is absent');
}

const origins = ['https://gptbot.uz', current.url];
const manifests = {};
for (const origin of origins) {
  const manifestResponse = await request(`${origin}/gptbot-release.json?guard=${Date.now()}`);
  if (!manifestResponse.ok) throw new Error(`${origin}: manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest.commit !== oldCommit || manifest.artifactSha256 !== oldArtifact || manifest.fileCount !== 870) {
    throw new Error(`${origin}: live release manifest does not match the inspected predecessor`);
  }
  const admin = manifest.probes?.find((item) => /^assets\/AdminRoot-.*\.js$/.test(item.path));
  if (!admin || admin.sha256 !== oldAdminHash) throw new Error(`${origin}: live admin probe mismatch`);
  const adminResponse = await request(`${origin}/${admin.path}?guard=${Date.now()}`);
  if (!adminResponse.ok) throw new Error(`${origin}: admin asset HTTP ${adminResponse.status}`);
  const adminBytes = new Uint8Array(await adminResponse.arrayBuffer());
  if (sha256(adminBytes) !== oldAdminHash) throw new Error(`${origin}: live admin bytes changed`);
  const adminText = new TextDecoder().decode(adminBytes);
  for (const marker of ['Локальный сборщик', 'Собрать контакты с сайта']) {
    if (!adminText.includes(marker)) throw new Error(`${origin}: Local Collector marker missing: ${marker}`);
  }
  manifests[origin] = {
    commit: manifest.commit,
    artifactSha256: manifest.artifactSha256,
    fileCount: manifest.fileCount,
    adminPath: admin.path,
    adminSha256: admin.sha256,
  };
}

const workerResponse = await request(`${current.url}/api/lead-radar/crawler/jobs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
const workerBody = await workerResponse.json().catch(() => ({}));
if (workerResponse.status !== 401 || workerBody.error !== 'crawler_unauthorized') {
  throw new Error('current Local Collector worker route contract is not present');
}

writeJson('evidence/predeploy-safe.json', {
  checkedAt: new Date().toISOString(),
  deployment: safeDeployment(current),
  source: {
    productionBranch: project.source?.config?.production_branch ?? null,
    productionDeploymentsEnabled: project.source?.config?.production_deployments_enabled ?? null,
  },
  manifests,
  workerRouteAuthFirst: true,
});
console.log('PREDEPLOY_GUARD=pass');
