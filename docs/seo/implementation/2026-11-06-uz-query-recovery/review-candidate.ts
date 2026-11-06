import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

// Narrow owner-authorized recovery after the November 6 query/page audit.
// Only the official-login guide loses its competing language tutorial; three
// existing donors distinguish login instructions from the independent AI chat.
// This is not a recapture: the exact swaps below must reconstruct the immutable
// predecessor, and every other artifact byte (including all assets) stays frozen.
// PREDECESSOR_DIST is required. DRY=1 checks without writing. Existing evidence
// is never overwritten; CHECK=1 validates a later rebuild against the revision.
const root = process.cwd();
const dist = path.join(root, 'dist');
const previousRevision = 'docs/seo/evidence/2026-10-26-rs1b/reviewed-protected-pages.json';
const target = path.join(root, 'docs/seo/evidence/2026-11-06-uz-query-recovery/reviewed-protected-pages.json');
const fail = (message: string): never => { throw new Error(message); };
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
type ProtectedPage = { pathname: string; contract: ReturnType<typeof seoContract>; bodyText: string; htmlSha256: string };
const previous = JSON.parse(previousRaw) as { pages: ProtectedPage[] };
const predecessor = process.env.PREDECESSOR_DIST || fail('PREDECESSOR_DIST is required; use the preserved pre-build artifact.');
const bodyTextOf = (html: string) => (html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const readHtml = (dir: string, pathname: string) => fs.readFileSync(path.join(dir, pathname.slice(1), 'index.html'), 'utf8');
for (const page of previous.pages) {
  if (sha(readHtml(predecessor, page.pathname)) !== page.htmlSha256) fail(`Predecessor hash mismatch: ${page.pathname}`);
}

const LOGIN = '/uz/blog/chatgptga-qanday-kirish-mumkin/';
const CHAT = '/uz/gpt-uzbek-tilida/';
const BUSINESS = '/uz/blog/chat-gpt-uzbek-biznes-uchun/';
const STUDENTS = '/uz/blog/chatgpt-talabalar-uchun/';
const TUTORIAL = '/uz/gpt-chat-qollanma/';
const DONORS = [BUSINESS, STUDENTS, TUTORIAL];
const UNTOUCHED = PROTECTED_PATHS.filter((pathname) => pathname !== LOGIN);
const P = '<p class="text-base text-white/80 leading-relaxed mb-4">';
const A = (href: string, anchor: string) => `<a href="${href}" class="text-brand-cyan hover:underline">${anchor}</a>`;
type Swap = { surface: string; before: string; after: string };
const oldLogin = readHtml(predecessor, LOGIN);
const uniqueMatch = (html: string, regex: RegExp, surface: string) => {
  const matches = [...html.matchAll(regex)];
  if (matches.length !== 1) fail(`${surface}: expected exactly one predecessor match, got ${matches.length}`);
  return matches[0][0];
};
const oldSection = uniqueMatch(oldLogin, /<h2 id="uzbek"[\s\S]*?(?=<p class="text-base text-white\/80 leading-relaxed mb-4">)/g, 'language section');
if (!oldSection.includes('ChatGPTga kirgandan keyin o‘zbek tilida qanday ishlatish kerak?') || !oldSection.includes('<table')
  || !oldSection.includes('700 belgilik post yoz')) fail('Unexpected predecessor language section');
const oldQuestion = 'ChatGPT o‘zbek tilida ishlaydimi?';
const newQuestion = 'GPTBot.uz’da OpenAI parolini kiritish kerakmi?';
const oldAnswer = 'Ha. So‘rovni o‘zbek tilida yozing va kerak bo‘lsa «O‘zbek tilida, lotin yozuvida javob ber» deb aniqlashtiring. Menyuni esa o‘zbek tiliga o‘tkazib bo‘lmaydi (04.10.2026 holatiga interfeys tillari orasida yo‘q).';
const newAnswer = 'Yo‘q. GPTBot.uz mustaqil AI-servis bo‘lib, OpenAI hisobingizga ulanmaydi. Rasmiy ChatGPT hisobiga kirish uchun chatgpt.com manzilidan foydalaning; OpenAI parolini boshqa saytlarga kiritmang.';
const questionJson = (name: string, text: string) => JSON.stringify({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } });
const SWAPS: Record<string, Swap[]> = {
  [LOGIN]: [
    { surface: 'replace language/prompt lesson with concise alternative navigation heading', before: oldSection,
      after: '<h2 id="uzbek" class="font-display text-3xl sm:text-4xl mt-14 mb-5 text-white">Mustaqil AI-chat va qo‘llanmalar</h2>\n' },
    { surface: 'FAQPage JSON-LD: password safety instead of language-intent answer', before: questionJson(oldQuestion, oldAnswer), after: questionJson(newQuestion, newAnswer) },
    { surface: 'visible FAQ question', before: `>${oldQuestion}</h3>`, after: `>${newQuestion}</h3>` },
    { surface: 'visible FAQ answer', before: `<p class="faq-a text-white/75 mt-4 leading-relaxed">${oldAnswer}</p>`, after: `<p class="faq-a text-white/75 mt-4 leading-relaxed">${newAnswer}</p>` },
    { surface: 'article:modified_time after substantial editorial revision', before: '<meta property="article:modified_time" content="2026-10-23" />', after: '<meta property="article:modified_time" content="2026-11-06" />' },
    { surface: 'Article JSON-LD dateModified', before: '"dateModified":"2026-10-23"', after: '"dateModified":"2026-11-06"' },
    { surface: 'visible updated date; publication date unchanged', before: '<time datetime="2026-10-23">2026-10-23</time>', after: '<time datetime="2026-11-06">2026-11-06</time>' },
  ],
  [BUSINESS]: [{
    surface: 'business donor: direct AI-chat path with truthful three-answer trial; retain official login guide',
    before: uniqueMatch(readHtml(predecessor, BUSINESS), /<p class="text-base text-white\/80 leading-relaxed mb-4">ChatGPT’ni sinab ko‘rish[\s\S]*?<\/p>/g, BUSINESS),
    after: `${P}Biznes vazifasini o‘zbek tilida sinash uchun mustaqil ${A(CHAT, 'GPTBot.uz o‘zbekcha AI-chati')}ni oching. Jami 3 ta bepul sinov javobi bor, keyin AI paket kerak. Rasmiy ChatGPT hisobiga kirish bosqichlari ${A(LOGIN, 'ChatGPT’ga kirish (login)')} qo‘llanmasida berilgan.</p>`,
  }],
  [STUDENTS]: [{
    surface: 'student donor: distinguish independent chat trial from official login and installation',
    before: uniqueMatch(readHtml(predecessor, STUDENTS), /<p class="text-base text-white\/80 leading-relaxed mb-4">Bularning hammasi uchun[\s\S]*?<\/p>/g, STUDENTS),
    // Anchors of the existing login/download links remain exactly as before.
    after: '',
  }],
  [TUTORIAL]: [{
    surface: 'tutorial donor: exact total trial limit, no daily reset or guaranteed response language',
    before: uniqueMatch(readHtml(predecessor, TUTORIAL), /<p class="text-base text-white\/80 leading-relaxed mb-4">Birinchi savolni hoziroq[\s\S]*?<\/p>/g, TUTORIAL),
    after: `${P}Birinchi savolni ${A(CHAT, 'o‘zbek tilidagi ChatGPT muqobili')}da yozing. GPTBot.uz’da jami 3 ta bepul sinov javobi bor; limit har kuni yangilanmaydi, keyin AI paket kerak. Savolni o‘zbek yoki rus tilida yozishingiz mumkin.</p>`,
  }],
};
const studentBefore = SWAPS[STUDENTS][0].before;
const studentLogin = uniqueMatch(studentBefore, /<a href="\/uz\/blog\/chatgptga-qanday-kirish-mumkin\/"[^>]*>[^<]*<\/a>/g, 'student existing login anchor');
const studentDownload = uniqueMatch(studentBefore, /<a href="\/uz\/blog\/chatgpt-telefon-va-kompyuterga-yuklab-olish\/"[^>]*>[^<]*<\/a>/g, 'student existing download anchor');
SWAPS[STUDENTS][0].after = `${P}O‘zbekcha savollarni mustaqil ${A(CHAT, 'GPTBot.uz AI-chati')}da sinab ko‘ring: jami 3 ta bepul sinov javobi bor, keyin AI paket kerak. Rasmiy ChatGPT hisobiga kirish uchun ${studentLogin}, ilovani o‘rnatish uchun esa ${studentDownload} qo‘llanmasini oching.</p>`;

const textStep = (newText: string, oldText: string) => {
  let prefix = 0;
  while (prefix < newText.length && prefix < oldText.length && newText[prefix] === oldText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < newText.length - prefix && suffix < oldText.length - prefix && newText.at(-1 - suffix) === oldText.at(-1 - suffix)) suffix++;
  // Extend the minimal change only until its after fragment is unique.
  for (let context = 32; ; context *= 2) {
    const start = Math.max(0, prefix - context);
    const endNew = Math.min(newText.length, newText.length - suffix + context);
    const endOld = Math.min(oldText.length, oldText.length - suffix + context);
    const after = newText.slice(start, endNew);
    if (after && newText.split(after).length === 2) return { before: oldText.slice(start, endOld), after };
  }
};
const reversed = (pathname: string, candidate: string) => {
  let html = candidate;
  const body: Array<Swap> = [];
  for (const swap of SWAPS[pathname]) {
    if (html.split(swap.after).length !== 2) fail(`${pathname}: ${swap.surface} not unique in candidate`);
    const beforeText = bodyTextOf(html);
    html = html.replace(swap.after, () => swap.before);
    const afterText = bodyTextOf(html);
    if (beforeText !== afterText) body.push({ surface: swap.surface, ...textStep(beforeText, afterText) });
  }
  if (sha(html) !== sha(readHtml(predecessor, pathname))) fail(`${pathname}: differs beyond the reviewed swaps`);
  let replay = bodyTextOf(candidate);
  for (const step of body) {
    if (replay.split(step.after).length !== 2) fail(`${pathname}: ambiguous recorded body-text step`);
    replay = replay.replace(step.after, () => step.before);
  }
  if (replay !== bodyTextOf(html)) fail(`${pathname}: recorded text changes fail to reproduce predecessor`);
  return body;
};
const pages = PROTECTED_PATHS.map((pathname) => {
  const html = readHtml(dist, pathname);
  return { pathname, contract: seoContract(html), bodyText: bodyTextOf(html), htmlSha256: sha(html) };
});
for (const page of pages) {
  const before = previous.pages.find((row) => row.pathname === page.pathname)!;
  const fields = Object.keys(page.contract).filter((key) => JSON.stringify(page.contract[key as keyof typeof page.contract]) !== JSON.stringify(before.contract[key as keyof typeof before.contract]));
  const expected = page.pathname === LOGIN ? ['bodyTextSha256'] : [];
  if (JSON.stringify(fields) !== JSON.stringify(expected)) fail(`${page.pathname}: unexpected contract changes ${JSON.stringify(fields)}`);
  if (page.pathname !== LOGIN && page.htmlSha256 !== before.htmlSha256) fail(`${page.pathname}: frozen raw HTML changed`);
}
const guideBody = reversed(LOGIN, readHtml(dist, LOGIN));
const donorProof = DONORS.map((pathname) => {
  const before = readHtml(predecessor, pathname); const after = readHtml(dist, pathname);
  const ca = seoContract(before); const cb = seoContract(after);
  for (const key of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang'] as const) {
    if (JSON.stringify(ca[key]) !== JSON.stringify(cb[key])) fail(`${pathname}: changed metadata ${key}`);
  }
  const removed = ca.internalLinks.filter((href) => !cb.internalLinks.includes(href));
  if (removed.length) fail(`${pathname}: removed links ${removed.join(', ')}`);
  return { pathname, beforeSha256: sha(before), afterSha256: sha(after), addedLinks: cb.internalLinks.filter((href) => !ca.internalLinks.includes(href)), body: reversed(pathname, after) };
});

const walk = (dir: string, base = dir): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isSymbolicLink()) fail(`Artifact contains symlink: ${full}`);
  return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
});
const ignored = new Set(['gptbot-release.json']);
const beforeFiles = walk(predecessor).filter((file) => !ignored.has(file)).sort();
const afterFiles = walk(dist).filter((file) => !ignored.has(file)).sort();
if (JSON.stringify(beforeFiles) !== JSON.stringify(afterFiles)) fail(`Artifact file set changed: +${afterFiles.filter((f) => !beforeFiles.includes(f))} -${beforeFiles.filter((f) => !afterFiles.includes(f))}`);
const artifactChanges: Array<{ file: string; beforeSha256: string; afterSha256: string }> = [];
for (const file of beforeFiles) {
  const beforeSha256 = sha(fs.readFileSync(path.join(predecessor, file)));
  const afterSha256 = sha(fs.readFileSync(path.join(dist, file)));
  if (beforeSha256 !== afterSha256) artifactChanges.push({ file, beforeSha256, afterSha256 });
}
// Final exact output allowlist is reviewed against the completed candidate.
const EXPECTED_CHANGED_FILES = [
  'llms-full.txt', 'sitemap-updates.xml', 'sitemap.xml', 'updates/atom.xml',
  'uz/blog/index.html', 'uz/blog/feed.xml',
  ...[LOGIN, BUSINESS, STUDENTS, TUTORIAL].map((pathname) => `${pathname.slice(1)}index.html`),
  `${LOGIN.slice(1)}index.html.md`,
].sort();
if (JSON.stringify(artifactChanges.map((row) => row.file)) !== JSON.stringify(EXPECTED_CHANGED_FILES)) fail(`Unexpected artifact differences: ${JSON.stringify(artifactChanges.map((row) => row.file))}`);
const assets = beforeFiles.filter((file) => /\.(?:js|css|woff2?|png|webp|svg|ico|jpe?g)$/.test(file));
if (artifactChanges.some(({ file }) => assets.includes(file))) fail('A frozen asset changed');

// Derived outputs are reconstructed from the predecessor, not merely allowed
// because they belong to a feed/sitemap family. The existing aggregate-lastmod
// rule also advances / and /uz/blog/; their content contracts remain frozen.
const readFile = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const replaceOnce = (input: string, before: string, after: string, surface: string) => {
  if (!before || input.split(before).length !== 2) fail(`${surface}: expected one exact occurrence`);
  return input.replace(before, () => after);
};
const matchesExpected = (file: string, expected: string) => {
  if (readFile(dist, file) !== expected) fail(`${file}: differs beyond the reviewed derived transformation`);
};
for (const file of ['sitemap.xml', 'sitemap-updates.xml']) {
  let expected = readFile(predecessor, file);
  for (const [pathname, oldDate] of [['/', '2026-10-26'], ['/uz/blog/', '2026-10-25'], [LOGIN, '2026-10-23']]) {
    const blocks = [...expected.matchAll(/<url>[\s\S]*?<\/url>/g)].map((match) => match[0]);
    const found = blocks.filter((block) => block.includes(`<loc>https://gptbot.uz${pathname}</loc>`));
    if (found.length !== 1) fail(`${file}: missing/duplicate ${pathname}`);
    const changed = replaceOnce(found[0], `<lastmod>${oldDate}</lastmod>`, '<lastmod>2026-11-06</lastmod>', `${file}: ${pathname} date`);
    expected = replaceOnce(expected, found[0], changed, `${file}: ${pathname} block`);
  }
  matchesExpected(file, expected);
}
const indexFile = 'uz/blog/index.html';
const oldIndex = readFile(predecessor, indexFile);
const recent = uniqueMatch(oldIndex, /<h2 id="blog-recently-updated-heading"[\s\S]*?<\/section>/g, 'recently updated index list');
const items = [...recent.matchAll(/<li>[\s\S]*?<\/li>/g)].map((match) => match[0]);
const guideItem = items.filter((item) => item.includes(`href="${LOGIN}"`));
if (items.length !== 8 || guideItem.length !== 1 || items[0] === guideItem[0]) fail('Unexpected predecessor recently updated order');
const updatedItem = replaceOnce(guideItem[0], '<time datetime="2026-10-23">2026-10-23</time>', '<time datetime="2026-11-06">2026-11-06</time>', 'blog index guide date');
const expectedRecent = replaceOnce(replaceOnce(recent, guideItem[0], '', 'remove old guide card'), items[0], updatedItem + items[0], 'guide card goes first');
matchesExpected(indexFile, replaceOnce(oldIndex, recent, expectedRecent, 'recent list replacement'));

for (const [file, tag, indent, oldRootDate, newRootDate] of [
  ['uz/blog/feed.xml', 'item', '    ', '<lastBuildDate>Sun, 25 Oct 2026 00:00:00 GMT</lastBuildDate>', '<lastBuildDate>Fri, 06 Nov 2026 00:00:00 GMT</lastBuildDate>'],
  ['updates/atom.xml', 'entry', '  ', '<updated>2026-10-26T00:00:00Z</updated>', '<updated>2026-11-06T00:00:00Z</updated>'],
]) {
  const before = readFile(predecessor, file);
  const entries = [...before.matchAll(new RegExp(`${indent}<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>\\n`, 'g'))].map((match) => match[0]);
  const guide = entries.filter((entry) => entry.includes(`https://gptbot.uz${LOGIN}`));
  if (guide.length !== 1 || !entries.length || guide[0] === entries[0]) fail(`${file}: unexpected predecessor entries`);
  const updated = replaceOnce(guide[0], '2026-10-23T00:00:00Z', '2026-11-06T00:00:00Z', `${file}: guide updated`);
  let expected = replaceOnce(before, guide[0], '', `${file}: remove old guide position`);
  expected = replaceOnce(expected, entries[0], updated + entries[0], `${file}: guide becomes newest entry`);
  // The Atom root date is also shared by article entries, so anchor it to the
  // author block and first entry rather than silently changing every occurrence.
  const rootBefore = file === 'updates/atom.xml' ? `${oldRootDate}\n  <entry` : oldRootDate;
  const rootAfter = file === 'updates/atom.xml' ? `${newRootDate}\n  <entry` : newRootDate;
  expected = replaceOnce(expected, rootBefore, rootAfter, `${file}: root update date`);
  matchesExpected(file, expected);
}
const markdownFile = `${LOGIN.slice(1)}index.html.md`;
const beforeMarkdown = readFile(predecessor, markdownFile);
const afterMarkdown = readFile(dist, markdownFile);
const markdownSection = uniqueMatch(beforeMarkdown, /## ChatGPTga kirgandan keyin o‘zbek tilida qanday ishlatish kerak\?[\s\S]*?(?=Mustaqil chatda mashq qilish)/g, 'old markdown language section');
let expectedMarkdown = replaceOnce(beforeMarkdown, markdownSection, '## Mustaqil AI-chat va qo‘llanmalar\n\n', 'markdown section');
expectedMarkdown = replaceOnce(expectedMarkdown, `**${oldQuestion}**\n\n${oldAnswer}`, `**${newQuestion}**\n\n${newAnswer}`, 'markdown FAQ');
expectedMarkdown = replaceOnce(expectedMarkdown, 'Yangilangan: 2026-10-23_', 'Yangilangan: 2026-11-06_', 'markdown modified date');
matchesExpected(markdownFile, expectedMarkdown);
matchesExpected('llms-full.txt', replaceOnce(readFile(predecessor, 'llms-full.txt'), beforeMarkdown.trimEnd(), afterMarkdown.trimEnd(), 'llms-full guide twin only'));

const revision = {
  schema: 1, capturedAt: new Date().toISOString(), previousRevision, previousRevisionSha256: sha(previousRaw),
  source: 'November 6 local recovery candidate after source and complete artifact review. Predecessor copied from the preserved October 26 production artifact (72093788); production deployment and live verification are recorded separately.',
  reviewedChanges: [{ pathname: LOGIN, fields: ['bodyTextSha256'],
    reason: 'Owner authorized autonomous repair after the November 6 GSC audit. Preserve official-login intent and the successful generic query while separating the Uzbek AI-chat task; no chat metadata experiment.',
    change: { title: 'unchanged', h1: 'unchanged', description: 'unchanged', robots: 'unchanged', canonical: 'unchanged', hreflang: 'unchanged', internalLinks: 'unchanged', body: guideBody,
      dates: 'dateModified, article:modified_time and visible updated date 2026-10-23 to 2026-11-06; datePublished unchanged' },
    htmlSha256: `${previous.pages.find((page) => page.pathname === LOGIN)!.htmlSha256} → ${pages.find((page) => page.pathname === LOGIN)!.htmlSha256}`,
    nonContract: { jsonLd: 'FAQPage replaces the language answer with the same password-safety answer shown visibly; Article dateModified follows the real editorial update. BreadcrumbList stays nameless.' },
  }],
  invisibleToGate: [{ change: 'Nine remaining protected pages retain exact raw HTML, including both chats, download guide and homepage. Every JS/CSS/image/font asset and the whole artifact file set stays identical.' },
    { change: 'Three unprotected donor paragraphs gain clear chat/login paths and truthful total three-answer trial wording. Donor publication/modification dates and metadata stay unchanged.' },
    { change: 'Derived UZ blog index and both feeds move the same guide to first with its new date, retaining every other entry. Sitemaps change exactly three lastmod values: login guide, /uz/blog/ and / (existing aggregate-date rule). Only the guide Markdown twin and its llms-full section change; donor twins are byte-identical. Every derived output is exactly reconstructed and all artifact hashes are recorded.' }],
  frozenProtectedPages: UNTOUCHED,
  changedUnprotectedPages: donorProof,
  artifactProof: { predecessorCommit: '72093788', comparedFiles: beforeFiles.length, identicalFiles: beforeFiles.length - artifactChanges.length, frozenAssetFiles: assets.length, changed: artifactChanges },
  exactHtmlSwaps: SWAPS,
  measurement: 'Start a new observation marker at actual production release/recrawl; measure the six Uzbek queries, Uzbekistan mobile, and generic chatgpt kirish separately. Do not combine with chat-title/download changes. No ranking or traffic guarantee.',
  pages,
};
console.log(JSON.stringify({ protectedChanged: [LOGIN], protectedFrozen: UNTOUCHED, donors: donorProof.map(({ pathname, addedLinks }) => ({ pathname, addedLinks })), artifactProof: revision.artifactProof }, null, 2));
if (process.env.CHECK) {
  const stored = JSON.parse(fs.readFileSync(target, 'utf8')) as typeof revision;
  if (JSON.stringify(stored.artifactProof) !== JSON.stringify(revision.artifactProof) || JSON.stringify(stored.pages) !== JSON.stringify(revision.pages)
    || stored.previousRevisionSha256 !== revision.previousRevisionSha256) fail('Rebuild differs from the immutable reviewed revision');
  console.log('CHECK passed: rebuild matches immutable review.');
} else if (process.env.DRY) console.log('DRY passed: no evidence written.');
else {
  if (fs.existsSync(target)) fail('Revision already exists; use CHECK=1 or a new dated revision, never overwrite evidence.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(revision, null, 2)}\n`, { flag: 'wx' });
  console.log(`Wrote ${path.relative(root, target)}`);
}
