import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TelegramBusinessConnectionCard } from '../src/admin/components/lead-radar/TelegramBusinessConnectionCard.tsx';
import {
  boundTelegramDraftText,
  isAutomatedTelegramSendEligible,
  isTelegramDraftTextReady,
  isVerifiedCorporateBusinessEndpoint,
  normalizeTelegramDraftUrl,
  TelegramOutreachActions,
  type TelegramOutreachEndpoint,
} from '../src/admin/components/lead-radar/TelegramOutreachActions.tsx';

const ROOT = path.resolve(import.meta.dirname, '..');
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const COMPONENTS = [
  'src/admin/components/lead-radar/TelegramBusinessConnectionCard.tsx',
  'src/admin/components/lead-radar/TelegramOutreachActions.tsx',
];
const PAGE = readFileSync(path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
const API = readFileSync(path.join(ROOT, 'src/admin/lib/api.ts'), 'utf8');
const ACTIONS = readFileSync(path.join(ROOT, 'src/admin/components/lead-radar/TelegramOutreachActions.tsx'), 'utf8');

const verifiedBusiness: TelegramOutreachEndpoint = {
  kind: 'business',
  verification: 'verified',
  ownership: 'corporate',
  doNotContact: false,
};

test('automated Telegram outreach fails closed for every ineligible endpoint class', () => {
  assert.equal(isVerifiedCorporateBusinessEndpoint(verifiedBusiness), true);
  assert.equal(isAutomatedTelegramSendEligible(verifiedBusiness, true), true);
  assert.equal(isAutomatedTelegramSendEligible(verifiedBusiness, false), false);

  for (const kind of ['human', 'unknown', 'bot', 'channel', 'group'] as const) {
    assert.equal(isAutomatedTelegramSendEligible({ ...verifiedBusiness, kind }, true), false, kind);
  }

  assert.equal(isAutomatedTelegramSendEligible({ ...verifiedBusiness, verification: 'unverified' }, true), false);
  assert.equal(isAutomatedTelegramSendEligible({ ...verifiedBusiness, ownership: 'personal' }, true), false);
  assert.equal(isAutomatedTelegramSendEligible({ ...verifiedBusiness, ownership: 'unknown' }, true), false);
  assert.equal(isAutomatedTelegramSendEligible({ ...verifiedBusiness, doNotContact: true }, true), false);
});

test('manual draft navigation accepts only explicit Telegram deep links', () => {
  assert.match(normalizeTelegramDraftUrl('https://t.me/company?text=hello') ?? '', /^https:\/\/t\.me\/company/);
  assert.match(normalizeTelegramDraftUrl('tg://resolve?domain=company&text=hello') ?? '', /^tg:\/\/resolve/);
  assert.equal(normalizeTelegramDraftUrl('http://t.me/company'), null);
  assert.equal(normalizeTelegramDraftUrl('https://example.com/company'), null);
  assert.equal(normalizeTelegramDraftUrl('javascript:alert(1)'), null);
  assert.equal(normalizeTelegramDraftUrl(' https://t.me/company'), null);
  assert.equal(normalizeTelegramDraftUrl('https://user:secret@t.me/company'), null);
  assert.equal(normalizeTelegramDraftUrl('https://t.me/company?start=campaign&text=hello'), null);
  assert.equal(normalizeTelegramDraftUrl('https://t.me/company?text=one&text=two'), null);
  assert.equal(normalizeTelegramDraftUrl('https://t.me/share/url?text=hello'), null);
  assert.equal(normalizeTelegramDraftUrl('https://t.me/company?text='), null);

  const longExactText = '🚀'.repeat(4_096);
  const longDraft = `https://t.me/company?text=${encodeURIComponent(longExactText)}`;
  assert.equal(new URL(normalizeTelegramDraftUrl(longDraft) ?? '').searchParams.get('text'), longExactText);
  assert.equal(normalizeTelegramDraftUrl(`https://t.me/company?text=${encodeURIComponent(`${longExactText}x`)}`), null);
});

test('draft limit follows Telegram Unicode code points and preserves exact edited text', () => {
  const astral = '🚀'.repeat(4_097);
  const bounded = boundTelegramDraftText(astral);
  assert.equal([...bounded].length, 4_096);
  assert.equal(bounded, '🚀'.repeat(4_096));
  assert.equal(boundTelegramDraftText('  exact text  '), '  exact text  ');
  assert.equal(boundTelegramDraftText('a\u0000b'), 'ab');
  assert.equal(isTelegramDraftTextReady('  \n'), false);
  assert.equal(isTelegramDraftTextReady('  exact text  '), true);
  assert.equal(isTelegramDraftTextReady('x'.repeat(4_097)), false);
});

test('paused readiness stays visible without an enabled connection action', () => {
  const markup = renderToStaticMarkup(React.createElement(TelegramBusinessConnectionCard, {
    status: 'paused',
    canReply: false,
    activeCompanyChats: 0,
    onConnect: () => undefined,
    actionDisabled: true,
  }));

  assert.match(markup, /Telegram Business/);
  assert.match(markup, /Контактный режим выключен/);
  assert.match(markup, /<button[^>]*disabled/);
});

test('manual draft never requires automatic-send approval, while active send does', () => {
  const shared = {
    endpoint: verifiedBusiness,
    manualDraftUrl: 'https://t.me/company?text=hello',
    approvalConfirmed: false,
    onApprovalChange: () => undefined,
    onSend: () => undefined,
  };
  const manual = renderToStaticMarkup(React.createElement(TelegramOutreachActions, {
    ...shared,
    activeChatEligible: false,
  }));
  assert.match(manual, /href="https:\/\/t\.me\/company\?text=hello"/);
  assert.doesNotMatch(manual, /type="checkbox"/);

  const automatic = renderToStaticMarkup(React.createElement(TelegramOutreachActions, {
    ...shared,
    activeChatEligible: true,
  }));
  assert.match(automatic, /type="checkbox"/);
  assert.match(automatic, /<button[^>]*disabled/);
});

test('components encode the accessibility and human-control contract', () => {
  const source = COMPONENTS.map((relative) => readFileSync(path.join(ROOT, relative), 'utf8')).join('\n');

  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /min-h-12/);
  assert.match(source, /actionDisabled/);
  assert.match(source, /24-часовое окно|последние 24 часа/);
  assert.match(source, /черновик Telegram|черновик в Telegram/);
  assert.match(source, /Подтверждаю автоматическую отправку/);
  assert.match(source, /Публичный endpoint не означает согласия/);
  assert.doesNotMatch(ACTIONS, /safeDraftUrl && approvalConfirmed/);
  assert.doesNotMatch(source, /setTimeout|setInterval|<dialog|role="dialog"/);
});

test('Lead Radar page integrates Telegram without background or broad contact sends', () => {
  assert.match(PAGE, /if \(!individualOutreachEnabled\) return null;/);
  assert.match(PAGE, /leadRadarTelegramBusinessStatus\(\)/);
  assert.match(PAGE, /leadRadarTelegramBusinessConnect\(requestKey\)/);
  assert.match(PAGE, /leadRadarPrepareTelegramOutreach\(leadId, text\)/);
  assert.match(PAGE, /leadRadarApproveTelegramBusiness\(lead\.id/);
  assert.match(PAGE, /approvalToken: approval\.approvalToken/);
  assert.match(PAGE, /persistTelegramAutomaticSendLock\(lead\.id\)/);
  assert.match(PAGE, /isLocallyVerifiedCorporateBusinessContact\(corporateTelegram\)/);
  assert.match(PAGE, /15 \* 60_000/);
  assert.match(PAGE, /href=\{telegramConnectLink\.url\}/);
  assert.match(PAGE, /Повтор автоматически не выполняется/);
  assert.match(PAGE, /status="paused"[\s\S]{0,240}actionDisabled/);
  assert.match(PAGE, /production-контакты сейчас выключены защитным флагом/);
  assert.match(PAGE, /min-h-12/);
  assert.match(PAGE, /focus-visible:ring-2/);
  assert.doesNotMatch(PAGE, /window\.open\(|setInterval\(/);
  assert.doesNotMatch(PAGE, /approvalRequestId|approvedAt/);

  assert.match(API, /leadRadarTelegramBusinessConnect: \(idempotencyKey: string\)/);
  assert.match(API, /telegram-business\/connect[\s\S]{0,160}Idempotency-Key/);
});

test('Lead Radar keeps the editable draft separate from pending and opened searches', () => {
  assert.match(PAGE, /const \[draftInput, setDraftInput\] = useState<LeadRadarSearchInput>/);
  assert.match(PAGE, /const \[pendingSearchInput, setPendingSearchInput\] = useState<LeadRadarSearchInput \| null>/);
  assert.match(PAGE, /const \[searchAttemptError, setSearchAttemptError\] = useState<SearchAttemptError \| null>/);
  assert.match(PAGE, /const snapshot = cloneSearchInput\(searchInput \?\? draftInput\)/);
  assert.match(PAGE, /setPendingSearchInput\(snapshot\)/);
  assert.match(PAGE, /setSearchAttemptError\(\{ input: snapshot, message: errorCopy\(searchError\) \}\)/);
  assert.doesNotMatch(PAGE, /setInput\(snapshot\)/);

  assert.match(PAGE, /value=\{draftInput\.niche\}/);
  assert.match(PAGE, /\{result\.search\.input\.niche\} · \{result\.search\.input\.city\}/);
  assert.match(PAGE, /Поиск «\{searchInputLabel\(searchAttemptError\.input\)\}» не запущен/);
  assert.match(PAGE, /по-прежнему открыт предыдущий результат/);
  assert.match(PAGE, /В форме новый черновик/);
  assert.match(PAGE, /Предыдущий результат/);
  assert.match(PAGE, /своими словами или с опечаткой/);
  assert.match(PAGE, /близкие по смыслу бизнесы/);
  assert.match(PAGE, /lead-radar-intent-interpretation/);
  assert.match(PAGE, /Запрос распознан как/);
  assert.match(PAGE, /Точная бизнес-категория не определена/);
});
