// The RU↔UZ translator pages (drafts, 2026-10-24): /ru/russko-uzbekskiy-perevodchik/
// and /uz/rus-ozbek-tarjimon/. pageType gpt-chat with chatRole 'translator':
// the same chat and the same 3 lifetime trial replies, opened in the
// translator role, plus the Uzbek Cyrillic ↔ Latin converter. The two main
// chat pages (protected) must not change: no role, no converter, no script.
//
// Until the owner's publication gate (native-speaker blind check ≥ 4/5,
// docs/seo/research/2026-10-24-translator-blind-check/) the pages stay drafts:
// not prerendered, not in the sitemap and linked from no published page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { chatRolePreset, type BlogArticle, type Page } from '../src/shared/types';
import { gptChatNavLinks } from '../scripts/gpt-chat-nav';
import { chatRoleAttributes, pairedPath, renderUzTranslitBlock, UZ_TRANSLIT_ANCHOR } from '../scripts/translator-page';
import { asPreviewPage, previewDraftUrls } from '../scripts/preview-drafts';

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

test('the pair: drafts, gpt-chat with the translator role, reciprocal hreflang, x-default Uzbek', () => {
  for (const [page, url] of [[ru, RU_URL], [uz, UZ_URL]] as const) {
    assert.equal(page.url, url);
    assert.equal(page.status, 'draft', `${url} stays a draft until the blind check passes`);
    assert.equal(page.pageType, 'gpt-chat');
    assert.equal(page.chatRole, 'translator');
    assert.equal(page.canonical, `https://gptbot.uz${url}`);
    assert.equal(page.hreflangRu, RU_URL);
    assert.equal(page.hreflangUz, UZ_URL);
    assert.equal((page as Page & { hreflangXDefault?: string }).hreflangXDefault, UZ_URL);
    assert.equal(page.robotsIndex, true, 'indexable once published; the draft status keeps it out until then');
    assert.deepEqual(page.schemaTypes, ['Organization', 'WebSite', 'BreadcrumbList']);
    assert.ok(page.faq.length >= 4);
  }
  assert.equal(ru.locale, 'ru');
  assert.equal(uz.locale, 'uz');
});

test('titles and descriptions: within the audit ranges, og copies, the trial and the independence clause', () => {
  for (const page of [ru, uz]) {
    assert.ok(page.title.length >= 45 && page.title.length <= 65, `${page.url} title ${page.title.length}`);
    assert.ok(page.description.length >= 120 && page.description.length <= 160, `${page.url} description ${page.description.length}`);
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

test('contacts and links: phone and e-mail in the body, every target reachable, nothing broken once both publish', () => {
  const served = new Set(pages.filter((p) => p.status === 'published').map((p) => p.url));
  for (const page of [ru, uz]) {
    const targets = linkTargets(page);
    assert.ok(targets.includes('tel:+998505870720'), `${page.url}: phone`);
    assert.ok(targets.includes('mailto:ceo@gptbot.uz'), `${page.url}: e-mail`);
    assert.ok(targets.includes(`#${UZ_TRANSLIT_ANCHOR}`), `${page.url}: the text points at the converter`);
    for (const target of targets.filter((t) => t.startsWith('/'))) {
      assert.ok(served.has(target) || target === RU_URL || target === UZ_URL, `${page.url} links ${target}, which is not a published page`);
    }
    const nav = new Set(gptChatNavLinks(page).map((l) => l.href));
    const body = new Set((page.bodyBlocks || []).flatMap((b) => (b.links || []).map((l) => l.target)));
    for (const link of page.internalLinks) assert.ok(nav.has(link.target) || body.has(link.target), `${page.url}: ${link.target} would be dropped`);
  }
  assert.ok(linkTargets(ru).includes(UZ_URL) && linkTargets(uz).includes(RU_URL), 'the pair links each other');
});

test('drafts stay unpublished: no published page links them, and a built sitemap does not list them', () => {
  for (const doc of docs) {
    if (doc.status !== 'published') continue;
    const targets = [
      ...((doc as Page).internalLinks || []).map((l) => l.target),
      ...(((doc as Page).bodyBlocks || (doc as BlogArticle).body || []) as Page['bodyBlocks']).flatMap((b) => [b.href, ...(b.links || []).map((l) => l.target)]),
    ];
    assert.ok(!targets.includes(RU_URL) && !targets.includes(UZ_URL), `${doc.url} links a draft translator page`);
  }
  const sitemap = path.join(ROOT, 'dist', 'sitemap.xml');
  if (fs.existsSync(sitemap)) {
    const xml = fs.readFileSync(sitemap, 'utf8');
    assert.ok(!xml.includes(RU_URL) && !xml.includes(UZ_URL), 'the sitemap lists a draft');
  }
});

test('intent manifest A8: both URLs named, the chatgpt tarjima family fenced, one owner per key', () => {
  const manifest = json<{ architectureDecisions: Array<{ id: string; url?: string; counterpart?: string; mustNotTarget?: string[] }> }>('content/seo/intent-manifest.json');
  const a8 = manifest.architectureDecisions.find((d) => d.id === 'A8-ru-uz-translator-pages-2026-10-24');
  assert.ok(a8);
  assert.equal(a8.url, RU_URL);
  assert.equal(a8.counterpart, UZ_URL);
  for (const key of ['chatgpt tarjima', 'chatgpt tarjimon', 'chatgpt o‘zbekcha tarjima', 'tarjimon', 'таржимон', 'переводчик']) {
    assert.ok(a8.mustNotTarget?.includes(key), key);
  }
  for (const page of [ru, uz]) {
    for (const key of a8.mustNotTarget || []) assert.ok(!declared(page).includes(key.toLowerCase()), `${page.url} declares «${key}»`);
    assert.ok(!declared(page).some((k) => k.includes('chatgpt')), `${page.url} declares a chatgpt keyword`);
  }
  const mine = new Set([...declared(ru), ...declared(uz)]);
  for (const doc of docs) {
    if (doc.url === RU_URL || doc.url === UZ_URL) continue;
    const shared = declared(doc).filter((k) => mine.has(k));
    assert.deepEqual(shared, [], `${doc.url} also declares ${shared.join(', ')}`);
  }
  // The Uzbek chat keeps the family (pair C6).
  assert.ok(declared(json<Page>(CHATS[1])).includes('chatgpt tarjima'));
});

test('only the translator role is a preset: anything else on the page is ignored', () => {
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

test('the template adds the role, the pair and the converter only to a page with a role', () => {
  const chatRu = json<Page>(CHATS[0]);
  const chatUz = json<Page>(CHATS[1]);
  for (const chat of [chatRu, chatUz]) {
    assert.equal(chat.chatRole, undefined, `${chat.url} must not get a role: its HTML is protected`);
    assert.equal(chatRoleAttributes(chat), '');
    assert.equal(renderUzTranslitBlock(chat), '');
  }
  assert.equal(chatRoleAttributes({ ...chatRu, pageType: 'money', chatRole: 'translator' }), '', 'gpt-chat pages only');
  assert.equal(chatRoleAttributes({ ...chatRu, chatRole: 'general' as never }), '', 'closed list');
  assert.equal(chatRoleAttributes(ru), ` data-chat-role="translator" data-alt-href="${UZ_URL}"`);
  assert.equal(chatRoleAttributes(uz), ` data-chat-role="translator" data-alt-href="${RU_URL}"`);
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
  assert.match(prerender, /data-h1="\$\{escapeHtml\(page\.h1\)\}"\$\{chatRoleAttributes\(page\)\} class="h-full ym-hide-content"/);
  assert.match(prerender, /\$\{renderUzTranslitBlock\(page\)\}\$\{updatedIso \?/);
  assert.match(prerender, /entryScript\(manifest, ENTRIES\.translit\)/);
  assert.match(prerender, /\$\{pageChatRole\(page\) && translitHref \? `\\n<script type="module" src="\$\{translitHref\}"><\/script>` : ''\}/);
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
  const sheet = read(`${dir}/scoring-sheet.csv`).split('\n')[0];
  assert.equal(sheet, 'item_id,direction,type,requested_output,source_text,candidate_code,candidate_text,rater_id,adequacy,fluency,terminology,names_numbers_changed,critical_error,comment');
  for (const id of ids) assert.match(read(`${dir}/scoring-sheet.csv`), new RegExp(`^${id},`, 'm'), id);
});

// After a build (npm run build:fast): the two protected chats carry no trace
// of the role, and the drafts are not prerendered unless a preview named them.
const DIST = path.join(ROOT, 'dist');
const built = (url: string) => path.join(DIST, url.replace(/^\/|\/$/g, ''), 'index.html');
test('built HTML: the main chats have no role, converter or converter script', { skip: !fs.existsSync(built('/ru/gpt-chat/')) && 'no dist/ build present' }, () => {
  for (const url of ['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/']) {
    const html = fs.readFileSync(built(url), 'utf8');
    assert.doesNotMatch(html, /data-chat-role|data-alt-href|data-uz-translit|uz-translit-/, url);
  }
  for (const url of [RU_URL, UZ_URL]) {
    if (!fs.existsSync(built(url))) continue; // a draft: not prerendered
    const html = fs.readFileSync(built(url), 'utf8'); // a PREVIEW_DRAFTS build
    assert.match(html, /<meta name="robots" content="noindex, nofollow/, `${url}: a preview is never indexable`);
    assert.match(html, /data-chat-role="translator"/);
    assert.match(html, /<script type="module" src="\/assets\/uz-translit-[\w-]+\.js"><\/script>/);
  }
});
