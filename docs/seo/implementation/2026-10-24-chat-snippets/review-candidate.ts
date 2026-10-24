import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Builds the 2026-10-24-chat-snippets revision from the local production
// candidate in dist/. Only the two chat snippets are meant to differ from the
// 2026-10-23 recovery; the script refuses to write if anything else moved.
const root = process.cwd();
const previousRevision = 'docs/seo/evidence/2026-10-23-recovery/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const pages = PROTECTED_PATHS.map(pathname => {
  const html = fs.readFileSync(path.join(root, 'dist', pathname.slice(1), 'index.html'), 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { pathname, contract: seoContract(html), bodyText, htmlSha256: sha(html) };
});

const expected: Record<string, string[]> = {
  '/uz/gpt-uzbek-tilida/': ['description', 'title'],
  '/ru/gpt-chat/': ['description', 'title'],
};
const reasons: Record<string, string> = {
  '/uz/gpt-uzbek-tilida/': 'Owner lifted the R-S1 freeze on 2026-10-24. GSC (Uzbekistan, 21.09–21.10): the page lost its best-converting Uzbek-language queries after R-S1 (queries with «uzbek» 7 988 impressions at 1.18% CTR → 701 at 0.43%; clicks/day 24.8 → 12.5). The title returns to the shape of the 0.72–0.95% periods with «ChatGPT uzbekcha» first, keeps «muqobili» for honesty and «bepul kirish» for the login family (62% of impressions); the description answers «chatgpt yozish» and «yuklab olish» and keeps the 3 lifetime trial replies, the AI pack and the independence clause.',
  '/ru/gpt-chat/': 'Owner lifted the R-S1 freeze on 2026-10-24. GSC: after R-S1 removed «в Узбекистане», impressions outside Uzbekistan rose from 421 in 4 days to 12 419 in 3 days at ~0.10% CTR, and Uzbekistan CTR fell 0.75% → 0.29%. The title brings back «в Узбекистане» and keeps «без регистрации» (top-CTR query «чат gpt онлайн без регистрации», 3.70%); the description leads with «на русском и узбекском», which no Russian competitor in the 24.10 SERP offers, and keeps the trial terms and the independence clause.',
};

const changes = [];
for (const page of pages) {
  const before = previous.pages.find((p: { pathname: string }) => p.pathname === page.pathname);
  const fields = Object.keys(page.contract)
    .filter(k => JSON.stringify(page.contract[k as keyof typeof page.contract]) !== JSON.stringify(before.contract[k]))
    .sort();
  const want = expected[page.pathname] ?? [];
  if (JSON.stringify(fields) !== JSON.stringify(want)) {
    throw new Error(`${page.pathname}: changed ${JSON.stringify(fields)}, reviewed ${JSON.stringify(want)}`);
  }
  if (fields.length) {
    changes.push({
      pathname: page.pathname,
      fields,
      reason: reasons[page.pathname],
      change: {
        title: `${before.contract.title[0]} → ${page.contract.title[0]}`,
        description: `${before.contract.description[0]} → ${page.contract.description[0]}`,
      },
      htmlSha256: `${before.htmlSha256} → ${page.htmlSha256}`,
    });
  }
}

const revision = {
  schema: 1,
  capturedAt: new Date().toISOString(),
  source: 'Locally generated production candidate after source review; actual live verification recorded separately after release',
  previousRevision,
  previousRevisionSha256: sha(previousRaw),
  reviewedChanges: changes,
  invisibleToGate: [
    { change: 'og:title, og:description, twitter:title and twitter:description of both chats follow the new title and description (ogTitle = title, ogDescription = description in the content files).' },
    { change: 'WebPage JSON-LD description of both chats and their /updates/atom.xml summaries follow the new description.' },
    { change: 'Body text, H1, canonical, robots, hreflang, internal links, updatedAt and lastReviewedAt of both chats are unchanged; the other eight protected pages are untouched.' },
  ],
  measurement: 'The R-S1 P-CTR read (planned ≈05–07.11) loses its verdict for both chats; a new 28-day window starts at a recrawl confirmed with URL Inspection. Read Uzbekistan-only CTR and clicks/day against 09.10–21.10 (RU 0.286% and 4.3/day; UZ 0.398% and 10.2/day), split by query group, country (UZB vs KGZ/KAZ/TJK) and device, at positions within ±0.5 of baseline. Signal: RU ≥0.40% and ≥5.0 clicks/day with all-country clicks/day ≥9.6; UZ ≥0.55% and ≥12.0 clicks/day. Rollback per page to the previous strings if at day 14 CTR <80% of baseline and clicks/day are below baseline. Google may rewrite snippets; the 10-23 body change confounds the UZ read. No ranking or traffic guarantee.',
  pages,
};

if (fs.existsSync(target)) throw new Error('Revision already exists; write a new revision instead of replacing reviewed evidence.');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(revision, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(changes.map(({ pathname, fields, change }) => ({ pathname, fields, change })), null, 2));
