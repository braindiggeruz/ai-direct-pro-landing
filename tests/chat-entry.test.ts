import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAT_ENTRIES, chatEntryForArticle, chatEntryFromHash, chatEntryHref, chatEntryArticleHref } from '../src/shared/chat-entry';
import { renderChatEntry } from '../scripts/chat-entry-cta';

test('every entry has a published article and resolves to a fixed prompt and local return path', () => {
  for (const entry of CHAT_ENTRIES) {
    const article = JSON.parse(readFileSync(`content/blog/${entry.locale}/${entry.slug}.json`, 'utf8'));
    assert.equal(article.status, 'published');
    assert.equal(chatEntryForArticle(article.url), entry);
    const link = new URL(chatEntryHref(entry), 'https://gptbot.uz');
    assert.equal(link.pathname, entry.locale === 'uz' ? '/uz/gpt-uzbek-tilida/' : '/ru/gpt-chat/');
    assert.equal(chatEntryArticleHref(entry), article.url);
    assert.equal(link.search, '');
    assert.equal(chatEntryFromHash(link.hash), entry);
    assert.ok(renderChatEntry(article.url).includes(`href="${chatEntryHref(entry)}"`));
  }
});

test('Russian entry keeps the article language and never promises official Plus access', () => {
  for (const id of ['compare-ru', 'payment-ru']) {
    const entry = chatEntryFromHash(`#entry=${id}`, 'ru');
    assert.ok(entry);
    assert.equal(chatEntryFromHash(`#entry=${id}`, 'uz'), undefined);
    assert.match(chatEntryHref(entry), /^\/ru\/gpt-chat\/#entry=/);
    const html = renderChatEntry(chatEntryArticleHref(entry));
    assert.match(html, /Открыть AI-чат/);
    assert.match(html, /не продукт OpenAI/);
    assert.doesNotMatch(html, /target="_blank"/);
    if (id === 'payment-ru') assert.match(html, /не подписка ChatGPT Plus/);
  }
  assert.equal(chatEntryFromHash('#entry=download', 'ru'), undefined);
});

test('arbitrary prompts, external return URLs and unknown IDs are never consumed', () => {
  for (const hash of ['#entry=unknown', '#prompt=private-message', '#entry=__proto__', '#entry=constructor', '#entry=https://evil.test']) {
    assert.equal(chatEntryFromHash(hash), undefined);
  }
  assert.equal(chatEntryFromHash('#entry=essay&prompt=private&return=https://evil.test')?.prompt, CHAT_ENTRIES.find(e => e.id === 'essay')?.prompt);
  assert.equal(renderChatEntry('/uz/blog/chat-gpt-uzbek-biznes-uchun/'), '');
  assert.equal(renderChatEntry('/'), '');
});

test('UI release cannot call unfinished payment endpoints or reset the production free session', () => {
  const panel = readFileSync('src/gpt-chat/components/AiAccountPanel.tsx', 'utf8');
  assert.doesNotMatch(panel, /fetch\(|\/api\/gpt\//);
  const console = readFileSync('src/gpt-chat/components/AiChatConsole.tsx', 'utf8');
  assert.doesNotMatch(console, /clearSessionId|setSessionId\(null\)/);
});
