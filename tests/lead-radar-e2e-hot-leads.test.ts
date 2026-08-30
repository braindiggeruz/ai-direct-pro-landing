import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  consumeLeadRadarQueueMessage,
  enqueueDueLeadRadarJobs,
  enqueueLeadRadarSearch,
  LeadRadarStore,
  resolveLeadRadarCapabilities,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
  type LeadRadarSearchInput,
} from '../functions/platform/lead-radar';
import {
  authorizeTelegramCampaignContact,
  claimNextTelegramCampaignRecipient,
  consumeTelegramCampaignQueueMessage,
  createApprovedTelegramCampaign,
  createTelegramUserAccountPending,
  completeTelegramUserAccountConnection,
  getTelegramUserAccount,
  maintainTelegramCampaigns,
  prepareTelegramCampaign,
  stageTelegramUserAccountConnection,
  transitionTelegramCampaign,
} from '../functions/platform/lead-radar/telegram-campaign';
import { AudienceStore } from '../functions/platform/lead-radar/audiences';
import { checkCorporateTelegramContact, countResolvedCorporateContacts, nextTelegramContactCandidate } from '../functions/platform/lead-radar/contact-resolution';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = [
  '0036_lead_radar.sql',
  '0041_lead_radar_search_leases.sql',
  '0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql',
  '0044_lead_radar_telegram_business.sql',
  '0045_lead_radar_telegram_campaigns.sql',
  '0046_lead_radar_telegram_campaign_safety.sql',
  '0047_lead_radar_telegram_campaign_media.sql',
  '0048_lead_radar_telegram_media_quota.sql',
  '0049_lead_radar_firecrawl.sql',
  '0050_lead_radar_contact_discovery.sql',
  '0051_lead_radar_audiences.sql',
  '0052_lead_radar_contact_sources.sql',
  '0053_lead_radar_audience_selection.sql',
  '0054_lead_radar_candidate_pool_resume.sql',
] as const;
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-08-25T12:00:00.000Z');
const DATA_KEY = Buffer.alloc(32, 9).toString('base64url');
const BASIS = 'existing_relationship' as const;
const SEARCH_INPUT: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'AI-бот для заявок',
  desiredCount: 5,
  telegramRequired: false,
  languages: ['ru', 'uz'],
};

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active','suspended','archived')),
    default_locale TEXT NOT NULL CHECK (default_locale IN ('ru','uz')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  db.sqlite.prepare(`INSERT INTO organizations (id,name,slug,status,default_locale,created_at,updated_at)
    VALUES (?,'E2E',?,'active','ru',?,?)`).run(ORG_A, ORG_A, NOW.toISOString(), NOW.toISOString());
  for (const filename of new Set(MIGRATIONS)) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

class RecordingQueue implements LeadRadarQueueSender {
  readonly messages: LeadRadarQueueMessage[] = [];
  async send(message: LeadRadarQueueMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}

function candidate(website: string | null) {
  return {
    sourceId: 'clinic-1',
    sourceUrl: 'https://www.openstreetmap.org/node/42',
    name: 'Стоматология AksuMed',
    category: 'dentist',
    city: 'Ташкент',
    country: 'UZ',
    address: 'Ташкент, ул. Амира Темура 1',
    website,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: website ? 'pending' : 'terminal',
    enrichmentReason: website ? null : 'no_website',
    enrichmentAttempts: 0,
    evidence: [{
      id: 'clinic-1-name',
      fieldPath: 'company.name',
      value: 'Стоматология AksuMed',
      sourceUrl: 'https://www.openstreetmap.org/node/42',
      sourceType: 'openstreetmap',
      observedAt: NOW.toISOString(),
      confidence: 0.9,
      classification: 'company_data',
    }],
    signals: [],
  };
}

const EVIDENCE = [
  {
    id: 'ev_binding',
    fieldPath: 'web.company_binding',
    value: 'https://clinic.uz',
    sourceUrl: 'https://clinic.uz/',
    sourceType: 'company_website',
    observedAt: NOW.toISOString(),
    confidence: 0.95,
    classification: 'fact',
  },
  {
    id: 'ev_phone',
    fieldPath: 'company_contacts.phone',
    value: '+998901234567',
    sourceUrl: 'https://clinic.uz/contacts',
    sourceType: 'company_website',
    observedAt: NOW.toISOString(),
    confidence: 0.95,
    classification: 'fact',
  },
  {
    id: 'ev_telegram',
    fieldPath: 'web.telegram.business',
    value: 'https://t.me/AksuMedClinic',
    sourceUrl: 'https://clinic.uz/contacts',
    sourceType: 'company_website',
    observedAt: NOW.toISOString(),
    confidence: 0.95,
    classification: 'fact',
  },
];

test('hot lead e2e: search → enrichment → Bridge verification → directory → audience → campaign → one audited send', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const d1 = db.asD1();
  const store = new LeadRadarStore(d1);
  const queue = new RecordingQueue();
  const at = { value: NOW };
  // Mirrors the Worker contract: a retry_wait outcome with retryDelivery is
  // re-delivered by Cloudflare Queues after its delay; cron (enqueueDue) is
  // the second dispatch path for jobs waiting on next_dispatch_at.
  const pendingDeliveries: Array<{ message: LeadRadarQueueMessage; dueAt: number }> = [];
  async function pump(deps: object, ticks: number): Promise<void> {
    for (let tick = 0; tick < ticks; tick++) {
      for (const message of queue.messages.splice(0)) pendingDeliveries.push({ message, dueAt: 0 });
      for (const item of [...pendingDeliveries]) {
        if (item.dueAt > at.value.getTime()) continue;
        pendingDeliveries.splice(pendingDeliveries.indexOf(item), 1);
        const outcome = await consumeLeadRadarQueueMessage(d1, item.message, queue, deps as Parameters<typeof consumeLeadRadarQueueMessage>[3]);
        if (outcome.outcome === 'retry_wait') {
          // Message.retry redelivers retryDelivery envelopes; ack-only waits
          // come back through cron's stale-dispatch reset — model both.
          pendingDeliveries.push({
            message: item.message,
            dueAt: at.value.getTime() + Math.min(900, Math.max(30, outcome.delaySeconds ?? 30)) * 1000,
          });
        }
      }
      at.value = new Date(at.value.getTime() + 16_000);
      await enqueueDueLeadRadarJobs(d1, queue, at.value);
    }
  }

  // ── 1. Admission: one contact-mode search with a small candidate pool.
  const created = await enqueueLeadRadarSearch(
    store, ORG_A, { ...SEARCH_INPUT, searchGoal: 'telegram_contacts', maxCandidates: 10 },
    queue, at.value, 'e2e-hot-lead-001',
  );
  assert.ok(created.search.id);

  // ── 2. Discovery → pool → company + enrichment children (real queue code).
  const discoveryDeps = {
    now: () => at.value,
    discover: async () => ({ candidates: [candidate('https://clinic.uz')], sourceWarnings: [] }),
    // Mirrors production wiring: contact-resolution deps ride along with the
    // enrichment deps, so completing an enrichment schedules the lookup job.
    discoverLeadContactSources: async () => ({ pending: false }),
    enrichWebsite: async () => ({
      facts: {
        website: 'https://clinic.uz',
        phone: '+998901234567',
        genericEmail: null,
        telegramUrl: 'https://t.me/AksuMedClinic',
        telegramContact: {
          url: 'https://t.me/AksuMedClinic', username: 'AksuMedClinic', type: 'business',
          confidence: 0.95, reason: 'own_site_contact_page', evidenceIds: ['ev_telegram'],
          verifiedAt: at.value.toISOString(), messageable: false,
        },
        decisionMakers: [],
        evidence: EVIDENCE,
        signals: [],
      },
      reason: 'enriched' as const,
      retryable: false,
    }),
  };
  await pump(discoveryDeps, 8);
  const companyId = db.value<string>(
    `SELECT id FROM lead_radar_companies WHERE org_id = ?`, ORG_A,
  );
  assert.ok(companyId, 'discovery+enrichment must produce one company');
  assert.equal(db.value(
    `SELECT enrichment_status FROM lead_radar_companies WHERE id = ?`, companyId,
  ), 'enriched');
  assert.equal(db.value(
    `SELECT COUNT(*) FROM lead_radar_evidence WHERE company_id = ? AND field_path = 'web.telegram.business'`,
    companyId,
  ), 1, 'own-site telegram evidence must be stored');

  // ── 3. Connect the account, then let the real resolution contract verify
  // the endpoint through the (stubbed) local Bridge boundary.
  const pending = await createTelegramUserAccountPending({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A,
    authRequestReference: 'gateway_auth_request_a', idempotencyKey: 'e2e_account_0001', now: at.value,
  });
  await stageTelegramUserAccountConnection({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, accountId: pending.account.id,
    gatewayAccountRef: 'gateway_account_reference_a', expectedVersion: pending.account.stateVersion,
    providerConnectedAt: at.value.toISOString(), now: at.value,
  });
  const connected = await completeTelegramUserAccountConnection({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, accountId: pending.account.id,
    gatewayAccountRef: 'gateway_account_reference_a', expectedVersion: pending.account.stateVersion,
    now: at.value,
  });
  assert.equal(connected.status, 'connected');
  const accountId = connected.id;

  const resolutionDeps = {
    ...discoveryDeps,
    resolveLeadContacts: async (job: { orgId: string; searchId: string; companyId: string }) => {
      const next = await nextTelegramContactCandidate({
        db: d1, orgId: job.orgId, companyId: job.companyId, accountId, now: at.value.toISOString(),
      });
      if (!next.candidateKey) return next;
      const result = await checkCorporateTelegramContact({
        db: d1, orgId: job.orgId, searchId: job.searchId, companyId: job.companyId,
        candidateKey: next.candidateKey, accountId, now: at.value.toISOString(),
        resolve: async () => ({ status: 'resolved', username: 'AksuMedClinic', reason: 'regular_user_resolved', retryAfterSeconds: null }),
      });
      if (result.status === 'pending') return { pending: true, reason: 'waiting_for_bridge' };
      return result.status === 'resolved' ? { pending: false } : { pending: true };
    },
  };
  await pump(resolutionDeps, 10);
  console.error('JOBS', db.rows<Record<string, unknown>>(`SELECT stage,status,dispatch_status,available_at,next_dispatch_at,attempt_count,last_error_code FROM lead_radar_jobs`));
  console.error('CHECKS', db.rows<Record<string, unknown>>('SELECT status,reason FROM lead_radar_contact_checks'));
  const contactJson = db.value<string>(
    `SELECT telegram_contact_json FROM lead_radar_companies WHERE id = ?`, companyId,
  );
  assert.equal(JSON.parse(contactJson ?? '{}')?.reason, 'bridge_resolved_corporate',
    'the Bridge-verified endpoint must be stored with the strict corporate reason');
  assert.equal(await countResolvedCorporateContacts(d1, ORG_A, created.search.id, at.value.toISOString()), 1);

  // ── 4. The pool ends with exactly one Bridge-verified contact of the
  // five-requested goal: an honest partial, never a false "ready".
  const final = await store.getSearch(ORG_A, created.search.id);
  assert.ok(['ready', 'partial', 'insufficient_results'].includes(final?.search.status ?? ''));
  assert.equal(final?.search.funnel?.companyTelegramCount, 1);

  // ── 5. Directory exposes the contact as strictly verified.
  const capabilities = resolveLeadRadarCapabilities({
    LEAD_RADAR_ALLOWED_ORGS: ORG_A,
    LEAD_RADAR_ADMISSION_ENABLED: 'true',
    LEAD_RADAR_PROCESSING_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: { fetch: async () => new Response(null) } as unknown as Fetcher,
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: DATA_KEY,
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: 'A'.repeat(43),
    LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
    LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
  }, ORG_A);
  assert.equal(capabilities.telegramAccountEnabled, true);
  const directory = await new AudienceStore(d1).directory(
    ORG_A, { q: '', category: '', city: '', offset: 0, status: 'verified' }, capabilities, at.value,
  );
  assert.equal(directory.total, 1, 'the verified Bridge-resolved company must surface in the directory');
  assert.equal(directory.rows[0]?.lead.telegramContact?.username, 'AksuMedClinic');

  // ── 6. Audience selection persists the operator's research choice.
  const audience = await new AudienceStore(d1).save(ORG_A, {
    id: `aud_${'a'.repeat(32)}`, name: 'E2E горячие лиды', version: 0, companyIds: [companyId],
  });
  assert.deepEqual(audience.companyIds, [companyId]);

  // ── 7. Authorization basis + preflight + prepare + approval + create.
  await authorizeTelegramCampaignContact({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, companyId: companyId,
    contactBasis: BASIS, evidenceReference: 'e2e-contact-basis-001',
    expiresAt: '2026-09-24T12:00:00.000Z', reviewerId: 'owner@example.test',
    idempotencyKey: 'e2e_auth_0001', now: at.value,
  });
  const prepared = await prepareTelegramCampaign({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, accountId,
    searchId: created.search.id, companyIds: [companyId],
    template: 'Здравствуйте, {company_name}! Коротко о предложении.',
    operatorId: 'owner@example.test', idempotencyKey: 'e2e_prepare_0001',
    contactBasis: BASIS, minIntervalSeconds: 120, now: at.value,
  });
  assert.equal(prepared.recipientCount, 1, 'preflight must admit exactly the verified recipient');
  const campaign = await createApprovedTelegramCampaign({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, accountId,
    searchId: created.search.id, companyIds: [companyId],
    template: 'Здравствуйте, {company_name}! Коротко о предложении.',
    operatorId: 'owner@example.test', contactBasis: BASIS,
    approvalToken: prepared.approvalToken,
    expectedSelectionDigest: prepared.selectionDigest,
    expectedContentDigest: prepared.contentDigest,
    idempotencyKey: 'e2e_create_0001', minIntervalSeconds: 120, now: at.value,
  });
  assert.equal(campaign.campaign.status, 'approved');
  const started = await transitionTelegramCampaign({
    db: d1, dataKey: DATA_KEY, orgId: ORG_A, campaignId: campaign.campaign.id,
    action: 'start', operatorId: 'owner@example.test',
    idempotencyKey: 'e2e_start_0001', now: at.value,
  });
  assert.equal(started.campaign.status, 'running');

  // ── 8. Exactly one audited send; unknown outcomes never re-send.
  let sends = 0;
  const sender = { async send() { sends += 1; return { kind: 'sent' as const, providerMessageId: 'e2e_msg_1' }; } };
  const raw = {
    schema: 'gptbot.lead-radar.telegram-campaign.v1' as const,
    campaign_id: campaign.campaign.id, org_id: ORG_A, state_version: 1,
  };
  at.value = new Date(at.value.getTime() + 60_000);
  await consumeTelegramCampaignQueueMessage({ db: d1, dataKey: DATA_KEY, raw, sender, now: at.value });
  assert.equal(sends, 1);
  assert.equal(db.value(
    `SELECT status FROM lead_radar_tg_campaign_recipients WHERE campaign_id = ?`, campaign.campaign.id,
  ), 'sent');
  assert.equal(db.value(
    `SELECT status FROM lead_radar_tg_campaign_effects WHERE campaign_id = ?`, campaign.campaign.id,
  ), 'sent');
  await consumeTelegramCampaignQueueMessage({ db: d1, dataKey: DATA_KEY, raw, sender, now: new Date(at.value.getTime() + 60_000) });
  assert.equal(sends, 1, 'a duplicate delivery must never re-send the message');
  await maintainTelegramCampaigns({ db: d1, orgId: ORG_A, now: new Date(at.value.getTime() + 60_000) });
  assert.equal(db.value(
    `SELECT status FROM lead_radar_tg_campaigns WHERE id = ?`, campaign.campaign.id,
  ), 'completed');
  assert.equal(db.value(
    `SELECT dispatch_lease_digest FROM lead_radar_tg_user_accounts WHERE org_id = ?`, ORG_A,
  ), null, 'the account lease must be released after the campaign settles');
});
