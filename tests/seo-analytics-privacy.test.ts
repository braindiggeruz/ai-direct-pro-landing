// The prerendered analytics block runs on every public page, so it is the one
// place where a visitor's typed input could leak into GA4 by accident. These
// tests pin what it may send and prove the SEO funnel events exist.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ANALYTICS_HEAD } from '../scripts/analytics-snippet';

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

test('contact_click recognises the contact handle the site actually publishes', () => {
  // The contact event keys off the studio's own Telegram handle. If site.json ever
  // moves to a different handle and this block is not updated, every enquiry
  // silently stops being counted — so the two are pinned together here.
  const site = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'content', 'global', 'site.json'), 'utf8'),
  ) as { telegram?: string };
  const handle = (site.telegram || '').replace(/^https:\/\/t\.me\//, '').replace(/\/$/, '');

  assert.ok(handle, 'site.json must publish a Telegram contact');
  assert.ok(
    ANALYTICS_HEAD.includes(handle),
    `analytics block does not treat t.me/${handle} as the contact channel`,
  );
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
  assert.ok(checked >= 5, `expected at least 5 guarded analytics blocks, checked ${checked}`);
});

test('the host guard is a loopback denylist, not a single-host allowlist', () => {
  // An allowlist would silently switch production analytics off the day the
  // domain changes. Metrika deliberately uses one; GA/Pixel/GTM must not.
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
  // The block is inlined by hand in four places: the SPA shell, both prerender
  // scripts, and scripts/analytics-snippet.ts above. On 2026-08-26 they had
  // drifted - index.html said 32 000 ms for gtag and 30 000 for GTM, and both
  // prerender scripts still said 30 000 for GTM on every SEO landing, which is
  // precisely where the organic traffic lands. Nothing pointed the copies at
  // each other, so this does.
  //
  // The Meta pixel is deliberately outside this: it is marketing, not
  // measurement, and loading it late costs nothing that this file is about.
  const sources = ['index.html', 'scripts/prerender.ts', 'scripts/prerender-blog.ts'];
  let blocksChecked = 0;

  for (const source of sources) {
    const text = fs.readFileSync(path.join(process.cwd(), source), 'utf8');
    for (const tag of ['gtm', 'ga']) {
      const opener = `<script data-tag="${tag}">`;
      for (let at = text.indexOf(opener); at !== -1; at = text.indexOf(opener, at + 1)) {
        const block = text.slice(at, text.indexOf('</script>', at));
        const delays = passiveDelays(block);
        if (delays.length === 0) continue;
        blocksChecked += 1;
        for (const ms of delays) {
          assert.ok(
            ms <= MAX_PASSIVE_DELAY_MS,
            `${source} defers the ${tag} tag ${ms} ms for a visitor who never interacts`,
          );
        }
      }
    }
  }

  // A typo in a filename or a renamed data-tag would otherwise make this test
  // pass by checking nothing at all.
  assert.ok(blocksChecked >= 4, `only ${blocksChecked} loader blocks were found to check`);
});
