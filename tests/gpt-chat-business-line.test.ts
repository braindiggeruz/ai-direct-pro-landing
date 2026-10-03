// The chat's business line (plan WP-20, map 03 §9): once per browser session,
// under the first answer of a conversation about a bot, a site, ads or a CRM,
// the studio's own line with a lead form filed as chat_b2b. The detector is
// tests/gpt-chat-business-intent.test.ts; the counter is
// tests/gpt-ui-events.test.ts; the lead's storage is tests/lead-attribution.test.ts.
//
// Run: node --import tsx --test tests/gpt-chat-business-line.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { businessLineTopic, detectBusinessTopic, type BusinessTopic } from '../src/gpt-chat/business-intent';
import { AiBusinessLine, BUSINESS_LINE_PAGES } from '../src/gpt-chat/components/AiBusinessLine';
import { AiLeadForm } from '../src/gpt-chat/components/AiLeadForm';
import { leadPart } from '../src/gpt-chat/lazy-part';
import { leadStrings } from '../src/gpt-chat/lead-strings';
import { strings } from '../src/gpt-chat/i18n';
import { EV, GA4_PARAMS } from '../src/gpt-chat/analytics';
import { LEAD_BUDGETS, LEAD_BUDGET_FIELD, LEAD_BUDGET_LABELS } from '../src/shared/lead-budget';
import { LEAD_FORM_PAGES } from '../scripts/lead-form';
import { UI_EVENTS } from '../functions/lib/gpt-chat/ui-event-store';
import { LEAD_SOURCES } from '../functions/lib/gpt-chat/validate';
import type { Page } from '../src/shared/types';

// tsx compiles .tsx with the classic transform in tests (as in tests/gpt-chat-lazy-part.test.ts).
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const LOCALES = ['ru', 'uz'] as const;
const TOPICS: readonly BusinessTopic[] = ['bot', 'site', 'ads', 'crm'];

const page = (url: string): Page | null => {
  const [, locale, slug] = url.match(/^\/(?:(ru|uz)\/)?([^/]+)\/$/) ?? [];
  if (!slug) return null;
  const file = path.join(ROOT, 'content', 'pages', locale ?? 'ru', `${slug}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Page;
  } catch {
    return null;
  }
};

test('the line asks only on a typed first message in the plain chat, once per session, unless closed today', () => {
  const turn = { text: 'Нужен сайт для магазина', messageNumber: 1, tool: 'chat', typed: true, spent: false };
  assert.equal(businessLineTopic(turn), 'site');
  assert.equal(businessLineTopic({ ...turn, messageNumber: 2 }), null, 'a later message');
  assert.equal(businessLineTopic({ ...turn, tool: 'business' }), null, 'the business tool has its own card');
  assert.equal(businessLineTopic({ ...turn, tool: 'smm' }), null, 'another tool');
  assert.equal(businessLineTopic({ ...turn, typed: false }), null, 'a template, an answer action or a retry');
  assert.equal(businessLineTopic({ ...turn, spent: true }), null, 'shown this session or closed today');
  assert.equal(businessLineTopic({ ...turn, text: 'Нужна работа в магазине' }), null, 'no topic');
});

test('every topic the detector names is one the server counts, and its page carries the form', () => {
  const named = new Set(['Сделайте сайт для клиники', 'Bot do‘kon uchun', 'Bitrix24 ni sozlash kerak', 'Таргет для кафе: сколько стоит?'].map(detectBusinessTopic));
  assert.deepEqual([...named].sort(), [...TOPICS].sort());
  assert.deepEqual([...UI_EVENTS.b2b_line_shown], [...TOPICS]);
  assert.deepEqual([...UI_EVENTS.b2b_line_dismissed], [...TOPICS]);
  assert.ok((LEAD_SOURCES as readonly string[]).includes('chat_b2b'));
  for (const topic of TOPICS) {
    for (const locale of LOCALES) {
      const url = BUSINESS_LINE_PAGES[topic][locale];
      const target = page(url);
      assert.ok(target, `${topic}/${locale}: ${url} is not a page`);
      assert.equal(target.status, 'published', url);
      assert.equal(target.locale, locale, url);
      assert.ok(url in LEAD_FORM_PAGES, `${url} has no lead form`);
    }
  }
});

test('the line says it is the studio’s, offers the form and closes; the form is filed as chat_b2b', async () => {
  const { AiBusinessLine: FromPart } = await leadPart.load();
  assert.equal(FromPart, AiBusinessLine, 'the line ships in the lazy part chat-lead');
  for (const locale of LOCALES) {
    const copy = leadStrings(locale);
    const render = (open: boolean, topic: BusinessTopic = 'bot') => renderToStaticMarkup(React.createElement(AiBusinessLine, {
      t: strings(locale), locale, apiBase: '', sessionId: 'sess_1', topic, open, onOpen: () => {}, onDismiss: () => {},
    }));
    const closed = render(false);
    assert.ok(closed.includes(`aria-label="${copy.lineLabel}"`), locale);
    for (const line of [copy.lineLabel, copy.lineText, copy.lineCta, copy.lineMore]) assert.ok(closed.includes(line), `${locale}: ${line}`);
    assert.match(closed, new RegExp(`<button type="button" aria-label="${copy.lineDismiss}" title="${copy.lineDismiss}" data-testid="ai-business-line-dismiss" class="[^"]*h-11 w-11`));
    assert.match(closed, /data-testid="ai-business-line-open" class="[^"]*min-h-11/);
    assert.ok(closed.includes(`href="${BUSINESS_LINE_PAGES.bot[locale]}"`), locale);
    assert.ok(!closed.includes('ai-lead-form'), 'the form waits for the button');
    assert.match(render(false, 'ads'), new RegExp(`data-topic="ads"[\\s\\S]*href="${BUSINESS_LINE_PAGES.ads[locale]}"`));

    const open = render(true);
    assert.ok(open.includes('data-testid="ai-lead-form"'), locale);
    assert.ok(!open.includes('ai-business-line-open'), 'the form replaces the buttons');
    assert.ok(open.includes(copy.lineText) && open.includes(copy.lineDismiss), 'the line stays above its form, closable');
    // Brand and honesty: the studio's line, no subscription words.
    assert.match(copy.lineLabel, /GPTBot\.uz/);
    assert.doesNotMatch(Object.values(copy).join(' '), /\b(Plus|Pro)\b|obuna|подписк/i);
  }
  // Every chat lead form names its source; the line's is chat_b2b, the card's gpt_chat.
  const line = read('src/gpt-chat/components/AiBusinessLine.tsx');
  assert.match(line, /method="chat_b2b_line"\s+source="chat_b2b"/);
  assert.match(read('src/gpt-chat/components/AiOfferCard.tsx'), /method="offer_b2b"\s+source="gpt_chat"/);
  const uses = readdirSync(path.join(ROOT, 'src/gpt-chat/components'))
    .flatMap((file) => [...read(`src/gpt-chat/components/${file}`).matchAll(/<AiLeadForm\b[\s\S]*?\/>/g)].map((m) => m[0]));
  assert.equal(uses.length, 2);
  for (const use of uses) assert.match(use, /source="(gpt_chat|chat_b2b)"/);
  // Shown and closed: GA4 and the server counter, by topic only.
  // One impression per page view, as the business card's: a trip to the business tool and back remounts the line.
  assert.match(line, /^let seen = false;$/m);
  assert.match(line, /if \(seen\) return;\s*seen = true;\s*track\(EV\.b2bLineShown, \{ topic, locale \}\);\s*recordUiEvent\(apiBase, 'b2b_line_shown', topic\);/);
  assert.match(line, /track\(EV\.b2bLineDismissed, \{ topic, locale \}\);\s*recordUiEvent\(apiBase, 'b2b_line_dismissed', topic\);\s*onDismiss\(\);/);
  assert.deepEqual([EV.b2bLineShown, EV.b2bLineDismissed], ['b2b_line_shown', 'b2b_line_dismissed']);
  assert.ok(GA4_PARAMS.has('topic') && GA4_PARAMS.has('source'));
});

test('the chat form asks for an optional budget from the closed list and sends it with its source', () => {
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(React.createElement(AiLeadForm, {
      t: strings(locale), locale, apiBase: '', sessionId: null, intent: 'business_bot', method: 'chat_b2b_line', source: 'chat_b2b',
    }));
    const select = html.match(/<select[^>]*name="budget"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(select, locale);
    assert.doesNotMatch(select[0], /required/);
    assert.match(select[0], /min-h-12/);
    const options = [...select[1].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(options, [['', LEAD_BUDGET_FIELD[locale].empty], ...LEAD_BUDGETS.map((value) => [value, LEAD_BUDGET_LABELS[locale][value]])]);
    const id = select[0].match(/id="([^"]+)"/)![1];
    assert.ok(html.includes(`<label for="${id}"`), `${locale}: the select has its label`);
    assert.ok(html.includes(leadStrings(locale).leadConsentDetail), locale);
  }
  const form = read('src/gpt-chat/components/AiLeadForm.tsx');
  const payload = form.slice(form.indexOf('await sendLead(apiBase, {'), form.indexOf('});', form.indexOf('await sendLead(apiBase, {')));
  assert.match(payload, /\n\s+source,\n/);
  assert.match(payload, /budget: isLeadBudget\(budget\) \? budget : undefined,/);
  assert.match(form, /track\(EV\.generateLead, \{ method, source, mode: parsed\.type, intent, locale \}\)/);
});

test('the console: detected at send time, shown once the answer is complete, gone at the next message', () => {
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(chat, /const lineTopic = businessLineTopic\(\{\s*text: trimmed,\s*messageNumber,\s*tool: meta\.tool \|\| activeTool,\s*typed: !meta\.templateId && !meta\.answerAction && !meta\.retry,\s*spent: offerDismissed \|\| loadBusinessLineShown\(\),\s*\}\);\s*if \(lineTopic\) leadPart\.preload\(\);/);
  assert.match(chat, /const revealLine = \(\) => \{\s*if \(!lineTopic\) return;\s*saveBusinessLineShown\(\);\s*setBusinessLine\(\{ topic: lineTopic, open: false \}\);\s*\};/);
  // Exactly the two complete answers (JSON and stream), after they are stored; never a stop, an error or a limit.
  const reveals = [...chat.matchAll(/revealLine\(\);\n\s*track\(EV\.aiResponseSuccess/g)];
  assert.equal(reveals.length, 2);
  assert.equal([...chat.matchAll(/revealLine\(\)/g)].length, 2);
  assert.match(chat, /setBusinessLine\(\(line\) => \(line\?\.open \? line : null\)\);/, 'a next message takes it away unless its form is open');
  assert.match(chat, /\{businessLine && !limit && activeTool !== "business" && \(\s*\/\/[^\n]*\n\s*<LazyPart part=\{leadPart\} fallback=\{null\} failed=\{null\}>/);
  assert.match(chat, /onDismiss=\{onDismissOffer\}/);
  const dismiss = chat.slice(chat.indexOf('const onDismissOffer = () => {'), chat.indexOf('};', chat.indexOf('const onDismissOffer = () => {')));
  assert.match(dismiss, /setBusinessLine\(null\);\s*setOfferDismissed\(true\);\s*saveOfferDismissed\(config\.locale, storageScope\);/);
  // The text is read in the browser only: nothing but the topic leaves it.
  assert.doesNotMatch(chat, /recordUiEvent|b2b_line_shown/);
});
