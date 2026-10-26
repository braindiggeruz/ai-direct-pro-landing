// The end of the trial (monetization roadmap 2026-10-25 §5.2, 09 §4.2):
// Ш1 the paywall by the page's role, Ш7 «1 ta sinov javobi qoldi», the exit
// survey «Nega hozir emas?» and the page role it reports. The copy is
// src/gpt-chat/trial-copy.ts (pure, tested here); the window and the card are
// the lazy part chat-conversion, which imports a stylesheet, so its source is
// read here and its behaviour runs in tests/chat-trial-browser.test.ts.
//
// Run: node --import tsx --test tests/chat-trial-paywall.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { EXIT_REASONS, paywallRole, sum, trialCopy, type PaywallRole } from '../src/gpt-chat/trial-copy';
import { CHAT_ROLE_PRESETS } from '../src/shared/types';
import { UI_EVENTS } from '../functions/lib/gpt-chat/ui-event-store';
import { limitCard } from '../src/gpt-chat/limit-card';
import type { PackTerms } from '../src/gpt-chat/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const LOCALES = ['uz', 'ru'] as const;
const ROLES: readonly PaywallRole[] = ['general', ...CHAT_ROLE_PRESETS];
// Deliberately not the live numbers: every figure on screen must come from these terms.
const PACK: PackTerms = { priceUzs: 23_456, messageLimit: 321, dailyLimit: 47, months: 1 };

test('Ш1: every page role has its own heading and line in both languages; the main chats keep theirs', () => {
  assert.deepEqual([...UI_EVENTS.trial_paywall_role], [...ROLES], 'the counter knows every role the copy speaks to');
  assert.equal(paywallRole(undefined), 'general');
  for (const role of CHAT_ROLE_PRESETS) assert.equal(paywallRole(role), role);
  for (const locale of LOCALES) {
    const copies = ROLES.map((role) => trialCopy(locale, role, PACK));
    assert.equal(new Set(copies.map((c) => c.title)).size, ROLES.length, `${locale}: one heading per role`);
    assert.equal(new Set(copies.map((c) => c.line)).size, ROLES.length, `${locale}: one line per role`);
    for (const [i, c] of copies.entries()) {
      const label = `${locale}/${ROLES[i]}`;
      assert.match(c.title, /\?$/, `${label}: a question about the task`);
      // The trial's end is said in the line itself: the same 3 as the limit card and the server.
      assert.match(c.line, locale === 'uz' ? /^3 ta sinov javobi tugadi\. / : /^Три пробных ответа использованы\. /, label);
      // No figure of its own beyond the trial's 3, no recommendation, no preselection words.
      assert.doesNotMatch(`${c.title} ${c.line}`.replace(/^3 /, '').replace(/ 3 /, ' '), /\d/, label);
      assert.doesNotMatch(Object.values(c).filter((v) => typeof v === 'string').join(' '), /Tavsiya|Рекоменд|рекоменд|tavsiya/, label);
    }
  }
  // The main chats say what they said before (only the tool pages change).
  assert.equal(trialCopy('uz', 'general', PACK).title, 'Vazifangizni davom ettiramizmi?');
  assert.equal(trialCopy('ru', 'general', PACK).title, 'Продолжим вашу задачу?');
  assert.equal(trialCopy('uz', 'translator', PACK).title, 'Tarjimani davom ettiramizmi?');
  assert.equal(trialCopy('uz', 'teacher', PACK).title, 'Tushuntirishni davom ettiramizmi?');
  assert.equal(trialCopy('uz', 'smm', PACK).title, 'Reklama matnlarini davom ettiramizmi?');
  assert.equal(trialCopy('uz', 'writer', PACK).title, 'Yana variantlar kerakmi?');
});

test('Ш1: the pack facts and every provider button carry the server\'s terms; Paketim bor; honest words only', () => {
  for (const locale of LOCALES) {
    const c = trialCopy(locale, 'translator', PACK);
    const price = sum(locale, PACK.priceUzs);
    assert.ok(price.replace(/\s/g, '').includes('23456'), `${locale}: ${price}`);
    for (const value of [PACK.messageLimit, PACK.dailyLimit, PACK.months]) assert.ok(c.facts.includes(String(value)), `${locale}: ${value}`);
    assert.match(c.facts, locale === 'uz' ? /avtomatik yechib olinmaydi$/ : /без автосписаний$/);
    // The period is the server's calendar month, never a made-up «30 kun».
    assert.match(c.facts, locale === 'uz' ? /1 kalendar oy/ : /1 календ\. мес\./);
    assert.doesNotMatch(c.facts, /30 kun|30 дней/);
    // Same shape for every provider: nothing is preselected or weighted.
    assert.equal(c.pay('click'), `Click · ${price}`);
    assert.equal(c.pay('payme'), `Payme · ${price}`);
    assert.equal(c.pay('uzum'), `Uzum Bank · ${price}`);
    assert.equal(c.havePack, locale === 'uz' ? 'Paketim bor' : 'У меня есть пакет');
    // Ш7: one trial answer left, with the pack's facts from the same terms.
    assert.equal(c.lastTitle, locale === 'uz' ? '1 ta sinov javobi qoldi' : 'Остался 1 пробный ответ');
    for (const value of [PACK.messageLimit, PACK.dailyLimit]) assert.ok(c.lastFacts.includes(String(value)), `${locale}: ${value}`);
  }
  for (const role of ROLES) for (const locale of LOCALES) {
    const all = JSON.stringify(trialCopy(locale, role, PACK));
    // The role is set in the browser; the server does not enforce it, so nothing promises a rule.
    assert.doesNotMatch(all, /tayyor javob berm|не да[её]т готов|готовых ответов не|ko‘chirib|списыва/i, `${locale}/${role}`);
    assert.doesNotMatch(all, /Kutishni|ждать/, `${locale}/${role}: the trial never comes back with time`);
    assert.doesNotMatch(all, /obuna|подписк|\bPro\b|\bPlus\b|ChatGPT/, `${locale}/${role}`);
    if (locale === 'uz') assert.doesNotMatch(all, /[A-Za-z]'[A-Za-z]|[ʻʼ`]/, `${role}: o‘, g‘ with U+2018, the tutuq with U+2019`);
  }
  assert.match(trialCopy('uz', 'smm', PACK).line, /e’lon/, 'the tutuq is U+2019');
  assert.match(trialCopy('uz', 'marketer', PACK).line, /g‘oyalar/, 'g‘ is U+2018');
});

test('the survey: four answers from the server\'s closed list, in both languages, no free text', () => {
  assert.deepEqual([...EXIT_REASONS], [...UI_EVENTS.trial_exit_reason]);
  assert.deepEqual(trialCopy('uz', 'general', PACK).survey.answers, { price: 'Qimmat', once: 'Faqat bir marta kerak edi', no_card: 'Karta yo‘q', later: 'Keyinroq' });
  assert.deepEqual(trialCopy('ru', 'general', PACK).survey.answers, { price: 'Дорого', once: 'Нужно было один раз', no_card: 'Нет карты', later: 'Позже' });
  assert.equal(trialCopy('uz', 'teacher', PACK).survey.title, 'Nega hozir emas?');
  assert.equal(trialCopy('ru', 'teacher', PACK).survey.title, 'Почему не сейчас?');
});

test('the window: role copy, a sum on every button, Paketim bor, the survey once after a close that is not a payment', () => {
  const part = read('src/gpt-chat/parts/chat-conversion.tsx');
  const paywall = part.slice(part.indexOf('export function TrialPaywall('), part.indexOf('export function ChatPackPrompt('));
  assert.match(paywall, /const page = paywallRole\(role\);\n\s*const c = trialCopy\(locale, page, pack\);/);
  assert.match(paywall, /<DialogTitle>\{c\.title\}<\/DialogTitle>\n\s*<DialogDescription>\{c\.line\}<\/DialogDescription>/);
  assert.match(paywall, /\{c\.pay\(provider\)\}/, 'the sum on every provider button');
  assert.doesNotMatch(paywall, /autoFocus|defaultChecked|data-recommended|Tavsiya/, 'nothing preselected');
  // Paketim bor: the pack window without a provider, not a dismissal (no survey).
  assert.match(paywall, /data-testid="trial-have-pack" onClick=\{\(\) => \{ setOpen\(false\); track\(EV\.packPromptClicked, \{ locale, surface: 'trial_exhausted', from: 'have_pack' \}\); onPay\(\); \}\}/);
  // Shown: GA4 with the role, the server counter with the role from the closed list.
  assert.match(paywall, /track\(EV\.packPromptViewed, \{ locale, surface: 'trial_exhausted', role_id: page \}\);/);
  assert.match(paywall, /recordUiEvent\(apiBase, 'trial_paywall_role', page\);/);
  // The survey: asked only by close() (×, «later», Escape, outside), once; a payment never asks.
  const close = paywall.slice(paywall.indexOf('const close = () => {'), paywall.indexOf('};', paywall.indexOf('const close = () => {')));
  assert.match(close, /setOpen\(false\);\n\s*setSurvey\(\(state\) => state \?\? 'ask'\);/);
  assert.equal([...paywall.matchAll(/setSurvey\(\(state\) => state \?\? 'ask'\)/g)].length, 1);
  assert.match(paywall, /onOpenChange=\{value => \{ if \(!value\) close\(\); \}\}/);
  assert.match(paywall, /\{!open && \(survey === 'ask' \|\| survey === 'done'\) && \(/, 'in the thread, under the closed window: it never holds the closing');
  assert.match(paywall, /EXIT_REASONS\.map\(reason => <button type="button" key=\{reason\} data-reason=\{reason\} onClick=\{\(\) => answer\(reason\)\}>/);
  assert.match(paywall, /recordUiEvent\(apiBase, 'trial_exit_reason', reason\);\n\s*setSurvey\('done'\);/);
  assert.match(paywall, /aria-label=\{c\.survey\.close\} onClick=\{\(\) => setSurvey\('gone'\)\}/, 'closable without an answer');
  assert.doesNotMatch(paywall, /<textarea|<input/, 'no text field');
  assert.doesNotMatch(part, /\bfetch\(|sendBeacon/, 'counted through recordUiEvent only');
});

test('Ш7 and the role on the start bundle: a prop or two, the copy stays in the lazy part', () => {
  const chat = read('src/gpt-chat/components/AiChatConsole.tsx');
  assert.match(chat, /const trial = freeLimits\?\.lifetime === 3;/);
  // The card after a useful answer now also shows during the trial, once one answer is left.
  assert.match(chat, /!businessLine && !showOffer && \(!trial \|\| remaining === 1\) && \(/);
  assert.match(chat, /nearLimit=\{fewLeft\} trial=\{trial\}/);
  // The window learns the page's role; «Paketim bor» reuses onPay without a provider.
  assert.match(chat, /<TrialPaywall key=\{ownerKey\} owner=\{ownerKey\} locale=\{config\.locale\} role=\{config\.role\}[^>]*onPay=\{provider=>openAccount\('limit_card',provider\)\}\/>/);
  // «Sinov javoblari: N/3» stays as it was.
  assert.match(chat, /text: config\.locale === 'ru' \? `Пробных ответов: \$\{remaining\} из 3` : `Sinov javoblari: \$\{remaining\}\/3`/);
  // trial-copy.ts is a value import of the lazy part only.
  const valueImports = (file: string) => /^import \{[^}]*\} from '[./]+trial-copy'/m.test(read(file));
  assert.equal(valueImports('src/gpt-chat/parts/chat-conversion.tsx'), true);
  for (const file of ['src/gpt-chat/components/AiChatConsole.tsx', 'src/gpt-chat/main.tsx', 'src/gpt-chat/i18n.ts', 'src/gpt-chat/limit-card.ts', 'src/gpt-chat/ui-events.ts', 'src/gpt-chat/types.ts']) {
    assert.equal(valueImports(file), false, file);
  }
  const part = read('src/gpt-chat/parts/chat-conversion.tsx');
  const card = part.slice(part.indexOf('export function ChatPackPrompt('));
  assert.match(card, /const surface=trial\?'trial_last':nearLimit\?'near_limit':'after_answer';/);
  assert.match(card, /<strong>\{last\?last\.lastTitle:/);
});

test('the limit card under the trial: no «Kutishni xohlamaysizmi?», the pack facts stay; a cap that time lifts keeps the question', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  const input = { billingAvailable: true, paid: false, botHandoff: false, remaining: 0, pack: { ...PACK } };
  for (const locale of LOCALES) {
    const trialCard = limitCard(locale, { reason: 'trial', retryAt: null, since: now, limits: null }, input, now);
    assert.ok(trialCard.offer, locale);
    assert.doesNotMatch(trialCard.offer!, /Kutishni|ждать/, locale);
    assert.ok(trialCard.offer!.includes(String(PACK.messageLimit)) && trialCard.offer!.replace(/\s/g, '').includes('23456'), locale);
    const hourly = limitCard(locale, { reason: 'hourly', retryAt: now + 3_600_000, since: now, limits: { hourly: 5, daily: 15 } }, input, now);
    assert.match(hourly.offer!, locale === 'uz' ? /^Kutishni xohlamaysizmi\? / : /^Не хотите ждать\? /);
  }
});
