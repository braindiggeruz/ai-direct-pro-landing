// Entirely synthetic fixture. Every network fallback is forbidden; no live contacts or sends.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TelegramAccountCampaignPanel } from '../../src/admin/components/lead-radar/TelegramAccountCampaignPanel';
import { api } from '../../src/admin/lib/api';
import type { LeadRadarLead } from '../../src/shared/lead-radar';
import type { LeadRadarCampaignRecipientAuthorization } from '../../src/admin/lib/lead-radar-campaign';
import '../../src/index.css';

const stamp = new Date().toISOString();
const auth: LeadRadarCampaignRecipientAuthorization = { basis: 'documented_consent', evidenceVersion: 'b'.repeat(64),
  verifiedAt: stamp, expiresAt: new Date(Date.now() + 86400_000).toISOString(), reviewer: 'owner_verified' };
const leads = [1, 2].map((i) => ({ id: `fixture_${i}`, searchId: 'fixture_search', name: `Тестовая клиника ${i}`, category: 'dentist', city: 'Ташкент', country: 'UZ', address: null,
  website: `https://clinic${i}.example`, phone: null, genericEmail: null, telegramUrl: `https://t.me/fixture_clinic_${i}`,
  telegramContact: { url: `https://t.me/fixture_clinic_${i}`, username: `fixture_clinic_${i}`, type: 'business', confidence: .95,
    reason: 'bridge_resolved_corporate', evidenceIds: [], verifiedAt: stamp, messageable: false },
  contactCandidates: [{ key: `candidate_${i}`, kind: 'telegram', value: `@fixture_clinic_${i}`, phoneType: null, ownership: 'company',
    lookupEligible: true, reason: 'corporate_telegram_candidate', sourceUrl: `https://clinic${i}.example`, evidenceIds: [], observedAt: stamp }],
  decisionMakers: [], enrichmentStatus: 'terminal', enrichmentReason: 'no_relevant_evidence', enrichmentAttempts: 1, score: 60, confidence: .95,
  priority: 'P3', lifecycle: 'new', suppressed: false, scoreComponents: [], signals: [], evidence: [], discoveredAt: stamp, lastVerifiedAt: stamp })) as LeadRadarLead[];
api.leadRadarTelegramAccount = async () => ({ status: 'connected', connectionId: 'fixture_account', displayName: 'Тестовый аккаунт', username: 'fixture_sender',
  phoneMasked: null, connectedAt: stamp, lastHealthAt: stamp, qr: null, reasonCode: null, identityVerifiedAt: stamp,
  readiness: { status: 'ready', blockers: [] } });
api.leadRadarTelegramBridgeStatus = async () => ({ status: 'online', deviceId: 'fixture_device', label: 'Тестовый Bridge', version: '1.5.0', lastSeenAt: stamp });
api.leadRadarTelegramCampaignRecovery = async () => ({ active: null, latest: null });
api.leadRadarResolveContact = async (_search, companyId) => ({ status: 'resolved', username: companyId === 'fixture_1' ? 'fixture_clinic_1' : 'fixture_clinic_2', reason: 'regular_user', retryAfterSeconds: null });
api.leadRadarCampaignPreflight = async (ids, basis) => ({ checkedAt: new Date().toISOString(), blockers: [],
  limits: { dailyLimit: 30, remainingToday: 30, minimumIntervalSeconds: 120, nextDispatchAt: null },
  selection: { selected: ids.length, automatic: basis ? ids.filter((id) => id === 'fixture_1').length : 0,
    manual: ids.filter((id) => id !== 'fixture_1' || !basis).length, excluded: 0,
    automaticCompanyIds: basis && ids.includes('fixture_1') ? ['fixture_1'] : [],
    items: ids.map((id) => ({ companyId: id, name: leads.find((lead) => lead.id === id)!.name,
      classification: id === 'fixture_1' && basis ? 'automatic' : 'manual', reasonCode: id === 'fixture_1' && basis ? 'verified_corporate_authorized' : 'documented_basis_required',
      authorization: id === 'fixture_1' && basis ? auth : null })) } });
const media = { mediaId: `lrtgcm_${'a'.repeat(32)}`, mediaDigest: 'b'.repeat(64), filename: 'fixture.png', mimeType: 'image/png', sizeBytes: 68 };
api.leadRadarUploadTelegramCampaignImage = async (file) => {
  media.sizeBytes = file.size;
  sessionStorage.setItem('fixture-media-size', String(file.size));
  sessionStorage.setItem('fixture-media-ready-at', String(Date.now() + 35_000));
  return { ...media, validation: { status: 'pending', reason: 'media_validation_pending', retryAfterSeconds: 3 } };
};
api.leadRadarCheckTelegramCampaignImage = async () => ({ ...media, sizeBytes: Number(sessionStorage.getItem('fixture-media-size')) || media.sizeBytes, validation: Date.now() >= Number(sessionStorage.getItem('fixture-media-ready-at'))
  ? { status: 'valid' } : { status: 'pending', reason: 'media_validation_pending', retryAfterSeconds: 3 } });
api.leadRadarDeleteTelegramCampaignImage = async () => {};
api.leadRadarPrepareTelegramCampaign = async (input) => {
  const result = await api.leadRadarCampaignPreflight(input.leadIds, input.contactBasis);
  return { approvalToken: `lrtgca_${'a'.repeat(64)}`, expiresAt: new Date(Date.now() + 300_000).toISOString(), selectionDigest: 'c'.repeat(64), contentDigest: 'd'.repeat(64),
    selection: result.selection, previews: input.leadIds.map((leadId) => ({ leadId, companyName: 'Тестовая клиника', text: input.template })) };
};
window.fetch = async () => { throw new Error('Local fixture forbids network requests'); };
function injectImage() {
  const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
  const context = canvas.getContext('2d')!; context.fillStyle = '#20cbbb'; context.fillRect(0, 0, 100, 100);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'fixture.png', { type: 'image/png' }));
    const input = document.querySelector<HTMLInputElement>('input[type=file]');
    if (input) { input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
  }, 'image/png');
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="mx-auto max-w-7xl p-5">
  <p className="mb-3 text-amber-100">Локальный тест. Все компании вымышлены; реальная отправка запрещена.</p>
  <button className="min-h-12 rounded border border-white/30 px-4 mb-4" onClick={injectImage}>Подставить тестовый PNG</button>
  <TelegramAccountCampaignPanel searchId="fixture_search" leads={leads} initialSelectedLeadIds={leads.map((lead) => lead.id)}
    initialTemplate="Здравствуйте! Согласованный пример для {company_name}." telegramAccountEnabled campaignOutreachEnabled campaignAutoSendEnabled
    telegramCampaignDailyLimit={30} telegramCampaignMinimumIntervalSeconds={120} />
</main></React.StrictMode>);
