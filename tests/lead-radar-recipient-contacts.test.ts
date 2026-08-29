import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recipientContactChoices, verifiedTelegramContactChoices, verifiedTelegramLeadIds } from '../src/shared/lead-radar-recipient-contacts';
import type { RecipientContactInput } from '../src/shared/lead-radar-recipient-contacts';
import { validTelegramContactResolution } from '../src/shared/lead-radar-contact-resolution';

const base: RecipientContactInput = { phone: null, country: 'UZ', telegramContact: null, telegramUrl: null };
test('no-username result only accepts opaque handles and never exposes raw Telegram credentials',()=>{
  const result={status:'resolved',username:null,peerRef:`lrpeer:${'a'.repeat(32)}`,reason:'regular_user_resolved',retryAfterSeconds:null};
  assert.equal(validTelegramContactResolution(result),true);
  for(const altered of [{...result,peerRef:'123456'},{...result,status:'pending'},{...result,access_hash:123},{...result,peerRef:undefined}]) assert.equal(validTelegramContactResolution(altered),false);
});
test('mobile or username selection excludes fixed lines and does not require Telegram proof', () => {
  const mobile = recipientContactChoices({ ...base, phone: '+998 90 123 45 67' });
  assert.deepEqual(mobile.mobilePhones, ['+998901234567']); assert.equal(mobile.selectable, true);
  assert.deepEqual(mobile.usernames, []);
  assert.equal(recipientContactChoices({ ...base, phone: '+998 71 123 45 67' }).selectable, false);
  assert.equal(recipientContactChoices({ ...base, phone: 'not a number' }).selectable, false);
});
test('normalization dedupes usernames and phones without inventing Telegram accounts', () => {
  const result = recipientContactChoices({ ...base, phone: '+998901234567', telegramUrl: 'https://t.me/+998901234567', contactCandidates: [
    {key:'x',kind:'telegram',value:'https://t.me/DentalClinic',phoneType:null,ownership:'unconfirmed',lookupEligible:true,reason:'ownership_unconfirmed',sourceUrl:null,evidenceIds:[],observedAt:null},
  ] });
  assert.deepEqual(result.keys, ['username:dentalclinic', 'phone:+998901234567']);
});
test('suppression and known personal/bot/group contacts are not bulk selected', () => {
  assert.equal(recipientContactChoices({ ...base, phone:'+998901234567', suppressed:true }).selectable, false);
  assert.equal(recipientContactChoices({ ...base, telegramUrl:'https://t.me/dental_bot' }).selectable, false);
  for (const type of ['human','bot','group','channel'] as const) {
    const contact={username:'DentalClinic',url:'https://t.me/DentalClinic',type,confidence:1,reason:'fixture',evidenceIds:[],verifiedAt:'',messageable:false};
    assert.equal(recipientContactChoices({ ...base, telegramUrl:contact.url,telegramContact:contact }).selectable, false);
  }
});

test('strict Telegram choices require corporate Bridge proof and retain the exact checked source', () => {
  const publishedOnly = {username:'DentalClinic',url:'https://t.me/DentalClinic',type:'business' as const,confidence:1,
    reason:'official_site_proximity',evidenceIds:['ev-1'],verifiedAt:'2026-08-29T00:00:00.000Z',messageable:false};
  assert.equal(verifiedTelegramContactChoices({ ...base, telegramContact: publishedOnly, telegramUrl: publishedOnly.url }).selectable, false);
  const resolved = {...publishedOnly,reason:'bridge_resolved_corporate',sourceKey:'phone:+998901234567',peerRef:`lrpeer:${'a'.repeat(32)}`};
  const strict = verifiedTelegramContactChoices({ ...base, telegramContact: resolved, telegramUrl: resolved.url });
  assert.deepEqual(strict.mobilePhones,['+998901234567']);
  assert.deepEqual(strict.usernames,['dentalclinic']);
  assert.equal(strict.selectable,true);
  assert.deepEqual(verifiedTelegramLeadIds([
    {id:'published',...base,telegramContact:publishedOnly} as never,
    {id:'resolved',...base,telegramContact:resolved} as never,
    {id:'dnc',...base,telegramContact:resolved,suppressed:true} as never,
  ]),['resolved']);
});

test('strict Telegram choices reject malformed source keys and unsupported resolved contacts', () => {
  const resolved = {username:'',url:'',type:'business' as const,confidence:0.9,reason:'bridge_resolved_corporate',
    evidenceIds:['ev-1'],verifiedAt:'2026-08-29T00:00:00.000Z',messageable:false,sourceKey:'phone:+998711234567'};
  assert.equal(verifiedTelegramContactChoices({ ...base, telegramContact: resolved }).selectable,false);
  assert.equal(verifiedTelegramContactChoices({ ...base, telegramContact: {...resolved,peerRef:`lrpeer:${'a'.repeat(32)}`} }).selectable,true);
});
