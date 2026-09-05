import fs from 'node:fs';
import path from 'node:path';

// Vite's generated entry HTML is the authority. Directory order also contains
// lazy AdminRoot CSS and stale hashes; neither belongs on public SEO pages.
export function stylesheetHrefs(html: string): string[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const hrefs: string[] = [];
  for (const match of clean.matchAll(/<link\b[^>]*>/gi)) {
    const attribute = (name: string) => {
      const value = match[0].match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
      return value ? value[1] ?? value[2] ?? value[3] : '';
    };
    if (attribute('rel').toLowerCase().split(/\s+/).includes('stylesheet')) {
      const href = attribute('href');
      if (href && !hrefs.includes(href)) hrefs.push(href);
    }
  }
  return hrefs;
}

export function siteStylesheetHrefs(dist: string): string[] {
  const entry = path.join(dist, 'index.html');
  if (!fs.existsSync(entry)) throw new Error('Missing Vite entry index.html; build before prerender.');
  const hrefs = stylesheetHrefs(fs.readFileSync(entry, 'utf8'));
  if (!hrefs.length) throw new Error('Vite entry has no stylesheet; refusing to render unstyled public pages.');
  for (const href of hrefs) {
    if (!/^\/assets\/[\w.-]+\.css$/.test(href)) throw new Error(`Unsupported site stylesheet: ${href}`);
    const asset = path.join(dist, href.slice(1));
    if (!fs.existsSync(asset) || !fs.statSync(asset).isFile() || fs.statSync(asset).size === 0) {
      throw new Error(`Missing or empty site stylesheet: ${href}`);
    }
  }
  return hrefs;
}

export function renderSiteStylesheets(dist: string): string {
  return siteStylesheetHrefs(dist).map(href => `<link rel="stylesheet" href="${href}" />`).join('\n');
}

export function assertPublicStylesheets(dist: string, filenames: string[]): void {
  const expected = siteStylesheetHrefs(dist);
  for (const filename of filenames.filter(file => /^(ru|uz)\/.*index\.html$/.test(file))) {
    const html = fs.readFileSync(path.join(dist, filename), 'utf8');
    // Explicit redirect documents do not display a styled page.
    if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i.test(html)) continue;
    const actual = stylesheetHrefs(html);
    if (expected.some(href => !actual.includes(href))) {
      throw new Error(`Missing site stylesheet in public page: ${filename}`);
    }
  }
}
