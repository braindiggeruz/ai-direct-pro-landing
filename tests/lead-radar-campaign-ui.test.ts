import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  automaticCampaignLeadIds,
  boundCampaignTemplate,
  campaignFromRecovery,
  campaignResumeBlockReason,
  classifyCampaignLeadLocally,
  isCampaignTemplateReady,
  isTelegramAccountQrExpired,
  isValidCampaignRecipientAuthorization,
  LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  renderCampaignPreview,
  safeTelegramLoginUrl,
  safeTelegramQrDataUrl,
  selectableCampaignLeadIds,
} from '../src/admin/lib/lead-radar-campaign.ts';
import type { LeadRadarLead, LeadRadarTelegramContact } from '../src/shared/lead-radar.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

function makeTelegramContact(overrides: Partial<LeadRadarTelegramContact> = {}): LeadRadarTelegramContact {
  return {
    url: 'https://t.me/verified_company',
    username: 'verified_company',
    type: 'business',
    confidence: 0.92,
    reason: 'Published by the company website.',
    evidenceIds: ['ev-1'],
    verifiedAt: '2026-08-25T10:00:00.000Z',
    messageable: false,
    ...overrides,
  };
}

function makeLead(overrides: Partial<LeadRadarLead> = {}): LeadRadarLead {
  return {
    id: 'lead-1',
    searchId: 'search-1',
    name: 'Clinic One',
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: null,
    website: 'https://example.test',
    phone: null,
    genericEmail: null,
    telegramUrl: 'https://t.me/verified_company',
    telegramContact: makeTelegramContact(),
    decisionMakers: [],
    enrichmentStatus: 'enriched',
    enrichmentReason: 'enriched',
    enrichmentAttempts: 1,
    score: 80,
    confidence: 0.9,
    priority: 'P2',
    lifecycle: 'new',
    suppressed: false,
    scoreComponents: [],
    signals: [],
    evidence: [],
    discoveredAt: '2026-08-25T10:00:00.000Z',
    lastVerifiedAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}

test('campaign pre-classification is conservative and DNC wins over every endpoint', () => {
  assert.deepEqual(classifyCampaignLeadLocally(makeLead()), {
    classification: 'automatic',
    reason: 'candidate_verified_corporate',
  });
  assert.equal(classifyCampaignLeadLocally(makeLead({ telegramContact: null, telegramUrl: null })).classification, 'excluded');
  assert.equal(classifyCampaignLeadLocally(makeLead({ telegramContact: makeTelegramContact({ type: 'human' }) })).classification, 'manual');
  assert.equal(classifyCampaignLeadLocally(makeLead({ telegramContact: makeTelegramContact({ type: 'bot' }) })).classification, 'excluded');
  assert.deepEqual(classifyCampaignLeadLocally(makeLead({ suppressed: true })), {
    classification: 'excluded',
    reason: 'do_not_contact',
  });
  assert.equal(LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT, 50);
});

test('campaign template preserves exact text, bounds Unicode code points and substitutes only the allowlisted variable', () => {
  const astral = '🚀'.repeat(4_097);
  assert.equal(boundCampaignTemplate(astral), '🚀'.repeat(4_096));
  assert.equal(isCampaignTemplateReady('  \n'), false);
  assert.equal(isCampaignTemplateReady('  exact {company_name}  '), true);
  assert.equal(isCampaignTemplateReady('  wrong {company}  '), false);
  assert.equal(renderCampaignPreview('Для {company_name}; {unknown}', 'Clinic One'), 'Для Clinic One; {unknown}');
});

test('QR rendering accepts only bounded PNG and Telegram login URL allowlists', () => {
  assert.equal(safeTelegramQrDataUrl('data:image/png;base64,QUJDRA=='), 'data:image/png;base64,QUJDRA==');
  assert.equal(safeTelegramQrDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(safeTelegramQrDataUrl('https://example.test/qr.png'), null);
  assert.equal(safeTelegramQrDataUrl('data:image/png;base64,not valid'), null);
  const loginUrl = `tg://login?token=${'A'.repeat(32)}_safe-token`;
  assert.equal(safeTelegramLoginUrl(loginUrl), loginUrl);
  assert.equal(safeTelegramLoginUrl(`https://t.me/login?token=${'A'.repeat(32)}`), null);
  assert.equal(safeTelegramLoginUrl(`tg://login?token=${'A'.repeat(32)}&next=evil`), null);
  assert.equal(safeTelegramLoginUrl('tg://login?token=short'), null);
});

test('active QR recovery expires locally and bulk selection stays unique and capped by the UI', () => {
  const now = Date.parse('2026-08-25T10:00:00.000Z');
  const connectingAccount = {
    status: 'connecting' as const,
    connectionId: 'account-1',
    displayName: null,
    username: null,
    phoneMasked: null,
    connectedAt: null,
    lastHealthAt: null,
    qr: {
      authId: 'auth_fixture_1234567890',
      qrCodeDataUrl: 'data:image/png;base64,AAAA',
      qrLoginUrl: `tg://login?token=${'A'.repeat(32)}`,
      expiresAt: '2026-08-25T10:01:00.000Z',
    },
    reasonCode: null,
  };
  assert.equal(isTelegramAccountQrExpired(connectingAccount, now), false);
  assert.equal(isTelegramAccountQrExpired(connectingAccount, now + 60_000), true);
  assert.equal(isTelegramAccountQrExpired({ ...connectingAccount, status: 'connected' }, now + 60_000), false);

  const leads = Array.from({ length: 51 }, (_, index) => makeLead({ id: `lead-${index + 1}` }));
  leads.push(makeLead({ id: 'lead-1' }));
  leads.push(makeLead({ id: 'lead-dnc', suppressed: true }));
  const selectable = selectableCampaignLeadIds(leads);
  assert.equal(selectable.length, 51);
  assert.equal(new Set(selectable.slice(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT)).size, 50);
});

test('bulk shortcut selects only automatic candidates while manual review stays explicit', () => {
  const automatic = makeLead({ id: 'lead-auto' });
  const manual = makeLead({
    id: 'lead-manual',
    telegramContact: makeTelegramContact({ type: 'human' }),
  });
  const missing = makeLead({ id: 'lead-missing', telegramContact: null, telegramUrl: null });
  const suppressed = makeLead({ id: 'lead-dnc', suppressed: true });
  assert.deepEqual(automaticCampaignLeadIds([
    automatic, manual, missing, suppressed, { ...automatic },
  ]), ['lead-auto']);
  assert.deepEqual(selectableCampaignLeadIds([automatic, manual, missing, suppressed]), [
    'lead-auto', 'lead-manual',
  ]);
});

test('campaign recovery accepts the active/latest envelope and resume guards fail closed', () => {
  const campaign = {
    id: 'lrtgc_campaign_1',
    status: 'paused' as const,
    counts: { total: 2, pending: 1, sent: 0, failed: 0, ambiguous: 1, skipped: 0 },
    createdAt: '2026-08-25T10:00:00.000Z',
    startedAt: '2026-08-25T10:01:00.000Z',
    completedAt: null,
    pausedUntil: null,
    reasonCode: 'ambiguous_delivery',
  };
  const account = {
    status: 'connected' as const,
    connectionId: 'lrtgua_account_1',
    displayName: 'Рабочий аккаунт',
    username: null,
    phoneMasked: null,
    connectedAt: '2026-08-25T09:00:00.000Z',
    lastHealthAt: '2026-08-25T10:00:00.000Z',
    qr: null,
    reasonCode: null,
  };
  assert.equal(campaignFromRecovery({ active: campaign, latest: null })?.id, campaign.id);
  assert.equal(campaignFromRecovery({ active: null, latest: campaign })?.id, campaign.id);
  assert.equal(campaignFromRecovery(campaign)?.id, campaign.id);
  assert.equal(campaignFromRecovery(null), null);
  assert.equal(campaignResumeBlockReason({
    campaign, account, autoSendEnabled: true, identityConfirmed: true,
  }), 'ambiguous_delivery');
  assert.equal(campaignResumeBlockReason({
    campaign: { ...campaign, counts: { ...campaign.counts, ambiguous: 0 } },
    account,
    autoSendEnabled: true,
    identityConfirmed: false,
  }), 'identity_confirmation_required');
  assert.equal(campaignResumeBlockReason({
    campaign: {
      ...campaign,
      counts: { ...campaign.counts, ambiguous: 0 },
      pausedUntil: '2026-08-25T11:00:00.000Z',
      reasonCode: 'flood_wait',
    },
    account,
    autoSendEnabled: true,
    identityConfirmed: true,
    now: Date.parse('2026-08-25T10:30:00.000Z'),
  }), 'cooldown');
  assert.equal(campaignResumeBlockReason({
    campaign: {
      ...campaign,
      counts: { ...campaign.counts, ambiguous: 0 },
      canResume: false,
      resumeBlockedReason: 'account_disconnected',
    },
    account,
    autoSendEnabled: true,
    identityConfirmed: true,
  }), 'account_disconnected');
});

test('recipient authorization requires an unexpired per-company server attestation', () => {
  const authorization = {
    basis: 'documented_consent' as const,
    evidenceVersion: 'eligibility-v1',
    verifiedAt: '2026-08-25T09:00:00.000Z',
    expiresAt: '2026-09-25T09:00:00.000Z',
    reviewer: 'owner_verified' as const,
  };
  const now = Date.parse('2026-08-25T10:00:00.000Z');
  assert.equal(isValidCampaignRecipientAuthorization(authorization, 'documented_consent', now), true);
  assert.equal(isValidCampaignRecipientAuthorization(authorization, 'inbound_request', now), false);
  assert.equal(isValidCampaignRecipientAuthorization({
    ...authorization,
    expiresAt: '2026-08-25T09:30:00.000Z',
  }, 'documented_consent', now), false);
  assert.equal(isValidCampaignRecipientAuthorization(null, 'documented_consent', now), false);
});

test('page and API encode split discovery capability and the exact campaign control plane', () => {
  const page = readFileSync(path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
  const component = readFileSync(path.join(ROOT, 'src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx'), 'utf8');
  const api = readFileSync(path.join(ROOT, 'src/admin/lib/api.ts'), 'utf8');
  const accountService = readFileSync(path.join(ROOT, 'functions/platform/lead-radar/telegram-account-service.ts'), 'utf8');
  const adminApp = readFileSync(path.join(ROOT, 'src/admin/AdminApp.tsx'), 'utf8');

  assert.match(page, /telegramDiscoveryEnabled[\s\S]{0,240}\?\? capabilities\.admissionEnabled/);
  assert.match(page, /Сначала компании с Telegram/);
  assert.match(page, /checked=\{draftInput\.telegramRequired\}/);
  assert.match(page, /disabled=\{!capabilities\.admissionEnabled \|\| !telegramDiscoveryEnabled\}/);
  assert.doesNotMatch(page, /checked=\{capabilities\.contactEnabled && draftInput\.telegramRequired\}/);
  assert.doesNotMatch(page, /disabled=\{loading \|\| !capabilities\.admissionEnabled \|\| !telegramDiscoveryEnabled\}/);
  assert.match(page, /telegramDiscoveryPriority\(right\) - telegramDiscoveryPriority\(left\)/);
  assert.match(page, /campaignOutreachEnabled/);
  assert.match(page, /telegramAccountEnabled/);
  assert.match(page, /campaignAutoSendEnabled/);

  assert.match(api, /telegram-account\/connect/);
  assert.match(api, /telegram-account\/connect\/\$\{encodeURIComponent\(authId\)\}/);
  assert.match(api, /leadRadarConnectTelegramAccount[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_ACCOUNT_BROWSER_CONTROL_TIMEOUT_MS/);
  assert.match(api, /leadRadarTelegramAccount: \(\)[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_ACCOUNT_BROWSER_CONTROL_TIMEOUT_MS/);
  assert.match(api, /leadRadarTelegramAccountConnectStatus[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_ACCOUNT_BROWSER_CONTROL_TIMEOUT_MS/);
  assert.match(api, /leadRadarDisconnectTelegramAccount[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_ACCOUNT_BROWSER_CONTROL_TIMEOUT_MS/);
  const browserControlTimeout = api.match(/LEAD_RADAR_TELEGRAM_ACCOUNT_BROWSER_CONTROL_TIMEOUT_MS = ([\d_]+)/u);
  const platformControlTimeout = accountService.match(/TELEGRAM_ACCOUNT_CONTROL_REQUEST_TIMEOUT_MS = ([\d_]+)/u);
  assert.ok(browserControlTimeout && platformControlTimeout);
  assert.ok(
    Number(browserControlTimeout[1].replaceAll('_', '')) > Number(platformControlTimeout[1].replaceAll('_', '')),
    'browser connect/revoke timeout must exceed the bounded platform control deadline',
  );
  assert.match(api, /telegram-campaigns\/prepare[\s\S]{0,180}Idempotency-Key/);
  assert.match(api, /telegram-campaigns\/eligibility[\s\S]{0,180}Idempotency-Key/);
  assert.match(api, /telegram-campaigns\?searchId=\$\{encodeURIComponent\(searchId\)\}/);
  assert.match(api, /telegram-campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/\$\{action\}/);
  assert.match(component, /accountId,[\s\S]{0,80}searchId,[\s\S]{0,160}leadIds: \[\.\.\.selectedLeadIds\],[\s\S]{0,100}template,[\s\S]{0,100}approvalToken:/);
  assert.match(component, /contactBasis,/);
  assert.match(component, /Документированное согласие/);
  assert.match(component, /Компания сама запросила контакт/);
  assert.match(component, /Существующие деловые отношения/);
  assert.match(component, /Действующий договор/);
  assert.doesNotMatch(component, /value="public_contact"/);
  assert.match(component, /disabled=\{!campaignOutreachEnabled \|\| !campaignRecoveryReady \|\| !connected \|\| !accountIdentityConfirmed \|\| !contactBasis/);
  assert.match(component, /action === 'start' \|\| action === 'resume'/);
  assert.match(component, /Создать кампанию без запуска/);
  assert.match(component, /if \(!campaignAutoSendEnabled\)[\s\S]{0,220}Кампания создана и остаётся без отправок/);
  assert.match(component, /campaign\.status === 'running'[\s\S]{0,260}transitionCampaign\('pause'\)/);
  assert.match(component, /transitionCampaign\('stop'\)/);
  assert.match(component, /Pause и Stop/);
  assert.match(component, /Кампании выключены/);
  assert.match(component, /fail-closed/);
  assert.match(component, /<fieldset disabled=\{operationBusy \|\| !campaignRecoveryReady \|\| Boolean\(campaign\)\}/);
  assert.doesNotMatch(component, /<fieldset disabled=\{!campaignEnabled/);
  assert.match(component, /Контур отправки ещё не активирован/);
  assert.match(component, /const next = await api\.leadRadarTelegramAccount\(\)/);
  assert.match(component, /account\?\.qr\?\.authId/);
  assert.match(component, /leadRadarTelegramAccountConnectStatus\(authId\)/);
  assert.match(component, /refreshConnectionStatus[\s\S]{0,500}leadRadarTelegramAccountConnectStatus\(authId\)/);
  assert.match(component, /onClick=\{\(\) => \{ void refreshConnectionStatus\(\); \}\}[\s\S]{0,300}Я отсканировал — проверить/);
  assert.match(component, /account\?\.qr\?\.expiresAt, account\?\.status/);
  assert.match(component, /создать новый QR/);
  assert.match(component, /safeTelegramLoginUrl\(account\?\.qr\?\.qrLoginUrl\)/);
  assert.match(component, /href=\{safeQrLoginUrl\} target="_blank" rel="noreferrer"/);
  assert.match(component, /Открыть в Telegram на этом устройстве/);
  assert.match(component, /automaticLeadIds\.slice\(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT\)/);
  assert.match(component, /Выбрать корпоративных кандидатов/);
  assert.match(component, /Все персонализированные сообщения/);
  assert.match(component, /Показаны все:/);
  assert.doesNotMatch(component, /preparation\.previews\.slice\(0, 3\)/);
  assert.match(component, /leadRadarTelegramCampaignRecovery\(searchId\)/);
  assert.match(component, /!campaignOutreachEnabled[\s\S]{0,100}recoveredSearchId === searchId && !campaignRecovering && !campaignRecoveryIssue/);
  assert.match(component, /Серверная подготовка и запуск заблокированы до успешной проверки/);
  assert.match(component, /Повторить проверку/);
  assert.match(component, /Это нужный аккаунт для текущей кампании/);
  assert.match(component, /Выбор пункта не создаёт разрешение/);
  assert.match(component, /isValidCampaignRecipientAuthorization/);
  assert.match(component, /Подтвердить документ по одной компании/);
  assert.match(component, /evidenceReference: normalizedReference/);
  assert.match(component, /От 8 до 200 символов/);
  assert.match(component, /максимум 366 дней/);
  assert.match(component, /campaignResumeBlockReason/);
  assert.match(component, /disabled=\{accountBusy \|\| accountLoading\}/);
  assert.match(component, /Boolean\(accountConnectionId\) \|\| account\.status === 'pending' \|\| account\.status === 'connecting'/);
  assert.match(component, /aria-invalid=\{Boolean\(templateIssue\)\}/);
  assert.match(component, /aria-errormessage=\{templateIssue/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="progressbar"/);
  assert.match(component, /min-h-12/);
  assert.doesNotMatch(component, /min-h-11/);
  assert.match(component, /Итог неизвестен/);
  assert.match(component, /не повторяются автоматически/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|window\.open\(|setInterval\(/);
  assert.match(adminApp, /href="#admin-main-content"/);
  assert.match(adminApp, /<main id="admin-main-content"/);
  assert.doesNotMatch(page, /<main\b/);
});
