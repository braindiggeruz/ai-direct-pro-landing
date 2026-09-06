import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveChat, clearHistory, clearSessionId, loadChats, loadHistory, loadRemaining, loadSessionId, saveHistory, saveRemaining, saveSessionId } from '../src/gpt-chat/storage';

const a = 'a'.repeat(64);
const b = 'b'.repeat(64);

function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  return values;
}

test('guest, account A, account B and locales have separate history, archives, session references and cached quota', () => {
  storage();
  for (const [scope, text, quota] of [[undefined, 'guest', 5], [a, 'private A', 200], [b, 'private B', 100]] as const) {
    const messages = [{ role: 'user' as const, content: text }];
    saveHistory(messages, 'ru', scope);
    archiveChat(messages, 'ru', scope);
    saveSessionId(`session-${text}`, 'ru', scope);
    saveRemaining(quota, 'ru', scope);
  }
  assert.equal(loadHistory('ru', a)[0].content, 'private A');
  assert.equal(loadChats('ru', b)[0].messages[0].content, 'private B');
  assert.equal(loadHistory('ru')[0].content, 'guest');
  assert.equal(loadSessionId('ru', a), 'session-private A');
  assert.equal(loadRemaining('ru', b), 100);
  assert.deepEqual(loadHistory('uz', a), []);
  clearHistory('ru', a);
  clearSessionId('ru', a);
  assert.equal(loadSessionId('ru', a), null);
  assert.equal(loadHistory('ru', b)[0].content, 'private B');
  assert.equal(loadHistory('ru')[0].content, 'guest');
  assert.equal(loadRemaining('ru', a), 200, 'Clearing conversation must not reset quota');
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
  assert.doesNotThrow(() => saveHistory([{ role: 'user', content: 'x' }], 'ru', a));
  assert.deepEqual(loadHistory('ru', a), []);
  assert.deepEqual(loadChats('ru', a), []);
  assert.equal(loadRemaining('ru', a), -1);
});
