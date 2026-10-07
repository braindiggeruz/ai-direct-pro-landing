import assert from 'node:assert/strict';
import test from 'node:test';
import { wantsPresentation, isPresentationMessage } from '../src/gpt-chat/presentation';
import { sendChat, sendChatStream } from '../src/gpt-chat/api';
import { saveHistory, loadHistory, archiveChat, loadChats } from '../src/gpt-chat/storage';
import type { ChatMessage } from '../src/gpt-chat/types';
import { saveArtifact, loadArtifact, validateSnapshot, flushSnapshot, registerSnapshotFlusher, clearOwnerArtifacts, type PresentationSnapshot } from '../apps/studio/src/embedded/artifact-store';

test('explicit RU/UZ requests open the tool; explanations and negations stay in normal chat', () => {
  for (const text of ['Сделай презентацию о космосе', 'Пожалуйста, подготовь мне презентацию', 'Fotosintez haqida taqdimot tayyorla', 'Taqdimot yaratib ber', 'Iltimos, taqdimot tayyorla']) {
    assert.equal(wantsPresentation(text), true, text);
  }
  for (const text of ['Как сделать презентацию?', 'Не создай презентацию', 'Что значит taqdimot yaratish?', 'Taqdimot nima?', 'Объясни слово презентация', 'Текст для презентации']) assert.equal(wantsPresentation(text), false, text);
});

test('artifact references survive history/archive, stay owner-scoped, and never enter either LLM transport', async t => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }, { role: 'assistant', kind: 'presentation', artifactId: 'presentation_12345678', content: 'private deck topic' }];
  const owner = 'a'.repeat(64);
  saveHistory(messages, 'ru', owner); archiveChat(messages, 'ru', owner);
  assert.ok(isPresentationMessage(loadHistory('ru', owner)[1]));
  assert.ok(isPresentationMessage(loadChats('ru', owner)[0].messages[1]));
  assert.deepEqual(loadHistory('ru', 'b'.repeat(64)), []);
  assert.equal(isPresentationMessage({ ...messages[1], artifactId: 'bad' }), false);
  const bodies: { history: unknown[] }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true, answer: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
  });
  const params = { sessionId: null, message: 'continue text', locale: 'ru' as const, history: messages };
  await sendChat('', params);
  await sendChatStream('', params, { onDelta() {} }, new AbortController().signal);
  assert.equal(bodies.length, 2);
  for (const body of bodies) assert.deepEqual(body.history, [{ role: 'user', content: 'hello' }]);
});

test('local artifacts are bounded, validated and isolated; a missing/failed flusher blocks payment', async () => {
  const snapshot: PresentationSnapshot = { version: 1, locale: 'ru', draft: { topic: 'Space', audience: 'maktab', slides: 6, shape: 'free', palette: 1 }, result: null, status: { kind: 'working' }, pictures: [] };
  assert.equal(validateSnapshot({ ...snapshot, draft: { ...snapshot.draft, topic: 'x'.repeat(501) } }), null);
  assert.equal(validateSnapshot({ ...snapshot, pictures: [{ index: 1, status: 'ready', blob: new Blob(['x']) }] }), null);
  const result = await saveArtifact('owner-a', 'artifact-12345678', snapshot);
  assert.equal(result.persistent, false, 'Node has no IndexedDB; tab fallback is explicitly non-durable');
  assert.deepEqual(await loadArtifact('owner-a', 'artifact-12345678'), snapshot);
  assert.equal(await loadArtifact('owner-b', 'artifact-12345678'), null);
  await assert.rejects(flushSnapshot('owner-a', 'missing'), /not_ready/);
  const unregister = registerSnapshotFlusher('owner-a', 'artifact-12345678', async () => { throw Error('quota'); });
  await assert.rejects(flushSnapshot('owner-a', 'artifact-12345678'), /quota/);
  unregister();
  await clearOwnerArtifacts('owner-a');
  assert.equal(await loadArtifact('owner-a', 'artifact-12345678'), null);
});
