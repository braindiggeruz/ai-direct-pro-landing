// Revision 2026-10-06-seo-push: the R-S3 items of the SEO strategy of
// 2026-10-06 (gptbot.uz-audit/raw/seo-compete-2026-10-06/STRATEGY-BEAT-CHATGPT-UZ.md
// §3.2) that the owner brought forward on 2026-10-06 — R3-4 (#chatgpt-yozish
// in 3–4 paragraphs with one honest «ChatGPT o‘zbek tilida bormi?»), R3-6 (the
// «Talaba…» section links the referat and résumé guides; the UZ chat declares
// «chatgpt tarjima»), R3-9 (one sentence in the login guide's clone section),
// R3-10 (the chat in every site header except the download guide's), R3-11
// (the homepage anchors follow the content) and R3-12 (one owner per key).
// Out of scope: the RU chat title (R3-7) and the UZ chat description (R3-2).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Header from '../src/components/Header';
import { i18n } from '../src/i18n';
import type { BlogArticle, BodyBlock, Page } from '../src/shared/types';
import { HEADER_CHAT_EXCLUDED_PATHS, SITE_CHAT_NAV, headerChatLink } from '../src/shared/site-chat-nav';
import { renderMarketHeader } from '../scripts/market-page';
import { BASELINE, PROTECTED_PATHS } from '../scripts/seo-protection';

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const json = <T>(relative: string) => JSON.parse(read(relative)) as T;

const DOWNLOAD = '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/';
const UZ_CHAT = '/uz/gpt-uzbek-tilida/';
const RU_CHAT = '/ru/gpt-chat/';
const LOGIN = '/uz/blog/chatgptga-qanday-kirish-mumkin/';
const BORMI = 'ChatGPT o‘zbek tilida bormi? Ha, chatgpt.com o‘zbekcha javob beradi; bu sahifa esa — unga mustaqil muqobil.';
const CLONE = 'Domen nomida «chatgpt» so‘zi borligi sayt rasmiy degani emas: ChatGPT’ning rasmiy manzili — chatgpt.com.';

// ── R3-10: the header item ───────────────────────────────────────────────────

test('R3-10: one chat per language, held back only on the protected download guide', () => {
  assert.deepEqual(SITE_CHAT_NAV, {
    ru: { href: RU_CHAT, label: 'ИИ-чат' },
    uz: { href: UZ_CHAT, label: 'O‘zbekcha AI chat' },
  });
  assert.deepEqual([...HEADER_CHAT_EXCLUDED_PATHS], [DOWNLOAD]);
  for (const excluded of HEADER_CHAT_EXCLUDED_PATHS) assert.ok((PROTECTED_PATHS as readonly string[]).includes(excluded), excluded);
  assert.equal(headerChatLink('uz', DOWNLOAD), null);
  assert.deepEqual(headerChatLink('uz', LOGIN), SITE_CHAT_NAV.uz);
  assert.deepEqual(headerChatLink('ru', '/ru/blog/'), SITE_CHAT_NAV.ru);
  // Plain links: no query, no fragment, no «ChatGPT» in the label.
  for (const item of Object.values(SITE_CHAT_NAV)) {
    assert.match(item.href, /^\/(ru|uz)\/[a-z-]+\/$/);
    assert.doesNotMatch(item.label, /ChatGPT|OpenAI|rasmiy|официальн/i);
  }
});

test('R3-10: every header template reads the shared item', () => {
  const prerender = read('scripts/prerender.ts');
  const nav = prerender.slice(prerender.indexOf('const SITE_NAV = {'), prerender.indexOf('} as const;', prerender.indexOf('const SITE_NAV = {')));
  assert.match(nav, /\{ href: '\/ru\/blog\/', text: 'Блог' \},\n\s+\{ href: SITE_CHAT_NAV\.ru\.href, text: SITE_CHAT_NAV\.ru\.label \},\n\s+\],/);
  assert.match(nav, /\{ href: '\/uz\/blog\/', text: 'Blog' \},\n\s+\{ href: SITE_CHAT_NAV\.uz\.href, text: SITE_CHAT_NAV\.uz\.label \},\n\s+\],/);
  const legacy = prerender.slice(prerender.indexOf('function renderLandingHeader'), prerender.indexOf('const locale = page.locale', prerender.indexOf('function renderLandingHeader')));
  assert.match(legacy, /headerChatLink\(page\.locale === 'uz' \? 'uz' : 'ru', page\.url\)/);
  assert.match(legacy, /data-testid="header-chat" class="hidden sm:inline whitespace-nowrap text-white\/70 hover:text-white"/);
  const blog = read('scripts/prerender-blog.ts');
  assert.match(blog, /const headerChat = headerChatLink\(lang, a\.url\);/);
  assert.equal((blog.match(/data-testid="header-chat"/g) ?? []).length, 2, 'articles and the two blog indexes');
  assert.match(read('scripts/prerender-home.ts'), /<a href="\/ru\/blog\/">Блог<\/a>\n\s+<a href="\$\{SITE_CHAT_NAV\.ru\.href\}">\$\{escapeText\(SITE_CHAT_NAV\.ru\.label\)\}<\/a>\n\s+<a href="#contact">/);
});

test('R3-10: the React landing menu names the chat of its language, after the blog', () => {
  for (const lang of ['ru', 'uz'] as const) {
    const html = renderToStaticMarkup(React.createElement(Header, { t: i18n[lang], lang, onSwitchLang: () => undefined }));
    const chat = SITE_CHAT_NAV[lang];
    // Desktop row and the phone menu.
    assert.equal(html.split(`href="${chat.href}"`).length - 1, 2, lang);
    assert.ok(html.indexOf(`data-testid="nav-chat"`) > html.indexOf('data-testid="header-blog-link"'), lang);
    assert.ok(html.includes(`>${chat.label}</a>`), lang);
    assert.ok(!html.includes(SITE_CHAT_NAV[lang === 'ru' ? 'uz' : 'ru'].href), `${lang}: the other language's chat`);
  }
});

test('R3-10: the market header carries the item last, on one line', () => {
  const page = (locale: 'ru' | 'uz', url: string) => ({ locale, url, slug: 'sotuvchi', ctaPrimaryHref: '#' }) as unknown as Page;
  const ru = renderMarketHeader(page('ru', '/ru/sotuvchi/'), '', '');
  const uz = renderMarketHeader(page('uz', '/uz/sotuvchi/'), '', '');
  assert.match(ru, /FAQ<\/a>\n\s+<a href="\/ru\/gpt-chat\/" class="whitespace-nowrap">ИИ-чат<\/a>\n\s+<\/nav>/);
  assert.match(uz, /FAQ<\/a>\n\s+<a href="\/uz\/gpt-uzbek-tilida\/" class="whitespace-nowrap">O‘zbekcha AI chat<\/a>\n\s+<\/nav>/);
});

// Built pages: only against a dist/ that already contains this template.
const DIST = path.join(ROOT, 'dist');
const distHtml = (url: string) => {
  const file = path.join(DIST, url.replace(/^\//, ''), 'index.html');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};
const builtWithItem = (distHtml('/uz/') || '').includes('data-testid="header-chat"');
const skipDist = !builtWithItem && 'dist/ is missing or predates the header item; run npm run build:fast';

test('R3-10 on the build: every site header links its chat once, the download guide and the chats keep theirs', { skip: skipDist }, () => {
  const htmlFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'admin' || entry.name === 'assets' ? [] : htmlFiles(full);
    return entry.name === 'index.html' ? [full] : [];
  });
  let checked = 0;
  for (const file of htmlFiles(DIST)) {
    const url = `/${path.relative(DIST, path.dirname(file)).split(path.sep).join('/')}/`.replace(/^\/\/$/, '/');
    const html = fs.readFileSync(file, 'utf8');
    const header = html.match(/<header\b[\s\S]*?<\/header>(?:\s*<div class="border-b border-white\/5 bg-bg-base">[\s\S]*?<\/nav>\s*<\/div>\s*<\/div>)?/)?.[0];
    if (url === UZ_CHAT || url === RU_CHAT) { assert.equal(header, undefined, `${url}: the chat has no site header`); continue; }
    assert.ok(header, `${url}: no header`);
    if (url === DOWNLOAD) { assert.ok(!header.includes('/uz/gpt-uzbek-tilida/"'), 'the download guide keeps its header'); continue; }
    const locale = /^\/uz\//.test(url) ? 'uz' : 'ru';
    const chat = SITE_CHAT_NAV[locale];
    // One menu item; an article whose header button already opens the chat keeps the button too.
    const items = header.match(new RegExp(`<a href="${chat.href}"[^>]*>${chat.label}</a>`, 'g')) ?? [];
    assert.equal(items.length, 1, `${url}: one «${chat.label}» item`);
    assert.ok(!header.includes(SITE_CHAT_NAV[locale === 'uz' ? 'ru' : 'uz'].label + '</a>'), `${url}: the other language's item`);
    checked += 1;
  }
  assert.ok(checked > 280, `${checked} pages checked`);
});

// ── R3-4, R3-6: the UZ chat ──────────────────────────────────────────────────

const uzChat = json<Page>('content/pages/uz/gpt-uzbek-tilida.json');
const section = (blocks: BodyBlock[], start: (b: BodyBlock) => boolean) => {
  const from = blocks.findIndex(start);
  const to = blocks.findIndex((b, i) => i > from && b.type === 'h2');
  return blocks.slice(from + 1, to);
};

test('R3-4: #chatgpt-yozish has four paragraphs, three samples and the one honest «bormi» sentence', () => {
  const blocks = section(uzChat.bodyBlocks || [], (b) => b.type === 'h2' && (b as { id?: string }).id === 'chatgpt-yozish');
  const paragraphs = blocks.filter((b) => b.type === 'p').map((b) => b.text as string);
  assert.equal(paragraphs.length, 4);
  assert.ok(paragraphs[0].startsWith('Ikki usul bor.'), 'the R-S1 paragraph stays first');
  assert.ok(paragraphs[1].startsWith(BORMI));
  const samples = blocks.find((b) => b.type === 'list') as { items: string[] };
  assert.deepEqual(samples.items.map((s) => s.split(':')[0]), ['O‘qish', 'Tarjima', 'Ish']);
  assert.match(paragraphs[3], /^Javobni tekshiring\./);
  const all = JSON.stringify(uzChat);
  assert.equal(all.split('ChatGPT o‘zbek tilida bormi?').length - 1, 1, 'one mention, in question form');
  assert.doesNotMatch(all, /chatgpt\.uz/i, 'no competitor is named');
  // The new text never makes GPTBot.uz ChatGPT or official, and uses ‘ for o‘ and g‘.
  for (const text of [...paragraphs.slice(1), ...samples.items]) {
    assert.doesNotMatch(text, /GPTBot\.uz[^.]*rasmiy|rasmiy[^.]*GPTBot\.uz/i, text);
    assert.doesNotMatch(text, /[og]['’`ʻ]/, text);
  }
});

test('R3-6: the «Talaba…» section links the referat and résumé guides; the chat declares «chatgpt tarjima»', () => {
  const blocks = section(uzChat.bodyBlocks || [], (b) => b.type === 'h2' && b.text === 'Talaba, marketolog va biznes uchun foydalanish');
  const targets = blocks.flatMap((b) => (b as { links?: Array<{ target: string }> }).links || []).map((l) => l.target);
  for (const target of ['/uz/blog/slayd-tayyorlash/', '/uz/blog/referat-va-mustaqil-ish/', '/uz/blog/insho-yozish-suniy-intellekt-bilan/', '/uz/blog/rezyume-tayyorlash/']) {
    assert.ok(targets.includes(target), target);
  }
  for (const target of ['/uz/blog/referat-va-mustaqil-ish/', '/uz/blog/rezyume-tayyorlash/']) {
    assert.ok((uzChat.internalLinks || []).some((l) => l.target === target), `internalLinks: ${target}`);
  }
  assert.ok(uzChat.secondaryKeywords?.includes('chatgpt tarjima'));
  assert.ok(!uzChat.secondaryKeywords?.includes('chatgpt o‘zbekcha tarjima'));
  // Snippet fields stay (R3-2 and R3-1 are not in this revision).
  assert.equal(uzChat.title, 'ChatGPT o‘zbek tilida? Muqobil AI chat, bepul kirish');
  assert.equal(uzChat.h1, 'O‘zbek tilida AI chat — ChatGPT’ga bepul muqobil');
  assert.equal(uzChat.description, 'O‘zbek tilida bepul AI chat: ro‘yxatsiz, shu sahifada yozing — matn, reja, g‘oyalar. Kunlik limit bilan. GPTBot.uz — mustaqil servis, OpenAI emas.');
  assert.equal(uzChat.lastReviewedAt, '2026-10-05', 'no visible date change in this revision');
});

// ── R3-9: the login guide ────────────────────────────────────────────────────

test('R3-9: one sentence in the clone section; title, description, H1 and date untouched', () => {
  const guide = json<BlogArticle>('content/blog/uz/chatgptga-qanday-kirish-mumkin.json');
  const clones = section(guide.body || [], (b) => b.type === 'h2' && (b as { id?: string }).id === 'xavfsizlik')[0];
  assert.equal(clones.type, 'p');
  assert.equal((clones.text as string).split(CLONE).length - 1, 1);
  assert.equal(JSON.stringify(guide).split(CLONE).length - 1, 1, 'once on the page');
  assert.doesNotMatch(JSON.stringify(guide), /chatgpt\.uz/i);
  assert.equal(guide.title, 'ChatGPT kirish (login): chatgpt.com, 3 qadam (2026)');
  assert.equal(guide.h1, 'ChatGPT kirish va ochish: chatgpt.com, ro‘yxatdan o‘tish va xatolar');
  assert.equal(guide.dateModified, '2026-10-05');
  const reviewed = json<{ pages: Array<{ pathname: string; contract: { description: string[] } }> }>(BASELINE);
  assert.deepEqual(reviewed.pages.find((p) => p.pathname === LOGIN)!.contract.description, [guide.description]);
});

// ── R3-12: one owner per key ─────────────────────────────────────────────────

test('R3-12: «как оплатить chatgpt в узбекистане» and «ai chat» each have one declaring page', () => {
  const docs: Array<Page | BlogArticle> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.json')) docs.push(json<Page | BlogArticle>(rel));
    }
  };
  walk('content/pages');
  walk('content/blog');
  const declared = (doc: Page | BlogArticle) => [
    (doc as Page).primaryKeyword, ...((doc as Page).secondaryKeywords || []), ...((doc as BlogArticle).keywords || []),
  ].filter((k): k is string => typeof k === 'string').map((k) => k.toLowerCase());
  const manifest = json<{ architectureDecisions: Array<{ id: string; keyOwners?: Array<{ keyword: string; owner: string; removedFrom: string }> }> }>('content/seo/intent-manifest.json');
  const decision = manifest.architectureDecisions.find((d) => d.id === 'A6-protected-duplicate-keys-2026-10-06');
  assert.ok(decision?.keyOwners);
  assert.deepEqual(decision.keyOwners.map((k) => [k.keyword, k.owner]), [
    ['как оплатить chatgpt в узбекистане', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/'],
    ['ai chat', '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/'],
  ]);
  for (const { keyword, owner } of decision.keyOwners) {
    assert.deepEqual(docs.filter((d) => declared(d).includes(keyword)).map((d) => d.url), [owner], keyword);
  }
});

// ── The reviewed revision ────────────────────────────────────────────────────

const SEO_PUSH = 'docs/seo/evidence/2026-10-06-seo-push/reviewed-protected-pages.json';
const CHAT_DESIGN = 'docs/seo/evidence/2026-10-06-chat-design/reviewed-protected-pages.json';
type Revision = {
  previousRevision: string;
  reviewedChanges: Array<{ pathname: string; fields: string[] }>;
  invisibleToGate: Array<{ change: string; pages?: string[]; htmlSha256?: Record<string, string> }>;
  measurement: string;
  pages: Array<{ pathname: string; contract: Record<string, unknown>; bodyText: string }>;
};

test('the seo-push revision: body text and links only, exactly the listed sentences, two pages untouched', () => {
  assert.equal(BASELINE, SEO_PUSH);
  const current = json<Revision>(SEO_PUSH);
  const previous = json<Revision>(CHAT_DESIGN);
  assert.equal(current.previousRevision, CHAT_DESIGN);
  assert.deepEqual(current.reviewedChanges.map((c) => [c.pathname, [...c.fields].sort()]), [
    [UZ_CHAT, ['bodyTextSha256', 'internalLinks']],
    ['/ru/blog/chatgpt-i-claude-v-uzbekistane/', ['bodyTextSha256', 'internalLinks']],
    ['/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', ['bodyTextSha256', 'internalLinks']],
    [LOGIN, ['bodyTextSha256']],
    ['/uz/blog/chatgpt-uzbek-tilida-promptlar/', ['bodyTextSha256']],
    ['/', ['bodyTextSha256']],
    ['/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/', ['bodyTextSha256']],
    ['/uz/blog/ai-chat-nima-va-qanday-turlari-bor/', ['bodyTextSha256', 'internalLinks']],
  ]);
  const page = (rev: Revision, pathname: string) => rev.pages.find((p) => p.pathname === pathname)!;
  for (const pathname of PROTECTED_PATHS) {
    const after = page(current, pathname);
    const before = page(previous, pathname);
    for (const key of ['title', 'h1', 'description', 'robots', 'googlebot', 'canonical', 'hreflang']) {
      assert.deepEqual(after.contract[key], before.contract[key], `${pathname}: ${key}`);
    }
    const links = (p: typeof after) => p.contract.internalLinks as string[];
    const added = links(after).filter((l) => !links(before).includes(l));
    assert.deepEqual(links(before).filter((l) => !links(after).includes(l)), [], `${pathname}: no link removed`);
    if (pathname === UZ_CHAT) assert.deepEqual(added, ['/uz/blog/referat-va-mustaqil-ish/', '/uz/blog/rezyume-tayyorlash/']);
    else if (pathname.startsWith('/ru/blog/')) assert.deepEqual(added.filter((l) => l !== RU_CHAT), [], pathname);
    else assert.deepEqual(added.filter((l) => l !== UZ_CHAT), [], pathname);
  }
  // Untouched: the download guide (its own P-CTR window) and the RU chat (a key only).
  for (const pathname of [DOWNLOAD, RU_CHAT]) {
    assert.deepEqual(page(current, pathname).contract, page(previous, pathname).contract, pathname);
    assert.equal(page(current, pathname).bodyText, page(previous, pathname).bodyText, pathname);
  }
  // The header item is the whole text change of five articles and of /.
  const withItem = (before: string, blog: string, label: string) => before.replace(` ${blog} `, ` ${blog} ${label} `);
  for (const pathname of ['/ru/blog/chatgpt-i-claude-v-uzbekistane/', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/']) {
    assert.equal(page(current, pathname).bodyText, withItem(page(previous, pathname).bodyText, 'Блог', 'ИИ-чат'), pathname);
  }
  for (const pathname of ['/uz/blog/chatgpt-uzbek-tilida-promptlar/', '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/', '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/']) {
    assert.equal(page(current, pathname).bodyText, withItem(page(previous, pathname).bodyText, 'Blog', 'O‘zbekcha AI chat'), pathname);
  }
  assert.equal(page(current, '/').bodyText, withItem(page(previous, '/').bodyText, 'Блог', 'ИИ-чат'));
  // The login guide: the header item and the clone sentence.
  const login = withItem(page(previous, LOGIN).bodyText, 'Blog', 'O‘zbekcha AI chat')
    .replace('cookie so‘rashi mumkin. ', `cookie so‘rashi mumkin. ${CLONE} `);
  assert.equal(page(current, LOGIN).bodyText, login);
  // The UZ chat: the three new paragraphs with the samples, and the «Talaba…» sentence.
  const uz = page(current, UZ_CHAT).bodyText;
  assert.ok(uz.includes(`g‘oya topishda yordam beradi. ${BORMI}`));
  assert.ok(uz.includes('yaratmaydi), referat va mustaqil ish yozish , insho va esse yozish hamda ishga hujjat topshirish uchun rezyume tayyorlash .'));
  // Every protected page's HTML hashes are recorded, before → after.
  const hashes = current.invisibleToGate.find((c) => c.htmlSha256)!.htmlSha256!;
  assert.deepEqual(Object.keys(hashes), [...PROTECTED_PATHS]);
  for (const [pathname, value] of Object.entries(hashes)) {
    const [before, after] = value.split(' → ');
    assert.match(before, /^[0-9a-f]{64}$/);
    assert.match(after, /^[0-9a-f]{64}$/);
    assert.equal(before === after, pathname === DOWNLOAD || pathname === RU_CHAT, `${pathname}: changed iff the revision changes it`);
  }
  assert.match(current.measurement, /P-CTR/);
  const texts = [...current.invisibleToGate.map((c) => c.change), ...current.reviewedChanges.map((c) => JSON.stringify(c)), current.measurement];
  for (const text of texts) {
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b/, text.slice(0, 80));
    assert.doesNotMatch(text, /chatgpt\.uz/i, 'the competitor is not named in the record either');
  }
});
