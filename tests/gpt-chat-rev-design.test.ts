// Revision 2026-10-06-chat-design: the chat design release (spec
// gptbot.uz-audit/raw/chat-design-2026-10-06/DESIGN-SPEC.md, «app-calm»), on
// top of the UX plan's REV-1…REV-10 and REV-13 mechanics. One app column of
// 100dvh: header, thread, and the composer in flow on an opaque surface, so no
// text passes under it; a calm first screen; answers that read as maths. The
// chat is client-rendered, so most of this is pinned on the source, the copy
// and the stylesheets; the prerendered frame and the <head> of both chat pages
// are checked on the build when there is one (scripts/chat-layout-check.mjs
// measures the pages themselves).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../src/gpt-chat/markdown';
import { latexLite, mathHtml } from '../src/gpt-chat/latex-lite';
import { plainText } from '../src/gpt-chat/plain-text';
import { strings } from '../src/gpt-chat/i18n';
import { answerStrings } from '../src/gpt-chat/answer-strings';
import { limitCard } from '../src/gpt-chat/limit-card';
import { usageLine } from '../src/gpt-chat/usage-line';
import { AiPromptChips } from '../src/gpt-chat/components/AiPromptChips';
import { AiChatInput } from '../src/gpt-chat/components/AiChatInput';
import { loadHistory, saveHistory } from '../src/gpt-chat/storage';
import type { ChatMessage } from '../src/gpt-chat/types';
import { entryImports, entryStyles, readViteManifest, ENTRIES } from '../scripts/vite-manifest';

// The components use the classic JSX transform under tsx, as in gpt-chat-honesty.test.ts.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const css = read('src/gpt-chat/premium.css');
const account = read('src/gpt-chat/account/account.css');
const article = read('src/gpt-chat/article.css');
const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
const LOCALES = ['uz', 'ru'] as const;
const DIST = path.join(ROOT, 'dist');
const built = fs.existsSync(path.join(DIST, 'uz', 'gpt-uzbek-tilida', 'index.html')) && fs.existsSync(path.join(DIST, '.vite', 'manifest.json'));
/** What the eye sees of drawn maths (the screen reader's linear text taken out), and what a screen reader reads. */
const seen = (html: string) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '');
const spoken = (html: string) => html.replace(/<[^>]+>/g, '');
const input = (props: Partial<Parameters<typeof AiChatInput>[0]> = {}, locale: 'uz' | 'ru' = 'uz') => renderToStaticMarkup(React.createElement(AiChatInput, {
  value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t: strings(locale), inputRef: React.createRef<HTMLTextAreaElement>(), ...props,
}));

test('§0 rule 1: the composer is in the app column, opaque and never fixed; the thread ends at its top edge', () => {
  assert.match(css, /\.gpt-header, \.gpt-composer \{ position: relative; z-index: 2; flex: none;/);
  assert.match(css, /\.gpt-composer \{ padding: 8px 12px calc\(8px \+ env\(safe-area-inset-bottom\)\); background: var\(--surface\); box-shadow: 0 -1px 0 var\(--line\); \}/);
  assert.match(css, /--surface: #0c1018;/);
  // The rejected pattern: a transparent gradient on a docked composer.
  assert.doesNotMatch(css, /gpt-composer[^{]*\{[^}]*(position: fixed|linear-gradient)/);
  assert.match(css, /\.gpt-thread-scroll \{ flex: 1 1 0%; height: auto; min-height: 0;/);
  assert.match(css, /\.gpt-app \{ display: flex; height: 100%;/);
  assert.match(chat, /<div className="gpt-composer">\s*<div className="gpt-composer-inner">/);
  // The harness that measures it, with its negative control, runs on the build.
  const harness = read('scripts/chat-layout-check.mjs');
  assert.match(harness, /position: fixed; bottom: 0; left: 0; right: 0; background: linear-gradient\(0deg, var\(--bg\) 82%, transparent\)/);
  assert.match(harness, /negativeControl\.textUnderComposer >= 1/);
  assert.match(read('package.json'), /"check:chat-layout": "node scripts\/chat-layout-check\.mjs"/);
});

test('§5.1: the header says GPTBot.uz and one fact under it: independent on the resting screen, the count in a chat, the wait in a limit', () => {
  assert.equal(strings('uz').brandSub, 'mustaqil servis, OpenAI emas');
  assert.equal(strings('ru').brandSub, 'независимый сервис, не OpenAI');
  // Where the header has no room (a conversation before the count, under 340px): short, still honest.
  assert.equal(strings('uz').brandSubShort, 'OpenAI emas');
  assert.equal(strings('ru').brandSubShort, 'не OpenAI');
  assert.match(chat, /const state = limitBlocked \? "limit" : resting \? "empty" : "chat";/);
  assert.match(chat, /data-state=\{state\}\s*data-keyboard=\{keyboard \? "open" : undefined\}/);
  assert.match(chat, /\? \{ text: t\.premium\.activeShort\(remaining\), tone: "pack" \}\s*: limitBlocked && card\s*\? \{ text: card\.header, tone: "warn" \}\s*: !resting && usage\s*\? \{ text: usage\.short, tone: usage\.low \? "warn" : undefined \}\s*: resting\s*\? \{ text: t\.brandSub, short: t\.brandSubShort \}\s*: \{ text: t\.brandSubShort \};/);
  assert.match(chat, /<span className="gpt-header-sub" data-tone=\{sub\.tone\} aria-hidden="true">\s*\{sub\.short \? <><span className="gpt-sub-full">\{sub\.text\}<\/span><span className="gpt-sub-short">\{sub\.short\}<\/span><\/> : sub\.text\}\s*<\/span>/);
  assert.match(css, /@media \(max-width: 339px\) \{(?:[^{}]*\{[^{}]*\})*?\s*\.gpt-sub-full \{ display: none; \}\s*\.gpt-sub-short \{ display: inline; \}/);
  // A screen reader hears the count, or a pack holder's answers left (the visual line is aria-hidden).
  assert.match(chat, /const srStatus = paid \? t\.premium\.activeLine\(remaining\) : usage\?\.text;/);
  assert.match(chat, /\{srStatus && <span className="sr-only" role="status">\{srStatus\}<\/span>\}/);
  assert.equal(strings('uz').premium.activeLine(7), 'AI paket · 7 ta javob qoldi');
  assert.deepEqual([strings('uz').premium.activeShort(7), strings('ru').premium.activeShort(7)], ['7 ta javob qoldi', 'Ещё 7 ответов']);
  // The count of what runs out first, saffron at 2 this hour or 3 today; unknown until the server counts.
  const uz = strings('uz');
  assert.deepEqual(usageLine(10, 2, false, uz), { text: uz.hourRemaining(2), short: uz.hourRemainingShort(2), low: true });
  assert.deepEqual(usageLine(10, null, true, uz), { text: uz.hourRemaining(0), short: uz.hourRemainingShort(0), low: true });
  assert.deepEqual(usageLine(4, null, false, uz), { text: uz.remaining(4), short: uz.remainingShort(4), low: false });
  assert.deepEqual(usageLine(3, 5, false, uz), { text: uz.remaining(3), short: uz.remainingShort(3), low: true });
  // The header's line is short (it shares 320px with the language switch and «new chat»); a screen reader hears the sentence.
  assert.deepEqual([uz.hourRemainingShort(3), uz.remainingShort(13)], ['Bu soatda yana 3 ta', 'Bugun yana 13 ta']);
  assert.deepEqual([strings('ru').hourRemainingShort(3), strings('ru').remainingShort(13)], ['Ещё 3 в этот час', 'Сегодня ещё 13']);
  assert.equal(usageLine(-1, 2, false, uz), null);
  // The old pill and the 15-segment strip are gone; the mark replaces the sparkles.
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/gpt-chat/components/AiUsageBadge.tsx')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/gpt-chat/components/AiQuotaThread.tsx')));
  assert.doesNotMatch(chat, /Sparkles|AiQuotaThread|AiUsageBadge/);
  assert.match(read('src/gpt-chat/components/BrandMark.tsx'), /<path d="M6\.5 5h11A2\.5 2\.5 0 0 1 20 7\.5v6/);
  // The language switch on every screen; «new chat» once there is something to clear.
  assert.match(chat, /data-testid="lang-uz"\s*onClick=\{\(\) => onLocaleSwitch\("header"\)\}/);
  assert.match(chat, /\{!empty && \(\s*<button[\s\S]{0,80}onClick=\{onNewChat\}[\s\S]{0,200}aria-label=\{t\.newChat\}/);
});

test('§5.2: the resting screen is the H1 as a kicker, a two-line greeting, the terms, four tasks and one link', () => {
  const rest = chat.slice(chat.indexOf('<div className="gpt-empty">'), chat.indexOf('<AiChatMessageList'));
  const at = (needle: string) => { const i = rest.indexOf(needle); assert.ok(i > 0, needle); return i; };
  assert.ok(at('<h1 className="gpt-kicker" data-testid="chat-h1">{h1}</h1>') < at('<p className="gpt-greet">'));
  assert.ok(at('<p className="gpt-greet">') < at('<p className="gpt-meta">'));
  assert.ok(at('<p className="gpt-meta">') < at('<AiPromptChips'));
  assert.ok(at('<AiPromptChips') < at('<p className="gpt-empty-links">'));
  assert.match(rest, /<span>\{paid \? t\.premium\.manual : t\.emptyMeta\(freeLimits\)\}<\/span>/);
  assert.equal((rest.match(/t\.emptyMeta\(freeLimits\)/g) ?? []).length, 1, 'stated once');
  // No badge, eyebrow, intro, trust line or chatgpt.com line on the first screen any more.
  for (const gone of ['gpt-intro-badge', 'premium.eyebrow', 'premium.intro', 'premium.trust', 'gpt-trust', 'gpt-mark', 'gpt-official', 'h1Cut']) assert.ok(!chat.includes(gone), gone);
  const keys = Object.keys(strings('uz').premium);
  for (const gone of ['eyebrow', 'intro', 'trust']) assert.ok(!keys.includes(gone), gone);
  // A returning visitor whose hour is spent: the limit card stands in the tasks' place.
  assert.match(rest, /\{limitCardEl \|\| \(\s*<AiPromptChips/);
  // The greeting centres in the free space; the tasks follow it (§4.2).
  assert.match(css, /\.gpt-empty \{ display: flex; flex: 1 0 auto; flex-direction: column; \}/);
  assert.match(css, /\.gpt-hello \{ margin-block: auto; \}/);
  assert.match(css, /\.gpt-kicker \{ max-width: 34em; margin: 0 0 8px; font-size: 14px; line-height: 20px; font-weight: 600;/);
  // The keyboard leaves the kicker and the greeting.
  assert.match(css, /\.gpt-premium\[data-keyboard="open"\] :is\(\.gpt-meta, \.gpt-tasks, \.gpt-empty-links, \.gpt-entry-context\) \{ display: none; \}/);
});

test('§5.2: four tasks, maths first; a 2×2 grid of tiles on a phone, chips from 640px; each fills the composer and never sends', () => {
  const uz = strings('uz');
  const ru = strings('ru');
  assert.deepEqual(uz.chips.map((c) => c.label), ['Masalani yechish', 'Matn yozish', 'Mavzuni tushuntirish', 'Reja tuzish']);
  assert.deepEqual(ru.chips.map((c) => c.label), ['Решить задачу', 'Написать текст', 'Объяснить тему', 'Составить план']);
  assert.equal(uz.chips[0].insert, 'Masalani qadamma-qadam yech: ');
  const picked: string[] = [];
  const html = renderToStaticMarkup(React.createElement(AiPromptChips, { chips: uz.chips, onPick: (c) => picked.push(c.id), label: uz.emptyPrompt }));
  assert.match(html, /^<ul class="gpt-tasks" aria-label="Nima qilmoqchisiz\?">/);
  assert.equal((html.match(/<button type="button" class="gpt-task">/g) ?? []).length, 4);
  assert.equal(picked.length, 0);
  assert.match(css, /\.gpt-tasks \{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px;/);
  // A 2-line tile is 58px (2 x 20 + 16 + 2), the frame's tile too, so the greeting stays when the chat mounts.
  assert.match(css, /\.gpt-task \{ align-items: center; gap: 10px; width: 100%; height: 100%; min-height: 58px; padding: 8px 12px;/);
  // Chips from 720px, where four fit one row of the 680px column (RU «Объяснить тему» included); the frame's outlines match them.
  assert.match(css, /@media \(min-width: 720px\) \{\s*\.gpt-tasks \{ display: flex; flex-wrap: wrap; gap: 6px; \}\s*\.gpt-task \{ height: 44px; min-height: 44px; gap: 6px; padding: 0 11px 0 9px;/);
  assert.match(css, /@media \(min-width: 720px\) \{ \.gpt-shell-tasks \.gpt-task \{ width: var\(--w, 160px\); \} \}/);
  assert.match(chat, /const onChipPick = \(chip: PromptChip\) => \{\s*if \(busy \|\| limitBlocked\) return;\s*setInput\(chip\.insert\);/);
});

test('§5.3: one row; the send button stays bright when empty and focuses the field; a clock in a limit; the footnote on every screen', () => {
  for (const locale of LOCALES) {
    const t = strings(locale);
    const empty = input({}, locale);
    // Empty: not disabled, aria-disabled, the ready colour.
    assert.match(empty, /<button type="button" class="gpt-send-button" data-state="ready" aria-disabled="true" aria-label="[^"]+">/);
    assert.doesNotMatch(empty, /disabled=""/);
    // The footnote without the old brand prefix, the status line only when it says something.
    assert.ok(empty.includes(`<p class="gpt-input-footnote"><span data-testid="ai-input-microcopy">${t.inputMicrocopy} · <a href="${t.privacyHref}" data-testid="ai-input-privacy">${t.privacyLink}</a></span></p>`), locale);
    assert.doesNotMatch(empty, /gpt-input-identity|gpt-key-hint|Enter ↵|gpt-input-status/);
    // A limit: off, a clock, described by the card.
    const limited = input({ value: 'Savol', disabled: true, limited: true, describedBy: 'ai-limit-card' }, locale);
    assert.match(limited, /class="gpt-send-button" data-state="limit" disabled="" aria-label="[^"]+" aria-describedby="ai-limit-card"><svg[^>]*><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/);
    // Busy: stop.
    assert.match(input({ value: 'x', busy: true, onStop: () => {} }, locale), /class="gpt-send-button" data-state="stop"/);
  }
  const source = read('src/gpt-chat/components/AiChatInput.tsx');
  assert.match(source, /onClick=\{\(\) => \(empty \? inputRef\.current\?\.focus\(\) : onSend\(\)\)\}/);
  assert.match(source, /if \(value\) el\.style\.height = Math\.min\(el\.scrollHeight, 136\) \+ 'px';/);
  // The example question only where it fits on one line (420px and up).
  assert.match(chat, /const \[wide\] = useState\(\(\) => !!window\.matchMedia\?\.\("\(min-width: 420px\)"\)\.matches\);/);
  assert.match(chat, /placeholder=\{resting && wide \? t\.inputExample : undefined\}/);
  assert.match(css, /\.gpt-input-surface \{ align-items: flex-end; gap: 4px; min-height: 52px; padding: 3px 3px 3px 16px; border-radius: 26px;/);
  assert.match(css, /\.gpt-input-footnote \{ min-height: 32px; margin: 6px 4px 0; text-align: center; text-wrap: balance; font-size: 11\.5px;/);
  // The RU line is 3 lines up to 411px: the frame and the chat keep the same height.
  assert.match(css, /@media \(max-width: 411px\) \{ #gpt-chat-root\[data-locale="ru"\] \.gpt-input-footnote \{ min-height: 48px; \} \}/);
  assert.match(css, /@media \(max-width: 359px\) \{ \.gpt-input-wrap \.gpt-input-footnote \{ min-height: 48px; \} \}/);
});

test('§5.5: steps in circles, display formulas on a sheet with stacked fractions, the answer box and the check line; copy keeps a/b', () => {
  // A step heading gets its number in a circle; the token goes, the rest stays.
  assert.equal(renderMarkdown('### 1-qadam: Diskriminant'), '<h4 class="gpt-step-head"><span class="gpt-step">1</span><span>Diskriminant</span></h4>');
  assert.equal(renderMarkdown('## Шаг 2. Корни'), '<h3 class="gpt-step-head"><span class="gpt-step">2</span><span>Корни</span></h3>');
  assert.equal(renderMarkdown('### 3) **Tekshiruv**'), '<h4 class="gpt-step-head"><span class="gpt-step">3</span><span>Tekshiruv</span></h4>');
  assert.equal(renderMarkdown('### 1-qadam'), '<h4>1-qadam</h4>', 'a number alone stays a heading');
  // A numbered list counts in circles from its own first number.
  assert.equal(renderMarkdown('3. C'), '<ol class="list-decimal" start="3" style="counter-reset:step 2"><li>C</li></ol>');
  // Display maths: $$…$$, \[…\] over lines, a line of \(…\) alone; fractions two deep, indices lowered.
  const sheet = renderMarkdown('$$x_{1,2} = \\frac{4 \\pm \\sqrt{4}}{2}$$');
  assert.equal(seen(sheet), '<div class="gpt-math" tabindex="0"><div>x<sub>1,2</sub> = <span class="gpt-frac"><span>4 ± √4</span><span>2</span></span></div></div>');
  assert.equal(seen(renderMarkdown('\\[\na^{n} = 1\n\\]')), '<div class="gpt-math" tabindex="0"><div>a<sup>n</sup> = 1</div></div>');
  assert.equal(seen(renderMarkdown('\\(x_1 = 3, \\quad x_2 = 1\\)')), '<div class="gpt-math" tabindex="0"><div>x<sub>1</sub> = 3, \u2003 x<sub>2</sub> = 1</div></div>');
  assert.match(renderMarkdown('$$\\frac{1}{\\frac{2}{\\frac{3}{4}}}$$'), /1\/\(<span class="gpt-frac">/, 'deeper than two falls back to a/b');
  // Escaped first: a fraction cannot make a tag.
  const hostile = renderMarkdown('$$\\frac{<b>}{2}$$');
  assert.ok(seen(hostile).includes('<span class="gpt-frac"><span>&lt;b&gt;</span><span>2</span></span>'), hostile);
  assert.doesNotMatch(hostile, /<b>/);
  // Inline maths in a sentence stays flat.
  assert.equal(renderMarkdown('Bu \\(\\frac{1}{2}\\) ga teng'), '<p class="mb-2 last:mb-0">Bu 1/2 ga teng</p>');
  // An answer still arriving may end inside a formula: what came so far is drawn.
  assert.equal(renderMarkdown('Hisob:\n$$x = 1', undefined, true), '<p class="mb-2 last:mb-0">Hisob:</p>\n<div class="gpt-math" tabindex="0"><div>x = 1</div></div>');
  // The answer box and the check line, bold or not, in both languages.
  assert.equal(renderMarkdown('**Javob:** x = 3'), '<div class="gpt-result"><span class="gpt-result-label">Javob</span><span class="gpt-result-value">x = 3</span></div>');
  assert.equal(renderMarkdown('✅ **Ответ: x_1 = 3**'), '<div class="gpt-result"><span class="gpt-result-label">Ответ</span><span class="gpt-result-value"><strong>x<sub>1</sub> = 3</strong></span></div>');
  assert.equal(renderMarkdown('Tekshirish: 3 + 1 = 4'), '<p class="gpt-check-line"><span>Tekshirish: 3 + 1 = 4</span></p>');
  assert.equal(renderMarkdown('Проверка: ок'), '<p class="gpt-check-line"><span>Проверка: ок</span></p>');
  assert.equal(renderMarkdown('Javoblar: bir'), '<p class="mb-2 last:mb-0">Javoblar: bir</p>');
  // Copy and Telegram keep plain text: a/b, no sheet.
  assert.equal(plainText('$$x = \\frac{1}{2}$$'), 'x = 1/2');
  assert.equal(latexLite('\\frac{a}{b}'), 'a/b');
  // The look: one tinted fill (mint, not the allowance's amber), circles from the counter.
  assert.match(css, /\.gpt-result \{ display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 16px 0 12px; padding: 12px 14px; border-radius: 12px; background: var\(--accent-soft\); border: 1px solid var\(--accent-line\); \}/);
  assert.match(css, /\.gpt-answer-body > ol > li::before \{ content: counter\(step\);/);
  assert.match(css, /\.gpt-math \{ --sheet: var\(--math\); position: relative; padding: 10px 14px; white-space: nowrap; font-size: 17px; line-height: 28px;/);
});

test('§5.5: the check line and a step heading are one text block beside the tick or the circle, bold, italic and code inside', () => {
  // Every run of text and every <strong>, <em>, <code> was a flex item of its own: columns side by side.
  const check = renderMarkdown('Tekshirish: x = **3** bo‘lsa, 3² − 4·3 + 3 = 0, ya’ni *tenglik* `to‘g‘ri`');
  assert.match(check, /^<p class="gpt-check-line"><span>[^]*<\/span><\/p>$/);
  assert.equal((check.match(/<span>/g) ?? []).length, 1, 'exactly one child block');
  assert.ok(check.includes('<strong>3</strong>') && check.includes('<em>tenglik</em>') && check.includes('<code '), check);
  // A multi-line «Tekshirish:» keeps its line break inside the one block.
  assert.equal(renderMarkdown('**Tekshirish:**\n9 − 12 + 3 = 0'), '<p class="gpt-check-line"><span><strong>Tekshirish:</strong><br>9 − 12 + 3 = 0</span></p>');
  // (A heading is bold already: its ** go.)
  const head = renderMarkdown('### 2-qadam. `D` ni **hisoblaymiz** *tez*');
  assert.match(head, /^<h4 class="gpt-step-head"><span class="gpt-step">2<\/span><span><code [^>]*>D<\/code> ni hisoblaymiz <em>tez<\/em><\/span><\/h4>$/);
  assert.match(css, /\.gpt-check-line > span, \.gpt-step-head > span:last-child \{ flex: 1; min-width: 0; \}/);
});

test('§5.5: the answer box holds its own line\'s short value; the rest of the paragraph is text, and a letter is no box', () => {
  assert.equal(renderMarkdown('Javob: x = 5\nizoh'),
    '<div class="gpt-result"><span class="gpt-result-label">Javob</span><span class="gpt-result-value">x = 5</span></div>\n<p class="mb-2 last:mb-0">izoh</p>');
  // «**Javob:**» alone on its line: the next line is the value, never a box that starts with a break.
  assert.equal(renderMarkdown('**Javob:**\nx = 3'), '<div class="gpt-result"><span class="gpt-result-label">Javob</span><span class="gpt-result-value">x = 3</span></div>');
  assert.equal(renderMarkdown('**Javob:** x = 3\n**Tekshirish:** 9 - 12 + 3 = 0'),
    '<div class="gpt-result"><span class="gpt-result-label">Javob</span><span class="gpt-result-value">x = 3</span></div>\n<p class="gpt-check-line"><span><strong>Tekshirish:</strong> 9 - 12 + 3 = 0</span></p>');
  // A paragraph that only goes on to the answer: the box still comes.
  assert.match(renderMarkdown('Demak, ildizlar topildi.\n**Javob:** x = 3'), /^<p class="mb-2 last:mb-0">Demak, ildizlar topildi\.<\/p>\n<div class="gpt-result">/);
  // A letter that starts with «Ответ:» stays a letter.
  const letter = renderMarkdown('Ответ: Здравствуйте, Анна! Спасибо за ваше письмо и за то, что написали нам так подробно.\nМы рассмотрели ваш вопрос и готовы помочь.');
  assert.doesNotMatch(letter, /gpt-result/);
  assert.doesNotMatch(renderMarkdown('Ответ: Здравствуйте, Анна!\nСпасибо за письмо.'), /gpt-result/);
  assert.match(renderMarkdown('Javob: Toshkent'), /gpt-result-value">Toshkent</);
});

test('§5.5: an unclosed $$ or \\[ is a formula only while the answer arrives; a finished answer keeps its structure', () => {
  const claim = '$$\nx = 1\n\n## Keyingi bo‘lim\n- band\n```js\ncode()\n```';
  const done = renderMarkdown(claim);
  assert.doesNotMatch(done, /gpt-math/);
  assert.match(done, /<h3>Keyingi bo‘lim<\/h3>\n<ul class="list-disc"><li>band<\/li><\/ul>\n<pre class="gpt-code" tabindex="0"><code>code\(\)<\/code><\/pre>/);
  assert.equal(renderMarkdown('\\[ izoh\nmatn'), '<p class="mb-2 last:mb-0"> izoh<br>matn</p>');
  assert.equal(renderMarkdown('\\[ izoh\nmatn', undefined, true), '<div class="gpt-math" tabindex="0"><div>izoh</div><div>matn</div></div>');
  // Mid-stream, an opener with a blank line, a heading or a list after it was never a formula either.
  assert.doesNotMatch(renderMarkdown(claim, undefined, true), /gpt-math/);
  // A one-character typo (a single $ as the closer) in a finished answer: a paragraph, the box, the check line (production rendered text).
  const typo = renderMarkdown('Diskriminant:\n$$D = b^2 - 4ac$\nDemak, D = 4.\n\n**Javob:** x = 3, x = 1\n\nTekshirish: 9 - 12 + 3 = 0');
  assert.doesNotMatch(typo, /gpt-math/);
  assert.match(typo, /^<p class="mb-2 last:mb-0">Diskriminant:<br>D = b² - 4ac\$<br>Demak, D = 4\.<\/p>\n<div class="gpt-result">[^\n]*x = 3, x = 1<\/span><\/div>\n<p class="gpt-check-line">/);
  // The answer body parses with the flag while it arrives, once more when it ends.
  assert.match(read('src/gpt-chat/components/AiAnswer.tsx'), /__html: renderMarkdown\(content, s\.copy, streaming\),/);
  assert.match(read('src/gpt-chat/components/AiChatMessageList.tsx'), /<AnswerBody content=\{m\.content\} locale=\{locale\} streaming=\{!!m\.streaming\} \/>/);
});

test('§5.5: fractions whose parts have braced powers and indices are drawn; ^{2n} is a power, not «²n}»', () => {
  const top = (html: string) => seen(html).match(/<span class="gpt-frac"><span>(.*?)<\/span><span>/)?.[1];
  assert.equal(top(renderMarkdown('$$\\frac{x^{2}+1}{2}$$')), 'x²+1');
  assert.equal(top(renderMarkdown('$$S = \\frac{a_{1} + a_{n}}{2} \\cdot n$$')), 'a<sub>1</sub> + a<sub>n</sub>');
  assert.equal(latexLite('\\(\\frac{x^{2}}{3}\\)'), 'x²/3');
  assert.equal(latexLite('\\sqrt{x^{2}+1}'), '√(x²+1)');
  assert.equal(latexLite('S = \\frac{a_{1} + a_{n}}{2}'), 'S = (a_1 + a_n)/2');
  for (const formula of ['$$\\frac{x^{2}+1}{2}$$', '$$S = \\frac{a_{1} + a_{n}}{2} \\cdot n$$', '$$x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}$$', 'Bu \\(\\frac{x^{2}}{3}\\) ga teng']) {
    assert.doesNotMatch(renderMarkdown(formula), /\\frac|\\sqrt|\^\{|_\{/, formula);
  }
  // ^2 and ^{2} fold to ², a longer power stays one.
  const cases: Array<[string, string, string]> = [
    ['a^{2n}', 'a<sup>2n</sup>', 'a^(2n)'], ['x^{3k}', 'x<sup>3k</sup>', 'x^(3k)'], ['x^{2}', 'x²', 'x²'],
    ['x^2', 'x²', 'x²'], ['x^{23}', 'x<sup>23</sup>', 'x^(23)'], ['x^2y', 'x²y', 'x²y'],
  ];
  for (const [tex, html, text] of cases) {
    assert.equal(seen(mathHtml(tex)), html, tex);
    assert.equal(latexLite(tex), text, tex);
  }
  assert.doesNotMatch(renderMarkdown('$$a^{2n} + x_1 = \\frac{3}{4}$$'), /²n\}/);
});

test('§5.5: a drawn formula says its linear form to a screen reader: (a)/(b), ^, _', () => {
  const sheet = renderMarkdown('$$a^{2n} + x_1 = \\frac{3}{4}$$');
  assert.equal(spoken(sheet), 'a^(2n) + x_1 = 3/4');
  assert.equal(spoken(renderMarkdown('$$x = \\frac{-b \\pm \\sqrt{D}}{2a}$$')), 'x = (-b ± √D)/2a');
  // The linear text is ours, never the model's: only fixed sr-only spans.
  for (const span of sheet.match(/<span class="sr-only">[^<]*<\/span>/g) ?? []) assert.match(span, /^<span class="sr-only">[()^_/]+<\/span>$/);
  // The sheet is the positioned box of those spans, so they never widen the thread.
  assert.match(css, /\.gpt-math \{ --sheet: var\(--math\); position: relative;/);
});

test('§5.6: the model line above the row; on a phone «⋯» opens the paid follow-ups under a caption that says what they cost', () => {
  const list = read('src/gpt-chat/components/AiChatMessageList.tsx');
  assert.ok(list.indexOf('{t.answeredBy}: {modelLabel(m.model)}') < list.indexOf('<MessageActions'), 'model line first');
  assert.match(list, /<div className="gpt-answer-head">\s*<BrandMark \/>\{t\.brand\}\s*<\/div>/);
  assert.deepEqual([answerStrings('uz').menuCost, answerStrings('ru').menuCost], ['Har biri 1 ta xabar sarflaydi', 'Каждый пункт тратит 1 сообщение']);
  const answer = read('src/gpt-chat/components/AiAnswer.tsx');
  assert.match(answer, /<div key="menu" ref=\{menuRef\} className="gpt-action-menu" data-below=\{below \|\| undefined\} onClick=\{\(\) => setOpen\(false\)\}>\s*<p className="gpt-menu-cost">\{s\.menuCost\}<\/p>/);
  // The menu flips below when above would cross the top of the thread.
  assert.match(answer, /const edge = rowRef\.current\?\.closest\("\.gpt-viewport"\)\?\.getBoundingClientRect\(\)\.top \?\? 0;\s*setBelow\(top < edge\);/);
  // Its item draws outside its own box: content-visibility (paint containment) would clip the menu.
  assert.match(list, /className=\{i === lastAssistant \? "gpt-item-menu" : undefined\}/);
  assert.match(css, /\.gpt-message-content > \[data-slot="message-scroller-item"\]\.gpt-item-menu \{ content-visibility: visible; \}/);
  assert.match(read('src/components/ui/message-scroller.tsx'), /\[content-visibility:auto\]/, 'every other item keeps the saving');
  // «Nusxalandi» for 2 s.
  assert.match(answer, /if \(copyStatus !== "done"\) return;\s*const timer = window\.setTimeout\(\(\) => setCopyStatus\("idle"\), 2_000\);/);
});

test('§5.10: the limit card ends the thread (or takes the tasks\' place), says the wait once, shows how much of the hour passed and that the question waits', () => {
  const NOW = Date.UTC(2026, 9, 6, 6, 15);
  const hourly = limitCard('uz', { reason: 'hourly', retryAt: NOW + 41 * 60_000, since: NOW, limits: { daily: 15, hourly: 5 } }, { billingAvailable: true, paid: false, botHandoff: false, remaining: 10 }, NOW);
  assert.equal(hourly.short, '41 daqiqadan keyin (soat 11:56 da)');
  // The header says the clock alone: it fits beside the language switch and «new chat» at 320px.
  assert.equal(hourly.header, 'Tanaffus 11:56 gacha');
  assert.equal(limitCard('ru', { reason: 'hourly', retryAt: NOW + 41 * 60_000, since: NOW, limits: { daily: 15, hourly: 5 } }, { billingAvailable: false, paid: false, botHandoff: false, remaining: 10 }, NOW).header, 'Пауза до 11:56');
  const card = chat.slice(chat.indexOf('const limitCardEl = limit && card && ('), chat.indexOf('const showOffer ='));
  assert.match(card, /<p className="gpt-limit-short">/);
  assert.match(card, /<span className="sr-only">\{card\.title\} \{card\.body\} <\/span>/);
  // The one-line countdown is not announced on every minute's tick; its «ready» replacement is.
  assert.match(card, /<span key=\{card\.ready \? "ready" : "wait"\} aria-live=\{card\.ready \? undefined : "off"\}>\{card\.short\}<\/span>/);
  // The thread goes to the card through the scroller, which drops the refused question's spacer.
  assert.match(chat, /function LimitScroll\(\{ since, keyboard \}[^)]*\) \{\s*const \{ scrollToEnd \} = useMessageScroller\(\);\s*useEffect\(\(\) => \{\s*if \(since !== null\) scrollToEnd\(\{ behavior: smooth\(\) \}\);\s*\}, \[since, keyboard, scrollToEnd\]\);/);
  assert.match(chat, /<LimitScroll since=\{resting \? null : limitSince\} keyboard=\{keyboard\} \/>/);
  assert.doesNotMatch(chat, /viewport\?\.scrollTo\(\{ top: viewport\.scrollHeight/);
  assert.match(card, /\{card\.wait \?\? card\.body\}\s*\{moreButton\}/);
  assert.match(card, /<span className="gpt-limit-progress" aria-hidden="true"><span style=\{\{ transform: `scaleX\(\$\{waited\}\)` \}\} \/><\/span>/);
  assert.match(card, /\{!!input\.trim\(\) && \(\s*<p className="gpt-limit-draft">/);
  assert.match(chat, /\(clock - limit\.since\) \/ \(limit\.retryAt - limit\.since\)/);
  // In the thread, inside the scroller's content, never in the composer's dock.
  const dock = chat.slice(chat.indexOf('<div className="gpt-composer">'));
  assert.doesNotMatch(dock, /limitCardEl|gpt-limit-card|lowWarning|hourWarning/);
  assert.match(chat, /\{limitCardEl\}\s*<\/AiChatMessageList>/);
  assert.match(read('src/gpt-chat/components/AiChatMessageList.tsx'), /\{children\}\s*<\/MessageScrollerContent>/);
  // Amber means only the free allowance.
  assert.match(css, /\.gpt-limit-card \{ margin: 16px 0 4px; padding: 16px; border-radius: 16px; background: var\(--warn-bg\); border: 1px solid var\(--warn-line\);/);
});

test('REV-13 and §4.3: with the keyboard open (or 460px of height) the card is one line, and a screen reader still hears why', () => {
  assert.match(css, /\.gpt-premium:not\(\[data-keyboard="open"\]\) \.gpt-limit-card \.gpt-limit-short, \.gpt-premium\[data-keyboard="open"\] \.gpt-limit-card \.gpt-limit-full \{ display: none; \}/);
  assert.match(css, /@media \(max-height: 460px\) \{\s*\.gpt-premium\[data-state\] \.gpt-limit-card \.gpt-limit-short \{ display: flex; \}\s*\.gpt-premium\[data-state\] \.gpt-limit-card \.gpt-limit-full \{ display: none; \}/);
  const keyboard = read('src/gpt-chat/keyboard.ts');
  assert.match(keyboard, /document\.activeElement === inputRef\.current\s*&& window\.matchMedia\('\(pointer: coarse\)'\)\.matches && visible < tallest \* 0\.84/);
  // iOS: the app takes the visible height while the keyboard is open, and gives it back.
  assert.match(keyboard, /main\.style\.height = `\$\{visible\}px`;\s*window\.scrollTo\(0, 0\);/);
  assert.match(keyboard, /if \(main\) main\.style\.height = height;/);
  // A pinch-zoom shrinks the visual viewport too: the height is read unscaled, and a zoomed page is left alone.
  assert.match(keyboard, /const scale = view\?\.scale \?\? 1;\s*const zoomed = scale > 1\.01;\s*const visible = view \? view\.height \* scale : window\.innerHeight;/);
  assert.match(keyboard, /if \(!zoomed\) tallest = Math\.max\(tallest, visible\);/);
  assert.match(keyboard, /if \(!main \|\| zoomed\) return;/);
});

test('§5.12: the chatgpt.com line and the disclaimer live in the menu; the drawer has the mark', () => {
  const sidebar = read('src/gpt-chat/components/AiSidebar.tsx');
  assert.match(sidebar, /<p className="gpt-official" data-testid="gpt-official">\s*\{t\.premium\.officialLead\}\s*<a\s+href="https:\/\/chatgpt\.com\/"\s+target="_blank"\s+rel="noopener noreferrer"\s+onClick=\{onOfficial\}/);
  assert.match(sidebar, /<p className="gpt-disclaimer">\{t\.disclaimer\}<\/p>/);
  assert.match(sidebar, /<BrandMark className="gpt-brand-mark-lg" \/>/);
  assert.match(sidebar, /<a href="#seo-summary" onClick=\{onAbout\} className=\{LINK\}>\s*\{t\.aboutChat\}/);
  assert.match(css, /\.gpt-disclaimer \{[^}]*font-size: 12px; line-height: 18px;/);
  assert.match(css, /\[data-slot="dialog-content"\]\.gpt-sidebar-dialog \{ top: 0; left: 0; transform: none; translate: none; max-width: none; width: min\(300px,85vw\);/);
});

test('REV-5: a swipe on the header or the composer does not slide the page; the text under the chat is a link away', () => {
  assert.match(css, /html:has\(\.gpt-premium\) \{ overscroll-behavior-y: none; scroll-padding-bottom: 0; \}/);
  assert.match(css, /\.gpt-header, \.gpt-composer \{[^}]*touch-action: none; touch-action: pinch-zoom; \}/);
  assert.match(css, /\.gpt-composer textarea \{ touch-action: pan-y; touch-action: pan-y pinch-zoom; \}/);
  assert.match(chat, /<a href="#seo-summary" onClick=\{toSummary\}>\{t\.aboutChat\}<\/a>/);
  assert.match(chat, /setDrawerOpen\(false\);\s*window\.setTimeout\(\(\) => summary\.scrollIntoView\(\{ behavior: smooth\(\) \}\), 60\);/);
  assert.match(chat, /const smooth = \(\): ScrollBehavior => \(typeof window !== "undefined" && window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"\);/);
  // The jump to the latest message too: a smooth behaviour passed in script is not undone by CSS.
  assert.match(chat, /<MessageScrollerButton behavior=\{smooth\(\)\} className="gpt-jump-latest"/);
  assert.equal(strings('uz').aboutChat, 'Batafsil: chat haqida ↓');
  assert.equal(strings('ru').aboutChat, 'Подробнее о чате ↓');
});

test('REV-6: # and ## are sections, ### their parts; a code block carries its own copy button, labelled by us', () => {
  assert.equal(renderMarkdown('# Bir\n## Ikki\n### Uch\n#### To‘rt'), '<h3>Bir</h3>\n<h3>Ikki</h3>\n<h4>Uch</h4>\n<h4>To‘rt</h4>');
  assert.equal(renderMarkdown('```\nx < 1\n```'), '<pre class="gpt-code" tabindex="0"><code>x &lt; 1</code></pre>');
  assert.equal(renderMarkdown('```\nx < 1\n```', 'Nusxalash'),
    '<div class="gpt-code-wrap"><pre class="gpt-code" tabindex="0"><code>x &lt; 1</code></pre><button type="button" class="gpt-code-copy" data-copy-code>Nusxalash</button></div>');
  assert.doesNotMatch(renderMarkdown('<button data-copy-code>x</button>', 'Nusxalash'), /<button/);
  const answer = read('src/gpt-chat/components/AiAnswer.tsx');
  assert.match(answer, /const button = \(event\.target as HTMLElement\)\.closest\?\.\("\[data-copy-code\]"\);/);
  assert.match(css, /\.gpt-math, \.gpt-code, \.gpt-table-scroll \{[^}]*linear-gradient\(to right, var\(--sheet\) 30%, #0000\) left \/ 24px 100% no-repeat local,/);
});

test('REV-8 and REV-9: 44px targets; the pack window is a bottom sheet on a phone, its consent and button stay in sight', () => {
  assert.match(css, /\.gpt-header-button \{ min-width: 44px; height: 44px;/);
  assert.match(account, /\.gpt-icon-button \{ width: 44px; height: 44px; min-width: 44px; min-height: 44px;/);
  // The pack pill keeps 44px when its label is hidden (under 390px).
  assert.match(css, /\.gpt-account-trigger \{ display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; min-width: 44px; min-height: 44px;/);
  assert.match(account, /\.gpt-check input \{ flex-shrink: 0; width: 24px; height: 24px;/);
  assert.match(css, /\.gpt-input-footnote a \{ position: relative; display: inline-block; padding: 12px 2px; margin: -12px 0;/);
  assert.match(account, /@media \(max-width: 700px\) \{\s*\[data-slot="dialog-content"\]\.gpt-account-dialog \{ top: auto; bottom: 0; left: 0; transform: none; translate: none; width: 100%;/);
  // The pack window's card text is the chat's, not the site's near-black --card-foreground (the price was 1.05:1).
  assert.match(css, /--card: var\(--surface\); --card-foreground: var\(--text\);/);
  assert.match(css, /--accent-foreground: var\(--accent-ink\); --destructive: var\(--danger-text\);/);
  assert.match(account, /\.gpt-account-dialog \.gpt-plan-card \{[^}]*color: var\(--text\); \}/);
  const window = read('src/gpt-chat/account/AccountDialog.tsx');
  assert.equal((window.match(/<div className="gpt-sticky-action">/g) ?? []).length, 2, 'the pay step and the sign-in');
  assert.match(account, /\.gpt-account-dialog \.gpt-sticky-action \{ position: sticky; bottom: -28px;/);
  assert.match(account, /\.gpt-account-dialog \.gpt-sticky-action:has\(\.gpt-bot-login\) \{ position: static;/);
  assert.match(read('src/gpt-chat/components/AiSidebar.tsx'), /<LazyPart part=\{rolePart\} fallback=\{<div className="h-\[92px\]" \/>\} failed=\{null\}>/);
});

test('REV-10: no dvh without a vh before it; a restored thread hides until it has scrolled; the top safe area is the header\'s', () => {
  for (const sheet of [css, account, article]) {
    for (const rule of sheet.matchAll(/[^{}]*\{[^{}]*\b100dvh\b[^{}]*\}/g)) {
      const body = rule[0].slice(rule[0].indexOf('{'));
      assert.ok(/100vh/.test(body), `${rule[0].trim().slice(0, 60)}: a fallback`);
    }
  }
  assert.match(css, /\.gpt-viewport\[data-pending-scroll\] \{ visibility: hidden; \}/);
  assert.match(css, /\.gpt-header \{ align-items: center; gap: 2px; height: calc\(52px \+ env\(safe-area-inset-top\)\); padding: env\(safe-area-inset-top\) 6px 0;/);
});

test('§6: the chat\'s stylesheet is its own: no other page loads it; the article under the app is styled by #seo-summary only', () => {
  assert.doesNotMatch(read('src/index.css'), /premium\.css/);
  assert.match(read('src/gpt-chat/main.tsx'), /import '\.\/premium\.css';\s*import '\.\/account\/account\.css';\s*import '\.\/article\.css';/);
  // The legacy console primitives of the site sheet are gone with the old chat.
  assert.doesNotMatch(read('src/index.css'), /neural-typing|neural-grid|status-dot|scan-active|\.msg-in/);
  for (const rule of article.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selectors = rule[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!selectors || selectors.startsWith('@')) continue;
    for (const selector of selectors.split(/,(?![^(]*\))/)) assert.match(selector.trim(), /^#seo-summary/, selector);
  }
  // The FAQ's «+» stays in the HTML; the chevron is drawn over it.
  assert.match(article, /#seo-summary \.faq-item summary > span \{[^}]*font-size: 0; color: transparent;/);
  // The sizes the spec holds premium.css to.
  assert.ok(Buffer.byteLength(css) <= 30_000, `premium.css ${Buffer.byteLength(css)} B`);
});

test('§5.13: the prerendered frame is the resting screen\'s geometry and adds no text', { skip: !built && 'no dist/ build present' }, () => {
  for (const [url, loading] of [['/uz/gpt-uzbek-tilida/', 'AI-chat yuklanmoqda…'], ['/ru/gpt-chat/', 'AI-чат загружается…']] as const) {
    const html = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8');
    const root = html.slice(html.indexOf('<div id="gpt-chat-root"'), html.indexOf('</main>'));
    assert.match(root, /<div class="gpt-premium gpt-app gpt-shell" data-state="empty" style="color-scheme:dark">/);
    for (const cls of ['gpt-header gpt-shell-header', 'gpt-thread-scroll', 'gpt-viewport', 'gpt-column', 'gpt-empty', 'gpt-hello', 'gpt-greet gpt-shell-greet', 'gpt-tasks gpt-shell-tasks', 'gpt-composer', 'gpt-input-surface gpt-shell-input', 'gpt-input-footnote gpt-shell-footnote']) {
      assert.ok(root.includes(`class="${cls}`), `${url}: ${cls}`);
    }
    // Four task outlines, each as wide as its chip from 720px (--w), the grid's below.
    assert.equal((root.match(/<li class="gpt-task" style="--w:\d{3}px"><\/li>/g) ?? []).length, 4);
    // The mount point's text: the H1, the no-JavaScript line and the loading line, as before.
    const text = root.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const h1 = root.match(/<h1 data-testid="page-h1" class="gpt-kicker">([^<]*)<\/h1>/)?.[1] ?? '';
    const noscript = root.match(/<noscript><p class="gpt-meta">([^<]*)<\/p><\/noscript>/)?.[1] ?? '';
    assert.ok(h1 && noscript, url);
    assert.equal(text, `${h1} ${noscript} ${loading}`, `${url}: the frame adds no words`);
    assert.match(html, /<section id="seo-summary" data-testid="seo-summary"/);
  }
  // The brand, its subtitle and the greeting are drawn by the stylesheet, with the copy's own words.
  for (const locale of LOCALES) {
    const t = strings(locale);
    assert.ok(css.includes(`#gpt-chat-root[data-locale="${locale}"] .gpt-shell-brand::after { content: "${t.brandSub}"; }`), locale);
    assert.ok(css.includes(` #gpt-chat-root[data-locale="${locale}"] .gpt-shell-brand::after { content: "${t.brandSubShort}"; }`), `${locale} under 340px`);
    assert.ok(css.includes(`#gpt-chat-root[data-locale="${locale}"] .gpt-shell-greet::before { content: "${t.premium.welcome}\\A"; }`), locale);
    assert.ok(css.includes(`#gpt-chat-root[data-locale="${locale}"] .gpt-shell-greet::after { content: "${t.premium.welcomeAccent}\\00a0"; }`), locale);
  }
  // The frame paints first, then the chat mounts.
  const main = read('src/gpt-chat/main.tsx');
  assert.match(main, /requestAnimationFrame\(\(\) => setTimeout\(go, 0\)\);\s*setTimeout\(go, 200\);/);
  assert.doesNotMatch(main, /innerHTML/);
});

test('§3, REV-4: only the chat pages get resizes-content, the site\'s theme colour, their stylesheet and the start chunks preloaded', { skip: !built && 'no dist/ build present' }, () => {
  const manifest = readViteManifest(DIST);
  const preloads = entryImports(manifest, ENTRIES.chat);
  const styles = entryStyles(manifest, ENTRIES.chat);
  assert.equal(styles.length, 1);
  assert.match(styles[0], /^\/assets\/gpt-chat-[\w-]+\.css$/);
  assert.ok(preloads.length >= 3 && preloads.every((href) => /^\/assets\/[\w.-]+\.js$/.test(href) && fs.existsSync(path.join(DIST, href.slice(1)))));
  for (const url of ['/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/']) {
    const head = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8').split('</head>')[0];
    assert.match(head, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover, interactive-widget=resizes-content" \/>/);
    assert.match(head, /<meta name="theme-color" content="#05070D" \/>/);
    assert.deepEqual([...head.matchAll(/<link rel="modulepreload" href="([^"]+)" \/>/g)].map((m) => m[1]), preloads);
    const sheets = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>/g)].map((m) => m[1]);
    assert.equal(sheets.length, 2);
    assert.match(sheets[0], /^\/assets\/index-[\w-]+\.css$/);
    assert.equal(sheets[1], styles[0], 'after the site sheet');
  }
  for (const url of ['/', '/uz/blog/chatgptga-qanday-kirish-mumkin/', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/']) {
    const head = fs.readFileSync(path.join(DIST, url.slice(1), 'index.html'), 'utf8').split('</head>')[0];
    assert.doesNotMatch(head, /interactive-widget|gpt-chat-[\w-]+\.css/, url);
    if (url !== '/') assert.doesNotMatch(head, /modulepreload/, url);
  }
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
  for (const bad of [
    { versions: [{ content: 'a' }], version: 0 },
    { versions: [{ content: 'a' }, { content: 'b' }, { content: 'c' }, { content: 'd' }], version: 0 },
    { versions: [{ content: 'a' }, { content: 'b' }], version: 2 },
  ]) {
    values.set('gptchat_history_uz', JSON.stringify([{ role: 'assistant', content: 'a', ...bad }]));
    const [m] = loadHistory('uz');
    assert.equal(m.versions, undefined, JSON.stringify(bad));
  }
});
