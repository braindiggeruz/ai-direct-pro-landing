// Local mirror of Ahrefs' technical SEO audit. Operates on dist/ output.
// Scans every published HTML file for:
//   - Internal links to broken / missing / noindex / redirect targets
//   - Hreflang return-tag reciprocity + canonical conformance
//   - JSON-LD parseability + obvious schema.org errors
//   - <img> without alt
// Prints categorised findings; exit non-zero if any P0 issue remains so CI can gate.
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://gptbot.uz';

interface PageInfo {
  fileRel: string;       // dist-relative path
  url: string;           // canonical-style URL (https://gptbot.uz/...)
  canonical: string | null;
  hreflang: { lang: string; href: string }[];
  internalLinks: string[];
  jsonld: string[];
  imgsNoAlt: { src: string; ctx: string }[];
  robotsNoindex: boolean;
}

function urlForFile(fileRel: string): string {
  // dist/index.html             -> https://gptbot.uz/
  // dist/ru/blog/index.html     -> https://gptbot.uz/ru/blog/
  // dist/ru/foo/index.html      -> https://gptbot.uz/ru/foo/
  // dist/404.html               -> https://gptbot.uz/404
  if (fileRel === 'index.html') return `${SITE}/`;
  if (fileRel.endsWith('/index.html')) return `${SITE}/${fileRel.replace(/index\.html$/, '')}`;
  return `${SITE}/${fileRel.replace(/\.html$/, '')}`;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function parsePage(absFile: string): PageInfo {
  const fileRel = path.relative(DIST, absFile);
  const html = fs.readFileSync(absFile, 'utf-8');
  const url = urlForFile(fileRel);

  // canonical
  const canonMatch = html.match(/<link[^>]+rel="canonical"[^>]*>/i);
  const canonical = canonMatch ? attr(canonMatch[0], 'href') : null;

  // hreflang
  const hreflang: { lang: string; href: string }[] = [];
  for (const m of html.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"[^>]*>|<link[^>]+hreflang="([^"]+)"[^>]+rel="alternate"[^>]+href="([^"]+)"[^>]*>/gi)) {
    const lang = m[1] || m[3];
    const href = m[2] || m[4];
    if (lang && href) hreflang.push({ lang, href });
  }

  // robots noindex
  const robotsMatch = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/i);
  const robotsNoindex = !!robotsMatch && /noindex/i.test(robotsMatch[1]);

  // internal links (href starting with / or with our domain)
  const internalLinks: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#?]+)(?:[?#][^"]*)?"/gi)) {
    const h = m[1];
    if (!h) continue;
    if (h.startsWith('/')) internalLinks.push(`${SITE}${h}`);
    else if (h.startsWith(SITE)) internalLinks.push(h);
  }

  // JSON-LD blocks
  const jsonld: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    jsonld.push(m[1]);
  }

  // <img> without alt
  const imgsNoAlt: { src: string; ctx: string }[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/i.test(m[0])) imgsNoAlt.push({ src: attr(m[0], 'src') || '?', ctx: m[0].slice(0, 120) });
  }

  return { fileRel, url, canonical, hreflang, internalLinks, jsonld, imgsNoAlt, robotsNoindex };
}

function normalizeUrl(u: string): string {
  // strip trailing slash for comparison except for root
  try {
    const x = new URL(u);
    if (x.origin !== SITE) return u;
    let p = x.pathname;
    return `${SITE}${p}`;
  } catch { return u; }
}

function pageForUrl(allPages: Map<string, PageInfo>, u: string): PageInfo | undefined {
  const n = normalizeUrl(u);
  // exact
  if (allPages.has(n)) return allPages.get(n);
  // try with trailing slash
  if (!n.endsWith('/') && allPages.has(n + '/')) return allPages.get(n + '/');
  if (n.endsWith('/') && allPages.has(n.replace(/\/$/, ''))) return allPages.get(n.replace(/\/$/, ''));
  return undefined;
}

async function main(): Promise<void> {
  const files = fg.sync('**/*.html', { cwd: DIST, absolute: true });
  const pages: PageInfo[] = files.map(parsePage);
  const byUrl = new Map<string, PageInfo>();
  for (const p of pages) byUrl.set(p.url, p);

  // ---- Broken / non-indexable / redirect link detection ----
  // For each internal link, classify as:
  //   - OK (target exists, status 200 by virtue of being in dist, not noindex)
  //   - 404 (target file does not exist in dist)
  //   - noindex
  //   - external_known (admin-tools, api, etc.)
  // Note: this only catches HTML targets; static assets (/assets/...) skipped.
  const brokenLinks: { from: string; to: string; reason: string }[] = [];
  const linksToNoindex: { from: string; to: string }[] = [];
  const linksToRedirect: { from: string; to: string }[] = [];

  // load _redirects so we know which paths redirect
  const redirectsPath = path.join(DIST, '_redirects');
  const redirects: { from: string; to: string; code: number }[] = [];
  if (fs.existsSync(redirectsPath)) {
    for (const line of fs.readFileSync(redirectsPath, 'utf-8').split(/\r?\n/)) {
      const m = line.trim().match(/^(\S+)\s+(\S+)\s+(\d+)/);
      if (m) redirects.push({ from: m[1], to: m[2], code: parseInt(m[3], 10) });
    }
  }
  function redirectMatch(p: string): { to: string; code: number } | null {
    for (const r of redirects) {
      if (r.from === p) return { to: r.to, code: r.code };
      if (r.from.endsWith('/*')) {
        const pref = r.from.slice(0, -2);
        if (p.startsWith(pref + '/') || p === pref) return { to: r.to, code: r.code };
      }
    }
    return null;
  }

  for (const p of pages) {
    for (const linkRaw of p.internalLinks) {
      const link = normalizeUrl(linkRaw);
      let pathOnly = link.replace(SITE, '');
      // skip non-http things, mailto, tg:, etc. (already filtered, but double-check)
      if (!pathOnly.startsWith('/')) continue;
      // skip static asset paths
      if (/^\/(assets|favicon|robots\.txt|sitemap\.xml|api|admin-tools)/.test(pathOnly)) continue;
      // skip non-html ext
      if (/\.(png|jpe?g|svg|webp|ico|css|js|xml|json|txt|pdf)$/i.test(pathOnly)) continue;

      const rd = redirectMatch(pathOnly);
      if (rd) {
        linksToRedirect.push({ from: p.url, to: link });
        continue;
      }
      const tgt = pageForUrl(byUrl, link);
      if (!tgt) {
        brokenLinks.push({ from: p.url, to: link, reason: 'missing in dist' });
        continue;
      }
      if (tgt.robotsNoindex) {
        linksToNoindex.push({ from: p.url, to: link });
      }
    }
  }

  // ---- Hreflang reciprocity ----
  const hreflangErrors: { from: string; issue: string; detail: string }[] = [];
  for (const p of pages) {
    if (p.fileRel === '404.html') continue;
    for (const h of p.hreflang) {
      const tgtUrl = normalizeUrl(h.href);
      if (!tgtUrl.startsWith(SITE)) continue;
      // skip x-default for reciprocity, but check target exists
      const tgt = pageForUrl(byUrl, tgtUrl);
      if (!tgt) {
        hreflangErrors.push({ from: p.url, issue: 'hreflang-target-missing', detail: `${h.lang} -> ${h.href}` });
        continue;
      }
      // canonical conformance: target's canonical should equal target URL
      if (tgt.canonical && normalizeUrl(tgt.canonical) !== tgt.url) {
        hreflangErrors.push({ from: p.url, issue: 'hreflang-to-non-canonical', detail: `${h.lang} -> ${h.href} (canonical=${tgt.canonical})` });
      }
      if (h.lang === 'x-default') continue;
      // reciprocity: target page must declare hreflang back to us (with our lang or self)
      const reciprocal = tgt.hreflang.some((th) => normalizeUrl(th.href) === p.url);
      if (!reciprocal) {
        hreflangErrors.push({ from: p.url, issue: 'no-return-tag', detail: `${h.lang} -> ${h.href} (target lacks return hreflang)` });
      }
    }
  }

  // ---- JSON-LD validation ----
  const schemaErrors: { from: string; detail: string }[] = [];
  for (const p of pages) {
    for (const block of p.jsonld) {
      let parsed: unknown;
      try { parsed = JSON.parse(block); }
      catch (e) { schemaErrors.push({ from: p.url, detail: `JSON parse error: ${(e as Error).message}` }); continue; }
      const items = Array.isArray((parsed as { '@graph'?: unknown })['@graph'])
        ? (parsed as { '@graph': unknown[] })['@graph']
        : Array.isArray(parsed) ? parsed as unknown[]
        : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') { schemaErrors.push({ from: p.url, detail: 'JSON-LD item is not an object' }); continue; }
        const t = (item as { '@type'?: unknown })['@type'];
        if (!t) { schemaErrors.push({ from: p.url, detail: 'Missing @type' }); continue; }
        const type = Array.isArray(t) ? t[0] : t;
        // Per-type minimal required checks (per schema.org / Google rich results)
        if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle') {
          const i = item as Record<string, unknown>;
          if (!i.headline) schemaErrors.push({ from: p.url, detail: `${type}: missing headline` });
          if (!i.datePublished) schemaErrors.push({ from: p.url, detail: `${type}: missing datePublished` });
          if (!i.author) schemaErrors.push({ from: p.url, detail: `${type}: missing author` });
          if (!i.image) schemaErrors.push({ from: p.url, detail: `${type}: missing image` });
          if (!i.publisher) schemaErrors.push({ from: p.url, detail: `${type}: missing publisher` });
          else {
            const pub = i.publisher as Record<string, unknown>;
            if (!pub.name) schemaErrors.push({ from: p.url, detail: `${type}: publisher.name missing` });
            if (!pub.logo) schemaErrors.push({ from: p.url, detail: `${type}: publisher.logo missing` });
          }
        }
        if (type === 'BreadcrumbList') {
          const list = (item as { itemListElement?: unknown[] }).itemListElement;
          if (!Array.isArray(list) || list.length === 0) schemaErrors.push({ from: p.url, detail: 'BreadcrumbList: itemListElement missing/empty' });
        }
        if (type === 'FAQPage') {
          const m = (item as { mainEntity?: unknown[] }).mainEntity;
          if (!Array.isArray(m) || m.length === 0) schemaErrors.push({ from: p.url, detail: 'FAQPage: mainEntity missing/empty' });
        }
      }
    }
  }

  // ---- IMG alt ----
  const imgAltMissing: { from: string; src: string }[] = [];
  for (const p of pages) {
    for (const i of p.imgsNoAlt) imgAltMissing.push({ from: p.url, src: i.src });
  }

  // ---- Sitemap parity: every <loc> must point to an indexable 200 page in
  // dist; conversely, every indexable money/blog page should appear in the
  // sitemap. Also flag forbidden paths and duplicates. ----
  const sitemapPath = path.join(DIST, 'sitemap.xml');
  const sitemapMissingInDist: { loc: string }[] = [];
  const sitemapForbidden: { loc: string; reason: string }[] = [];
  const sitemapDuplicates: { loc: string }[] = [];
  const sitemapPointsToNoindex: { loc: string }[] = [];
  const indexableMissingFromSitemap: { url: string }[] = [];
  let sitemapLocs: string[] = [];
  if (fs.existsSync(sitemapPath)) {
    const xml = fs.readFileSync(sitemapPath, 'utf-8');
    sitemapLocs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
    const seen = new Set<string>();
    for (const loc of sitemapLocs) {
      if (seen.has(loc)) sitemapDuplicates.push({ loc });
      seen.add(loc);
      // forbidden paths
      const u = normalizeUrl(loc);
      const pOnly = u.replace(SITE, '');
      if (/^\/(admin-tools|api)(\/|$)/.test(pOnly)) sitemapForbidden.push({ loc, reason: 'admin/api in sitemap' });
      if (/draft|random|test-url/i.test(pOnly)) sitemapForbidden.push({ loc, reason: 'draft/random/test in sitemap' });
      // page must exist
      const tgt = pageForUrl(byUrl, u);
      if (!tgt) sitemapMissingInDist.push({ loc });
      else if (tgt.robotsNoindex) sitemapPointsToNoindex.push({ loc });
    }
    // reverse: every indexable non-homepage prerendered page should be in sitemap
    const inSitemap = new Set(sitemapLocs.map(normalizeUrl));
    for (const p of pages) {
      if (p.robotsNoindex) continue;
      if (p.fileRel === '404.html') continue;
      if (p.fileRel === 'index.html') continue; // homepage may or may not be in sitemap depending on policy
      const candidates = [p.url, p.url.replace(/\/$/, ''), p.url + '/'];
      if (!candidates.some((c) => inSitemap.has(c))) indexableMissingFromSitemap.push({ url: p.url });
    }
  }

  // ---- OG/Twitter tag presence ----
  const ogTwitterMissing: { from: string; missing: string[] }[] = [];
  const REQUIRED_OG = ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description'];
  for (const p of pages) {
    if (p.fileRel === '404.html') continue;
    const html = fs.readFileSync(path.join(DIST, p.fileRel), 'utf-8');
    const missing: string[] = [];
    for (const key of REQUIRED_OG) {
      const re = new RegExp(`<meta[^>]+(?:property|name)="${key.replace(':', '\\:')}"`, 'i');
      if (!re.test(html)) missing.push(key);
    }
    if (missing.length) ogTwitterMissing.push({ from: p.url, missing });
  }

  // ---- Mojibake / encoding artefacts ----
  const mojibake: { from: string; sample: string }[] = [];
  const MOJIBAKE_RE = /Ð[ ]?[А-Яа-я]|Â[ ]?[А-Яа-я]|Ñ[ ]?[А-Яа-я]|Ò[ ]?[А-Яа-я]|�/;
  for (const p of pages) {
    const html = fs.readFileSync(path.join(DIST, p.fileRel), 'utf-8');
    const m = html.match(MOJIBAKE_RE);
    if (m) mojibake.push({ from: p.url, sample: html.slice(Math.max(0, html.indexOf(m[0]) - 30), html.indexOf(m[0]) + 50) });
  }

  // ---- Secrets leak check (raw dist HTML) ----
  const SECRET_RE = /(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|sk-or-v1-[A-Za-z0-9]{20,}|CLOUDFLARE_API_TOKEN|ADMIN_PASSWORD_HASH|JWT_SECRET\s*=)/;
  const secretsLeaked: { from: string; sample: string }[] = [];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(DIST, p.fileRel), 'utf-8');
    const m = html.match(SECRET_RE);
    if (m) secretsLeaked.push({ from: p.url, sample: m[0].slice(0, 30) });
  }

  // ---- Report ----
  const report = {
    pages: pages.length,
    indexable: pages.filter((p) => !p.robotsNoindex).length,
    noindex: pages.filter((p) => p.robotsNoindex).length,
    sitemapLocCount: sitemapLocs.length,
    brokenLinks,
    linksToNoindex,
    linksToRedirect,
    hreflangErrors,
    schemaErrors,
    imgAltMissing,
    sitemapMissingInDist,
    sitemapForbidden,
    sitemapDuplicates,
    sitemapPointsToNoindex,
    indexableMissingFromSitemap,
    ogTwitterMissing,
    mojibake,
    secretsLeaked,
  };

  const out = path.join(ROOT, 'tech-audit-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`Pages scanned:        ${report.pages}`);
  console.log(`  Indexable:          ${report.indexable}`);
  console.log(`  Noindex:            ${report.noindex}`);
  console.log(`Sitemap <loc> count:   ${report.sitemapLocCount}`);
  console.log(`Broken internal links: ${report.brokenLinks.length}`);
  console.log(`Links to noindex:      ${report.linksToNoindex.length}`);
  console.log(`Links to redirects:    ${report.linksToRedirect.length}`);
  console.log(`Hreflang issues:       ${report.hreflangErrors.length}`);
  console.log(`Schema issues:         ${report.schemaErrors.length}`);
  console.log(`<img> without alt:     ${report.imgAltMissing.length}`);
  console.log(`Sitemap missing-in-dist:    ${report.sitemapMissingInDist.length}`);
  console.log(`Sitemap forbidden paths:    ${report.sitemapForbidden.length}`);
  console.log(`Sitemap duplicates:         ${report.sitemapDuplicates.length}`);
  console.log(`Sitemap -> noindex:         ${report.sitemapPointsToNoindex.length}`);
  console.log(`Indexable not in sitemap:   ${report.indexableMissingFromSitemap.length}`);
  console.log(`OG/Twitter missing:    ${report.ogTwitterMissing.length}`);
  console.log(`Mojibake pages:        ${report.mojibake.length}`);
  console.log(`Secrets leaked:        ${report.secretsLeaked.length}`);
  console.log(`Full report → ${out}`);

  // Gate CI on P0 issues.
  const p0 = report.brokenLinks.length + report.linksToNoindex.length + report.linksToRedirect.length
    + report.hreflangErrors.length + report.schemaErrors.length
    + report.sitemapMissingInDist.length + report.sitemapForbidden.length
    + report.sitemapDuplicates.length + report.sitemapPointsToNoindex.length
    + report.mojibake.length + report.secretsLeaked.length;
  if (p0 > 0) {
    console.error(`\n[tech-audit] ${p0} P0 issue(s) — failing.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
