/**
 * Ф4 — the Signal Radar → Lead Radar handoff.
 *
 * The one property that matters: handing a request across must create nothing.
 * No company, no lead mutation, no message. The entire transfer is a URL the
 * operator can read, edit or ignore, and Lead Radar starts from a *draft* the
 * operator still has to approve.
 *
 * The second property is epistemic honesty: a stranger asking for a bot does
 * not tell us their industry, so the handoff fills in the offer and refuses to
 * guess the niche. A test below locks that specifically, because "let's just
 * put something in the niche field" is the tempting wrong answer.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  leadRadarPrefillFromHandoff,
  parseSignalHandoff,
  signalHandoffFromLead,
  signalHandoffOffer,
  signalHandoffQuery,
  SIGNAL_HANDOFF_QUOTE_MAX,
  SIGNAL_HANDOFF_SOURCE,
} from '../src/shared/signal-handoff';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import type { SignalLead } from '../src/shared/signal-radar';

const ROOT = path.resolve(import.meta.dirname, '..');

const BASE: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Самарканд',
  country: 'RU',
  offer: 'AI-бот для обработки заявок',
  desiredCount: 20,
  searchGoal: 'companies',
  telegramRequired: false,
  languages: ['en'],
};

function lead(overrides: Partial<SignalLead> = {}): SignalLead {
  return {
    id: 'lrsl_0123456789abcdef0123456789abcdef',
    orgId: 'owner_8ee98dc3040f160b308166b0',
    postId: 'lrsp_0123456789abcdef0123456789abcdef',
    targetId: 'lrst_0123456789abcdef0123456789abcdef',
    targetTitle: 'Ищу работу Ташкент',
    targetSlug: 'itjobs',
    service: 'bots',
    score: 78,
    state: 'new',
    authorLabel: 'Alex',
    authorHandle: null,
    quote: 'Ищу исполнителя: нужен чат-бот для записи клиентов в Telegram. Бюджет обсудим.',
    draftText: null,
    sentAt: null,
    failureCode: null,
    createdAt: '2026-09-02T06:00:00.000Z',
    updatedAt: '2026-09-02T06:00:00.000Z',
    ...overrides,
  };
}

/* ══════════════════════════════════════════════════════════════════ *
 * What the handoff carries
 * ══════════════════════════════════════════════════════════════════ */

test('every service maps to an offer we could actually sell', () => {
  for (const service of ['ads', 'seo', 'bots', 'sites', 'apps', 'design', 'crm']) {
    const offer = signalHandoffOffer(service);
    assert.ok(offer.length > 10, service);
    assert.ok(!offer.includes('undefined'), service);
  }
});

test('an unknown service degrades to its label, never to an empty offer', () => {
  assert.equal(signalHandoffOffer(null), 'Цифровые услуги под задачу бизнеса');
  assert.equal(signalHandoffOffer('sites'), 'Сайт под ключ: визитка, лендинг или интернет-магазин');
});

test('the handoff carries the request and the market, bounded', () => {
  const handoff = signalHandoffFromLead(lead({ quote: 'щ '.repeat(500) }));
  assert.equal(handoff.from, SIGNAL_HANDOFF_SOURCE);
  assert.equal(handoff.lead, lead().id);
  assert.equal(handoff.city, 'Ташкент');
  assert.equal(handoff.country, 'UZ');
  assert.equal(handoff.quote.length <= SIGNAL_HANDOFF_QUOTE_MAX, true, `${handoff.quote.length}`);
});

test('a handoff URL stays small enough for any request line', () => {
  const query = signalHandoffQuery(signalHandoffFromLead(lead()));
  // Query strings over ~2 KB break on some proxies; this must never approach it.
  assert.ok(query.length < 900, `${query.length}`);
  assert.equal(query.includes('from=signal'), true);
});

test('the query round-trips through the parser', () => {
  const original = signalHandoffFromLead(lead());
  const parsed = parseSignalHandoff(new URLSearchParams(signalHandoffQuery(original)));
  assert.deepEqual(parsed, original);
});

test('a partial handoff is rejected rather than half-applied', () => {
  const full = new URLSearchParams(signalHandoffQuery(signalHandoffFromLead(lead())));
  assert.equal(parseSignalHandoff(new URLSearchParams()), null);
  assert.equal(parseSignalHandoff(new URLSearchParams('from=lead-radar')), null);
  for (const key of ['lead', 'offer', 'city', 'country']) {
    const params = new URLSearchParams(full);
    params.delete(key);
    assert.equal(parseSignalHandoff(params), null, key);
  }
  // `from` alone is not a handoff — every other field is required.
  assert.equal(parseSignalHandoff(new URLSearchParams('from=signal')), null);
});

/* ══════════════════════════════════════════════════════════════════ *
 * What it must NOT touch
 * ══════════════════════════════════════════════════════════════════ */

test('the niche is left alone: a request for a bot names no industry', () => {
  const handoff = signalHandoffFromLead(lead());
  const next = leadRadarPrefillFromHandoff(handoff, BASE);
  assert.equal(next.niche, BASE.niche, 'guessing a niche would search the wrong businesses');
});

test('the offer, market and language set are carried across', () => {
  const next = leadRadarPrefillFromHandoff(signalHandoffFromLead(lead()), BASE);
  assert.equal(next.offer, signalHandoffOffer('bots'));
  assert.equal(next.city, 'Ташкент');
  assert.equal(next.country, 'UZ');
  assert.deepEqual(next.languages, ['ru', 'uz']);
  assert.equal(next.telegramRequired, true);
  // Everything else is the operator's, untouched.
  assert.equal(next.desiredCount, BASE.desiredCount);
  assert.equal(next.searchGoal, BASE.searchGoal);
});

test('an empty handoff city never blanks the operator\'s market', () => {
  const handoff = signalHandoffFromLead(lead(), { city: '', country: '' });
  const next = leadRadarPrefillFromHandoff(handoff, BASE);
  assert.equal(next.city, BASE.city);
  assert.equal(next.country, BASE.country);
});

/* ══════════════════════════════════════════════════════════════════ *
 * Wiring locks — the two pages really are connected
 * ══════════════════════════════════════════════════════════════════ */

const signalSource = readFileSync(
  path.join(ROOT, 'src/admin/pages/SignalRadar.tsx'), 'utf8');
const leadRadarSource = readFileSync(
  path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');

test('the Signal Radar card offers the handoff and nothing more', () => {
  assert.match(signalSource, /data-testid="signal-lead-handoff"/);
  assert.match(signalSource, /signalHandoffQuery\(signalHandoffFromLead\(lead\)\)/);
  // It navigates; it must not create a company by itself.
  assert.match(signalSource, /\/admin-tools\/lead-radar\?/);
  assert.doesNotMatch(signalSource, /createLeadRadarSearch|leadRadarCreateSearch/);
});

test('Lead Radar reads the handoff once, at mount, from the URL', () => {
  assert.match(leadRadarSource, /parseSignalHandoff\(new URLSearchParams\(window\.location\.search\)\)/);
  assert.match(leadRadarSource, /leadRadarPrefillFromHandoff\(handoff, DEFAULT_INPUT\)/);
  assert.match(leadRadarSource, /data-testid="lead-radar-signal-handoff"/);
});

test('the Lead Radar banner admits what the handoff does not know', () => {
  // If this sentence disappears, someone replaced it with a guessed niche.
  assert.match(leadRadarSource, /Нишу укажите сами/);
});
