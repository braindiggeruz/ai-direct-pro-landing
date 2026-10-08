import assert from 'node:assert/strict';
import test from 'node:test';
import { wantsPresentation, isPresentationMessage } from '../src/gpt-chat/presentation';
import { sendChat, sendChatStream } from '../src/gpt-chat/api';
import { saveHistory, loadHistory, archiveChat, loadChats } from '../src/gpt-chat/storage';
import type { ChatMessage } from '../src/gpt-chat/types';
import { saveArtifact, loadArtifact, validateSnapshot, flushSnapshot, registerSnapshotFlusher, clearOwnerArtifacts, type PresentationSnapshot } from '../apps/studio/src/embedded/artifact-store';
import { applyPresentationEdit, parsePresentationEdit, presentationTopic } from '../apps/studio/src/tools/presentation/editing';
import { presentationTurn, registerSession, sessionKey, unregisterSession } from '../src/gpt-chat/parts/presentation-session';
import type { PresentationSession } from '../apps/studio/src/tools/presentation/session';

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
  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }, { role: 'assistant', kind: 'presentation', artifactId: 'presentation_12345678', content: 'private deck topic' }, {role:'user',kind:'artifact-action',artifactId:'presentation_12345678',content:'private local command'}, {role:'assistant',kind:'artifact-action',artifactId:'presentation_12345678',content:'local acknowledgement'}];
  const owner = 'a'.repeat(64);
  saveHistory(messages, 'ru', owner); archiveChat(messages, 'ru', owner);
  assert.ok(isPresentationMessage(loadHistory('ru', owner)[1]));
  assert.ok(isPresentationMessage(loadChats('ru', owner)[0].messages[1]));
  assert.equal(loadHistory('ru',owner)[2].kind,'artifact-action');
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

function readySnapshot(shape:'free'|'full'='full'):PresentationSnapshot {
  const task={topic:'Space',locale:'ru' as const,audience:'maktab' as const,slides:6,palette:1};
  return {version:1,locale:'ru',draft:{...task,shape},status:{kind:'ready'},pictures:[],result:{task,shape,aiLabel:true,
    job:{jobId:'sj_'+'b'.repeat(32),source:shape==='full'?'entitlement':'free',shape:{slides:6,images:0,notes:shape==='full',palette:1,parts:1},next:shape==='full'?'outline':'slides',expiresAt:'2026-10-10T00:00:00Z'},
    deck:{title:'Space',subtitle:'Fixture',slides:Array.from({length:6},(_,i)=>({index:i+1,title:`Slide ${i+1}`,bullets:['First fact','Second fact','Third fact'],layout:'title-bullets' as const,...(shape==='full'?{notes:'Speaker notes'}:{})}))}}};
}

test('local document operations are immutable, bounded, persisted and leave server regeneration input unchanged',()=>{
  const old=readySnapshot();
  assert.ok(old.result);
  const shortened=applyPresentationEdit(old.result,{kind:'shorten',index:3})!;
  assert.equal(shortened.deck.slides[2].bullets.length,2);
  assert.equal(old.result.deck.slides[2].bullets.length,3);
  assert.equal(shortened.revision,1);
  const palette=applyPresentationEdit(shortened,{kind:'palette',palette:3})!;
  assert.equal(palette.exportPalette,3);
  assert.deepEqual(palette.task,old.result.task,'server task MAC stays compatible');
  assert.deepEqual(palette.job,old.result.job,'local edits cannot mint or change paid job');
  const saved=validateSnapshot({...old,result:palette})!;
  assert.equal(saved.result?.revision,2);
  assert.equal(saved.result?.exportPalette,3);
  assert.equal(validateSnapshot({...old,result:{...palette,exportPalette:99}}),null);
  assert.equal(validateSnapshot({...old,result:{...palette,revision:NaN}}),null);
  assert.equal(applyPresentationEdit(readySnapshot('free').result!,{kind:'palette',palette:2}),null);
  for(const index of [-1,7,1.5]) assert.equal(applyPresentationEdit(palette,{kind:'shorten',index}),null);
  assert.equal(applyPresentationEdit(palette,{kind:'slide',index:1,title:'Edited',bullets:['only one']}),null);
  assert.equal(parsePresentationEdit('удали все данные',3),null);
  assert.deepEqual(parsePresentationEdit('сократи слайд 3',0),{kind:'shorten',index:3});
  assert.deepEqual(parsePresentationEdit('3 slaydni qisqartir',0),{kind:'shorten',index:3});
  assert.equal(presentationTopic('Сделай презентацию о космосе'),'космосе');
  assert.equal(presentationTopic('Iltimos, taqdimot yaratib ber'),'');
  assert.equal(applyPresentationEdit(shortened,{kind:'shorten',index:3}),null,'a no-op cannot falsely claim a new content revision');
});

test('selected session commands never buy or generate, never cross owners, and cannot mutate an active generation',()=>{
  let result=readySnapshot().result, edited=0, topic='', revealed=0;
  const session={working:false,result,unitsLeft:1,slides:6,topic:'',setTopic:(v:string)=>{topic=v;},edit:(op:Parameters<typeof applyPresentationEdit>[1])=>{const next=applyPresentationEdit(result!,op);if(!next)return false;result=next;edited++;return true;}} as unknown as PresentationSession;
  const key=sessionKey('owner-a','artifact_12345678');
  registerSession(key,{session,selected:3,reveal:()=>{revealed++;},purchase:()=>assert.fail('a text command cannot buy')});
  try {
    const turn=presentationTurn('owner-a','artifact_12345678','сократи слайд 3','ru');
    assert.equal(edited,1);
    assert.equal(turn[0].kind,'artifact-action');
    assert.match(turn[1].content,/Правка применена/);
    presentationTurn('owner-b','artifact_12345678','сократи слайд 3','ru');
    assert.equal(edited,1,'other identity has no controller access');
    session.working=true;
    assert.match(presentationTurn('owner-a','artifact_12345678','сократи слайд 3','ru')[1].content,/ещё идёт/);
    assert.equal(edited,1);
    session.working=false;session.result=null;
    presentationTurn('owner-a','artifact_12345678','Шёлковый путь','ru');
    assert.equal(topic,'Шёлковый путь');
    assert.equal(revealed,1);
    assert.equal(edited,1,'draft acceptance is not generation');
  } finally {unregisterSession(key);}
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
