import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/admin/ai-drafts/index';
import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';

function context(request: Request, env: Partial<Env>) {
  return {
    request,
    env: env as Env,
    params: {},
    data: {},
    functionPath: '/api/admin/ai-drafts',
    waitUntil() {},
    next: async () => new Response(null, { status: 404 }),
  } as unknown as Parameters<typeof onRequestPost>[0];
}

function request(
  body = '{',
  authorization?: string,
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (authorization !== undefined) headers.set('Authorization', authorization);
  return new Request('https://gptbot.uz/api/admin/ai-drafts', {
    method: 'POST',
    headers,
    body,
  });
}

async function status(
  env: Partial<Env>,
  req = request(),
): Promise<Response> {
  return onRequestPost(context(req, env));
}

function validBundle() {
  return {
    schema_version: 'gptbot.article-draft.v1',
    source: 'synthetic-security-test',
    bundle_id: 'security-replay-one',
    execution_id: 'security-replay-one',
    status: 'pending_review',
    manual_approval_required: true,
    ready_for_publish: false,
    published: false,
    validation: { passed: true, issues: [] },
    articles: [{
      locale: 'ru',
      slug: 'bezopasnyi-test-draft',
      meta_title: 'Безопасный тестовый AI-черновик для проверки',
      meta_description: 'Тестовое описание черновика подтверждает безопасный приём, валидацию и идемпотентность без автоматической публикации.',
      h1: 'Безопасный тестовый черновик',
      excerpt: 'Этот синтетический черновик существует только для проверки защищённого endpoint.',
      target_keyword: 'безопасный тестовый черновик',
      target_money_page: '/ru/services/',
      author: 'GPTBot',
      body_blocks: [
        { type: 'h2', text: 'Проверка безопасного приёма' },
        { type: 'p', text: 'Содержимое проходит строгую валидацию и сохраняется только как черновик.' },
        { type: 'h2', text: 'Проверка ручного согласования' },
        { type: 'p', text: 'Публикация требует отдельного действия администратора после проверки.' },
        { type: 'h2', text: 'Проверка повторной доставки' },
        { type: 'p', text: 'Повтор с тем же идентификатором не создаёт второй черновик.' },
      ],
      faq: [
        { q: 'Публикуется ли черновик автоматически?', a: 'Нет, требуется ручная проверка администратора.' },
        { q: 'Создаёт ли повтор второй черновик?', a: 'Нет, идентификатор пакета обеспечивает идемпотентность.' },
      ],
      internal_links: [{
        target: '/ru/services/',
        anchor: 'Сервисы GPTBot',
        locale: 'ru',
        type: 'contextual',
      }],
      schemas: ['Article', 'FAQPage', 'BreadcrumbList'],
      keywords: ['безопасный черновик', 'ручная проверка'],
    }],
  };
}

describe('legacy n8n ingest authorization', () => {
  test('disabled endpoint is closed regardless of stored credential', async () => {
    const db = new SqliteD1();
    assert.equal((await status({
      GPTBOT_DRAFTS_DB: db.asD1(),
      N8N_INGEST_TOKEN: 'synthetic-token',
    })).status, 404);
  });

  test('missing and empty secret bindings fail closed', async () => {
    const db = new SqliteD1();
    const base = {
      N8N_INGEST_ENABLED: 'true',
      GPTBOT_DRAFTS_DB: db.asD1(),
    };
    assert.equal((await status(base)).status, 503);
    assert.equal((await status({ ...base, N8N_INGEST_TOKEN: '' })).status, 503);
    assert.equal((await status({ ...base, N8N_INGEST_TOKEN: '   ' })).status, 503);
  });

  test('missing, empty, invalid and oversized headers fail closed', async () => {
    const db = new SqliteD1();
    const env = {
      N8N_INGEST_ENABLED: 'true',
      N8N_INGEST_TOKEN: 'synthetic-token',
      GPTBOT_DRAFTS_DB: db.asD1(),
    };
    assert.equal((await status(env, request())).status, 401);
    assert.equal((await status(env, request('{', 'Bearer '))).status, 401);
    assert.equal((await status(env, request('{', 'Bearer invalid'))).status, 401);
    assert.equal(
      (await status(env, request('{', `Bearer ${'x'.repeat(513)}`))).status,
      401,
    );
  });

  test('two absent values cannot pass and malformed body is parsed only after auth', async () => {
    const db = new SqliteD1();
    const base = {
      N8N_INGEST_ENABLED: 'true',
      GPTBOT_DRAFTS_DB: db.asD1(),
    };
    assert.equal((await status(base, request('{'))).status, 503);
    assert.equal((await status({
      ...base,
      N8N_INGEST_TOKEN: 'synthetic-token',
    }, request('{'))).status, 401);
    assert.equal((await status({
      ...base,
      N8N_INGEST_TOKEN: 'synthetic-token',
    }, request('{', 'Bearer synthetic-token'))).status, 400);
  });

  test('replayed valid request is idempotent and remains pending review', async () => {
    const db = new SqliteD1();
    db.exec(await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../migrations/0001_ai_drafts.sql', import.meta.url),
        'utf8',
      )));
    const env = {
      N8N_INGEST_ENABLED: 'true',
      N8N_INGEST_TOKEN: 'synthetic-token',
      GPTBOT_DRAFTS_DB: db.asD1(),
    };
    const body = JSON.stringify(validBundle());
    const first = await status(env, request(body, 'Bearer synthetic-token'));
    const replay = await status(env, request(body, 'Bearer synthetic-token'));
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal((await first.json() as { deduplicated: boolean }).deduplicated, false);
    assert.equal((await replay.json() as { deduplicated: boolean }).deduplicated, true);
    assert.equal(db.value('SELECT COUNT(*) FROM ai_drafts'), 1);
    assert.equal(db.value('SELECT status FROM ai_drafts'), 'pending_review');
  });

  test('credential and malformed payload are never logged or echoed', async () => {
    const db = new SqliteD1();
    const secret = 'synthetic-token-never-log';
    const seen: unknown[][] = [];
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (...args: unknown[]) => { seen.push(args); };
    console.log = (...args: unknown[]) => { seen.push(args); };
    try {
      const response = await status({
        N8N_INGEST_ENABLED: 'true',
        N8N_INGEST_TOKEN: secret,
        GPTBOT_DRAFTS_DB: db.asD1(),
      }, request('{"private_prompt":"do not log"}', `Bearer ${secret}`));
      const output = await response.text();
      assert.ok(!output.includes(secret));
      assert.ok(!output.includes('private_prompt'));
      assert.ok(!JSON.stringify(seen).includes(secret));
      assert.ok(!JSON.stringify(seen).includes('private_prompt'));
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });
});
