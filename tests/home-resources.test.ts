import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PromotionServices from '../src/components/PromotionServices';
import type { Lang } from '../src/i18n';

// Match the repository's other React output tests: tsx uses the classic JSX
// transform with the root test configuration, Vite uses the automatic one.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const ROOT = process.cwd();
const REQUIRED_ROUTES = [
  '/uz/gpt-uzbek-tilida/',
  '/ru/gpt-chat/',
  '/uz/gpt-chat-qollanma/',
  '/uz/blog/chatgptga-qanday-kirish-mumkin/',
  '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
  '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/',
  '/uz/blog/chatgpt-uzbek-tilida-promptlar/',
  '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/',
  '/ru/blog/chatgpt-i-claude-v-uzbekistane/',
  '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/',
  '/ru/kak-sdelat-ai-bota-telegram-instagram/',
  '/uz/instagram-target-yoqish/',
  '/uz/blog/kurs-ishi-yozish/',
  '/uz/blog/tushuntirish-xati-va-ariza-yozish/',
  '/uz/blog/biznes-reja-tuzish/',
];

const render = (lang: Lang) => renderToStaticMarkup(React.createElement(PromotionServices, { lang }));
const anchors = (html: string) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
  attributes: match[1],
  href: match[1].match(/\bhref="([^"]+)"/)?.[1],
  text: match[2].replace(/<[^>]*>/g, '').trim(),
}));

test('both homepage languages render direct labelled links to priority chat, guide and traffic pages', () => {
  for (const lang of ['ru', 'uz'] as const) {
    const html = render(lang);
    const links = anchors(html);
    for (const href of REQUIRED_ROUTES) {
      const link = links.find((anchor) => anchor.href === href);
      assert.ok(link, `${lang}: no rendered anchor for ${href}`);
      assert.ok(link.text.length > 8, `${lang}: link needs a useful label: ${href}`);
      assert.doesNotMatch(link.attributes, /nofollow|aria-hidden|\bhidden\b/, href);
    }
    const resources = html.slice(html.indexOf('<section id="home-resources"'));
    assert.ok(resources.includes('home-resources-heading'));
    assert.equal(anchors(resources).length, 14, 'curated guide list, not the complete site directory');
    assert.doesNotMatch(resources, /<details\b|<h1\b|<script\b|\bhidden\b|display\s*:\s*none|sr-only/);
    for (const link of anchors(resources)) {
      assert.match(link.attributes, new RegExp(`hrefLang="${link.href!.split('/')[1]}"`, 'i'));
    }
  }
});

test('priority routes are published indexable documents with their own canonical', () => {
  for (const href of REQUIRED_ROUTES) {
    const [locale, segment, article] = href.split('/').filter(Boolean);
    const file = segment === 'blog'
      ? path.join(ROOT, 'content', 'blog', locale, `${article}.json`)
      : path.join(ROOT, 'content', 'pages', locale, `${segment}.json`);
    assert.ok(existsSync(file), `missing target ${href}`);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(doc.status, 'published', href);
    assert.equal(doc.robotsIndex, true, href);
    assert.equal(doc.robotsFollow, true, href);
    assert.equal(doc.url, href);
    assert.equal(new URL(doc.canonical, 'https://gptbot.uz').href, `https://gptbot.uz${href}`);
  }
});

test('the no-JavaScript homepage shell also exposes every priority route', { skip: !existsSync(path.join(ROOT, 'dist/index.html')) }, () => {
  const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  assert.match(html, /data-seo-shell="homepage"/);
  const links = new Set(anchors(html).map((anchor) => anchor.href));
  for (const href of REQUIRED_ROUTES) {
    assert.ok(links.has(href) || links.has(`https://gptbot.uz${href}`), `no raw HTML link to ${href}`);
  }
});

test('resource section stays in the existing below-fold homepage group without a new startup request', () => {
  const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  const promotion = readFileSync(path.join(ROOT, 'src/components/PromotionServices.tsx'), 'utf8');
  const resources = readFileSync(path.join(ROOT, 'src/components/HomeResources.tsx'), 'utf8');
  const placement = app.indexOf('<PromotionServices lang={lang} />');
  assert.ok(placement > app.indexOf('<Offer t={t} />'));
  assert.ok(placement < app.indexOf('</main>'));
  assert.match(promotion, /import HomeResources from '\.\/HomeResources'/);
  assert.match(promotion, /<HomeResources lang=\{lang\} \/>/);
  assert.doesNotMatch(resources, /\bfetch\s*\(|\buseEffect\s*\(|\blazy\s*\(|<img\b/);
});
