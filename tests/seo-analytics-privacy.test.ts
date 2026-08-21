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

test('the measurement id is a public GA4 id, not a secret', () => {
  const ids = ANALYTICS_HEAD.match(/G-[A-Z0-9]{8,}/g) || [];
  assert.ok(ids.length > 0, 'a GA4 measurement id must be present');
  // A measurement id is public by design; anything token-shaped is not.
  assert.doesNotMatch(ANALYTICS_HEAD, /(api[_-]?key|secret|token|bearer)\s*[:=]\s*['"][^'"]{12,}/i);
});
