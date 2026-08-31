import fs from 'node:fs';
import { cloudflareProject, request, required, safeDeployment, sleep, writeJson } from './lib.mjs';

const releaseSha = required('RELEASE_SHA');
const expected = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));
let finalDeployment = null;
for (let attempt = 0; attempt < 24; attempt += 1) {
  const current = (await cloudflareProject()).canonical_deployment;
  if (current?.latest_stage?.status === 'success'
    && current?.deployment_trigger?.metadata?.commit_hash === releaseSha) {
    const manifestResponse = await request(`https://gptbot.uz/gptbot-release.json?final=${Date.now()}`);
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      if (JSON.stringify(manifest) === JSON.stringify(expected)) {
        finalDeployment = current;
        break;
      }
    }
  }
  await sleep(5_000);
}
if (!finalDeployment) throw new Error('final canonical deployment or apex artifact does not match the release');
writeJson('evidence/final-production-safe.json', {
  verifiedAt: new Date().toISOString(),
  ...safeDeployment(finalDeployment),
  manualDeploymentId: process.env.NEW_DEPLOYMENT_ID ?? null,
});
console.log(`FINAL_DEPLOYMENT_ID=${finalDeployment.id}`);
console.log('FINAL_SOURCE_ALIGNMENT=pass');
