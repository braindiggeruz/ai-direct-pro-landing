// Paying for AI services from Uzbekistan, AI-visibility wave 2b (2026-11-23):
// /uz/blog/chatgpt-plus-tolov/ (standalone: the Russian ChatGPT payment guide is
// protected and keeps its hreflang set) and the uz/ru pair on Claude Pro,
// Google AI Pro and Midjourney.
//
// Run: node --import tsx --test tests/payment-cluster.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { BlogArticle } from '../src/shared/types';
import { CHAT_FACTS } from '../scripts/product-facts';

const ROOT = path.resolve(import.meta.dirname, '..');
const UZ_GPT = '/uz/blog/chatgpt-plus-tolov/';
const UZ_SUBS = '/uz/blog/ai-obunalarga-tolov/';
const RU_SUBS = '/ru/blog/oplata-ii-podpisok-iz-uzbekistana/';
const CLUSTER = [UZ_GPT, UZ_SUBS, RU_SUBS];

const articles = new Map<string, BlogArticle>();
for (const locale of ['ru', 'uz']) {
  const dir = path.join(ROOT, 'content/blog', locale);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as BlogArticle;
    articles.set(doc.url, doc);
  }
}
const article = (url: string): BlogArticle => {
  const doc = articles.get(url);
  assert.ok(doc, `${url}: content file`);
  return doc;
};
const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visible = (doc: BlogArticle): string => [
  doc.title, doc.description, doc.h1, ...texts(doc.body), ...(doc.faq ?? []).flatMap((f) => [f.q, f.a]),
].join('\n');
const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const sourceUrls = (doc: BlogArticle): string[] => (doc.sources ?? []).map((s) => s.url);

/** Every dollar figure the cluster may print, and the page that states it. */
const USD_FACTS: Readonly<Record<string, string>> = {
  20: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus',
  10: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans',
  30: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans',
  60: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans',
  120: 'https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans',
};
const CLAUDE_PRO = 'https://support.claude.com/en/articles/8325606-what-is-the-pro-plan';

test('three published articles: the Uzbek ChatGPT guide stands alone, the subscriptions guide is a reciprocal uz/ru pair', () => {
  const gpt = article(UZ_GPT);
  assert.equal(gpt.status, 'published');
  assert.equal(gpt.hreflangUz, UZ_GPT);
  assert.equal(gpt.hreflangRu ?? '', '', 'no hreflang to the protected Russian payment guide');
  for (const url of [UZ_SUBS, RU_SUBS]) {
    const doc = article(url);
    assert.equal(doc.status, 'published', url);
    assert.equal(doc.hreflangUz, UZ_SUBS, url);
    assert.equal(doc.hreflangRu, RU_SUBS, url);
  }
  for (const url of CLUSTER) {
    const doc = article(url);
    assert.deepEqual(doc.body[0], { type: 'p', text: doc.intro }, `${url}: the answer-first paragraph opens the body`);
    assert.match(doc.intro ?? '', /\d/, `${url}: the answer carries a number`);
    assert.ok((doc.faq ?? []).length >= 4, `${url}: FAQ`);
  }
});

test('GPTBot.uz pack prices come from the billing facts; every dollar price is a figure its cited source states', () => {
  const sums = [group(CHAT_FACTS.smallPriceUzs), group(CHAT_FACTS.priceUzs)];
  for (const url of CLUSTER) {
    const doc = article(url);
    const text = visible(doc);
    for (const m of text.matchAll(/(\d{1,3}(?: \d{3})+) (?:so‘m|сум)/gu)) assert.ok(sums.includes(m[1]), `${url}: ${m[0]} is not a GPTBot.uz pack price`);
    for (const m of text.matchAll(/\$(\d+)(?:[–-](\d+))?/g)) {
      for (const n of [m[1], m[2]].filter(Boolean) as string[]) {
        assert.ok(USD_FACTS[n], `${url}: $${n} is not a figure from a cited source`);
        // $20 is ChatGPT Plus on the ChatGPT guide and Claude Pro on the subscriptions guide.
        const needed = n === '20' && url !== UZ_GPT ? CLAUDE_PRO : USD_FACTS[n];
        assert.ok(sourceUrls(doc).includes(needed), `${url}: $${n} needs ${needed}`);
      }
    }
    assert.ok(text.includes(String(CHAT_FACTS.smallReplies)) && text.includes(String(CHAT_FACTS.replies)), `${url}: pack sizes`);
  }
});

test('no promise that a card works: the pages send the reader to the bank and describe no workaround', () => {
  for (const url of CLUSTER) {
    const text = visible(article(url));
    assert.match(text, /bankdan so‘rang|bankdan aniqlang|уточните в банке/i, `${url}: ask the bank`);
    assert.match(text, /aylanib o‘tish usullarini tasvirlamaydi|не описывает способы обхода/, `${url}: no workaround`);
    assert.doesNotMatch(text, /albatta ishlaydi|гарантированно|100\s?%/i, `${url}: no guarantee`);
    assert.doesNotMatch(text, /\b(?:official|rasmiy\w*)\b|официальн/i, `${url}: official`);
    if (url.startsWith('/uz/')) assert.deepEqual(text.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], [], `${url}: apostrophes`);
  }
});

test('every source carries the check date; the facts come from the providers themselves', () => {
  const allowedHosts = new Set(['help.openai.com', 'chatgpt.com', 'support.apple.com', 'www.anthropic.com', 'support.claude.com', 'support.google.com', 'one.google.com', 'docs.midjourney.com']);
  for (const url of CLUSTER) {
    const sources = article(url).sources ?? [];
    assert.ok(sources.length >= 5, `${url}: sources`);
    for (const s of sources) {
      assert.ok(allowedHosts.has(new URL(s.url).host), `${url}: ${s.url} is not a provider page`);
      assert.match(s.note ?? '', /2026-11-23/, `${url}: ${s.url} check date`);
    }
  }
});

test('every new article has at least two links from other published articles', () => {
  const published = [...articles.values()].filter((a) => a.status === 'published');
  for (const url of CLUSTER) {
    const incoming = published.filter((a) => a.url !== url && (
      (a.internalLinks ?? []).some((l) => l.target === url)
      || (a.body ?? []).some((b) => (b.links ?? []).some((l) => l.target === url))
    ));
    assert.ok(incoming.length >= 2, `${url}: ${incoming.length} incoming article links`);
  }
});

test('the intent manifest fences the Russian guide from the protected ChatGPT payment guide and the Uzbek one from the Claude guide', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    pairs: Array<{ id: string; commercial: { url: string }; informational: { url: string } }>;
  };
  const byId = new Map(manifest.pairs.map((p) => [p.id, p]));
  assert.equal(byId.get('W20261123-06-ru-kak-oplatit-chatgpt-vs-ai-podpiski')?.informational.url, RU_SUBS);
  assert.equal(byId.get('W20261123-07-uz-claude-guide-vs-ai-obunalar')?.informational.url, UZ_SUBS);
});
