import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { CHAT_BRIDGE_ENTRIES, CHAT_ENTRIES, chatEntryForArticle, chatEntryFromHash, chatEntryHref, chatEntryArticleHref } from '../src/shared/chat-entry';
import {
  renderChatEntry, CHAT_BRIDGES, ARTICLE_ONLY_BRIDGES, chatBridgeArticleHref, chatBridgeForArticle, chatBridgeHref, articleHasChatEntry, chatEntryPosition,
} from '../scripts/chat-entry-cta';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { detectBusinessTopic } from '../src/gpt-chat/business-intent';

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
  assert.equal(renderChatEntry('/uz/blog/biznes-uchun-ai-bot-nima-oddiy-tushuntirish/'), '');
  assert.equal(renderChatEntry('/'), '');
});

test('chat bridges print their question and open the chat with their fixed id, or bare while the chat does not know it', () => {
  const chatKnows = new Set<string>(CHAT_BRIDGE_ENTRIES.map(entry => entry.id));
  const entryIds = new Set<string>(CHAT_ENTRIES.map(entry => entry.id));
  const bridgeIds = new Set<string>();
  for (const bridge of CHAT_BRIDGES) {
    const article = JSON.parse(readFileSync(`content/blog/${bridge.locale}/${bridge.slug}.json`, 'utf8'));
    const url = chatBridgeArticleHref(bridge);
    assert.equal(article.url, url);
    assert.equal(article.status, 'published');
    assert.notEqual(article.robotsIndex, false);
    // A bridge never sits on a protected page, and never doubles a chat entry.
    assert.ok(!(PROTECTED_PATHS as readonly string[]).includes(url), url);
    assert.equal(chatEntryForArticle(url), undefined, url);
    assert.equal(chatBridgeForArticle(url), bridge);
    assert.ok(articleHasChatEntry(url));
    assert.ok(!entryIds.has(bridge.id) && !bridgeIds.has(bridge.id), `${bridge.id}: id is unique`);
    bridgeIds.add(bridge.id);
    const link = new URL(chatBridgeHref(bridge), 'https://gptbot.uz');
    assert.equal(link.pathname, bridge.locale === 'uz' ? '/uz/gpt-uzbek-tilida/' : '/ru/gpt-chat/');
    assert.equal(link.search, '');
    const html = renderChatEntry(url);
    assert.equal(bridge.chatFillsQuestion, chatKnows.has(bridge.id), `${bridge.id}: the flag says whether the chat reads the id`);
    if (bridge.chatFillsQuestion) {
      // Since R-S1 the chat knows the id, in the bridge's language only, and the
      // id is all that travels: the question comes from the registry, the way
      // back is the article itself.
      assert.equal(link.hash, `#entry=${bridge.id}`);
      const resolved = chatEntryFromHash(link.hash, bridge.locale);
      assert.ok(resolved, `${bridge.id}: the chat resolves the bridge id`);
      assert.equal(resolved.prompt, bridge.prompt);
      assert.equal(chatEntryArticleHref(resolved), url);
      assert.equal(chatEntryFromHash(link.hash, bridge.locale === 'uz' ? 'ru' : 'uz'), undefined);
      assert.ok(CHAT_BRIDGE_ENTRIES.some(entry => entry.id === bridge.id && entry.prompt === bridge.prompt));
      assert.match(html, /Namuna chatda tayyor bo‘ladi|Пример появится в чате/);
    } else {
      // A bridge the chat does not know yet (the school-pages release keeps the
      // chat's script, and so both protected chat pages, as they are): the link
      // carries nothing, and the block asks the reader to copy the question.
      assert.equal(link.hash, '');
      assert.equal(chatEntryFromHash(`#entry=${bridge.id}`), undefined, `${bridge.id}: the chat bundle does not know it`);
      assert.match(html, bridge.locale === 'ru' ? /Скопируйте пример в чат/ : /Namunani chatga ko‘chiring/);
      assert.doesNotMatch(html, /Namuna chatda tayyor bo‘ladi|Пример появится в чате/);
    }
    assert.ok(html.includes(`href="${chatBridgeHref(bridge)}" data-chat-entry="${bridge.id}"`), url);
    assert.doesNotMatch(html, /\?|target="_blank"/);
    assert.ok(html.includes(`«${bridge.prompt}»`), `${url}: the sample question is printed`);
    assert.match(html, bridge.locale === 'ru' ? /GPTBot\.uz · На русском[\s\S]*не продукт OpenAI/ : /GPTBot\.uz · O‘zbek tilida[\s\S]*mustaqil AI-xizmat/);
    assert.doesNotMatch(html, /официальн|rasmiy|ChatGPT Plus/i);
    for (const value of [bridge.title, bridge.prompt]) assert.doesNotMatch(value, /[<>&"]/);
    // Copying the sample question into the chat must not open the business form.
    assert.equal(detectBusinessTopic(bridge.prompt), null, bridge.prompt);
  }
  assert.equal(CHAT_BRIDGES.length, CHAT_BRIDGE_ENTRIES.length + ARTICLE_ONLY_BRIDGES.length);
  assert.ok(CHAT_BRIDGES.length >= 7);
});

test('the block keeps its place on articles with a chat entry and closes a section on a bridge', () => {
  for (const entry of CHAT_ENTRIES) {
    const article = JSON.parse(readFileSync(`content/blog/${entry.locale}/${entry.slug}.json`, 'utf8'));
    assert.equal(chatEntryPosition(article.url, article.body), Math.min(1, article.body.length - 1), article.url);
  }
  type Block = { type: string; text?: string; href?: string };
  const isHeading = (block?: Block) => block?.type === 'h2' || block?.type === 'h3';
  for (const bridge of CHAT_BRIDGES) {
    const article = JSON.parse(readFileSync(`content/blog/${bridge.locale}/${bridge.slug}.json`, 'utf8'));
    const body: Block[] = article.body;
    const at = chatEntryPosition(article.url, body);
    // The editorial heading exists, so the fallback rule is not in use.
    assert.equal(body.filter(block => isHeading(block) && block.text === bridge.before).length, 1, `${article.url}: «${bridge.before}»`);
    // The block closes a section: text before it, the named heading right after it.
    assert.ok(at >= 1, article.url);
    assert.ok(!isHeading(body[at]) && !['figure', 'toc'].includes(body[at].type), `${article.url}: text before the block`);
    assert.ok(isHeading(body[at + 1]) && body[at + 1].text === bridge.before, `${article.url}: a heading after the block`);
    // No second button into the same chat in the section that holds the block.
    let first = at;
    while (first > 0 && body[first].type !== 'h2') first--;
    let last = at + 1;
    while (last < body.length && body[last].type !== 'h2') last++;
    const section = body.slice(first, last);
    assert.equal(section.filter(block => block.type === 'cta' && block.href === chatBridgeHref(bridge)).length, 0, `${article.url}: one chat button per section`);
  }
  assert.equal(articleHasChatEntry('/uz/blog/biznes-uchun-ai-bot-nima-oddiy-tushuntirish/'), false);
});

test('account readiness never auto-starts checkout or login, and New Chat preserves the free session and quota', () => {
  // The account's data (start bundle), the pill and frame (start bundle) and
  // the window's body and screens (lazy part chat-account).
  const files = [
    'src/gpt-chat/use-account.ts', 'src/gpt-chat/components/AiAccountPanel.tsx', 'src/gpt-chat/account/AccountDialog.tsx',
    'src/gpt-chat/account/BotLoginScreen.tsx', 'src/gpt-chat/account/CheckoutReturn.tsx',
  ];
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
  const window = readFileSync('src/gpt-chat/account/AccountDialog.tsx', 'utf8');
  assert.match(window, /canStartCheckout\(data, locale\)/);
  assert.match(window, /termsVersion: data\.termsVersion/);
  const console = readFileSync('src/gpt-chat/components/AiChatConsole.tsx', 'utf8');
  const newChat = console.slice(console.indexOf('const onNewChat ='), console.indexOf('const onRetry ='));
  assert.ok(newChat.includes('archiveChat'), 'New Chat archives the current conversation');
  assert.doesNotMatch(newChat, /clearSessionId|setSessionId|saveRemaining|setRemaining/, 'New Chat cannot reset server session or quota');
});
