import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recipientContactChoices } from '../src/shared/lead-radar-recipient-contacts';
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
