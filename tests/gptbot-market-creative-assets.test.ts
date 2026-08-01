import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CREATIVE = path.join(ROOT, 'public', 'assets', 'market', 'creative');

interface ManifestAsset {
  id: string;
  group: string;
  locale: string;
  audience: string;
  stage: string;
  cta: string;
  source: string;
  truthStatus: string;
  approvalState: string;
  alt: string;
  editableMaster: string;
  export: string;
}

function manifest(): { generatedAt: string; assets: ManifestAsset[] } {
  return JSON.parse(fs.readFileSync(
    path.join(CREATIVE, 'asset-manifest.json'),
    'utf8',
  )) as { generatedAt: string; assets: ManifestAsset[] };
}

test('creative kit ships editable masters, exports and production metadata', () => {
  const data = manifest();
  assert.equal(data.generatedAt, '2026-08-01');
  assert.ok(data.assets.length >= 33);
  assert.equal(new Set(data.assets.map(({ id }) => id)).size, data.assets.length);
  for (const asset of data.assets) {
    for (const value of [
      asset.audience,
      asset.stage,
      asset.cta,
      asset.source,
      asset.truthStatus,
      asset.approvalState,
      asset.alt,
    ]) {
      assert.ok(value.trim().length > 3, `${asset.id} metadata`);
    }
    const svgPath = path.join(ROOT, 'public', asset.editableMaster);
    const pngPath = path.join(ROOT, 'public', asset.export);
    assert.ok(fs.existsSync(svgPath), asset.editableMaster);
    assert.ok(fs.existsSync(pngPath), asset.export);
    assert.ok(fs.statSync(pngPath).size > 1_000, asset.export);
    const svg = fs.readFileSync(svgPath, 'utf8');
    assert.match(svg, /<title id="title">/);
    assert.match(svg, /<desc id="desc">/);
    assert.match(svg, /SYNTHETIC \/ TEMPLATE/);
    assert.ok(!/<script|(?:href|src)="https?:\/\//i.test(svg), asset.id);
  }
});

test('buyer RU/UZ acquisition minimum and storyboards are present', () => {
  const assets = manifest().assets;
  for (const locale of ['ru', 'uz']) {
    assert.ok(assets.filter(({ id }) =>
      id.startsWith(`buyer-static-${locale}-`)).length >= 3);
    assert.ok(assets.filter(({ id }) =>
      id.startsWith(`buyer-story-${locale}-`)).length >= 3);
  }
  for (const id of [
    'buyer-demo-storyboard-20-30s-ru',
    'buyer-knows-does-not-know-ru',
    'buyer-comparison-creative-ru',
    'buyer-zero-result-ru',
  ]) {
    assert.ok(assets.some((asset) => asset.id === id), id);
  }
});

test('seller, Telegram and website packs cover required owner-independent surfaces', () => {
  const ids = new Set(manifest().assets.map(({ id }) => id));
  for (const id of [
    'seller-pilot-one-pager-ru',
    'seller-qualification-checklist-ru',
    'seller-prepare-card-ru',
    'seller-catalog-import-result-ru',
    'seller-catalog-preview-signoff-ru',
    'seller-catalog-quality-guide-ru',
    'seller-photo-standard-ru',
    'seller-verification-explainer-ru',
    'seller-daily-cockpit-guide-ru',
    'seller-response-sla-template-ru',
    'seller-pilot-result-template-ru',
    'telegram-buyer-preview-ru',
    'telegram-seller-preview-ru',
    'telegram-example-prompt-ru',
    'website-facts-diagram',
    'website-request-timeline',
    'website-trust-illustration',
  ]) {
    assert.ok(ids.has(id), id);
  }
});
