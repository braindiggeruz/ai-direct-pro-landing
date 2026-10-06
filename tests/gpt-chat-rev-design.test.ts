// Revision 2026-10-06-chat-design (UX plan REV-1…REV-10, REV-13): the chat's
// first screen, the composer, the answer, the menu and the pack window. The
// chat is client-rendered, so most of this is pinned on the source, the copy
// and the stylesheet; the prerendered frame and the <head> of both chat pages
// are checked on the build when there is one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../src/gpt-chat/markdown';
import { strings } from '../src/gpt-chat/i18n';
import { limitCard } from '../src/gpt-chat/limit-card';
import { AiPromptChips } from '../src/gpt-chat/components/AiPromptChips';
import { AiChatInput } from '../src/gpt-chat/components/AiChatInput';
import { loadHistory, saveHistory } from '../src/gpt-chat/storage';
import type { ChatMessage } from '../src/gpt-chat/types';
import { entryImports, readViteManifest, ENTRIES } from '../scripts/vite-manifest';

// The components use the classic JSX transform under tsx, as in gpt-chat-honesty.test.ts.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const css = read('src/gpt-chat/premium.css');
const LOCALES = ['uz', 'ru'] as const;
const DIST = path.join(ROOT, 'dist');
const built = fs.existsSync(path.join(DIST, 'uz', 'gpt-uzbek-tilida', 'index.html')) && fs.existsSync(path.join(DIST, '.vite', 'manifest.json'));

test('REV-2: the four starters follow what people ask; each fills the composer and never sends', () => {
  const uz = strings('uz');
  const ru = strings('ru');
  assert.deepEqual(uz.chips.map((c) => c.id), ['math', 'text', 'explain', 'plan']);
  assert.deepEqual(ru.chips.map((c) => c.id), ['math', 'text', 'explain', 'plan']);
  assert.deepEqual(uz.chips.map((c) => c.label), ['Masalani yechish', 'Matn yozish', 'Mavzuni tushuntirish', 'Reja tuzish']);
  assert.deepEqual(ru.chips.map((c) => c.label), ['Решить задачу', 'Написать текст', 'Объяснить тему', 'Составить план']);
  assert.equal(uz.chips[0].insert, 'Masalani qadamma-qadam yech: ');
  assert.equal(ru.chips[0].insert, 'Реши задачу по шагам: ');
  for (const t of [uz, ru]) for (const chip of t.chips) assert.ok(chip.insert.endsWith(': '), chip.id);
  const picked: string[] = [];
  const html = renderToStaticMarkup(React.createElement(AiPromptChips, { chips: uz.chips, onPick: (c) => picked.push(c.id), label: uz.emptyPrompt }));
  assert.equal((html.match(/<button type="button" class="gpt-prompt-card"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /lucide|arrow-up-right/, 'no arrow that promises a page');
  assert.equal(picked.length, 0);
  // The example in the empty field; the field keeps its name.
  assert.equal(uz.inputExample, 'Masalan: 7-sinf masalasini tushuntirib ber');
  assert.equal(ru.inputExample, 'Например: объясни задачу за 7 класс');
  const input = renderToStaticMarkup(React.createElement(AiChatInput, {
    value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t: uz, inputRef: React.createRef<HTMLTextAreaElement>(), placeholder: uz.inputExample,
  }));
  assert.match(input, /placeholder="Masalan: 7-sinf masalasini tushuntirib ber" aria-label="Xabar yozing…"/);
  for (const t of [uz, ru]) for (const line of [t.inputExample, t.aboutChat, ...t.chips.map((c) => c.label + c.insert)]) assert.doesNotMatch(line, /ChatGPT|OpenAI|rasmiy|официальн|'/, line);
});

test('REV-2: the terms stand under the intro, before the cards; the H1 keeps its text and gets its size from the stylesheet', () => {
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  const rest = chat.slice(chat.indexOf('<div className="gpt-intro">'), chat.indexOf('<AiChatMessageList'));
  const at = (needle: string) => { const i = rest.indexOf(needle); assert.ok(i > 0, needle); return i; };
  assert.ok(at('className="gpt-intro-copy"') < at('className="gpt-intro-terms"'));
  assert.ok(at('className="gpt-intro-terms"') < at('<AiPromptChips'));
  assert.match(rest, /<p className="gpt-intro-terms">\s*\{paid \? t\.premium\.manual : t\.emptyMeta\(freeLimits\)\}\s*<\/p>/);
  assert.equal((rest.match(/t\.emptyMeta\(freeLimits\)/g) ?? []).length, 1, 'stated once');
  assert.match(rest, /<h1 className="gpt-welcome-title" data-testid="chat-h1">/);
  assert.doesNotMatch(rest, /style=\{\{ fontSize/);
  assert.match(css, /\.gpt-premium \.gpt-welcome-title \{[^}]*font-size: clamp\(23px, 2\.6vw \+ 14px, 44px\);/);
  // The mark goes on a phone of 760px or less; the cards are 72px there.
  assert.match(css, /@media \(max-width: 700px\) and \(max-height: 760px\) \{\s*\.gpt-premium \.gpt-mark \{ display: none; \}/);
  assert.match(css, /\.gpt-premium \.gpt-prompt-card \{ height: 72px;/);
});

test('REV-1: on a phone the composer is one row; the brand moved into the line under it, which never hides', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 700px) {'), css.indexOf('/* A tablet keeps two lines'));
  assert.match(phone, /\.gpt-premium \.gpt-composer \.gpt-input-surface \{ flex-direction: row; align-items: flex-end;/);
  assert.match(phone, /\.gpt-premium \.gpt-composer \.gpt-input-surface textarea \{ flex: 1 1 auto;[^}]*min-height: 44px; max-height: 128px;/);
  for (const locale of LOCALES) {
    const t = strings(locale);
    const input = renderToStaticMarkup(React.createElement(AiChatInput, {
      value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t, inputRef: React.createRef<HTMLTextAreaElement>(),
    }));
    const footnote = input.slice(input.indexOf('class="gpt-input-footnote"'));
    assert.match(footnote, /<span class="gpt-input-identity"><span aria-hidden="true">✦<\/span> GPTBot\.uz<\/span> · <span data-testid="ai-input-microcopy">/);
    assert.ok(!input.slice(0, input.indexOf('class="gpt-input-footnote"')).includes('gpt-input-identity'), `${locale}: the brand is not twice in the composer`);
  }
  // 11px, never hidden (F8; the short version of decision 5 is not taken).
  assert.match(css, /\.gpt-input-footnote \{ display: flex;[^}]*font-size: 11px;/);
  assert.doesNotMatch(css, /gpt-input-footnote-(short|full)/);
});

test('REV-3: the prerendered frame is the chat\'s own geometry and adds no text', { skip: !built && 'no dist/ build present' }, () => {
  for (const [url, loading] of [['/uz/gpt-uzbek-tilida/', 'AI-chat yuklanmoqda…'], ['/ru/gpt-chat/', 'AI-чат загружается…']] as const) {
    const html = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8');
    const root = html.slice(html.indexOf('<div id="gpt-chat-root"'), html.indexOf('</main>'));
    assert.match(root, /<div class="gpt-premium gpt-shell bg-bg-base text-white" style="color-scheme:dark">/);
    for (const cls of ['gpt-header gpt-shell-header', 'gpt-shell-quota', 'gpt-thread-scroll gpt-shell-thread', 'gpt-viewport', 'gpt-intro', 'gpt-composer shrink-0', 'gpt-input-surface gpt-shell-input', 'gpt-input-footnote gpt-shell-footnote']) {
      assert.ok(root.includes(`class="${cls}`), `${url}: ${cls}`);
    }
    assert.equal((root.match(/class="gpt-prompt-card"/g) ?? []).length, 4);
    // The text of the mount point: the H1, the no-JavaScript line and the loading line, as before the frame.
    const text = root.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const h1 = root.match(/<h1 data-testid="page-h1" class="gpt-welcome-title">([^<]*)<\/h1>/)?.[1] ?? '';
    const noscript = root.match(/<noscript><p class="gpt-intro-copy">([^<]*)<\/p><\/noscript>/)?.[1] ?? '';
    assert.ok(h1 && noscript, url);
    assert.equal(text, `${h1} ${noscript} ${loading}`, `${url}: the frame adds no words`);
    assert.match(html, /<section id="seo-summary" data-testid="seo-summary"/);
  }
  // React replaces the frame in its first commit; nothing empties the mount point before it.
  assert.doesNotMatch(read('src/gpt-chat/main.tsx'), /innerHTML/);
  for (const cls of ['.gpt-shell {', '.gpt-shell-aside', '.gpt-shell-main', '.gpt-shell-thread', '.gpt-premium .gpt-shell-input']) assert.ok(css.includes(cls), cls);
});

test('REV-4: only the chat pages get resizes-content, the chat\'s theme colour and the start chunks preloaded', { skip: !built && 'no dist/ build present' }, () => {
  const manifest = readViteManifest(DIST);
  const preloads = entryImports(manifest, ENTRIES.chat);
  assert.ok(preloads.length >= 3 && preloads.every((href) => /^\/assets\/[\w.-]+\.js$/.test(href) && fs.existsSync(path.join(DIST, href.slice(1)))));
  assert.ok(!preloads.includes(`/${manifest[ENTRIES.chat].file}`), 'the entry itself is the page script');
  for (const url of ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/']) {
    const head = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8').split('</head>')[0];
    assert.match(head, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover, interactive-widget=resizes-content" \/>/);
    assert.match(head, /<meta name="theme-color" content="#090c14" \/>/);
    assert.deepEqual([...head.matchAll(/<link rel="modulepreload" href="([^"]+)" \/>/g)].map((m) => m[1]), preloads);
  }
  // The homepage keeps its own head (Vite preloads the landing's chunks there).
  for (const url of ['/', '/uz/blog/chatgptga-qanday-kirish-mumkin/', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/']) {
    const head = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8').split('</head>')[0];
    assert.doesNotMatch(head, /interactive-widget|#090c14/, url);
    if (url !== '/') assert.doesNotMatch(head, /modulepreload/, url);
  }
});

test('REV-5: a swipe on the header or the composer does not slide the page; the text under the chat is a link away', () => {
  assert.match(css, /html:has\(\.gpt-premium\) \{ overscroll-behavior-y: none; scroll-padding-bottom: 0; \}/);
  assert.match(css, /\.gpt-premium \.gpt-header, \.gpt-premium \.gpt-composer \{ touch-action: none; touch-action: pinch-zoom; \}/);
  assert.match(css, /\.gpt-premium \.gpt-composer textarea \{ touch-action: pan-y; touch-action: pan-y pinch-zoom; \}/);
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(chat, /<a href="#seo-summary" onClick=\{toSummary\}>\{t\.aboutChat\}<\/a>/);
  assert.match(chat, /setDrawerOpen\(false\);\s*window\.setTimeout\(\(\) => summary\.scrollIntoView\(\{ behavior: "smooth" \}\), 60\);/);
  assert.match(read('src/gpt-chat/components/AiSidebar.tsx'), /<a href="#seo-summary" onClick=\{onAbout\} className=\{LINK\}>\s*\{t\.aboutChat\}/);
  assert.equal(strings('uz').aboutChat, 'Batafsil: chat haqida ↓');
  assert.equal(strings('ru').aboutChat, 'Подробнее о чате ↓');
});

test('REV-6: # and ## are sections, ### their parts; a code block carries its own copy button, labelled by us', () => {
  assert.equal(renderMarkdown('# Bir\n## Ikki\n### Uch\n#### To‘rt'), '<h3>Bir</h3>\n<h3>Ikki</h3>\n<h4>Uch</h4>\n<h4>To‘rt</h4>');
  assert.equal(renderMarkdown('```\nx < 1\n```'), '<pre class="gpt-code" tabindex="0"><code>x &lt; 1</code></pre>');
  assert.equal(renderMarkdown('```\nx < 1\n```', 'Nusxalash'),
    '<div class="gpt-code-wrap"><pre class="gpt-code" tabindex="0"><code>x &lt; 1</code></pre><button type="button" class="gpt-code-copy" data-copy-code>Nusxalash</button></div>');
  // The model cannot make a button: its HTML is escaped first.
  assert.doesNotMatch(renderMarkdown('<button data-copy-code>x</button>', 'Nusxalash'), /<button/);
  const answer = read('src/gpt-chat/components/AiAnswer.tsx');
  assert.match(answer, /const button = \(event\.target as HTMLElement\)\.closest\?\.\("\[data-copy-code\]"\);/);
  assert.match(answer, /__html: renderMarkdown\(content, s\.copy\),/);
  assert.match(css, /\.gpt-premium \.gpt-table-scroll \{\s*background:\s*linear-gradient\(to right, var\(--card\) 30%, #0000\) left \/ 24px 100% no-repeat local,/);
});

test('REV-8: the menu opens as a drawer from the left; the targets are 44px', () => {
  assert.match(css, /\[data-slot="dialog-content"\]\.gpt-sidebar-dialog \{ top: 0; left: 0; transform: none; translate: none; max-width: none; width: min\(300px,85vw\);/);
  assert.match(css, /@keyframes gpt-drawer-in \{ from \{ transform: translateX\(-100%\); \} \}/);
  assert.match(css, /\.gpt-premium \.gpt-header nav > :is\(a,span\) \{ min-width: 44px; \}/);
  assert.match(css, /\.gpt-icon-button \{ width: 44px; height: 44px; min-width: 44px; min-height: 44px;/);
  assert.match(css, /\.gpt-check input \{ width: 24px; height: 24px;/);
  assert.match(css, /\.gpt-input-footnote a \{ position: relative; display: inline-block; padding: 12px 2px; margin: -12px 0;/);
  assert.match(css, /\.gpt-premium \.gpt-intro-badge \{[^}]*font-size: 11px;/);
  // The role picker is a lazy part; its place is held while it comes.
  assert.match(read('src/gpt-chat/components/AiSidebar.tsx'), /<LazyPart part=\{rolePart\} fallback=\{<div className="h-\[92px\]" \/>\} failed=\{null\}>/);
});

test('REV-9: the consent and its button stay at the bottom of the pack window', () => {
  const window = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.equal((window.match(/<div className="gpt-sticky-action">/g) ?? []).length, 2, 'the pay step and the sign-in');
  assert.match(window, /<div className="gpt-sticky-action">\s*<label className="gpt-check">\s*<input type="checkbox" checked=\{terms\}/);
  assert.match(window, /<div className="gpt-sticky-action">\s*<label className="gpt-check">\s*<input type="checkbox" checked=\{consent\}/);
  assert.match(css, /\.gpt-account-dialog \.gpt-sticky-action \{ position: sticky; bottom: -28px;/);
  assert.match(css, /\.gpt-account-dialog \.gpt-sticky-action:has\(\.gpt-bot-login\) \{ position: static;/);
});

test('REV-10: no dvh without a vh before it; a restored thread hides until it has scrolled; the top safe area is the header\'s', () => {
  assert.match(css, /max-height: calc\(100vh - 32px\); max-height: calc\(100dvh - 32px\);/);
  assert.match(css, /height: 100vh; height: 100dvh;/);
  assert.match(css, /\.gpt-premium \.gpt-viewport\[data-pending-scroll\] \{ visibility: hidden; \}/);
  assert.match(css, /\.gpt-premium \.gpt-header \{ height: calc\(76px \+ env\(safe-area-inset-top\)\); padding: env\(safe-area-inset-top\) 28px 0;/);
  for (const rule of css.matchAll(/[^{}]*\{[^{}]*\b100dvh\b[^{}]*\}/g)) {
    const body = rule[0].slice(rule[0].indexOf('{'));
    assert.ok(/100vh/.test(body), `${rule[0].trim().slice(0, 60)}: a fallback`);
  }
});

test('REV-13: with the keyboard open the limit card is one line, and a screen reader still hears why', () => {
  const NOW = Date.UTC(2026, 9, 6, 6, 15);
  const hourly = limitCard('uz', { reason: 'hourly', retryAt: NOW + 41 * 60_000, since: NOW, limits: { daily: 15, hourly: 5 } }, { billingAvailable: true, paid: false, botHandoff: false, remaining: 10 }, NOW);
  assert.equal(hourly.short, '41 daqiqadan keyin (soat 11:56 da)');
  assert.equal(limitCard('ru', { reason: 'hourly', retryAt: NOW + 41 * 60_000, since: NOW, limits: { daily: 15, hourly: 5 } }, { billingAvailable: false, paid: false, botHandoff: false, remaining: 10 }, NOW).short, 'Через 41 мин (в 11:56)');
  const daily = limitCard('uz', { reason: 'daily', retryAt: NOW + 3_600_000, since: NOW, limits: { daily: 15, hourly: 5 } }, { billingAvailable: false, paid: false, botHandoff: false, remaining: 0 }, NOW);
  assert.equal(daily.short, strings('uz').dailyTitle);
  const soon = limitCard('uz', { reason: 'hourly', retryAt: NOW + 30_000, since: NOW, limits: { daily: 15, hourly: 5 } }, { billingAvailable: false, paid: false, botHandoff: false, remaining: 10 }, NOW);
  assert.equal(soon.short, strings('uz').limitLessMinute);
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(chat, /<div className="gpt-composer shrink-0" data-keyboard=\{keyboard \? "open" : undefined\}>/);
  assert.match(chat, /<p className="gpt-limit-short">\s*<span className="sr-only">\{card\.title\} \{card\.body\} <\/span>\s*\{card\.short\}/);
  assert.match(css, /\.gpt-premium \.gpt-composer\[data-keyboard="open"\] \.gpt-limit-full \{ display: none; \}/);
  assert.match(css, /\.gpt-premium \.gpt-composer:not\(\[data-keyboard="open"\]\) \.gpt-limit-short \{ display: none; \}/);
  const keyboard = read('src/gpt-chat/keyboard.ts');
  assert.match(keyboard, /document\.activeElement === inputRef\.current\s*&& window\.matchMedia\('\(pointer: coarse\)'\)\.matches && height < tallest \* 0\.84/);
});

test('REV-7: an answer\'s versions are stored with it, at most 3, and malformed ones are dropped', (t) => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); }, key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => { delete (globalThis as Record<string, unknown>).localStorage; });
  const versions = [{ content: 'Birinchi', model: 'm1' }, { content: 'Ikkinchi', model: 'm2', truncated: true }];
  const thread: ChatMessage[] = [{ role: 'user', content: 'Savol' }, { role: 'assistant', content: 'Birinchi', model: 'm1', versions, version: 0 }];
  saveHistory(thread, 'uz');
  const back = loadHistory('uz');
  assert.deepEqual(back[1].versions, [{ content: 'Birinchi', model: 'm1', truncated: false }, { content: 'Ikkinchi', model: 'm2', truncated: true }]);
  assert.equal(back[1].version, 0);
  assert.equal(back[0].versions, undefined);
  for (const bad of [
    { versions: [{ content: 'a' }], version: 0 },
    { versions: [{ content: 'a' }, { content: 'b' }, { content: 'c' }, { content: 'd' }], version: 0 },
    { versions: [{ content: 'a' }, { content: 1 }], version: 0 },
    { versions: [{ content: 'a' }, { content: 'b' }], version: 2 },
  ]) {
    values.set('gptchat_history_uz', JSON.stringify([{ role: 'assistant', content: 'a', ...bad }]));
    const [m] = loadHistory('uz');
    assert.equal(m.versions, undefined, JSON.stringify(bad));
    assert.equal(m.content, 'a');
  }
});
