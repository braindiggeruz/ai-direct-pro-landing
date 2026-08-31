import { cloudflareProject, request, required, sleep, writeJson } from './lib.mjs';

const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const apiToken = required('CLOUDFLARE_API_TOKEN');
const project = required('PROJECT');
const oldDeploymentId = required('EXPECTED_OLD_DEPLOYMENT_ID');
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

let restored = false;
for (let attempt = 0; attempt < 36; attempt += 1) {
  const current = (await cloudflareProject()).canonical_deployment;
  if (current?.id === oldDeploymentId && current?.latest_stage?.status === 'success') {
    restored = true;
    break;
  }
  await sleep(5_000);
}
if (!restored) throw new Error('automatic rollback was not confirmed');
const manifestResponse = await request(`https://gptbot.uz/gptbot-release.json?rollback=${Date.now()}`);
if (!manifestResponse.ok) throw new Error(`rollback manifest HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.artifactSha256 !== oldArtifact) throw new Error('rollback artifact mismatch');
writeJson('evidence/rollback-safe.json', {
  rolledBackAt: new Date().toISOString(),
  deploymentId: oldDeploymentId,
  artifactSha256: manifest.artifactSha256,
  status: 'confirmed',
});
console.log('AUTOMATIC_ROLLBACK=confirmed');
