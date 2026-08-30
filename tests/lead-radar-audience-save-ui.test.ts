import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audienceFailureMessage, sameAudienceSelection, saveAudienceWithRecovery } from '../src/admin/lib/audience-save';
import { classifyRequestFailure, parseRetryAfter, requestFailureHint, withLeadRadarReadRecovery } from '../src/admin/lib/request-recovery';
import { readFileSync } from 'node:fs';

const input = { id: `aud_${'a'.repeat(32)}`, name: 'Dentists', version: 1, companyIds: ['b', 'a'] };
const saved = { ...input, companyIds: ['a', 'b'], version: 2, createdAt: '', updatedAt: '' };
const detail = { audience: saved, leads: [], missingCompanyIds: [] };

test('acknowledged audience write survives failed follow-up read', async () => {
  const result = await saveAudienceWithRecovery(input, { save: async () => saved, read: async () => { throw new Error('offline'); } });
  assert.equal(result.audience.version, 2);
  assert.equal(result.refreshPending, true);
  assert.equal(result.detail, null);
});
test('lost save response reconciles exact selection without sending a second write', async () => {
  let writes = 0;
  const result = await saveAudienceWithRecovery(input, { save: async () => { writes++; throw new Error('timeout'); }, read: async () => detail });
  assert.equal(result.recovered, true); assert.equal(writes, 1); assert.equal(result.detail, detail);
});
test('unknown save does not accept a different selection or a later revision', async () => {
  for (const audience of [{ ...saved, companyIds: ['other'] }, { ...saved, version: 4 }]) {
    await assert.rejects(saveAudienceWithRecovery(input, { save: async () => { throw new Error('timeout'); }, read: async () => ({ ...detail, audience }) }), /audience_save_unconfirmed/);
  }
});
test('explicit version conflict is not reclassified or automatically retried', async () => {
  const error = Object.assign(new Error('conflict'), { code: 'audience_version_conflict', status: 409 });
  await assert.rejects(saveAudienceWithRecovery(input, { save: async () => { throw error; }, read: async () => { throw new Error('must not read'); } }), (actual) => actual === error);
});
test('a newer read after successful write is not trusted as the approved selection', async () => {
  const result = await saveAudienceWithRecovery(input, { save: async () => saved, read: async () => ({ ...detail, audience: { ...saved, version: 3 } }) });
  assert.equal(result.refreshPending, true); assert.equal(result.audience.version, 2);
});
test('audience diagnostic exposes only bounded request identifiers, never raw errors', () => {
  assert.match(audienceFailureMessage({ code: 'audience_unavailable', requestId: 'req_123' }), /req_123/);
  assert.doesNotMatch(audienceFailureMessage({ message: 'secret', requestId: 'secret@example.invalid' }), /secret/);
});

test('manual reconciliation accepts only the exact audience name, IDs and expected revision', () => {
  assert.equal(sameAudienceSelection(saved, input), true);
  assert.equal(sameAudienceSelection({ ...saved, version: 1 }, input), true);
  for (const candidate of [{ ...saved, id: 'another' }, { ...saved, name: 'Changed' },
    { ...saved, companyIds: ['a'] }, { ...saved, version: 4 }]) {
    assert.equal(sameAudienceSelection(candidate, input), false);
  }
});

test('unknown save retains a safe cause and request ID without leaking raw exception', async () => {
  await assert.rejects(saveAudienceWithRecovery(input, {
    save: async () => { throw Object.assign(new TypeError('private secret'), { requestId: 'req_safe' }); },
    read: async () => { throw new Error('read also failed'); },
  }), (failure) => {
    const copy = audienceFailureMessage(failure);
    assert.match(copy, /LR-NETWORK/); assert.match(copy, /req_safe/);
    assert.doesNotMatch(copy, /private secret|read also failed/); return true;
  });
});

test('diagnostics distinguish timeout, cancellation, malformed response and HTTP status', () => {
  assert.match(requestFailureHint({ name: 'AbortError' }), /LR-TIMEOUT/);
  assert.equal(classifyRequestFailure({ code: 'audience_unavailable' }, true).code, 'request_cancelled');
  assert.match(requestFailureHint(new SyntaxError('private response')), /LR-RESPONSE/);
  assert.match(requestFailureHint({ code: 'audience_unavailable', status: 503 }), /HTTP 503/);
  assert.doesNotMatch(requestFailureHint({ status: 'secret', requestId: 'secret@example.invalid' }), /secret/);
});

test('numeric and HTTP-date Retry-After are preserved, including unrecognised explicit backoff', () => {
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter('90'), 90);
  assert.equal(parseRetryAfter('Sun, 30 Aug 2026 16:01:00 GMT', Date.parse('2026-08-30T16:00:00Z')), 60);
  assert.equal(parseRetryAfter('invalid'), 0);
});

test('transient directory reads retry once without extending their original deadline', async () => {
  let clock = 0; let calls = 0; const budgets: Array<number|undefined> = [];
  const result = await withLeadRadarReadRecovery(async (budget) => {
    budgets.push(budget); calls++; if (calls === 1) { clock += 400; throw new TypeError('network'); } return 'ok';
  }, { method: 'GET', path: '/api/admin/lead-radar/telegram-contacts?offset=0', timeoutMs: 15000,
    now: () => clock, wait: async (ms) => { clock += ms; } });
  assert.equal(result, 'ok'); assert.equal(calls, 2); assert.deepEqual(budgets, [15000, 14100]);
});

test('read retries are bounded and never replay writes, contact checks, auth failures or cooldowns', async () => {
  for (const [method, path, failure] of [
    ['POST', '/api/admin/lead-radar/audiences/aud_test', new TypeError('network')],
    ['GET', '/api/admin/lead-radar/telegram-account', new TypeError('network')],
    ['GET', '/api/admin/lead-radar/audiences', { status: 401, code: 'UNAUTHENTICATED' }],
    ['GET', '/api/admin/lead-radar/audiences', { status: 429, retryAfterSeconds: 60 }],
    ['GET', '/api/admin/lead-radar/audiences', { status: 503, retryAfterSeconds: 900 }],
    ['GET', '/api/admin/lead-radar/audiences', { status: 409 }],
    ['GET', '/api/admin/lead-radar/audiences', { name: 'AbortError' }],
    ['GET', '/api/admin/lead-radar/audiences', new SyntaxError('html')],
  ] as const) {
    let calls = 0;
    await assert.rejects(withLeadRadarReadRecovery(async () => { calls++; throw failure; }, {
      method, path, wait: async () => { throw new Error('must not wait'); },
    })); assert.equal(calls, 1, `${method} ${path}`);
  }
  let calls = 0;
  await assert.rejects(withLeadRadarReadRecovery(async () => { calls++; throw new TypeError('network'); }, {
    method: 'GET', path: '/api/admin/lead-radar/audiences/aud_test', wait: async () => {},
  })); assert.equal(calls, 2);
});

test('cancellation and elapsed deadline prevent a second read', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(withLeadRadarReadRecovery(async () => { calls++; throw new TypeError('network'); }, {
    method: 'GET', path: '/api/admin/lead-radar', signal: controller.signal,
    wait: async () => { controller.abort(); },
  }), (error: {code?: string}) => error.code === 'request_cancelled');
  assert.equal(calls, 1);
  let clock = 0; calls = 0;
  await assert.rejects(withLeadRadarReadRecovery(async () => { calls++; clock = 15000; throw new TypeError('network'); }, {
    method: 'GET', path: '/api/admin/lead-radar', timeoutMs: 15000, now: () => clock,
    wait: async () => { throw new Error('must not wait'); },
  })); assert.equal(calls, 1);
});

test('unrelated account reads and writes preserve their original error contracts', async () => {
  for (const [method, path] of [['GET', '/api/admin/lead-radar/telegram-account'],
    ['POST', '/api/admin/lead-radar/audiences/aud_test']]) {
    const failure = Object.assign(new Error('body_aborted'), { name: 'AbortError', retryable: false });
    await assert.rejects(withLeadRadarReadRecovery(async () => { throw failure; }, { method, path }),
      (error) => error === failure);
  }
});

test('directory sync issues are separate from real campaign capability and empty results', () => {
  const directory = readFileSync(new URL('../src/admin/components/lead-radar/TelegramContactDirectory.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/admin/components/lead-radar/TelegramAccountCampaignPanel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(directory, /campaignOutreachEnabled=\{campaignProps\.campaignOutreachEnabled &&/);
  assert.match(directory, /sameAudienceSelection\(next\.audience,pending\)/);
  assert.match(directory, /!directoryError && rows\.length===0/);
  assert.match(panel, /const createReady = Boolean\(\s*campaignOutreachEnabled\s*&& !audienceSyncIssue/);
  assert.match(panel, /if \(!campaignOutreachEnabled \|\| audienceSyncIssue/);
});
