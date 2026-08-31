import { cloudflareProject, request, required } from './lib.mjs';

const oldDeploymentId = required('EXPECTED_OLD_DEPLOYMENT_ID');
const oldCommit = required('EXPECTED_OLD_COMMIT');
const oldArtifact = required('EXPECTED_OLD_ARTIFACT');
const project = await cloudflareProject();
const current = project.canonical_deployment;
if (!current
  || current.id !== oldDeploymentId
  || current.environment !== 'production'
  || current.latest_stage?.status !== 'success'
  || current.deployment_trigger?.metadata?.commit_hash !== oldCommit) {
  throw new Error('production changed during verification; upload aborted');
}
const manifestResponse = await request(`https://gptbot.uz/gptbot-release.json?race=${Date.now()}`);
if (!manifestResponse.ok) throw new Error(`apex release manifest HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.commit !== oldCommit || manifest.artifactSha256 !== oldArtifact) {
  throw new Error('apex artifact changed during verification');
}
console.log('FINAL_RACE_GUARD=pass');
