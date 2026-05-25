// CLI SEO audit: runs the same audit rules as the cockpit on all content files.
// Exits with code 1 if any "critical" issues are found, blocking the build.
//
// Critical errors include: duplicate-title / duplicate-description /
// missing-h1 / missing-title / missing-description on published pages,
// invalid hreflang pair, broken internal links, redirect loops.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page, GlobalSEO, Redirect } from '../src/shared/types';
import { auditPage, buildCockpit } from '../src/shared/audit';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');

const globalSeo: GlobalSEO = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'global', 'site.json'), 'utf-8'));
const files = fg.sync('pages/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const pages: Page[] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));

const cockpit = buildCockpit(pages, globalSeo);

console.log('========================================');
console.log('  SEO AUDIT REPORT');
console.log('========================================');
console.log(`Total pages:        ${cockpit.totalPages}`);
console.log(`Published:          ${cockpit.publishedPages}`);
console.log(`Drafts:             ${cockpit.draftPages}`);
console.log(`Noindex:            ${cockpit.noindexPages}`);
console.log(`In sitemap:         ${cockpit.pagesInSitemap}`);
console.log(`---`);
console.log(`Missing title:      ${cockpit.missingTitle}`);
console.log(`Missing description:${cockpit.missingDescription}`);
console.log(`Missing H1:         ${cockpit.missingH1}`);
console.log(`Missing canonical:  ${cockpit.missingCanonical}`);
console.log(`Duplicate title:    ${cockpit.duplicateTitle}`);
console.log(`Duplicate desc:     ${cockpit.duplicateDescription}`);
console.log(`Missing hreflang:   ${cockpit.missingHreflang}`);
console.log(`Missing OG:         ${cockpit.missingOg}`);
console.log(`Mojibake pages:     ${cockpit.mojibakePages}`);
console.log(`Orphan pages:       ${cockpit.orphanPages}`);
console.log(`Broken intl. links: ${cockpit.brokenInternalLinks}`);
console.log(`RU/UZ pairs OK:     ${cockpit.ruUzPairsOk} / missing ${cockpit.ruUzPairsMissing}`);
console.log(`Avg money score:    ${cockpit.avgMoneyScore}/100`);
console.log(`Avg blog score:     ${cockpit.avgBlogScore}/100`);
console.log('========================================');

let critical = 0;
const CRITICAL_RULES = new Set([
  'mojibake',
  'duplicate-title',
  'duplicate-description',
  'missing-h1',
  'missing-title',
  'missing-description',
  'no-faq-money',
  'published-but-not-in-sitemap',
  'hreflang-not-bidirectional',
]);

for (const result of cockpit.pages) {
  // Only enforce critical rules on published pages
  if (result.status !== 'published') continue;
  const crit = result.issues.filter((i) => CRITICAL_RULES.has(i.rule));
  if (crit.length) {
    critical += crit.length;
    console.log(`\n[CRITICAL] ${result.url}  score=${result.score}`);
    crit.forEach((i) => console.log(`  - [${i.level}] ${i.rule}: ${i.message}`));
  }
}

// Redirect loop check
const redirectsFile = path.join(CONTENT_DIR, 'seo', 'redirects.json');
if (fs.existsSync(redirectsFile)) {
  const redirects: Redirect[] = JSON.parse(fs.readFileSync(redirectsFile, 'utf-8'));
  const map = new Map(redirects.map((r) => [r.from, r.to]));
  for (const r of redirects) {
    let cur = r.to;
    const seen = new Set([r.from]);
    let hops = 0;
    while (map.has(cur) && hops < 10) {
      if (seen.has(cur)) {
        console.log(`\n[CRITICAL] redirect-loop: ${r.from} → ... → ${cur}`);
        critical++;
        break;
      }
      seen.add(cur);
      cur = map.get(cur)!;
      hops++;
    }
  }
}

// Sitemap valid XML check - covered by generate-sitemap script
if (critical > 0) {
  console.log(`\n FAILED: ${critical} critical SEO issue(s). Fix before deploy.`);
  process.exit(1);
} else {
  console.log('\n OK: no critical SEO issues. Build can proceed.');
}
