import assert from 'node:assert/strict';
import test from 'node:test';
import { describeCampaignFailure } from '../src/admin/lib/campaign-diagnostics';
import { runSelectedContactChecks, emptyContactCheckProgress, selectedContactCheckJobs } from '../src/admin/lib/campaign-contact-checks';
import { readCampaignMediaDraft, saveCampaignMediaDraft } from '../src/admin/lib/campaign-media-draft';
import type { LeadRadarLead } from '../src/shared/lead-radar';

test('diagnostics distinguish code/request id from untrusted raw messages', () => {
  const text = describeCampaignFailure({ status: 503, code: 'telegram_campaign_bridge_offline', requestId: 'request-123', message: 'secret' }, 'fallback');
  assert.match(text, /Bridge/); assert.match(text, /request-123/); assert.match(text, /HTTP 503/); assert.ok(!text.includes('secret'));
  assert.equal(describeCampaignFailure({ code: '<secret>', requestId: 'password body', status: 200 }, 'fallback'), 'fallback');
  assert.match(describeCampaignFailure({ name: 'AbortError' }, 'fallback'), /могла завершиться/);
});

test('batch checks respect progress, three-second spacing and provider wait without blind retry', async () => {
  let clock = 0; const calls: string[] = [];
  const jobs = ['done', 'a', 'b', 'c'].map((companyId) => ({ companyId, searchId: 's', candidateKeys: ['key'] }));
  const result = await runSelectedContactChecks({ jobs, progress: { ...emptyContactCheckProgress(), completed: ['done'] },
    cancelled: () => false, now: () => clock, wait: async (ms) => { assert.equal(ms, 3000); clock += ms; }, save: () => {},
    resolve: async (job) => { calls.push(job.companyId); return job.companyId === 'a'
      ? { status: 'resolved', username: 'clinic_test', reason: 'regular_user', retryAfterSeconds: null }
      : { status: 'limited', username: null, reason: 'flood_wait', retryAfterSeconds: 300 }; },
  });
  assert.deepEqual(calls, ['a', 'b']); assert.deepEqual(result.completed, ['done', 'a']);
  assert.deepEqual(result.resolved, ['a']); assert.equal(result.pausedUntil, 303_000);
  await runSelectedContactChecks({ jobs, progress: result, cancelled: () => false, now: () => clock,
    wait: async () => {}, save: () => {}, resolve: async () => { throw new Error('must respect cooldown'); } });
});

test('batch queue excludes DNC, personal/fixed phones and duplicates before any lookup', () => {
  const candidate = { key: 'mobile', kind: 'phone', ownership: 'company', lookupEligible: true };
  const leads = [{ id: 'a', searchId: 's', lifecycle: 'new', contactCandidates: [candidate,
    { ...candidate, key: 'fixed', lookupEligible: false }, { ...candidate, key: 'personal', ownership: 'personal' }] },
    { id: 'b', searchId: 's', lifecycle: 'do_not_contact', contactCandidates: [candidate] },
    { id: 'c', searchId: 's', lifecycle: 'new', suppressed: true, contactCandidates: [candidate] }] as unknown as LeadRadarLead[];
  assert.deepEqual(selectedContactCheckJobs(leads), [{ companyId: 'a', searchId: 's', candidateKeys: ['mobile'] }]);
  assert.deepEqual(selectedContactCheckJobs(leads, ['a']), []);
});

test('cancelled or offline checking does not mark unprocessed companies complete', async () => {
  const result = await runSelectedContactChecks({ jobs: [{ companyId: 'a', searchId: 's', candidateKeys: ['x'] }],
    progress: emptyContactCheckProgress(), cancelled: () => false, now: () => 100, wait: async () => {}, save: () => {},
    resolve: async () => ({ status: 'failed', reason: 'bridge_offline', username: null, retryAfterSeconds: null }) });
  assert.deepEqual(result.completed, []); assert.equal(result.reason, 'bridge_offline'); assert.equal(result.pausedUntil, 60_100);
});

test('media draft survives reload as opaque metadata and invalid metadata never makes media ready', () => {
  const items = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key),
  } });
  try {
    const media = { mediaId: `lrtgcm_${'a'.repeat(32)}`, mediaDigest: 'b'.repeat(64), filename: 'site.png', mimeType: 'image/png', sizeBytes: 80,
      validation: { status: 'pending' as const, reason: 'media_validation_pending' as const, retryAfterSeconds: 3 } };
    saveCampaignMediaDraft('scope', media); assert.deepEqual(readCampaignMediaDraft('scope'), media);
    assert.equal(readCampaignMediaDraft('another-scope'), null);
    saveCampaignMediaDraft('scope', null); assert.equal(readCampaignMediaDraft('scope'), null);
    items.set('lead-radar:media-draft:v1:scope', JSON.stringify({ expiresAt: Date.now() + 1000, media: { ...media, mediaDigest: 'forged' } }));
    assert.equal(readCampaignMediaDraft('scope'), null);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor); else Reflect.deleteProperty(globalThis, 'sessionStorage'); }
});
