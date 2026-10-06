import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRAFT_TTL_MS, archiveChat, clearDraft, clearHistory, clearSessionId, keepsComposer, keepsShownConversation, loadChats, loadDraft, loadHistory, loadRemaining, loadSessionId, saveDraft, saveHistory, saveRemaining, saveSessionId } from '../src/gpt-chat/storage';

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

test('after failed account reads the conversation on screen stays only with the visitor it was had with (F11)', () => {
  // The first view on a page, or after nothing was said: the stored history loads.
  assert.equal(keepsShownConversation(null, null, 'guest', false), false);
  assert.equal(keepsShownConversation(null, a, a, false), false);
  // Reads failed on load, the chat answered meanwhile: the conversation is
  // this visitor's, guest or signed in, and so is a turn still under way.
  assert.equal(keepsShownConversation(null, null, 'guest', true), true);
  assert.equal(keepsShownConversation(null, null, a, true), true);
  // Known as A, reads failed, A answers again.
  assert.equal(keepsShownConversation(null, a, a, true), true);
  // Known as A before the failure (or before signing out), now someone else:
  // A's words never land in another scope.
  assert.equal(keepsShownConversation(null, a, 'guest', true), false);
  assert.equal(keepsShownConversation(null, a, b, true), false);
  assert.equal(keepsShownConversation(null, 'guest', a, true), false);
  // A change between two answered views is an identity change, never a recovery.
  assert.equal(keepsShownConversation('guest', 'guest', a, true), false);
  assert.equal(keepsShownConversation(a, a, b, true), false);
});

test('the question in the composer survives signing in, and nothing else (WP-17)', () => {
  // Limit, pack window, sign-in, payment: the same person at the same keyboard.
  assert.equal(keepsComposer('guest', a), true);
  assert.equal(keepsComposer(a, a), true);
  assert.equal(keepsComposer('guest', 'guest'), true);
  // Signing out, or another account: the text may be someone else's.
  assert.equal(keepsComposer(a, 'guest'), false);
  assert.equal(keepsComposer(a, b), false);
  const console = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(console, /establishedIdentityRef\.current !== null && !keepsComposer\(establishedIdentityRef\.current, identity\)\) setInput\(""\);/);
  // On the way to a payment page the composer's text is kept, limit or not.
  assert.match(console, /const keepDraft = useCallback\(\(\) => saveDraft\(inputRef\.current\?\.value \?\? ""\), \[\]\);/);
  assert.match(console, /onLeave=\{keepDraft\}/);
});

test('nothing is lost when Telegram unloads the tab: the question at once, the answer as it comes, the draft always (PERSIST-01)', () => {
  const console = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  // The draft: one effect, 500 ms after typing, limit or not; an article's untouched question is no draft.
  assert.match(console, /useEffect\(\(\) => \{\s*if \(input === entry\?\.prompt\) return;\s*const timer = window\.setTimeout\(\(\) => saveDraft\(input\), 500\);\s*return \(\) => window\.clearTimeout\(timer\);\s*\}, \[input, entry\]\);/);
  assert.doesNotMatch(console, /if \(limited\) saveDraft|clearDraft/, 'the limit-only draft effects are gone');
  // Sending empties it at once.
  assert.match(console, /setInput\(""\);\s*\/\/[^\n]*\n\s*saveDraft\(""\);/);
  // The question is stored as it is sent, only while the account is known (F11).
  assert.match(console, /setMessages\(withUser\);\s*(?:\/\/[^\n]*\n\s*)*store\(\(scope\) => saveHistory\(withUser, config\.locale, scope\)\);/);
  // What has arrived: every 2 s from the deltas and when the tab is hidden or unloaded.
  assert.match(console, /const keep = \(\) => \{\s*if \(!acc \|\| generation !== identityGeneration\.current\) return;\s*storedAt = Date\.now\(\);\s*store\(\(scope\) => saveHistory\(\[\.\.\.held, \{ role: "assistant", content: acc, model: answeringModel, partial: true \}\], config\.locale, scope\)\);/);
  assert.match(console, /if \(Date\.now\(\) - storedAt >= 2_000\) keep\(\);/);
  assert.match(console, /if \(event\.type === "pagehide" \|\| document\.visibilityState === "hidden"\) flushRef\.current\?\.\(\);/);
  assert.match(console, /document\.addEventListener\("visibilitychange", flush\);\s*window\.addEventListener\("pagehide", flush\);/);
  assert.match(console, /if \(flushRef\.current === keep\) flushRef\.current = null;/);
  // A refusal (a limit, a check) or Stop before the first word takes the stored question back too.
  assert.match(console, /store\(\(scope\) => saveHistory\(before, config\.locale, scope\)\);/);
  assert.equal((console.match(/giveBack\(\);/g) ?? []).length, 3);
  // «Yangi chat» during a limit keeps the question the card says is kept (LIMIT-01).
  const newChat = console.slice(console.indexOf('const onNewChat ='), console.indexOf('const onRetry ='));
  assert.match(newChat, /if \(!limited\) setInput\(""\);/);
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
