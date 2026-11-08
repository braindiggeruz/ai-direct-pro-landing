import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { BlogArticle } from '../src/shared/types';
import { PSEO_DOCUMENT_SLUGS } from '../src/shared/pseo20';

interface DocumentSample {
  slug: string;
  article: string;
  title: string;
  subtitle: string;
  sections: { heading: string; lines: string[] }[];
  check: string;
  preview: string[];
}

const root = path.resolve(import.meta.dirname, '..');
const samples = JSON.parse(fs.readFileSync(path.join(root, 'content/pseo/documents-20261108.json'), 'utf8')) as DocumentSample[];
const articles = new Map(samples.map(sample => [sample.slug, JSON.parse(fs.readFileSync(path.join(root, 'content/blog/uz', `${sample.slug}.json`), 'utf8')) as BlogArticle]));

test('each document kit has one Uzbek canonical article and both real static downloads', () => {
  assert.equal(samples.length, 10);
  assert.deepEqual(samples.map(item => item.slug).sort(), [...PSEO_DOCUMENT_SLUGS].sort());
  assert.equal(new Set(samples.map(item => item.preview.join('\n'))).size, 10, 'no reused example under another document name');
  for (const sample of samples) {
    const article = articles.get(sample.slug)!;
    assert.equal(article.status, 'published');
    assert.equal(article.locale, 'uz');
    assert.equal(article.url, `/uz/blog/${sample.slug}/`);
    assert.equal(sample.article, article.url);
    assert.equal(article.canonical, `https://gptbot.uz${article.url}`);
    assert.equal(article.hreflangUz, article.url);
    assert.equal(article.hreflangRu, undefined, 'there is no authored Russian equivalent');
    const links = article.body.flatMap(block => block.links ?? []).map(link => link.target);
    for (const extension of ['docx', 'pdf']) {
      const url = `/downloads/pseo-20261108/${sample.slug}.${extension}`;
      assert.ok(links.includes(url), `${sample.slug}: missing direct ${extension} download`);
      const bytes = fs.readFileSync(path.join(root, 'public', url));
      assert.ok(bytes.length > 1000 && bytes.length < 250_000, `${url}: unexpected payload size`);
      assert.equal(bytes.subarray(0, extension === 'pdf' ? 5 : 2).toString(), extension === 'pdf' ? '%PDF-' : 'PK');
    }
  }
});

test('the article contains the complete original example and editable template rather than a download-only teaser', () => {
  for (const sample of samples) {
    const article = articles.get(sample.slug)!;
    const paragraphs = article.body.map(block => block.text);
    const listItems = article.body.flatMap(block => block.items ?? []);
    for (const line of sample.preview) assert.ok(paragraphs.includes(line), `${sample.slug}: incomplete filled example`);
    for (const section of sample.sections) {
      assert.ok(paragraphs.includes(section.heading), `${sample.slug}: missing ${section.heading}`);
      for (const line of section.lines) assert.ok(listItems.includes(line), `${sample.slug}: missing editable field`);
    }
    assert.ok(paragraphs.includes(sample.check), `${sample.slug}: missing document-specific caveat`);
    const firstDownload = article.body.findIndex(block => block.links?.some(link => link.target?.startsWith('/downloads/')));
    const firstChat = article.body.findIndex(block => block.links?.some(link => link.target === '/uz/gpt-uzbek-tilida/'));
    assert.ok(firstDownload >= 0 && firstDownload < firstChat, `${sample.slug}: download must be available before chat promotion`);
    const ids = article.body.filter(block => block.id).map(block => block.id);
    assert.equal(new Set(ids).size, ids.length, `${sample.slug}: duplicate navigation IDs`);
  }
});

test('document recommendations resolve to real authored pages and factual sources are explicit', () => {
  const known = new Set<string>();
  for (const dir of ['content/blog/uz', 'content/pages/uz']) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.json'))) {
      const content = JSON.parse(fs.readFileSync(path.join(root, dir, file), 'utf8'));
      if (content.url) known.add(content.url);
    }
  }
  for (const sample of samples) {
    const article = articles.get(sample.slug)!;
    for (const link of article.internalLinks) assert.ok(known.has(link.target), `${sample.slug}: unresolved recommendation ${link.target}`);
    for (const block of article.body) {
      for (const link of block.links ?? []) {
        if (link.target?.startsWith('/uz/')) assert.ok(known.has(link.target), `${sample.slug}: unresolved body link ${link.target}`);
      }
    }
    assert.ok(article.sources?.length, `${sample.slug}: no stated source for document guidance`);
    for (const source of article.sources!) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.ok(source.note, `${sample.slug}: source limitations are missing`);
    }
  }
});
