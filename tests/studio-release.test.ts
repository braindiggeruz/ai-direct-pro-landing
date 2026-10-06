// The content of release R-ST1, prepared in advance (apps/studio/scripts/
// release-content.ts): the two studio pages go from draft to published, and
// in the same commit the slide guide, /ru/gpt-dlya-ucheby/ and the intent
// manifest gain what points at them (STUDIO-SPEC §11.5–§11.7, §13.1).
//
// Before the release day the edits are applied to a copy of content/ and the
// SEO suites run on the copy, so the day's commit is known to pass; and the
// same edits with the pages left as drafts must show broken links (the guide
// → /uz/taqdimot-ai/, /ru/gpt-dlya-ucheby/ → /ru/prezentatsiya-ai/). After the
// release has been applied in the repository, the edits no longer fit and
// these tests check that instead.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildCockpit, STATIC_ROUTES } from '../src/shared/audit';
import type { Redirect } from '../src/shared/types';
import {
  GUIDE_TOOL_LINK,
  RELEASE_DATE,
  R_ST1,
  STUDY_TOOL_LINK,
  applyRelease,
  assertReleaseDate,
  readFrom,
  writeRelease,
  type ContentRelease,
} from '../apps/studio/scripts/release-content';
import { publishedStudioUrls, readStudioPages, studioSitemapEntries } from '../apps/studio/shared/published-urls';
import { documentLinks, linksToUnservedStudioPages, readDocs } from './helpers/studio-content';

type Cleanup = { after: (fn: () => void) => void };

const REPO = path.resolve(import.meta.dirname, '..');
const DAY = '2026-10-22';
const GUIDE = 'content/blog/uz/slayd-tayyorlash.json';
const STUDY = 'content/pages/ru/gpt-dlya-ucheby.json';

const released = R_ST1.publishes.every(url => readStudioPages(REPO).find(page => page.url === url)?.status === 'published');

function tempCopy(t: Cleanup): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-studio-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(REPO, 'content'), path.join(root, 'content'), { recursive: true });
  // The two other files the SEO suites read from the root (seo-link-graph, seo-page-integrity).
  for (const file of ['public/llms.txt', 'scripts/prerender.ts']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(REPO, file), path.join(root, file));
  }
  return root;
}

const json = (files: Map<string, string>, file: string) => JSON.parse(files.get(file) as string) as Record<string, unknown>;
const onDisk = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Record<string, unknown>;

test('r-st1: the release is the two tool pages, and every edit names its reason', () => {
  assert.deepEqual(R_ST1.publishes, ['/uz/taqdimot-ai/', '/ru/prezentatsiya-ai/']);
  for (const edit of R_ST1.edits) {
    assert.ok(edit.why.length > 10, edit.file);
    assert.ok(edit.find.length > 0 && edit.find !== edit.replace, edit.why);
  }
  for (const date of ['22.10.2026', '2026-02-30', '', '2026-10-22T00:00']) assert.throws(() => assertReleaseDate(date), /Not a calendar day/);
  assert.doesNotThrow(() => assertReleaseDate(DAY));
});

test('r-st1: every edit fits the current files exactly once (or, after the release, none does)', () => {
  if (released) {
    assert.throws(() => applyRelease(R_ST1, DAY, readFrom(REPO)), /occurs 0 times/);
    return;
  }
  const files = applyRelease(R_ST1, DAY, readFrom(REPO));
  assert.deepEqual([...files.keys()].sort(), [
    'content/blog/uz/slayd-tayyorlash.json', 'content/pages/ru/gpt-dlya-ucheby.json', 'content/seo/intent-manifest.json',
    'content/studio/pages/ru/prezentatsiya-ai.json', 'content/studio/pages/uz/taqdimot-ai.json',
  ]);
  for (const content of files.values()) assert.ok(!content.includes(RELEASE_DATE), 'the date placeholder is filled');
  // A broken edit stops the whole release, naming every edit that does not fit.
  const broken: ContentRelease = { ...R_ST1, edits: [...R_ST1.edits, { file: GUIDE, why: 'a sentence that is not there', find: 'no such sentence', replace: 'x' }] };
  assert.throws(() => applyRelease(broken, DAY, readFrom(REPO)), /a sentence that is not there.*occurs 0 times/);
});

test('r-st1: the guide keeps its frozen fields; /ru/gpt-dlya-ucheby/ changes in its body only, by one link', { skip: released && 'R-ST1 is applied' }, () => {
  const files = applyRelease(R_ST1, DAY, readFrom(REPO));
  const guideBefore = onDisk(GUIDE);
  const guideAfter = json(files, GUIDE);
  for (const field of ['url', 'title', 'status', 'robotsIndex', 'locale', 'datePublished', 'h1', 'canonical', 'slug']) {
    assert.deepEqual(guideAfter[field], guideBefore[field], `guide ${field}`);
  }
  assert.equal(guideAfter.dateModified, DAY);
  assert.deepEqual((guideBefore.keywords as string[]).filter(k => !(guideAfter.keywords as string[]).includes(k)), ['slayd yaratish']);
  assert.deepEqual(documentLinks(guideAfter as never).filter(l => l.target === GUIDE_TOOL_LINK.target).map(l => l.anchor), ['Taqdimot AI']);
  // The guide's FAQ keeps its questions; only the answer about a ready .pptx changes.
  assert.deepEqual((guideAfter.faq as Array<{ q: string }>).map(f => f.q), (guideBefore.faq as Array<{ q: string }>).map(f => f.q));

  const studyBefore = onDisk(STUDY);
  const studyAfter = json(files, STUDY);
  for (const key of new Set([...Object.keys(studyBefore), ...Object.keys(studyAfter)])) {
    if (key !== 'bodyBlocks') assert.deepEqual(studyAfter[key], studyBefore[key], `/ru/gpt-dlya-ucheby/ ${key}`);
  }
  const blocksBefore = studyBefore.bodyBlocks as unknown[];
  const blocksAfter = studyAfter.bodyBlocks as Array<{ links?: Array<{ target: string; anchor: string }> }>;
  assert.equal(blocksAfter.length, blocksBefore.length + 1);
  const added = blocksAfter.filter(block => !blocksBefore.some(old => JSON.stringify(old) === JSON.stringify(block)));
  assert.equal(added.length, 1);
  assert.deepEqual(added[0].links?.map(l => [l.target, l.anchor]), [[STUDY_TOOL_LINK.target, STUDY_TOOL_LINK.anchor]]);

  for (const file of ['content/studio/pages/uz/taqdimot-ai.json', 'content/studio/pages/ru/prezentatsiya-ai.json']) {
    assert.equal(json(files, file).status, 'published', file);
    assert.equal(json(files, file).updatedAt, DAY, file);
  }
  const manifest = json(files, 'content/seo/intent-manifest.json') as { updatedAt: string; pairs: Array<{ id: string; decidedAt: string }>; architectureDecisions: Array<{ id: string; decidedAt: string }> };
  assert.equal(manifest.updatedAt, DAY);
  assert.equal(manifest.pairs.at(-1)?.id, 'C40-uz-taqdimot-tool-vs-guide');
  assert.equal(manifest.pairs.at(-1)?.decidedAt, DAY);
  assert.equal(manifest.architectureDecisions.at(-1)?.id, 'A5-ru-prezentatsiya-tool-vs-gpt-chat');
  assert.equal(manifest.architectureDecisions.at(-1)?.decidedAt, DAY);
});

test('r-st1: applied once to a copy, it cannot be applied twice', { skip: released && 'R-ST1 is applied' }, t => {
  const root = tempCopy(t);
  writeRelease(root, applyRelease(R_ST1, DAY, readFrom(root)));
  assert.deepEqual(publishedStudioUrls(root).sort(), [...R_ST1.publishes].sort());
  assert.throws(() => applyRelease(R_ST1, DAY, readFrom(root)), /occurs 0 times/);
});

test('r-st1: with the pages still drafts, the same edits leave the two new links broken', { skip: released && 'R-ST1 is applied' }, t => {
  const root = tempCopy(t);
  const withoutPublishing: ContentRelease = { ...R_ST1, edits: R_ST1.edits.filter(edit => !edit.find.includes('"status"')) };
  writeRelease(root, applyRelease(withoutPublishing, DAY, readFrom(root)));
  assert.deepEqual(publishedStudioUrls(root), []);
  assert.deepEqual(linksToUnservedStudioPages(root).map(l => `${l.sourceUrl} → ${l.target} «${l.anchor}»`).sort(), [
    '/ru/gpt-dlya-ucheby/ → /ru/prezentatsiya-ai/ «генератор презентаций GPTBot.uz»',
    '/uz/blog/slayd-tayyorlash/ → /uz/taqdimot-ai/ «Taqdimot AI»',
  ]);
  // The site's own gate sees the page's link too (it reads page bodies and internalLinks).
  const { pages, blog } = readDocs(root);
  const redirects = JSON.parse(fs.readFileSync(path.join(root, 'content/seo/redirects.json'), 'utf8')) as Redirect[];
  const broken = buildCockpit(pages, undefined, { blog, redirects, extraUrls: [...STATIC_ROUTES, ...publishedStudioUrls(root)] }).brokenInternalLinkDetails;
  assert.deepEqual(broken.map(l => `${l.sourceUrl} → ${l.target}`), ['/ru/gpt-dlya-ucheby/ → /ru/prezentatsiya-ai/']);
});

const SUITES = [
  'tests/seo-intent-manifest.test.ts',
  'tests/seo-link-graph.test.ts',
  'tests/seo-cluster-quality.test.ts',
  'tests/seo-commercial-coverage.test.ts',
  'tests/seo-page-integrity.test.ts',
  'tests/homepage-lists-frozen.test.ts',
  'tests/studio-sitemap.test.ts',
];

test('r-st1: on a copy of content/ with the release applied, the SEO suites pass', { skip: released && 'R-ST1 is applied', timeout: 300_000 }, t => {
  const root = tempCopy(t);
  writeRelease(root, applyRelease(R_ST1, DAY, readFrom(root)));
  // The published pair is in the sitemap entries, and every link to it is served.
  const pair = { ru: '/ru/prezentatsiya-ai/', uz: '/uz/taqdimot-ai/', xDefault: '/ru/prezentatsiya-ai/' };
  assert.deepEqual(studioSitemapEntries(root), [
    { url: '/ru/prezentatsiya-ai/', lastmod: DAY, alternates: pair },
    { url: '/uz/taqdimot-ai/', lastmod: DAY, alternates: pair },
  ]);
  assert.deepEqual(linksToUnservedStudioPages(root), []);
  // The suites read content/ from process.cwd(); tsx is the repository's, by its file URL (the copy has no node_modules).
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const run = spawnSync(process.execPath, ['--import', tsx, '--test', '--test-concurrency=1', ...SUITES.map(file => path.join(REPO, file))], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 280_000,
    // NODE_TEST_CONTEXT tells a test file it runs under a parent runner; the nested runner must report for itself.
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
  });
  const summary = (run.stdout.match(/^ℹ (tests|pass|fail) \d+$/gm) ?? []).join(', ');
  assert.equal(run.status, 0, `${summary}\n${run.stdout.split('\n').filter(line => /^not ok|✖|Error/.test(line)).slice(0, 40).join('\n')}\n${run.stderr.slice(0, 2000)}`);
  assert.match(summary, /fail 0/);
});
