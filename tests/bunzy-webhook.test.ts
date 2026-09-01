import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';

import { bunzyMarkdownToBlocks, normalizeBunzyArticle, parseBunzyEnvelope } from '../functions/platform/bunzy/content';
import { verifyBunzySignature } from '../functions/platform/bunzy/security';
import { onRequestPost } from '../functions/webhooks/bunzy';
import { SqliteD1 } from './helpers/sqlite-d1';

const SECRET = 'bunzy-test-secret-with-enough-entropy';
const migration = fs.readFileSync('migrations/0055_bunzy_content_webhook.sql', 'utf8');

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_type: 'article.published',
    test: false,
    data: {
      article: {
        slug: 'kak-vybrat-ai-bota',
        locale: 'ru',
        title: 'Как выбрать AI-бота для бизнеса',
        description: 'Практическое руководство по выбору AI-бота для компании.',
        markdown: '## Что проверить\n\nПроверьте [возможности](/ru/ai-bot-dlya-biznesa/).\n\n- Интеграции\n- Аналитика',
        published_at: '2026-08-30T00:00:00.000Z',
        updated_at: '2026-08-30T01:00:00.000Z',
        seo: { keywords: ['AI-бот', 'автоматизация'] },
      },
    },
    ...overrides,
  };
}

function signature(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(migration);
  return db;
}

async function send(db: SqliteD1, payload: Record<string, unknown>, secret = SECRET): Promise<Response> {
  const body = JSON.stringify(payload);
  return onRequestPost({
    request: new Request('https://gptbot.uz/webhooks/bunzy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bunzy-Signature': signature(body),
      },
      body,
    }),
    env: {
      BUNZY_WEBHOOK_SECRET: secret,
      BUNZY_DEFAULT_LOCALE: 'ru',
      GPTBOT_DRAFTS_DB: db.asD1(),
    },
  } as never);
}

test('HMAC verification uses the exact raw body', async () => {
  const raw = new TextEncoder().encode('{"test":true}');
  assert.equal(await verifyBunzySignature(raw.buffer, SECRET, signature('{"test":true}')), true);
  assert.equal(await verifyBunzySignature(raw.buffer, SECRET, signature('{ "test": true }')), false);
  assert.equal(await verifyBunzySignature(raw.buffer, SECRET, 'sha256=bad'), false);
});

test('markdown is converted to allow-listed blocks without executable HTML', () => {
  const blocks = bunzyMarkdownToBlocks('## Заголовок\n\n<script>alert(1)</script>Текст [ссылка](javascript:alert(1)).\n\n![Фото](http://unsafe.test/a.jpg)');
  assert.equal(blocks[0]?.type, 'h2');
  assert.ok(!JSON.stringify(blocks).includes('<script>'));
  assert.ok(!JSON.stringify(blocks).includes('javascript:'));
  assert.ok(!blocks.some((block) => block.type === 'figure'), 'plain HTTP images are refused');
});

test('payload normalisation fixes canonical and ignores provider JSON-LD', () => {
  const payload = fixture();
  const root = payload.data as { article: Record<string, unknown> };
  root.article.seo = {
    jsonLd: { '@type': 'Organization', name: '<script>bad</script>' },
    canonical: 'https://attacker.test/',
  };
  const envelope = parseBunzyEnvelope(payload, 'ru', '2026-08-30T02:00:00.000Z');
  const normalized = normalizeBunzyArticle(envelope);
  assert.equal(normalized.article.canonical, 'https://gptbot.uz/ru/blog/kak-vybrat-ai-bota/');
  assert.equal(normalized.article.schemaTypes.includes('Article'), true);
  assert.ok(!JSON.stringify(normalized.article).includes('attacker.test'));
});

test('valid publish is durable and duplicate delivery is idempotent', async () => {
  const db = database();
  const first = await send(db, fixture());
  assert.equal(first.status, 200);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_articles'), 1);
  assert.equal(db.value("SELECT status FROM bunzy_articles WHERE slug = 'kak-vybrat-ai-bota'"), 'published');

  const duplicate = await send(db, fixture());
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json() as { duplicate?: boolean }).duplicate, true);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_webhook_events'), 1);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_articles'), 1);
});

test('test delivery is acknowledged but never publishes sample-post', async () => {
  const db = database();
  const payload = fixture({
    test: true,
    data: { article: { slug: 'sample-post', title: 'Sample', locale: 'ru' } },
  });
  const response = await send(db, payload);
  assert.equal(response.status, 200);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_articles'), 0);
  assert.equal(db.value("SELECT status FROM bunzy_webhook_events WHERE slug = 'sample-post'"), 'test_received');
});

test('update upserts one stable slug and unpublish leaves a tombstone', async () => {
  const db = database();
  assert.equal((await send(db, fixture())).status, 200);

  const update = fixture({ event_type: 'article.updated' });
  const updateData = update.data as { article: Record<string, unknown> };
  updateData.article.title = 'Обновлённый заголовок';
  updateData.article.updated_at = '2026-08-30T02:00:00.000Z';
  assert.equal((await send(db, update)).status, 200);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_articles'), 1);
  assert.equal(db.value("SELECT title FROM bunzy_articles WHERE slug = 'kak-vybrat-ai-bota'"), 'Обновлённый заголовок');

  const unpublish = fixture({ event_type: 'article.unpublished' });
  const unpublishData = unpublish.data as { article: Record<string, unknown> };
  unpublishData.article.updated_at = '2026-08-30T03:00:00.000Z';
  assert.equal((await send(db, unpublish)).status, 200);
  assert.equal(db.value("SELECT status FROM bunzy_articles WHERE slug = 'kak-vybrat-ai-bota'"), 'unpublished');
  assert.equal(db.value("SELECT article_json FROM bunzy_articles WHERE slug = 'kak-vybrat-ai-bota'"), null);
});

test('invalid signature, missing secret and malformed payload fail closed', async () => {
  const db = database();
  const wrongSecret = await send(db, fixture(), 'wrong-secret');
  assert.equal(wrongSecret.status, 401);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_webhook_events'), 0);

  const body = JSON.stringify(fixture());
  const missingSecret = await onRequestPost({
    request: new Request('https://gptbot.uz/webhooks/bunzy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bunzy-Signature': signature(body) },
      body,
    }),
    env: { GPTBOT_DRAFTS_DB: db.asD1() },
  } as never);
  assert.equal(missingSecret.status, 503);

  const malformed = fixture({ event_type: 'unknown.event' });
  assert.equal((await send(db, malformed)).status, 400);
  assert.equal(db.value('SELECT COUNT(*) FROM bunzy_articles'), 0);
});

test('an older, previously unseen update cannot overwrite a newer article', async () => {
  const db = database();
  const newer = fixture({ event_type: 'article.updated' });
  const newerData = newer.data as { article: Record<string, unknown> };
  newerData.article.title = 'Новая версия';
  newerData.article.updated_at = '2026-08-30T05:00:00.000Z';
  assert.equal((await send(db, newer)).status, 200);

  const older = fixture({ event_type: 'article.updated' });
  const olderData = older.data as { article: Record<string, unknown> };
  olderData.article.title = 'Старая версия';
  olderData.article.updated_at = '2026-08-30T04:00:00.000Z';
  assert.equal((await send(db, older)).status, 200);
  assert.equal(db.value("SELECT title FROM bunzy_articles WHERE slug = 'kak-vybrat-ai-bota'"), 'Новая версия');
});

test('Cloudflare routes signed webhooks and dynamic content through Pages Functions', () => {
  const routes = JSON.parse(fs.readFileSync('public/_routes.json', 'utf8')) as { include: string[] };
  for (const route of ['/webhooks/*', '/ru/blog/*', '/uz/blog/*', '/sitemap.xml']) {
    assert.ok(routes.include.includes(route), `${route} must reach Pages Functions in production`);
  }
});
