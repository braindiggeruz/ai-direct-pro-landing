import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertCleanRuntime, assertProductionLineage, inspectArtifact, REQUIRED_FEATURES, REQUIRED_RELEASES, runtimeFile,
  verifyStampedArtifact,
} from '../scripts/release/pages-production';

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
  fs.writeFileSync(path.join(dist, 'assets/index-fixture.css'), 'body{margin:0}');
  for (const filename of ['index.html', 'uz/internet-reklama-toshkent/index.html', 'ru/internet-reklama-tashkent/index.html']) {
    fs.appendFileSync(path.join(dist, filename), '<link rel="stylesheet" href="/assets/index-fixture.css">');
  }
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

test('an uncommitted migration blocks the release like uncommitted code', (t) => {
  assert.equal(runtimeFile('migrations/0066_gpt_chat_runtime.sql'), true);
  assert.equal(runtimeFile('functions/api/gpt/chat.ts'), true);
  assert.equal(runtimeFile('docs/agents-platform/HANDOFF.md'), false);
  assert.equal(runtimeFile('tests/pages-production-release.test.ts'), false);

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-pages-release-git-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=release-test', '-c', 'user.email=release-test@example.invalid',
      '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q');
  fs.mkdirSync(path.join(repo, 'migrations'));
  fs.writeFileSync(path.join(repo, 'migrations/0065_applied.sql'), 'SELECT 1;\n');
  git('add', 'migrations/0065_applied.sql');
  git('commit', '-q', '-m', 'base');
  assert.doesNotThrow(() => assertCleanRuntime(repo));

  fs.mkdirSync(path.join(repo, 'docs'));
  fs.writeFileSync(path.join(repo, 'docs/receipt.md'), 'release notes\n');
  assert.doesNotThrow(() => assertCleanRuntime(repo), 'documents alone must not block a release');

  const pending = path.join(repo, 'migrations/0066_pending.sql');
  fs.writeFileSync(pending, 'SELECT 2;\n');
  assert.throws(() => assertCleanRuntime(repo), /Uncommitted runtime files/);

  fs.rmSync(pending);
  fs.appendFileSync(path.join(repo, 'migrations/0065_applied.sql'), '-- edited after review\n');
  assert.throws(() => assertCleanRuntime(repo), /Uncommitted runtime files/);
});

test('release rejects public HTML with admin CSS even when every asset returns 200', t => {
  const dist = fixture(t);
  fs.writeFileSync(path.join(dist, 'assets/AdminRoot-fixture.css'), 'button{color:white}');
  fs.writeFileSync(path.join(dist, 'uz/internet-reklama-toshkent/index.html'), 'Reklama xizmatlari<link rel="stylesheet" href="/assets/AdminRoot-fixture.css">');
  assert.throws(() => inspectArtifact(dist, head), /Missing site stylesheet in public page/);
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
