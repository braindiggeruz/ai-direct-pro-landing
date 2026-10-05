import assert from 'node:assert/strict';
import test from 'node:test';
import { track, trackContact } from '../src/lib/cta';

type Browser = {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
};

function withBrowser(browser: Browser, run: () => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('gtag queues exactly one event before the Google library loads, with no plain dataLayer duplicate', () => {
  const queue: unknown[] = [];
  const meta: unknown[][] = [];
  const browser: Browser = {
    dataLayer: queue,
    // This is the same queue contract as the inline Google tag stub.
    // eslint-disable-next-line prefer-rest-params -- Reproduce the real stub's Arguments queue entry.
    gtag: function () { queue.push(arguments); },
    fbq: (...args) => { meta.push(args); },
  };
  const payload = { lead_source: 'calculator', service_slug: 'telegram-bot', page_path: '/ru/kalkulyator-stoimosti-telegram-bota/' };
  withBrowser(browser, () => track('generate_lead', payload));
  assert.equal(queue.length, 1);
  assert.deepEqual(Array.from(queue[0] as ArrayLike<unknown>), ['event', 'generate_lead', payload]);
  assert.deepEqual(meta, [['trackCustom', 'generate_lead', payload]]);
});

test('without gtag, fallback creates the original plain dataLayer event', () => {
  const browser: Browser = {};
  withBrowser(browser, () => track('calculator_completed', { goal: 'support', feature_count: 2 }));
  assert.deepEqual(browser.dataLayer, [{ event: 'calculator_completed', goal: 'support', feature_count: 2 }]);
});

test('fallback appends once without replacing existing queue entries and keeps Meta custom tracking', () => {
  const existing = { event: 'previous' };
  const queue: unknown[] = [existing];
  const meta: unknown[][] = [];
  const browser: Browser = { dataLayer: queue, fbq: (...args) => { meta.push(args); } };
  withBrowser(browser, () => track('calculator_copy', { goal: 'support' }));
  assert.strictEqual(browser.dataLayer, queue);
  assert.strictEqual(queue[0], existing);
  assert.deepEqual(queue.slice(1), [{ event: 'calculator_copy', goal: 'support' }]);
  assert.deepEqual(meta, [['trackCustom', 'calculator_copy', { goal: 'support' }]]);
});

test('contact and section events keep the existing Meta standard mapping', () => {
  const google: unknown[][] = [];
  const meta: unknown[][] = [];
  const browser: Browser = { gtag: (...args) => { google.push(args); }, fbq: (...args) => { meta.push(args); } };
  withBrowser(browser, () => {
    trackContact('phone', 'footer', 'ru');
    track('view_section', { section: 'solutions' });
  });
  const contact = { contact_method: 'phone', contact_kind: 'contact', cta_zone: 'footer', locale: 'ru', page_kind: 'homepage' };
  assert.deepEqual(google, [['event', 'click_contact', contact], ['event', 'view_section', { section: 'solutions' }]]);
  assert.deepEqual(meta, [
    ['track', 'Contact', { content_name: 'click_contact', ...contact }],
    ['track', 'ViewContent', { content_name: 'view_section', section: 'solutions' }],
  ]);
  assert.equal(browser.dataLayer, undefined, 'gtag route must not create a second queue');
});

test('ordinary CTA clicks do not become Google generate_lead or Meta Lead events', () => {
  const google: unknown[][] = [];
  const meta: unknown[][] = [];
  withBrowser({ gtag: (...args) => { google.push(args); }, fbq: (...args) => { meta.push(args); } }, () => {
    track('click_hero_cta');
    track('click_demo_cta', { source: 'solution' });
    trackContact('email', 'contact', 'uz');
  });
  assert.deepEqual(google.map((args) => args[1]), ['click_hero_cta', 'click_demo_cta', 'click_contact']);
  assert.deepEqual(meta.map((args) => args.slice(0, 2)), [
    ['trackCustom', 'click_hero_cta'], ['trackCustom', 'click_demo_cta'], ['track', 'Contact'],
  ]);
});

test('a failing Google tag cannot block Meta or cause a duplicate fallback send', () => {
  const queue: unknown[] = [];
  const meta: unknown[][] = [];
  withBrowser({ dataLayer: queue, gtag: () => { throw new Error('tag unavailable'); }, fbq: (...args) => { meta.push(args); } }, () => {
    assert.doesNotThrow(() => track('calculator_copy', { goal: 'support' }));
  });
  assert.deepEqual(queue, [], 'do not retry an ambiguously failing gtag through a second route');
  assert.deepEqual(meta, [['trackCustom', 'calculator_copy', { goal: 'support' }]]);
});

test('missing browser globals and unavailable Meta cannot break the caller', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'window');
  try {
    assert.doesNotThrow(() => track('click_hero_cta'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
  }
  const google: unknown[][] = [];
  withBrowser({ gtag: (...args) => { google.push(args); }, fbq: () => { throw new Error('pixel unavailable'); } }, () => {
    assert.doesNotThrow(() => track('calculator_completed', { goal: 'support' }));
  });
  assert.deepEqual(google, [['event', 'calculator_completed', { goal: 'support' }]]);
});
