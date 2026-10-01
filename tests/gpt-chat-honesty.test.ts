// What the chat says about itself (plan WP-09, decision D9, map 03 §3.7, §4,
// §8): no subscription tier anywhere, the brand is «GPTBot.uz», the line
// under the composer says on every screen that this is not OpenAI and where a
// question goes, the free allowance is the server's, nothing offers a price
// that cannot be paid, and analytics sends one event per thing that happened.
//
// Run: node --import tsx --test tests/gpt-chat-honesty.test.ts
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import { EV, GA4_PARAMS, track } from '../src/gpt-chat/analytics';
import { strings } from '../src/gpt-chat/i18n';
import { accountStrings } from '../src/gpt-chat/account-strings';
import { leadStrings } from '../src/gpt-chat/lead-strings';
import { showsAccountPill, type AccountView } from '../src/gpt-chat/types';
import { AiChatInput } from '../src/gpt-chat/components/AiChatInput';
import { AiChatMessageList } from '../src/gpt-chat/components/AiChatMessageList';
import { MessageScroller, MessageScrollerProvider, MessageScrollerViewport } from '../src/components/ui/message-scroller';

// tsx compiles .tsx with the classic transform in tests (as in
// tests/gpt-chat-handoff-link.test.ts).
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');
const LOCALES = ['ru', 'uz'] as const;
/** The plan's acceptance grep: `rg -n "Plus|obuna|подписк|GPTBot AI" src/gpt-chat functions/api/gpt`. */
const DISHONEST = /Plus|obuna|подписк|GPTBot AI/;

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const relative = `${dir}/${name}`;
    return statSync(path.join(ROOT, relative)).isDirectory() ? files(relative) : [relative];
  });
}

/** Every string a copy object yields, functions called with sample numbers. */
function allCopy(t: object): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      for (const args of [[0], [1], [5], [15], [null], [{ daily: 15, hourly: 5 }], [15, true], [50, 3, false]]) {
        const result = (value as (...a: unknown[]) => unknown)(...args);
        if (typeof result === 'string') out.push(result);
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(t);
  return out;
}

const guest = (over: Partial<AccountView> = {}): AccountView => ({
  ok: true, loginAvailable: false, mode: null, providers: [], user: null,
  terms: { ru: null, uz: null }, termsVersion: null, freeLimits: { daily: 15, hourly: 5 }, ...over,
});

test('no file of the chat or its server says Plus, obuna, подписк or GPTBot AI', () => {
  const scanned = [...files('src/gpt-chat'), ...files('functions/api/gpt')]
    .filter((file) => /\.(ts|tsx|css)$/.test(file));
  assert.ok(scanned.includes('src/gpt-chat/i18n.ts') && scanned.includes('functions/api/gpt/chat.ts'));
  for (const file of scanned) {
    read(file).split('\n').forEach((line, i) => {
      assert.doesNotMatch(line, DISHONEST, `${file}:${i + 1}`);
    });
  }
});

test('no line the chat can show, in either language, names a tier or the old brand', () => {
  for (const locale of LOCALES) {
    // The chat's lines, and those of its lazy parts: the pack window and the business card.
    for (const line of [...allCopy(strings(locale)), ...allCopy(accountStrings(locale)), ...allCopy(leadStrings(locale))]) {
      assert.doesNotMatch(line, DISHONEST, `${locale}: ${line}`);
      assert.doesNotMatch(line, /\bPro\b|Tez orada|Скоро/, `${locale}: ${line}`);
    }
  }
  // Removed with the cap stages and the old paywall; their return would bring the copy back.
  const keys = new Set([...Object.keys(strings('ru')), ...Object.keys(strings('ru').premium)]);
  for (const dead of ['actionCost', 'plusBadge', 'planBadge', 'paywallTitle', 'paywallBody', 'plusManualNote', 'hourlyRetry', 'capLeadCta', 'leadIntroCap', 'quickActions']) {
    assert.ok(!keys.has(dead), dead);
  }
});

test('the brand is GPTBot.uz in the header, the composer and above every answer', () => {
  for (const locale of LOCALES) {
    const t = strings(locale);
    assert.equal(t.brand, 'GPTBot.uz');
    const input = renderToStaticMarkup(React.createElement(AiChatInput, {
      value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t, inputRef: React.createRef<HTMLTextAreaElement>(),
    }));
    assert.match(input, /class="gpt-input-identity">.*GPTBot\.uz<\/span>/);
    // The list lives inside the console's scroller, as it does on the page.
    const list = React.createElement(AiChatMessageList, {
      t, messages: [{ role: 'user', content: 'Savol' }, { role: 'assistant', content: 'Javob', model: 'model-a' }],
    });
    const answer = renderToStaticMarkup(React.createElement(MessageScrollerProvider, null,
      React.createElement(MessageScroller, null, React.createElement(MessageScrollerViewport, null, list))));
    assert.match(answer, /class="gpt-answer-head">.*GPTBot\.uz<\/div>/);
    // The «in the pack, a follow-up costs one answer» line under every last answer is gone.
    assert.doesNotMatch(answer, /limit|лимит/i);
  }
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /data-testid="ai-header-brand">[\s\S]{0,120}<span>\{t\.brand\}<\/span>/);
});

test('under the composer, on every screen: not OpenAI, and questions go to foreign AI providers', () => {
  const expected = {
    ru: ['Не продукт OpenAI', 'зарубежным AI-провайдерам', 'не пишите личные данные'],
    uz: ['OpenAI mahsuloti emas', 'xorijdagi AI-provayderlarga', 'shaxsiy ma’lumot yozmang'],
  };
  for (const locale of LOCALES) {
    const t = strings(locale);
    for (const part of expected[locale]) assert.ok(t.inputMicrocopy.includes(part), `${locale}: ${part}`);
    const input = renderToStaticMarkup(React.createElement(AiChatInput, {
      value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t, inputRef: React.createRef<HTMLTextAreaElement>(),
    }));
    assert.ok(input.includes(`<span data-testid="ai-input-microcopy">${t.inputMicrocopy}</span>`), locale);
    // The menu's disclaimer (hidden on a phone until ☰) says the same and more.
    assert.match(t.disclaimer, /GPTBot\.uz/);
    assert.match(t.disclaimer, /OpenAI/);
  }
  // Nothing hides the line on a narrow screen.
  const css = read('src/gpt-chat/premium.css');
  for (const rule of css.matchAll(/([^{}]*gpt-input-footnote[^{}]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(rule[2], /display:\s*none|visibility:\s*hidden/, rule[0]);
    const size = rule[2].match(/font-size:\s*(\d+)px/);
    if (size) assert.ok(Number(size[1]) >= 10, `${rule[0]}: the line shrinks below 10px`);
  }
});

test('the resting screen states the server’s daily and hourly allowance, in agreement', () => {
  const ru = strings('ru');
  const uz = strings('uz');
  assert.equal(ru.emptyMeta({ daily: 15, hourly: 5 }), 'Бесплатно, без регистрации: до 15 сообщений в день и 5 в час.');
  assert.equal(uz.emptyMeta({ daily: 15, hourly: 5 }), 'Bepul, ro‘yxatdan o‘tmasdan: kuniga 15 ta, soatiga 5 tagacha xabar.');
  assert.match(ru.emptyMeta({ daily: 21, hourly: 3 }), /до 21 сообщения в день и 3 в час/);
  assert.match(ru.emptyMeta({ daily: 11, hourly: 2 }), /до 11 сообщений/);
  assert.match(ru.emptyMeta({ daily: 1, hourly: 1 }), /до 1 сообщения/);
  // Before the account view answers, no number at all rather than a guessed one.
  for (const t of [ru, uz]) assert.doesNotMatch(t.emptyMeta(null), /\d/);
  assert.equal(ru.hourWarning(1), 'В этот час можно отправить ещё 1 сообщение.');
  assert.equal(ru.hourWarning(3), 'В этот час можно отправить ещё 3 сообщения.');
  assert.equal(ru.hourWarning(5), 'В этот час можно отправить ещё 5 сообщений.');
  assert.equal(uz.hourWarning(1), 'Bu soat ichida yana 1 ta xabar yuborishingiz mumkin.');

  // Every Russian counter the chat shows agrees with its number: the header
  // badge, the low-limit line and the composer's character count.
  assert.equal(ru.remaining(1), 'Осталось 1 сообщение сегодня');
  assert.equal(ru.remaining(3), 'Осталось 3 сообщения сегодня');
  assert.equal(ru.remaining(11), 'Осталось 11 сообщений сегодня');
  assert.equal(ru.lowWarning(0), 'Осталось 0 сообщений на сегодня.');
  assert.equal(ru.lowWarning(1), 'Осталось 1 сообщение на сегодня.');
  assert.equal(ru.lowWarning(2), 'Осталось 2 сообщения на сегодня.');
  assert.equal(ru.charsLeft(1), '1 символ до лимита');
  assert.equal(ru.charsLeft(22), '22 символа до лимита');
  assert.equal(ru.charsLeft(200), '200 символов до лимита');

  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /t\.emptyMeta\(freeLimits\)/);
  assert.match(consoleSource, /setHourLeft\(outcome\.hourRemaining \?\? null\)/);
  assert.match(consoleSource, /t\.hourWarning\(hourLeft\)/);
  assert.match(consoleSource, /t\.premium\.activeLine\(remaining\)/);
  assert.doesNotMatch(consoleSource, /15 сообщений|kuniga 15/);
});

test('no price and no pack button while a pack cannot be bought (F4, F6)', () => {
  // Production today: a guest, billing off. No pill.
  assert.equal(showsAccountPill(null), false);
  assert.equal(showsAccountPill(guest()), false);
  assert.equal(showsAccountPill(guest({ mode: 'live', providers: [] })), false, 'a mode without a provider sells nothing');
  assert.equal(showsAccountPill(guest({ mode: 'live', providers: ['click'] })), true);
  assert.equal(showsAccountPill(guest({ user: { signedIn: true, storageKey: 'a'.repeat(64) } })), true, 'an account has its window');
  assert.equal(showsAccountPill(guest({
    user: { signedIn: true, storageKey: 'a'.repeat(64) },
    access: { order_id: 'o', ends_at: Date.now() + 1e9, remaining: 10, renewSoon: false, refund_requested_at: null },
  })), true);

  const panel = read('src/gpt-chat/components/AiAccountPanel.tsx');
  assert.match(panel, /const reachable = showsAccountPill\(data\);/);
  assert.match(panel, /\{reachable && \(\s*<DialogTrigger asChild>/);
  assert.match(panel, /\{data\?\.access \? t\.premium\.accountActive : t\.premium\.account\}/);
  const window = read('src/gpt-chat/components/AiAccountWindow.tsx');
  assert.match(window, /\{!loading && billingAvailable && !data\?\.access && \(\s*<Card className="gpt-plan-card">/);
  assert.match(window, /copy\.packFeatures\.map/);
  assert.match(window, /const copy = accountStrings\(locale\);/);
  // Every word the window shows comes from the copy files, in the visitor's language.
  for (const source of [panel, window]) assert.doesNotMatch(source, /locale === ['"]uz['"] \? ['"][^'"]*[a-zа-я]{3}/i);

  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  const low = consoleSource.slice(consoleSource.indexOf('{t.lowWarning(remaining)}'), consoleSource.indexOf('openAccount("low_limit")'));
  assert.match(low, /\{billingAvailable && \(\s*<button/);
  assert.match(consoleSource, /setBillingAvailable\(billingOpen\(account\)\)/);
  assert.doesNotMatch(consoleSource, /chat-bot-narxi|pricingHref/, 'the free chat sends nobody to the business price list (F10)');
});

test('with the pack button in the header, the Russian chat’s switch is never cut', () => {
  // «AI-пакет» is wider than the old label: at 375px «O‘zbekcha» overflowed its link
  // by 5px and was clipped. While the button shows, the code comes back below
  // 390px, as it does for everyone below 375px.
  const css = read('src/gpt-chat/premium.css');
  const rule = css.match(/@media \(max-width: 389px\) \{([^@]*)\}/);
  assert.ok(rule, 'a 389px rule exists');
  assert.match(rule[1], /\.gpt-header:has\(\.gpt-account-trigger\) \.gpt-lang-full \{ display: none; \}/);
  assert.match(rule[1], /\.gpt-header:has\(\.gpt-account-trigger\) \.gpt-lang-short \{ display: inline; \}/);
  // The class it keys on is the one the pill carries.
  assert.match(read('src/gpt-chat/components/AiAccountPanel.tsx'), /className="gpt-account-trigger"/);
});

test('the console renders without a pill, a tier or the old brand before the account answers', async (t) => {
  const g = globalThis as Record<string, unknown>;
  const memory = () => {
    const values = new Map<string, string>();
    return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memory() });
  t.after(() => { delete g.window; delete g.location; });
  g.window = globalThis;
  g.location = { hash: '', pathname: '/ru/gpt-chat/', href: 'https://gptbot.uz/ru/gpt-chat/' };
  const { AiChatConsole } = await import('../src/gpt-chat/components/AiChatConsole');
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(React.createElement(AiChatConsole, { config: { locale, apiBase: '' } }));
    const s = strings(locale);
    assert.ok(html.includes('GPTBot.uz'));
    assert.doesNotMatch(html, DISHONEST);
    assert.ok(!html.includes('data-testid="ai-account-trigger"'), `${locale}: no pill before the account view answers`);
    assert.ok(html.includes(s.emptyMeta(null)), `${locale}: no guessed numbers on the first paint`);
    assert.ok(html.includes('data-testid="ai-input-microcopy"'));
  }
});

// ── analytics: one event per entity ─────────────────────────────────────────

/** Every track()/trackOnce() call in the chat: the event expression and its parameter names. */
function trackCalls(): Array<{ file: string; event: string; keys: string[] }> {
  const calls: Array<{ file: string; event: string; keys: string[] }> = [];
  for (const file of files('src/gpt-chat').filter((f) => /\.tsx?$/.test(f) && !f.endsWith('analytics.ts'))) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['track', 'trackOnce'].includes(node.expression.text)) {
        const [event, payload] = node.arguments;
        const keys: string[] = [];
        if (payload && ts.isObjectLiteralExpression(payload)) {
          for (const prop of payload.properties) {
            if ((ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && prop.name) keys.push(prop.name.getText(source));
          }
        }
        calls.push({ file, event: event.getText(source), keys });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return calls;
}

test('the GA4 catalogue: snake_case, one name per entity, no legacy twin', () => {
  const names = Object.values(EV);
  assert.equal(new Set(names).size, names.length, 'two keys share an event');
  for (const name of names) assert.match(name, /^[a-z]+(_[a-z0-9]+)*$/, name);
  for (const legacy of ['GPTChatPageView', 'VisitChat', 'StartChat', 'GPTChatMessageSent', 'SendPrompt', 'GPTChatLimitReached', 'LimitReached',
    'ViewPricing', 'UpgradeClick', 'CopyAnswer', 'website_telegram_clicked', 'paywall_viewed', 'telegram_clicked', 'TelegramClick',
    'telegram_handoff_clicked', 'GPTChatLeadSubmitted', 'GPTChatLeadIntent', 'GPTChatAnswerReceived', 'GPTChatProviderError', 'UseTemplate']) {
    assert.ok(!(names as string[]).includes(legacy), legacy);
  }
  assert.ok(names.includes('chat_opened') && names.includes('message_sent') && names.includes('limit_hit') && names.includes('telegram_cta_clicked'));
});

test('every track call names a catalogued event and sends only parameters GA4 keeps', () => {
  const calls = trackCalls();
  const catalogued = new Set(Object.keys(EV).map((key) => `EV.${key}`));
  assert.ok(calls.length > 20, 'the calls were found');
  for (const call of calls) {
    assert.ok(catalogued.has(call.event), `${call.file}: ${call.event} is not EV.<name>`);
    for (const key of call.keys) {
      if (key === '...entryMeta') continue;
      assert.ok(GA4_PARAMS.has(key), `${call.file}: ${call.event} sends "${key}", which the filter drops`);
    }
  }
  // One event per message, per answer outcome path, per Telegram click and per pack window.
  const count = (event: string) => calls.filter((c) => c.event === event).length;
  assert.equal(count('EV.messageSent'), 1);
  assert.equal(count('EV.limitHit'), 1);
  assert.equal(count('EV.packViewed'), 1);
  assert.equal(calls.filter((c) => c.file.endsWith('AiTelegramCta.tsx')).length, 1);
  const cta = read('src/gpt-chat/components/AiTelegramCta.tsx');
  assert.match(cta, /track\(EV\.telegramCtaClicked, \{ from: stage, channel: link\.channel, with_session: link\.withSession \}\)/);
  // chat_opened fires on mount, whatever the account view does (F18).
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /useEffect\(\(\) => \{\s*trackOnce\(EV\.chatOpened, \{ locale: config\.locale, \.\.\.entryMeta \}\);/);
  assert.match(consoleSource, /const entryMeta = entry \? \{ entry: entry\.id \} : \{\};/);
});

test('track() keeps catalogued snake_case parameters and drops anything else', (t) => {
  const g = globalThis as Record<string, unknown>;
  const sent: unknown[][] = [];
  g.window = { gtag: (...args: unknown[]) => sent.push(args) };
  t.after(() => { delete g.window; });
  track(EV.messageSent, { message_number: 2, messageNumber: 2, source: 'composer', text: 'secret question', anonymous: true, nested: { a: 1 } });
  assert.equal(sent.length, 1);
  const [kind, event, payload] = sent[0] as [string, string, Record<string, unknown>];
  assert.equal(kind, 'event');
  assert.equal(event, 'message_sent');
  assert.deepEqual(
    Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'route' && key !== 'lang')),
    { message_number: 2, source: 'composer', anonymous: true },
  );
});
