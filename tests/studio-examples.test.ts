import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PRESENTATION_EXAMPLES } from '../apps/studio/scripts/examples-data';
import { exampleAssetPaths, exampleProblems, renderExamples, type StudioExamples } from '../apps/studio/scripts/studio-examples';
import { planSlides, TEXT_LANG, AI_LABEL } from '../apps/studio/src/pptx/build';
import { readStudioPages } from '../apps/studio/shared/published-urls';
import { renderStudioPage, islandHtmlOf, studioPageProblems } from '../apps/studio/scripts/studio-page';
import { readStudioSite } from '../apps/studio/scripts/prerender-studio';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'public/studio-examples');
const EVIDENCE = path.join(ROOT, 'reports/seo-growth-20261106/studio');
const studioRequire = createRequire(path.join(ROOT, 'apps/studio/package.json'));
interface Zip { files: Record<string, unknown>; file(name: string): { async(type: 'string'): Promise<string> } | null }
const JSZip = studioRequire('jszip') as { loadAsync(data: Buffer, options?: { checkCRC32: boolean }): Promise<Zip> };
const xmlText = (xml: string) => [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join('\n');

test('public examples are real editable PPTX with exact curated content, not screenshots or macro documents', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'manifest.json'), 'utf8'));
  for (const example of PRESENTATION_EXAMPLES) {
    const bytes = fs.readFileSync(path.join(ASSETS, `${example.id}.pptx`));
    assert.ok(bytes.length < 100_000, 'the public size claim remains true');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.examples.find((row: { id: string }) => row.id === example.id)?.sha256);
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    assert.ok(zip.file('[Content_Types].xml'));
    assert.ok(zip.file('ppt/presentation.xml'));
    assert.ok(!Object.keys(zip.files).some(name => !name.endsWith('/') && /vbaProject|embeddings|activeX|externalLink/i.test(name)));
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
    assert.equal(slides.length, 6);
    const xml = await Promise.all(slides.map(name => zip.file(name)!.async('string')));
    const text = xml.map(xmlText).join('\n');
    for (const expected of [example.deck.title, example.deck.subtitle, ...example.deck.slides.flatMap(s => [s.title, ...s.bullets]), AI_LABEL[example.locale]]) {
      assert.ok(text.includes(expected), `${example.id}: missing editable text ${expected}`);
    }
    assert.ok(xml.every(slide => slide.includes(`lang="${TEXT_LANG[example.locale]}"`) && slide.includes('typeface="Arial"')));
    assert.ok(planSlides(example.deck, new Map()).every(slide => slide.columns.every(column => column.fits)));
    for (const name of Object.keys(zip.files).filter(name => name.endsWith('.rels'))) {
      assert.doesNotMatch(await zip.file(name)!.async('string'), /TargetMode="External"/);
    }
  }
});

test('all previews are actual 960×540 PNGs exported from successfully opened PowerPoint files', () => {
  const checks = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'preview-validation.json'), 'utf8').replace(/^\uFEFF/, ''));
  const manifest = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'manifest.json'), 'utf8'));
  assert.equal(checks.length, 2);
  for (const example of PRESENTATION_EXAMPLES) {
    const check = checks.find((row: { id: string }) => row.id === example.id);
    assert.equal(check?.openedInPowerPoint, true);
    assert.equal(check?.previewRenderer, 'Microsoft PowerPoint');
    assert.equal(check?.slides, 6);
    const pptxHash = createHash('sha256').update(fs.readFileSync(path.join(ASSETS, `${example.id}.pptx`))).digest('hex');
    assert.equal(check?.sourcePptxSha256, pptxHash, 'preview proof must bind the PPTX that is actually shipped');
    assert.equal(check.sourcePptxSha256, manifest.examples.find((row: { id: string }) => row.id === example.id)?.sha256);
    assert.equal(check.previews.length, 6);
    assert.equal(new Set(check.previews.map((row: { file: string }) => row.file)).size, 6);
    for (let i = 1; i <= 6; i++) {
      const image = fs.readFileSync(path.join(ASSETS, `${example.id}-${i}.png`));
      const proof = check.previews.find((row: { file: string }) => row.file === `${example.id}-${i}.png`);
      assert.equal(proof?.slide, i);
      assert.equal(proof?.sha256, createHash('sha256').update(image).digest('hex'), 'each shipped preview must match the PowerPoint export proof');
      assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(image.readUInt32BE(16), 960);
      assert.equal(image.readUInt32BE(20), 540);
    }
  }
  assert.equal(exampleAssetPaths().length, 14);
});

test('examples reject arbitrary paths, duplicate cards and unsupported record fields', () => {
  const record = readStudioPages(ROOT).find(p => p.url === '/ru/prezentatsiya-ai/')!;
  const source = record.data.examples as StudioExamples;
  assert.deepEqual(exampleProblems(source), []);
  for (const id of ['../private', 'https://evil.example/x', '<script>alert(1)</script>']) {
    const value = structuredClone(source); value.cards[0].id = id;
    assert.ok(exampleProblems(value).length);
  }
  assert.ok(exampleProblems({ ...source, arbitrary: true }).length);
  assert.ok(exampleProblems({ ...source, cards: [source.cards[0], source.cards[0]] }).length);
  const escaped = structuredClone(source); escaped.cards[0].title = '<img onerror="test">';
  assert.ok(renderExamples(escaped).includes('&lt;img onerror=&quot;test&quot;&gt;'));
});

test('gallery preserves existing form, SEO head and non-presentation output; download is not a generated-result event', () => {
  const pages = readStudioPages(ROOT);
  const context = { site: readStudioSite(ROOT), pages, siteStyles: ['/assets/site.css'], assets: { script: '/assets/studio/entry.js', styles: ['/assets/studio/entry.css'] } };
  for (const page of pages.filter(p => p.data.examples)) {
    assert.deepEqual(studioPageProblems(page), []);
    const without = { ...page, data: { ...page.data } }; delete without.data.examples;
    const before = renderStudioPage(without, context);
    const after = renderStudioPage(page, context);
    assert.equal(after.split('</head>')[0], before.split('</head>')[0]);
    assert.equal(islandHtmlOf(after), islandHtmlOf(before));
    assert.ok(after.indexOf('id="presentation-examples"') > after.indexOf('id="studio-root"'));
    assert.equal((after.match(/ download="[^"]+\.pptx"/g) ?? []).length, 2);
    assert.match(after, /width="960" height="540" loading="lazy"/);
    assert.doesNotMatch(renderExamples(page.data.examples as StudioExamples), /class="[^"]*\bst:/, 'gallery must not add utility candidates to the stylesheet shared by chat');
    assert.doesNotMatch(renderExamples(page.data.examples as StudioExamples), /<script|onclick|studio_result_ready|studio_download_clicked|purchase/);
    assert.equal(after.replace(renderExamples(page.data.examples as StudioExamples) + '\n', ''), before);
  }
  for (const page of pages.filter(p => p.data.tool !== 'presentation')) {
    assert.doesNotMatch(renderStudioPage(page, context), /presentation-examples|studio-examples\//);
  }
});
