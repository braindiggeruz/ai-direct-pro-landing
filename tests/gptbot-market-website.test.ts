import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  MARKET_FAQ_SCRIPT,
  renderMarketLanding,
  renderMarketTrust,
} from '../scripts/market-page.ts';
import type { Page } from '../src/shared/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string): string =>
  fs.readFileSync(path.join(ROOT, relative), 'utf8');
const page = (locale: 'ru' | 'uz', slug: string): Page =>
  JSON.parse(read(`content/pages/${locale}/${slug}.json`)) as Page;

test('RU and UZ market pages implement the buyer-first product surface', () => {
  for (const locale of ['ru', 'uz'] as const) {
    const html = renderMarketLanding(page(locale, 'sotuvchi'));
    assert.match(html, /<main id="main">/);
    assert.match(html, /<h1 id="market-hero-title">/);
    assert.match(html, /id="buyer"/);
    assert.match(html, /id="seller"/);
    assert.match(html, /id="request"/);
    assert.match(html, /id="faq"/);
    assert.match(html, /market-synthetic-fallback\.webp/);
    assert.match(html, /synthetic|синтет/i);
    assert.match(html, /Sotuvchi by GPTBot/);
    assert.doesNotMatch(html, /testimonial|отзыв клиента|mijoz sharhi/i);
  }
});

test('demo cards label source, stock, match reason and integer UZS prices', () => {
  const html = renderMarketLanding(page('ru', 'sotuvchi'));
  assert.match(html, /349 000 сум/);
  assert.match(html, /289 000 сум/);
  assert.match(html, /В наличии · демо-остаток/);
  assert.match(html, /Синтетический магазин A/);
  assert.match(html, /Подходит:/);
  assert.doesNotMatch(html, /₽|\$|USD|доллар/);
});

test('request timeline names correction, cancellation and the next actor', () => {
  const ru = renderMarketLanding(page('ru', 'sotuvchi'));
  const uz = renderMarketLanding(page('uz', 'sotuvchi'));
  assert.match(ru, /Это не платёж/);
  assert.match(ru, /вернуться назад или отменить/);
  assert.match(ru, /Магазин сам сообщает/);
  assert.match(uz, /Bu to‘lov emas/);
  assert.match(uz, /orqaga qaytish yoki bekor qilish/);
  assert.match(uz, /Do‘kon bajarish/);
});

test('market FAQ is a progressive, labelled button-region disclosure', () => {
  const html = renderMarketLanding(page('ru', 'sotuvchi'));
  assert.match(html, /<button[^>]+aria-expanded="false"[^>]+aria-controls=/);
  assert.match(html, /role="region" aria-labelledby=/);
  assert.doesNotMatch(html, /<div[^>]+hidden[^>]*class="market-faq-panel"/);
  assert.match(MARKET_FAQ_SCRIPT, /panel\.hidden=true/);
  assert.match(MARKET_FAQ_SCRIPT, /aria-expanded/);
});

test('trust pages disclose the no-legal-review and role boundaries', () => {
  const ru = renderMarketTrust(page('ru', 'market-doverie'));
  const uz = renderMarketTrust(page('uz', 'market-ishonch'));
  assert.match(ru, /юридическая экспертиза не проводилась/i);
  assert.match(ru, /Магазин/);
  assert.match(ru, /GPTBot/);
  assert.match(ru, /Покупатель/);
  assert.match(uz, /yuridik ekspertiza o‘tkazilmagan/i);
  assert.match(uz, /Do‘kon/);
  assert.match(uz, /Xaridor/);
});

test('Warm Market Signals tokens and accessibility constraints are real CSS', () => {
  const css = read('src/market/market.css');
  for (const token of [
    '--market-ivory',
    '--market-ink',
    '--market-teal',
    '--market-coral',
    '--market-focus',
  ]) assert.ok(css.includes(token), token);
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(css, /outline:\s*3px solid var\(--market-focus\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /min-width:\s*20rem/);
});

test('brand pack carries editable masters and required raster exports', () => {
  for (const asset of [
    'gptbot-market-mark-dark.svg',
    'gptbot-market-mark-light.svg',
    'gptbot-market-mark-mono.svg',
    'gptbot-market-wordmark-dark.svg',
    'gptbot-market-wordmark-light.svg',
    'gptbot-market-wordmark-mono.svg',
    'gptbot-market-avatar.svg',
    'gptbot-market-avatar.png',
    'favicon.svg',
    'favicon-512.png',
    'market-synthetic-fallback.webp',
    'og-market-ru.svg',
    'og-market-ru.png',
    'og-market-uz.svg',
    'og-market-uz.png',
  ]) {
    const target = path.join(ROOT, 'public', 'assets', 'market', asset);
    assert.ok(fs.existsSync(target), asset);
    assert.ok(fs.statSync(target).size > 100, asset);
  }
  const masters = [
    read('public/assets/market/gptbot-market-mark-dark.svg'),
    read('public/assets/market/gptbot-market-wordmark-dark.svg'),
  ].join('\n').toLowerCase();
  assert.doesNotMatch(masters, /robot|brain|cart|coin|openai|telegram/);
});
