import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { billingFixture } from './helpers/gpt-billing-fixture';
import { SqliteD1 } from './helpers/sqlite-d1';
import { resolveConfig } from '../functions/lib/gpt-chat/config';
import { TurnStore } from '../functions/lib/gpt-chat/turn-store';
import { TrialStore, TRIAL_DDL } from '../functions/lib/gpt-chat/trial-store';
import { claimTrialIdentity, readTrialKey } from '../functions/lib/gpt-chat/trial-identity';
import { BILLING_ORG } from '../functions/lib/gpt-chat/billing-config';
import { onRequestGet as account } from '../functions/api/gpt/account';
import { onRequestPost as chat } from '../functions/api/gpt/chat';
import { reduceLimit, canSendNow } from '../src/gpt-chat/limit-state';
import { validAccountView } from '../src/gpt-chat/types';

async function fixture() {
  const f = await billingFixture();
  f.env.GPT_FREE_TRIAL_ENABLED = 'true';
  f.env.GPT_HASH_SALT = randomBytes(32).toString('hex');
  const cfg = resolveConfig(f.env);
  const claimed = await claimTrialIdentity(new Request('https://gpt.test'), cfg);
  const cookie = claimed.cookie!.split(';')[0];
  const turns = new TurnStore(f.binding, BILLING_ORG, claimed.key);
  const trial = new TrialStore(f.binding, BILLING_ORG);
  return { ...f, cfg, key: claimed.key, trial, turns, trialCookie: cookie };
}
const at = Date.parse('2026-10-08T12:00:00Z');

test('3 completed replies, permanent fourth refusal, next day/new IP no reset; org B isolated', async () => {
  const f = await fixture();
  for (let n = 0; n < 3; n++) {
    const r = await f.turns.reserve(f.key, 'ip-a', null, f.cfg, at + n);
    assert.ok(r.id); await f.turns.finish(r.id, { charged: true, outcome: 'answered' });
    await f.turns.finish(r.id, { charged: true, outcome: 'answered' }); // duplicate completion
    assert.equal((await f.trial.summary(f.key, f.key, at)).used, n + 1);
  }
  const refused = await f.turns.reserve(f.key, 'ip-b', null, f.cfg, at + 86400_000);
  assert.equal(refused.id, null); assert.equal(refused.limit?.reason, 'trial'); assert.equal(refused.limit?.retryAt, null);
  // A neighbour on a shared mobile address has its own three replies.
  const neighbour = new TurnStore(f.binding, BILLING_ORG, 'trial:neighbour');
  for (let n = 0; n < 3; n++) {
    const r = await neighbour.reserve('trial:neighbour', 'ip-a', null, f.cfg, at + 10 + n);
    assert.ok(r.id); await neighbour.finish(r.id, { charged: true, outcome: 'answered' });
  }
  f.db.prepare('DELETE FROM gpt_turn_reservations WHERE org_id=?').bind(BILLING_ORG).runSync();
  assert.equal((await f.trial.summary(f.key, f.key, at + 100 * 86400_000)).remaining, 0);
  const b = new TurnStore(f.binding, 'other-org', f.key);
  assert.ok((await b.reserve(f.key, 'ip-a', null, f.cfg, at)).id);
});

test('parallel last slot is atomic; pending is busy, provider error releases, not trial exhausted', async () => {
  const f = await fixture();
  for (let n = 0; n < 2; n++) { const r = await f.turns.reserve(f.key, 'ip-a', null, f.cfg, at + n); await f.turns.finish(r.id!, { charged: true, outcome: 'answered' }); }
  const contenders = await Promise.all([0, 1].map(() => f.turns.reserve(f.key, 'ip-a', null, f.cfg, at + 3)));
  assert.equal(contenders.filter(r => r.id).length, 1);
  assert.equal(contenders.find(r => !r.id)?.limit?.reason, 'busy');
  const pending = await f.trial.summary(f.key, f.key, at + 3);
  assert.deepEqual([pending.used, pending.remaining, pending.available], [2, 1, 0]);
  await f.turns.finish(contenders.find(r => r.id)!.id!, { charged: false, outcome: 'upstream_error' });
  const retry = await f.turns.reserve(f.key, 'ip-a', null, f.cfg, at + 4); assert.ok(retry.id);
  await f.turns.finish(retry.id, { charged: false, outcome: 'truncated' });
  assert.equal((await f.trial.summary(f.key, f.key, at + 4)).remaining, 1);
});

test('account linking and sign-out retain charged usage; old paid free bonuses excluded', async () => {
  const f = await fixture();
  const r = await f.turns.reserve(f.key, 'ip-a', null, f.cfg, at); await f.turns.finish(r.id!, { charged: true, outcome: 'answered' });
  await f.trial.initialize(f.key, f.user, at);
  assert.equal((await f.trial.summary(f.key, f.user, at)).used, 1);
  const signed = await f.turns.reserve(f.user, 'ip-a', null, f.cfg, at + 1); await f.turns.finish(signed.id!, { charged: true, outcome: 'answered' });
  const other = 'trial:other-device'; await f.trial.initialize(other, f.user, at);
  assert.equal((await f.trial.summary(other, other, at)).used, 2);
  const r2 = await new TurnStore(f.binding, BILLING_ORG, other).reserve(f.user, 'ip-b', null, f.cfg, at + 2);
  await new TurnStore(f.binding, BILLING_ORG).finish(r2.id!, { charged: true, outcome: 'answered' });
  assert.equal((await f.trial.summary(f.key, f.user, at)).used, 3);
  await f.trial.initialize(f.key, f.user, at);
  assert.equal((await f.trial.summary(f.key, f.key, at)).used, 3);
  f.db.prepare("INSERT INTO gpt_turn_reservations(org_id,id,subject,ip_hash,status,created_at,expires_at) VALUES(?,?,?,?,'done',?,?)")
    .bind(BILLING_ORG, 'acct-free:old-bonus', 'old-paid-account', 'ip-a', at, at + 120000).runSync();
  await f.trial.initialize('trial:fresh', 'old-paid-account', at);
  assert.equal((await f.trial.summary('trial:fresh', 'old-paid-account', at)).used, 0, 'paid included bonus never spends the new lifetime trial');
});

test('active paid pack keeps R2 and remains available after exhausted trial', async () => {
  const f = await fixture();
  f.db.prepare('INSERT INTO gpt_trial_usage VALUES(?,?,3,?)').bind(BILLING_ORG, f.key, at).runSync();
  f.db.prepare('INSERT INTO gpt_access_periods(org_id,order_id,user_id,mode,starts_at,ends_at,message_limit) VALUES(?,?,?,?,?,?,?)')
    .bind(BILLING_ORG, 'pack-fixture', f.user, 'live', at - 1, at + 86400_000, 300).runSync();
  const period = { org_id: BILLING_ORG, order_id: 'pack-fixture', user_id: f.user, mode: 'live', starts_at: at - 1, ends_at: at + 86400_000, message_limit: 300, revoked_at: null };
  const r = await f.turns.reserve(f.user, 'ip-a', period as never, f.cfg, at);
  assert.ok(r.id); assert.equal(r.bucket, 'free'); assert.ok(r.id.startsWith('acct-free:'));
  await f.turns.finish(r.id, { charged: true, outcome: 'answered' });
  assert.equal((await f.trial.summary(f.key, f.key, at)).used, 3);
});

test('signed cookie, account claim/reload and invalid identity fail without calling AI', async () => {
  const f = await fixture();
  const request = (cookie: string) => new Request('https://gpt.test/api/gpt/account', { headers: { cookie } });
  assert.equal(await readTrialKey(request(f.trialCookie), f.cfg), f.key);
  assert.equal(await readTrialKey(request(f.trialCookie.replace(/.$/, v => v === 'a' ? 'b' : 'a')), f.cfg), null);
  const first = await account(f.ctx(request(''))); assert.equal(first.status, 200);
  const firstCookie = first.headers.get('set-cookie')!; assert.match(firstCookie, /HttpOnly; Secure; SameSite=Lax/);
  const body = await first.json() as Record<string, any>; assert.equal(body.trial.remaining, 3);
  assert.equal(validAccountView(body), true);
  assert.equal(validAccountView({ ...body, trial: { ...body.trial, used: 4 } }), false);
  const refresh = await account(f.ctx(request(firstCookie.split(';')[0]))); assert.equal(refresh.headers.get('set-cookie'), null);
  assert.equal((await refresh.json() as typeof body).trial.resets, 'never');
  const response = await chat(f.ctx(new Request('https://gpt.test/api/gpt/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Hello trial', locale: 'ru' }) })) as never);
  assert.equal(response.status, 409); assert.equal((await response.json() as typeof body).code, 'trial_identity_required');
});

test('real JSON handler settles exactly 3 successful mocked AI calls; fourth never reaches provider', async () => {
  const f = await fixture(); f.env.OPENROUTER_API_KEY = randomBytes(32).toString('hex');
  f.env.GPT_FREE_TIER_PAID_PRIMARY = 'false';
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ id: 'fixture', model: f.cfg.freeModel, choices: [{ message: { content: 'A completed offline reply' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    for (let n = 0; n < 3; n++) {
      const response = await chat(f.ctx(new Request('https://gpt.test/api/gpt/chat', { method: 'POST', headers: { cookie: f.trialCookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'A trial question', locale: n % 2 ? 'uz' : 'ru' }) })) as never);
      assert.equal(response.status, 200); const body = await response.json() as Record<string, any>;
      assert.equal(body.ok, true); assert.equal(body.charged, true); assert.equal(body.remaining, 2 - n);
    }
    assert.equal((await f.trial.summary(f.key, f.key)).used, 3);
    assert.equal(calls, 3);
    const last = await chat(f.ctx(new Request('https://gpt.test/api/gpt/chat', { method: 'POST', headers: { cookie: f.trialCookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Fourth turn', locale: 'ru' }) })) as never);
    assert.equal(last.status, 429); assert.equal(calls, 3);
  } finally { globalThis.fetch = previous; }
});

test('actual fourth chat endpoint refuses before any upstream fetch, no retry tomorrow', async () => {
  const f = await fixture();
  f.db.prepare('INSERT INTO gpt_trial_usage VALUES(?,?,3,?)').bind(BILLING_ORG, f.key, at).runSync();
  const old = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('unexpected external call'); };
  try {
    const response = await chat(f.ctx(new Request('https://gpt.test/api/gpt/chat', { method: 'POST', headers: { cookie: f.trialCookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Fourth question', locale: 'uz', stream: true }) })) as never);
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), null);
    const body = await response.json() as Record<string, any>; assert.equal(body.reason, 'trial'); assert.equal(body.limits.lifetime, 3); assert.equal(body.retryAt, null);
  } finally { globalThis.fetch = old; }
});

test('migration and runtime schema match; permanent UI cap lifts only with server rights', () => {
  const db = new SqliteD1();
  db.exec('CREATE TABLE gpt_turn_reservations(org_id TEXT,id TEXT,subject TEXT,period_id TEXT,status TEXT,created_at INTEGER,expires_at INTEGER)');
  db.exec(readFileSync(new URL('../migrations/0078_gpt_lifetime_trial.sql', import.meta.url), 'utf8'));
  for (const sql of TRIAL_DDL) db.exec(sql);
  const event = { type: 'account' as const, freeRemaining: 0, packRemaining: null, freeLimits: { daily: 15, hourly: 5, lifetime: 3 }, now: at };
  const state = reduceLimit(null, event); assert.equal(state?.reason, 'trial'); assert.equal(canSendNow(state, at + 86400_000), false);
  assert.equal(reduceLimit(state, { ...event, now: at + 86400_000 })?.reason, 'trial');
  assert.equal(reduceLimit(state, { ...event, packRemaining: 300 }), null);
});
