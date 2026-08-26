import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { LeadRadarTelegramCampaignStore } from '../functions/platform/lead-radar/telegram-campaign-store';
import { SqliteD1 } from './helpers/sqlite-d1';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = '2026-08-26T12:00:00.000Z';
const EXPIRES = '2026-09-25T12:00:00.000Z';

function mediaId(seed: string): string {
  return `lrtgcm_${seed.repeat(32).slice(0, 32)}`;
}

function database(legacy?: { orgId: string; mediaId: string; digest: string }): SqliteD1 {
  const db = new SqliteD1();
  db.exec(`CREATE TABLE lead_radar_tg_media_objects (
    org_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    media_digest TEXT NOT NULL,
    status TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (org_id, media_id)
  );`);
  if (legacy) {
    db.sqlite.prepare(`INSERT INTO lead_radar_tg_media_objects (
      org_id, media_id, media_digest, status, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .run(legacy.orgId, legacy.mediaId, legacy.digest, EXPIRES, NOW, NOW);
  }
  db.exec(readFileSync(
    path.join(ROOT, 'migrations', '0048_lead_radar_telegram_media_quota.sql'),
    'utf8',
  ));
  return db;
}

test('migration charges unknown legacy objects at the maximum instead of undercounting R2', async () => {
  const legacyId = mediaId('f');
  const legacyDigest = '6'.repeat(64);
  const db = database({ orgId: ORG_A, mediaId: legacyId, digest: legacyDigest });
  const store = new LeadRadarTelegramCampaignStore(db);
  assert.deepEqual(await store.campaignMediaQuotaUsage(ORG_A), {
    objects: 1,
    bytes: 5_000_000,
  });
  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: mediaId('e'),
    mediaDigest: '7'.repeat(64),
    sizeBytes: 1,
    expiresAt: EXPIRES,
    now: NOW,
    maxObjects: 100,
    maxBytes: 5_000_000,
  }), 'quota_exceeded');
});

test('media quota reservation is atomic, bounded and tenant isolated', async () => {
  const db = database();
  const store = new LeadRadarTelegramCampaignStore(db);
  const reserve = (orgId: string, id: string, digest: string, bytes = 3_000_000) => (
    store.reserveCampaignMediaQuota(orgId, {
      mediaId: id,
      mediaDigest: digest,
      sizeBytes: bytes,
      expiresAt: EXPIRES,
      now: NOW,
      maxObjects: 2,
      maxBytes: 5_000_000,
    })
  );

  assert.equal(await reserve(ORG_A, mediaId('a'), '1'.repeat(64)), 'reserved');
  assert.equal(await reserve(ORG_A, mediaId('a'), '1'.repeat(64)), 'replayed');
  assert.equal(await reserve(ORG_A, mediaId('a'), '2'.repeat(64)), 'conflict');
  assert.equal(await reserve(ORG_A, mediaId('b'), '3'.repeat(64), 2_000_000), 'reserved');
  assert.equal(await reserve(ORG_A, mediaId('c'), '4'.repeat(64), 1), 'quota_exceeded');

  // The same physical allowance is calculated independently for another org.
  assert.equal(await reserve(ORG_B, mediaId('a'), '1'.repeat(64)), 'reserved');
  assert.deepEqual(await store.campaignMediaQuotaUsage(ORG_A), {
    objects: 2,
    bytes: 5_000_000,
  });
  assert.deepEqual(await store.campaignMediaQuotaUsage(ORG_B), {
    objects: 1,
    bytes: 3_000_000,
  });
});

test('physical deletion releases capacity but preserves an ABA tombstone', async () => {
  const db = database();
  const store = new LeadRadarTelegramCampaignStore(db);
  const id = mediaId('d');
  const digest = '5'.repeat(64);
  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: id,
    mediaDigest: digest,
    sizeBytes: 5_000_000,
    expiresAt: EXPIRES,
    now: NOW,
    maxObjects: 1,
    maxBytes: 5_000_000,
  }), 'reserved');
  assert.equal(await store.activateCampaignMediaQuota(ORG_A, {
    mediaId: id,
    mediaDigest: digest,
    sizeBytes: 5_000_000,
    now: NOW,
  }), true);
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_media_objects (
    org_id, media_id, media_digest, status, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'deleting', ?, ?, ?)`)
    .run(ORG_A, id, digest, EXPIRES, NOW, NOW);

  await store.completeCampaignMediaDeletion(ORG_A, id, NOW);
  assert.deepEqual(await store.campaignMediaQuotaUsage(ORG_A), { objects: 0, bytes: 0 });
  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: id,
    mediaDigest: digest,
    sizeBytes: 5_000_000,
    expiresAt: EXPIRES,
    now: NOW,
    maxObjects: 1,
    maxBytes: 5_000_000,
  }), 'conflict');
});

test('bounded orphan cleanup restores capacity only after an exclusive stale lease', async () => {
  const db = database();
  const store = new LeadRadarTelegramCampaignStore(db);
  const old = '2026-08-26T11:00:00.000Z';
  const before = '2026-08-26T11:45:00.000Z';
  const cleanupAt = NOW;

  for (let index = 0; index < 100; index += 1) {
    const nibble = index.toString(16).padStart(2, '0');
    assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
      mediaId: mediaId(nibble),
      mediaDigest: nibble.repeat(32),
      sizeBytes: 1,
      expiresAt: EXPIRES,
      now: old,
    }), 'reserved');
  }
  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: mediaId('a1'),
    mediaDigest: 'a'.repeat(64),
    sizeBytes: 1,
    expiresAt: EXPIRES,
    now: NOW,
  }), 'quota_exceeded');

  // Production performs one HEAD-confirmed cleanup per cron tick. Repeating
  // that bounded operation demonstrates transient failures cannot consume all
  // 100 slots forever, without excluding the reservation while it is checked.
  for (let index = 0; index < 100; index += 1) {
    const [candidate] = await store.listStaleCampaignMediaQuotaReservations(before, 99);
    assert.ok(candidate);
    assert.equal(await store.claimStaleCampaignMediaQuotaReservation({
      orgId: candidate.org_id,
      mediaId: candidate.media_id,
      observedUpdatedAt: candidate.updated_at,
      before,
      now: cleanupAt,
    }), true);
    assert.equal((await store.campaignMediaQuotaUsage(ORG_A)).objects, 100 - index);
    // This finalizer is called only after R2 HEAD returned null in the Worker.
    assert.equal(await store.completeStaleCampaignMediaQuotaRelease({
      orgId: candidate.org_id,
      mediaId: candidate.media_id,
      cleanupLeaseAt: cleanupAt,
    }), true);
  }
  assert.deepEqual(await store.campaignMediaQuotaUsage(ORG_A), { objects: 0, bytes: 0 });
});

test('retry heartbeat and registered object make orphan release fail closed', async () => {
  const db = database();
  const store = new LeadRadarTelegramCampaignStore(db);
  const retryId = mediaId('8');
  const protectedId = mediaId('9');
  const retryDigest = '8'.repeat(64);
  const protectedDigest = '9'.repeat(64);
  const old = '2026-08-26T11:00:00.000Z';
  const before = '2026-08-26T11:45:00.000Z';

  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: retryId,
    mediaDigest: retryDigest,
    sizeBytes: 10,
    expiresAt: EXPIRES,
    now: old,
  }), 'reserved');
  const [observed] = await store.listStaleCampaignMediaQuotaReservations(before, 1);
  assert.equal(observed?.media_id, retryId);
  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: retryId,
    mediaDigest: retryDigest,
    sizeBytes: 10,
    expiresAt: EXPIRES,
    now: NOW,
  }), 'replayed');
  assert.equal(await store.claimStaleCampaignMediaQuotaReservation({
    orgId: ORG_A,
    mediaId: retryId,
    observedUpdatedAt: observed!.updated_at,
    before,
    now: NOW,
  }), false);

  assert.equal(await store.reserveCampaignMediaQuota(ORG_A, {
    mediaId: protectedId,
    mediaDigest: protectedDigest,
    sizeBytes: 10,
    expiresAt: EXPIRES,
    now: old,
  }), 'reserved');
  assert.equal(await store.claimStaleCampaignMediaQuotaReservation({
    orgId: ORG_A,
    mediaId: protectedId,
    observedUpdatedAt: old,
    before,
    now: NOW,
  }), true);
  db.sqlite.prepare(`INSERT INTO lead_radar_tg_media_objects (
    org_id, media_id, media_digest, status, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
    .run(ORG_A, protectedId, protectedDigest, EXPIRES, NOW, NOW);
  assert.equal(await store.completeStaleCampaignMediaQuotaRelease({
    orgId: ORG_A,
    mediaId: protectedId,
    cleanupLeaseAt: NOW,
  }), false);
  await store.restoreCampaignMediaQuotaReservation(ORG_A, protectedId, NOW, NOW);
  assert.deepEqual(await store.campaignMediaQuotaUsage(ORG_A), {
    objects: 2,
    bytes: 20,
  });
});
