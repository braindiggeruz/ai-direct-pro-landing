// The chat's lazy parts at run time (plan WP-10): one request per part, a
// failed request asked again, a placeholder while a part loads, and screens
// that render as they did before the split. The bundle side is
// tests/chat-bundle-budget.test.ts.
//
// Run: node --import tsx --test tests/gpt-chat-lazy-part.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { Dialog } from '../src/components/ui/dialog';

import { LazyPart, PartFailed, PartLoading, accountPart, leadPart, part, toolsPart } from '../src/gpt-chat/lazy-part';
import { strings } from '../src/gpt-chat/i18n';
import { accountStrings } from '../src/gpt-chat/account-strings';
import { leadStrings } from '../src/gpt-chat/lead-strings';
import type { AccountHandle } from '../src/gpt-chat/use-account';
import type { AccountView } from '../src/gpt-chat/types';

// tsx compiles .tsx with the classic transform in tests (as in
// tests/gpt-chat-handoff-link.test.ts).
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const LOCALES = ['ru', 'uz'] as const;
const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

async function prerendered(node: React.ReactNode): Promise<string> {
  const { prelude } = await prerender(node, { onError: () => {} });
  return new Response(prelude).text();
}

test('a part is requested once, whoever asks first; a failed request is not kept', async () => {
  let calls = 0;
  const once = part(async () => { calls++; return { value: 1 }; });
  once.preload();
  const [a, b] = await Promise.all([once.load(), once.load()]);
  assert.equal(calls, 1);
  assert.equal(a, b);

  let attempts = 0;
  const flaky = part(async () => {
    attempts++;
    if (attempts === 1) throw new Error('offline');
    return { value: 2 };
  });
  flaky.preload(); // never throws, never leaves an unhandled rejection
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
  assert.deepEqual(await flaky.load(), { value: 2 }, 'the next ask goes out again');
  assert.equal(attempts, 2);
  await flaky.load();
  assert.equal(attempts, 2, 'and is kept once it arrived');
});

test('a part that is here renders at once; one that failed asks again when it reopens', async () => {
  const LAZY = Symbol.for('react.lazy');
  const kind = (view: unknown) => (view as { $$typeof?: symbol }).$$typeof === LAZY ? 'lazy' : typeof view;
  const ok = part(async () => ({ text: 'ready' }));
  assert.equal(kind(ok.view()), 'lazy', 'not requested yet: it suspends');
  assert.equal(ok.view(), ok.view(), 'one lazy per page');
  await ok.load();
  // Preloaded or opened before: a plain component, no frame of the placeholder.
  assert.equal(kind(ok.view()), 'function');
  const element = React.createElement(React.Suspense, { fallback: 'loading' },
    React.createElement(ok.view(), { render: (m: { text: string }) => m.text }));
  assert.equal(renderToStaticMarkup(element), 'ready', 'rendered in the first pass');

  let fail = true;
  const flaky = part(async () => {
    if (fail) throw new Error('offline');
    return { text: 'back' };
  });
  const first = flaky.view();
  const html = await prerendered(
    React.createElement(React.Suspense, { fallback: 'loading' },
      React.createElement(first, { render: (m: { text: string }) => m.text })),
  );
  assert.ok(!html.includes('back'));
  const second = flaky.view();
  assert.notEqual(second, first, 'a rejected lazy stays rejected, so the next opening gets a new one');
  fail = false;
  const again = await prerendered(
    React.createElement(React.Suspense, { fallback: 'loading' },
      React.createElement(second, { render: (m: { text: string }) => m.text })),
  );
  assert.ok(again.includes('back'));
});

test('LazyPart shows its placeholder until the part is here, then the part', async () => {
  const slow = part(async () => ({ text: 'the part' }));
  const element = React.createElement(LazyPart<{ text: string }>, {
    part: slow,
    fallback: React.createElement(PartLoading, { label: 'Загружаем…', className: 'gpt-part-loading-tool' }),
    failed: React.createElement(PartFailed, { message: 'failed', reload: 'Обновить страницу' }),
    children: (module: { text: string }) => module.text,
  });
  const first = renderToStaticMarkup(element);
  assert.equal(first, '<div class="gpt-part-loading gpt-part-loading-tool" role="status" aria-label="Загружаем…"></div>');
  assert.match(await prerendered(element), /the part/);
  // Failed: say so and offer the one thing that works, a reload (a browser
  // keeps a failed module for the life of the page).
  const failed = renderToStaticMarkup(React.createElement(PartFailed, { message: 'Не удалось', reload: 'Обновить страницу' }));
  assert.equal(failed, '<div role="alert" class="gpt-error"><p>Не удалось</p><button type="button" class="gpt-text-button">Обновить страницу</button></div>');
  assert.match(read('src/gpt-chat/lazy-part.tsx'), /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.deepEqual(LOCALES.map((locale) => [strings(locale).partLoading, strings(locale).partReload]), [['Загружаем…', 'Обновить страницу'], ['Yuklanmoqda…', 'Sahifani yangilash']]);
  for (const locale of LOCALES) assert.match(strings(locale).partFailed, locale === 'uz' ? /sahifani yangilang/ : /обновите страницу/);
});

// ── the three parts render what the chat used to render inline ──────────────

const guest = (over: Partial<AccountView> = {}): AccountView => ({
  ok: true, loginAvailable: true, mode: 'live', providers: ['click', 'uzum'], user: null,
  terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, termsVersion: '2026-10-01',
  freeLimits: { daily: 15, hourly: 5 }, pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null }, ...over,
});
const handle = (data: AccountView | null, over: Partial<AccountHandle> = {}): AccountHandle => ({
  data, error: false, loading: false, refresh: async () => {}, fail: () => {}, forget: () => {}, clearError: () => {}, ...over,
});
/** The window's props besides the account: no payment under way. */
const frame = () => ({
  apiBase: '', loginFailed: false, onClose: () => {},
  memoryRef: { current: { requestKeys: {}, refusedForTerms: null, paymentCode: null } },
  checkout: { watch: null, outcome: null, start: () => {}, dismiss: () => {} },
});

test('chat-account: the pack window says what it said before the split', async () => {
  const { AccountDialog } = await accountPart.load();
  for (const locale of LOCALES) {
    const t = strings(locale);
    const copy = accountStrings(locale);
    const render = (account: AccountHandle, loginFailed = false) => renderToStaticMarkup(
      React.createElement(Dialog, { open: true },
        React.createElement(AccountDialog, { ...frame(), t, locale, account, loginFailed })),
    );
    const price = copy.price('20 000', 1, 300);
    // A guest while a pack can be bought: title, price card, sign-in.
    const buyable = render(handle(guest()));
    for (const line of [copy.title, price, ...copy.packFeatures(1, 300, 50), t.premium.manual, copy.loginConsent, copy.login, t.premium.check, t.premium.historyNote]) {
      assert.ok(buyable.includes(line.replace(/&/g, '&amp;')), `${locale}: ${line}`);
    }
    assert.ok(!buyable.includes(copy.unavailable));
    // Billing off: no price, and it says so.
    const closed = render(handle(guest({ mode: null, providers: [] })));
    assert.ok(!closed.includes(price) && closed.includes(copy.unavailable), locale);
    // Signed in with a pack: what is left, until when, sign-out.
    const paid = render(handle(guest({
      user: { signedIn: true, storageKey: 'a'.repeat(64) },
      access: { order_id: 'o', ends_at: Date.parse('2026-11-01T00:00:00Z'), remaining: 120, renewSoon: false, refund_requested_at: null },
    })));
    for (const line of [copy.active, copy.remaining, copy.until('').trim(), copy.terms, copy.logout]) assert.ok(paid.includes(line), `${locale}: ${line}`);
    assert.match(paid, /<strong>120<span class="gpt-access-size"> \/ 300<\/span><\/strong>/);
    assert.ok(!paid.includes('gpt-plan-card'), 'no price card over an active pack');
    // Reading the account, a failed read, a failed sign-in.
    assert.ok(render(handle(null, { loading: true })).includes(copy.checking));
    assert.ok(render(handle(null, { error: true })).includes(copy.failed));
    assert.ok(render(handle(guest()), true).includes(copy.loginFailed));
  }
});

test('chat-account: sign-in through the bot — the button, then the number, the link and the warning', async () => {
  const { AccountDialog } = await accountPart.load();
  const deepLink = `https://t.me/gptbotuz_bot?start=login_${'ab'.repeat(16)}`;
  const store = new Map<string, string>();
  const scope = globalThis as unknown as { sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> };
  scope.sessionStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: (key) => { store.delete(key); } };
  try {
    for (const locale of LOCALES) {
      const copy = accountStrings(locale);
      const render = () => renderToStaticMarkup(
        React.createElement(Dialog, { open: true },
          React.createElement(AccountDialog, { ...frame(), t: strings(locale), locale, account: handle(guest({ loginMethods: ['bot', 'oidc'] })) })),
      );
      // Before starting: the consent and one sign-in button.
      store.clear();
      const idle = render();
      assert.ok(idle.includes(copy.loginConsent) && idle.includes(copy.login), locale);
      assert.ok(!idle.includes(copy.botLoginOpen));
      // An attempt this tab started (it survives a reload): the steps, the number large, the link, the warning.
      store.set('gptchat_botlogin_pending', JSON.stringify({ id: '0123456789abcdef', mode: 'pick', code: '47', deepLink, expiresAt: Date.now() + 600_000 }));
      const waiting = render();
      for (const line of [...copy.botLoginSteps('gptbotuz_bot'), copy.botLoginOpen, copy.botLoginCopy, copy.botLoginWarning]) assert.ok(waiting.includes(line.replace(/&/g, '&amp;')), `${locale}: ${line}`);
      assert.match(waiting, /<strong class="gpt-login-code">47<\/strong>/);
      assert.ok(waiting.includes(`<a class="gpt-primary ym-disable-tracklink" href="${deepLink}"`) && waiting.includes('rel="noopener noreferrer"'));
      assert.match(waiting, new RegExp(copy.botLoginWaiting('(9:59|10:00)').replace(/[…]/g, '.')));
      // Code mode: no number on the site.
      store.set('gptchat_botlogin_pending', JSON.stringify({ id: '0123456789abcdef', mode: 'code', code: null, deepLink, expiresAt: Date.now() + 600_000 }));
      const code = render();
      for (const line of copy.botLoginCodeSteps('gptbotuz_bot')) assert.ok(code.includes(line), `${locale}: ${line}`);
      assert.ok(!code.includes('gpt-login-code'));
      // An older server without loginMethods keeps Telegram's OIDC button.
      store.clear();
      const oidc = renderToStaticMarkup(React.createElement(Dialog, { open: true },
        React.createElement(AccountDialog, { ...frame(), t: strings(locale), locale, account: handle(guest()) })));
      assert.ok(oidc.includes(copy.login) && !oidc.includes('gpt-bot-login'));
    }
    // A stored attempt that is not our bot's sign-in link is ignored.
    store.set('gptchat_botlogin_pending', JSON.stringify({ id: '0123456789abcdef', mode: 'pick', code: '47', deepLink: 'https://t.me/someone_else?start=login_' + 'ab'.repeat(16), expiresAt: Date.now() + 600_000 }));
    assert.ok(!renderToStaticMarkup(React.createElement(Dialog, { open: true },
      React.createElement(AccountDialog, { ...frame(), t: strings('ru'), locale: 'ru', account: handle(guest({ loginMethods: ['bot'] })) }))).includes('someone_else'));
  } finally {
    delete scope.sessionStorage;
  }
});

test('chat-lead: the business card and its form, in the visitor’s language', async () => {
  const { AiOfferCard } = await leadPart.load();
  for (const locale of LOCALES) {
    const copy = leadStrings(locale);
    const html = renderToStaticMarkup(React.createElement(AiOfferCard, {
      t: strings(locale), locale, apiBase: '', sessionId: null, onDismiss: () => {},
    }));
    for (const line of [copy.offerBadge, copy.b2bTitle, copy.offerBody, copy.dismissOffer, copy.b2bDiscuss]) assert.ok(html.includes(line), `${locale}: ${line}`);
  }
});

test('chat-tools: each tool behind the menu, as before the split', async () => {
  const { AiToolPanel } = await toolsPart.load();
  for (const locale of LOCALES) {
    const t = strings(locale);
    const render = (tool: 'images' | 'smm' | 'business' | 'study') => renderToStaticMarkup(React.createElement(AiToolPanel, {
      t, locale, tool, disabled: false, onTemplatePick: () => {}, onImagePrompt: () => {},
    }));
    assert.match(render('images'), /ym-disable-submit/, 'the image prompt form');
    for (const tool of ['smm', 'business', 'study'] as const) {
      const html = render(tool);
      assert.match(html, /role="list"/, `${locale}/${tool}: templates`);
      assert.equal(html.includes(t.businessLink), tool === 'business', `${locale}/${tool}: business link`);
    }
    assert.match(render('business'), locale === 'uz' ? /href="\/uz\/biznes-uchun-ai-bot\/"/ : /href="\/ru\/gpt-dlya-biznesa\/"/);
  }
});
