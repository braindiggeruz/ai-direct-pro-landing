// The RU↔UZ translator pages: /ru/russko-uzbekskiy-perevodchik/ and
// /uz/rus-ozbek-tarjimon/. pageType gpt-chat with chatRole 'translator': the
// same chat and the same 3 lifetime trial replies, opened in the translator
// role, plus the Uzbek Cyrillic ↔ Latin converter. The two main chat pages
// (protected) must not change: no role, no converter, no script.
//
// Drafted 2026-10-24 behind a native-speaker blind check (≥ 4/5,
// docs/seo/research/2026-10-24-translator-blind-check/); published the same
// day by the owner's order, which overrides that gate. The blind check has not
// been done, so each page says on the page that AI translation is a beta
// (intent manifest A8 publicationNote, pairs C47 and C48).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { chatRolePreset, type BlogArticle, type Page } from '../src/shared/types';
import { gptChatNavLinks } from '../scripts/gpt-chat-nav';
import { chatRoleAttributes, pairedPath, renderUzTranslitBlock, UZ_TRANSLIT_ANCHOR } from '../scripts/translator-page';
import { asPreviewPage, previewDraftUrls } from '../scripts/preview-drafts';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { publishedStudioUrls } from '../apps/studio/shared/published-urls';

const ROOT = process.cwd();
const RU_URL = '/ru/russko-uzbekskiy-perevodchik/';
const UZ_URL = '/uz/rus-ozbek-tarjimon/';
const RU_FILE = 'content/pages/ru/russko-uzbekskiy-perevodchik.json';
const UZ_FILE = 'content/pages/uz/rus-ozbek-tarjimon.json';
const CHATS = ['content/pages/ru/gpt-chat.json', 'content/pages/uz/gpt-uzbek-tilida.json'];

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = <T>(file: string) => JSON.parse(read(file)) as T;
const ru = json<Page>(RU_FILE);
const uz = json<Page>(UZ_FILE);

function readAll<T>(dir: string): T[] {
  const out: T[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(JSON.parse(fs.readFileSync(full, 'utf8')) as T);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}
const pages = readAll<Page>('content/pages');
const docs: Array<Page | BlogArticle> = [...pages, ...readAll<BlogArticle>('content/blog')];

const declared = (doc: Page | BlogArticle) => [
  (doc as Page).primaryKeyword,
  ...((doc as Page).secondaryKeywords || []),
  ...((doc as BlogArticle).keywords || []),
].filter((k): k is string => typeof k === 'string').map((k) => k.toLowerCase());

const linkTargets = (page: Page) => [
  ...(page.internalLinks || []).map((l) => l.target),
  ...(page.bodyBlocks || []).flatMap((b) => [b.href, ...(b.links || []).map((l) => l.target)]),
].filter((t): t is string => typeof t === 'string');

test('the pair: published, gpt-chat with the translator role, reciprocal hreflang, x-default Uzbek', () => {
  for (const [page, url] of [[ru, RU_URL], [uz, UZ_URL]] as const) {
    assert.equal(page.url, url);
    assert.equal(page.status, 'published', `${url} is published (owner's order of 2026-10-24)`);
    assert.equal(page.pageType, 'gpt-chat');
    assert.equal(page.chatRole, 'translator');
    assert.equal(page.canonical, `https://gptbot.uz${url}`);
    assert.equal(page.hreflangRu, RU_URL);
    assert.equal(page.hreflangUz, UZ_URL);
    assert.equal((page as Page & { hreflangXDefault?: string }).hreflangXDefault, UZ_URL);
    assert.equal(page.robotsIndex, true);
    assert.equal(page.robotsFollow, true);
    assert.deepEqual(page.schemaTypes, ['Organization', 'WebSite', 'BreadcrumbList']);
    assert.ok(page.faq.length >= 4);
  }
  assert.equal(ru.locale, 'ru');
  assert.equal(uz.locale, 'uz');
});

test('titles and descriptions: title ≤ 60, description 120–158, og copies, the trial and the independence clause', () => {
  for (const page of [ru, uz]) {
    assert.ok(page.title.length >= 45 && page.title.length <= 60, `${page.url} title ${page.title.length}`);
    assert.ok(page.description.length >= 120 && page.description.length <= 158, `${page.url} description ${page.description.length}`);
    assert.equal(page.ogTitle, page.title);
    assert.equal(page.ogDescription, page.description);
    assert.match(page.description, /\b3\b/);
    assert.match(page.description, /AI-пакет|AI paket/);
    assert.match(page.description, /Не OpenAI|OpenAI emas/);
  }
  assert.match(ru.title, /переводчик с русского на узбекский/i, 'the RU title carries its primary keyword');
  assert.match(uz.title.toLowerCase(), /rus-o‘zbek tarjimon/);
  for (const title of docs.filter((d) => d.url !== RU_URL && d.url !== UZ_URL).map((d) => d.title)) {
    assert.ok(title !== ru.title && title !== uz.title, `duplicate title ${title}`);
  }
});

test('the copy makes no claim the product cannot back', () => {
  for (const page of [ru, uz]) {
    const text = JSON.stringify(page);
    // No model names or versions, no quality superlatives, no guarantees.
    assert.doesNotMatch(text, /GPT-?4|GPT-?5|glm|точн(?:ый|ая|ое|ые|ого)\s+перев|лучш|самый|гарант|eng yaxshi|eng zo‘r|aniq tarjima|kafolat|100\s?%/i, page.url);
    // Photo, voice and offline translation are named only as what the chat does not do.
    assert.doesNotMatch(text, /(?:переводит|переводим|переводите)\s+(?:с|по)\s+фото/i, page.url);
    assert.doesNotMatch(text, /rasmdan tarjima|ovozli tarjima qiladi/i, page.url);
  }
  assert.match(JSON.stringify(ru), /Перевод по фото, голосовой и офлайн-перевод этот чат не делает/);
  assert.match(JSON.stringify(uz), /Bu chat rasm va ovozni tarjima qilmaydi, oflayn ham ishlamaydi/);
  // The trial is the chat's: shared site-wide, then the AI pack.
  assert.match(JSON.stringify(ru), /3 бесплатных пробных ответа на весь сайт/);
  assert.match(JSON.stringify(uz), /butun sayt bo‘yicha jami 3 ta bepul sinov javobi/);
  // Independence, in the body as well as the description.
  assert.match(JSON.stringify(ru.bodyBlocks), /независимый сервис: не OpenAI, не ChatGPT и не Google Переводчик/);
  assert.match(JSON.stringify(uz.bodyBlocks), /mustaqil servis: OpenAI ham, ChatGPT ham, Google Tarjimon ham emas/);
  // Published without the blind check: a visible beta note near the top of the
  // text (before the terms paragraph), sending important and official texts to a person.
  const beta = (page: Page, word: RegExp, person: RegExp) => {
    const index = page.bodyBlocks.findIndex((b) => b.type === 'p' && word.test(b.text || ''));
    assert.ok(index >= 0 && index <= 1, `${page.url}: the beta note is one of the first two blocks`);
    assert.match(page.bodyBlocks[index].text || '', person, `${page.url}: the beta note says who checks important texts`);
  };
  beta(ru, /(?<![а-яё])бета(?![а-яё])/, /Важные и официальные тексты/);
  beta(uz, /\bbeta\b/, /Muhim va rasmiy matnlarni/);
});

test('the Uzbek page writes o‘ g‘ with U+2018 and the tutuq with U+2019 only', () => {
  const text = JSON.stringify(uz);
  assert.doesNotMatch(text, /[A-Za-z]'[A-Za-z]/, 'no ASCII apostrophe between letters');
  assert.doesNotMatch(text, /[ʻʼ`]/, 'no modifier letters or backticks');
  assert.doesNotMatch(text, /[OoGg]’[a-z]/, 'o’ / g’ with the tutuq is a wrong letter');
  assert.match(text, /o‘zbek/);
  const cyrillic = uz.bodyBlocks.find((b) => b.lang === 'uz-Cyrl');
  assert.ok(cyrillic, 'one Uzbek Cyrillic line, marked as such');
  assert.match(cyrillic.text || '', /^Русча-ўзбекча таржимон:/);
});

test('contacts and links: Telegram and e-mail in the body, every target reachable, nothing broken once both publish', () => {
  // The studio's published pages (content/studio/pages) are served too: the
  // UZ page links the UZ tariff hub /uz/tariflar/ (monetization stage B).
  const served = new Set([...pages.filter((p) => p.status === 'published').map((p) => p.url), ...publishedStudioUrls(ROOT)]);
  for (const page of [ru, uz]) {
    const targets = linkTargets(page);
    assert.ok(targets.includes('https://t.me/XGame_changerx'), `${page.url}: the studio Telegram (owner order of 26.10.2026)`);
    assert.ok(!targets.some((t) => t.startsWith('tel:')), `${page.url}: no phone`);
    assert.ok(targets.includes('mailto:ceo@gptbot.uz'), `${page.url}: e-mail`);
    assert.ok(targets.includes(`#${UZ_TRANSLIT_ANCHOR}`), `${page.url}: the text points at the converter`);
    for (const target of targets.filter((t) => t.startsWith('/'))) {
      // A section of a page (the hub's #ai-paket) is reachable when its page is.
      const url = target.split('#')[0];
      assert.ok(served.has(url) || url === RU_URL || url === UZ_URL, `${page.url} links ${target}, which is not a published page`);
    }
    const nav = new Set(gptChatNavLinks(page).map((l) => l.href));
    const body = new Set((page.bodyBlocks || []).flatMap((b) => (b.links || []).map((l) => l.target)));
    for (const link of page.internalLinks) assert.ok(nav.has(link.target) || body.has(link.target), `${page.url}: ${link.target} would be dropped`);
  }
  assert.ok(linkTargets(ru).includes(UZ_URL) && linkTargets(uz).includes(RU_URL), 'the pair links each other');
});

// Inbound: at least two contextual links per language from published,
// unprotected pages of that language (a link from a protected page would change
// its reviewed contract), with anchors that are never the chatgpt tarjima family.
const PROTECTED = new Set<string>(PROTECTED_PATHS);
const inbound = (url: string) => docs.flatMap((doc) => {
  if (doc.status !== 'published' || doc.url === RU_URL || doc.url === UZ_URL) return [];
  const blocks = ((doc as Page).bodyBlocks || (doc as BlogArticle).body || []) as Page['bodyBlocks'];
  return [
    ...((doc as Page).internalLinks || []).map((l) => ({ doc, anchor: l.anchor, body: false, target: l.target })),
    ...blocks.flatMap((b) => (b.links || []).map((l) => ({ doc, anchor: l.anchor, body: true, target: l.target }))),
  ].filter((l) => l.target === url);
});

test('published: linked in body text from ≥ 2 unprotected pages per language, never from a protected page', () => {
  for (const [url, locale] of [[RU_URL, 'ru'], [UZ_URL, 'uz']] as const) {
    const links = inbound(url);
    for (const link of links) assert.ok(!PROTECTED.has(link.doc.url), `${link.doc.url} is protected and must not link ${url} outside a reviewed revision`);
    const sources = new Set(links.filter((l) => l.body && l.doc.locale === locale).map((l) => l.doc.url));
    assert.ok(sources.size >= 2, `${url}: contextual links from ${[...sources].join(', ') || 'no page'}`);
    for (const link of links) {
      const anchor = (link.anchor || '').toLowerCase();
      assert.doesNotMatch(anchor, /chatgpt|chat gpt|чат ?гпт|чат джипити/, `${link.doc.url} → ${url}: «${link.anchor}»`);
      assert.ok(!['tarjimon', 'tarjima', 'переводчик', 'таржимон'].includes(anchor.trim()), `${link.doc.url} → ${url}: a bare head term as anchor`);
    }
  }
});

test('a build after publication lists both pages in the sitemap with their hreflang pair', () => {
  const sitemap = path.join(ROOT, 'dist', 'sitemap.xml');
  // dist/ may still hold the build from before the publication; check only a build that prerendered the pages.
  if (!fs.existsSync(sitemap) || !fs.existsSync(path.join(ROOT, 'dist', 'ru', 'russko-uzbekskiy-perevodchik', 'index.html'))) return;
  const xml = fs.readFileSync(sitemap, 'utf8');
  for (const url of [RU_URL, UZ_URL]) assert.ok(xml.includes(`<loc>https://gptbot.uz${url}</loc>`), `the sitemap does not list ${url}`);
  assert.ok(xml.includes(`hreflang="x-default" href="https://gptbot.uz${UZ_URL}"`), 'x-default is the Uzbek member');
});

test('intent manifest: A8 published and still fencing both URLs, pairs C47 and C48 with the chats, one owner per key', () => {
  type Side = { url: string; mustNotTarget: string[] };
  const manifest = json<{
    pairs: Array<{ id: string; commercial: Side; informational: Side }>;
    architectureDecisions: Array<{ id: string; url?: string; counterpart?: string; status?: string; pairs?: string[]; mustNotTarget?: string[] }>;
  }>('content/seo/intent-manifest.json');
  const a8 = manifest.architectureDecisions.find((d) => d.id === 'A8-ru-uz-translator-pages-2026-10-24');
  assert.ok(a8);
  assert.equal(a8.url, RU_URL);
  assert.equal(a8.counterpart, UZ_URL);
  assert.equal(a8.status, 'published');
  for (const key of ['chatgpt tarjima', 'chatgpt tarjimon', 'chatgpt o‘zbekcha tarjima', 'tarjimon', 'таржимон', 'переводчик']) {
    assert.ok(a8.mustNotTarget?.includes(key), key);
  }
  for (const page of [ru, uz]) {
    for (const key of a8.mustNotTarget || []) assert.ok(!declared(page).includes(key.toLowerCase()), `${page.url} declares «${key}»`);
    assert.ok(!declared(page).some((k) => k.includes('chatgpt')), `${page.url} declares a chatgpt keyword`);
  }
  const pair = (id: string) => manifest.pairs.find((p) => p.id === id);
  const c47 = pair('C47-uz-chat-vs-rus-ozbek-tarjimon');
  const c48 = pair('C48-ru-chat-vs-russko-uzbekskiy-perevodchik');
  assert.ok(c47 && c48);
  assert.deepEqual(a8.pairs, [c47.id, c48.id]);
  assert.equal(c47.commercial.url, '/uz/gpt-uzbek-tilida/');
  assert.equal(c47.informational.url, UZ_URL);
  assert.equal(c48.commercial.url, '/ru/gpt-chat/');
  assert.equal(c48.informational.url, RU_URL);
  // The translator stays fenced from the chatgpt tarjima family; the chats stay fenced from the translator's heads.
  for (const key of ['chatgpt tarjima', 'chatgpt tarjimon', 'chatgpt o‘zbekcha tarjima']) assert.ok(c47.informational.mustNotTarget.includes(key), key);
  assert.ok(c47.commercial.mustNotTarget.includes(uz.primaryKeyword.toLowerCase()));
  assert.ok(c48.commercial.mustNotTarget.includes(ru.primaryKeyword.toLowerCase()));
  const mine = new Set([...declared(ru), ...declared(uz)]);
  for (const doc of docs) {
    if (doc.url === RU_URL || doc.url === UZ_URL) continue;
    const shared = declared(doc).filter((k) => mine.has(k));
    assert.deepEqual(shared, [], `${doc.url} also declares ${shared.join(', ')}`);
  }
  // The Uzbek chat keeps the family (pair C6).
  assert.ok(declared(json<Page>(CHATS[1])).includes('chatgpt tarjima'));
});

test('the translator role is a preset; a value outside the presets is ignored', () => {
  assert.equal(chatRolePreset('translator'), 'translator');
  for (const value of ['general', 'Translator', 'translator ', '<script>', '', undefined, null, 1]) assert.equal(chatRolePreset(value), undefined, String(value));
  const main = read('src/gpt-chat/main.tsx');
  assert.match(main, /const role = chatRolePreset\(el\.dataset\.chatRole\);/);
  assert.match(main, /role && ALT_HREF\.test\(el\.dataset\.altHref \|\| ''\)/);
  assert.match(main, /const ALT_HREF = \/\^\\\/\(\?:ru\|uz\)\\\/\[a-z0-9-\]\+\\\/\$\/;/);
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(chat, /useState<RoleId>\(config\.role \?\? "general"\)/);
  // Three language links take the pair's href, after the main chats' default.
  assert.equal((chat.match(/\{\.\.\.altLink\}/g) || []).length, 3);
});

test('the template adds the role, the pair and the converter only to a page with a role and the widget', () => {
  const chatRu = json<Page>(CHATS[0]);
  const chatUz = json<Page>(CHATS[1]);
  for (const chat of [chatRu, chatUz]) {
    assert.equal(chat.chatRole, undefined, `${chat.url} must not get a role: its HTML is protected`);
    assert.equal(chatRoleAttributes(chat), '');
    assert.equal(renderUzTranslitBlock(chat), '');
  }
  assert.equal(chatRoleAttributes({ ...chatRu, pageType: 'money', chatRole: 'translator' }), '', 'gpt-chat pages only');
  assert.equal(chatRoleAttributes({ ...chatRu, chatRole: 'general' as never }), '', 'closed list');
  // Role, pair, then the page's own chips (2026-10-26).
  assert.match(chatRoleAttributes(ru), new RegExp(`^ data-chat-role="translator" data-alt-href="${UZ_URL}" data-chat-starters="`));
  assert.match(chatRoleAttributes(uz), new RegExp(`^ data-chat-role="translator" data-alt-href="${RU_URL}" data-chat-starters="`));
  assert.equal(pairedPath({ ...ru, hreflangUz: 'https://evil.test/' }), undefined);
  assert.equal(pairedPath({ ...ru, hreflangUz: '/uz/"><script>/' }), undefined);

  for (const page of [ru, uz]) {
    const block = renderUzTranslitBlock(page);
    assert.match(block, new RegExp(`^<section id="${UZ_TRANSLIT_ANCHOR}" data-uz-translit`));
    assert.doesNotMatch(block, /<h1|<nav|<main|<script/, 'the chat page keeps one H1, one nav, one main');
    for (const action of ['latin', 'cyrillic', 'normalize', 'copy']) assert.match(block, new RegExp(`data-uzt="${action}"`));
  }
  assert.match(renderUzTranslitBlock(uz), /Lotin ↔ kirill/);
  assert.doesNotMatch(renderUzTranslitBlock(uz).replace(/<style>[\s\S]*?<\/style>/, ''), /[A-Za-z]'[A-Za-z]|&#39;/);

  const prerender = read('scripts/prerender.ts');
  assert.match(prerender, /data-h1="\$\{firstTool \? '' : escapeHtml\(page\.h1\)\}"\$\{chatRoleAttributes\(page\)\} class="h-full ym-hide-content"/);
  // The converter is the translator pages' widget (Page.widgets ['uz-translit'], scripts/tool-widgets.ts).
  assert.match(prerender, /\$\{isConverterFirstPage\(page\) \? '' : renderToolWidgets\(page\)\}\$\{updatedIso \?/);
  assert.match(prerender, /const widgetScripts = widgetScriptsFrom\(manifest\);/);
  assert.match(read('scripts/tool-widgets.ts'), /'uz-translit': 'translit'/);
  assert.match(prerender, /\$\{toolWidgetScripts\(page, widgetScripts\)\}/);
  assert.match(read('vite.config.ts'), /'uz-translit': here\('\.\/src\/uz-translit\/main\.ts'\)/);
});

test('a local preview renders only named drafts, noindex and nofollow', () => {
  const list = [{ url: RU_URL, status: 'draft' as const }, { url: UZ_URL, status: 'draft' as const }, { url: '/ru/gpt-chat/', status: 'published' as const }];
  assert.deepEqual([...previewDraftUrls(undefined, list)], []);
  assert.deepEqual([...previewDraftUrls('', list)], []);
  assert.deepEqual([...previewDraftUrls(` ${RU_URL} , ${UZ_URL}`, list)], [RU_URL, UZ_URL]);
  assert.throws(() => previewDraftUrls('/ru/gpt-chat/', list), /names no draft page: \/ru\/gpt-chat\//);
  assert.throws(() => previewDraftUrls('/ru/typo/', list), /names no draft page/);
  const preview = asPreviewPage(ru);
  assert.equal(preview.robotsIndex, false);
  assert.equal(preview.robotsFollow, false);
  assert.equal(ru.robotsIndex, true, 'the content object is not changed');
});

test('the blind-check kit: 20 sources per direction, mixed types and scripts, one sheet row each', () => {
  const dir = 'docs/seo/research/2026-10-24-translator-blind-check';
  const { items } = json<{ items: Array<{ id: string; direction: string; type: string; inputScript: string; requestedOutput: string; prompt: string }> }>(`${dir}/sources.json`);
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const [direction, prefix] of [['ru-uz', 'RU'], ['uz-ru', 'UZ']] as const) {
    const side = items.filter((item) => item.direction === direction);
    assert.equal(side.length, 20, direction);
    assert.ok(side.every((item) => item.id.startsWith(`${prefix}-`) && item.prompt.trim().length > 10), direction);
    assert.ok(new Set(side.map((item) => item.type)).size >= 6, `${direction}: mixed text types`);
  }
  const uzSources = items.filter((item) => item.direction === 'uz-ru');
  assert.ok(uzSources.some((item) => item.inputScript === 'cyrillic') && uzSources.some((item) => item.inputScript === 'latin'), 'Uzbek sources in both scripts');
  assert.ok(items.some((item) => item.requestedOutput === 'uz-cyrillic'), 'one item asks for Cyrillic output');
  // A CRLF checkout (core.autocrlf=true) must not fail the header.
  const sheet = read(`${dir}/scoring-sheet.csv`).split(/\r?\n/)[0];
  assert.equal(sheet, 'item_id,direction,type,requested_output,source_text,candidate_code,candidate_text,rater_id,adequacy,fluency,terminology,names_numbers_changed,critical_error,comment');
  for (const id of ids) assert.match(read(`${dir}/scoring-sheet.csv`), new RegExp(`^${id},`, 'm'), id);
});

// After a build (npm run build:fast): the two protected chats carry no trace
// of the role; the translator pages are indexable, canonical to themselves,
// carry the role, the converter, its script and the hreflang pair. dist/ may
// still hold a build from before the publication, without the two pages.
const DIST = path.join(ROOT, 'dist');
const built = (url: string) => path.join(DIST, url.replace(/^\/|\/$/g, ''), 'index.html');
test('built HTML: the main chats have no role, converter or converter script', { skip: !fs.existsSync(built('/ru/gpt-chat/')) && 'no dist/ build present' }, () => {
  for (const url of ['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/']) {
    const html = fs.readFileSync(built(url), 'utf8');
    assert.doesNotMatch(html, /data-chat-role|data-alt-href|data-uz-translit|uz-translit-/, url);
  }
  for (const url of [RU_URL, UZ_URL]) {
    if (!fs.existsSync(built(url))) continue; // a build from before the publication
    const html = fs.readFileSync(built(url), 'utf8');
    assert.match(html, /<meta name="robots" content="index, follow/, `${url}: published, indexable`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://gptbot\\.uz${url}"`));
    assert.match(html, new RegExp(`hreflang="x-default" href="https://gptbot\\.uz${UZ_URL}"`));
    assert.match(html, /data-chat-role="translator"/);
    assert.match(html, /data-uz-translit/);
    assert.match(html, /<script type="module" src="\/assets\/uz-translit-[\w-]+\.js"><\/script>/);
  }
});
