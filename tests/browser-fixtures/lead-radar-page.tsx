// Full-page regression fixture. No live API, Telegram, Firecrawl or sending.
import React from 'react';
import { createRoot } from 'react-dom/client';
import LeadRadarPage from '../../src/admin/pages/LeadRadar';
import { api } from '../../src/admin/lib/api';
import type { LeadRadarApiCapabilities, LeadRadarLead, LeadRadarSearchSummary } from '../../src/shared/lead-radar';
import type { LeadRadarAudience } from '../../src/shared/lead-radar-audiences';
import '../../src/index.css';

const stamp = new Date().toISOString();
const capabilities: LeadRadarApiCapabilities = { admissionEnabled: true, processingEnabled: true, contactEnabled: false,
  telegramDiscoveryEnabled: true, personalContactsEnabled: false, individualOutreachEnabled: false,
  telegramAccountEnabled: true, telegramAccountReadiness: { status: 'ready', blockers: [] },
  campaignOutreachEnabled: true, campaignAutoSendEnabled: true, telegramCampaignDailyLimit: 30,
  telegramCampaignMinimumIntervalSeconds: 120, mode: 'research' };
const leads: LeadRadarLead[] = [1, 2].map((i) => ({ id: `test_company_${i}`, searchId: 'test_search', name: `Синтетическая клиника ${i}`,
  category: 'dentist', city: 'Ташкент', country: 'UZ', address: null, website: `https://fixture${i}.example`,
  phone: i === 1 ? '+998901234567' : null, telegramUrl: i === 2 ? 'https://t.me/fixture_clinic_two' : null,
  genericEmail: null, telegramContact: null, contactCandidates: [], decisionMakers: [], enrichmentStatus: 'terminal',
  enrichmentReason: 'no_relevant_evidence', enrichmentAttempts: 1, score: 60, confidence: .9, priority: 'P3', lifecycle: 'new',
  suppressed: false, scoreComponents: [], signals: [], evidence: [], discoveredAt: stamp, lastVerifiedAt: stamp }));
const search: LeadRadarSearchSummary = { id: 'test_search', input: { niche: 'Тест стоматологии', city: 'Ташкент', country: 'UZ',
  offer: 'Согласованный тестовый сайт', desiredCount: 2, telegramRequired: true, languages: ['ru'] }, status: 'ready',
  candidateCount: 2, verifiedCount: 2, p1Count: 0, p2Count: 0, p3Count: 2, telegramCount: 1,
  errorCode: null, phase: 'completed', warnings: [], createdAt: stamp, completedAt: stamp,
  funnel: { rawDiscoveredCount: 2, candidateCount: 2, processedCount: 2, pendingCount: 0, websiteCount: 2,
    enrichedCount: 2, decisionMakerCount: 0, companyTelegramCount: 1, personalTelegramCount: 0, excludedCount: 0 } };
api.leadRadarOverview = async () => ({ capabilities, searches: [search], sourceHealth: [],
  totals: { searches: 1, leads: 2, p1: 0, telegram: 1, replies: 0, qualified: 0 } });
api.leadRadarSearchResult = async () => ({ search, leads, capabilities });
api.leadRadarTelegramAccount = async () => ({ status: 'connected', connectionId: 'test_account', displayName: 'Тестовый отправитель',
  username: 'fixture_sender', phoneMasked: null, connectedAt: stamp, lastHealthAt: stamp, qr: null, reasonCode: null,
  identityVerifiedAt: stamp, readiness: { status: 'ready', blockers: [] } });
api.leadRadarTelegramBridgeStatus = async () => ({ status: 'online', deviceId: 'test_device', label: 'Тестовый Bridge', version: '1.5.0', lastSeenAt: stamp });
api.leadRadarTelegramCampaignRecovery = async () => ({ active: null, latest: null });
api.leadRadarCampaignPreflight = async (ids) => ({ checkedAt: stamp, blockers: [],
  limits: { dailyLimit: 30, remainingToday: 30, minimumIntervalSeconds: 120, nextDispatchAt: null },
  selection: { selected: ids.length, automatic: 0, manual: ids.length, excluded: 0, automaticCompanyIds: [],
    items: ids.map((id) => ({ companyId: id, name: leads.find((lead) => lead.id === id)!.name,
      classification: 'manual', reasonCode: 'documented_basis_required', authorization: null })) } });
const storageKey = 'lead-radar-full-page-synthetic-audiences';
const read = (): LeadRadarAudience[] => JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
api.leadRadarAudiences = async () => ({ audiences: read() });
api.leadRadarContactDirectory = async () => ({ rows: leads.map((lead) => ({ key: lead.id, status: 'review', occurrences: 1, lead,
  sources: [{ companyId: lead.id, searchId: search.id, name: lead.name, category: lead.category, city: lead.city }] })), total: 2, offset: 0, limit: 20 });
api.leadRadarSaveAudience = async (input) => {
  const saved = { ...input, version: input.version + 1, createdAt: stamp, updatedAt: stamp };
  sessionStorage.setItem(storageKey, JSON.stringify([saved, ...read().filter((item) => item.id !== saved.id)]));
  return saved;
};
api.leadRadarAudience = async (id) => {
  const audience = read().find((item) => item.id === id)!;
  return { audience, leads: leads.filter((lead) => audience.companyIds.includes(lead.id)), missingCompanyIds: [] };
};
window.fetch = async () => { throw new Error('Synthetic full-page test forbids all network requests'); };
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="mx-auto max-w-7xl p-5">
  <p className="mb-3 text-amber-100">Локальная проверка всей страницы. Контакты вымышлены, настоящая отправка невозможна.</p>
  <LeadRadarPage />
</main></React.StrictMode>);
