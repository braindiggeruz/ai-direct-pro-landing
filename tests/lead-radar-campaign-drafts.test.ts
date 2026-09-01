import assert from 'node:assert/strict';
import test from 'node:test';
import { readCampaignBasisDraft, readCampaignTemplateDraft, saveCampaignBasisDraft, saveCampaignTemplateDraft } from '../src/admin/lib/campaign-template-draft';

test('drafts are isolated by audience, retain intentional empty text and ignore expired data', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    saveCampaignTemplateDraft('legacy draft');
    assert.equal(readCampaignTemplateDraft('aud_dental'), null, 'never import another scope implicitly');
    saveCampaignTemplateDraft('Dental offer', 'aud_dental');
    saveCampaignTemplateDraft('Salon offer', 'aud_salon');
    assert.equal(readCampaignTemplateDraft('aud_dental'), 'Dental offer');
    assert.equal(readCampaignTemplateDraft('aud_salon'), 'Salon offer');
    saveCampaignBasisDraft('aud_dental', 'inbound_request');
    assert.equal(readCampaignBasisDraft('aud_dental'), 'inbound_request');
    assert.equal(readCampaignBasisDraft('aud_salon'), '');
    saveCampaignBasisDraft('aud_dental', 'public_contact');
    assert.equal(readCampaignBasisDraft('aud_dental'), '');
    saveCampaignTemplateDraft('', 'aud_dental');
    assert.equal(readCampaignTemplateDraft('aud_dental'), '');
    for (const key of values.keys()) values.set(key, JSON.stringify({ template: 'expired', expiresAt: 1 }));
    assert.equal(readCampaignTemplateDraft('aud_salon'), null);
  } finally { Reflect.deleteProperty(globalThis, 'sessionStorage'); }
});
