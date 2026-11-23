// The neutral Uzbek checklist for choosing an AI bot contractor, AI-visibility
// wave 3 (2026-11-23). The Russian side is already covered by
// /ru/luchshie-razrabotchiki-chat-botov-tashkent/ and
// /ru/blog/kak-proverit-podryadchika-reklama-sayt-uzbekistan/, so the page is unpaired.
//
// Run: node --import tsx --test tests/contractor-checklist.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { BlogArticle } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = '/uz/blog/toshkentda-ai-bot-pudratchisini-tanlash/';
const read = (file: string): BlogArticle => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as BlogArticle;
const doc = read('content/blog/uz/toshkentda-ai-bot-pudratchisini-tanlash.json');
const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const visible = [doc.title, doc.description, doc.h1, ...texts(doc.body), ...(doc.faq ?? []).flatMap((f) => [f.q, f.a])].join('\n');

test('a published, unpaired Uzbek article that opens with the answer and asks fifteen questions', () => {
  assert.equal(doc.url, URL);
  assert.equal(doc.status, 'published');
  assert.equal(doc.hreflangUz, URL);
  assert.equal(doc.hreflangRu ?? '', '');
  assert.deepEqual(doc.body[0], { type: 'p', text: doc.intro });
  const questions = doc.body.find((b) => b.type === 'table');
  assert.equal(questions?.rows?.length, 15, 'fifteen questions');
  assert.ok((doc.faq ?? []).length >= 4);
});

test('neutral: no price, no guarantee, no «official», correct apostrophes, the law cited with its check date', () => {
  assert.doesNotMatch(visible, /\d{1,3}(?: \d{3})+ so‘m/u, 'no prices on the checklist');
  assert.doesNotMatch(visible, /\b(?:official|rasmiy\w*)\b/i);
  assert.deepEqual(visible.match(/[A-Za-z]['ʻʼ`´][A-Za-z]/g) ?? [], []);
  assert.deepEqual((doc.sources ?? []).map((s) => s.url), ['https://lex.uz/docs/4396419']);
  assert.match(doc.sources?.[0].note ?? '', /2026-11-23/);
});

test('at least two related articles link to it, and the manifest fences it from the service page', () => {
  const dir = path.join(ROOT, 'content/blog/uz');
  const incoming = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => read(`content/blog/uz/${f}`))
    .filter((a) => a.url !== URL && a.status === 'published' && (a.internalLinks ?? []).some((l) => l.target === URL));
  assert.ok(incoming.length >= 2, `${incoming.length} incoming article links`);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seo/intent-manifest.json'), 'utf8')) as {
    pairs: Array<{ id: string; commercial: { url: string }; informational: { url: string } }>;
  };
  const fence = manifest.pairs.find((p) => p.id === 'W20261123-08-uz-ai-bot-service-vs-contractor-checklist');
  assert.equal(fence?.commercial.url, '/uz/biznes-uchun-ai-bot/');
  assert.equal(fence?.informational.url, URL);
});
