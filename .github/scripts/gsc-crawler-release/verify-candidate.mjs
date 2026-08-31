import fs from 'node:fs';
import { required, sha256, writeJson } from './lib.mjs';

const releaseSha = required('RELEASE_SHA');
const manifest = JSON.parse(fs.readFileSync('dist/gptbot-release.json', 'utf8'));
if (manifest.commit !== releaseSha) throw new Error(`candidate release stamp mismatch: ${manifest.commit}`);
if (manifest.fileCount !== 870) throw new Error(`candidate file count mismatch: ${manifest.fileCount}`);
for (const feature of ['audience_directory','mobile_username_selection','bridge_pairing','sending_readiness','campaign_preflight','async_media_check']) {
  if (!manifest.features.includes(feature)) throw new Error(`candidate feature missing: ${feature}`);
}
const admin = manifest.probes?.find((item) => /^assets\/AdminRoot-.*\.js$/.test(item.path));
if (!admin) throw new Error('candidate admin probe is missing');
const adminBytes = fs.readFileSync(`dist/${admin.path}`);
if (sha256(adminBytes) !== admin.sha256) throw new Error('candidate admin probe hash mismatch');
const adminText = adminBytes.toString('utf8');
for (const marker of [
  'Локальный сборщик',
  'Собрать контакты с сайта',
  '/api/admin/lead-radar/crawler/status',
  '/api/admin/lead-radar/crawler/jobs',
]) {
  if (!adminText.includes(marker)) throw new Error(`candidate Local Collector marker missing: ${marker}`);
}
writeJson('evidence/candidate-safe.json', manifest);
console.log(`CANDIDATE_ARTIFACT=${manifest.artifactSha256}`);
console.log('CANDIDATE_VERIFY=pass');
