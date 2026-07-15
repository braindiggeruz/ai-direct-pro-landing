// scripts/test-booster.ts — quick smoke test for SEO Booster Engine.
// Reads real content/ from disk (no GitHub round-trip) and prints the
// summary + a few sample items, clusters, and cannibalization pairs.
// Run: yarn tsx scripts/test-booster.ts
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { buildBoosterReport } from '../src/shared/booster';
import type { Page, BlogArticle, GlobalSEO } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const pageFiles = fg.sync('pages/**/*.json', { cwd: CONTENT, absolute: true });
const blogFiles = fg.sync('blog/**/*.json', { cwd: CONTENT, absolute: true });
const globalFile = path.join(CONTENT, 'global', 'site.json');

const pages: Page[] = pageFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
const blog: BlogArticle[] = blogFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));
const globalObj: GlobalSEO | undefined = fs.existsSync(globalFile) ? JSON.parse(fs.readFileSync(globalFile, 'utf-8')) : undefined;

const report = buildBoosterReport(pages, blog, globalObj);

console.log('=== SUMMARY ===');
console.log(JSON.stringify(report.summary, null, 2));

console.log('\n=== TOP 10 BY INDEXATION PRIORITY ===');
report.items
  .filter((i) => i.flags.pushable)
  .sort((a, b) => b.scores.indexationPriority - a.scores.indexationPriority)
  .slice(0, 10)
  .forEach((i) => console.log(`  ${i.scores.indexationPriority.toString().padStart(3)} · ${i.kind.padEnd(4)} · ${i.url}`));

console.log('\n=== CLUSTERS ===');
report.clusters.forEach((c) =>
  console.log(`  ${c.id.padEnd(20)} authority=${c.authorityScore.toString().padStart(3)} · ${c.moneyUrlsPresent.length}/${c.moneyUrls.length} money · ${c.supportingArticles.length} blog · ${c.ruUzPairsOk} ok pairs`)
);

console.log('\n=== CANNIBALIZATION (top 5) ===');
report.cannibalization.slice(0, 5).forEach((p) =>
  console.log(`  risk=${p.risk.toString().padStart(3)} · ${p.locale} · ${p.a}  ⇄  ${p.b}  → ${p.suggestion}`)
);

console.log('\n=== BLOCKED FROM PUSH (first 5) ===');
report.items.filter((i) => !i.flags.pushable).slice(0, 5).forEach((i) =>
  console.log(`  ${i.url}  → ${i.flags.pushReasons.join(', ')}`)
);

console.log('\n=== ORPHANS (published, non-homepage, 0 incoming) ===');
report.items.filter((i) => i.isOrphan && i.status === 'published').forEach((i) =>
  console.log(`  ${i.kind.padEnd(4)} · ${i.url}`)
);

console.log(`\nOK · ${report.items.length} items analysed in-memory.`);
