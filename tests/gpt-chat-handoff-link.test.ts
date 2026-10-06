// Where the chat's "continue in Telegram" buttons lead.
//
// Run: node --import tsx --test tests/gpt-chat-handoff-link.test.ts
//
// The property worth pinning: no surface — sidebar, lead form, limit card,
// B2B card, any handoff failure, a tap before the mint answers — can produce
// a link to the owner's personal Telegram account (paid-chat plan, L14).
// Consumers go to the assistant bot @gptbotuz_bot. Only the explicit B2B card
// reaches the studio in Telegram, and only once a work account is configured
// (content/global/site.json studioTelegram); until then it offers its form,
// and the lead form's quick contact is the phone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AiLimitTelegram } from '../src/gpt-chat/components/AiLimitTelegram';
import { AiOfferCard } from '../src/gpt-chat/components/AiOfferCard';
import { strings } from '../src/gpt-chat/i18n';
import {
  isConfiguredBotUrl,
  publicBotLink,
  resolveHandoffLink,
  type MintedHandoff,
} from '../src/gpt-chat/handoff';
import { studioBusinessLink, studioQuickContact } from '../src/gpt-chat/contact';
import { telegramDeepLink } from '../src/lib/telegram';
import { STUDIO_PHONE, STUDIO_PHONE_DISPLAY, STUDIO_TELEGRAM_URL } from '../src/shared/studio-contact';

// tsx compiles .tsx with the classic transform in tests; the app build uses
// react-jsx. Same shim as tests/lead-radar-telegram-ui.test.ts.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const OWNER = 'XGame_changerx';
/** A stand-in work account: what the B2B routes do once one is configured. */
const WORK = 'https://t.me/studio_work';
const TOKEN = `w_${'a'.repeat(32)}`;
const PUBLIC = {
  ru: 'https://t.me/gptbotuz_bot?start=site_ru',
  uz: 'https://t.me/gptbotuz_bot?start=site_uz',
} as const;

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('a linked handoff opens the bot deep link that can claim the token', () => {
  const deepLink = `https://t.me/gptbotuz_bot?start=${TOKEN}`;
  assert.deepEqual(resolveHandoffLink('ru', { href: deepLink, linked: true, payload: TOKEN }), {
    href: deepLink,
    channel: 'bot',
    withSession: true,
  });
});

test('an unlinked mint keeps the contextless bot link the server returned', () => {
  // linked:false is what storage_unavailable, rate_limited (20/h per hashed
  // IP, shared behind carrier NAT), global_rate_limited and mint_failed
  // return. The link is a working continuation; it just carries no context.
  assert.deepEqual(resolveHandoffLink('ru', { href: PUBLIC.ru, linked: false, payload: null }), {
    href: PUBLIC.ru,
    channel: 'bot',
    withSession: false,
  });
  assert.deepEqual(resolveHandoffLink('uz', { href: PUBLIC.uz, linked: false, payload: null }), {
    href: PUBLIC.uz,
    channel: 'bot',
    withSession: false,
  });
});

test('linked without a payload is followed but never labelled as carrying the session', () => {
  assert.deepEqual(resolveHandoffLink('ru', { href: PUBLIC.ru, linked: true, payload: null }), {
    href: PUBLIC.ru,
    channel: 'bot',
    withSession: false,
  });
  // A payload the link does not actually carry is not context either.
  const link = resolveHandoffLink('ru', { href: PUBLIC.ru, linked: true, payload: TOKEN });
  assert.equal(link.channel, 'bot');
  assert.equal(link.withSession, false);
});

test('no answer at all, or a failed mint, is the public bot link — exactly', () => {
  assert.deepEqual(resolveHandoffLink('ru', null), { href: PUBLIC.ru, channel: 'bot', withSession: false });
  assert.deepEqual(resolveHandoffLink('uz', null), { href: PUBLIC.uz, channel: 'bot', withSession: false });
  // The initial state of useTelegramHandoff — what a tap before the mint gets.
  assert.deepEqual(publicBotLink('ru'), { href: PUBLIC.ru, channel: 'bot', withSession: false });
  assert.deepEqual(publicBotLink('uz'), { href: PUBLIC.uz, channel: 'bot', withSession: false });
});

test('a link for another bot, account or host is never followed', () => {
  const foreign: MintedHandoff[] = [
    { href: `https://t.me/other_bot?start=${TOKEN}`, linked: true, payload: TOKEN },
    { href: 'https://evil.example/', linked: true, payload: TOKEN },
    { href: `https://t.me/${OWNER}?text=hi`, linked: false, payload: null },
    { href: `http://t.me/gptbotuz_bot?start=${TOKEN}`, linked: true, payload: TOKEN },
    { href: `https://t.me/gptbotuz_bot?start=${TOKEN}&text=x`, linked: true, payload: TOKEN },
    { href: `https://t.me/gptbotuz_bot/?start=${TOKEN}`, linked: true, payload: TOKEN },
    { href: `https://t.me/gptbotuz_bot?start=${TOKEN}#frag`, linked: true, payload: TOKEN },
    { href: 'https://t.me/gptbotuz_bot?start=a%20b', linked: false, payload: null },
    { href: 'not a url', linked: false, payload: null },
  ];
  for (const minted of foreign) {
    for (const locale of ['ru', 'uz'] as const) {
      assert.deepEqual(
        resolveHandoffLink(locale, minted),
        { href: PUBLIC[locale], channel: 'bot', withSession: false },
        `must fall back to the public bot link: ${minted.href}`,
      );
    }
  }
});

test('the bot URL check accepts only our bot', () => {
  for (const ok of [
    'https://t.me/gptbotuz_bot',
    'https://t.me/gptbotuz_bot?start=site_ru',
    'https://telegram.me/gptbotuz_bot?start=site_uz',
    'https://t.me/GPTBotUz_Bot?start=site_ru',
    `https://t.me/gptbotuz_bot?start=${TOKEN}`,
  ]) {
    assert.equal(isConfiguredBotUrl(ok), true, ok);
  }
  for (const bad of [
    `https://t.me/${OWNER}`,
    'https://t.me/gptbotuz_bot_evil?start=site_ru',
    'https://t.me/s/gptbotuz_bot',
    'https://t.me/gptbotuz_bot?start=',
    `https://t.me/gptbotuz_bot?start=${'a'.repeat(65)}`,
    'https://t.me/gptbotuz_bot?start=site_ru&start=site_uz',
    'https://t.me/gptbotuz_bot?startgroup=x',
    'https://user@t.me/gptbotuz_bot',
    'https://t.me:8443/gptbotuz_bot',
    'https://t.me.evil.example/gptbotuz_bot',
    'tg://resolve?domain=gptbotuz_bot',
  ]) {
    assert.equal(isConfiguredBotUrl(bad), false, bad);
  }
});

test('no consumer case can reach the owner account', () => {
  const cases: Array<MintedHandoff | null> = [
    null,
    { href: PUBLIC.ru, linked: false, payload: null },
    { href: PUBLIC.uz, linked: true, payload: null },
    { href: `https://t.me/gptbotuz_bot?start=${TOKEN}`, linked: true, payload: TOKEN },
    { href: `https://t.me/${OWNER}?text=x`, linked: true, payload: TOKEN },
    { href: `https://t.me/other_bot?start=${TOKEN}`, linked: false, payload: null },
  ];
  for (const locale of ['ru', 'uz'] as const) {
    for (const minted of cases) {
      const link = resolveHandoffLink(locale, minted);
      assert.ok(!link.href.includes(OWNER), `${locale} ${minted?.href ?? 'null'} → ${link.href}`);
      assert.equal(link.channel, 'bot');
    }
    assert.ok(!publicBotLink(locale).href.includes(OWNER));
  }
  // The sidebar: always the assistant bot, whose handle always has a value.
  assert.equal(telegramDeepLink('uz'), PUBLIC.uz);
  assert.equal(telegramDeepLink('ru'), PUBLIC.ru);
});

test('no work Telegram is configured, and the personal account is not one (L14)', () => {
  assert.equal(STUDIO_TELEGRAM_URL, null);
  for (const locale of ['ru', 'uz'] as const) {
    assert.equal(studioBusinessLink(locale), null);
    assert.deepEqual(studioQuickContact(locale), { href: `tel:${STUDIO_PHONE}`, channel: 'phone', display: STUDIO_PHONE_DISPLAY });
  }
  assert.equal(STUDIO_PHONE, '+998505870720');
  assert.equal(STUDIO_PHONE_DISPLAY, '+998 50 587 07 20');
});

test('once a work account is configured, the B2B routes open it with a B2B opener', () => {
  const ru = studioBusinessLink('ru', WORK)!;
  const uz = studioBusinessLink('uz', WORK)!;
  assert.ok(ru.startsWith(`${WORK}?text=`));
  assert.ok(uz.startsWith(`${WORK}?text=`));
  assert.ok(ru.endsWith(encodeURIComponent('Здравствуйте! Хочу обсудить AI-бота для бизнеса.')));
  assert.ok(uz.endsWith(encodeURIComponent('Assalomu alaykum! Biznes uchun AI-bot bo‘yicha gaplashmoqchiman.')));
  const uzText = decodeURIComponent(new URL(uz).searchParams.get('text') ?? '');
  assert.ok(uzText.includes('bo‘yicha'), 'Uzbek letter apostrophe is U+2018');
  assert.ok(!uzText.includes("'"), 'no ASCII apostrophe in Uzbek copy');
  assert.deepEqual(studioQuickContact('ru', WORK), { href: ru, channel: 'studio', display: 'Telegram' });
});

/** Every href in a static render, entity-decoded. */
function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

test('before the mint answers, the limit card already links to the public bot', () => {
  // A static render runs no effects: this is exactly what a tap made before
  // POST /api/gpt/handoff answers (or after it fails) opens.
  for (const locale of ['ru', 'uz'] as const) {
    const t = strings(locale);
    for (const reason of ['hourly', 'daily', 'monthly'] as const) {
      const markup = renderToStaticMarkup(React.createElement(AiLimitTelegram, {
        t, locale, apiBase: '', sessionId: 'sess_1', reason, variant: 'primary',
      }));
      assert.deepEqual(hrefs(markup), [PUBLIC[locale]], `${locale}/${reason}`);
      assert.ok(markup.includes(`data-testid="telegram-cta-${reason}_limit"`));
      assert.ok(markup.includes(t.capTelegramCta), 'bot label on a bot link');
      assert.ok(markup.includes(t.capTelegramNote), "the bot's own allowance is mentioned");
      assert.ok(!markup.includes(t.telegramContextNote), 'no session claim before the server confirms one');
      assert.ok(!markup.includes(OWNER));
    }
  }
});

test('without a work account the offer card offers its lead form and no Telegram', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const t = strings(locale);
    const b2b = renderToStaticMarkup(React.createElement(AiOfferCard, { t, locale, apiBase: '', sessionId: 'sess_1', onDismiss: () => {} }));
    assert.deepEqual(hrefs(b2b).filter((h) => h.includes('t.me')), []);
    assert.ok(!b2b.includes(t.contactTelegram));
    assert.ok(!b2b.includes('data-testid="telegram-cta-b2b"'));
    assert.ok(b2b.includes('data-testid="offer-lead-b2b"'), 'the lead form is the route');
    assert.ok(!b2b.includes(OWNER));
  }
});

test('wiring: B2B uses the business link, the limit card uses the bot route', () => {
  const offer = source('src/gpt-chat/components/AiOfferCard.tsx');
  assert.match(offer, /studioBusinessLink\(locale\)/, 'the B2B card links to the studio with a B2B opener');
  assert.match(offer, /\{businessLink && <AiTelegramCta /, 'and only while a work account is configured');
  assert.doesNotMatch(offer, /useTelegramHandoff/, 'the B2B card mints nothing');
  // The cap stages that were coded but never rendered are gone (WP-09): the
  // limit card above the composer is the only surface a limit reaches.
  assert.doesNotMatch(offer, /hourly|daily|pricingHref|onRetry/);

  const consoleSource = source('src/gpt-chat/components/AiChatConsole.tsx');
  // The lazy part chat-limit (revision 2026-10-06-chat-design): fetched only
  // when the server enables the bot route on the limit card.
  assert.match(consoleSource, /<LazyPart part=\{limitPart\} fallback=\{null\} failed=\{null\}>\s*\{\(\{ AiLimitTelegram \}\) => \(\s*<AiLimitTelegram/);
  assert.match(source('src/gpt-chat/parts/chat-limit.ts'), /^export \{ AiLimitTelegram \} from '\.\.\/components\/AiLimitTelegram';$/m);
  assert.match(consoleSource, /track\(EV\.limitHit, \{ reason, locale: config\.locale \}\)/);
  assert.doesNotMatch(consoleSource, /t\.premium\.unavailable/, 'the limit card no longer says the free chat is available');

  // handoff.ts reaches nobody's account: it imports only a type from contact.ts.
  const handoff = source('src/gpt-chat/handoff.ts');
  assert.match(handoff, /^import type \{ TelegramTarget \} from '\.\/contact';$/m);
  assert.doesNotMatch(handoff, /studio(Telegram|Business)Link\(|STUDIO_TELEGRAM_URL|XGame_changerx/);

  const leadForm = source('src/gpt-chat/components/AiLeadForm.tsx');
  assert.match(leadForm, /studioQuickContact\(locale\)/, 'after a lead: the studio, not the bot');
  assert.doesNotMatch(leadForm, /telegramDeepLink|t\.telegramCta/);

  const limit = source('src/gpt-chat/components/AiLimitTelegram.tsx');
  assert.match(limit, /useTelegramHandoff\(apiBase, sessionId, locale, source\)/);
  assert.doesNotMatch(limit, /studio(Telegram|Business)Link|XGame_changerx/);
});
