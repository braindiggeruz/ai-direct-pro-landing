import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_TTL_MS, archiveChat, clearDraft, clearHistory, clearSessionId, loadChats, loadDraft, loadHistory, loadRemaining, loadSessionId, saveDraft, saveHistory, saveRemaining, saveSessionId } from '../src/gpt-chat/storage';

const a = 'a'.repeat(64);
const b = 'b'.repeat(64);

function storage(name: 'localStorage' | 'sessionStorage' = 'localStorage') {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, name, { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  return values;
}

test('guest, account A, account B and locales have separate history, archives and session references; quota is per account only', () => {
  storage();
  const session = storage('sessionStorage');
  for (const [scope, text, quota] of [[undefined, 'guest', 5], [a, 'private A', 200], [b, 'private B', 100]] as const) {
    const messages = [{ role: 'user' as const, content: text }];
    saveHistory(messages, 'ru', scope);
    archiveChat(messages, 'ru', scope);
    saveSessionId(`session-${text}`, 'ru', scope);
    saveRemaining(quota, scope);
  }
  assert.equal(loadHistory('ru', a)[0].content, 'private A');
  assert.equal(loadChats('ru', b)[0].messages[0].content, 'private B');
  assert.equal(loadHistory('ru')[0].content, 'guest');
  assert.equal(loadSessionId('ru', a), 'session-private A');
  assert.equal(loadRemaining(b), 100);
  assert.equal(loadRemaining(), 5);
  assert.deepEqual(loadHistory('uz', a), []);
  clearHistory('ru', a);
  clearSessionId('ru', a);
  assert.equal(loadSessionId('ru', a), null);
  assert.equal(loadHistory('ru', b)[0].content, 'private B');
  assert.equal(loadHistory('ru')[0].content, 'guest');
  assert.equal(loadRemaining(a), 200, 'Clearing conversation must not reset quota');
  // One count for the RU and the UZ chat (F12): the server keeps one allowance.
  assert.deepEqual([...session.keys()].sort(), ['gptchat_remaining', `gptchat_remaining_account_${a}`, `gptchat_remaining_account_${b}`]);
  saveRemaining(1, 'a@b.test');
  assert.equal(session.size, 3, 'a malformed scope writes nothing');
});

test('a refused question waits an hour in one draft, whoever signs in meanwhile', () => {
  const values = storage();
  const now = Date.parse('2026-10-01T10:00:00Z');
  assert.equal(loadDraft(now), '');
  saveDraft('Savolim: biznes reja', now);
  assert.deepEqual([...values.keys()], ['gptchat_draft']);
  assert.equal(loadDraft(now + DRAFT_TTL_MS - 1), 'Savolim: biznes reja');
  assert.equal(loadDraft(now + DRAFT_TTL_MS), '', 'an hour later it is gone');
  assert.equal(loadDraft(now - 1), '', 'a draft from the future is not trusted');
  saveDraft('   ', now);
  assert.equal(values.size, 0, 'an empty composer removes the draft');
  saveDraft('x', now);
  clearDraft();
  assert.equal(values.size, 0);
  values.set('gptchat_draft', '{"text":5,"savedAt":1}');
  assert.equal(loadDraft(now), '');
});

test('the truncation mark survives in history and in archived chats', () => {
  storage();
  const messages = [{ role: 'user' as const, content: 'q' }, { role: 'assistant' as const, content: 'long', truncated: true }];
  saveHistory(messages, 'uz');
  assert.equal(loadHistory('uz')[1].truncated, true);
  assert.equal(loadHistory('uz')[0].truncated, false);
  archiveChat(messages, 'uz');
  assert.equal(loadChats('uz')[0].messages[1].truncated, true);
});

test('authenticated history never silently imports legacy guest history or accepts malformed identity', () => {
  const values = storage();
  values.set('gptchat_history', JSON.stringify([{ role: 'user', content: 'old guest secret' }]));
  values.set('gptchat_sid', 'old-guest-session');
  assert.equal(loadHistory('ru')[0].content, 'old guest secret');
  assert.deepEqual(loadHistory('ru', a), []);
  assert.equal(loadSessionId('ru', a), null);
  saveHistory([{ role: 'user', content: 'must not write' }], 'ru', 'invalid/email@example.com');
  assert.deepEqual(loadHistory('ru', 'invalid/email@example.com'), []);
  assert.equal(values.size, 2);
});

test('storage denial remains nonfatal and cannot leak another scope', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('unavailable'); } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('unavailable'); } });
  assert.doesNotThrow(() => saveHistory([{ role: 'user', content: 'x' }], 'ru', a));
  assert.deepEqual(loadHistory('ru', a), []);
  assert.deepEqual(loadChats('ru', a), []);
  assert.equal(loadRemaining(a), -1);
  assert.doesNotThrow(() => saveRemaining(3, a));
  assert.doesNotThrow(() => saveDraft('x'));
  assert.equal(loadDraft(), '');
});
