import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildKnownUrls } from '../src/shared/audit';
import { CONTENT_DOWNLOAD_URLS } from '../src/shared/content-downloads';
import { escapeHtml } from '../scripts/widgets/html';

test('authored downloads exist, while unknown file links are not allowlisted', () => {
  const known = buildKnownUrls([]);
  for (const url of CONTENT_DOWNLOAD_URLS) {
    assert.equal(known.has(url), true);
    assert.match(url, /^\/downloads\/growth-20261106\/[a-z-]+\.(docx|pdf)$/);
    const file = path.join(process.cwd(), 'public', url.slice(1));
    assert.ok(fs.statSync(file).size > 100);
    const prefix = fs.readFileSync(file).subarray(0, 4).toString('latin1');
    assert.equal(prefix, url.endsWith('.pdf') ? '%PDF' : 'PK\x03\x04');
  }
  assert.equal(known.has('/downloads/growth-20261106/missing.pdf'), false);
  assert.equal(known.has('/downloads/other.docx'), false);
  assert.equal(known.has('/missing-page/'), false);
});

test('download noindex rules are scoped and mirrored in generated policy', () => {
  const headers = fs.readFileSync('public/_headers', 'utf8').replace(/\r\n/g, '\n');
  const generator = fs.readFileSync('scripts/generate-robots.ts', 'utf8');
  for (const prefix of ['/downloads/growth-20261106/*', '/studio-examples/*']) {
    assert.ok(headers.includes(`${prefix}\n  X-Robots-Tag: noindex`));
    assert.ok(generator.includes(`'${prefix}'`));
  }
  assert.ok(!headers.includes('https://gptbot.uz/*\n  X-Robots-Tag: noindex'));
});

test('blog linkp renderer downloads only the six exact registered files and preserves ordinary links', () => {
  const source = fs.readFileSync('scripts/prerender-blog.ts', 'utf8').replace(/\r\n/g, '\n');
  const branch = source.match(/case 'linkp': \{([\s\S]*?)\n {4}}\n {4}case 'cta':/)?.[1];
  assert.ok(branch, 'exercise the real linkp rendering branch');
  const render = new Function('b', 'escapeText', 'escapeHtml', 'blockLang', 'isStudioTelegramHref', 'STUDIO_CONTACT_ATTR', 'CONTENT_DOWNLOADS', branch);
  const link = (target: string, lang?: string) => render(
    { text: '{file}', links: [{ token: 'file', target, anchor: 'Материал', lang }] },
    escapeHtml, escapeHtml, () => '', () => false, 'data-studio-contact', new Set(CONTENT_DOWNLOAD_URLS),
  ) as string;
  assert.equal(CONTENT_DOWNLOAD_URLS.length, 6);
  for (const url of CONTENT_DOWNLOAD_URLS) {
    assert.match(link(url), new RegExp(`<a href="${url.replace(/\./g, '\\.')}" download class=`));
    for (const other of [`${url}?download=1`, `${url}#preview`, `https://gptbot.uz${url}`, `https://other.example${url}`]) {
      assert.doesNotMatch(link(other), /\sdownload(?:\s|=|>)/, other);
    }
  }
  for (const url of ['/downloads/other.docx', '/downloads/growth-20261106/missing.pdf', '/uz/gpt-uzbek-tilida/', 'https://example.org/document.pdf']) {
    assert.doesNotMatch(link(url), /\sdownload(?:\s|=|>)/, url);
  }
  assert.equal(link('/uz/gpt-uzbek-tilida/', 'uz'), '<p class="text-base text-white/80 leading-relaxed mb-4"><a href="/uz/gpt-uzbek-tilida/" lang="uz" hreflang="uz" class="text-brand-cyan hover:underline">Материал</a></p>');
  assert.equal(link('https://example.org/document.pdf'), '<p class="text-base text-white/80 leading-relaxed mb-4"><a href="https://example.org/document.pdf" rel="noopener noreferrer" target="_blank" class="text-brand-cyan hover:underline">Материал</a></p>');
});

test('built document articles expose all six registered files as browser downloads', () => {
  const found = new Set<string>();
  for (const slug of ['rezyume-tayyorlash', 'rasmiy-xat-yozish', 'tavsifnoma-namuna']) {
    const html = fs.readFileSync(path.join('dist', 'uz', 'blog', slug, 'index.html'), 'utf8');
    for (const match of html.matchAll(/<a\b([^>]+)>/g)) {
      const attrs = match[1];
      const href = attrs.match(/\bhref="([^"]+)"/)?.[1];
      if (!href || !CONTENT_DOWNLOAD_URLS.some((url) => url === href)) continue;
      assert.match(attrs, /\sdownload(?:\s|=|$)/, href);
      assert.doesNotMatch(attrs, /target="_blank"/, href);
      found.add(href);
    }
  }
  assert.deepEqual([...found].sort(), [...CONTENT_DOWNLOAD_URLS].sort());
});
