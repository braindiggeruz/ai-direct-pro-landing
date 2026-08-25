import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  boundCampaignTemplate,
  classifyCampaignLeadLocally,
  isCampaignTemplateReady,
  isTelegramAccountQrExpired,
  LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT,
  renderCampaignPreview,
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

test('QR rendering accepts only a bounded PNG data URL', () => {
  assert.equal(safeTelegramQrDataUrl('data:image/png;base64,QUJDRA=='), 'data:image/png;base64,QUJDRA==');
  assert.equal(safeTelegramQrDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(safeTelegramQrDataUrl('https://example.test/qr.png'), null);
  assert.equal(safeTelegramQrDataUrl('data:image/png;base64,not valid'), null);
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

test('page and API encode split discovery capability and the exact campaign control plane', () => {
  const page = readFileSync(path.join(ROOT, 'src/admin/pages/LeadRadar.tsx'), 'utf8');
  const component = readFileSync(path.join(ROOT, 'src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx'), 'utf8');
  const api = readFileSync(path.join(ROOT, 'src/admin/lib/api.ts'), 'utf8');
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
  assert.match(api, /telegram-campaigns\/prepare[\s\S]{0,180}Idempotency-Key/);
  assert.match(api, /telegram-campaigns\/\$\{encodeURIComponent\(campaignId\)\}\/\$\{action\}/);
  assert.match(component, /accountId,[\s\S]{0,160}leadIds: \[\.\.\.selectedLeadIds\],[\s\S]{0,100}template,[\s\S]{0,100}approvalToken:/);
  assert.match(component, /contactBasis,/);
  assert.match(component, /Документированное согласие/);
  assert.match(component, /Компания сама запросила контакт/);
  assert.match(component, /Существующие деловые отношения/);
  assert.match(component, /Действующий договор/);
  assert.doesNotMatch(component, /value="public_contact"/);
  assert.match(component, /disabled=\{!campaignOutreachEnabled \|\| !connected \|\| !contactBasis/);
  assert.match(component, /action === 'start' \|\| action === 'resume'/);
  assert.match(component, /Создать кампанию без запуска/);
  assert.match(component, /if \(!campaignAutoSendEnabled\)[\s\S]{0,220}Кампания создана и остаётся без отправок/);
  assert.match(component, /campaign\.status === 'running'[\s\S]{0,260}transitionCampaign\('pause'\)/);
  assert.match(component, /transitionCampaign\('stop'\)/);
  assert.match(component, /Pause и Stop/);
  assert.match(component, /Кампании выключены/);
  assert.match(component, /fail-closed/);
  assert.match(component, /<fieldset disabled=\{operationBusy \|\| Boolean\(campaign\)\}/);
  assert.doesNotMatch(component, /<fieldset disabled=\{!campaignEnabled/);
  assert.match(component, /Контур отправки ещё не активирован/);
  assert.match(component, /const next = await api\.leadRadarTelegramAccount\(\)/);
  assert.match(component, /account\?\.qr\?\.authId/);
  assert.match(component, /leadRadarTelegramAccountConnectStatus\(authId\)/);
  assert.match(component, /account\?\.qr\?\.expiresAt, account\?\.status/);
  assert.match(component, /Создать новый QR/);
  assert.match(component, /selectableLeadIds\.slice\(0, LEAD_RADAR_CAMPAIGN_RECIPIENT_LIMIT\)/);
  assert.match(component, /disabled=\{accountBusy \|\| accountLoading\}/);
  assert.match(component, /\['connected', 'restricted', 'reauth_required', 'paused', 'error'\]\.includes\(account\.status\)/);
  assert.match(component, /aria-invalid=\{!isCampaignTemplateReady\(template\)\}/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="progressbar"/);
  assert.match(component, /min-h-12/);
  assert.match(component, /Итог неизвестен/);
  assert.match(component, /не повторяются автоматически/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|window\.open\(|setInterval\(/);
  assert.match(adminApp, /href="#admin-main-content"/);
  assert.match(adminApp, /<main id="admin-main-content"/);
  assert.doesNotMatch(page, /<main\b/);
});
