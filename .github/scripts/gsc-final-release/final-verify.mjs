import fs from 'node:fs';
import {
  cloudflareProject,
  eventually,
  request,
  required,
  safeDeployment,
  writeJson,
} from './lib.mjs';

const releaseSha = required('RELEASE_SHA');
const expected = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));

const finalDeployment = await eventually('final canonical production', async () => {
  const current = (await cloudflareProject()).canonical_deployment;
  if (current?.environment !== 'production'
    || current?.latest_stage?.status !== 'success'
    || current?.deployment_trigger?.metadata?.commit_hash !== releaseSha) {
    throw new Error(`id=${current?.id ?? 'missing'} commit=${current?.deployment_trigger?.metadata?.commit_hash ?? 'missing'}`);
  }
  const manifestResponse = await request(`https://gptbot.uz/gptbot-release.json?final=${Date.now()}`);
  if (!manifestResponse.ok) throw new Error(`apex manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) throw new Error('apex artifact mismatch');
  return current;
}, 36, 5_000);

const blogResponse = await request('https://gptbot.uz/ru/blog/?q=%7Bsearch_term_string%7D', { redirect: 'manual' });
const blogLocation = blogResponse.headers.get('location');
if (blogResponse.status !== 301 || blogLocation !== 'https://gptbot.uz/ru/blog/') {
  throw new Error(`final blog query cleanup mismatch: ${blogResponse.status} ${blogLocation}`);
}

const workerResponse = await request('https://gptbot.uz/api/lead-radar/crawler/jobs', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
});
const workerBody = await workerResponse.json().catch(() => ({}));
if (workerResponse.status !== 401 || workerBody.error !== 'crawler_unauthorized') {
  throw new Error('final worker route contract mismatch');
}

const ownerResponse = await request('https://gptbot.uz/api/admin/lead-radar/crawler/status?companyId=test');
const ownerBody = await ownerResponse.json().catch(() => ({}));
if (ownerResponse.status !== 401 || ownerBody.error !== 'missing_token') {
  throw new Error('final owner route contract mismatch');
}

writeJson('evidence/final-production-safe.json', {
  verifiedAt: new Date().toISOString(),
  deployment: safeDeployment(finalDeployment),
  release: {
    commit: expected.commit,
    artifactSha256: expected.artifactSha256,
    fileCount: expected.fileCount,
  },
  blogQueryCleanup: { status: blogResponse.status, location: blogLocation },
  crawlerRoutesAuthFirst: true,
  manualDeploymentId: process.env.NEW_DEPLOYMENT_ID ?? null,
});
console.log(`FINAL_DEPLOYMENT_ID=${finalDeployment.id}`);
console.log('FINAL_SOURCE_ALIGNMENT=pass');
