import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { billingOpen, canStartCheckout, canResumeCheckout, safeAccountLink, safeTermsLink, validAccountView, type AccountView } from '../src/gpt-chat/types';
import { limitCard } from '../src/gpt-chat/limit-card';
import type { LimitReason, LimitState } from '../src/gpt-chat/limit-state';
import { strings } from '../src/gpt-chat/i18n';
import { accountStrings } from '../src/gpt-chat/account-strings';
import { preloadsAccountWindow, preloadsBusinessCard, type AccountWindowSignals } from '../src/gpt-chat/preload';
import { isBotLoginUrl } from '../src/gpt-chat/handoff';
import { attemptFromStart, validBotLoginAttempt } from '../src/gpt-chat/bot-login';
import { CHECKOUT_TTL_MS, checkoutPollDelay, firstReport, loadCheckout, orderId, pendingDelay, saveCheckout, settledCheckout, type CheckoutWatch } from '../src/gpt-chat/checkout';
import { GA4_PARAMS, trackPurchase } from '../src/gpt-chat/analytics';
import { PACK_FROM, recordUiEvent, type UiEventDetails } from '../src/gpt-chat/ui-events';
import { parseUiEvent, UI_EVENTS } from '../functions/lib/gpt-chat/ui-event-store';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAccount, type AccountCause, type AccountHandle } from '../src/gpt-chat/use-account';

const account = (): AccountView => ({ ok: true, mode: 'test', loginAvailable: true, providers: ['click', 'payme'], user: { signedIn: true, storageKey: 'a'.repeat(64) }, remaining: 15, terms: { ru: 'https://gptbot.uz/ru/offer/', uz: 'https://gptbot.uz/uz/offer/' }, termsVersion: '2026-09-06', pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null } });

test('checkout requires valid identity, current locale terms, version and merchant availability', () => {
  assert.equal(canStartCheckout(account(), 'ru'), true);
  for (const value of [null, { ...account(), user: null }, { ...account(), providers: [] }, { ...account(), mode: null }, { ...account(), termsVersion: null }, { ...account(), termsVersion: ' ' }, { ...account(), terms: { ru: null, uz: '/uz/offer/' } }, { ...account(), terms: { ru: 'https://evil.example/offer/', uz: null } }, { ...account(), pack: undefined }]) {
    assert.equal(canStartCheckout(value as AccountView | null, 'ru'), false);
  }
  // Guest checkout: Click without an account, when the server offers it.
  assert.equal(canStartCheckout({ ...account(), user: null, guestCheckout: true }, 'ru'), true);
  assert.equal(canStartCheckout({ ...account(), user: null, guestCheckout: true, providers: ['payme'] }, 'ru'), false);
  const uzOnly = { ...account(), terms: { ru: null, uz: '/uz/offer/' } };
  assert.equal(canStartCheckout(uzOnly, 'uz'), true);
});

test('malformed account responses fail closed before identity or receipt UI is consumed', () => {
  assert.equal(validAccountView(account()), true);
  assert.equal(validAccountView({ ...account(), user: null, providers: [], mode: null, termsVersion: null }), true, 'Disabled billing preserves valid guest chat');
  for (const value of [{ ...account(), user: { signedIn: true } }, { ...account(), user: { signedIn: true, storageKey: 'a@b.test' } }, { ...account(), providers: ['unknown'] }, { ...account(), receipts: {} }, { ...account(), remaining: -1 }, { ...account(), user: null, access: { order_id: 'x', ends_at: Date.now(), remaining: 5 } }]) {
    assert.equal(validAccountView(value), false);
  }
});

test('pending payment prevents starting another checkout and unsafe terms or receipt schemes are rejected', () => {
  for (const state of ['pending', 'prepared']) assert.equal(canStartCheckout({ ...account(), payment: { id: 'order', state } }, 'ru'), false);
  assert.equal(canStartCheckout({ ...account(), payment: { id: 'order', state: 'cancelled' } }, 'ru'), true);
  for (const link of ['javascript:alert(1)', 'data:text/plain,secret', 'http://gptbot.uz/terms', 'https://user:secret@gptbot.uz/terms']) assert.equal(safeAccountLink(link), null);
  // A receipt opens only on the tax authority's page or an Uzum host.
  for (const link of ['https://gptbot.uz/receipt', '/receipt', 'https://evil.example/epi', 'https://ofd.soliq.uz.evil.example/epi', 'https://ofd.soliq.uz:8443/epi', 'http://ofd.soliq.uz/epi', 'https://uzumbank.uz.evil.example/r']) assert.equal(safeAccountLink(link), null, link);
  assert.equal(safeAccountLink('https://ofd.soliq.uz/epi?t=EZ1&r=2'), 'https://ofd.soliq.uz/epi?t=EZ1&r=2');
  assert.equal(safeAccountLink('https://check.uzumbank.uz/r/1'), 'https://check.uzumbank.uz/r/1');
  assert.equal(safeTermsLink('https://gptbot.uz:8443/terms'), null);
  assert.equal(safeTermsLink('/ru/terms/'), 'https://gptbot.uz/ru/terms/');
});

test('a pending checkout can be resumed only for its available provider with valid current terms', () => {
  const pending = { ...account(), payment: { id: 'existing', state: 'pending', provider: 'payme' as const } };
  assert.equal(canStartCheckout(pending, 'ru'), false);
  assert.equal(canResumeCheckout(pending, 'ru'), true);
  assert.equal(canResumeCheckout({ ...pending, providers: ['click'] }, 'ru'), false);
  assert.equal(canResumeCheckout({ ...pending, termsVersion: null }, 'ru'), false);
  assert.equal(canResumeCheckout({ ...pending, payment: { id: 'existing', state: 'pending' } }, 'ru'), false);
  assert.equal(canResumeCheckout({ ...pending, payment: { ...pending.payment, state: 'cancelled' } }, 'ru'), false);
});

test('botHandoff is a boolean or absent; anything else fails the view closed', () => {
  assert.equal(validAccountView({ ...account(), botHandoff: true }), true);
  assert.equal(validAccountView({ ...account(), botHandoff: false }), true);
  assert.equal(validAccountView(account()), true, 'an older server without the field stays valid (and means no bot)');
  for (const botHandoff of ['true', 1, null, {}]) assert.equal(validAccountView({ ...account(), botHandoff }), false);
});

test('loginMethods is a list of bot and oidc or absent; anything else fails the view closed', () => {
  for (const loginMethods of [['bot'], ['bot', 'oidc'], ['oidc'], []]) assert.equal(validAccountView({ ...account(), loginMethods }), true);
  assert.equal(validAccountView(account()), true, 'an older server without the field');
  for (const loginMethods of ['bot', ['sms'], [1], null, {}]) assert.equal(validAccountView({ ...account(), loginMethods }), false);
});

test('a sign-in deep link is our bot with login_ and 32 hex, nothing else', () => {
  const nonce = 'ab'.repeat(16);
  assert.equal(isBotLoginUrl(`https://t.me/gptbotuz_bot?start=login_${nonce}`), true);
  assert.equal(isBotLoginUrl(`https://telegram.me/GPTBotUz_Bot?start=login_${nonce}`), true);
  for (const link of [
    `https://t.me/someone_else?start=login_${nonce}`,
    `https://t.me/gptbotuz_bot?start=site_ru`,
    `https://t.me/gptbotuz_bot?start=login_${nonce.toUpperCase()}`,
    `https://t.me/gptbotuz_bot?start=login_${nonce}&x=1`,
    `http://t.me/gptbotuz_bot?start=login_${nonce}`,
    `https://t.me/gptbotuz_bot?start=login_${nonce}#x`,
    'https://t.me/gptbotuz_bot',
    'not a url',
  ]) assert.equal(isBotLoginUrl(link), false, link);
  const attempt = { id: '0123456789abcdef', mode: 'pick', code: '47', deepLink: `https://t.me/gptbotuz_bot?start=login_${nonce}`, expiresAt: Date.now() + 600_000 };
  assert.equal(validBotLoginAttempt(attempt), true);
  assert.equal(validBotLoginAttempt({ ...attempt, mode: 'code', code: null }), true);
  for (const broken of [{ code: '7' }, { code: null }, { mode: 'code' }, { id: 'xyz' }, { deepLink: 'https://evil.example/' }, { expiresAt: 'soon' }])
    assert.equal(validBotLoginAttempt({ ...attempt, ...broken }), false, JSON.stringify(broken));
});

test('a started attempt lives its 10 minutes on this browser\'s clock, however wrong that clock is', () => {
  const deepLink = `https://t.me/gptbotuz_bot?start=login_${'ab'.repeat(16)}`;
  // This computer's clock runs two hours ahead of the server's: the server's
  // expiresAt is already past here, the attempt must still live 10 minutes.
  const local = Date.UTC(2026, 9, 3, 14, 0);
  const server = local - 2 * 3_600_000;
  const answer = { ok: true, id: '0123456789abcdef', mode: 'pick', code: '47', deepLink, expiresAt: server + 600_000, expiresIn: 600_000 };
  assert.deepEqual(attemptFromStart(answer, local), { id: '0123456789abcdef', mode: 'pick', code: '47', deepLink, expiresAt: local + 600_000 });
  assert.deepEqual(attemptFromStart({ ...answer, mode: 'code', code: null }, local)?.expiresAt, local + 600_000);
  for (const broken of [{ expiresIn: undefined }, { expiresIn: '600000' }, { expiresIn: 0 }, { expiresIn: -1 }, { expiresIn: 1.5 }, { expiresIn: 86_400_000 }, { deepLink: 'https://evil.example/' }, { code: '7' }])
    assert.equal(attemptFromStart({ ...answer, ...broken }, local), null, JSON.stringify(broken));
  assert.equal(attemptFromStart(null), null);
});

test('freeLimits is two counts or absent; anything else fails the view closed', () => {
  assert.equal(validAccountView({ ...account(), freeLimits: { daily: 15, hourly: 5 } }), true);
  assert.equal(validAccountView(account()), true, 'an older server without the field stays valid');
  for (const freeLimits of [null, {}, { daily: 15 }, { daily: '15', hourly: 5 }, { daily: 15, hourly: -1 }, { daily: 1.5, hourly: 5 }, [15, 5]]) {
    assert.equal(validAccountView({ ...account(), freeLimits }), false, JSON.stringify(freeLimits));
  }
});

const REASONS: LimitReason[] = ['hourly', 'daily', 'pack_daily', 'monthly', 'busy', 'ip'];
const NOW = Date.parse('2026-10-01T10:00:00Z');
const limitOf = (reason: LimitReason): LimitState => ({
  reason, retryAt: reason === 'monthly' ? null : NOW + 30 * 60_000, since: NOW,
  limits: reason === 'pack_daily' ? { daily: 50, hourly: null } : { daily: 15, hourly: 5 },
});

test('the limit card: the pack only while it can be bought, the bot only while the server enables it', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const unavailable = accountStrings(locale).unavailable;
    for (const reason of REASONS) {
      for (const paid of [false, true]) {
        for (const billingAvailable of [false, true]) {
          for (const botHandoff of [false, true]) {
            const label = `${locale}/${reason}/paid=${paid}/billing=${billingAvailable}/bot=${botHandoff}`;
            const card = limitCard(locale, limitOf(reason), { paid, billingAvailable, botHandoff, remaining: 7 }, NOW);
            const freeCap = reason === 'hourly' || reason === 'daily';
            assert.equal(card.bot, botHandoff && freeCap ? reason : null, label);
            assert.equal(card.account, billingAvailable && (reason === 'monthly' || (freeCap && !paid)), label);
            const text = [card.title, card.body, card.wait].join(' ');
            assert.doesNotMatch(text, /Telegram|\bbot/i, `${label}: no line points to a bot the card may not show`);
            assert.doesNotMatch(text, /Plus|obuna|подписк/i, label);
            assert.ok(!text.includes(unavailable), `${label}: never "the free chat is available" to a blocked visitor`);
          }
        }
      }
    }
  }
});

test('a free-cap card sells the pack with the server terms and the price, only while it can be bought', () => {
  const pack = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null };
  for (const locale of ['ru', 'uz'] as const) {
    for (const reason of REASONS) {
      for (const paid of [false, true]) {
        for (const billingAvailable of [false, true]) {
          const label = `${locale}/${reason}/paid=${paid}/billing=${billingAvailable}`;
          const card = limitCard(locale, limitOf(reason), { paid, billingAvailable, botHandoff: false, remaining: 7, pack }, NOW);
          const freeCap = reason === 'hourly' || reason === 'daily';
          assert.equal(card.offer !== null, billingAvailable && freeCap && !paid, `${label}: the value line only under a free cap, while a pack can be bought`);
          if (card.offer) {
            assert.match(card.offer, /20\u00a0000/, `${label}: the price from the terms`);
            assert.match(card.offer, /300/, label);
            assert.match(card.offer, /50/, label);
            assert.doesNotMatch(card.offer, /Plus|Pro\b|obuna|подписк/i, label);
          }
          if (card.account) assert.match(card.cta, /20\u00a0000/, `${label}: the button carries the price`);
        }
      }
    }
    // Without terms from the server the button keeps the pack's name and no value line is made up.
    const bare = limitCard(locale, limitOf('hourly'), { paid: false, billingAvailable: true, botHandoff: false, remaining: 0, pack: null }, NOW);
    assert.equal(bare.offer, null);
    assert.equal(bare.cta, strings(locale).premium.account);
    // A spent pack offers a new one without the free-cap line.
    const spent = limitCard(locale, limitOf('monthly'), { paid: true, billingAvailable: true, botHandoff: false, remaining: 0, pack }, NOW);
    assert.equal(spent.offer, null);
    assert.match(spent.cta, locale === 'ru' ? /новый AI-пакет/ : /Yangi AI paket/);
  }
  assert.ok(!strings('uz').limitOffer(pack).includes("'"), 'no ASCII apostrophe in Uzbek copy');
});

test('every reason has its own words; o‘ and g‘ use U+2018', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const bodies = REASONS.map((reason) => limitCard(locale, limitOf(reason), { paid: false, billingAvailable: false, botHandoff: false, remaining: 7 }, NOW).body);
    assert.equal(new Set(bodies).size, REASONS.length, locale);
  }
  const uz = strings('uz');
  const uzCopy = [uz.hourlyTitle, uz.hourlyBody(5), uz.hourlyBody(null), uz.dailyTitle, uz.dailyBody(15, true), uz.packDailyBody(50, 3, false),
    uz.busyBody, uz.ipBody, uz.limitWait(3), uz.limitLessMinute, uz.limitReady, uz.limitDraftKept, uz.truncated].join(' ');
  assert.ok(!uzCopy.includes("'"), 'no ASCII apostrophe in Uzbek copy');
  assert.match(uzCopy, /Tarmog‘ingizdan so‘rovlar/);
});

test('the chat feeds the card from the limit state; the account view only reports to it', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(source, /setBotHandoff\(account\?\.botHandoff === true\)/);
  assert.match(source, /limitCard\(config\.locale, limit, \{ billingAvailable, paid, botHandoff, remaining, pack: packTerms \}, clock\)/);
  assert.match(source, /setPackTerms\(account\?\.pack \?\? null\)/);
  assert.doesNotMatch(source, /setLimitReached|onLimitRetry|FREE_DAILY_SEGMENTS/);
  const onAccount = source.slice(source.indexOf('const onAccount = useCallback('), source.indexOf('}, [config.locale]);'));
  const dispatches = [...onAccount.matchAll(/dispatchLimit\(\{\s*type: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(dispatches, ['account'], 'the account view can only report, never block or admit');
  const refused = source.slice(source.indexOf('} else if (res.code === "limit_reached") {'), source.indexOf('track(EV.limitHit'));
  assert.match(refused, /setMessages\(history\);\s*setInput\(trimmed\);/, 'the question goes back into the composer');
  const mounts = [...source.matchAll(/<AiLimitTelegram\s/g)];
  assert.equal(mounts.length, 1);
  // Second to the pack button it waits behind «Batafsil» (NOW-05); alone it leads.
  assert.match(source.slice(0, mounts[0].index), /\{card\.bot && \(!card\.account \|\| details\) && \(\s*$/);
});

test('the limit card is short: title, the time and one way on; why, the pack value and the second way behind «Batafsil»', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  const cardJsx = source.slice(source.indexOf('id={LIMIT_CARD_ID}'), source.indexOf('{!limit && !paid && remaining >= 0'));
  assert.match(source, /const bodyShown = !!card && \(!card\.title \|\| !card\.wait\);/);
  assert.match(cardJsx, /\{bodyShown \|\| details \? \(/);
  assert.match(cardJsx, /<span className="sr-only">\{card\.body\}<\/span>/);
  assert.match(cardJsx, /\{card\.offer && details && \(/);
  assert.match(cardJsx, /aria-expanded=\{details\}\s*onClick=\{\(\) => setDetailsFor\(details \? null : limit\.reason\)\}/);
  // Opened for one reason, closed for the next.
  assert.match(source, /const details = !!limit && detailsFor === limit\.reason;/);
  // The pack's price stays on its button; without a pack for sale no price and no button (F4, F6).
  assert.match(cardJsx, /\{card\.account && \(\s*<button[^>]*?\s*type="button"\s*className="gpt-primary"/);
  assert.deepEqual([strings('uz').limitMore, strings('ru').limitMore], ['Batafsil', 'Подробнее']);
  // The warnings: 2 left this hour (after the 3rd), 3 left today.
  assert.match(source, /const HOUR_WARNING_AT = 2;/);
  assert.match(source, /const DAY_WARNING_AT = 3;/);
  assert.match(source, /\{!limit && !paid && remaining >= 0 && remaining <= DAY_WARNING_AT && \(/);
  assert.match(source, /const hourBlocked = limit\?\.reason === "hourly" && limitBlocked;/);
  assert.match(source, /<AiUsageBadge remaining=\{remaining\} hourLeft=\{hourLeft\} hourBlocked=\{hourBlocked\} t=\{t\} \/>/);
});

test('the account answering again after failed reads keeps the guest-mode conversation (F11)', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  const onAccount = source.slice(source.indexOf('const onAccount = useCallback('), source.indexOf('}, [config.locale]);'));
  const kept = onAccount.slice(onAccount.indexOf('keepsShownConversation('), onAccount.indexOf('} else {'));
  assert.match(kept, /accountIdentityRef\.current,\s*establishedIdentityRef\.current,\s*identity,\s*shown\.busy \|\| shown\.messages\.length > 0/);
  // The answer on screen and one still arriving stay; the stored conversation
  // is archived rather than overwritten, and the screen becomes the stored one.
  assert.doesNotMatch(kept, /identityGeneration|abort\(|setMessages|setBusy|setSessionId/);
  assert.match(kept, /setSavedChats\(archiveChat\(loadHistory\(config\.locale, scope\), config\.locale, scope\)\)/);
  assert.match(kept, /saveHistory\(shown\.messages\.filter\(\(m\) => !m\.streaming\), config\.locale, scope\)/);
  // Any other change of identity still drops what the previous one saw.
  const changed = onAccount.slice(onAccount.indexOf('} else {'));
  assert.match(changed, /identityGeneration\.current\+\+;\s*abortRef\.current\?\.abort\(\);/);
  assert.match(changed, /setMessages\(account \? loadHistory\(config\.locale, scope\) : \[\]\)/);
  assert.match(source, /shownRef\.current = \{ messages, busy \};/);
});

test('a pack is buyable only with a mode and a provider; every opening of its window says where from', () => {
  assert.equal(billingOpen(null), false);
  assert.equal(billingOpen({ ...account(), mode: null }), false);
  assert.equal(billingOpen({ ...account(), providers: [] }), false);
  assert.equal(billingOpen(account()), true);
  const panel = readFileSync(new URL('../src/gpt-chat/components/AiAccountPanel.tsx', import.meta.url), 'utf8');
  // One pack_viewed per opening, sent where the window opens, never on a re-render.
  assert.equal((panel.match(/track\(EV\.packViewed/g) ?? []).length, 1);
  assert.match(panel, /const openPack = useCallback\(\(from: PackFrom\) => \{\s*setOpen\(true\);\s*track\(EV\.packViewed, \{ from, locale \}\);/);
  assert.match(panel, /onClick=\{\(\) => openPack\("header"\)\}/);
  assert.match(panel, /if \(openRequest\) openPack\(openRequest\.from\);/);
  assert.match(panel, /openPack\("login_failed"\)/);
  assert.match(panel, /onOpenChange=\{\(next\) => \{ if \(!next\) close\(\); \}\}/, 'the Dialog itself only closes');
  const chat = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  const froms = [...chat.matchAll(/openAccount\("(\w+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(froms, ['account_check', 'after_10', 'limit_card', 'low_limit']);
  assert.doesNotMatch(chat, /setAccountOpen\(\(n\) => n \+ 1\)/);
});

// ── the pack window is a lazy part (WP-10): fetched ahead where people open it ──

const signals = (over: Partial<AccountWindowSignals> = {}): AccountWindowSignals => ({
  reachable: true, remaining: 10, limited: false, payReturn: false, paymentPending: false, ...over,
});

test('the pack window is fetched ahead at ≤ 2 left, at a 429 and on the way back from paying', () => {
  assert.equal(preloadsAccountWindow(signals()), false, 'plenty left: on demand');
  assert.equal(preloadsAccountWindow(signals({ remaining: -1 })), false, 'the count is not known yet');
  for (const remaining of [2, 1, 0]) assert.equal(preloadsAccountWindow(signals({ remaining })), true, `${remaining} left`);
  assert.equal(preloadsAccountWindow(signals({ remaining: 3 })), false);
  assert.equal(preloadsAccountWindow(signals({ limited: true })), true, 'the limit card offers the pack');
  assert.equal(preloadsAccountWindow(signals({ payReturn: true })), true, '?pay=return');
  assert.equal(preloadsAccountWindow(signals({ paymentPending: true })), true, 'an invoice waits');
});

test('nobody downloads a window they cannot open', () => {
  // Production today: billing off, a guest. The limit card shows no pack button.
  for (const over of [{ limited: true }, { remaining: 0 }, { payReturn: true }, { paymentPending: true }]) {
    assert.equal(preloadsAccountWindow(signals({ ...over, reachable: false })), false, JSON.stringify(over));
  }
  const panel = readFileSync(new URL('../src/gpt-chat/components/AiAccountPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /const reachable = showsAccountPill\(data\);/);
  assert.match(panel, /if \(preloadsAccountWindow\(\{ reachable, remaining, limited, payReturn: !!checkout, paymentPending \}\)\) accountPart\.preload\(\);/);
  assert.match(panel, /get\("pay"\) === "return"/);
  const chat = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(chat, /remaining=\{remaining\}\s*limited=\{limited\}/);
});

test('the business card is fetched in the business tool, and not once it was closed for the day', () => {
  assert.equal(preloadsBusinessCard({ tool: 'business', dismissed: false }), true, 'the card comes after a few answers here');
  assert.equal(preloadsBusinessCard({ tool: 'business', dismissed: true }), false, 'closed today: it will not come back');
  for (const tool of ['chat', 'images', 'smm', 'study'] as const) {
    assert.equal(preloadsBusinessCard({ tool, dismissed: false }), false, `${tool}: the card never shows there`);
  }
  // The console asks with the same two facts that decide whether the card shows.
  const chat = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  assert.match(chat, /if \(preloadsBusinessCard\(\{ tool: activeTool, dismissed: offerDismissed \}\)\) leadPart\.preload\(\);\s*\}, \[activeTool, offerDismissed\]\);/);
  assert.match(chat, /const showOffer =\s*activeTool === "business" &&\s*assistantCount >= B2B_AFTER &&\s*!offerDismissed &&/);
});

// ── the AI pack window (WP-17): the view's new fields, the way back from paying ──

/** localStorage and sessionStorage for one test, gone after it. */
function memoryStorage(t: { after: (fn: () => void) => void }) {
  const make = () => {
    const values = new Map<string, string>();
    return { values, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, String(v)); }, removeItem: (k: string) => { values.delete(k); } };
  };
  const local = make();
  const session = make();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
  t.after(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
    delete (globalThis as Record<string, unknown>).sessionStorage;
  });
  return { local: local.values, session: session.values };
}

const ORDER = `pay_${'a'.repeat(32)}`;
const OTHER = `uzm_${'b'.repeat(32)}`;

test('the pack, the Uzum flow, the app code and the pack day are well formed or the view fails closed', () => {
  const signedIn = account();
  assert.equal(validAccountView({ ...signedIn, uzumFlow: 'code', paymentCode: '123456789' }), true);
  assert.equal(validAccountView({ ...signedIn, uzumFlow: null, paymentCode: null }), true);
  assert.equal(validAccountView({ ...signedIn, pack: undefined }), true, 'an older server without the pack stays valid, and sells nothing');
  assert.equal(validAccountView({ ...signedIn, pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 } } }), true);
  const access = { order_id: ORDER, ends_at: Date.now() + 1e9, remaining: 120, renewSoon: false };
  assert.equal(validAccountView({ ...signedIn, access: { ...access, message_limit: 300, dayRemaining: 50 } }), true);
  for (const broken of [
    { pack: null }, { pack: { priceUzs: 0, messageLimit: 300, dailyLimit: 50, months: 1 } }, { pack: { priceUzs: '20000', messageLimit: 300, dailyLimit: 50, months: 1 } },
    { pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: -1, includedTiyin: 0 } } },
    { uzumFlow: 'app' }, { paymentCode: '12345678' }, { paymentCode: '012345678' }, { paymentCode: 123456789 },
    { user: null, paymentCode: '123456789' },
    { access: { ...access, dayRemaining: -1 } }, { access: { ...access, dayRemaining: 1.5 } }, { access: { ...access, message_limit: 0 } },
  ]) assert.equal(validAccountView({ ...signedIn, ...broken }), false, JSON.stringify(broken));
});

test('packs side by side and a closable invoice are well formed or the view fails closed (WP-24)', () => {
  const signedIn = account();
  const access = { order_id: ORDER, ends_at: Date.now() + 1e9, remaining: 420, renewSoon: false, message_limit: 300, dayRemaining: 50 };
  const totals = { packs: 2, totalLimit: 600, paidThrough: Date.now() + 2e9, firstRemaining: 120 };
  const pack = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1 };
  const view = { ...signedIn, pack, access: { ...access, ...totals }, payment: { id: ORDER, state: 'pending', provider: 'click', cancellable: true } };
  assert.equal(validAccountView(view), true);
  // A paid pack is not refundable (WP-25): the window reads no refund fields, so a view from
  // a server deployed before that (refundable, refundDays) is still read, and they are ignored.
  assert.equal(validAccountView({
    ...view, pack: { ...pack, refundDays: 10 },
    refundable: [{ order_id: OTHER, starts_at: Date.now(), refund_requested_at: null, unused: 200, refund_uzs: 13333 }],
  }), true);
  for (const broken of [
    { access: { ...access, packs: 0 } }, { access: { ...access, totalLimit: -300 } }, { access: { ...access, paidThrough: Number.NaN } },
    { access: { ...access, paidThrough: '2026-11-03' } }, { access: { ...access, firstRemaining: -1 } }, { access: { ...access, firstRemaining: 1.5 } },
    { payment: { id: ORDER, state: 'pending', provider: 'click', cancellable: 'yes' } },
  ]) assert.equal(validAccountView({ ...signedIn, ...broken }), false, JSON.stringify(broken));
});

test('a payment is checked every 3 s for two minutes, every 15 s up to ten, then no more', () => {
  assert.equal(checkoutPollDelay(0), 3_000);
  assert.equal(checkoutPollDelay(119_999), 3_000);
  assert.equal(checkoutPollDelay(120_000), 15_000);
  assert.equal(checkoutPollDelay(599_999), 15_000);
  assert.equal(checkoutPollDelay(600_000), null);
  // 40 looks in the fast phase and 32 in the slow one: about 72, not one a second.
  let looks = 0;
  for (let at = 0, delay = checkoutPollDelay(0); delay !== null; at += delay, delay = checkoutPollDelay(at)) looks++;
  assert.ok(looks >= 70 && looks <= 74, String(looks));
  const source = readFileSync(new URL('../src/gpt-chat/use-account.ts', import.meta.url), 'utf8');
  assert.match(source, /const delay = checkoutPollDelay\(Date\.now\(\) - watchSince\);/);
  assert.match(source, /if \(document\.visibilityState !== 'hidden'\) void refresh\(\);/);
  assert.doesNotMatch(source, /attempts >= 6|5_000\)/, 'the old 5 s × 6 poll is gone');
});

test('the watched payment ends only by what the server says about that order', () => {
  const watch = (over: Partial<CheckoutWatch> = {}): CheckoutWatch => ({ provider: 'click', flow: 'redirect', at: NOW, attemptId: ORDER, before: null, ...over });
  const view = (state: string, id = ORDER): AccountView => ({ ...account(), payment: { id, state, provider: 'click' } });
  assert.equal(settledCheckout(null, watch()), null);
  assert.equal(settledCheckout(account(), watch()), null, 'no order yet');
  for (const state of ['pending', 'prepared']) assert.equal(settledCheckout(view(state), watch()), null, state);
  assert.equal(settledCheckout(view('paid'), watch()), 'paid');
  for (const state of ['cancelled', 'refunded']) assert.equal(settledCheckout(view(state), watch()), 'cancelled', state);
  assert.equal(settledCheckout(view('paid', OTHER), watch()), null, 'another order paid says nothing about this one');
  // The Uzum Bank app: Uzum opens the order, so the one after `before` counts.
  const app = watch({ provider: 'uzum', flow: 'code', attemptId: null, before: OTHER });
  assert.equal(settledCheckout(view('paid', OTHER), app), null, 'the order from before the code');
  assert.equal(settledCheckout(view('paid', ORDER), app), 'paid');
  assert.equal(settledCheckout(view('paid', ORDER), watch({ flow: 'code', attemptId: null, before: null })), 'paid', 'the first order of the account');
  // Back with ?pay=return and nothing stored: the newest order.
  assert.equal(settledCheckout(view('paid', OTHER), watch({ provider: null, attemptId: null })), 'paid');
});

test('"still pending" waits for the account view and the ten minutes, and never comes beside an end', () => {
  const watch: CheckoutWatch = { provider: 'click', flow: 'redirect', at: NOW, attemptId: ORDER, before: null };
  const view = (state: string, id = ORDER): AccountView => ({ ...account(), payment: { id, state, provider: 'click' } });
  assert.equal(pendingDelay(null, watch, NOW), null, 'nothing answered yet: nothing to say');
  assert.equal(pendingDelay(view('prepared'), watch, NOW + 60_000), 540_000);
  assert.equal(pendingDelay(account(), watch, NOW), 600_000, 'no order in the view yet');
  assert.equal(pendingDelay(view('paid', OTHER), watch, NOW + 60_000), 540_000, 'another order paid says nothing about this one');
  // Back after the ten minutes, still waiting: pending at once.
  assert.equal(pendingDelay(view('prepared'), watch, NOW + 700_000), 0);
  // Back after the ten minutes and already paid or cancelled: that is the
  // result, so no 0 ms pending timer races it (AiAccountPanel).
  for (const state of ['paid', 'cancelled', 'refunded']) assert.equal(pendingDelay(view(state), watch, NOW + 700_000), null, state);
  const panel = readFileSync(new URL('../src/gpt-chat/components/AiAccountPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /const delay = pendingDelay\(data, checkout\);\s*if \(delay === null\) return;\s*const timer = window\.setTimeout\(\(\) => settle\("pending"\), delay\);/);
});

test('the trip to the payment page is remembered for 30 minutes: provider, time and order, nothing else', (t) => {
  const { local } = memoryStorage(t);
  const trip: CheckoutWatch = { provider: 'uzum', flow: 'redirect', at: NOW, attemptId: ORDER, before: null };
  saveCheckout(trip);
  assert.deepEqual(Object.keys(JSON.parse(local.get('gptchat_checkout')!)).sort(), ['at', 'attemptId', 'before', 'flow', 'provider']);
  assert.deepEqual(loadCheckout(NOW + 60_000), trip);
  assert.equal(loadCheckout(NOW + CHECKOUT_TTL_MS), null, 'an old trip is not a return from paying');
  assert.equal(loadCheckout(NOW - 1), null, 'a trip from the future (a clock set back) is not trusted');
  for (const broken of [{ provider: 'paypal' }, { flow: 'wire' }, { at: 'now' }, { attemptId: 'pay_1' }, { before: 'x' }]) {
    local.set('gptchat_checkout', JSON.stringify({ ...trip, ...broken }));
    assert.equal(loadCheckout(NOW + 1), null, JSON.stringify(broken));
  }
  local.set('gptchat_checkout', '{');
  assert.equal(loadCheckout(NOW), null);
  saveCheckout(trip);
  saveCheckout(null);
  assert.equal(local.has('gptchat_checkout'), false);
  assert.equal(orderId(ORDER), ORDER);
  for (const value of [undefined, null, 'ord_1', `pay_${'A'.repeat(32)}`, 42]) assert.equal(orderId(value), null);
});

test('a purchase reaches GA4 once per order, as ecommerce, without anything personal', (t) => {
  const { local } = memoryStorage(t);
  assert.equal(firstReport(ORDER), true);
  assert.equal(firstReport(ORDER), false, 'a reload or a second tab does not count it again');
  assert.equal(firstReport(OTHER), true);
  assert.deepEqual(JSON.parse(local.get('gptchat_purchases')!), [OTHER, ORDER]);
  const g = globalThis as Record<string, unknown>;
  const sent: unknown[][] = [];
  g.window = { gtag: (...args: unknown[]) => sent.push(args) };
  t.after(() => { delete g.window; });
  trackPurchase({ transactionId: ORDER, value: 20000, itemId: 'ai_paket_300', itemName: 'AI paket 300', provider: 'click' });
  const [kind, event, payload] = sent[0] as [string, string, Record<string, unknown>];
  assert.deepEqual([kind, event], ['event', 'purchase']);
  assert.deepEqual(
    Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'route' && key !== 'lang')),
    { provider: 'click', transaction_id: ORDER, value: 20000, currency: 'UZS', items: [{ item_id: 'ai_paket_300', item_name: 'AI paket 300', price: 20000, quantity: 1 }] },
  );
  // Through GTM's dataLayer the ecommerce object is replaced, not merged.
  const layer: unknown[] = [];
  g.window = { dataLayer: layer };
  trackPurchase({ transactionId: ORDER, value: 20000, itemId: 'ai_paket_300', itemName: 'AI paket 300', provider: 'uzum' });
  assert.deepEqual(layer[0], { ecommerce: null });
  assert.equal((layer[1] as { event: string }).event, 'purchase');
  assert.equal((layer[1] as { ecommerce: { transaction_id: string } }).ecommerce.transaction_id, ORDER);
  // The order id never rides on the catalogue's flat parameters.
  assert.equal(GA4_PARAMS.has('transaction_id'), false);
});

test('every funnel step the window sends is one the server counts', (t) => {
  memoryStorage(t);
  assert.deepEqual([...PACK_FROM], [...UI_EVENTS.pack_viewed]);
  const bodies: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/gpt/event');
    assert.equal(init.keepalive, true);
    bodies.push(String(init.body));
    return new Response('{}');
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = real; });
  for (const [type, details] of Object.entries(UI_EVENTS)) {
    for (const detail of details) recordUiEvent('', type as keyof UiEventDetails, detail as never);
  }
  const events = bodies.map((body) => JSON.parse(body) as Record<string, unknown>);
  assert.equal(events.length, Object.values(UI_EVENTS).flat().length);
  for (const event of events) {
    assert.ok(parseUiEvent(event), JSON.stringify(event));
    assert.deepEqual(Object.keys(event).sort(), ['detail', 'id', 'type', 'view']);
  }
  assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'a fresh id per event');
  assert.equal(new Set(events.map((e) => e.view)).size, 1, 'one tab, one view id');
});

// ── a failed account read after an answer (plan M-01, NOW-01) ──

test('a failed read after someone was known leaves the screen, the counters and the pack button alone', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  const onAccount = source.slice(source.indexOf('const onAccount = useCallback('), source.indexOf('}, [config.locale]);'));
  // First thing in onAccount, before any branch that clears or loads.
  const guard = onAccount.slice(0, onAccount.indexOf('const scope ='));
  assert.match(guard, /if \(account === null && cause === "unreachable" && establishedIdentityRef\.current !== null\) \{\s*unstableRef\.current = true;\s*setAccountState\("unknown"\);\s*return;\s*\}/);
  assert.doesNotMatch(guard, /setMessages|setSavedChats|setSessionId|setRemaining|setHourLeft|setFreeLimits|setBillingAvailable|setPaid|setPackTerms|setBotHandoff|setInput|abort\(/);
  // The same visitor answers again: the screen becomes the stored conversation, once.
  assert.match(onAccount, /if \(account && unstableRef\.current && accountIdentityRef\.current === identity\)\s*saveHistory\(shownRef\.current\.messages\.filter\(\(m\) => !m\.streaming\), config\.locale, scope\);\s*if \(account\) unstableRef\.current = false;/);
  // Back online: read the account again at once.
  assert.match(source, /const online = \(\) => setAccountRefresh\(\(n\) => n \+ 1\);\s*window\.addEventListener\("online", online\);\s*return \(\) => window\.removeEventListener\("online", online\);/);
  // The line above the composer; a guest's button only reads again.
  assert.match(source, /\{accountState === "unknown" && <p role="status" className="gpt-panel-note">\{t\.premium\.accountUnstable\} <button type="button" className="gpt-text-button" onClick=\{\(\) => \{ if \(signedIn\) openAccount\("account_check"\); setAccountRefresh\(n => n \+ 1\); \}\}>\{t\.premium\.recheck\}<\/button><\/p>\}/);
  assert.equal(strings('uz').premium.accountUnstable, 'Server bilan aloqa beqaror: chat ishlayveradi, lekin bu suhbat hozircha brauzerda saqlanmaydi.');
  assert.equal(strings('ru').premium.accountUnstable, 'Связь с сервером нестабильна: чат работает, но этот разговор пока не сохраняется в браузере.');
  assert.deepEqual([strings('uz').premium.recheck, strings('ru').premium.recheck], ['Qayta tekshirish', 'Проверить снова']);
});

test('use-account: a failed read says unreachable and keeps the view; signing out says so and forgets it', async (t) => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const heard: Array<[boolean, AccountCause]> = [];
  let handle: AccountHandle | null = null;
  function Probe() {
    handle = useAccount('', (view, cause) => heard.push([view !== null, cause]), 0, null);
    return null;
  }
  // Rendered once on the server: effects do not run, the handle's callbacks do.
  renderToStaticMarkup(React.createElement(Probe));
  const answers: Response[] = [Response.json(account()), Response.json({ ok: false }, { status: 503 }), Response.json({ ok: false }, { status: 503 })];
  t.mock.method(globalThis, 'fetch', async () => answers.shift() ?? assert.fail('one read and one retry only'));
  await handle!.refresh();
  assert.deepEqual(heard, [[true, 'read']]);
  await handle!.refresh(); // fails, and fails again after the 1.5 s retry
  assert.deepEqual(heard.at(-1), [false, 'unreachable']);
  handle!.fail();
  assert.deepEqual(heard.at(-1), [false, 'unreachable']);
  handle!.forget();
  assert.deepEqual(heard.at(-1), [false, 'signed_out']);
  // Only signing out forgets the last view; a failure keeps it (and the pack button).
  const source = readFileSync(new URL('../src/gpt-chat/use-account.ts', import.meta.url), 'utf8');
  const failed = source.slice(source.indexOf('} catch {\n      // The last view stays'), source.indexOf('} finally {'));
  assert.match(failed, /setError\(true\);\s*onAccount\(null, 'unreachable'\);/);
  assert.doesNotMatch(failed, /setData/);
  assert.match(source, /const fail = useCallback\(\(\) => \{\s*setError\(true\);\s*onAccount\(null, 'unreachable'\);\s*\}, \[onAccount\]\);/);
  assert.match(source, /const forget = useCallback\(\(\) => \{\s*setData\(null\);\s*onAccount\(null, 'signed_out'\);\s*\}, \[onAccount\]\);/);
});

// ── writing at once (NOW-02: plan NET-01, M-10, M-11) ──

test('sending waits for nothing it does not need; the question shows at the tap', () => {
  const source = readFileSync(new URL('../src/gpt-chat/components/AiChatConsole.tsx', import.meta.url), 'utf8');
  // Not the account view, not a config on its way: only a check the server asked for.
  assert.match(source, /const turnstileReady =\s*turnstileConfig === null \|\| !turnstileConfig\.required \|\| !!turnstileToken;/);
  assert.match(source, /const sendDisabled = busy \|\| limitBlocked \|\| !turnstileReady;/);
  assert.doesNotMatch(source, /accountState === "loading"/);
  // The bubble and «AI o‘ylayapti…» are set before the session request is awaited.
  const send = source.slice(source.indexOf('const doSend = async ('), source.indexOf('const handleJson ='));
  const shown = send.indexOf('setMessages(withUser);');
  assert.ok(shown > 0 && shown < send.indexOf('await ensureSession()'), 'setMessages(withUser) before await ensureSession()');
  assert.match(send, /const sid = await ensureSession\(\);\s*if \(generation !== identityGeneration\.current\) return;/);
  // No «loading the security check» line for everyone; an error line only when a required check has no key.
  assert.doesNotMatch(source, /!turnstileConfig \|\| turnstileConfigError/);
  assert.match(source, /setTurnstileConfigError\(next\.required && !next\.siteKey\);/);
  assert.equal((source.match(/t\.turnstileLoading/g) ?? []).length, 2, 'the lazy check\'s placeholder and its own loading text only');
  // A refused check asks for the config again.
  const refusedCheck = source.slice(source.indexOf('res.code === "turnstile_failed" ? t.turnstileRetry'), source.indexOf('track(EV.aiResponseError', source.indexOf('res.code === "turnstile_failed" ? t.turnstileRetry')));
  assert.match(refusedCheck, /setConfigRead\(\(n\) => n \+ 1\);/);
  assert.match(source, /\}, \[config\.apiBase, configRead\]\);/);
});
