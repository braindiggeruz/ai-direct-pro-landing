import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { onRequest as rootRequestHandler } from '../functions/index';

const ROOT = process.cwd();

async function requestRoot(url: string): Promise<Response> {
  return rootRequestHandler({
    request: new Request(url),
    next: async () => new Response('ok', { status: 200 }),
  } as Parameters<typeof rootRequestHandler>[0]);
}

test('www host permanently redirects to the canonical apex host', () => {
  const publicRedirects = fs.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8');
  const generator = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-robots.ts'), 'utf8');
  const rule = 'https://www.gptbot.uz/*  https://gptbot.uz/:splat  301';

  assert.ok(publicRedirects.includes(rule), 'fallback _redirects must contain the canonical-host rule');
  assert.ok(generator.includes(rule), 'generated production _redirects must contain the canonical-host rule');
});

test('legacy lang query variants permanently redirect to locale paths', async () => {
  const ru = await requestRoot('https://gptbot.uz/?lang=ru');
  const uz = await requestRoot('https://gptbot.uz/?lang=uz');
  const localized = await requestRoot('https://gptbot.uz/ru/stoimost-chat-bota/?lang=ru');

  assert.equal(ru.status, 301);
  assert.equal(ru.headers.get('location'), 'https://gptbot.uz/ru/');
  assert.equal(uz.status, 301);
  assert.equal(uz.headers.get('location'), 'https://gptbot.uz/uz/');
  assert.equal(localized.status, 301);
  assert.equal(localized.headers.get('location'), 'https://gptbot.uz/ru/stoimost-chat-bota/');
});

test('fallback sitemap exposes canonical locale URLs only', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');

  assert.doesNotMatch(sitemap, /https:\/\/www\.gptbot\.uz/);
  assert.doesNotMatch(sitemap, /\?lang=/);
  assert.match(sitemap, /hreflang="ru" href="https:\/\/gptbot\.uz\/ru\/"/);
  assert.match(sitemap, /hreflang="uz" href="https:\/\/gptbot\.uz\/uz\/"/);
});
