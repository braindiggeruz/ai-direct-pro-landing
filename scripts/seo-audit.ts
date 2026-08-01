// CLI SEO audit: runs the same audit rules as the cockpit on all content files.
// Exits with code 1 if any "critical" issues are found, blocking the build.
//
// Critical errors include: duplicate-title / duplicate-description /
// missing-h1 / missing-title / missing-description on published pages,
// invalid hreflang pair, broken internal links, redirect loops.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Page, GlobalSEO, Redirect, BlogArticle } from '../src/shared/types';
import { auditPage, buildCockpit, buildKnownUrls } from '../src/shared/audit';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');

const globalSeo: GlobalSEO = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'global', 'site.json'), 'utf-8'));
const files = fg.sync('pages/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const pages: Page[] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));

// Blog articles are prerendered and sitemapped alongside pages, so they belong
// in the link graph — otherwise every page → article link reads as broken.
const blogFiles = fg.sync('blog/**/*.json', { cwd: CONTENT_DIR, absolute: true });
const blog: BlogArticle[] = blogFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')));

const redirectsFile = path.join(CONTENT_DIR, 'seo', 'redirects.json');
const redirects: Redirect[] = fs.existsSync(redirectsFile)
  ? JSON.parse(fs.readFileSync(redirectsFile, 'utf-8'))
  : [];

const cockpit = buildCockpit(pages, globalSeo, { blog, redirects });

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
console.log(`Links via redirect: ${cockpit.linksViaRedirect}`);
console.log(`RU/UZ pairs OK:     ${cockpit.ruUzPairsOk} / broken ${cockpit.ruUzPairsMissing} / single-locale ${cockpit.singleLocalePages}`);
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
  'hreflang-target-missing',
  // A link to a URL the site does not serve is a 404 for users and a dead end
  // for crawlers. It only became gateable once the link graph included the blog.
  'broken-internal-link',
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

if (cockpit.orphanPageUrls.length) {
  console.log(`\n[ORPHAN] ${cockpit.orphanPageUrls.length} published page(s) with no incoming internal link:`);
  cockpit.orphanPageUrls.forEach((url) => console.log(`  - ${url}`));
}

if (cockpit.linksViaRedirectDetails.length) {
  console.log(`\n[REDIRECT HOP] ${cockpit.linksViaRedirectDetails.length} internal link(s) point at a redirect source:`);
  cockpit.linksViaRedirectDetails.forEach((l) =>
    console.log(`  - ${l.sourceUrl} [${l.where}] → ${l.target} ⇒ ${l.resolvesTo}`),
  );
}

// Redirect health: every target must be a URL the site serves, and no target
// may itself be a redirect source (that would cost users and crawlers a second
// hop and dilute the signal the 301 is supposed to consolidate).
{
  const served = buildKnownUrls(pages, { blog });
  for (const r of redirects) {
    if (r.to.startsWith('http')) continue; // external target, nothing to verify here
    const target = r.to.split('#')[0].split('?')[0];
    if (target.includes(':splat')) continue; // wildcard rule, resolved per request
    if (redirects.some((other) => other.from === target)) {
      console.log(`\n[CRITICAL] redirect-chain: ${r.from} → ${target} → (another redirect)`);
      critical++;
    } else if (!served.has(target)) {
      console.log(`\n[CRITICAL] redirect-target-missing: ${r.from} → ${target} is not served`);
      critical++;
    }
  }
}

// Redirect loop check
{
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
