import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSeoProtection, BASELINE, PROTECTED_PATHS, seoContract } from '../scripts/seo-protection';
import type { BlogArticle, Page } from '../src/shared/types';

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-seo-protection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pages = PROTECTED_PATHS.map(pathname => {
    const html = `<html><head><title>Useful guide</title><meta name="description" content="A real answer"><meta name="robots" content="index,follow"><link rel="canonical" href="https://gptbot.uz${pathname}"><link rel="alternate" hreflang="uz" href="https://gptbot.uz${pathname}"><link rel="stylesheet" href="/assets/index-before.css"></head><body><h1>Helpful answer</h1><p>Original search content</p><a href="/ru/gpt-chat/">Open chat</a><script>window.build='before'</script></body></html>`;
    const file = path.join(root, pathname.slice(1), 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html);
    return { pathname, contract: seoContract(html) };
  });
  const baseline = path.join(root, 'baseline.json');
  fs.writeFileSync(baseline, JSON.stringify({ schema: 1, pages }));
  return { root, baseline, file: path.join(root, 'index.html') };
}

test('new JS/CSS builds and HTML whitespace do not masquerade as SEO changes', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replaceAll('before', 'after').replace('<p>', '\n<p>\n'));
  assert.doesNotThrow(() => assertSeoProtection(f.root, f.baseline));
});

test('a release rejects deleted pages, overwritten content and indexation regressions', t => {
  const f = fixture(t); const original = fs.readFileSync(f.file, 'utf8');
  const cases = [
    ['Useful guide', 'Wrong intent', 'title'], ['Helpful answer', 'Wrong heading', 'h1'],
    ['A real answer', 'Wrong description', 'description'], ['index,follow', 'noindex,follow', 'robots'],
    ['rel="canonical" href="https://gptbot.uz/"', 'rel="canonical" href="https://gptbot.uz/ru/"', 'canonical'],
    ['Original search content', '', 'bodyTextSha256'], ['hreflang="uz"', 'hreflang="ru"', 'hreflang'],
    ['<a href="/ru/gpt-chat/">', '<a href="/wrong/">', 'internalLinks'],
    ['</head>', '<meta name="googlebot" content="noindex"></head>', 'googlebot'],
  ];
  for (const [from, to, field] of cases) {
    fs.writeFileSync(f.file, original.replace(from, to));
    assert.throws(() => assertSeoProtection(f.root, f.baseline), new RegExp(field));
  }
  fs.unlinkSync(f.file);
  assert.throws(() => assertSeoProtection(f.root, f.baseline), /missing HTML/);
});

test('comments cannot conceal missing metadata and all protected URLs remain mandatory', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('<h1>Helpful answer</h1>', '<!-- <h1>Helpful answer</h1> -->'));
  assert.throws(() => assertSeoProtection(f.root, f.baseline), /h1/);
  const snapshot = JSON.parse(fs.readFileSync(f.baseline, 'utf8'));
  snapshot.pages.pop();
  fs.writeFileSync(f.baseline, JSON.stringify(snapshot));
  assert.throws(() => assertSeoProtection(f.root, f.baseline), /all ten/);
});

// ── Reviewed revisions ───────────────────────────────────────────────────────
// A revision is a new file under docs/seo/evidence/<date>-<name>/ that names
// its predecessor. The gate itself only compares a build with BASELINE; these
// tests make the revision prove what it changed.

type Revision = {
  schema: 1;
  previousRevision?: string;
  previousRevisionSha256?: string;
  reviewedChanges: Array<{ pathname: string; fields: string[] }>;
  pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string }>;
};
const REPO = path.resolve(import.meta.dirname, '..');
const readRevision = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Revision;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const PAID_CHAT = 'docs/seo/evidence/2026-10-01-paid-chat-honesty/reviewed-protected-pages.json';
const GSC_DRIVEN = 'docs/seo/evidence/2026-09-30-gsc-driven/reviewed-protected-pages.json';

test('October recovery preserves search metadata and the download winner while separating login intent', () => {
  const current = readRevision('docs/seo/evidence/2026-10-23-recovery/reviewed-protected-pages.json');
  const previous = readRevision('docs/seo/evidence/2026-10-08-recovery/reviewed-protected-pages.json');
  assert.deepEqual(current.reviewedChanges.map(c => [c.pathname, [...c.fields].sort()]), [
    ['/uz/gpt-uzbek-tilida/', ['bodyTextSha256']],
    ['/uz/blog/chatgptga-qanday-kirish-mumkin/', ['bodyTextSha256', 'internalLinks']],
  ]);
  for (const page of current.pages) {
    const before = previous.pages.find(p => p.pathname === page.pathname)!;
    for (const field of ['title', 'h1', 'description', 'canonical', 'robots', 'googlebot', 'hreflang']) {
      assert.deepEqual(page.contract[field], before.contract[field], `${page.pathname}: ${field}`);
    }
  }
  assert.deepEqual(current.pages[0].contract, previous.pages[0].contract);
});

test('the chat-snippets revision changes only the two chats\' title and description, honestly', () => {
  const current = readRevision('docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json');
  const previous = readRevision('docs/seo/evidence/2026-10-23-recovery/reviewed-protected-pages.json');
  assert.equal(current.previousRevision, 'docs/seo/evidence/2026-10-23-recovery/reviewed-protected-pages.json');
  assert.deepEqual(current.reviewedChanges.map(c => [c.pathname, [...c.fields].sort()]), [
    ['/uz/gpt-uzbek-tilida/', ['description', 'title']],
    ['/ru/gpt-chat/', ['description', 'title']],
  ]);
  for (const page of current.pages) {
    const before = previous.pages.find(p => p.pathname === page.pathname)!;
    for (const field of ['h1', 'canonical', 'robots', 'googlebot', 'hreflang', 'internalLinks', 'bodyTextSha256']) {
      assert.deepEqual(page.contract[field], before.contract[field], `${page.pathname}: ${field}`);
    }
    if (!['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'].includes(page.pathname)) assert.deepEqual(page.contract, before.contract, page.pathname);
  }
  const contract = (p: string) => current.pages.find(page => page.pathname === p)!.contract as { title: string[]; description: string[] };
  const uz = contract('/uz/gpt-uzbek-tilida/');
  const ru = contract('/ru/gpt-chat/');
  assert.deepEqual(uz.title, ['ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat']);
  assert.deepEqual(uz.description, ['O‘zbekcha yozing: matn, reja va g‘oyalar brauzerda, ilovasiz. Ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. GPTBot.uz — mustaqil servis, OpenAI emas.']);
  assert.deepEqual(ru.title, ['Аналог ChatGPT онлайн в Узбекистане — без регистрации']);
  assert.deepEqual(ru.description, ['ИИ-чат на русском и узбекском в браузере, без установки: 3 бесплатных пробных ответа, затем AI-пакет. GPTBot.uz — независимый сервис, не OpenAI и не ChatGPT.']);
  for (const text of [...uz.title, ...uz.description, ...ru.title, ...ru.description]) {
    assert.doesNotMatch(text, /rasmiy|официальн|official|GPT-4|GPT-5|tarjima|перевод/i, text);
  }
  assert.match(uz.title[0], /muqobil/);
  assert.match(ru.title[0], /Аналог/);
  assert.match(uz.description[0], /mustaqil servis, OpenAI emas/);
  assert.match(ru.description[0], /независимый сервис, не OpenAI и не ChatGPT/);
  for (const [title, description] of [[uz.title[0], uz.description[0]], [ru.title[0], ru.description[0]]]) {
    assert.ok(title.length <= 60, `${title}: ${title.length}`);
    assert.ok(description.length >= 120 && description.length <= 160, `${description}: ${description.length}`);
  }
  for (const file of ['content/pages/uz/gpt-uzbek-tilida.json', 'content/pages/ru/gpt-chat.json']) {
    const page = JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Page;
    assert.equal(page.ogTitle, page.title, file);
    assert.equal(page.ogDescription, page.description, file);
  }
});

test('the wave-1 revision changes only the homepage list: the two published translator pages, nothing else on the ten', () => {
  type Wave1 = Revision & {
    reviewedChanges: Array<{ pathname: string; fields: string[]; reason: string; htmlSha256: string }>;
    invisibleToGate: Array<{ change: string; pages?: string[]; htmlSha256?: Record<string, string> }>;
    measurement: string;
    pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string; htmlSha256: string }>;
  };
  const CHAT_SNIPPETS = 'docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json';
  const current = readRevision('docs/seo/evidence/2026-10-24-wave1/reviewed-protected-pages.json') as Wave1;
  const previous = readRevision(CHAT_SNIPPETS) as Wave1;
  assert.equal(current.previousRevision, CHAT_SNIPPETS);
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [['/', ['bodyTextSha256', 'internalLinks']]]);
  const translators = ['/ru/russko-uzbekskiy-perevodchik/', '/uz/rus-ozbek-tarjimon/'];
  const labels = ['Русско-узбекский AI-переводчик: перевод с пояснениями', 'Ruscha-o‘zbekcha AI tarjimon: izohli tarjima'];
  for (const page of current.pages) {
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    if (page.pathname === '/') continue;
    assert.deepEqual(page.contract, before.contract, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
    // The seven protected articles keep their HTML byte for byte (download guide P-CTR, chat windows).
    if (!['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'].includes(page.pathname)) assert.equal(page.htmlSha256, before.htmlSha256, page.pathname);
  }
  const home = current.pages.find((p) => p.pathname === '/')!;
  const homeBefore = previous.pages.find((p) => p.pathname === '/')!;
  const links = (p: typeof home) => p.contract.internalLinks as string[];
  assert.deepEqual(links(home).filter((l) => !links(homeBefore).includes(l)), translators);
  assert.deepEqual(links(homeBefore).filter((l) => !links(home).includes(l)), []);
  for (const key of ['title', 'h1', 'description', 'canonical', 'robots', 'googlebot', 'hreflang']) {
    assert.deepEqual(home.contract[key], homeBefore.contract[key], `/: ${key}`);
  }
  // The two H1 labels are the whole text change, each in its money list.
  let text = home.bodyText;
  for (const label of labels) {
    assert.equal(text.split(`${label} `).length, 2, label);
    text = text.replace(`${label} `, '');
  }
  assert.equal(text, homeBefore.bodyText);
  // Honest labels: no ChatGPT, official or model claim on the homepage entries.
  for (const label of labels) assert.doesNotMatch(label, /chatgpt|rasmiy|официальн|official|GPT-4|GPT-5|Google/i, label);
  // The chats' HTML changes by the bundle name only, with hashes before and after; the record names what it reviews.
  const chats = current.invisibleToGate.find((c) => JSON.stringify(c.pages) === JSON.stringify(['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/']))!;
  assert.match(chats.change, /\/assets\/gpt-chat-[\w-]+\.js → \/assets\/gpt-chat-[\w-]+\.js/);
  assert.deepEqual(Object.keys(chats.htmlSha256!), ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/']);
  for (const value of Object.values(chats.htmlSha256!)) assert.match(value, /^[0-9a-f]{64} → [0-9a-f]{64}$/);
  const invisible = current.invisibleToGate.map((c) => c.change).join('\n');
  assert.match(invisible, /BreadcrumbList/);
  assert.match(invisible, /Clean-param/);
  assert.match(invisible, /! Cache-Control/);
  assert.match(current.measurement, /28-day window/);
  for (const text of [...current.invisibleToGate.map((c) => c.change), ...current.reviewedChanges.map((c) => JSON.stringify(c))]) {
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
  }
});

test('the wave-1b revision changes only the homepage list: three new guides and the Telegram hub\'s H1, nothing else on the ten', () => {
  type Wave1b = Revision & {
    reviewedChanges: Array<{ pathname: string; fields: string[]; reason: string; htmlSha256: string }>;
    invisibleToGate: Array<{ change: string }>;
    measurement: string;
    pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string; htmlSha256: string }>;
  };
  const WAVE1 = 'docs/seo/evidence/2026-10-24-wave1/reviewed-protected-pages.json';
  const current = readRevision('docs/seo/evidence/2026-10-24-wave1b/reviewed-protected-pages.json') as Wave1b;
  const previous = readRevision(WAVE1) as Wave1b;
  assert.equal(current.previousRevision, WAVE1);
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [['/', ['bodyTextSha256', 'internalLinks']]]);
  // The nine other protected pages, both chats included, keep their HTML byte for byte
  // (chat snippet window from 24.10, download guide P-CTR ≈06–10.11).
  for (const page of current.pages) {
    if (page.pathname === '/') continue;
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    assert.deepEqual(page.contract, before.contract, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
    assert.equal(page.htmlSha256, before.htmlSha256, page.pathname);
  }
  const guides = ['/uz/blog/rasmiy-xat-yozish/', '/uz/blog/tabrik-yozish/', '/uz/blog/tavsifnoma-namuna/'];
  const home = current.pages.find((p) => p.pathname === '/')!;
  const homeBefore = previous.pages.find((p) => p.pathname === '/')!;
  const links = (p: typeof home) => p.contract.internalLinks as string[];
  assert.deepEqual(links(home).filter((l) => !links(homeBefore).includes(l)), guides);
  assert.deepEqual(links(homeBefore).filter((l) => !links(home).includes(l)), []);
  for (const key of ['title', 'h1', 'description', 'canonical', 'robots', 'googlebot', 'hreflang']) {
    assert.deepEqual(home.contract[key], homeBefore.contract[key], `/: ${key}`);
  }
  // The three guide titles (from content/, as the shell prints them) and the hub's new H1 are the whole text change.
  const doc = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as BlogArticle & Page;
  const titles = ['tavsifnoma-namuna', 'rasmiy-xat-yozish', 'tabrik-yozish'].map((slug) => doc(`content/blog/uz/${slug}.json`).title);
  const hub = doc('content/pages/uz/telegram-bot-biznes-uchun.json');
  assert.equal(hub.h1, 'Telegram bot yaratish biznes uchun: arizalarni avtomatlashtirish');
  let text = home.bodyText;
  for (const title of titles) {
    assert.equal(text.split(`${title} `).length, 2, title);
    text = text.replace(`${title} `, '');
  }
  assert.equal(text.split(hub.h1).length, 2, hub.h1);
  assert.equal(text.replace(hub.h1, 'Telegram bot biznes uchun: savdoni avtomatlashtirish'), homeBefore.bodyText);
  // Honest labels: no ChatGPT, official or model claim on the homepage entries.
  for (const label of [...titles, hub.h1]) assert.doesNotMatch(label, /chatgpt|rasmiy sayt|официальн|official|GPT-4|GPT-5|OpenAI/i, label);
  assert.match(home.htmlSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(home.htmlSha256, homeBefore.htmlSha256);
  const invisible = current.invisibleToGate.map((c) => c.change).join('\n');
  assert.match(invisible, /byte-identical/);
  assert.match(invisible, /llms-full\.txt is built as a superset of llms\.txt/);
  assert.match(invisible, /Markdown twin/);
  assert.match(invisible, /sitemap lastmod of \/ moves/);
  assert.match(current.measurement, /28-day window/);
  assert.match(current.measurement, /C49–C51/);
  for (const text of [...current.invisibleToGate.map((c) => c.change), ...current.reviewedChanges.map((c) => JSON.stringify(c))]) {
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
  }
});

test('the AI-tools revision changes only the homepage list: nine tool pages, two Uzum guides and one retargeted H1; the chats move by their bundle name only', () => {
  type AiTools = Revision & {
    reviewedChanges: Array<{ pathname: string; fields: string[]; reason: string; htmlSha256: string }>;
    invisibleToGate: Array<{ change: string; pages?: string[]; htmlSha256?: Record<string, string> }>;
    measurement: string;
    pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string; htmlSha256: string }>;
  };
  const WAVE1B = 'docs/seo/evidence/2026-10-24-wave1b/reviewed-protected-pages.json';
  const current = readRevision('docs/seo/evidence/2026-10-25-ai-tools/reviewed-protected-pages.json') as AiTools;
  const previous = readRevision(WAVE1B) as AiTools;
  assert.equal(current.previousRevision, WAVE1B);
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [['/', ['bodyTextSha256', 'internalLinks']]]);
  const chats = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];
  for (const page of current.pages) {
    if (page.pathname === '/') continue;
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    assert.deepEqual(page.contract, before.contract, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
    // The seven protected articles keep their HTML byte for byte (download guide P-CTR ≈06–10.11).
    if (!chats.includes(page.pathname)) assert.equal(page.htmlSha256, before.htmlSha256, page.pathname);
  }
  // The chats' HTML changes by the bundle name only, with hashes before and after (platform commit af0446fe).
  const chatRecord = current.invisibleToGate.find((c) => JSON.stringify(c.pages) === JSON.stringify(chats))!;
  assert.match(chatRecord.change, /\/assets\/gpt-chat-[\w-]+\.js → \/assets\/gpt-chat-[\w-]+\.js/);
  assert.match(chatRecord.change, /af0446fe/);
  assert.deepEqual(Object.keys(chatRecord.htmlSha256!), chats);
  for (const pathname of chats) {
    const [before, after] = chatRecord.htmlSha256![pathname].split(' → ');
    assert.equal(before, previous.pages.find((p) => p.pathname === pathname)!.htmlSha256, pathname);
    assert.equal(after, current.pages.find((p) => p.pathname === pathname)!.htmlSha256, pathname);
  }
  const added = [
    '/ru/blog/kak-stat-prodavcom-na-uzum-market/', '/ru/generator-pozdravleniy/', '/ru/kalkulyator/', '/ru/kirillica-v-latinicu/',
    '/ru/nepravilnye-glagoly/', '/uz/ai-sher-yozish/', '/uz/ai-tabrik-generatori/', '/uz/blog/uzum-marketda-sotuvchi-bolish/',
    '/uz/kalkulyator/', '/uz/kirill-lotin/', '/uz/notogri-fellar/',
  ];
  const home = current.pages.find((p) => p.pathname === '/')!;
  const homeBefore = previous.pages.find((p) => p.pathname === '/')!;
  const links = (p: typeof home) => p.contract.internalLinks as string[];
  assert.deepEqual(links(home).filter((l) => !links(homeBefore).includes(l)), added);
  assert.deepEqual(links(homeBefore).filter((l) => !links(home).includes(l)), []);
  for (const key of ['title', 'h1', 'description', 'canonical', 'robots', 'googlebot', 'hreflang']) {
    assert.deepEqual(home.contract[key], homeBefore.contract[key], `/: ${key}`);
  }
  // The labels as the shell prints them (from content/: H1 for pages, title for articles) and the retargeted H1 are the whole text change.
  const doc = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as BlogArticle & Page;
  const pageFile = (url: string) => `content/pages/${url.split('/')[1]}/${url.split('/')[2]}.json`;
  const labels = added.map((url) => (url.includes('/blog/')
    ? doc(`content/blog/${url.split('/')[1]}/${url.split('/')[3]}.json`).title
    : doc(pageFile(url)).h1));
  const retargeted = doc('content/pages/uz/gpt-telegram-instagram-ideya.json');
  assert.equal(retargeted.h1, 'Reklama matni yozish: Telegram va Instagram uchun AI generator');
  assert.equal(retargeted.primaryKeyword, 'reklama matni yozish');
  let text = home.bodyText;
  for (const label of labels) {
    assert.equal(text.split(`${label} `).length, 2, label);
    text = text.replace(`${label} `, '');
  }
  assert.equal(text.split(retargeted.h1).length, 2, retargeted.h1);
  assert.equal(text.replace(retargeted.h1, 'GPT Telegram va Instagram uchun: g‘oyalar va reklama matnlari'), homeBefore.bodyText);
  // Honest labels: no ChatGPT, official or model claim on the homepage entries.
  for (const label of [...labels, retargeted.h1]) assert.doesNotMatch(label, /chatgpt|rasmiy|официальн|official|GPT-4|GPT-5|OpenAI|Google/i, label);
  // Every new tool page is a chat tool page with its role, and none of them is protected.
  for (const url of added.filter((u) => !u.includes('/blog/'))) {
    const page = doc(pageFile(url));
    assert.equal(page.pageType, 'gpt-chat', url);
    assert.ok(page.chatRole, `${url} has no chatRole`);
    assert.ok(!(PROTECTED_PATHS as readonly string[]).includes(url), url);
  }
  assert.notEqual(home.htmlSha256, homeBefore.htmlSha256);
  const invisible = current.invisibleToGate.map((c) => c.change).join('\n');
  assert.match(invisible, /seven protected articles are byte-identical/);
  assert.match(invisible, /llms\.txt/);
  assert.match(invisible, /sitemap lastmod of \//);
  assert.match(current.measurement, /28-day window/);
  assert.match(current.measurement, /C53, C54, C57–C59, C61, C62, C65/);
  for (const text of [...current.invisibleToGate.map((c) => c.change), ...current.reviewedChanges.map((c) => JSON.stringify(c))]) {
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
  }
});

test('the AI-tools wave B revision changes only the homepage list: nine tool pages and four niche playbooks; the other nine pages are byte-identical', () => {
  type AiToolsB = Revision & {
    reviewedChanges: Array<{ pathname: string; fields: string[]; reason: string; htmlSha256: string }>;
    invisibleToGate: Array<{ change: string; pages?: string[]; htmlSha256?: Record<string, string> }>;
    measurement: string;
    pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string; htmlSha256: string }>;
  };
  const WAVE_A = 'docs/seo/evidence/2026-10-25-ai-tools/reviewed-protected-pages.json';
  const current = readRevision('docs/seo/evidence/2026-10-25-ai-tools-b/reviewed-protected-pages.json') as AiToolsB;
  const previous = readRevision(WAVE_A) as AiToolsB;
  assert.equal(current.previousRevision, WAVE_A);
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [['/', ['bodyTextSha256', 'internalLinks']]]);
  // The nine other protected pages, both chats included, keep their HTML byte for byte
  // (chat snippet window from 24.10, download guide P-CTR ≈06–10.11).
  const chats = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];
  for (const page of current.pages) {
    if (page.pathname === '/') continue;
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    assert.deepEqual(page.contract, before.contract, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
    assert.equal(page.htmlSha256, before.htmlSha256, page.pathname);
  }
  const chatRecord = current.invisibleToGate.find((c) => JSON.stringify(c.pages) === JSON.stringify(chats))!;
  assert.match(chatRecord.change, /byte-identical/);
  assert.match(chatRecord.change, /205461eb/);
  for (const pathname of chats) {
    const [before, after] = chatRecord.htmlSha256![pathname].split(' → ');
    assert.equal(before, after, pathname);
  }
  const added = [
    '/ru/blog/reklama-stomatologii-i-kliniki-tashkent/', '/ru/blog/reklama-uchebnogo-tsentra-tashkent/', '/ru/vremena-angliyskogo-yazyka/',
    '/uz/blog/oquv-markazi-reklamasi/', '/uz/blog/stomatologiya-va-klinika-reklamasi/', '/uz/fizika-test/', '/uz/informatika-test/',
    '/uz/ingliz-tili-zamonlari/', '/uz/matematika-test/', '/uz/onlayn-testlar/', '/uz/past-simple/', '/uz/present-continuous/', '/uz/present-simple/',
  ];
  const home = current.pages.find((p) => p.pathname === '/')!;
  const homeBefore = previous.pages.find((p) => p.pathname === '/')!;
  const links = (p: typeof home) => p.contract.internalLinks as string[];
  assert.deepEqual(links(home).filter((l) => !links(homeBefore).includes(l)), added);
  assert.deepEqual(links(homeBefore).filter((l) => !links(home).includes(l)), []);
  for (const key of ['title', 'h1', 'description', 'canonical', 'robots', 'googlebot', 'hreflang']) {
    assert.deepEqual(home.contract[key], homeBefore.contract[key], `/: ${key}`);
  }
  // The labels as the shell prints them (from content/: H1 for pages, title for articles) are the whole text change.
  const doc = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as BlogArticle & Page;
  const pageFile = (url: string) => `content/pages/${url.split('/')[1]}/${url.split('/')[2]}.json`;
  const labels = added.map((url) => (url.includes('/blog/')
    ? doc(`content/blog/${url.split('/')[1]}/${url.split('/')[3]}.json`).title
    : doc(pageFile(url)).h1));
  let text = home.bodyText;
  for (const label of labels) {
    assert.equal(text.split(`${label} `).length, 2, label);
    text = text.replace(`${label} `, '');
  }
  assert.equal(text, homeBefore.bodyText);
  // Honest labels: no ChatGPT, official, model, exam-key or answer claim on the homepage entries.
  for (const label of labels) assert.doesNotMatch(label, /chatgpt|rasmiy|официальн|official|GPT-4|GPT-5|OpenAI|Google|DTM|javoblari|ответы/i, label);
  // Every new tool page is a chat tool page in the teacher role, none is protected, and the three tests carry the quiz.
  for (const url of added.filter((u) => !u.includes('/blog/'))) {
    const page = doc(pageFile(url));
    assert.equal(page.pageType, 'gpt-chat', url);
    assert.equal(page.chatRole, 'teacher', url);
    assert.ok(!(PROTECTED_PATHS as readonly string[]).includes(url), url);
    const quiz = url.endsWith('-test/');
    assert.equal((page.widgets || []).includes('practice-quiz'), quiz, url);
    assert.equal(Boolean(page.quizSet), quiz, url);
  }
  assert.notEqual(home.htmlSha256, homeBefore.htmlSha256);
  const invisible = current.invisibleToGate.map((c) => c.change).join('\n');
  assert.match(invisible, /seven protected articles are byte-identical/);
  assert.match(invisible, /llms\.txt/);
  assert.match(invisible, /sitemap lastmod of \//);
  assert.match(current.measurement, /28-day window/);
  assert.match(current.measurement, /C69, C75, C76/);
  assert.match(current.measurement, /A10/);
  for (const text of [...current.invisibleToGate.map((c) => c.change), ...current.reviewedChanges.map((c) => JSON.stringify(c))]) {
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
  }
});

test('the monetization revision changes no contract: the ten keep contract and body text, the chats and the homepage move by one script name each', () => {
  type Monetization = Revision & {
    reviewedChanges: Array<{ pathname: string; fields: string[] }>;
    invisibleToGate: Array<{ change: string; pages?: string[]; htmlSha256?: Record<string, string> }>;
    measurement: string;
    changedUnprotectedPages: Record<string, string[]>;
    pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string; htmlSha256: string }>;
  };
  const WAVE_B = 'docs/seo/evidence/2026-10-25-ai-tools-b/reviewed-protected-pages.json';
  const current = readRevision('docs/seo/evidence/2026-10-26-monetization/reviewed-protected-pages.json') as Monetization;
  const previous = readRevision(WAVE_B) as Monetization;
  assert.equal(current.previousRevision, WAVE_B);
  assert.deepEqual(current.reviewedChanges, []);
  // All ten keep contract and body text; the seven protected articles keep their HTML
  // byte for byte (chat snippet window from 24.10, download guide P-CTR ≈06–10.11).
  const chats = ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/'];
  for (const page of current.pages) {
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    assert.deepEqual(page.contract, before.contract, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
    if (![...chats, '/'].includes(page.pathname)) assert.equal(page.htmlSha256, before.htmlSha256, page.pathname);
  }
  // The chats move by the chat bundle's name, the homepage by the SPA entry's name;
  // each record carries the hashes before and after and names what it reviews.
  const moved = [
    { pages: chats, asset: /\/assets\/gpt-chat-[\w-]+\.js → \/assets\/gpt-chat-[\w-]+\.js/, commits: /c377b572.*40fbefbb.*fa309da1.*4d4c4e74/s },
    { pages: ['/'], asset: /\/assets\/index-[\w-]+\.js → \/assets\/index-[\w-]+\.js/, commits: /87eb2728.*40fbefbb/s },
  ];
  for (const { pages, asset, commits } of moved) {
    const record = current.invisibleToGate.find((c) => JSON.stringify(c.pages) === JSON.stringify(pages))!;
    assert.ok(record, JSON.stringify(pages));
    assert.match(record.change, asset);
    assert.match(record.change, commits);
    assert.match(record.change, /puts the old name back and requires the predecessor's htmlSha256/);
    assert.deepEqual(Object.keys(record.htmlSha256!), pages);
    for (const pathname of pages) {
      const [before, after] = record.htmlSha256![pathname].split(' → ');
      assert.equal(before, previous.pages.find((p) => p.pathname === pathname)!.htmlSha256, pathname);
      assert.equal(after, current.pages.find((p) => p.pathname === pathname)!.htmlSha256, pathname);
      assert.notEqual(before, after, pathname);
    }
  }
  assert.match(current.invisibleToGate.find((c) => /no homepage list entry/i.test(c.change))?.change ?? '', /publishes no page/);
  // The changed unprotected pages: none protected, each built and listed once.
  const changed = Object.values(current.changedUnprotectedPages).flat();
  assert.equal(changed.length, 54);
  assert.equal(new Set(changed).size, changed.length);
  for (const url of changed) {
    assert.match(url, /^\/(ru|uz)\/[a-z0-9-]+\/$/, url);
    assert.ok(!(PROTECTED_PATHS as readonly string[]).includes(url), url);
  }
  const invisible = current.invisibleToGate.map((c) => c.change).join('\n');
  assert.match(invisible, /seven protected articles are byte-identical/);
  assert.match(invisible, /index-B7Z1XlOc\.css/);
  assert.match(invisible, /sitemap lastmod of \/ moves/);
  assert.match(invisible, /llms\.txt, llms-full\.txt and robots\.txt are byte-identical/);
  assert.match(current.measurement, /28-day window/);
  assert.match(current.measurement, /No ranking or traffic guarantee/);
  // Honesty: the record claims no answer-free tutoring and no translation quality.
  for (const text of [invisible, current.measurement]) {
    assert.doesNotMatch(text, /готовых ответов|tayyor javob bermaydi|translation quality|sifatli tarjima/i);
  }
  for (const text of [...current.invisibleToGate.map((c) => c.change), current.measurement]) {
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
  }
});

test('the current revision documents every contract change against its predecessor, which stays untouched', () => {
  const current = readRevision(BASELINE);
  assert.ok(current.previousRevision && current.previousRevision !== BASELINE, 'a revision names its predecessor');
  // Line endings normalised, so a CRLF checkout of the same file passes.
  const raw = fs.readFileSync(path.join(REPO, current.previousRevision!), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(sha256(raw), current.previousRevisionSha256, 'an old revision was edited: write a new one instead');
  const previous = JSON.parse(raw) as Revision;
  assert.deepEqual(current.pages.map((p) => p.pathname), [...PROTECTED_PATHS]);
  for (const page of current.pages) {
    assert.equal(sha256(page.bodyText), page.contract.bodyTextSha256, `${page.pathname}: stored body text is not what was hashed`);
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    const changed = Object.keys(page.contract).filter((k) => JSON.stringify(page.contract[k]) !== JSON.stringify(before.contract[k])).sort();
    const documented = current.reviewedChanges.filter((c) => c.pathname === page.pathname).flatMap((c) => c.fields).sort();
    assert.deepEqual(changed, documented, `${page.pathname}: every changed field is reviewed, and only those`);
  }
});

test('the paid-chat revision (WP-12) changes body text only, and the text says what it should', () => {
  const current = readRevision(PAID_CHAT);
  const previous = readRevision(GSC_DRIVEN);
  assert.equal(current.previousRevision, GSC_DRIVEN);
  for (const page of current.pages) {
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    for (const key of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang', 'internalLinks']) {
      assert.deepEqual(page.contract[key], before.contract[key], `${page.pathname}: ${key} must not change in this revision`);
    }
    // Every footer names the e-mail; no page offers the owner's personal
    // Telegram, and the chat-entry block names the brand as the chat does.
    assert.match(page.bodyText, /ceo@gptbot\.uz/, page.pathname);
    assert.doesNotMatch(page.bodyText, /XGame|напишите нам в Telegram|Telegram’da bizga yozing|Qo‘ng‘iroq qilish yoki Telegram|Позвонить или Telegram|GPTBot AI ·/, page.pathname);
  }
  const body = (pathname: string) => current.pages.find((p) => p.pathname === pathname)!.bodyText;
  // True before and after the paid AI pack opens (plan map 03 §5).
  const uz = body('/uz/gpt-uzbek-tilida/');
  assert.match(uz, /Pullik AI paket ixtiyoriy: u mavjud bo‘lganda, shartlari chatning o‘zida ko‘rsatiladi\./);
  assert.match(uz, /serverimizga va xorijdagi AI-provayderlarga yuboriladi/);
  assert.match(uz, /Biznes bot narxlari/);
  assert.doesNotMatch(uz, /hali ishga tushirilmagan|Suhbat tarixi brauzeringizda|davom ettirish mumkin| Tariflar /);
  const ru = body('/ru/gpt-chat/');
  assert.match(ru, /Платный AI-пакет — по желанию: когда он доступен, его условия показаны в самом чате\./);
  assert.match(ru, /на наш сервер и зарубежным AI-провайдерам/);
  assert.doesNotMatch(ru, /ещё не запущен|История разговора остаётся|можно продолжить в Telegram/);
});

test('protected page sources keep the honest wording outside the HTML too: FAQ, Markdown twin and the login guide link', () => {
  const page = (rel: string) => JSON.parse(fs.readFileSync(path.join(REPO, 'content/pages', rel), 'utf8')) as Page;
  for (const chat of [page('uz/gpt-uzbek-tilida.json'), page('ru/gpt-chat.json')]) {
    const text = JSON.stringify(chat);
    assert.doesNotMatch(text, /hali ishga tushirilmagan|пока не запущен|ещё не запущен|tarixi brauzeringizda|остаётся в вашем браузере|Kutmaslik uchun|Чтобы не ждать/, chat.url);
    // Since the owner's order of 26.10.2026 the business contact line links the
    // studio Telegram (the owner's account) instead of the phone: only that
    // bare link, never a draft or a call.
    assert.deepEqual(text.match(/https:\/\/t\.me\/XGame_changerx[^"]*/g), ['https://t.me/XGame_changerx'], chat.url);
    assert.doesNotMatch(text, /tel:|505870720/, chat.url);
  }
  // The guide that promises the official site links it (roadmap v2 №18).
  const guide = JSON.parse(fs.readFileSync(path.join(REPO, 'content/blog/uz/chatgptga-qanday-kirish-mumkin.json'), 'utf8')) as BlogArticle;
  const official = guide.body.flatMap((b) => b.links || []).filter((l) => l.target === 'https://chatgpt.com/');
  assert.deepEqual(official.map((l) => l.anchor), ['chatgpt.com']);
});

const UZBEK_LOGIN = 'docs/seo/evidence/2026-10-03-uzbek-login/reviewed-protected-pages.json';
const R_S1 = 'docs/seo/evidence/2026-10-12-r-s1/reviewed-protected-pages.json';

test('the R-S1 revision: honest snippets and H1s on both chats and the login guide, the download guide untouched', () => {
  const current = readRevision(R_S1);
  const previous = readRevision(UZBEK_LOGIN);
  assert.equal(current.previousRevision, UZBEK_LOGIN);
  const page = (pathname: string) => current.pages.find((p) => p.pathname === pathname)!;
  const before = (pathname: string) => previous.pages.find((p) => p.pathname === pathname)!;
  // The download guide's P-CTR window is open: not one field of it changes.
  const download = '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/';
  assert.deepEqual(page(download).contract, before(download).contract);
  assert.ok(!current.reviewedChanges.some((c) => c.pathname === download));
  // The strings of roadmap 2.2, exactly.
  const uz = page('/uz/gpt-uzbek-tilida/');
  const ru = page('/ru/gpt-chat/');
  const login = page('/uz/blog/chatgptga-qanday-kirish-mumkin/');
  assert.deepEqual(uz.contract.title, ['ChatGPT uzbekcha muqobili: AI chat, bepul kirish']);
  assert.deepEqual(uz.contract.h1, ['O‘zbek tilida AI chat — ChatGPT’ga bepul muqobil']);
  assert.deepEqual(ru.contract.title, ['Аналог ChatGPT онлайн бесплатно — без регистрации']);
  assert.deepEqual(ru.contract.h1, ['ИИ-чат онлайн — бесплатный аналог ChatGPT']);
  assert.deepEqual(login.contract.title, ['ChatGPT kirish (login): chatgpt.com, 3 qadam (2026)']);
  assert.deepEqual(login.contract.h1, ['ChatGPT kirish va ochish: chatgpt.com, ro‘yxatdan o‘tish va xatolar']);
  // GPTBot.uz is never the official ChatGPT: the chats' snippets name it an
  // alternative, and no changed title or H1 says «rasmiy» or «официальный».
  for (const p of [uz, ru, login]) {
    for (const s of [...(p.contract.title as string[]), ...(p.contract.h1 as string[]), ...(p.contract.description as string[])]) {
      assert.doesNotMatch(s, /rasmiy|официальн|official|GPT-4|GPT-5/i, `${p.pathname}: ${s}`);
    }
  }
  assert.match((uz.contract.description as string[])[0], /mustaqil servis, OpenAI emas/);
  assert.match((ru.contract.description as string[])[0], /независимый сервис, не OpenAI и не ChatGPT/);
  // The published free limits, and none of the lines R-S1 replaces.
  assert.match(uz.bodyText, /kuniga 15 tagacha, soatiga 5 tagacha/);
  assert.match(ru.bodyText, /до 15 сообщений в день и до 5 в час/);
  assert.doesNotMatch(uz.bodyText, /ChatGPT o‘zbek tilida online|raqam yozmaymiz|biznesingizga ulash|ChatGPT узбекча/);
  assert.doesNotMatch(ru.bodyText, /Chat GPT онлайн в Узбекистане|Конкретных чисел/);
  assert.doesNotMatch(page('/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/').bodyText, /biznesingizga ulash|15 daqiqada/);
  // Review of 2026-10-05: the chat's language claim is hedged (decision Ф-5),
  // and the VPN article no longer stacks «yo‘riqnomasi qo‘llanmasini».
  assert.match(uz.bodyText, /mustaqil xizmati: odatda o‘zbek tilida javob beradi/);
  assert.doesNotMatch(page('/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/').bodyText, /yo‘riqnomasi qo‘llanmasini|Batafsi /);
  // The homepage shell links both chats in one line, without the word ChatGPT.
  assert.match(page('/').bodyText, /Чат для себя, а не для бизнеса, — бесплатно и без регистрации: O‘zbekcha bepul AI chat · ИИ-чат онлайн/);
});

const SCHOOL = 'docs/seo/evidence/2026-10-05-school/reviewed-protected-pages.json';

test('the school-pages revision changes only the homepage list: two new guides, nothing else on the ten', () => {
  const current = readRevision(SCHOOL);
  const previous = readRevision(R_S1);
  assert.equal(current.previousRevision, R_S1);
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [['/', ['bodyTextSha256', 'internalLinks']]]);
  for (const page of current.pages) {
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    if (page.pathname === '/') continue;
    assert.deepEqual(page.contract, before.contract, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
  }
  const home = current.pages.find((p) => p.pathname === '/')!;
  const homeBefore = previous.pages.find((p) => p.pathname === '/')!;
  const links = (p: typeof home) => p.contract.internalLinks as string[];
  assert.deepEqual(links(home).filter((l) => !links(homeBefore).includes(l)), ['/uz/blog/referat-va-mustaqil-ish/', '/uz/blog/rezyume-tayyorlash/']);
  assert.deepEqual(links(homeBefore).filter((l) => !links(home).includes(l)), []);
  // The two article titles are the whole text change, right before the slide guide.
  const added = 'Referat namunasi va mustaqil ish: reja tuzish tartibi Rezyume tayyorlash: namuna, tuzilma va maslahatlar ';
  assert.ok(home.bodyText.includes(`${added}Slayd tayyorlash`));
  assert.equal(home.bodyText.replace(added, ''), homeBefore.bodyText);
});

const CHAT_DESIGN = 'docs/seo/evidence/2026-10-06-chat-design/reviewed-protected-pages.json';

test('the chat design revision changes one field, the UZ chat title; no text on the ten; it records every HTML it changes', () => {
  const current = readRevision(CHAT_DESIGN) as Revision & { invisibleToGate: Array<{ change: string; pages?: string[]; htmlSha256?: Record<string, string> }> };
  const previous = readRevision(SCHOOL);
  assert.equal(current.previousRevision, SCHOOL);
  // The one reviewed change: the UZ chat's title, strategy 2026-10-06 variant B (T-B), with og:title and twitter:title.
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [['/uz/gpt-uzbek-tilida/', ['title']]]);
  for (const page of current.pages) {
    const before = previous.pages.find((p) => p.pathname === page.pathname)!;
    const { title, ...rest } = page.contract;
    const { title: titleBefore, ...restBefore } = before.contract;
    assert.deepEqual(rest, restBefore, page.pathname);
    if (page.pathname !== '/uz/gpt-uzbek-tilida/') assert.deepEqual(title, titleBefore, page.pathname);
    assert.equal(page.bodyText, before.bodyText, page.pathname);
  }
  const uz = current.pages.find((p) => p.pathname === '/uz/gpt-uzbek-tilida/')!;
  assert.deepEqual(uz.contract.title, ['ChatGPT o‘zbek tilida? Muqobil AI chat, bepul kirish']);
  assert.deepEqual(uz.contract.h1, ['O‘zbek tilida AI chat — ChatGPT’ga bepul muqobil'], 'the H1 is an honesty element and stays');
  assert.doesNotMatch((uz.contract.title as string[])[0], /rasmiy|official|GPT-4|GPT-5/i);
  assert.match((uz.contract.title as string[])[0], /Muqobil/);
  // The content file has moved on (2026-10-24-chat-snippets); this revision's
  // title is pinned by its own contract above, and og:title still follows it.
  const page = JSON.parse(fs.readFileSync(path.join(REPO, 'content/pages/uz/gpt-uzbek-tilida.json'), 'utf8')) as Page;
  assert.equal(page.ogTitle, page.title);
  // The RU chat keeps its R-S1 title.
  assert.deepEqual(current.pages.find((p) => p.pathname === '/ru/gpt-chat/')!.contract.title, ['Аналог ChatGPT онлайн бесплатно — без регистрации']);
  // Every protected page's HTML changes (the stylesheet's name), each with its hashes before and after.
  const hashes = current.invisibleToGate.find((c) => c.htmlSha256)!.htmlSha256!;
  assert.deepEqual(Object.keys(hashes), [...PROTECTED_PATHS]);
  for (const value of Object.values(hashes)) assert.match(value, /^[0-9a-f]{64} → [0-9a-f]{64}$/);
  const chats = current.invisibleToGate.filter((c) => JSON.stringify(c.pages) === JSON.stringify(['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/']));
  assert.ok(chats.some((c) => /frame adds no text/.test(c.change)), 'the prerendered frame is reviewed');
  assert.ok(chats.some((c) => /interactive-widget=resizes-content/.test(c.change) && /modulepreload/.test(c.change)), 'the <head> tags are reviewed');
  // P-CTR: a second UZ-chat release in the R-S1 window leaves its «chatgpt kirish» reading without a verdict.
  assert.match((current as unknown as { measurement: string }).measurement, /no verdict/);
  // A generator that failed to read a value writes «undefined»: the record names what it reviews.
  const texts = [...current.invisibleToGate.map((c) => c.change), ...current.reviewedChanges.map((c) => JSON.stringify(c))];
  for (const text of texts) assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
  assert.match(current.invisibleToGate.find((c) => c.htmlSha256)!.change, /\/assets\/index-[\w-]+\.css → \/assets\/index-[\w-]+\.css/);
});

// School guides declare their own audience and a short breadcrumb (R-S1
// review, 2026-10-05); every article without the optional fields keeps the
// template's defaults, so the protected download guide does not change.
test('school guides name a student audience; articles without the field keep the default', { skip: !fs.existsSync(path.join(process.cwd(), 'dist', 'uz', 'blog', 'slayd-tayyorlash', 'index.html')) && 'no dist/ build present' }, () => {
  const html = (slug: string) => fs.readFileSync(path.join(process.cwd(), 'dist', 'uz', 'blog', slug, 'index.html'), 'utf8');
  for (const slug of ['slayd-tayyorlash', 'insho-yozish-suniy-intellekt-bilan', 'chatgpt-talabalar-uchun', 'referat-va-mustaqil-ish']) {
    assert.match(html(slug), /"audience":\{"@type":"EducationalAudience","educationalRole":"student"\}/, slug);
  }
  // The résumé guide speaks to job seekers, students among them (school-pages
  // release, 2026-10-05); never the studio's business audience.
  assert.match(html('rezyume-tayyorlash'), /"audience":\{"@type":"Audience","audienceType":"Job seekers in Uzbekistan, including students and graduates"\}/);
  assert.match(html('referat-va-mustaqil-ish'), /<span class="text-white\/70">Referat va mustaqil ish<\/span>/);
  assert.match(html('rezyume-tayyorlash'), /<span class="text-white\/70">Rezyume tayyorlash<\/span>/);
  const download = html('chatgpt-telefon-va-kompyuterga-yuklab-olish');
  assert.match(download, /"audience":\{"@type":"BusinessAudience","audienceType":"Small and medium business in Uzbekistan"\}/);
  assert.match(html('slayd-tayyorlash'), /<span class="text-white\/70">Slayd tayyorlash<\/span>/);
  assert.match(html('slayd-tayyorlash'), /"name":"Slayd tayyorlash sun’iy intellekt bilan: rejadan tayyor matngacha"/);
  assert.match(html('slayd-tayyorlash'), /<img src="\/assets\/blog\/slayd-tayyorlash-reja-gptbot-1200\.webp"[^>]*alt="GPTBot\.uz AI chatida slayd rejasi uchun tayyor so‘rov"/);
});
