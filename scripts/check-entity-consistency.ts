// Crawls every URL of a sitemap and checks the facts AI assistants use to
// merge mentions into one entity (docs/seo/research/2026-11-23-ai-visibility):
//   - every URL answers 200 without a redirect;
//   - every page shows the studio address of content/global/site.json and no
//     other street address from KNOWN_STREETS;
//   - the brand is written «GPTBot.uz» (no GPTbot.uz / Gptbot.uz) and
//     og:site_name is «GPTBot.uz»;
//   - hreflang alternates are reciprocal: if A names B, B names A, both 200.
// Exit code 1 on any violation.
//
//   npx tsx scripts/check-entity-consistency.ts                 https://gptbot.uz/sitemap.xml
//   npx tsx scripts/check-entity-consistency.ts http://localhost:8788/sitemap.xml --origin http://localhost:8788
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/global/site.json'), 'utf8')) as { address: string };
const STUDIO_STREET = site.address.split(',')[0].trim();
// Street addresses that ever appeared on the site; only STUDIO_STREET may show.
const KNOWN_STREETS = ['Kichik Xalqa Yo‘li 57', 'Yahyo Gulyamov ko‘chasi 35'];
// Lower-case gptbot.uz is the domain (links, e-mail) and is fine; only wrong brand casing counts.
const BRAND_VARIANT_RE = /\b(?:GPTbot|Gptbot|GPTBOT|GptBot)\.(?:uz|UZ)\b|\bGPTBot\.UZ\b/g;
const USER_AGENT = 'gptbot-entity-check/1.0';

interface PageFacts {
  url: string;
  status: number;
  location: string | null;
  streets: string[];
  brandVariants: string[];
  ogSiteName: string | null;
  alternates: Array<{ lang: string; href: string }>;
}

async function fetchText(url: string): Promise<{ status: number; location: string | null; text: string }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT } });
      return { status: response.status, location: response.headers.get('location'), text: response.status === 200 ? await response.text() : '' };
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function sitemapUrls(sitemap: string): Promise<string[]> {
  const { status, text } = await fetchText(sitemap);
  if (status !== 200) throw new Error(`${sitemap} answered ${status}`);
  const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const urls: string[] = [];
  for (const loc of locs) urls.push(...(loc.endsWith('.xml') ? await sitemapUrls(loc) : [loc]));
  return [...new Set(urls)].sort();
}

function facts(url: string, status: number, location: string | null, html: string): PageFacts {
  const head = html.split('</head>')[0] ?? '';
  const body = html.slice(head.length);
  const alternates = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => ({ lang: m[1], href: m[2] }));
  return {
    url,
    status,
    location,
    streets: KNOWN_STREETS.filter((street) => html.includes(street)),
    brandVariants: [...new Set(body.match(BRAND_VARIANT_RE) ?? [])],
    ogSiteName: head.match(/property="og:site_name" content="([^"]+)"/)?.[1] ?? null,
    alternates,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sitemap = args.find((a) => !a.startsWith('--')) ?? 'https://gptbot.uz/sitemap.xml';
  const originFlag = args.indexOf('--origin');
  const origin = originFlag >= 0 ? args[originFlag + 1] : null;
  const local = (url: string): string => (origin ? url.replace(/^https:\/\/gptbot\.uz/, origin) : url);

  const urls = await sitemapUrls(sitemap);
  const pages = new Map<string, PageFacts>();
  const queue = [...urls];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const { status, location, text } = await fetchText(local(url));
      pages.set(url, facts(url, status, location, text));
    }
  }));

  const errors: string[] = [];
  for (const page of pages.values()) {
    if (page.status !== 200) errors.push(`${page.url}: ${page.status}${page.location ? ` → ${page.location}` : ''}`);
    if (page.status !== 200) continue;
    if (!page.streets.includes(STUDIO_STREET)) errors.push(`${page.url}: studio address «${STUDIO_STREET}» missing`);
    for (const street of page.streets) if (street !== STUDIO_STREET) errors.push(`${page.url}: other address «${street}»`);
    if (page.brandVariants.length) errors.push(`${page.url}: brand written ${page.brandVariants.join(', ')}`);
    if (page.ogSiteName !== 'GPTBot.uz') errors.push(`${page.url}: og:site_name «${page.ogSiteName}»`);
  }
  // hreflang reciprocity, fetching alternates that are not in the sitemap too.
  for (const page of [...pages.values()]) {
    for (const alternate of page.alternates) {
      if (alternate.lang === 'x-default' || alternate.href === page.url) continue;
      let target = pages.get(alternate.href);
      if (!target) {
        const { status, location, text } = await fetchText(local(alternate.href));
        target = facts(alternate.href, status, location, text);
        pages.set(alternate.href, target);
        if (!urls.includes(alternate.href) && status === 200) errors.push(`${page.url}: hreflang ${alternate.lang} → ${alternate.href} is not in the sitemap`);
      }
      if (target.status !== 200) errors.push(`${page.url}: hreflang ${alternate.lang} → ${alternate.href} answers ${target.status}`);
      else if (!target.alternates.some((a) => a.href === page.url)) errors.push(`${page.url}: hreflang ${alternate.lang} → ${alternate.href} does not point back`);
    }
  }

  const byLocale = urls.reduce<Record<string, number>>((acc, url) => {
    const key = url.match(/^https:\/\/gptbot\.uz\/(ru|uz|en)\//)?.[1] ?? 'root';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${urls.length} sitemap URLs ${JSON.stringify(byLocale)}; studio address «${STUDIO_STREET}»`);
  if (errors.length) {
    console.error(`FAIL: ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('OK: every URL 200, one address, one brand spelling, reciprocal hreflang');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
