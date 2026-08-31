import { appendGithubEnv, cloudflareProject, required, safeDeployment, sleep, writeJson } from './lib.mjs';

const releaseSha = required('RELEASE_SHA');
const oldDeploymentId = required('EXPECTED_OLD_DEPLOYMENT_ID');
let deployment = null;
for (let attempt = 0; attempt < 48; attempt += 1) {
  const project = await cloudflareProject();
  const current = project.canonical_deployment;
  if (current?.id !== oldDeploymentId
    && current?.environment === 'production'
    && current?.latest_stage?.status === 'success'
    && current?.deployment_trigger?.metadata?.commit_hash === releaseSha) {
    deployment = current;
    break;
  }
  await sleep(5_000);
}
if (!deployment) throw new Error('new production deployment was not observed within four minutes');
writeJson('evidence/new-deployment-safe.json', safeDeployment(deployment));
appendGithubEnv({ NEW_DEPLOYMENT_ID: deployment.id, NEW_DEPLOYMENT_URL: deployment.url });
console.log(`NEW_DEPLOYMENT_ID=${deployment.id}`);
console.log(`NEW_DEPLOYMENT_URL=${deployment.url}`);
