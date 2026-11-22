import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { LeadRadarEvidence } from '../src/shared/lead-radar';
import { contactCheckTtlMs, nextTelegramContactCandidate } from '../functions/platform/lead-radar/contact-resolution';
import { contactCandidatesForLead } from '../functions/platform/lead-radar/contact-candidates';
import { resolveOutreachContact } from '../functions/platform/lead-radar/outreach-account';
import { readTelegramHandleVerdicts, writeTelegramHandleVerdict } from '../functions/platform/lead-radar/telegram-handle-store';
import { resetTelegramCanaryCache } from '../functions/platform/lead-radar/telegram-handle-check';
import { TG_SENDER_SCHEMA } from '../functions/platform/lead-radar/tg-sender-contract';
import type { Env } from '../functions/_types';
import { SqliteD1 } from './helpers/sqlite-d1';

/**
 * Owner audit 22.11.2026: lookups must not loop on dead results, must not be
 * spent on phones TG Sender cannot resolve or on handles already known to be a
 * bot, a channel or a group, and the kind TG Sender reports must be kept.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = '2026-11-22T12:00:00.000Z';
const fixture = (name: string) => readFileSync(path.join(ROOT, 'tests', 'fixtures', 'lead-radar-tme', `${name}.html`), 'utf8');

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, default_locale TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  db.sqlite.prepare(`INSERT INTO organizations VALUES (?, ?, ?, 'active', 'ru', ?, ?)`).run(ORG, ORG, ORG, NOW, NOW);
  for (const filename of ['0036_lead_radar.sql', '0041_lead_radar_search_leases.sql', '0042_lead_radar_decision_makers.sql',
    '0043_lead_radar_async_funnel.sql', '0044_lead_radar_telegram_business.sql', '0045_lead_radar_telegram_campaigns.sql',
    '0050_lead_radar_contact_discovery.sql', '0054_lead_radar_candidate_pool_resume.sql']) {
    db.exec(readFileSync(path.join(ROOT, 'migrations', filename), 'utf8'));
    db.sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(filename);
  }
  return db;
}

/** One OSM business with a company mobile and an unverified Telegram handle. */
function seedCompany(db: SqliteD1, handle: string) {
  db.sqlite.prepare(`INSERT INTO lead_radar_searches (id, org_id, input_json, status, created_at) VALUES ('s1', ?, '{}', 'running', ?)`).run(ORG, NOW);
  db.sqlite.prepare(`INSERT INTO lead_radar_companies (
    id, org_id, search_id, canonical_key, name, category, city, country, phone, score, confidence, priority,
    score_components_json, signals_json, discovered_at, last_verified_at, updated_at, enrichment_status
  ) VALUES ('c1', ?, 's1', 'osm:node:7', 'Smile Dent', 'dentist', 'Ташкент', 'UZ', '+998901234567', 60, 0.8, 'P1', '[]', '[]', ?, ?, ?, 'terminal')`)
    .run(ORG, NOW, NOW, NOW);
  const evidence = (id: string, fieldPath: string, value: string, confidence: number) => db.sqlite.prepare(`INSERT INTO lead_radar_evidence
    (id, org_id, company_id, field_path, value, source_url, source_type, observed_at, confidence, classification)
    VALUES (?, ?, 'c1', ?, ?, 'https://www.openstreetmap.org/node/7', 'openstreetmap', ?, ?, 'company_data')`)
    .run(id, ORG, fieldPath, value, NOW, confidence);
  evidence('e_phone', 'company_contacts.phone', '+998901234567', 0.74);
  evidence('e_tg', 'web.telegram.unknown', `https://t.me/${handle}`, 0.4);
}

function tmeFetch(pages: Record<string, string>, calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const handle = String(input).replace('https://t.me/', '');
    calls.push(handle);
    return pages[handle] ? new Response(pages[handle]) : new Response('', { status: 404 });
  }) as typeof fetch;
}

// ── TTL policy ──────────────────────────────────────────────────────────────

test('dead results stand long enough not to loop; short hiccups keep their quick retry', () => {
  const r = (status: 'failed' | 'unsupported' | 'unresolved' | 'resolved' | 'limited', reason: string, retryAfterSeconds: number | null = null) =>
    ({ status, username: status === 'resolved' ? 'smile_dent' : null, reason, retryAfterSeconds });
  assert.equal(contactCheckTtlMs(r('failed', 'telegram_timeout')), 60_000);
  assert.equal(contactCheckTtlMs(r('failed', 'bridge_offline')), 60_000);
  assert.equal(contactCheckTtlMs(r('failed', 'tg_sender_unavailable'), 1), 60_000);
  assert.equal(contactCheckTtlMs(r('failed', 'tg_sender_unavailable'), 2), 5 * 60_000);
  assert.equal(contactCheckTtlMs(r('failed', 'tg_sender_unavailable'), 3), 15 * 60_000);
  assert.equal(contactCheckTtlMs(r('failed', 'tg_sender_unavailable'), 9), 2 * 3600_000);
  assert.equal(contactCheckTtlMs(r('failed', 'invalid_username')), 30 * 86400_000);
  assert.equal(contactCheckTtlMs(r('unsupported', 'not_regular_user')), 30 * 86400_000);
  assert.equal(contactCheckTtlMs(r('unresolved', 'username_not_occupied')), 7 * 86400_000);
  assert.equal(contactCheckTtlMs(r('resolved', 'telegram_user_resolved')), 86400_000, 'a positive proof stays one day');
  assert.equal(contactCheckTtlMs(r('limited', 'sender_cooldown', 900)), 900_000);
});

// ── TG Sender kind is kept ──────────────────────────────────────────────────

test('TG Sender bot, channel and group answers become a durable unsupported result and a cached verdict', async () => {
  const binding = { org_id: ORG, account_id: `lrtgua_${'a'.repeat(32)}`, account_ref: 'test_gateway_ref_0001', sender_fingerprint: 'b'.repeat(64) };
  const answer = (kind: string, status = 'blocked', reason: string | null = 'not_user', retry: number | null = null) => ({
    schema: TG_SENDER_SCHEMA, binding, username: 'smile_dent', status, kind, peer_ref: null, verified_at: null, expires_at: null,
    reason_code: reason, retry_after_seconds: retry,
  });
  let next: unknown = answer('bot');
  const env = {
    LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'tg_sender',
    LEAD_RADAR_TG_SENDER_ORIGIN: 'https://tg-sender-v2.braindigger-uz.workers.dev',
    LEAD_RADAR_TG_SENDER_TOKEN: 't'.repeat(48),
    LEAD_RADAR_TG_SENDER_BINDING_JSON: JSON.stringify(binding),
    LEAD_RADAR_TG_SENDER_SERVICE: { fetch: async () => Response.json(next) },
  } as unknown as Env;
  const db = database();
  for (const kind of ['bot', 'channel', 'group'] as const) {
    next = answer(kind);
    const result = await resolveOutreachContact(env, ORG, { kind: 'username', value: 'smile_dent' }, db.asD1());
    assert.deepEqual(result, { status: 'unsupported', username: null, reason: 'not_regular_user', retryAfterSeconds: null });
    assert.equal((await readTelegramHandleVerdicts(db.asD1(), ['smile_dent'])).get('smile_dent'), kind);
  }
  next = answer('unknown', 'blocked', 'sender_cooldown', 900);
  assert.equal((await resolveOutreachContact(env, ORG, { kind: 'username', value: 'smile_dent' }, db.asD1())).status, 'limited',
    'a cooldown is not a verdict');
  assert.deepEqual(await resolveOutreachContact(env, ORG, { kind: 'phone', value: '+998901234567' }, db.asD1()),
    { status: 'unsupported', username: null, reason: 'public_username_required', retryAfterSeconds: null });
});

// ── Lookup eligibility ──────────────────────────────────────────────────────

test('a bot-suffix handle or a ?start= deep link never spends an account lookup', () => {
  const evidence = (value: string): LeadRadarEvidence => ({
    id: `e_${value.length}`, fieldPath: 'web.telegram.unknown', value, sourceUrl: 'https://www.openstreetmap.org/node/7',
    sourceType: 'openstreetmap', observedAt: NOW, confidence: 0.5, classification: 'model_inference',
  });
  const eligible = (value: string) => contactCandidatesForLead({
    name: 'Smile Dent', address: null, phone: null, country: 'UZ', suppressed: false, telegramContact: null, evidence: [evidence(value)],
  }).find((candidate) => candidate.kind === 'telegram')?.lookupEligible;
  assert.equal(eligible('https://t.me/smile_dent_uz'), true);
  assert.equal(eligible('https://t.me/SmileDentBot'), false);
  assert.equal(eligible('https://t.me/smile_booking?start=site'), false);
});

test('in TG Sender mode the queue offers usernames only, skips known bots and checks unknown handles for free first', async () => {
  const db = database();
  seedCompany(db, 'smile_dent_uz');
  const base = { db: db.asD1(), orgId: ORG, companyId: 'c1', accountId: 'acct_1', now: NOW };

  const legacy = await nextTelegramContactCandidate(base);
  assert.ok(legacy.candidateKey, 'legacy bridge mode still offers a candidate');
  const usernameOnly = await nextTelegramContactCandidate({ ...base, usernameOnly: true });
  assert.equal(usernameOnly.candidateKey, 'telegram:https://t.me/smile_dent_uz');

  // A free public check that finds a group skips the handle without a lookup.
  resetTelegramCanaryCache();
  const calls: string[] = [];
  const skipped = await nextTelegramContactCandidate({
    ...base, usernameOnly: true, publicCheckFetch: tmeFetch({ telegram: fixture('channel'), smile_dent_uz: fixture('group') }, calls),
  });
  assert.deepEqual(calls, ['telegram', 'smile_dent_uz'], 'canary first, then the handle');
  assert.equal(skipped.candidateKey, undefined);
  assert.equal(skipped.pending, false);
  assert.equal((await readTelegramHandleVerdicts(db.asD1(), ['smile_dent_uz'], new Date(NOW))).get('smile_dent_uz'), 'group');
});

test('a public "dead username" page does not gate the account lookup; bot, channel and group do', async () => {
  const db = database();
  seedCompany(db, 'smile_dent_uz');
  const base = { db: db.asD1(), orgId: ORG, companyId: 'c1', accountId: 'acct_1', now: NOW, usernameOnly: true };
  await writeTelegramHandleVerdict(db.asD1(), 'smile_dent_uz', 'not_found', 'public_card', new Date(NOW));
  assert.equal((await nextTelegramContactCandidate(base)).candidateKey, 'telegram:https://t.me/smile_dent_uz');
  await writeTelegramHandleVerdict(db.asD1(), 'smile_dent_uz', 'channel', 'public_card', new Date(NOW));
  assert.equal((await nextTelegramContactCandidate(base)).candidateKey, undefined);
});

test('when the canary page does not look like Telegram, no verdict is written', async () => {
  resetTelegramCanaryCache();
  const db = database();
  seedCompany(db, 'smile_dent_uz');
  const calls: string[] = [];
  const next = await nextTelegramContactCandidate({
    db: db.asD1(), orgId: ORG, companyId: 'c1', accountId: 'acct_1', now: NOW, usernameOnly: true,
    publicCheckFetch: tmeFetch({ telegram: '<html><body>blocked</body></html>', smile_dent_uz: fixture('dead') }, calls),
  });
  assert.deepEqual(calls, ['telegram']);
  assert.equal(next.candidateKey, 'telegram:https://t.me/smile_dent_uz', 'falls back to the account lookup');
  assert.equal((await readTelegramHandleVerdicts(db.asD1(), ['smile_dent_uz'], new Date(NOW))).size, 0);
});
