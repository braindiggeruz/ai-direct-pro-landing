import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EV, track } from '../src/gpt-chat/analytics';
import { CHAT_ENTRY_TRACKING } from '../scripts/chat-entry-cta';
import { track as trackCta } from '../src/lib/cta';
import { cleanGa4Params, createFunnel, STUDIO_GA4_EVENTS, trackGa4 } from '../apps/studio/src/analytics';

type Browser = { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void; dataLayer?: unknown[] };
const withBrowser = (browser: Browser, run: () => void) => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  try { run(); } finally {
    if (prior) Object.defineProperty(globalThis, 'window', prior);
    else Reflect.deleteProperty(globalThis, 'window');
  }
};

test('legacy chat source stays useful UI metadata without becoming a GA4 traffic source', () => {
  for (const gtagPresent of [true, false]) {
    const calls: unknown[][] = [];
    const browser: Browser = gtagPresent ? { gtag: (...args) => { calls.push(args); } } : {};
    const data = { source: 'composer', message_number: 2, utm_source: 'spoof', campaign_source: 'spoof', text: 'private' };
    withBrowser(browser, () => track(EV.messageSent, data));
    const payload = (gtagPresent ? calls[0][2] : browser.dataLayer![0]) as Record<string, unknown>;
    assert.equal(payload.ui_source, 'composer');
    for (const key of ['source', 'utm_source', 'campaign_source', 'text']) assert.ok(!(key in payload), key);
    assert.equal(payload.message_number, 2);
    assert.equal(data.source, 'composer', 'caller/backend data must not be mutated');
    assert.equal(gtagPresent ? calls.length : browser.dataLayer!.length, 1);
  }
});

test('explicit ui_source takes precedence without leaking its legacy alias', () => {
  const calls: unknown[][] = [];
  withBrowser({ gtag: (...args) => { calls.push(args); } }, () => {
    track(EV.messageSent, { ui_source: 'template', source: 'composer' });
    track(EV.messageSent, { source: 'composer', ui_source: 'template' });
  });
  for (const call of calls) {
    const payload = call[2] as Record<string, unknown>;
    assert.equal(payload.ui_source, 'template');
    assert.ok(!('source' in payload));
  }
});

test('article entry emits the path in a dedicated field through either analytics route', () => {
  for (const gtagPresent of [true, false]) {
    const calls: unknown[][] = [];
    const browser: Browser = gtagPresent ? { gtag: (...args) => { calls.push(args); } } : {};
    let click: ((event: unknown) => void) | undefined;
    const context = {
      window: browser,
      location: { pathname: '/uz/blog/example/', search: '?utm_source=google&private=secret' },
      document: { documentElement: { lang: 'uz' }, addEventListener: (_: string, handler: (event: unknown) => void) => { click = handler; } },
    };
    vm.runInNewContext(CHAT_ENTRY_TRACKING.replace(/^<script[^>]*>|<\/script>$/g, ''), context);
    click!({ target: { closest: () => ({ dataset: { chatEntry: 'download' } }) } });
    const payload = (gtagPresent ? calls[0][2] : browser.dataLayer![0]) as Record<string, unknown>;
    assert.equal(payload.entry_path, '/uz/blog/example/');
    assert.equal(payload.intent, 'download');
    assert.equal(payload.surface, 'article');
    assert.equal(payload.locale, 'uz');
    assert.ok(!('source' in payload));
    assert.doesNotMatch(JSON.stringify(payload), /private|secret|utm_source/);
    assert.equal(gtagPresent ? calls.length : browser.dataLayer!.length, 1);
  }
});

test('homepage GA4 renames only the UI label and preserves marketing parameters and original Meta data', () => {
  for (const gtagPresent of [true, false]) {
    const calls: unknown[][] = [], meta: unknown[][] = [];
    const browser: Browser = { fbq: (...args) => { meta.push(args); } };
    if (gtagPresent) browser.gtag = (...args) => { calls.push(args); };
    const data = { source: 'solution', utm_source: 'newsletter', utm_medium: 'email', gclid: 'test-click-id' };
    withBrowser(browser, () => trackCta('click_demo_cta', data));
    const payload = (gtagPresent ? calls[0][2] : browser.dataLayer![0]) as Record<string, unknown>;
    assert.equal(payload.ui_source, 'solution');
    assert.ok(!('source' in payload));
    assert.equal(payload.utm_source, 'newsletter');
    assert.equal(payload.utm_medium, 'email');
    assert.equal(payload.gclid, 'test-click-id');
    assert.deepEqual(meta, [['trackCustom', 'click_demo_cta', data]]);
    assert.equal(data.source, 'solution');
    assert.ok(!('ui_source' in data));
  }
});

test('Studio keeps free/paid UI labels and scalar safety while leaving backend source unchanged', () => {
  assert.deepEqual(cleanGa4Params({ source: 'free', ui_source: 'paid', topic: 'private', slides: Number.NaN }), { ui_source: 'paid' });
  const calls: unknown[][] = [];
  withBrowser({ gtag: (...args) => { calls.push(args); } }, () => {
    trackGa4(STUDIO_GA4_EVENTS.resultReady, { source: 'paid', tool: 'presentation' });
  });
  const payload = calls[0][2] as Record<string, unknown>;
  assert.equal(payload.ui_source, 'paid');
  assert.ok(!('source' in payload));
  const fallback: Browser = {};
  withBrowser(fallback, () => trackGa4(STUDIO_GA4_EVENTS.resultReady, { source: 'free', tool: 'presentation' }));
  const queued = fallback.dataLayer![0] as Record<string, unknown>;
  assert.equal(queued.ui_source, 'free');
  assert.ok(!('source' in queued));
  assert.equal(fallback.dataLayer!.length, 1);
  // The cleaner must not mutate a record also destined for server telemetry.
  const original = { source: 'free', tool: 'presentation' };
  cleanGa4Params(original);
  assert.deepEqual(original, { source: 'free', tool: 'presentation' });
  const serverEvents: Array<{ type: string; detail: string }> = [];
  withBrowser({ gtag: (...args) => { calls.push(args); } }, () => {
    createFunnel(body => { serverEvents.push(body); }, 'offline-test-view').resultReady('presentation', 'free');
  });
  assert.equal(serverEvents.length, 1);
  assert.equal(serverEvents[0].type, 'studio_result_ready');
  assert.equal(serverEvents[0].detail, 'free', 'backend telemetry keeps the original domain value');
});
