import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audienceFailureMessage, saveAudienceWithRecovery } from '../src/admin/lib/audience-save';

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
