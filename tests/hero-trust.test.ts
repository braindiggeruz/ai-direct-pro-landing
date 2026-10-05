import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHeroTrustChip } from '../scripts/hero-trust';
import { offerFromTrustChips } from '../scripts/service-offers';
import telegram from '../content/pages/ru/razrabotka-telegram-bota-tashkent.json';

test('ordinary chips retain their exact text-only markup and apostrophes', () => {
  assert.equal(renderHeroTrustChip("RU & O'zbek <text>"),
    '<li class="px-3 py-1 rounded-full border border-white/10 bg-white/5">RU &amp; O\'zbek &lt;text></li>');
});

test('a published case label becomes a keyboard-accessible same-site link', () => {
  const label = 'Кейс: Cake City';
  const html = renderHeroTrustChip(label, telegram.heroTrustLinks[label]);
  assert.match(html, /<a href="\/ru\/blog\/keys-cake-city-platforma-kondirterskoy\/"/);
  assert.match(html, /focus-visible:outline/);
  assert.ok(html.includes(`>${label}</a>`));
  assert.deepEqual(offerFromTrustChips(telegram.heroTrust), {
    minPrice: 990000, priceCurrency: 'UZS', perMonth: false, source: 'От 990 000 сум',
  });
});

test('invalid or external chip targets fall back to escaped text without links', () => {
  for (const target of ['javascript:alert(1)', '//example.com/ru/case/', 'https://example.com/',
    '/ru/case/?x=1', '/ru/case/#x', '/ru/../api/', '/ru/%22/', '/ru/case/\n', '/ru/"x/']) {
    const html = renderHeroTrustChip('<script>alert(1)</script>', target);
    assert.doesNotMatch(html, /<a|<script/);
    assert.match(html, /&lt;script>/);
  }
});
