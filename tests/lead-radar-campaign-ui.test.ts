import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TelegramAccountCampaignPanel } from '../src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx';
import {
  automaticCampaignLeadIds,
  boundCampaignTemplate,
  campaignDraftCandidateLeadIds,
  campaignFromRecovery,
  campaignMessageLimit,
  campaignResumeBlockReason,
  classifyCampaignLeadLocally,
  hasCampaignImageAnimationMarker,
  isCampaignTemplateReady,
  isValidCampaignMediaUpload,
  isTelegramAccountQrExpired,
  isValidCampaignRecipientAuthorization,
  LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT,
  LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES,
  renderCampaignPreview,
  safeTelegramLoginUrl,
  safeTelegramQrDataUrl,
  selectableCampaignLeadIds,
  telegramAccountQuickAction,
  validateCampaignImage,
  validateCampaignImageDimensions,
} from '../src/admin/lib/lead-radar-campaign.ts';
import type { LeadRadarLead, LeadRadarTelegramContact } from '../src/shared/lead-radar.ts';
import {
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT,
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS,
  parseLeadRadarTelegramCampaignDailyLimit,
  parseLeadRadarTelegramCampaignMinimumIntervalSeconds,
} from '../src/shared/lead-radar-telegram-campaign-policy.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
(globalThis as typeof globalThis & { React: typeof React }).React = React;

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
  assert.equal(LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT, 30);
  assert.equal(LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS, 120);
});

test('campaign policy copy uses server capabilities and production configs match shared defaults', () => {
  const component = readFileSync(path.join(ROOT, 'src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx'), 'utf8');
  const page = readFileSync(path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
  assert.match(component, /Серверный лимит:[\s\S]{0,160}telegramCampaignDailyLimit/);
  assert.match(component, /telegramCampaignMinimumIntervalSeconds/);
  assert.doesNotMatch(component, /LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_(?:DAILY_LIMIT|MIN_INTERVAL_SECONDS)/);
  assert.match(page, /telegramCampaignDailyLimit=\{telegramCampaignDailyLimit\}/);
  assert.match(page, /telegramCampaignMinimumIntervalSeconds=\{telegramCampaignMinimumIntervalSeconds\}/);

  for (const configPath of ['wrangler.toml', 'wrangler.automation.toml']) {
    const config = readFileSync(path.join(ROOT, configPath), 'utf8');
    const daily = config.match(/LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT = "(\d+)"/u);
    const interval = config.match(/LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS = "(\d+)"/u);
    assert.equal(Number(daily?.[1]), LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_DAILY_LIMIT, `${configPath}: daily limit drift`);
    assert.equal(Number(interval?.[1]), LEAD_RADAR_TELEGRAM_CAMPAIGN_DEFAULT_MIN_INTERVAL_SECONDS, `${configPath}: interval drift`);
  }
});

test('campaign policy cannot exceed 30 sends or weaken the 120-second pacing floor', () => {
  assert.equal(parseLeadRadarTelegramCampaignDailyLimit('30'), 30);
  assert.equal(parseLeadRadarTelegramCampaignDailyLimit('31'), null);
  assert.equal(parseLeadRadarTelegramCampaignMinimumIntervalSeconds('120'), 120);
  assert.equal(parseLeadRadarTelegramCampaignMinimumIntervalSeconds('119'), null);
});

test('campaign template preserves exact text, bounds Unicode code points and substitutes only the allowlisted variable', () => {
  const astral = '🚀'.repeat(4_097);
  assert.equal(boundCampaignTemplate(astral), '🚀'.repeat(4_096));
  assert.equal(isCampaignTemplateReady('  \n'), false);
  assert.equal(isCampaignTemplateReady('  exact {company_name}  '), true);
  assert.equal(isCampaignTemplateReady('🚀'.repeat(LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT), true), true);
  assert.equal(isCampaignTemplateReady('🚀'.repeat(LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT + 1), true), false);
  assert.equal(campaignMessageLimit(true), LEAD_RADAR_CAMPAIGN_CAPTION_LIMIT);
  assert.equal(campaignMessageLimit(false), 4_096);
  assert.equal(isCampaignTemplateReady('  wrong {company}  '), false);
  for (const unsafe of ['\u0000', '\u0001', '\r', '\u000b', '\u007f', '\ud800', '\udfff']) {
    assert.equal(isCampaignTemplateReady(`before${unsafe}after`), false);
    assert.equal(isCampaignTemplateReady(`before${unsafe}after`, true), false);
    assert.equal(boundCampaignTemplate(`before${unsafe}after`), 'beforeafter');
  }
  const exact = 'RU Русский\n\nUZ O‘zbekcha\t👩‍💻 e\u0301';
  assert.equal(boundCampaignTemplate(exact), exact);
  assert.equal(isCampaignTemplateReady(exact), true);
  assert.equal(isCampaignTemplateReady(exact, true), true);
  assert.equal(renderCampaignPreview('Для {company_name}; {unknown}', 'Clinic One'), 'Для Clinic One; {unknown}');
  assert.equal(
    renderCampaignPreview('  {company_name}\n{company_name}  ', 'Cliníc 👩‍💻'),
    '  Cliníc 👩‍💻\nCliníc 👩‍💻  ',
  );
  assert.equal(isCampaignTemplateReady('left\r\nright'), false);
  assert.equal(boundCampaignTemplate('left\r\nright'), 'left\nright');
});

test('campaign image preflight accepts one bounded static photo and keeps storage identity opaque', () => {
  assert.equal(validateCampaignImage({ name: 'mockup.jpg', type: 'image/jpeg', size: LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES }), null);
  assert.equal(validateCampaignImage({ name: 'mockup.png', type: 'image/png', size: 0 }), 'empty');
  assert.equal(validateCampaignImage({ name: 'mockup.gif', type: 'image/gif', size: 100 }), 'unsupported_type');
  assert.equal(validateCampaignImage({ name: 'mockup.webp', type: 'image/webp', size: LEAD_RADAR_CAMPAIGN_IMAGE_MAX_BYTES + 1 }), 'too_large');
  assert.equal(validateCampaignImageDimensions(2_000, 2_000), null);
  assert.equal(validateCampaignImageDimensions(2_001, 2_000), 'invalid_dimensions');
  assert.equal(validateCampaignImageDimensions(5_000, 5_000), 'invalid_dimensions');
  assert.equal(validateCampaignImageDimensions(5_001, 5_000), 'invalid_dimensions');
  assert.equal(validateCampaignImageDimensions(2_100, 100), 'invalid_dimensions');
  assert.equal(validateCampaignImageDimensions(2_000, 100), null);

  const apng = new Uint8Array(20);
  apng.set(new TextEncoder().encode('acTL'), 12);
  const animatedWebp = new Uint8Array(20);
  animatedWebp.set(new TextEncoder().encode('ANIM'), 12);
  assert.equal(hasCampaignImageAnimationMarker(apng, 'image/png'), true);
  assert.equal(hasCampaignImageAnimationMarker(animatedWebp, 'image/webp'), true);
  assert.equal(hasCampaignImageAnimationMarker(new TextEncoder().encode('static image'), 'image/jpeg'), false);
  assert.equal(isValidCampaignMediaUpload({
    mediaId: `lrtgcm_${'a'.repeat(32)}`,
    mediaDigest: 'b'.repeat(64),
    filename: 'mockup.webp',
    mimeType: 'image/webp',
    sizeBytes: 45_000,
  }), true);
  assert.equal(isValidCampaignMediaUpload({
    mediaId: 'https://public.example/mockup.webp',
    mediaDigest: 'b'.repeat(64),
    filename: 'mockup.webp',
    mimeType: 'image/webp',
    sizeBytes: 45_000,
  }), false);
});

test('campaign image UX is explicit, accessible and binds the opaque media to both review steps', () => {
  const component = readFileSync(path.join(ROOT, 'src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx'), 'utf8');
  const api = readFileSync(path.join(ROOT, 'src/admin/lib/api.ts'), 'utf8');

  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(component, /onDragOver=/);
  assert.match(component, /onDrop=/);
  assert.match(component, /Загрузить изображение/);
  assert.match(component, /до этого файл не покидает устройство/);
  assert.match(component, /alt=\{`Предпросмотр изображения/);
  assert.match(component, /Заменить/);
  assert.match(component, /Удалить/);
  assert.match(component, /role="progressbar" aria-label="Загрузка изображения"/);
  assert.match(component, /attachment: attachmentReference/g);
  assert.equal(component.match(/attachment: attachmentReference/g)?.length, 2);
  assert.match(component, /previousMedia[\s\S]{0,900}leadRadarDeleteTelegramCampaignImage\(previousMedia\.mediaId\)/);
  assert.match(component, /mediaUploadAbortController\.current\?\.abort\(\)/);
  assert.match(component, /uploadSequence !== mediaUploadSequence\.current/);
  assert.match(component, /currentSearchId\.current !== uploadSearchId/);
  assert.match(component, /currentSearchId\.current !== removalSearchId/);
  assert.match(component, /removalSequence !== mediaUploadSequence\.current/);
  assert.match(component, /leadRadarDeleteTelegramCampaignImage\(next\.mediaId\)/);
  assert.match(component, /whitespace-pre-wrap break-words/);
  assert.match(component, /Markdown и HTML не интерпретируются/);
  assert.match(component, /imagePreviewUrl \? 'подпись к фото' : 'обычный текст'/);
  assert.match(component, /Точный предпросмотр подписи и ориентировочный предпросмотр изображения/);
  assert.match(component, /Текст ниже — точная подпись\. Изображение показано ориентировочно/);
  assert.match(component, /Telegram может дополнительно его сжать/);
  assert.match(component, /already_contacted/);
  assert.match(component, /previous_delivery_uncertain/);
  for (const readinessBlocker of [
    'tenant_not_allowed',
    'feature_disabled',
    'campaign_data_key_missing',
    'campaign_data_key_mismatch',
    'legacy_binding_required',
    'gateway_binding_missing',
    'gateway_unavailable',
    'gateway_credentials_missing',
    'gateway_account_keys_missing',
    'gateway_routing_key_mismatch',
    'gateway_routing_legacy_unbound',
    'gateway_account_session_missing',
    'gateway_storage_missing',
    'gateway_runtime_config_invalid',
    'gateway_internal_token_missing',
    'bridge_transport_mode_invalid',
    'bridge_not_paired',
    'bridge_offline',
    'bridge_revocation_pending',
  ]) {
    assert.match(component, new RegExp(`${readinessBlocker}:`), readinessBlocker);
  }
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);

  assert.match(api, /new XMLHttpRequest\(\)/);
  assert.match(api, /xhr\.upload\.addEventListener\('progress'/);
  assert.match(api, /signal\?\.addEventListener\('abort', abortFromSignal/);
  assert.match(api, /signal\?\.removeEventListener\('abort', abortFromSignal\)/);
  assert.match(api, /xhr\.setRequestHeader\('Content-Type', file\.type\)/);
  assert.match(api, /xhr\.send\(file\)/);
  assert.doesNotMatch(api, /form\.append\('image'/);
});

test('disabled Telegram connection renders exact server readiness blockers without promising a QR', () => {
  const cases = [
    ['gateway_credentials_missing', 'не переданы Telegram API ID'],
    ['gateway_storage_missing', 'Локальное защищённое хранилище'],
    ['gateway_binding_missing', 'не связан с бесплатным Telegram-шлюзом'],
    ['feature_disabled', 'выключено серверным переключателем'],
    ['campaign_data_key_mismatch', 'не совпадает с ключом'],
    ['legacy_binding_required', 'создан до проверки ключа'],
    ['gateway_routing_key_mismatch', 'Ключ маршрутизации Telegram изменился'],
    ['gateway_routing_legacy_unbound', 'до появления проверки ключа маршрутизации'],
    ['gateway_account_session_missing', 'не нашёл защищённую сессию'],
    ['gateway_internal_token_missing', 'не настроена внутренняя подпись'],
    ['bridge_transport_mode_invalid', 'требуется local_bridge'],
    ['bridge_not_paired', 'ещё не привязан'],
    ['bridge_offline', 'не отвечает'],
    ['bridge_revocation_pending', 'подтверждает локальное удаление'],
  ] as const;
  for (const [blocker, expectedCopy] of cases) {
    const markup = renderToStaticMarkup(React.createElement(TelegramAccountCampaignPanel, {
      searchId: 'search-readiness',
      leads: [],
      initialTemplate: 'Здравствуйте, {company_name}!',
      telegramAccountEnabled: false,
      telegramAccountReadiness: { status: 'blocked', blockers: [blocker] },
      campaignOutreachEnabled: false,
      campaignAutoSendEnabled: false,
      telegramCampaignDailyLimit: 30,
      telegramCampaignMinimumIntervalSeconds: 120,
    }));
    assert.match(markup, new RegExp(expectedCopy), blocker);
    assert.match(markup, /Что нужно настроить/, blocker);
    assert.doesNotMatch(markup, /Показать QR подключения|Готовим QR/, blocker);
  }

  const page = readFileSync(path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
  assert.match(page, /telegramAccountReadiness = capabilities\.telegramAccountReadiness/);
  assert.match(page, /telegramAccountReadiness=\{telegramAccountReadiness\}/);
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
      orgId: 'owner_8ee98dc3040f160b308166b0',
      bridgeCommandId: `lrtgbc_${'2'.repeat(32)}`,
      deviceId: `lrtgbd_${'1'.repeat(32)}`,
      qrEnvelope: null,
      passwordCommandId: null,
      bridgeEncryptionKey: null,
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

test('found-company draft shortcut keeps missing Telegram visible but never includes DNC', () => {
  const automatic = makeLead({ id: 'lead-auto' });
  const missing = makeLead({ id: 'lead-missing', telegramContact: null, telegramUrl: null });
  const unsupported = makeLead({ id: 'lead-channel', telegramContact: makeTelegramContact({ type: 'channel' }) });
  const suppressed = makeLead({ id: 'lead-dnc', suppressed: true });
  assert.deepEqual(campaignDraftCandidateLeadIds([
    automatic, missing, unsupported, suppressed, { ...missing },
  ]), ['lead-auto', 'lead-missing', 'lead-channel']);
  assert.deepEqual(automaticCampaignLeadIds([automatic, missing, unsupported, suppressed]), ['lead-auto']);
});

test('Telegram account quick action maps every blocking and reconnectable state explicitly', () => {
  assert.equal(telegramAccountQuickAction(null, false), 'blocked_feature');
  assert.equal(telegramAccountQuickAction('unconfigured', true), 'blocked_unconfigured');
  assert.equal(telegramAccountQuickAction('restricted', true), 'blocked_restricted');
  assert.equal(telegramAccountQuickAction(null, true), 'blocked_unknown');
  for (const status of ['disconnected', 'error', 'revoked', 'reauth_required'] as const) {
    assert.equal(telegramAccountQuickAction(status, true), 'connect', status);
  }
  for (const status of ['pending', 'connecting', 'connected', 'paused'] as const) {
    assert.equal(telegramAccountQuickAction(status, true), 'inspect', status);
  }
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
  const bridgeProtocol = readFileSync(path.join(ROOT, 'src/shared/lead-radar-telegram-bridge.ts'), 'utf8');
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
  assert.match(page, /capabilities\.telegramCampaignDailyLimit/);
  assert.match(page, /capabilities\.telegramCampaignMinimumIntervalSeconds/);

  assert.match(api, /telegram-account\/connect/);
  assert.match(api, /telegram-account\/bridge\/pairings/);
  assert.match(api, /leadRadarTelegramBridgeStatus/);
  assert.match(api, /leadRadarRevokeTelegramBridge[\s\S]{0,360}telegram-account\/bridge[\s\S]{0,220}Idempotency-Key/);
  assert.match(api, /telegram-account\/connect\/\$\{encodeURIComponent\(authId\)\}/);
  assert.match(api, /leadRadarConnectTelegramAccount[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_CONNECT_START_TIMEOUT_MS/);
  const connectStartTimeout = api.match(/LEAD_RADAR_TELEGRAM_CONNECT_START_TIMEOUT_MS = ([\d_]+)/u);
  const bridgePollSeconds = bridgeProtocol.match(/LEAD_RADAR_TELEGRAM_BRIDGE_POLL_SECONDS = ([\d_]+)/u);
  assert.ok(connectStartTimeout && bridgePollSeconds);
  assert.ok(
    Number(connectStartTimeout[1].replaceAll('_', ''))
      > Number(bridgePollSeconds[1].replaceAll('_', '')) * 1_000 + 10_000,
    'browser connection start timeout must exceed one Bridge poll plus a cold-start margin',
  );
  assert.match(api, /leadRadarTelegramAccount: \(\)[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_ACCOUNT_STATUS_TIMEOUT_MS/);
  assert.match(api, /leadRadarTelegramAccountConnectStatus[\s\S]{0,360}timeoutMs: LEAD_RADAR_TELEGRAM_ACCOUNT_STATUS_TIMEOUT_MS/);
  assert.match(api, /leadRadarSubmitTelegramAccountPassword[\s\S]{0,520}connect\/\$\{encodeURIComponent\(authId\)\}\/password/);
  assert.match(component, /account\?\.authState === 'awaiting_password'/);
  assert.match(component, /encryptTelegramBridgePassword\([\s\S]{0,500}leadRadarSubmitTelegramAccountPassword\(authId, \{/);
  assert.match(component, /Отвязать Bridge/);
  assert.match(component, /Подтвердить отвязку/);
  assert.match(component, /canRevokeBridge[\s\S]{0,240}accountStatus === 'disconnected'[\s\S]{0,120}accountStatus === 'revoked'/);
  assert.match(component, /leadRadarRevokeTelegramBridge\(deviceId, requestKey\)/);
  assert.doesNotMatch(api, /leadRadarSubmitTelegramAccountPassword[\s\S]{0,260}\{ password \}/);
  assert.match(api, /leadRadarSubmitTelegramAccountPassword[\s\S]{0,300}passwordEnvelope/);
  assert.match(component, /type="password"[\s\S]{0,180}autoComplete="off"[\s\S]{0,120}autoCapitalize="none"[\s\S]{0,120}spellCheck=\{false\}/);
  assert.match(component, /aria-errormessage=\{error \? errorId : undefined\}/);
  assert.match(component, /role="alert" aria-live="assertive"/);
  assert.ok((component.match(/setPassword\(''\)/gu) ?? []).length >= 3);
  assert.match(component, /key=\{account\.qr\.authId\}/);
  assert.match(component, /пароль не сохранён/);
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
  assert.match(component, /остаются заблокированы до отдельного разрешения/);
  assert.match(component, /<fieldset disabled=\{operationBusy \|\| !campaignRecoveryReady \|\| Boolean\(campaign\)\}/);
  assert.doesNotMatch(component, /<fieldset disabled=\{!campaignEnabled/);
  assert.match(component, /Контур отправки ещё не активирован/);
  assert.match(component, /const next = await api\.leadRadarTelegramAccount\(\)/);
  assert.match(component, /account\?\.qr\?\.authId/);
  assert.match(component, /leadRadarTelegramAccountConnectStatus\(authId\)/);
  assert.match(component, /refreshConnectionStatus[\s\S]{0,500}leadRadarTelegramAccountConnectStatus\(authId\)/);
  assert.match(component, /onClick=\{\(\) => \{ void refreshConnectionStatus\(\); \}\}[\s\S]{0,300}Я отсканировал — проверить/);
  assert.match(component, /account\?\.qr\?\.expiresAt, account\?\.status/);
  assert.match(component, /Введите номер Telegram/);
  assert.match(component, /Получить код/);
  assert.match(component, /Подтвердить код/);
  assert.match(component, /href="tg:\/\/resolve\?domain=Telegram"[\s\S]{0,420}Открыть Telegram за кодом/);
  assert.match(component, /encryptTelegramBridgeAuthInput\(\{/);
  assert.match(component, /leadRadarSubmitTelegramAccountAuthInput/);
  assert.match(component, /decryptTelegramBridgeQrEnvelope\([\s\S]{0,500}setDecryptedQr\(qr\)/);
  assert.match(component, /safeTelegramLoginUrl\(decryptedQr\?\.qrLoginUrl\)/);
  assert.match(component, /<img src=\{safeQr\} alt="QR-код/);
  assert.match(component, /leadRadarConnectTelegramAccount\(requestKey\)/);
  assert.match(component, /const requestKey = `lead-radar-account-connect-ui-\$\{crypto\.randomUUID\(\)\}`/);
  assert.doesNotMatch(component, /const requestKey = connectRequestKey\.current\s*\?\?/);
  assert.match(component, /catch \(connectError\)[\s\S]{0,420}const recovered = await loadAccount\(\)[\s\S]{0,260}Запрос подключения принят/);
  assert.match(component, /createTelegramBridgeEnrollmentCode\(\)/);
  assert.match(component, /telegramBridgeEnrollmentUri\(\{/);
  assert.match(component, /leadRadarCreateTelegramBridgePairing/);
  assert.match(component, /leadRadarTelegramBridgeStatus\(\)/);
  assert.match(component, /href=\{bridgePairing\.enrollmentUri\}/);
  assert.match(component, /value=\{bridgePairing\.enrollmentCode\}/);
  assert.match(component, /Секретный код не передаётся через ссылку или командную строку Windows/);
  assert.match(component, /Привязать этот компьютер/);
  assert.match(component, /Bridge не в сети/);
  assert.match(component, /Удаляем сессию/);
  assert.match(component, /href=\{safeQrLoginUrl\} target="_blank" rel="noreferrer"/);
  assert.match(component, /Открыть в Telegram на этом устройстве/);
  assert.match(component, /automaticLeadIds\.slice\(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT\)/);
  assert.match(component, /Быстрые действия Telegram-кампании/);
  assert.match(component, /Подключите отдельный Telegram-аккаунт/);
  assert.match(component, /Подключить Telegram/);
  assert.match(component, /Переподключить Telegram/);
  assert.match(component, /Перейти к форме входа/);
  assert.match(component, /Готовим форму номера/);
  assert.match(component, /Показать аккаунт на паузе/);
  assert.match(component, /Сначала настройте Telegram-шлюз/);
  assert.match(component, /Аккаунт ограничен Telegram/);
  assert.match(component, /disabled=\{accountQuickActionBusy\}/);
  assert.match(component, /aria-controls=\{accountQuickActionBlocked \? accountSetupNoticeId : undefined\}/);
  assert.match(component, /aria-expanded=\{accountQuickActionBlocked \? accountSetupNoticeVisible : undefined\}/);
  assert.match(component, /if \(accountQuickActionBlocked\) explainBlockedAccountAction\(\)/);
  assert.match(component, /запрос подключения не выполнялся, ничего не отправлено/);
  assert.match(component, /Добавить все найденные/);
  assert.match(component, /Выбрать готовых/);
  assert.match(component, /Снять весь выбор/);
  assert.match(component, /campaignDraftCandidateLeadIds\(leads\)/);
  assert.match(component, /automaticLeadIds\.slice\(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT\)/);
  assert.match(component, /Сводка найденных компаний/);
  assert.match(component, /\{uniqueFoundLeadCount\}[\s\S]{0,300}\{telegramLeadCount\}[\s\S]{0,300}\{automaticLeadCount\}/);
  assert.match(component, /Записи «Не связываться» не попадают даже в черновик/);
  assert.match(component, /исключаются сервером до отправки/);
  assert.match(component, /selectedLeadIds\.size > 0 && localSummary\.automatic === 0[\s\S]{0,220}Сначала найдите подтверждённый Telegram хотя бы у одной выбранной компании/);
  assert.match(component, /disabled=\{!campaignOutreachEnabled[\s\S]{0,300}localSummary\.automatic === 0/);
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
