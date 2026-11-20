// Reviewed-revision proof for the second step of the «здесь и сейчас» release
// (owner's order of 2026-11-20: «сделай сейчас всё автономно … все твои
// предложения»), on top of revision 2026-11-20-uz-now.
//
// Compares the fresh build (dist/) with the build of commit a17451a (passed as
// --before <dir>). It proves:
//   1. the sitemap is byte-identical;
//   2. the built HTML changes on exactly eight pages: the UZ chat (a «gaplashish»
//      section, an FAQ answer, a named BreadcrumbList), the RU chat (its
//      BreadcrumbList gains its name and nothing else), the download guide (a
//      named BreadcrumbList and two sentences of 20.11 reworded without the word
//      «rasmiy», nothing else), and five unprotected pages whose one link to the
//      UZ chat gets an honest «ChatGPT … muqobil» anchor and nothing else;
//   3. among the ten protected pages only the UZ chat and the download guide
//      change their contract, and only in bodyTextSha256.
// Usage: tsx reports/uz-now-20261120/review-b.ts --before <a17451a dist> [--write-reviewed-revision]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PROTECTED_PATHS, seoContract } from '../../scripts/seo-protection';

const PREDECESSOR = 'docs/seo/evidence/2026-11-20-uz-now/reviewed-protected-pages.json';
const TARGET = 'docs/seo/evidence/2026-11-20-uz-now-b/reviewed-protected-pages.json';
const REPORT = 'reports/uz-now-20261120/artifact-review-b.json';
const UZ = '/uz/gpt-uzbek-tilida/';
const RU = '/ru/gpt-chat/';
const DL = '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/';
const OLD_ANCHOR = 'o‘zbek tilidagi AI chat';
const DONORS: Record<string, string> = {
  '/uz/blog/chat-gpt-uzbek-biznes-uchun/': 'ChatGPT’ning o‘zbekcha muqobili',
  '/uz/informatika-test/': 'o‘zbekcha ChatGPT muqobili',
  '/uz/ingliz-tili-zamonlari/': 'ChatGPT o‘rniga o‘zbekcha AI chat',
  '/uz/past-simple/': 'ChatGPT’ga o‘zbekcha muqobil',
  '/uz/present-continuous/': 'o‘zbek tilidagi ChatGPT muqobili',
};
const NAMED: Record<string, string> = {
  [RU]: 'ИИ-чат онлайн',
  [DL]: 'ChatGPT yuklab olish (skachat): telefon va kompyuterga xavfsiz o‘rnatish',
};
// The download guide's two sentences added on 20.11 (revision 2026-11-20-uz-now),
// reworded so that the site's new text never says «rasmiy» (owner's rule). The
// blog intro is not rendered into the HTML: the first pair lives only in the
// Markdown twin (and llms-full.txt), the second one in both.
const DL_INTRO: [before: string, after: string] = ['yo‘l shu: rasmiy do‘kon yoki chatgpt.com/download sahifasi.', 'yo‘l shu: Google Play, App Store yoki chatgpt.com/download sahifasi.'];
const DL_APK: [before: string, after: string] = ['ya’ni bu rasmiy ChatGPT emas. Rasmiy ilovaning ishlab chiquvchisi — OpenAI:', 'ya’ni bu OpenAI’ning ChatGPT ilovasi emas. Asl ChatGPT ilovasining ishlab chiquvchisi — OpenAI:'];
const revert = (text: string, pairs: Array<[string, string]>, where: string) => pairs.reduce((acc, [old, now]) => {
  assert.equal(acc.split(now).length - 1, 1, `${where}: «${now.slice(0, 40)}…» appears once`);
  assert.ok(!acc.includes(old), `${where}: the 20.11 wording is gone`);
  return acc.replace(now, old);
}, text);
const CONTRACT_CHANGES: Record<string, string[]> = { [UZ]: ['bodyTextSha256'], [DL]: ['bodyTextSha256'] };
const EXPECTED_HTML = [UZ, RU, DL, ...Object.keys(DONORS)].sort();

const args = process.argv.slice(2);
const beforeDir = args[args.indexOf('--before') + 1];
assert.ok(args.includes('--before') && beforeDir && fs.existsSync(path.join(beforeDir, 'sitemap.xml')), 'pass --before <a17451a dist>');

type Contract = ReturnType<typeof seoContract>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
function bodyTextOf(html: string): string {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const textHtml = clean.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return normalize((textHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' '));
}
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');

// 1. Sitemap
assert.equal(read('dist', 'sitemap.xml'), read(beforeDir, 'sitemap.xml'), 'the sitemap is byte-identical');

// 2. Every built page
const pages: string[] = [];
const visit = (dir: string, rel: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (entry.name !== 'assets') visit(path.join(dir, entry.name), `${rel}${entry.name}/`); }
    else if (entry.name === 'index.html') pages.push(rel);
  }
};
visit('dist', '/');
assert.ok(pages.length > 400, `only ${pages.length} built pages`);
const changed: string[] = [];
const contracts = new Map<string, Contract>();
for (const url of pages) {
  const after = read('dist', path.join(url, 'index.html'));
  contracts.set(url, seoContract(after));
  const beforeFile = path.join(beforeDir, url, 'index.html');
  assert.ok(fs.existsSync(beforeFile), `${url}: missing from the predecessor`);
  const before = fs.readFileSync(beforeFile, 'utf8');
  if (after === before) continue;
  changed.push(url);
  if (DONORS[url]) {
    const anchor = DONORS[url];
    assert.equal(after.split(`>${anchor}</a>`).length - 1, 1, `${url}: the new anchor appears once`);
    assert.equal(after.replace(`>${anchor}</a>`, `>${OLD_ANCHOR}</a>`), before, `${url}: the only change is the anchor text`);
  }
  if (NAMED[url]) {
    const named = `"@type":"BreadcrumbList","name":${JSON.stringify(NAMED[url])},`;
    assert.equal(after.split(named).length - 1, 1, `${url}: the BreadcrumbList is named once`);
    let reverted = after.replace(named, '"@type":"BreadcrumbList",');
    if (url === DL) reverted = revert(reverted, [DL_APK], url);
    assert.equal(reverted, before, `${url}: the only changes are the BreadcrumbList name${url === DL ? ' and the two reworded sentences' : ''}`);
  }
}
assert.deepEqual(changed.sort(), EXPECTED_HTML, 'exactly the UZ chat, the RU chat, the download guide and the five donors change');

// 2b. Every other built file: only llms-full.txt and the Markdown twins of the
// UZ chat and the download guide; the guide's twin differs by the two sentences only.
const otherChanged: string[] = [];
const visitFiles = (dir: string, rel: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = `${rel}${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== 'assets') visitFiles(path.join(dir, entry.name), `${relPath}/`); continue; }
    if (entry.name === 'index.html' || entry.name === 'sitemap.xml') continue;
    const beforeFile = path.join(beforeDir, relPath);
    if (!fs.existsSync(beforeFile) || !fs.readFileSync(path.join(dir, entry.name)).equals(fs.readFileSync(beforeFile))) otherChanged.push(relPath);
  }
};
visitFiles('dist', '');
const DL_MD = `${DL.slice(1)}index.html.md`;
assert.deepEqual(otherChanged.sort(), ['llms-full.txt', DL_MD, `${UZ.slice(1)}index.html.md`].sort(), 'only llms-full.txt and two Markdown twins change');
assert.equal(revert(read('dist', DL_MD), [DL_INTRO, DL_APK], DL_MD), read(beforeDir, DL_MD), `${DL_MD}: the only change is the two reworded sentences`);

// 3. Protected contracts against the reviewed predecessor
const previousRaw = fs.readFileSync(PREDECESSOR, 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw) as { pages: Array<{ pathname: string; contract: Contract; bodyText: string }> };
const reviewedChanges: Array<{ pathname: string; fields: string[]; note: string }> = [];
for (const pathname of PROTECTED_PATHS) {
  const reviewed = previous.pages.find((page) => page.pathname === pathname)!.contract;
  const current = contracts.get(pathname)!;
  const fields = (Object.keys(current) as Array<keyof Contract>).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(reviewed[key])).sort();
  assert.deepEqual(fields, CONTRACT_CHANGES[pathname] ?? [], `${pathname}: changed fields ${fields.join(', ') || 'none'}`);
  if (pathname === UZ) {
    reviewedChanges.push({
      pathname, fields,
      note: 'A section «ChatGPT bilan o‘zbek tilida gaplashish: yozma va ovozli suhbat» (the GPTBot.uz chat is written; voice is in OpenAI’s ChatGPT app, linked through the existing download-guide target) and the FAQ answer «ChatGPT bilan ovozli gaplashsa bo‘ladimi?»: «chatgpt uzbek tilida gaplashish» (1 600 searches in October 2026) put 36 % of its impressions on promptlar at CTR 0 %. The BreadcrumbList gets its name (Search Console «Unnamed item»). Title, H1, description, canonical, robots, hreflang (none, A14) and internal links unchanged.',
    });
  }
  if (pathname === DL) {
    reviewedChanges.push({
      pathname, fields,
      note: 'The two sentences added on 20.11 (intro «ChatGPT skachat…» and the «Chat GPT APK» paragraph) are reworded without the word «rasmiy» (owner’s rule for the site’s new text): «Google Play, App Store yoki chatgpt.com/download», «OpenAI’ning ChatGPT ilovasi emas», «Asl ChatGPT ilovasining ishlab chiquvchisi — OpenAI». The BreadcrumbList gets its name. Title, H1, description, canonical, robots, hreflang and internal links unchanged.',
    });
  }
}

const receipt = { checkedAt: new Date().toISOString(), predecessorRevision: PREDECESSOR, pages: pages.length, changed, reviewedChanges };
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ pages: pages.length, changed }, null, 2));

if (args.includes('--write-reviewed-revision')) {
  assert.ok(!fs.existsSync(TARGET), 'Never replace immutable evidence');
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  const protectedPages = PROTECTED_PATHS.map((pathname) => {
    const bodyText = bodyTextOf(read('dist', path.join(pathname, 'index.html')));
    const contract = contracts.get(pathname)!;
    assert.equal(sha(bodyText), contract.bodyTextSha256, `${pathname}: body text fingerprint`);
    return { pathname, contract, bodyText };
  });
  fs.writeFileSync(TARGET, `${JSON.stringify({
    schema: 1, capturedAt: new Date().toISOString(), previousRevision: PREDECESSOR, previousRevisionSha256: sha(previousRaw),
    source: 'Clean build of branch claude/festive-hypatia-c43eg6 against the build of a17451a. The UZ chat changes its body text; the download guide rewords two sentences of 20.11; the RU chat and the download guide name their BreadcrumbList; five unprotected pages change only one anchor each; every other built page is byte-identical.',
    reviewedChanges,
    invisibleToGate: [
      'The download guide, both chats leave BREADCRUMB_NAME_HELD (scripts/jsonld-helpers.ts): their BreadcrumbList is named after the page, like every other page; the login guide stays held until R14 is read on 2026-12-21.',
      'Anchors to /uz/gpt-uzbek-tilida/ on /uz/blog/chat-gpt-uzbek-biznes-uchun/, /uz/informatika-test/, /uz/ingliz-tili-zamonlari/, /uz/past-simple/ and /uz/present-continuous/: «o‘zbek tilidagi AI chat» → honest «ChatGPT … muqobil» forms, one per page, each different.',
      'intent-manifest C36: promptlar must not target «chatgpt uzbek tilida gaplashish»; the UZ chat declares it.',
    ],
    pages: protectedPages,
  }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Reviewed revision written: ${TARGET}`);
}
if (fs.existsSync(TARGET)) {
  for (const page of (JSON.parse(fs.readFileSync(TARGET, 'utf8')) as { pages: Array<{ pathname: string; contract: unknown }> }).pages) {
    assert.deepEqual(contracts.get(page.pathname), page.contract, `${page.pathname}: reviewed revision no longer matches the build`);
  }
}
