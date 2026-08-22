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
  'generate_lead',
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

test('generate_lead recognises the contact handle the site actually publishes', () => {
  // The lead event keys off the studio's own Telegram handle. If site.json ever
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
  // A Telegram click proves an enquiry was started, nothing more. Emitting a
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

test('index.html keys generate_lead off the published contact handle', () => {
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
