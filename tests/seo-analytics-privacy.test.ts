// The prerendered analytics block runs on every public page, so it is the one
// place where a visitor's typed input could leak into GA4 by accident. These
// tests pin what it may send and prove the SEO funnel events exist.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { ANALYTICS_HEAD } from '../scripts/analytics-snippet';
import { STUDIO_CONTACT_ATTR } from '../src/shared/studio-contact';

const SEO_EVENTS = [
  'seo_landing_view',
  'seo_article_view',
  'seo_money_page_click',
  'service_cta_click',
  'telegram_open_attempt',
  'language_switch',
  'contact_click',
];

test('the SEO funnel events are emitted from prerendered pages', () => {
  for (const event of SEO_EVENTS) {
    assert.ok(ANALYTICS_HEAD.includes(`'${event}'`), `${event} is not emitted`);
  }
});

test('no personal data is read into an analytics payload', () => {
  // Reading a form control's value is the realistic way PII would reach GA4.
  for (const forbidden of ['.value', 'input', 'FormData', 'localStorage', 'sessionStorage', 'document.cookie']) {
    assert.ok(
      !ANALYTICS_HEAD.includes(forbidden),
      `analytics block reads "${forbidden}" — it must only send page path, title and CTA label`,
    );
  }
});

test('CTA labels are truncated before they are sent', () => {
  assert.match(ANALYTICS_HEAD, /substring\(0,80\)/, 'CTA text must be capped');
});

test('analytics never runs on the admin surface', () => {
  assert.match(ANALYTICS_HEAD, /\/admin-tools\//);
  assert.match(ANALYTICS_HEAD, /\/api\//);
});

test('contact_click follows the studio-contact marker, not a handle', () => {
  // Every template marks the studio's work Telegram data-contact="studio"
  // (src/shared/studio-contact.ts), and the event keys off that marker. Until
  // 2026-10 it matched the owner's personal handle, so a new account in
  // site.json would have silently stopped the count; now naming a work
  // Telegram needs no edit here, and no handle is written into the block.
  assert.equal(STUDIO_CONTACT_ATTR, 'data-contact="studio"');
  assert.ok(
    ANALYTICS_HEAD.includes("var isContactTg = isTg && el.getAttribute('data-contact') === 'studio';"),
    'contact_click must key off the studio-contact marker',
  );
  assert.ok(indexHtmlAnalyticsBlock().includes("var isContactTg = isTg && el.getAttribute('data-contact') === 'studio';"), 'index.html drifted');
  for (const block of [ANALYTICS_HEAD, indexHtmlAnalyticsBlock()]) assert.doesNotMatch(block, /XGame_changerx|t\\?\.me\\?\/\(/i);
  const site = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'content', 'global', 'site.json'), 'utf8'),
  ) as Record<string, unknown>;
  assert.ok(!('telegram' in site), 'the legacy telegram field is gone; the setting is studioTelegram');
});

test('no lead stage is claimed that the browser cannot observe', () => {
  // A Telegram click proves that a contact link was activated, nothing more. Emitting a
  // qualification or a closed deal from the browser would be fabricated data.
  for (const invented of ['qualify_lead', 'close_convert_lead', 'purchase']) {
    assert.ok(
      !ANALYTICS_HEAD.includes(`'${invented}'`),
      `${invented} needs a CRM signal the site does not have`,
    );
  }
});

// ── index.html must not drift away from the shared block ─────────────────────
//
// scripts/analytics-snippet.ts is injected into every prerendered page. It is
// NOT injected into index.html, which is the shell React mounts into for `/`
// and for the admin SPA — that file carries its own inline copy. Until
// 2026-08-22 the copy was an older, smaller one: it emitted telegram_demo_click
// and nothing else, so the homepage published five links to the studio's
// Telegram contact and reported no enquiry from any of them. The tests above
// never caught it because they only ever read ANALYTICS_HEAD.

function indexHtmlAnalyticsBlock(): string {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const block = /<script data-tag="ga">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(block, 'index.html must carry an inline analytics block');
  return block[1];
}

test('index.html emits the same funnel events as the prerendered block', () => {
  const inline = indexHtmlAnalyticsBlock();
  for (const event of SEO_EVENTS) {
    // seo_landing_view / seo_article_view are guarded by locale and stay inert
    // on `/`, but the code must still be present so an SPA route into /ru/ or
    // /uz/ behaves like the prerendered page of the same URL.
    assert.ok(
      inline.includes(`'${event}'`),
      `index.html does not emit ${event} — it has drifted from analytics-snippet.ts`,
    );
  }
});

test('index.html reads no personal data and skips the admin surface', () => {
  const inline = indexHtmlAnalyticsBlock();
  for (const forbidden of ['.value', 'input', 'FormData', 'localStorage', 'sessionStorage', 'document.cookie']) {
    assert.ok(!inline.includes(forbidden), `index.html analytics block reads "${forbidden}"`);
  }
  assert.match(inline, /\/admin-tools\//);
  assert.match(inline, /\/api\//);
  assert.match(inline, /substring\(0,80\)/, 'CTA text must be capped in index.html too');
});

test('index.html claims no lead stage the browser cannot observe', () => {
  const inline = indexHtmlAnalyticsBlock();
  for (const invented of ['qualify_lead', 'close_convert_lead', 'purchase']) {
    assert.ok(!inline.includes(`'${invented}'`), `index.html emits ${invented}`);
  }
});

test('index.html keys contact_click off the published contact handle', () => {
  const site = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'content', 'global', 'site.json'), 'utf8'),
  ) as { telegram?: string };
  const handle = (site.telegram || '').replace(/^https:\/\/t\.me\//, '').replace(/\/$/, '');
  assert.ok(indexHtmlAnalyticsBlock().includes(handle));
});

test('the measurement id is a public GA4 id, not a secret', () => {
  const ids = ANALYTICS_HEAD.match(/G-[A-Z0-9]{8,}/g) || [];
  assert.ok(ids.length > 0, 'a GA4 measurement id must be present');
  // A measurement id is public by design; anything token-shaped is not.
  assert.doesNotMatch(ANALYTICS_HEAD, /(api[_-]?key|secret|token|bearer)\s*[:=]\s*['"][^'"]{12,}/i);
});

// ── Local development must never reach the production property ───────────────
// GA4 property 540129731 was recording hits with hostName 127.0.0.1, which
// contaminates exactly the low-count contact_click signal the funnel is measured
// on. Every inline analytics block must refuse loopback hosts BEFORE it
// transmits. Asserted per block, not per file: a whole-file substring search
// passes as soon as any one block carries the guard, which silently leaves the
// other blocks uncovered.
const LOOPBACK = ['localhost', '127.0.0.1', '::1'];

/** Every `<script data-tag="…">` block in a file, keyed by tag. */
function inlineAnalyticsBlocks(src: string): { tag: string; body: string }[] {
  const out: { tag: string; body: string }[] = [];
  const re = /<script data-tag="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ tag: m[1], body: m[2] });
  return out;
}

test('every inline analytics block refuses loopback hosts', () => {
  const sources: [string, string][] = [
    ['scripts/analytics-snippet.ts', ANALYTICS_HEAD],
    ['scripts/prerender.ts', fs.readFileSync(path.join(process.cwd(), 'scripts/prerender.ts'), 'utf8')],
    ['scripts/prerender-blog.ts', fs.readFileSync(path.join(process.cwd(), 'scripts/prerender-blog.ts'), 'utf8')],
    ['index.html', fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')],
  ];
  let checked = 0;
  for (const [label, src] of sources) {
    for (const { tag, body } of inlineAnalyticsBlocks(src)) {
      // Yandex Metrika ships its own production-hostname allowlist.
      if (tag === 'ym') continue;
      checked += 1;
      assert.match(body, /location\.hostname/, `${label} block data-tag="${tag}" never reads location.hostname`);
      for (const host of LOOPBACK) {
        assert.ok(
          body.includes(`'${host}'`),
          `${label} block data-tag="${tag}" does not guard ${host} — local traffic will be recorded`,
        );
      }
      // The guard must precede anything that transmits or queues.
      const guardAt = body.indexOf('location.hostname');
      for (const sink of ['googletagmanager.com', 'connect.facebook.net', 'dataLayer']) {
        const sinkAt = body.indexOf(sink);
        if (sinkAt === -1) continue;
        assert.ok(
          guardAt < sinkAt,
          `${label} block data-tag="${tag}" touches ${sink} before the host guard runs`,
        );
      }
    }
  }
  // Direct GA4 has two copies; the homepage also carries the Meta Pixel.
  // Prerender templates interpolate the shared GA4 block rather than inlining it.
  assert.equal(checked, 3, `expected two GA4 blocks and the homepage Pixel, checked ${checked}`);
});

test('the host guard is a loopback denylist, not a single-host allowlist', () => {
  // An allowlist would silently switch production analytics off the day the
  // domain changes. Metrika deliberately uses one; GA/Pixel must not.
  const sources = [
    ANALYTICS_HEAD,
    fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8'),
    fs.readFileSync(path.join(process.cwd(), 'scripts/prerender.ts'), 'utf8'),
  ];
  for (const src of sources) {
    for (const { tag, body } of inlineAnalyticsBlocks(src)) {
      if (tag === 'ym') continue;
      assert.ok(
        !/hostname\s*!==\s*'gptbot\.uz'/.test(body),
        `block data-tag="${tag}" allowlists a single hostname — use the loopback denylist`,
      );
    }
  }
});

// ── the six commercial dimensions ────────────────────────────────────────────
//
// The GA4 property reports customDimensionCount = 0: these parameters are
// already being sent and are unreadable until someone registers them in the
// GA4 admin. That registration is not retroactive, so the parameters must at
// least be sent consistently — the day they are registered is the day the
// history starts, and a parameter missing from one event leaves a permanent
// hole in the comparison.
//
// telegram_open_attempt fires for the studio's contact handles AND for every
// product bot. contact_click fires only for the contact handles. Reading the
// first as a lead would count AI-chat traffic as enquiries, which is exactly
// what contact_kind exists to prevent — so both events must carry it.
const COMMERCIAL_DIMENSIONS = [
  'service_slug',
  'contact_kind',
  'locale',
  'page_kind',
  'target_url',
  'cta_zone',
];

function eventPayload(source: string, event: string): string {
  const at = source.indexOf(`'${event}'`);
  assert.notEqual(at, -1, `${event} is not emitted`);
  const open = source.indexOf('{', at);
  const close = source.indexOf('}', open);
  assert.ok(open !== -1 && close !== -1, `${event} has no payload object`);
  return source.slice(open, close);
}

for (const event of ['contact_click', 'telegram_open_attempt']) {
  test(`${event} carries all six commercial dimensions in the prerendered block`, () => {
    const payload = eventPayload(ANALYTICS_HEAD, event);
    for (const dimension of COMMERCIAL_DIMENSIONS) {
      assert.ok(payload.includes(`${dimension}:`), `${event} does not send ${dimension}`);
    }
  });

  test(`${event} carries all six commercial dimensions in index.html`, () => {
    const payload = eventPayload(indexHtmlAnalyticsBlock(), event);
    for (const dimension of COMMERCIAL_DIMENSIONS) {
      assert.ok(payload.includes(`${dimension}:`), `index.html ${event} does not send ${dimension}`);
    }
  });
}

test('contact_click never claims a product-bot click as a service enquiry', () => {
  for (const source of [ANALYTICS_HEAD, indexHtmlAnalyticsBlock()]) {
    const payload = eventPayload(source, 'contact_click');
    // The event only fires inside `if (isContactTg)`, so its contact_kind is a
    // constant. A ternary here would mean the guard had been widened.
    assert.match(
      payload,
      /contact_kind:\s*'contact'/,
      'contact_click sends a conditional contact_kind — the event fires for product bots',
    );
  }
});

test('a Telegram click never fabricates GA4 generate_lead', () => {
  for (const source of [ANALYTICS_HEAD, indexHtmlAnalyticsBlock()]) {
    assert.ok(
      !source.includes("gtag('event','generate_lead'"),
      'generate_lead must wait for an acknowledged form, bridge or CRM event',
    );
    const payload = eventPayload(source, 'contact_click');
    assert.match(payload, /contact_kind:\s*'contact'/);
    assert.match(payload, /contact_method:\s*'telegram'/);
  }
});

test('contact clicks have one owner: templates do not emit a second inline event', () => {
  const sources = [
    'scripts/prerender.ts',
    'scripts/prerender-blog.ts',
    'src/components/StickyCTA.tsx',
    'src/components/Footer.tsx',
  ];
  for (const source of sources) {
    const text = fs.readFileSync(path.join(process.cwd(), source), 'utf8');
    assert.ok(
      !text.includes("track('contact_click'") && !text.includes("gtag('event','contact_click'"),
      `${source} emits contact_click outside the shared delegated listener`,
    );
  }
});

test('no analytics payload carries a phone number or an email address', () => {
  for (const source of [ANALYTICS_HEAD, indexHtmlAnalyticsBlock()]) {
    assert.doesNotMatch(source, /\+998\s?\d/, 'a phone number is hard-coded into an analytics payload');
    assert.doesNotMatch(source, /[\w.+-]+@[\w-]+\.[\w.]+/, 'an email address reaches an analytics payload');
    for (const forbidden of ['tel:', 'mailto:']) {
      assert.ok(!source.includes(forbidden), `analytics reads ${forbidden} hrefs into a payload`);
    }
  }
});

// When the Google tags actually load.
//
// Every test above stayed green on 2026-08-26 while the passive-visitor
// fallback armed 32 s after the LOAD EVENT, which measured on production put
// the first GA4 hit at 36 114 ms on / and 62 019 ms on a cold landing, against
// 1 533-5 288 ms for Yandex Metrika on the same pages. They stayed green
// because they only ever asked what the block sends, never when it loads, and
// a tag that has not loaded sends nothing at all. These two ask when.
const MAX_PASSIVE_DELAY_MS = 10_000;

const passiveDelays = (source: string): number[] =>
  [...source.matchAll(/setTimeout\(\s*idleLoad\s*,\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));

test('a visitor who never interacts is still measured within ten seconds', () => {
  const delays = passiveDelays(ANALYTICS_HEAD);
  assert.ok(delays.length > 0, 'the analytics block has no passive fallback at all');
  for (const ms of delays) {
    assert.ok(
      ms <= MAX_PASSIVE_DELAY_MS,
      `gtag.js is deferred ${ms} ms for a visitor who never scrolls or taps; past ` +
        `${MAX_PASSIVE_DELAY_MS} ms the visit ends before the tag exists and GA4 ` +
        `records nothing, while Search Console and Metrika still record it`,
    );
  }
});

test('every copy of the Google tag loaders is bounded the same way', () => {
  // The empty GTM container is gone. Both direct GA4 copies retain the same
  // passive bounds; both prerender scripts import the shared copy.
  for (const [source, block] of [
    ['index.html', indexHtmlAnalyticsBlock()],
    ['scripts/analytics-snippet.ts', ANALYTICS_HEAD],
  ]) {
    assert.deepEqual(passiveDelays(block), [600, 1000, 1000, 3000], `${source} changed the interaction or passive GA4 bounds`);
  }
});

test('all public templates retain direct GA4 without the empty GTM container', () => {
  for (const [source, documents] of [
    ['index.html', 1], ['scripts/prerender.ts', 1], ['scripts/prerender-blog.ts', 2],
  ] as const) {
    const text = fs.readFileSync(path.join(process.cwd(), source), 'utf8');
    assert.doesNotMatch(text, /data-tag="gtm"|GTM-NLR4WFX8|googletagmanager\.com\/(?:gtm\.js|ns\.html)/, source);
    const gaCopies = source === 'index.html'
      ? (text.match(/<script data-tag="ga">/g) ?? []).length
      : (text.match(/\$\{ANALYTICS_HEAD\}/g) ?? []).length;
    assert.equal(gaCopies, documents, `${source} must provide GA4 once per document`);
    if (source !== 'index.html') assert.match(text, /import \{ ANALYTICS_HEAD \} from '\.\/analytics-snippet'/);
  }
});

type Callback = () => void;

function gaHarness(script: string, options: { readyState?: string; idle?: boolean; hostname?: string; pathname?: string } = {}) {
  let now = 0;
  const timers: { at: number; callback: Callback }[] = [];
  const idle: { callback: Callback; timeout: number }[] = [];
  const scripts: { src?: string; async?: boolean }[] = [];
  const listeners = new Map<string, Set<Callback>>();
  const existing = { event: 'existing_event' };
  const queue: unknown[] = [existing];
  const location = { hostname: options.hostname ?? 'gptbot.uz', pathname: options.pathname ?? '/ru/telegram-bot/' };
  const schedule = (callback: Callback, delay: number) => timers.push({ at: now + delay, callback });
  const listen = (type: string, callback: Callback) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(callback);
  };
  const history = {
    pushState(_state: unknown, _unused: string, url: string) { location.pathname = url; return 'push-result'; },
    replaceState(_state: unknown, _unused: string, url: string) { location.pathname = url; return 'replace-result'; },
  };
  const context: Record<string, unknown> = {
    location, history, dataLayer: queue, setTimeout: schedule,
    addEventListener: listen,
    removeEventListener: (type: string, callback: Callback) => listeners.get(type)?.delete(callback),
    document: {
      readyState: options.readyState ?? 'complete', title: 'Test page',
      head: { appendChild: (script: { src?: string; async?: boolean }) => scripts.push(script) },
      createElement: () => ({}), querySelectorAll: () => [], addEventListener: listen,
    },
  };
  context.window = context;
  if (options.idle !== false) {
    context.requestIdleCallback = (callback: Callback, settings: { timeout: number }) => idle.push({ callback, timeout: settings.timeout });
  }
  vm.runInNewContext(script, context);
  return {
    context, queue, existing, location, history, scripts, idle,
    events: () => queue.slice(1).map(entry => Array.from(entry as ArrayLike<unknown>)).filter(entry => entry[0] === 'event'),
    fire: (type: string) => [...(listeners.get(type) ?? [])].forEach(callback => callback()),
    flushIdle: () => idle.splice(0).forEach(({ callback }) => callback()),
    advance: (ms: number) => {
      const end = now + ms;
      while (true) {
        timers.sort((a, b) => a.at - b.at);
        if (!timers[0] || timers[0].at > end) break;
        const timer = timers.shift()!;
        now = timer.at;
        timer.callback();
      }
      now = end;
    },
  };
}

const sharedGaScript = inlineAnalyticsBlocks(ANALYTICS_HEAD).find(({ tag }) => tag === 'ga')!.body;
for (const [label, script] of [['homepage', indexHtmlAnalyticsBlock()], ['prerender', sharedGaScript]]) {
  test(`${label}: GA4 queues its config and initial landing event before the library loads`, () => {
    const h = gaHarness(script);
    assert.equal(h.context.dataLayer, h.queue, 'preserve the existing shared queue');
    assert.equal(h.queue[0], h.existing);
    const calls = h.queue.slice(1).map(entry => Array.from(entry as ArrayLike<unknown>));
    assert.deepEqual(calls.map(call => call[0]), ['js', 'config', 'event']);
    assert.deepEqual(calls[1], ['config', 'G-V87YFL96C7']);
    assert.equal(calls[2][1], 'seo_landing_view');
    assert.equal(h.scripts.length, 0);
  });

  test(`${label}: load and passive fallbacks retain 1000/3000 ms scheduling and load GA4 only once`, () => {
    const h = gaHarness(script, { readyState: 'loading' });
    h.advance(100);
    h.fire('load');
    h.advance(999);
    assert.equal(h.idle.length, 0);
    h.advance(1);
    assert.deepEqual(h.idle.map(item => item.timeout), [3000]);
    h.flushIdle();
    assert.equal(h.scripts.length, 1);
    assert.equal(h.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-V87YFL96C7');
    assert.equal(h.scripts[0].async, true);
    h.advance(1900);
    h.flushIdle();
    h.fire('pointerdown');
    h.advance(600);
    h.flushIdle();
    assert.equal(h.scripts.length, 1, 'later interaction and fallback must not insert another library');

    const slowPage = gaHarness(script, { readyState: 'loading', idle: false });
    slowPage.advance(2999);
    assert.equal(slowPage.scripts.length, 0);
    slowPage.advance(200);
    assert.equal(slowPage.scripts.length, 0, 'fallback retains its 200 ms scheduling delay');
    slowPage.advance(1);
    assert.equal(slowPage.scripts.length, 1, 'GA4 loads even when the load event never arrives');
  });

  test(`${label}: an interaction retains its 600 ms delay before the GA4 idle request`, () => {
    const h = gaHarness(script, { readyState: 'loading' });
    h.fire('scroll');
    h.advance(599);
    assert.equal(h.idle.length, 0);
    h.advance(1);
    assert.equal(h.idle.length, 1);
    h.flushIdle();
    assert.equal(h.scripts.length, 1);
  });

  test(`${label}: SPA navigation queues one page_view per changed path`, () => {
    const h = gaHarness(script);
    assert.equal(h.history.pushState({}, '', '/uz/telegram-bot/'), 'push-result');
    assert.equal(h.events().filter(event => event[1] === 'page_view').length, 0);
    h.advance(0);
    h.history.replaceState({}, '', '/uz/telegram-bot/');
    h.advance(0);
    assert.equal(h.history.replaceState({}, '', '/uz/ai-bot/'), 'replace-result');
    h.advance(0);
    h.location.pathname = '/ru/telegram-bot/';
    h.fire('popstate');
    h.fire('popstate');
    const views = h.events().filter(event => event[1] === 'page_view');
    assert.deepEqual(views.map(event => (event[2] as { page_path: string }).page_path), [
      '/uz/telegram-bot/', '/uz/ai-bot/', '/ru/telegram-bot/',
    ]);
    assert.equal(h.scripts.length, 0, 'SPA events queue before the library arrives');
  });

  test(`${label}: local and admin traffic neither queues nor loads GA4`, () => {
    for (const options of [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }, { pathname: '/admin-tools/' }, { pathname: '/api/test' }]) {
      const h = gaHarness(script, options);
      h.fire('load');
      h.fire('scroll');
      h.advance(10_000);
      h.flushIdle();
      assert.deepEqual(h.queue, [h.existing]);
      assert.equal(h.scripts.length, 0);
    }
  });
}
