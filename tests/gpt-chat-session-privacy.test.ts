import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';

import { onRequestGet as historyGet } from '../functions/api/gpt/history';
import { onRequestPost as sessionPost } from '../functions/api/gpt/session';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { SqliteD1 } from './helpers/sqlite-d1';

// Production shape after release R2: a 32-byte salt whose SINCE has passed.
// Ownership must not depend on it (the token hash is never salted).
const SALTED = { GPT_HASH_SALT: randomBytes(32).toString('hex'), GPT_HASH_SALT_SINCE: '2026-01-01T00:00:00Z' };

async function create(db: SqliteD1) {
  const response = await sessionPost({
    request: new Request('https://gptbot.uz/api/gpt/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
      body: JSON.stringify({ locale: 'ru', source: 'test' }),
    }),
    env: { GPTBOT_DRAFTS_DB: db.asD1(), ...SALTED },
  } as never);
  const body = await response.json() as { sessionId: string; persisted: boolean };
  const setCookie = response.headers.get('set-cookie') || '';
  const sid = /gpt_sid=([^;,]+)/.exec(setCookie)?.[1];
  const token = /gpt_sat=([^;,]+)/.exec(setCookie)?.[1];
  assert.ok(sid && token, `both ownership cookies are required: ${setCookie}`);
  return { body, cookie: `gpt_sid=${sid}; gpt_sat=${token}`, token };
}

function history(db: SqliteD1 | null, sessionId: string, cookie?: string) {
  return historyGet({
    request: new Request(`https://gptbot.uz/api/gpt/history?sessionId=${encodeURIComponent(sessionId)}`, {
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env: { ...(db ? { GPTBOT_DRAFTS_DB: db.asD1() } : {}), ...SALTED },
  } as never);
}

test('anonymous history requires both HttpOnly ownership cookies', async () => {
  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  const created = await create(db);
  assert.equal(created.body.persisted, true);
  assert.equal(created.body.sessionId.startsWith('sess_'), true);
  // The token is stored as its plain sha256, the IP only as the salted v2 hash.
  const stored = db.rows<{ anon_token: string; hashed_ip: string }>('SELECT anon_token, hashed_ip FROM gpt_sessions')[0];
  assert.equal(stored.anon_token, createHash('sha256').update(created.token).digest('hex'));
  assert.match(stored.hashed_ip, /^h2_[0-9a-f]{64}$/);
  db.sqlite.prepare(
    'INSERT INTO gpt_messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)',
  ).run('msg_1', created.body.sessionId, 'user', 'private message', new Date().toISOString());

  assert.equal((await history(db, created.body.sessionId)).status, 403);
  assert.equal((await history(db, created.body.sessionId, `gpt_sid=${created.body.sessionId}`)).status, 403);
  assert.equal((await history(
    db,
    created.body.sessionId,
    `gpt_sid=${created.body.sessionId}; gpt_sat=wrong-secret`,
  )).status, 403);
  assert.equal((await history(
    db,
    created.body.sessionId,
    `gpt_sid=${created.body.sessionId}; gpt_sat=%E0%A4%A`,
  )).status, 403);

  const allowed = await history(db, created.body.sessionId, created.cookie);
  assert.equal(allowed.status, 200);
  const payload = await allowed.json() as { messages: Array<{ content: string }> };
  assert.deepEqual(payload.messages.map((message) => message.content), ['private message']);
});

test('a valid token for one session cannot read another session', async () => {
  const db = new SqliteD1();
  const first = await create(db);
  const second = await create(db);
  const crossed = `gpt_sid=${second.body.sessionId}; gpt_sat=${first.token}`;
  assert.equal((await history(db, second.body.sessionId, crossed)).status, 403);
});

test('missing storage is an explicit failure, never an empty-history success', async () => {
  const db = new SqliteD1();
  const created = await create(db);
  assert.equal((await history(null, created.body.sessionId, created.cookie)).status, 503);
});

test('a scanner cannot fill the session table: past the hour’s ceiling an address gets an unstored id, and `source` is a label or the default', async () => {
  const { SESSIONS_PER_HOUR } = await import('../functions/api/gpt/session');
  assert.equal(SESSIONS_PER_HOUR, 120, 'generous: a school or a carrier shares one address');
  const db = new SqliteD1();
  const post = (ip: string, body: unknown) => sessionPost({
    request: new Request('https://gptbot.uz/api/gpt/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
    }),
    env: { GPTBOT_DRAFTS_DB: db.asD1(), ...SALTED },
  } as never);
  // What a scanner sends as `source` (11.11.2026) is never stored; a label is.
  for (const source of ['$(nslookup -q=cname x.bxss.me||curl x)', '<ScRiPt>alert(1)</ScRiPt>', '../../../../etc/passwd', 'A'.repeat(60), 'Gpt Chat', '', 7, null])
    assert.equal(((await (await post('198.51.100.7', { locale: 'uz', source })).json()) as { ok: boolean }).ok, true);
  await post('198.51.100.7', { locale: 'uz', source: 'gpt_chat' });
  await post('198.51.100.7', { locale: 'uz', source: 'article_cta' });
  assert.deepEqual(
    JSON.parse(String(db.value("SELECT json_group_array(source) FROM (SELECT DISTINCT source FROM gpt_sessions ORDER BY source)"))),
    ['article_cta', 'gpt_chat'],
  );
  // The ceiling: every request is answered ok, but only SESSIONS_PER_HOUR rows are written for one address.
  const before = Number(db.value('SELECT COUNT(*) FROM gpt_sessions'));
  let stored = 0;
  let unstored = 0;
  let cookies = 0;
  for (let i = 0; i < SESSIONS_PER_HOUR + 15; i += 1) {
    const response = await post('203.0.113.200', { locale: 'ru' });
    const body = (await response.json()) as { ok: boolean; sessionId: string; persisted: boolean };
    assert.equal(response.status, 200);
    assert.ok(body.ok && /^sess_/.test(body.sessionId), 'the chat still gets an id');
    if (body.persisted) stored += 1; else unstored += 1;
    if (response.headers.get('set-cookie')) cookies += 1;
  }
  assert.deepEqual([stored, unstored, cookies], [SESSIONS_PER_HOUR, 15, SESSIONS_PER_HOUR]);
  assert.equal(Number(db.value('SELECT COUNT(*) FROM gpt_sessions')) - before, SESSIONS_PER_HOUR);
  // Another address is not held back by it.
  const other = (await (await post('203.0.113.201', { locale: 'ru' })).json()) as { persisted: boolean };
  assert.equal(other.persisted, true);
  // The counter keeps a hash, never the address.
  assert.doesNotMatch(String(db.value("SELECT json_group_array(subject) FROM gpt_rate_limits WHERE action='gpt_session'")), /203\.0\.113/);
});
