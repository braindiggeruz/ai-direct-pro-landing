import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';
import { onRequestGet as account } from '../functions/api/gpt/account';
import { onRequestPost as subscribe } from '../functions/api/gpt/subscribe';
import { onRequestPost as logout } from '../functions/api/gpt/auth/logout';
import { onRequestPost as chat } from '../functions/api/gpt/chat';
import { onRequestPost as click } from '../functions/api/payments/click';
import { termsUrl } from '../functions/lib/gpt-chat/billing-config';
import { chatStreamStart } from '../functions/lib/gpt-chat/openrouter-stream';
import { modelChain, resolveConfig } from '../functions/lib/gpt-chat/config';
import { inspectBilling } from '../functions/lib/gpt-chat/billing-operations-store';

test('Payme preparation starts its protocol timeout and test grants never enter the legacy live mirror', async () => {
  const f = await billingFixture();
  const now = Date.now();
  const row = await f.store.createOrder(f.user, 'payme', 'test', crypto.randomUUID(), now - 11 * 3600000);
  const externalId = crypto.randomUUID();
  const prepared = await f.rpc('CreateTransaction', { id: externalId, time: now, amount: 2000000, account: { order_id: row.id } });
  assert.equal(prepared.result.state, 1);
  assert.equal((await f.store.order(row.id))?.expires_at, now + 43200000);
  assert.equal((await f.rpc('PerformTransaction', { id: externalId })).result.state, 2);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_subscriptions'), 0);
  assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_access_periods WHERE mode='test'"), 1);
});

test('anonymous account metadata is no-store/noindex and performs no database work', async () => {
  let calls = 0;
  const env = { GPTBOT_DRAFTS_DB: { prepare() { calls++; throw Error('unavailable'); }, batch() { calls++; throw Error('unavailable'); } } };
  const response = await account({ request: new Request('https://gpt.test/api/gpt/account'), env } as unknown as Parameters<typeof account>[0]);
  const view = await response.json() as { user: unknown; providers: unknown[]; loginAvailable: boolean; termsVersion: unknown };
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.match(response.headers.get('x-robots-tag')!, /noindex/);
  assert.equal(calls, 0);
  assert.equal(view.user, null);
  assert.equal(view.loginAvailable, false);
  assert.deepEqual(view.providers, []);
  assert.equal(view.termsVersion, null);
});

test('the bot handoff flag reaches the account view only as exactly "true", with no database work', async () => {
  const view = async (flag?: string) => {
    const env = { GPTBOT_DRAFTS_DB: { prepare() { throw Error('unavailable'); }, batch() { throw Error('unavailable'); } }, GPT_BOT_HANDOFF_ENABLED: flag };
    const response = await account({ request: new Request('https://gpt.test/api/gpt/account'), env } as unknown as Parameters<typeof account>[0]);
    return (await response.json() as { botHandoff: unknown }).botHandoff;
  };
  assert.equal(await view(), false);
  for (const flag of ['false', '', 'TRUE', '1', 'yes']) assert.equal(await view(flag), false, flag);
  assert.equal(await view('true'), true);
});

test('a chat turn needs no Uzum schema and never creates it (migration 0065 not applied)', async () => {
  // A database the chat bootstraps by itself: nothing from 0065 exists.
  const db = new SqliteD1();
  const background: Promise<unknown>[] = [];
  const env = { GPTBOT_DRAFTS_DB: db.asD1(), OPENROUTER_API_KEY: randomBytes(32).toString('hex') };
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Javob' } }] })}\n\ndata: [DONE]\n\n`);
  try {
    const response = await chat({
      request: new Request('https://gpt.test/api/gpt/chat', { method: 'POST', body: JSON.stringify({ message: 'Salom', stream: true }) }),
      env,
      waitUntil: (task: Promise<unknown>) => background.push(task),
    } as unknown as Parameters<typeof chat>[0]);
    const text = await response.text();
    await Promise.all(background);
    assert.equal(response.status, 200);
    assert.match(text, /"type":"done"/);
    assert.equal(db.value("SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='done'"), 1);
    assert.equal(db.value("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%uzum%' OR name='gpt_payment_orders_all'"), 0);
  } finally { globalThis.fetch = original; }
});

test('diagnostics report the payments section as schema_pending until migration 0065, the rest still answers', async () => {
  const f = await billingFixture();
  f.db.exec('DROP VIEW gpt_payment_orders_all; DROP TABLE gpt_uzum_orders');
  const diagnostics = await inspectBilling(f.env);
  assert.equal(diagnostics.outbox, 'schema_pending');
  assert.deepEqual(diagnostics.lastHour, []);
  assert.deepEqual(diagnostics.blockedModels, []);
  f.db.exec(readFileSync(new URL('../migrations/0065_gpt_uzum_payments.sql', import.meta.url), 'utf8'));
  assert.deepEqual({ ...(await inspectBilling(f.env)).outbox as object }, { pending: 0, oldest: null });
});

test('account storage identity is stable across devices, distinct across users; logout clears transcript cookies', async () => {
  const f = await billingFixture();
  const get = async (cookie: string) => (await account(f.ctx(new Request('https://gpt.test/api/gpt/account', { headers: { cookie } })))).json();
  const first = await get(f.cookie);
  const otherToken = await f.identity.login(randomBytes(32).toString('hex'));
  const other = await get(`__Host-gpt_account=${otherToken}`);
  assert.match(first.user.storageKey, /^[a-f0-9]{64}$/);
  assert.equal((await get(f.cookie)).user.storageKey, first.user.storageKey);
  assert.notEqual(first.user.storageKey, other.user.storageKey);
  assert.ok(!JSON.stringify(first).includes(f.token));
  const response = await logout(f.ctx(new Request('https://gpt.test/api/gpt/auth/logout', { method: 'POST', headers: { origin: 'https://gpt.test', cookie: f.cookie } })));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /gpt_sat=;.*Max-Age=0/);
  assert.equal((await get(f.cookie)).user, null);
  assert.ok((await get(`__Host-gpt_account=${otherToken}`)).user);
});

test('checkout rejects absent or stale terms before order creation, journals consent once and rejects cross-tenant lookup', async () => {
  const f = await billingFixture();
  const requestId = crypto.randomUUID();
  const checkout = (version?: string) => subscribe(f.ctx(new Request('https://gpt.test/api/gpt/subscribe', {
    method: 'POST', headers: { origin: 'https://gpt.test', cookie: f.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'payme', requestId, acceptTerms: true, termsVersion: version, locale: 'ru' }),
  })));
  assert.equal((await checkout()).status, 409);
  assert.equal((await checkout('old')).status, 409);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_payment_orders'), 0);
  const valid = await checkout('fixture-v1');
  assert.equal(valid.status, 200);
  assert.equal((await checkout('fixture-v1')).status, 200);
  assert.equal(f.db.value('SELECT COUNT(*) FROM gpt_payment_consents'), 1);
  assert.equal(f.db.value('SELECT version FROM gpt_payment_consents'), 'fixture-v1');
  f.env.GPT_BILLING_TERMS_VERSION = 'fixture-v2';
  assert.equal((await checkout('fixture-v2')).status, 409);
  const { BillingStore } = await import('../functions/lib/gpt-chat/billing-store');
  const result = await valid.json() as { attemptId: string };
  await assert.rejects(new BillingStore(f.binding, 'another-org').assertConsent(result.attemptId, 'fixture-v1'), /terms_changed/);
  for (const url of ['https://evil.test/terms', 'https://gptbot.uz@evil.test/', 'http://gptbot.uz/', 'https://gptbot.uz:444/terms']) assert.equal(termsUrl(url), null);
});

test('whitespace-only SSE retries before exposing a model; partial streams release successful-answer quota, counted after the release', async () => {
  const f = await billingFixture();
  f.env.OPENROUTER_API_KEY = randomBytes(32).toString('hex');
  const cfg = resolveConfig(f.env);
  const original = globalThis.fetch;
  let calls = 0;
  const wire = (content: string, done = true) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n${done ? 'data: [DONE]\n\n' : ''}`);
  globalThis.fetch = async () => wire(++calls === 1 ? ' \n\t' : 'Answer');
  try {
    const stream = await chatStreamStart(f.env, cfg, modelChain(cfg, 'free'), []);
    assert.equal(stream.ok, true);
    if (stream.ok) { assert.equal(stream.model, cfg.freeFallbacks[0]); await new Response(stream.body).text(); stream.abort(); }
    assert.equal(calls, 2);
    globalThis.fetch = async () => wire('Partial', false);
    const response = await chat(f.ctx(new Request('https://gpt.test/api/gpt/chat', { method: 'POST', body: JSON.stringify({ message: 'Salom', stream: true }) })));
    const text = await response.text();
    await Promise.all(f.background);
    assert.match(text, /"code":"partial"/);
    // The released turn is already given back: 15 of 15 left today, 5 of 5 this hour.
    assert.match(text, /"type":"error","code":"partial","remaining":15,"hourRemaining":5/);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='done'"), 0);
    assert.equal(f.db.value("SELECT COUNT(*) FROM gpt_turn_reservations WHERE status='released' AND outcome='upstream_error' AND charged=0"), 1);
  } finally { globalThis.fetch = original; }
});

test('chat without quota database never calls a provider; Click rejects oversized chunked input', async () => {
  const f = await billingFixture();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('must not call provider'); };
  try {
    const ctx = f.ctx(new Request('https://gpt.test/api/gpt/chat', { method: 'POST', body: JSON.stringify({ message: 'Salom', stream: true }) }));
    const response = await chat({ ...ctx, env: {} } as Parameters<typeof chat>[0]);
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
    let cancelled = false;
    const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(9000)); }, cancel() { cancelled = true; } });
    const clickResponse = await click(f.ctx(new Request('https://gpt.test/api/payments/click', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, duplex: 'half',
    } as RequestInit)));
    assert.equal((await clickResponse.json() as { error: number }).error, -8);
    assert.equal(cancelled, true);
  } finally { globalThis.fetch = original; }
});
