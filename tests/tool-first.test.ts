import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { Page } from '../src/shared/types';
import { isConverterFirstPage, isToolFirstPage, isTranslatorFirstPage, renderToolFirst } from '../scripts/tool-first';
import { renderUzTranslitBlock } from '../scripts/translator-page';

const readPage = (locale: string, slug: string): Page => JSON.parse(fs.readFileSync(`content/pages/${locale}/${slug}.json`, 'utf8'));
const pilots = [readPage('uz', 'kirill-lotin'), readPage('ru', 'kirillica-v-latinicu')];
const translators = [readPage('uz', 'rus-ozbek-tarjimon'), readPage('ru', 'russko-uzbekskiy-perevodchik')];
const read = (file: string) => fs.readFileSync(file, 'utf8');

test('only the four existing converter/translator URLs opt in, with their exact locale, role and widget', () => {
  const optedIn: string[] = [];
  for (const locale of ['ru', 'uz']) {
    for (const name of fs.readdirSync(`content/pages/${locale}`).filter((n) => n.endsWith('.json'))) {
      const page = readPage(locale, name.slice(0, -5));
      if (isToolFirstPage(page)) optedIn.push(page.url);
      else assert.equal(renderToolFirst(page), '', page.url);
    }
  }
  assert.deepEqual(optedIn.sort(), [...pilots, ...translators].map((p) => p.url).sort());
  for (const page of pilots) {
    for (const changed of [
      { ...page, locale: page.locale === 'uz' ? 'ru' : 'uz' },
      { ...page, pageType: 'money' },
      { ...page, chatRole: 'translator' },
      { ...page, widgets: ['calculator'] },
      { ...page, widgets: ['uz-translit', 'calculator'] },
      { ...page, url: `${page.url}?pilot=1` },
    ]) assert.equal(renderToolFirst(changed as Page), '', JSON.stringify(changed.url));
  }
});

test('the pilot has exactly one visible original H1, existing controls, local limits and a distinct chat target', () => {
  for (const page of pilots) {
    const html = renderToolFirst(page);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /<h1 id="tool-first-title" data-testid="page-h1">/);
    assert.ok(html.includes(page.h1));
    assert.ok(html.indexOf('<h1') < html.indexOf('id="uzt-in"'));
    assert.match(html, /aria-labelledby="tool-first-title"/);
    assert.match(html, /href="#main"/);
    for (const action of ['latin', 'cyrillic', 'normalize', 'copy', 'ai']) {
      assert.equal((html.match(new RegExp(`<button[^>]*data-uzt="${action}"`, 'g')) || []).length, 1);
    }
    assert.match(html, /maxlength="20000"/);
    assert.match(html, /<textarea id="uzt-out"[^>]*readonly/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.match(html, /милиция → militsiya → милитсия/);
    assert.match(html, /район → rayon → раён/);
    assert.doesNotMatch(html, /<script|fetch\(|localStorage|sessionStorage/);
    assert.doesNotMatch(html, /chat maydonida.*yuqoridagi|поле чата выше/);
  }
});

test('moving the converter does not affect the default translator block or source-page metadata', () => {
  for (const page of pilots) {
    const before = JSON.stringify(page);
    const normal = renderUzTranslitBlock(page);
    renderToolFirst(page);
    assert.equal(JSON.stringify(page), before);
    assert.match(normal, /<h2 id="uzt-heading">/);
    assert.doesNotMatch(normal, /id="tool-first"|data-tool-first|<h1/);
    assert.equal(renderUzTranslitBlock(page, { first: false }), normal);
  }
  for (const page of translators) {
    assert.equal(isConverterFirstPage(page), false);
    assert.equal(isTranslatorFirstPage(page), true);
    assert.match(renderToolFirst(page), /data-translation-task/);
    assert.doesNotMatch(renderToolFirst(page), /data-uz-translit/);
    assert.match(renderUzTranslitBlock(page), /<h2 id="uzt-heading">/);
  }
});

test('the H1 remains escaped and the tool frame is an isolated stylesheet, with no shared entry', () => {
  const html = renderToolFirst({ ...pilots[0], h1: '<img src=x onerror=alert(1)> & "text"' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;text&quot;/);
  assert.match(html, /#tool-first #kirill-lotin textarea/);
  const prerender = read('scripts/prerender.ts');
  assert.match(prerender, /const firstTool = renderToolFirst\(page\)/);
  assert.match(prerender, /data-h1="\$\{firstTool \? '' : escapeHtml\(page.h1\)\}/);
  assert.match(prerender, /isToolFirstPage\(page\) \? '#tool-first' : '#main'/);
});

test('fresh built pages: one early H1 and converter, no duplicate main and unchanged metadata', { skip: process.env.TOOL_FIRST_BUILT !== '1' && 'run TOOL_FIRST_BUILT=1 after the integrated build' }, () => {
  for (const page of pilots) {
    const html = read(path.join('dist', page.url, 'index.html'));
    assert.equal((html.match(/<h1\b/g) || []).length, 1, page.url);
    assert.equal((html.match(/<main\b/g) || []).length, 1, page.url);
    assert.equal((html.match(/\bid="kirill-lotin"/g) || []).length, 1, page.url);
    assert.equal((html.match(/\bid="gpt-chat-root"/g) || []).length, 1, page.url);
    assert.ok(html.indexOf('<h1') < html.indexOf('id="uzt-in"'));
    assert.ok(html.indexOf('id="uzt-in"') < html.indexOf('id="gpt-chat-root"'));
    assert.match(html, /id="gpt-chat-root"[^>]*data-h1=""/);
    assert.match(html, /href="#tool-first"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://gptbot\\.uz${page.url}"`));
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.ok(html.includes(page.h1), `${page.url}: original H1`);
  }
  for (const page of translators) {
    const html = read(path.join('dist', page.url, 'index.html'));
    assert.equal((html.match(/<h1\b/g) || []).length, 1, page.url);
    assert.equal((html.match(/<main\b/g) || []).length, 1, page.url);
    assert.equal((html.match(/\bid="kirill-lotin"/g) || []).length, 1, page.url);
    assert.equal((html.match(/\bid="translation-task"/g) || []).length, 1, page.url);
    assert.ok(html.indexOf('id="translation-source"') < html.indexOf('id="gpt-chat-root"'));
    assert.ok(html.indexOf('id="gpt-chat-root"') < html.indexOf('id="kirill-lotin"'));
    assert.match(html, /id="gpt-chat-root"[^>]*data-h1=""/);
  }
  for (const url of ['/ru/gpt-chat/', '/uz/gpt-uzbek-tilida/', '/uz/notogri-fellar/', '/uz/kalkulyator/']) {
    assert.doesNotMatch(read(path.join('dist', url, 'index.html')), /data-tool-first|id="tool-main"/, url);
  }
});
