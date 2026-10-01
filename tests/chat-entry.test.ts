import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
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
    // The block leads into the chat, whose header says GPTBot.uz (AGENTS.md 2).
    const html = renderChatEntry(article.url);
    assert.match(html, entry.locale === 'ru' ? /GPTBot\.uz · На русском/ : /GPTBot\.uz · O‘zbek tilida/);
    assert.doesNotMatch(html, /GPTBot AI/);
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

test('account readiness never auto-starts checkout or login, and New Chat preserves the free session and quota', () => {
  // The account's data (start bundle), the pill and frame (start bundle) and
  // the window's body (lazy part chat-account).
  const files = ['src/gpt-chat/use-account.ts', 'src/gpt-chat/components/AiAccountPanel.tsx', 'src/gpt-chat/components/AiAccountWindow.tsx'];
  const effects: Record<string, number> = {};
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    effects[file] = 0;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') {
        effects[file]++;
        const inspect = (child: ts.Node) => {
          if (ts.isCallExpression(child)) assert.doesNotMatch(child.expression.getText(source), /^(pay|post|run|location\.(assign|replace))$/, `${file}: effects may refresh status but must not create payment/login actions`);
          ts.forEachChild(child, inspect);
        };
        if (node.arguments[0]) inspect(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const file of files) assert.ok(effects[file] > 0, `${file}: account effects were actually inspected`);
  const window = readFileSync('src/gpt-chat/components/AiAccountWindow.tsx', 'utf8');
  assert.match(window, /canStartCheckout\(data, locale\)/);
  assert.match(window, /termsVersion: data\.termsVersion/);
  const console = readFileSync('src/gpt-chat/components/AiChatConsole.tsx', 'utf8');
  const newChat = console.slice(console.indexOf('const onNewChat ='), console.indexOf('const onRetry ='));
  assert.ok(newChat.includes('archiveChat'), 'New Chat archives the current conversation');
  assert.doesNotMatch(newChat, /clearSessionId|setSessionId|saveRemaining|setRemaining/, 'New Chat cannot reset server session or quota');
});
