import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertProductionLineage, inspectArtifact, REQUIRED_FEATURES, REQUIRED_RELEASES, verifyStampedArtifact } from '../scripts/release/pages-production';

const head = 'a'.repeat(40);
test('production rejects both one-sided branches and unknown production metadata', () => {
  assert.throws(() => assertProductionLineage(head, (sha) => sha !== REQUIRED_RELEASES[0][0]), /Missing released work/);
  assert.throws(() => assertProductionLineage(head, (sha) => sha !== REQUIRED_RELEASES[1][0]), /Missing released work/);
  assert.throws(() => assertProductionLineage(head, (sha) => sha !== head), /another release/);
  assert.throws(() => assertProductionLineage('', () => true), /unknown/);
  assert.doesNotThrow(() => assertProductionLineage(head, () => true));
});

function fixture(t: { after: (fn: () => void) => void }): string {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-pages-release-test-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  for (const dir of ['assets', 'admin', 'uz/internet-reklama-toshkent', 'ru/internet-reklama-tashkent']) {
    fs.mkdirSync(path.join(dist, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(dist, 'assets/AdminRoot-fixture.js'), REQUIRED_FEATURES.map(([, marker]) => marker).join('\n'));
  fs.writeFileSync(path.join(dist, 'assets/index-fixture.js'), 'import("./AdminRoot-fixture.js")');
  fs.writeFileSync(path.join(dist, 'index.html'), '<script src="/assets/index-fixture.js"></script>');
  fs.writeFileSync(path.join(dist, 'admin/index.html'), '<div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'uz/internet-reklama-toshkent/index.html'), 'Reklama xizmatlari');
  fs.writeFileSync(path.join(dist, 'ru/internet-reklama-tashkent/index.html'), 'Услуги продвижения');
  return dist;
}

test('old admin build is rejected even with a valid public SEO site', (t) => {
  const dist = fixture(t);
  fs.writeFileSync(path.join(dist, 'assets/AdminRoot-fixture.js'), 'Legacy lead search only');
  assert.throws(() => inspectArtifact(dist, head), /Missing production feature: audience_directory/);
});

test('unused new chunks cannot conceal a regressed entry point', (t) => {
  const dist = fixture(t);
  fs.writeFileSync(path.join(dist, 'assets/index-fixture.js'), 'Legacy entry without admin import');
  assert.throws(() => inspectArtifact(dist, head), /Missing production feature/);
});

test('each released capability and both SEO footers are mandatory', (t) => {
  const dist = fixture(t);
  const script = path.join(dist, 'assets/AdminRoot-fixture.js');
  for (const [id] of REQUIRED_FEATURES) {
    fs.writeFileSync(script, REQUIRED_FEATURES.filter(([key]) => key !== id).map(([, marker]) => marker).join('\n'));
    assert.throws(() => inspectArtifact(dist, head), new RegExp(`Missing production feature: ${id}`));
  }
  fs.writeFileSync(script, REQUIRED_FEATURES.map(([, marker]) => marker).join('\n'));
  fs.writeFileSync(path.join(dist, 'uz/internet-reklama-toshkent/index.html'), 'old SEO');
  assert.throws(() => inspectArtifact(dist, head), /Missing production page/);
});

test('stamp binds the entire artifact to its reviewed source commit', (t) => {
  const dist = fixture(t);
  const stamp = inspectArtifact(dist, head);
  fs.writeFileSync(path.join(dist, 'gptbot-release.json'), JSON.stringify(stamp));
  assert.deepEqual(verifyStampedArtifact(dist, head), stamp);
  assert.throws(() => verifyStampedArtifact(dist, 'b'.repeat(40)), /stale/);
  fs.writeFileSync(path.join(dist, 'extra.html'), 'another worktree build');
  assert.throws(() => verifyStampedArtifact(dist, head), /stale/);
});

test('top-level Lead Radar still composes directory, account and readiness controls', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const page = fs.readFileSync(path.join(root, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx'), 'utf8');
  assert.match(page, /<TelegramContactDirectory\b/);
  assert.match(page, /<TelegramAccountCampaignPanel\b/);
  assert.match(page, /Все Telegram-контакты и кампании/);
  assert.match(panel, /<CampaignReadiness\b/);
});
