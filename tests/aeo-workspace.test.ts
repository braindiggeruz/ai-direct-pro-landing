import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SqliteD1 } from './helpers/sqlite-d1';
import { AeoStore } from '../functions/platform/aeo/store';
import { ensureAeoSchema } from '../functions/platform/aeo/schema';
import { analyzeContent, normalizeQuestions } from '../functions/platform/aeo/analysis';
import { observe, allowedModel } from '../functions/platform/aeo/observation';
import { onRequestGet, onRequestPost } from '../functions/api/admin/aeo/index';
import { signToken } from '../functions/lib/jwt';
import type { Env } from '../functions/_types';

const content = { 'content/pages/ru/seo.json': JSON.stringify({ status: 'published', locale: 'ru', url: '/ru/seo/', h1: 'SEO продвижение сайта', title: 'SEO', bodyBlocks: [{ type: 'p', text: 'SEO продвижение сайта начинается с аудита и проверки технических ошибок.' }], faq: [] }) };

test('analysis uses published same-locale content and exact source facts', async () => {
  const result = await analyzeContent({ ...content, 'content/pages/ru/draft.json': JSON.stringify({ status: 'draft', locale: 'ru', url: '/ru/draft/', h1: 'SEO цена 100', bodyBlocks: [] }) }, ['Как начинается SEO продвижение сайта?', 'Сколько стоит SEO продвижение сайта?', 'Где купить торт?'], 'ru');
  assert.equal(result.pages, 1);
  assert.equal(result.findings[0].answer, 'SEO продвижение сайта начинается с аудита и проверки технических ошибок.');
  assert.equal(result.findings[1].answer, null, 'a price question cannot be answered by an unrelated factual paragraph');
  assert.equal(result.findings[2].status, 'no_target');
  assert.equal(result.findings[2].url, null);
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
  await assert.rejects(analyzeContent(content, ['SEO?'], 'uz'), /не получен/);
});
test('question validation preserves distinct intents and rejects oversized/control input', () => {
  assert.equal(normalizeQuestions(['Сколько стоит бот?', 'Где заказать бот?', 'Сколько стоит бот?']).length, 2);
  assert.throws(() => normalizeQuestions(['abc\u0000']));
  assert.throws(() => normalizeQuestions(Array(41).fill('test')));
});
test('frozen content policy prevents an actionable proposal', async () => {
  const result = await analyzeContent({ ...content, 'content/seo/demand-policy.json': JSON.stringify({ frozenClusters: [{ keywordPatterns: ['SEO'] }] }) }, ['SEO продвижение сайта?'], 'ru');
  assert.equal(result.findings[0].status, 'frozen');
});
test('malformed published content fails closed', async () => {
  await assert.rejects(analyzeContent({ ...content, 'content/pages/ru/bad.json': '{' }, ['SEO?'], 'ru'));
});

test('page ownership distinguishes website pricing from a chatbot page with overlapping words', async () => {
  const files = {
    'content/blog/ru/a-bot.json': JSON.stringify({ status: 'published', locale: 'ru', url: '/ru/blog/a-bot/', h1: 'Разработка чат-бота: Telegram, сайт и CRM', faq: [], body: [] }),
    'content/blog/ru/site-price.json': JSON.stringify({ status: 'published', locale: 'ru', url: '/ru/blog/site-price/', h1: 'Сколько стоит разработка сайта в Ташкенте', intro: 'Разработка сайта по опубликованному предложению студии стоит от 1,5 млн сум. Это не оферта GPTBot.', body: [], faq: [] }),
    'content/pages/ru/root.json': JSON.stringify({ status: 'published', locale: 'ru', url: '/boss-digital/', h1: 'Студия маркетинга', bodyBlocks: [], faq: [] }),
  };
  const result = await analyzeContent(files, ['Сколько стоит разработка сайта?'], 'ru');
  assert.equal(result.pages, 3);
  assert.equal(result.findings[0].url, '/ru/blog/site-price/');
  assert.equal(result.findings[0].evidence[0].path, 'intro');
  assert.match(result.findings[0].answer || '', /не оферта GPTBot/);
});
test('D1 isolation, atomic request cap, duplicate keys, terminal states and retention', async () => {
  const adapter = new SqliteD1(); const sqlite = adapter.sqlite; const db = adapter as unknown as D1Database;
  await ensureAeoSchema(db); const store = new AeoStore(db);
  const reserved = await Promise.all(Array.from({ length: 10 }, (_, i) => store.reserve('A', String(i), `key-${i}`, 'hash', 'measurement', 3)));
  assert.equal(reserved.filter(Boolean).length, 3);
  assert.equal(await store.used('A', 'measurement'), 3);
  assert.deepEqual(await store.list('B'), []);
  assert.equal(await store.find('B', 'key-0'), null);
  assert.equal(await store.reserve('A', 'dup', 'key-0', 'hash', 'measurement', 30), false);
  await store.finish('B', '0', null, true);
  assert.equal((await store.find('A', 'key-0'))?.status, 'running');
  await store.finish('A', '0', null, true);
  await store.finish('A', '0', null, false);
  assert.equal((await store.find('A', 'key-0'))?.status, 'failed');
  await store.expire('B');
  assert.equal((await store.list('A')).length, 3);
  sqlite.close();
});
test('canonical migration and runtime bootstrap are compatible and repeatable', async () => {
  const adapter = new SqliteD1(); const sqlite = adapter.sqlite;
  sqlite.exec(readFileSync(new URL('../migrations/0062_aeo_workspace.sql', import.meta.url), 'utf8'));
  await ensureAeoSchema(adapter as unknown as D1Database);
  sqlite.close();
});
test('provider transport is bounded, uses free model only, rejects malformed/truncated output and redacts errors', async () => {
  assert.equal(allowedModel('provider/model:online'), null);
  assert.equal(allowedModel('provider/model:free'), 'provider/model:free');
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload.plugins, []);
    assert.equal(payload.provider.allow_fallbacks, false);
    throw new Error('secret-test-key');
  };
  const failed = await observe('SEO?', 'provider/model:free', 'secret-test-key', fetcher);
  assert.equal(calls, 1); assert.equal(failed.visibility, null); assert.ok(!JSON.stringify(failed).includes('secret-test-key'));
  const truncated = await observe('SEO?', 'provider/model:free', 'key', async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }));
  assert.equal(truncated.ok, false);
  const oversized = await observe('SEO?', 'provider/model:free', 'key', async () => new Response('x'.repeat(200001)));
  assert.equal(oversized.ok, false); assert.equal(oversized.visibility, null);
  const empty = await observe('SEO?', 'provider/model:free', 'key', async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: ' ' } }] }));
  assert.equal(empty.ok, false); assert.equal(empty.visibility, null);
  const success = await observe('SEO?', 'provider/model:free', 'key', async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'untrusted observation', annotations: [
    { type: 'url_citation', url_citation: { url: 'https://gptbot.uz.evil.test/' } },
    { type: 'url_citation', url_citation: { url: 'javascript:alert(1)' } },
  ] } }] }));
  assert.equal(success.visibility, 0); assert.equal(success.citations.length, 1); assert.equal(success.verdict, 'insufficient');
});
test('routes deny anonymous/support clients before storage and reject cross-origin mutation', async () => {
  const env = { JWT_SECRET: 'test-only-secret-not-a-real-credential' } as Env;
  const get = onRequestGet as (ctx: unknown) => Promise<Response>;
  const post = onRequestPost as (ctx: unknown) => Promise<Response>;
  assert.equal((await get({ request: new Request('https://gptbot.uz/api/admin/aeo'), env })).status, 401);
  const support = await signToken(env, { email: 'test@example.test', role: 'support_readonly' });
  assert.equal((await get({ request: new Request('https://gptbot.uz/api/admin/aeo', { headers: { Authorization: `Bearer ${support}` } }), env })).status, 403);
  const admin = await signToken(env, { email: 'test@example.test', role: 'admin' });
  assert.equal((await post({ request: new Request('https://gptbot.uz/api/admin/aeo', { method: 'POST', headers: { Authorization: `Bearer ${admin}`, Origin: 'https://evil.test' } }), env })).status, 403);
});

test('authorized analysis API persists, returns the same operation on retry and never publishes content', async () => {
  const adapter = new SqliteD1(); const sqlite = adapter.sqlite;
  const env = { JWT_SECRET: 'fixture-only-jwt-secret', GPTBOT_DRAFTS_DB: adapter, GITHUB_TOKEN: 'fixture', GITHUB_OWNER: 'fixture', GITHUB_REPO: 'fixture', GITHUB_BRANCH: 'main' } as unknown as Env;
  const token = await signToken(env, { email: 'test@example.test', role: 'admin' });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.github.com/graphql');
    const body = JSON.parse(String(init?.body));
    assert.ok(body.query.startsWith('query('), 'only a read query is allowed');
    return Response.json({ data: { repository: { object: { entries: [{ name: 'pages', type: 'tree', object: { entries: [{ name: 'ru', type: 'tree', object: { entries: [{ name: 'seo.json', type: 'blob', object: { text: content['content/pages/ru/seo.json'] } }] } }] } }] } } } });
  };
  const post = onRequestPost as (ctx: unknown) => Promise<Response>;
  const send = (question: string, key = 'fixture-idempotency-001') => post({ env, request: new Request('https://gptbot.uz/api/admin/aeo', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://gptbot.uz', 'Idempotency-Key': key }, body: JSON.stringify({ kind: 'analysis', locale: 'ru', questions: [question] }) }) });
  try {
    const first = await send('Что включает SEO продвижение сайта?');
    assert.equal(first.status, 200);
    const result = await first.json() as { id: string; status: string };
    assert.equal(result.status, 'completed');
    const retry = await send('Что включает SEO продвижение сайта?');
    assert.equal((await retry.json() as { id: string }).id, result.id);
    assert.equal(calls, 1);
    assert.equal((await send('Другой вопрос?')).status, 409);
    const workspace = await (onRequestGet as (ctx: unknown) => Promise<Response>)({ env, request: new Request('https://gptbot.uz/api/admin/aeo', { headers: { Authorization: `Bearer ${token}` } }) });
    assert.equal((await workspace.json() as { runs: unknown[] }).runs.length, 1);
    assert.equal(calls, 1, 'history does not reload GitHub or call an AI provider');
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test('request validation refuses unbounded/chunked bodies before any content or model call', async () => {
  const adapter = new SqliteD1(); const sqlite = adapter.sqlite;
  const env = { JWT_SECRET: 'fixture-only-jwt-secret', GPTBOT_DRAFTS_DB: adapter } as unknown as Env;
  const token = await signToken(env, { email: 'test@example.test', role: 'admin' });
  const response = await (onRequestPost as (ctx: unknown) => Promise<Response>)({ env, request: new Request('https://gptbot.uz/api/admin/aeo', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'fixture-idempotency-002' }, body: 'x'.repeat(16001) }) });
  assert.equal(response.status, 400);
  sqlite.close();
});
