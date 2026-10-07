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

import { EV, GA4_PARAMS, inAppOf, track } from '../src/gpt-chat/analytics';
import { strings } from '../src/gpt-chat/i18n';
import { accountStrings } from '../src/gpt-chat/account-strings';
import { leadStrings } from '../src/gpt-chat/lead-strings';
import { answerStrings } from '../src/gpt-chat/answer-strings';
import { answerAsk, copyText, MessageActions, SHARE_SIGNATURE, telegramShare, translationOf } from '../src/gpt-chat/components/AiAnswer';
import { plainText } from '../src/gpt-chat/plain-text';
import { applyRole } from '../src/gpt-chat/roles';
import { showsAccountPill, type AccountView } from '../src/gpt-chat/types';
import { AiChatInput } from '../src/gpt-chat/components/AiChatInput';
import { AiChatMessageList, PendingLine } from '../src/gpt-chat/components/AiChatMessageList';
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
      const pack = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: null };
      for (const args of [[0], [1], [5], [15], [null], [{ daily: 15, hourly: 5 }], [15, true], [50, 3, false], [pack], [pack, true]]) {
        // A sample a function cannot take (the pack terms given to a counter,
        // a number given to the pack's line) is skipped; the right one is in the list.
        let result: unknown;
        try { result = (value as (...a: unknown[]) => unknown)(...args); } catch { continue; }
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
    // The chat's lines, and those of its lazy parts: the pack window, the business card and the answer's row.
    for (const line of [...allCopy(strings(locale)), ...allCopy(accountStrings(locale)), ...allCopy(leadStrings(locale)), ...allCopy(answerStrings(locale))]) {
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

test('the brand is GPTBot.uz in the header and above every answer; the composer’s line says what it is not', () => {
  for (const locale of LOCALES) {
    const t = strings(locale);
    assert.equal(t.brand, 'GPTBot.uz');
    const input = renderToStaticMarkup(React.createElement(AiChatInput, {
      value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t, inputRef: React.createRef<HTMLTextAreaElement>(),
    }));
    // The header and every answer carry the brand (chat design §5.3): the
    // composer's line no longer repeats it, and says «not OpenAI» instead.
    assert.doesNotMatch(input, /gpt-input-identity/);
    assert.ok(input.includes(t.inputMicrocopy));
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

// Chat UI 2026-10-07 (§7, G12, G19): the line under the composer is one line
// from 360px — not OpenAI, no personal data, the privacy policy — and the
// sentence about the foreign AI providers moved to the first screen, under
// the terms, where it stays while the first question is typed (the keyboard
// open). In a conversation the menu says it: the disclaimer (third-party
// models) and the saved chats' note (foreign AI providers).
test('under the composer, on every screen: not OpenAI, no personal data, and the privacy policy; the providers on the first screen', () => {
  const expected = {
    ru: ['Не продукт OpenAI', 'Не пишите личные данные'],
    uz: ['OpenAI mahsuloti emas', 'Shaxsiy ma’lumot yozmang'],
  };
  const providers = { ru: 'зарубежным AI-провайдерам', uz: 'xorijdagi AI-provayderlarga' };
  for (const locale of LOCALES) {
    const t = strings(locale);
    for (const part of expected[locale]) assert.ok(t.inputMicrocopy.includes(part), `${locale}: ${part}`);
    assert.ok(t.providerNote.includes(providers[locale]), `${locale}: the providers`);
    assert.ok(t.premium.historyNote.includes(providers[locale].split(' ')[0]), `${locale}: the menu says it too`);
    const input = renderToStaticMarkup(React.createElement(AiChatInput, {
      value: '', onChange: () => {}, onSend: () => {}, maxChars: 3000, t, inputRef: React.createRef<HTMLTextAreaElement>(),
    }));
    assert.ok(input.includes(`<span data-testid="ai-input-microcopy">${t.inputMicrocopy} · `
      + `<a href="${t.privacyHref}" data-testid="ai-input-privacy">${t.privacyLink}</a></span>`), locale);
    // The policy of this locale (plan WP-18): what the chat keeps and who receives it.
    assert.equal(t.privacyHref, locale === 'uz' ? '/uz/maxfiylik-siyosati/' : '/ru/politika-konfidentsialnosti/');
    assert.equal(t.privacyLink, locale === 'uz' ? 'Maxfiylik' : 'Приватность');
    // The menu's disclaimer (hidden on a phone until ☰) says the same and more.
    assert.match(t.disclaimer, /GPTBot\.uz/);
    assert.match(t.disclaimer, /OpenAI/);
  }
  // Nothing hides the line on a narrow screen, nor the providers' sentence (the keyboard open included).
  const css = read('src/gpt-chat/premium.css');
  for (const rule of css.matchAll(/([^{}]*gpt-(?:input-footnote|meta-note)[^{}]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(rule[2], /display:\s*none|visibility:\s*hidden/, rule[0]);
    const size = rule[2].match(/font-size:\s*(\d+)px/);
    if (size) assert.ok(Number(size[1]) >= 10, `${rule[0]}: the line shrinks below 10px`);
  }
  // The keyboard hides the terms' first line, never the note.
  const keyboard = css.match(/\.gpt-premium\[data-keyboard="open"\] :is\(([^)]*)\) \{ display: none; \}/);
  assert.ok(keyboard, 'the keyboard rule');
  assert.match(keyboard[1], /\.gpt-meta > :first-child/);
  assert.doesNotMatch(keyboard[1], /gpt-meta-note|gpt-meta,|gpt-input-footnote/);
  // The resting screen renders it inside the terms.
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /<p className="gpt-meta">\s*<span>\{paid \? t\.premium\.manual : t\.emptyMeta\(freeLimits\)\}<\/span>\s*<span className="gpt-meta-note">\{t\.providerNote\}<\/span>\s*<\/p>/);
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
  assert.match(consoleSource, /t\.hourWarning\(hourShown\)/);
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
    access: { order_id: 'o', ends_at: Date.now() + 1e9, remaining: 10, renewSoon: false },
  })), true);

  const panel = read('src/gpt-chat/components/AiAccountPanel.tsx');
  assert.match(panel, /const reachable = showsAccountPill\(data\);/);
  assert.match(panel, /\{reachable && \(\s*<DialogTrigger asChild>/);
  assert.match(panel, /\{data\?\.access \? t\.premium\.accountActive : t\.premium\.account\}/);
  const window = read('src/gpt-chat/account/AccountDialog.tsx');
  // The price card for a guest and the pay step for an account, only while a
  // pack can be bought, with the numbers the server states.
  assert.match(window, /\{billingAvailable && pack && <PlanCard t=\{t\} copy=\{copy\} pack=\{pack\} notes=/);
  // Guest checkout (Click without an account) is a pay step too, under the same condition.
  assert.match(window, /const payStep = billingAvailable && pack && \(data\?\.user \|\| guestPay\) && \(/);
  assert.match(window, /const guestPay = !!data && !data\.user && billingAvailable && !!pack && canPayAsGuest\(data\)\s*&& !cookiesBlocked && globalThis\.navigator\?\.cookieEnabled !== false;/);
  assert.match(window, /copy\.packFeatures\(pack\.months, pack\.messageLimit, pack\.dailyLimit\)\.map/);
  assert.match(window, /copy\.price\(groupDigits\(pack\.priceUzs\), pack\.months, pack\.messageLimit\)/);
  assert.match(window, /const copy = accountStrings\(locale\);/);
  // Every word the window shows comes from the copy files, in the visitor's
  // language (a path such as /uz/maxfiylik-siyosati/ is not a word).
  const screens = files('src/gpt-chat/account').map(read);
  assert.ok(screens.length >= 5, 'the window and its screens');
  for (const source of [panel, ...screens]) assert.doesNotMatch(source, /locale === ['"]uz['"] \? ['"](?!\/)[^'"]*[a-zа-я]{3}/i);

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
  // The word gives way to «UZ» below 390px, never cut.
  assert.match(rule[1], /\.gpt-header:has\(\.gpt-account-trigger\) \.gpt-lang-full \{ display: none; \}/);
  assert.match(rule[1], /\.gpt-header:has\(\.gpt-account-trigger\) \.gpt-lang-short \{ display: inline; \}/);
  // The header's honest line takes its short form («не OpenAI») up to 479px: at 390 and 412 the
  // word «O‘zbekcha» and the labelled pack button leave the long one no room (chat UI A15).
  const wide = css.match(/@media \(max-width: 479px\) \{([^@]*)\}/);
  assert.ok(wide, 'a 479px rule exists');
  assert.match(wide[1], /\.gpt-header:has\(\.gpt-account-trigger\) \.gpt-sub-full \{ display: none; \}/);
  assert.match(wide[1], /\.gpt-header:has\(\.gpt-account-trigger\) \.gpt-sub-short \{ display: inline; \}/);
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

test('the composer stops at the limit, says when a paste did not fit, and never sends or cuts text over it', () => {
  const input = (value: string, maxChars: number, locale: 'ru' | 'uz' = 'uz') => renderToStaticMarkup(React.createElement(AiChatInput, {
    value, onChange: () => {}, onSend: () => {}, maxChars, t: strings(locale), inputRef: React.createRef<HTMLTextAreaElement>(),
  }));
  for (const locale of LOCALES) {
    const t = strings(locale);
    const html = input('x'.repeat(2900), 2950, locale);
    // The browser blocks typing past the limit and cuts a paste at the caret: no character of the visitor's own text goes.
    assert.match(html, /maxLength="2950"|maxlength="2950"/, locale);
    assert.ok(html.includes(t.charsLeft(50)), `${locale}: the counter counts against the honest limit`);
    // The limit fell under the text (another role, an older draft, a question put back): not sent, not cut, said.
    const over = input('x'.repeat(2643), 2541, locale);
    assert.ok(over.includes(`<p class="gpt-input-status" data-over="true" role="status">${t.charsOver(102)}</p>`), `${locale}: by how much`);
    assert.match(over, /<button[^>]*disabled=""[^>]*aria-label="[^"]*"/, `${locale}: the send button is off`);
    assert.match(over, />x{2643}<\/textarea>/, `${locale}: the text stays whole`);
    assert.doesNotMatch(input('x'.repeat(10), 2541, locale), /<button[^>]*disabled=""/);
  }
  assert.equal(strings('uz').inputCut, 'Matn juda uzun edi — oxiri kesildi. Qismlarga bo‘lib yuboring.');
  assert.equal(strings('ru').inputCut, 'Текст был слишком длинным — конец обрезан. Отправьте частями.');
  const source = read('src/gpt-chat/components/AiChatInput.tsx');
  assert.match(source, /<textarea ref=\{inputRef\} value=\{value\} maxLength=\{maxChars\}/);
  // A paste that does not fit is said for 8 s.
  assert.match(source, /if \(el\.value\.length - \(el\.selectionEnd - el\.selectionStart\) \+ pasted\.length > maxChars\) setCutAt\(Date\.now\(\)\);/);
  assert.match(source, /window\.setTimeout\(\(\) => setCutAt\(0\), 8_000\)/);
  // The safety net cuts only text that grew past the limit, never what was over it before.
  assert.match(source, /if \(next\.length > maxChars && next\.length > value\.length\) \{\s*setCutAt\(Date\.now\(\)\);\s*onChange\(next\.slice\(0, Math\.max\(maxChars, value\.length\)\)\);\s*\} else onChange\(next\);/);
  // Neither Enter nor the button sends text over the limit.
  assert.match(source, /if \(!disabled && !busy && value\.trim\(\) && !over\) onSend\(\);/);
  // An empty field leaves the button bright: it focuses the field and sends nothing (chat design §5.3).
  assert.match(source, /onClick=\{\(\) => \(empty \? inputRef\.current\?\.focus\(\) : onSend\(\)\)\}\s*disabled=\{disabled \|\| busy \|\| over\} aria-disabled=\{empty \|\| undefined\}/);
  // Over the limit says by how much at once, even within the 8 s of a cut paste's line.
  assert.match(source, /const status = over \? t\.charsOver\(-left\) : cutAt \? t\.inputCut : left <= 200 \? t\.charsLeft\(left\) : null;/);
  assert.match(source, /\{status && <p className="gpt-input-status" data-over=\{over \|\| undefined\} role="status">\{status\}<\/p>\}/);
});

test('a message too long for the server offers «change the question», not a retry that fails the same way', () => {
  const uz = strings('uz');
  const list = (last: string) => renderToStaticMarkup(React.createElement(MessageScrollerProvider, null,
    React.createElement(MessageScroller, null, React.createElement(MessageScrollerViewport, null,
      React.createElement(AiChatMessageList, {
        t: uz, onRetry: () => {}, onEdit: () => {},
        messages: [{ role: 'user', content: 'Savol' }, { role: 'assistant', content: last, error: true }],
      })))));
  const tooLong = list(uz.premium.contextTooLarge);
  assert.ok(tooLong.includes(uz.premium.editQuestion));
  assert.ok(!tooLong.includes(uz.retry), 'no retry');
  const network = list(uz.errorNetwork);
  assert.ok(network.includes(uz.retry) && network.includes(uz.premium.editQuestion));
  for (const locale of LOCALES) assert.doesNotMatch(strings(locale).premium.contextTooLarge, /vaqtincha|временно/);
});

// ── the buttons under an answer (NOW-04: plan ACT-01..03, M-09) ─────────────

const actions = (props: Partial<Parameters<typeof MessageActions>[0]> = {}) => renderToStaticMarkup(React.createElement(MessageActions, {
  content: 'Javob matni', locale: 'uz', isLast: true, onRetry: () => {}, onAsk: () => {}, ...props,
}));

test('the bubble shows a button’s name; the model gets its instruction with the answer, or with its end to continue', () => {
  const answer = `${'Birinchi qism. '.repeat(100)}\n\n${'Oxirgi qism. '.repeat(100)}`;
  for (const locale of LOCALES) {
    const s = answerStrings(locale);
    const [cont, contRequest] = answerAsk('continue', answer, locale);
    assert.equal(cont, s.continue);
    assert.ok(contRequest.startsWith(`${s.ask.continue}\n\n`) && contRequest.endsWith(answer.slice(-1200)), `${locale}: continue sends the end`);
    assert.ok(!contRequest.includes('Birinchi qism. Birinchi'), `${locale}: not the start`);
    const [simpler, simplerRequest] = answerAsk('shorter', answer, locale);
    assert.equal(simpler, s.simpler);
    assert.ok(simplerRequest.length <= s.ask.shorter.length + 2 + 1900);
    assert.ok(simplerRequest.endsWith('Birinchi qism. '), `${locale}: a long answer goes back cut at a paragraph`);
    // Nothing a button sends is too long for the server with the longest role.
    for (const kind of ['shorter', 'continue', 'russian', 'uzbek'] as const) {
      assert.ok(applyRole(answerAsk(kind, answer, locale)[1], 'business', locale).length <= 3000, `${locale}/${kind}`);
    }
    for (const line of Object.values(s.ask)) assert.doesNotMatch(line, DISHONEST);
  }
  assert.ok(!JSON.stringify(answerStrings('uz')).includes("'"), 'Uzbek copy uses ‘ (U+2018)');
  assert.match(answerStrings('uz').toUzbek, /O‘zbekchaga/);
});

test('«simpler» and «continue» keep the answer’s language: the page’s name on the button, the answer’s lines for the model', () => {
  const ruAnswer = 'Чтобы открыть счёт в банке, возьмите паспорт и ИНН. Сотрудник проверит документы и выдаст карту.';
  const uzAnswer = 'Bank hisobini ochish uchun pasport va STIR kerak bo‘ladi. Xodim hujjatlarni tekshirib, karta beradi.';
  // A Russian answer on the Uzbek page.
  const [label, request, frame] = answerAsk('shorter', ruAnswer, 'uz', 'ru');
  assert.equal(label, answerStrings('uz').simpler, 'the button keeps its Uzbek name in the bubble');
  assert.equal(frame, 'ru');
  assert.ok(request.startsWith(`${answerStrings('ru').ask.shorter}\n\n`), request.slice(0, 60));
  const sent = applyRole(request, 'general', frame);
  assert.ok(sent.startsWith('Работай как универсальный AI-помощник.\nОтвечай на языке вопроса'), sent.slice(0, 80));
  assert.ok(sent.includes('Задача: Объясни следующий ответ проще'));
  assert.doesNotMatch(sent, /Vazifa|shu tilda/);
  // The mirror: an Uzbek answer on the Russian page.
  const [ruLabel, uzRequest, uzFrame] = answerAsk('shorter', uzAnswer, 'ru', 'uz');
  assert.equal(ruLabel, 'Объяснить проще');
  assert.ok(uzRequest.startsWith('Quyidagi javobni oddiyroq tushuntir'));
  assert.ok(applyRole(uzRequest, 'general', uzFrame).includes('Vazifa: Quyidagi javobni oddiyroq tushuntir'));
  const [, contRequest, contFrame] = answerAsk('continue', uzAnswer, 'ru', 'uz');
  assert.ok(contRequest.startsWith(answerStrings('uz').ask.continue) && contFrame === 'uz');
  // A translation names its language: the page's instruction and frame, whatever the answer's.
  const [, toRu, toRuFrame] = answerAsk('russian', uzAnswer, 'uz', 'uz');
  assert.ok(toRu.startsWith(answerStrings('uz').ask.russian) && toRuFrame === 'uz');
  const [, toUz, toUzFrame] = answerAsk('uzbek', ruAnswer, 'ru', 'ru');
  assert.ok(toUz.startsWith(answerStrings('ru').ask.uzbek) && toUzFrame === 'ru');
  assert.equal(answerAsk('russian', uzAnswer, 'ru', 'uz')[2], 'ru', 'a translation ignores the answer’s frame');
  // The row reads the answer's language once, for the last answer; the console frames the request with it, and a retry too.
  const source = read('src/gpt-chat/components/AiAnswer.tsx');
  assert.match(source, /const frame = isLast \? frameLocale\(content, locale\) : locale;/);
  assert.match(source, /const \[text, request, own\] = answerAsk\(kind, content, locale, frame\);/);
  assert.match(source, /onAsk\?\.\(kind, text, request, own\)/);
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /void doSend\(text, \{ answerAction: action, request, frame, tool: activeTool \}\);/);
  assert.match(consoleSource, /const ask = meta\.answerAction && meta\.request \? \{ request: meta\.request, action: meta\.answerAction, frame: meta\.frame \} : undefined;/);
  assert.match(consoleSource, /answerAction: ask\?\.action, frame: ask\?\.frame, prior \}\);/);
  // Every button, in every frame, with the longest role, fits the server's 3000.
  const long = `${'Birinchi qism. '.repeat(100)}\n\n${'Последняя часть. '.repeat(100)}`;
  for (const locale of LOCALES) for (const f of LOCALES) for (const kind of ['shorter', 'continue', 'russian', 'uzbek'] as const) {
    const [, req, own] = answerAsk(kind, long, locale, f);
    for (const role of ['business', 'translator', 'teacher'] as const) assert.ok(applyRole(req, role, own).length <= 3000, `${locale}/${f}/${kind}/${role}`);
  }
});

test('a translation goes the other way from the answer’s script, without the language line', () => {
  assert.equal(translationOf('Salom! Bu javob o‘zbek tilida.'), 'russian');
  assert.equal(translationOf('Привет! Это ответ на русском.'), 'uzbek');
  assert.equal(translationOf('Ўзбекча кирилл ёзуви'), 'uzbek');
  // The translation is an item of the «⋯» menu (chat UI §5.7), in the direction the answer's script says.
  assert.match(read('src/gpt-chat/components/AiAnswer.tsx'), /const rest = \[\s*action\("shorter", true\),\s*action\(translationOf\(content\)\),/);
  for (const locale of LOCALES) {
    const s = answerStrings(locale);
    assert.equal(answerAsk('russian', 'Salom, bu javob.', locale)[0], s.toRussian, locale);
    assert.equal(answerAsk('uzbek', 'Привет, это ответ.', locale)[0], s.toUzbek, locale);
    assert.match(answerAsk('russian', 'Salom', locale)[1], locale === 'uz' ? /rus tiliga/ : /на естественный русский/);
    assert.match(answerAsk('uzbek', 'Привет', locale)[1], locale === 'uz' ? /o‘zbek tiliga \(lotin yozuvida\)/ : /Uzbek Latin/);
  }
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /applyRole\(\s*meta\.request \?\? trimmed,\s*role,\s*meta\.request \? meta\.frame \?\? config\.locale : role === "translator" \? config\.locale : frameLocale\(trimmed, config\.locale\),\s*\{ guard: role !== "translator" && meta\.answerAction !== "uzbek" && meta\.answerAction !== "russian" \},\s*\)/);
});

test('retry and «Qayta yozish» replace the last answer: the question is in the thread and the history once', () => {
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /void doSend\(content, \{ retry: true, base: messages\.slice\(0, idx\), request: ask\?\.request, answerAction: ask\?\.action, frame: ask\?\.frame, prior \}\);/);
  assert.match(consoleSource, /const history = \(meta\.base \?\? messages\)\.filter\(\(m\) => !m\.pending && !m\.error\);/);
  // The thread drops the old pair; the history sent is built from the same base.
  assert.match(consoleSource, /const withUser: ChatMessage\[\] = \[\s*\.\.\.history,\s*\{ role: "user", content: trimmed, ask \},/);
  assert.match(consoleSource, /history,\s*turnstileToken: turnstileToken \|\| undefined,/);
  // «Savolni o‘zgartirish»: the question back into the composer, out of the thread.
  assert.match(consoleSource, /setInput\(messages\[idx\]\.content\);\s*persist\(messages\.slice\(0, idx\)\);/);
  // message_sent says which button, never the text.
  assert.match(consoleSource, /mode: meta\.answerAction,/);
  assert.equal(strings('uz').premium.editQuestion, 'Savolni o‘zgartirish');
  assert.equal(strings('ru').premium.editQuestion, 'Изменить вопрос');
  const list = renderToStaticMarkup(React.createElement(MessageScrollerProvider, null,
    React.createElement(MessageScroller, null, React.createElement(MessageScrollerViewport, null,
      React.createElement(AiChatMessageList, {
        t: strings('uz'), locked: true, onRetry: () => {}, onEdit: () => {},
        messages: [{ role: 'user', content: 'Savol' }, { role: 'assistant', content: strings('uz').errorNetwork, error: true }],
      })))));
  assert.ok(list.includes(strings('uz').premium.editQuestion));
  assert.match(list, /<button type="button" disabled="" class="[^"]*">.*Qayta urinish<\/button>/, 'no retry during a limit');
});

test('a long wait says so after 8 s; Stop before the first word gives the question back', () => {
  for (const locale of LOCALES) {
    const t = strings(locale);
    const line = renderToStaticMarkup(React.createElement(PendingLine, { t }));
    assert.ok(line.includes(t.thinking) && !line.includes(t.premium.slow), `${locale}: «thinking» first`);
    assert.doesNotMatch(t.premium.slow, DISHONEST);
  }
  assert.equal(strings('uz').premium.slow, 'Javob odatdagidan uzoqroq tayyorlanmoqda. To‘xtatib, qayta yuborishingiz mumkin.');
  assert.equal(strings('ru').premium.slow, 'Ответ готовится дольше обычного. Можно остановить и отправить заново.');
  const list = read('src/gpt-chat/components/AiChatMessageList.tsx');
  assert.match(list, /const timer = window\.setTimeout\(\(\) => setSlow\(true\), 8_000\);\s*return \(\) => window\.clearTimeout\(timer\);/);
  assert.match(list, /\{slow \? t\.premium\.slow : t\.thinking\}/);
  assert.match(list, /\{m\.pending \? \(\s*<PendingLine t=\{t\} slow=\{slow\} \/>/);
  // A screen reader hears the same line at the same moment: the list's status, not a second live region.
  for (const locale of LOCALES) {
    const t = strings(locale);
    assert.ok(renderToStaticMarkup(React.createElement(PendingLine, { t, slow: true })).includes(t.premium.slow), locale);
  }
  assert.match(list, /const waiting = messages\.some\(\(m\) => m\.pending\);/);
  assert.match(list, /: slow\s*\? t\.premium\.slow\s*: t\.thinking/);
  assert.doesNotMatch(list.slice(list.indexOf('export function PendingLine'), list.indexOf('function PlainAnswer')), /role="status"|aria-live|setTimeout/);
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  const stopped = consoleSource.slice(consoleSource.indexOf('} else if (outcome.aborted) {'), consoleSource.indexOf('track(EV.generationStopped'));
  assert.match(stopped, /if \(acc\)[\s\S]*else giveBack\(\);/);
  // giveBack: the thread as before the tap; a typed question back in the composer.
  assert.match(consoleSource, /const before = meta\.base \? messages : history;\s*const giveBack = \(\) => \{\s*setMessages\(before\);\s*if \(!meta\.base && !meta\.answerAction\) setInput\(trimmed\);/);
});

test('a last question without an answer says so, with a retry and the way back to the composer', () => {
  const list = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(MessageScrollerProvider, null,
    React.createElement(MessageScroller, null, React.createElement(MessageScrollerViewport, null,
      React.createElement(AiChatMessageList, { t: strings('uz'), onRetry: () => {}, onEdit: () => {}, messages: [], ...props })))));
  const uz = strings('uz');
  const reloaded = list({ messages: [{ role: 'user', content: 'Savol' }] });
  assert.match(reloaded, /data-testid="ai-unanswered"/);
  assert.ok(reloaded.includes(uz.premium.unanswered) && reloaded.includes(uz.retry) && reloaded.includes(uz.premium.editQuestion));
  // Not while the answer is on its way, and not under an answer.
  assert.doesNotMatch(list({ busy: true, messages: [{ role: 'user', content: 'Savol' }, { role: 'assistant', content: '', pending: true }] }), /ai-unanswered/);
  assert.doesNotMatch(list({ messages: [{ role: 'user', content: 'Savol' }, { role: 'assistant', content: 'Javob' }] }), /ai-unanswered/);
  // It promises nothing about whether a message was spent.
  for (const locale of LOCALES) assert.doesNotMatch(strings(locale).premium.unanswered, /limit|лимит|списан|hisoblan/i);
  assert.equal(uz.premium.unanswered, 'Bu savolga javob kelmadi — ehtimol, sahifa yopilib qolgan. Qayta urinib ko‘ring.');
});

test('every button that sends is off while sending is paused; copying and sharing never are', () => {
  const html = actions({ locked: true, broken: true });
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  assert.equal(buttons.length, 4, 'copy, Telegram, continue, «⋯» (the menu of the rest is closed)');
  for (const button of buttons.slice(0, 2)) assert.ok(!button.includes('disabled'), 'copy and Telegram work during a limit');
  for (const button of buttons.slice(2)) assert.match(button, /disabled=""/);
  assert.ok(!actions().includes('disabled'));
  // Only the last answer has the rest; every answer can be copied and shared.
  assert.equal((actions({ isLast: false }).match(/<button/g) ?? []).length, 2);
});

// REV-7 (revision 2026-10-06-chat-design): «⋯» opens the rest of the row as a
// menu above it, instead of growing the row (NOW-04). Chat UI 2026-10-07 §5.7
// (G25): the same one row with a mouse too, so it never wraps.
test('on every pointer the row is copy, Telegram, continue on a cut answer and «⋯», the rest a menu', (t) => {
  const g = globalThis as Record<string, unknown>;
  const s = answerStrings('uz');
  t.after(() => { delete g.window; });
  const labels = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<svg[\s\S]*<\/svg>/, '').replace(/<\/?span[^>]*>/g, ''));
  g.window = { matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }) };
  const phone = actions();
  assert.deepEqual(labels(phone), [s.copy, s.share, '⋯']);
  // A screen reader says «Yana», not «midline horizontal ellipsis»; the menu is closed.
  assert.match(phone, /<button type="button" class="gpt-action gpt-action-more" aria-expanded="false" aria-label="Yana">/);
  assert.ok(!phone.includes('gpt-action-menu'));
  assert.deepEqual([answerStrings('uz').more, answerStrings('ru').more], ['Yana', 'Ещё']);
  assert.deepEqual(labels(actions({ broken: true })).slice(0, 3), [s.copy, s.share, s.continue]);
  // Locked (a limit, a turn): «⋯» would open a menu of disabled buttons.
  assert.match(actions({ locked: true }), /<button type="button" class="gpt-action gpt-action-more" aria-expanded="false" aria-label="Yana" disabled="">/);
  g.window = { matchMedia: () => ({ matches: false }) };
  assert.deepEqual(labels(actions()), [s.copy, s.share, '⋯']);
  assert.deepEqual(labels(actions({ broken: true })), [s.copy, s.share, s.continue, '⋯']);
  // «Davom ettir» is marked: below 640px it leaves copy and Telegram their icons only (premium.css).
  assert.match(actions({ broken: true }), /<button type="button" class="gpt-action gpt-action-continue">/);
  assert.match(read('src/gpt-chat/premium.css'), /@media \(max-width: 639px\) \{[^@]*\.gpt-action-row:has\(\.gpt-action-continue\) \.gpt-action-label \{ position: absolute;/);
  // No divider and no inline paid buttons any more.
  assert.doesNotMatch(read('src/gpt-chat/components/AiAnswer.tsx'), /gpt-action-divider|const phone =/);
  // The menu: every button keyed (no node turns into another), focus on its
  // first item, Escape and a tap outside close it, Escape gives the focus back
  // to «⋯», a choice closes it, and a second tap within 350 ms sends nothing.
  const source = read('src/gpt-chat/components/AiAnswer.tsx');
  assert.match(source, /<button key=\{kind\} ref=\{first \? firstRef : undefined\}/);
  assert.match(source, /key="more"/);
  assert.match(source, /<button key="regenerate"/);
  assert.match(source, /if \(!open\) return;\s*firstRef\.current\?\.focus\(\);/);
  assert.match(source, /document\.addEventListener\("pointerdown", away\);\s*document\.addEventListener\("keydown", away\);/);
  assert.match(source, /if \(event\.type === "keydown"\) moreRef\.current\?\.focus\(\);/);
  assert.match(source, /<div key="menu" ref=\{menuRef\} className="gpt-action-menu" data-below=\{below \|\| undefined\} onClick=\{\(\) => setOpen\(false\)\}>/);
  assert.match(source, /action\("shorter", true\)/);
  assert.match(source, /openedAt\.current = Date\.now\(\);\s*setOpen\(!open\);/);
  assert.match(source, /const settled = \(\) => Date\.now\(\) - openedAt\.current > 350;/);
  assert.match(source, /onClick=\{\(\) => settled\(\) && onAsk\?\.\(kind, text, request, own\)\}/);
  assert.match(source, /onClick=\{\(\) => settled\(\) && onRetry\(\)\}/);
  assert.doesNotMatch(source, /<>\s*\{broken && action/, 'no unkeyed fragments in the row');
  // The model line stays under every answer, as the chat pages' FAQ says.
  assert.match(read('src/gpt-chat/components/AiChatMessageList.tsx'), /\{t\.answeredBy\}: \{modelLabel\(m\.model\)\}/);
});

test('«‹ 1/2 ›»: the versions «Qayta yozish» made, at most 3, kept in this browser and never sent', () => {
  const u = answerStrings('uz');
  const two = actions({ versions: 2, version: 1, onVersion: () => {} });
  assert.match(two, new RegExp(`<div class="gpt-versions" role="group" aria-label="${u.versions}">`));
  assert.match(two, new RegExp(`<button type="button" aria-label="${u.versionBack}">‹</button><span>2/2</span><button type="button" disabled="" aria-label="${u.versionNext}">›</button>`));
  assert.ok(!actions().includes('gpt-versions'), 'one version, no switch');
  assert.match(actions({ versions: 3, version: 0, onVersion: () => {}, locked: true }), /<button type="button" disabled="" aria-label="[^"]+">‹<\/button>/);
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  // Only a finished answer in place of an old one keeps the old one; the last 3.
  assert.match(consoleSource, /const versions = \[\.\.\.\(prior\.versions \?\? \[\{ content: prior\.content, model: prior\.model \?\? null, truncated: prior\.truncated \}\]\), \{ content: answer\.content, model: answer\.model \?\? null, truncated: answer\.truncated \}\]\.slice\(-3\);/);
  assert.match(consoleSource, /const prior = messages\[idx \+ 1\]\?\.role === "assistant" && !messages\[idx \+ 1\]\.error \? messages\[idx \+ 1\] : undefined;/);
  // Showing another version spends nothing and is refused during a turn.
  assert.match(consoleSource, /if \(busy \|\| !shown\) return;\s*persist\(messages\.map\(\(x, i\) => \(i === index \? \{ \.\.\.x, \.\.\.shown, version \} : x\)\)\);/);
  // The server gets the shown text only.
  assert.match(read('src/gpt-chat/api.ts'), /history: params\.history\.map\(\(m\) => \(\{ role: m\.role, content: m\.content \}\)\),/);
  for (const locale of LOCALES) for (const line of [answerStrings(locale).versions, answerStrings(locale).versionBack, answerStrings(locale).versionNext]) assert.doesNotMatch(line, DISHONEST);
});

test('while few messages are left, once a session: the buttons that make the AI write cost a message, copy and Telegram do not', (t) => {
  const s = answerStrings('ru');
  // The menu's caption says it for what is inside «⋯» on every pointer (chat UI §5.7);
  // the line, for the «Continue» that stands in the row of a cut answer.
  assert.ok(actions({ locale: 'ru', costNote: true, broken: true }).includes(`<p class="gpt-cost-note">${s.buttonCost}</p>`));
  assert.ok(!actions({ locale: 'ru', costNote: true }).includes(s.buttonCost));
  assert.ok(!actions({ locale: 'ru', broken: true }).includes(s.buttonCost));
  assert.equal(s.buttonCost, 'Кнопки, по которым AI пишет новый ответ, — 1 сообщение; «Копировать» и «В Telegram» — бесплатно.');
  assert.equal(answerStrings('uz').buttonCost, 'AI yangi javob yozadigan tugmalar — 1 ta xabar; «Nusxalash» va «Telegramga» — bepul.');
  for (const locale of LOCALES) {
    const a = answerStrings(locale);
    assert.doesNotMatch(a.buttonCost, /Har bir tugma|Каждая кнопка/);
    // It names the free ones by the names they have on the row.
    assert.ok(a.buttonCost.includes(`«${a.copy}»`) && a.buttonCost.includes(`«${a.share}»`), locale);
  }
  // On a phone the row's «⋯» menu says it in its caption (chat design §5.6), not a line under the row;
  // a cut answer's «Continue» stands in the row, outside the menu, so the line says it for that one.
  const g = globalThis as Record<string, unknown>;
  t.after(() => { delete g.window; });
  g.window = { matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }) };
  assert.ok(!actions({ locale: 'ru', costNote: true }).includes(s.buttonCost));
  assert.ok(actions({ locale: 'ru', costNote: true, broken: true }).includes(s.buttonCost));
  assert.ok(actions({ locale: 'uz', costNote: true, broken: true }).includes(answerStrings('uz').buttonCost));
  assert.ok(!actions({ locale: 'uz', costNote: true }).includes(answerStrings('uz').buttonCost));
  assert.match(read('src/gpt-chat/components/AiAnswer.tsx'), /<p className="gpt-menu-cost">\{s\.menuCost\}<\/p>/);
  assert.equal(answerStrings('ru').menuCost, 'Каждый пункт тратит 1 сообщение');
  delete g.window;
  const consoleSource = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(consoleSource, /const fewLeft = !paid && \(\(remaining >= 0 && remaining <= 3\) \|\| \(hourShown !== null && hourShown <= 2\)\);/);
  assert.match(consoleSource, /if \(fewLeft && onceThisSession\("gptchat_cost_note"\)\) setCostNote\(true\);/);
  assert.match(read('src/gpt-chat/storage.ts'), /export function onceThisSession\(key: string\): boolean \{\s*try \{\s*if \(sessionStorage\.getItem\(key\) !== null\) return false;\s*sessionStorage\.setItem\(key, "1"\);\s*\} catch \{/);
});

// ── copy and share (NOW-08: plan COPY-01, M-08, map 03 §3.2–3.3) ─────────────

test('copying gives plain text: no #, **, table rules or LaTeX; bullets, table rows and links read as text', () => {
  const text = plainText('### Sarlavha\n**Dushanba** — post\n| a | b |\n|---|---|\n| 1 | 2 |\n- bir\n* ikki\n> iqtibos\n[sayt](https://gptbot.uz) va `kod`\n---\n2 * 3 * 4, *muhim*, \\(x^2\\)\n```\n**kod** # qoladi\n```');
  assert.doesNotMatch(text.split('**kod**')[0], /#|\*\*|\|---\||```|\\\(/);
  for (const line of ['Sarlavha', 'Dushanba — post', 'a — b', '1 — 2', '• bir', '• ikki', 'iqtibos', 'sayt (https://gptbot.uz) va kod', '2 * 3 * 4, muhim, x²', '**kod** # qoladi']) {
    assert.ok(text.split('\n').includes(line), `${line} in:\n${text}`);
  }
  assert.doesNotMatch(plainText('a\n\n\n\nb'), /\n{3}/);
});

test('copying falls back to a hidden textarea when the WebView refuses the clipboard', async (t) => {
  const g = globalThis as Record<string, unknown>;
  const calls: string[] = [];
  const box = { value: '', readOnly: false, style: {} as Record<string, string>, select: () => calls.push('select'), remove: () => calls.push('remove') };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
  g.document = { createElement: () => box, body: { appendChild: () => calls.push('append') }, execCommand: (command: string) => { calls.push(command); return true; } };
  t.after(() => {
    delete g.document;
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
  });
  assert.equal(await copyText('Toza matn'), true);
  assert.deepEqual(calls, ['append', 'select', 'copy', 'remove']);
  assert.equal(box.value, 'Toza matn');
  assert.deepEqual(box.style, { position: 'fixed', opacity: '0' });
  // Both ways refused: only then «Nusxalab bo‘lmadi».
  (g.document as { execCommand: () => boolean }).execCommand = () => false;
  assert.equal(await copyText('x'), false);
});

test('«Telegramga yuborish»: t.me picker, plain text within 6000 encoded characters, the signature and the chat link', () => {
  const page = 'https://gptbot.uz/uz/gpt-uzbek-tilida/';
  const short = telegramShare('**Salom**, bu javob.', page);
  const url = new URL(short.href);
  assert.equal(`${url.origin}${url.pathname}`, 'https://t.me/share/url');
  assert.equal(url.searchParams.get('url'), `${page}?utm_source=telegram&utm_medium=share`);
  assert.equal(url.searchParams.get('text'), `Salom, bu javob.${SHARE_SIGNATURE}`);
  assert.equal(short.cut, false);
  // A long Cyrillic answer: whole paragraphs while they fit, then «…» and the signature.
  const long = Array.from({ length: 30 }, (_, i) => `Абзац ${i + 1}. ${'Длинный русский текст ответа. '.repeat(4)}`).join('\n\n');
  const shared = telegramShare(long, page);
  const text = new URL(shared.href).searchParams.get('text')!;
  assert.equal(shared.cut, true);
  assert.ok(encodeURIComponent(text).length <= 6000, String(encodeURIComponent(text).length));
  assert.ok(text.endsWith(`\n\n…${SHARE_SIGNATURE}`));
  assert.match(text, /^Абзац 1\./);
  assert.ok(long.includes(text.slice(0, text.indexOf('\n\n…'))), 'cut at a paragraph');
  // One paragraph too long alone is cut by characters, never in the middle of an emoji.
  const wall = telegramShare(`a${'😀'.repeat(3000)}`, page);
  assert.doesNotThrow(() => decodeURIComponent(new URL(wall.href).search));
  assert.equal(wall.cut, true);
  for (const locale of LOCALES) {
    const s = answerStrings(locale);
    for (const line of [s.share, s.shareLabel, s.shareCut, SHARE_SIGNATURE]) assert.doesNotMatch(line, /ChatGPT|OpenAI|rasmiy|официальн/i);
  }
  assert.deepEqual([answerStrings('uz').share, answerStrings('uz').shareLabel], ['Telegramga', 'Telegramga yuborish']);
  // answer_shared carries the method only.
  const shares = trackCalls().filter((call) => call.event === 'EV.answerShared');
  assert.deepEqual(shares.map((call) => call.keys), [['method']]);
  assert.equal(EV.answerShared, 'answer_shared');
  const source = read('src/gpt-chat/components/AiAnswer.tsx');
  assert.match(source, /window\.open\(href, "_blank", "noopener"\);/);
  assert.doesNotMatch(source, /navigator\.share/);
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
  // GA4's own rule (a letter first, then letters, digits and underscores),
  // in lower snake_case: b2b_line_shown is the server counter's name too (WP-20).
  for (const name of names) assert.match(name, /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, name);
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
  assert.match(consoleSource, /useEffect\(\(\) => \{\s*initMetaChatPixel\(\);\s*trackOnce\(EV\.chatOpened, \{ locale: config\.locale, \.\.\.entryMeta, in_app: inApp\(\) \}\);/);
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

test('in_app names the in-app browser with a fixed word, never the user agent', () => {
  const telegram = 'Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Telegram-Android/11.1.3 (Samsung SM-A125F; Android 12; SDK 31; LOW)';
  const instagram = 'Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.146 Mobile Safari/537.36 Instagram 349.0.0.39.106 Android';
  const chrome = 'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  assert.equal(inAppOf(telegram, {}), 'telegram');
  assert.equal(inAppOf(instagram, {}), 'instagram');
  assert.equal(inAppOf(chrome, {}), 'other');
  // Telegram's WebView without its name in the user agent still exposes its proxy.
  assert.equal(inAppOf(chrome, { TelegramWebviewProxy: {} }), 'telegram');
  assert.ok(GA4_PARAMS.has('in_app'));
  // chat_opened and message_sent carry it; nothing else does.
  const calls = trackCalls().filter((call) => call.keys.includes('in_app')).map((call) => call.event).sort();
  assert.deepEqual(calls, ['EV.chatOpened', 'EV.messageSent']);
});
