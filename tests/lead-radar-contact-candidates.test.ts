import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLeadRadarPhone, extractLeadRadarPhones, parseLeadRadarTelegramLocator, type LeadRadarContactCandidate } from '../src/shared/lead-radar-contacts';
import { contactCandidatesForLead, mergeContactCandidates } from '../functions/platform/lead-radar/contact-candidates';
import { extractCompanyPageFacts } from '../functions/platform/lead-radar/sources';
import { officialDomainsFromListing, officialDomainSearchQuery } from '../functions/platform/lead-radar/official-domain-discovery';
import { extractOfficialSiteContacts } from '../functions/platform/lead-radar/sources';
import { publishedTelegramLocators } from '../functions/platform/lead-radar/telegram-locators';
import type { LeadRadarEvidence } from '../src/shared/lead-radar';
import { recipientContactChoices } from '../src/shared/lead-radar-recipient-contacts';

test('phone parsing memoization isolates countries, limits, caller mutations and current DNC', () => {
  const raw = '+998901234567';
  const expected = assessLeadRadarPhone(raw);
  const damaged = assessLeadRadarPhone(raw);
  damaged.e164 = 'changed'; damaged.mobileLookupCandidate = false;
  assert.deepEqual(assessLeadRadarPhone(raw), expected);
  const list = extractLeadRadarPhones(raw);
  list[0].e164 = 'changed'; list.push({ ...expected });
  assert.deepEqual(extractLeadRadarPhones(raw), [expected]);
  const pair = `${raw}, +998931234567`;
  assert.equal(extractLeadRadarPhones(pair, 'UZ', 1).length, 1);
  assert.equal(extractLeadRadarPhones(pair, 'UZ', 2).length, 2);
  assert.equal(extractLeadRadarPhones(raw, 'UZ', 0).length, 0);
  assert.equal(assessLeadRadarPhone('901234567', 'UZ').e164, raw);
  assert.notEqual(assessLeadRadarPhone('901234567', 'US').e164, raw);
  const lead = { phone: raw, country: 'UZ', telegramUrl: null, telegramContact: null };
  assert.equal(recipientContactChoices(lead).selectable, true);
  assert.equal(recipientContactChoices({ ...lead, suppressed: true }).selectable, false);
  assert.equal(recipientContactChoices({ ...lead, lifecycle: 'do_not_contact' }).selectable, false);
});

function mappedBusiness() {
  const sourceUrl='https://www.openstreetmap.org/node/123456';
  const evidence = [
    ['name','company.name','Example Clinic',0.82,'fact'],
    ['place','locations.coordinates','41.300000,69.200000',0.9,'fact'],
    ['category','company.category','dentist',0.78,'fact'],
    ['phone','company_contacts.phone','+998901234567',0.74,'company_data'],
  ].map(([id,fieldPath,value,confidence,classification]) => ({id,fieldPath,value,confidence,classification,
    sourceUrl,sourceType:'openstreetmap',observedAt:'2026-03-07T19:11:44.000Z'})) as LeadRadarEvidence[];
  return {name:'Example Clinic',address:null,phone:'+998901234567',country:'UZ',evidence,telegramContact:null,suppressed:false};
}

test('a mapped business mobile without a website enters checks, not automatic sending', () => {
  const candidates=contactCandidatesForLead(mappedBusiness());
  assert.equal(candidates[0].lookupEligible,true);
  assert.equal(candidates[0].ownership,'company');
  assert.equal(candidates[0].resolution,undefined);
  assert.deepEqual(candidates[0].evidenceIds.sort(),['category','name','phone','place']);
});

test('weaker duplicate enrichment cannot hide a proved mobile; personal evidence remains restrictive',()=>{
  const good=contactCandidatesForLead(mappedBusiness())[0];
  const weak={...good,ownership:'unconfirmed' as const,lookupEligible:false};
  for(const values of [[good,weak],[weak,good]])assert.deepEqual(mergeContactCandidates(values),[good]);
  const personal={...good,ownership:'personal' as const,lookupEligible:false};
  for(const values of [[good,personal],[personal,good]])assert.deepEqual(mergeContactCandidates(values),[personal]);
});

test('mapped phones require a coherent named business record, not a loose number or personal listing', () => {
  for (const mutate of [
    (lead:ReturnType<typeof mappedBusiness>)=>{lead.name='Another Clinic';},
    (lead:ReturnType<typeof mappedBusiness>)=>{lead.evidence=lead.evidence.filter(e=>e.id!=='place');},
    (lead:ReturnType<typeof mappedBusiness>)=>{lead.evidence.find(e=>e.id==='phone')!.sourceUrl='https://www.openstreetmap.org/node/999';},
    (lead:ReturnType<typeof mappedBusiness>)=>{lead.evidence.forEach(e=>{e.sourceUrl='https://openstreetmap.org.evil.test/node/123456';});},
    (lead:ReturnType<typeof mappedBusiness>)=>{lead.evidence.find(e=>e.id==='phone')!.classification='model_inference';},
    (lead:ReturnType<typeof mappedBusiness>)=>{lead.evidence.find(e=>e.id==='category')!.value='residential';},
  ]) {
    const lead=mappedBusiness();mutate(lead);
    assert.equal(contactCandidatesForLead(lead).some(c=>c.lookupEligible),false);
  }
});

test('published plain usernames and bare links are found without generating handles from names or emails', () => {
  const html = '<p>Записаться в Telegram: @clinic_booking</p><p>t.me/clinic_other</p>'
    + '<p>mail@not_telegram.test</p><script>const x="@hidden_handle"</script>'
    + '<span title="@attribute_handle">О нас</span><style>@media_foo {}</style>';
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example/'), html);
  assert.deepEqual(facts.telegramContacts.map((c) => c.username).sort(), ['clinic_booking', 'clinic_other']);
  assert.equal(facts.telegramContact?.username, 'clinic_booking');
  assert.equal(facts.telegramContact?.type, 'business');
  assert.equal(publishedTelegramLocators('Компания Clinic Without Telegram').length, 0);
});

test('corporate booking takes priority over a named person and an adjacent bot or channel', () => {
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example/'),
    '<script type="application/ld+json">{"@type":"Person","name":"Ivan Petrov","jobTitle":"Director","sameAs":"https://t.me/ivan_petrov"}</script>'
    + '<p>Канал: <a href="https://t.me/clinic_news">Новости</a></p>'
    + '<p>Записаться в Telegram: @clinic_booking</p>'
    + '<footer>Website by Agency: @agency_contact</footer>');
  assert.equal(facts.telegramContact?.username, 'clinic_booking');
  assert.equal(facts.telegramContacts.find((c) => c.username === 'clinic_news')?.type, 'channel');
  assert.equal(facts.telegramContacts.find((c) => c.username === 'agency_contact')?.type, 'unknown');
  assert.ok((facts.telegramContacts.find((c) => c.username === 'agency_contact')?.confidence ?? 1) < 0.8);
});

test('an extension and vendor footer never become mobile lookup targets', () => {
  const facts = extractCompanyPageFacts(new URL('https://clinic.uz/'), '<p>Клиника</p>' + ' '.repeat(300)
    + '<footer>Website by Agency <a href="tel:+998901234567">+998901234567</a></footer>', true);
  assert.equal(facts.phone, null);
  const contacts = contactCandidatesForLead({ ...facts, phone: '+998901234567 ext. 42', country: 'UZ', suppressed: false });
  assert.equal(contacts[0]?.reason, 'extension');
  assert.equal(contacts[0]?.lookupEligible, false);
});

test('an explicit Telegram lead-in labels only the immediately following icon, as on Smalto contacts', () => {
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example/contacts'),
    '<p><span style="font-size:12pt;">Если Вы не смогли дозвониться до нас, напишите нам в Telegram:</span></p>'
    + '<div style="left:35px;top:774px;"><a href="https://t.me/clinic_booking"><img alt="Telegram" src="/tg.svg" /></a>'
    + '<a href="https://t.me/second_unknown">Telegram</a></div>');
  assert.equal(facts.telegramContacts.find(c => c.username === 'clinic_booking')?.type, 'business');
  assert.equal(facts.telegramContacts.find(c => c.username === 'second_unknown')?.type, 'unknown');
  assert.ok(facts.telegramContacts.every(c => !c.messageable));
});

test('separate labels preserve negative types and do not leak across links, sections or generic CTAs', () => {
  for (const [prefix, body, expected] of [
    ['<p>Напишите нам в Telegram:</p>', 'Личный Telegram', 'human'],
    ['<p>Напишите нам в Telegram:</p>', 'Наш канал', 'channel'],
    ['<p>Напишите нам в Telegram:</p>', 'Наш Telegram бот', 'bot'],
    ['<p>Напишите нам в Telegram:</p>', 'Наша группа', 'group'],
    ['<p>Website by Agency — напишите нам в Telegram:</p>', 'Telegram', 'unknown'],
    ['<section><p>Напишите нам в Telegram:</p></section><section>', 'Telegram', 'unknown'],
    ['<p>Записаться на приём</p>', 'Telegram', 'unknown'],
    ['<p>Напишите нам в Telegram: <a href="https://t.me/another_clinic">Клиника</a></p>', 'Telegram', 'unknown'],
  ]) {
    const facts = extractOfficialSiteContacts(new URL('https://clinic.example/'),
      `${prefix}<div><a href="https://t.me/target_contact">${body}</a></div>`);
    assert.equal(facts.telegramContacts.find(c => c.username === 'target_contact')?.type, expected, prefix + body);
  }
});

test('directory website discovery requires the exact listing entity, not its footer', () => {
  const expected = { name: 'Example Clinic', phone: '+998711234567', city: 'Ташкент', address: null };
  const listing = (name: string, telephone: string) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Dentist', name, telephone, url: 'https://clinic.uz/ru/' })}</script><footer><a href="https://agency.uz/">Website</a></footer>`;
  assert.deepEqual(officialDomainsFromListing(listing(expected.name, expected.phone), expected), ['https://clinic.uz/ru/']);
  assert.deepEqual(officialDomainsFromListing(listing('Directory Support', expected.phone), expected), []);
  assert.deepEqual(officialDomainsFromListing(listing(expected.name, '+998901234567'), expected), []);
  assert.ok(officialDomainSearchQuery(expected).includes('+998711234567'));
});

test('phone classification separates mobile lookup from fixed, ambiguous and invalid numbers', () => {
  assert.equal(assessLeadRadarPhone('+998 90 123 45 67').type, 'mobile');
  assert.equal(assessLeadRadarPhone('998901234567').e164, '+998901234567');
  assert.equal(assessLeadRadarPhone('+998 71 123 45 67').type, 'fixed_line');
  for (const value of ['103', '1234567', '+998 71 123 45 67', '+1 415 555 2671', '+998901234567 ext. 12']) {
    assert.equal(assessLeadRadarPhone(value).mobileLookupCandidate, false, value);
  }
  assert.equal(assessLeadRadarPhone('+998901234567, +998901234568').e164, null);
});

test('extraction normalizes and deduplicates multiple corporate phone formats without approving Telegram', () => {
  const numbers = extractLeadRadarPhones('998 90 123 45 67; +998901234567; +998 71 123 45 67');
  assert.deepEqual(numbers.map((item) => item.e164), ['+998901234567', '+998711234567']);
  assert.equal(extractLeadRadarPhones('+998901234567 ext. 12')[0]?.mobileLookupCandidate, false);
});

test('ordinary OSM phone is retained but not promoted to a verified corporate Telegram', () => {
  const contacts = contactCandidatesForLead({ phone: '+998901234567', country: 'UZ', evidence: [], telegramContact: null, suppressed: false });
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].ownership, 'unconfirmed');
  assert.equal(contacts[0].lookupEligible, false);
});

test('Telegram phone/business links are not confused with invite links or share actions', () => {
  assert.equal(parseLeadRadarTelegramLocator('https://t.me/+998901234567')?.kind, 'phone');
  assert.equal(parseLeadRadarTelegramLocator('tg://resolve?domain=clinic_one')?.value, 'clinic_one');
  assert.equal(parseLeadRadarTelegramLocator('https://t.me/m/contact_AbC')?.kind, 'business_link');
  for (const value of ['https://t.me/+InviteHash', 'https://t.me/joinchat/token', 'https://t.me/share/url?url=x', 'https://t.me.evil.test/clinic_one']) {
    assert.equal(parseLeadRadarTelegramLocator(value), null);
  }
});

test('explicit company booking links remain candidates until Bridge resolution', () => {
  const facts = extractCompanyPageFacts(new URL('https://clinic.example/contacts'),
    '<h1>Запись на приём</h1><a href="https://t.me/m/Clinic_AbC">Напишите нам в Telegram</a>', true);
  const contacts = contactCandidatesForLead({ ...facts, country: 'UZ', suppressed: false });
  assert.equal(facts.telegramContact, null);
  assert.equal(contacts[0]?.lookupEligible, true);
  assert.equal(contacts[0]?.value, 'https://t.me/m/Clinic_AbC');
});

test('verified website retains multiple phones with fixed lines excluded only from lookup', () => {
  const facts = extractCompanyPageFacts(new URL('https://clinic.example/contacts'),
    '<h1>Clinic</h1><a href="tel:+998711234567">Office</a><a href="tel:+998901234567">Запись</a>', true);
  const contacts = contactCandidatesForLead({ ...facts, country: 'UZ', suppressed: false });
  assert.equal(contacts.length, 2);
  assert.equal(contacts.find((item) => item.phoneType === 'fixed_line')?.lookupEligible, false);
  assert.equal(contacts.find((item) => item.phoneType === 'mobile')?.lookupEligible, true);
  assert.equal(contacts.some((item) => item.resolution === 'resolved'), false);
  assert.deepEqual(contactCandidatesForLead({ ...facts, country: 'UZ', suppressed: true }), []);
});

function phoneCandidate(overrides: Partial<LeadRadarContactCandidate> = {}): LeadRadarContactCandidate {
  return {
    key: 'phone:+998901234567', kind: 'phone', value: '+998901234567', phoneType: 'mobile',
    ownership: 'company', lookupEligible: true, reason: 'mobile_unverified',
    sourceUrl: 'https://clinic.example', evidenceIds: ['e1'], observedAt: null,
    ...overrides,
  };
}

test('merge keeps the higher tier and never unions evidence across candidates', () => {
  const company = phoneCandidate();
  const unconfirmed = phoneCandidate({ ownership: 'unconfirmed', lookupEligible: false, evidenceIds: ['e2', 'e3'] });
  const merged = mergeContactCandidates([company, unconfirmed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].ownership, 'company');
  // Evidence ids must stay attached to the row that produced them: a candidate
  // referencing evidence absent from the lead is dropped by the capability check.
  assert.deepEqual(merged[0].evidenceIds, ['e1']);
});

test('merge breaks an equal-tier tie in favour of the better-evidenced phone', () => {
  const oneSource = phoneCandidate({ evidenceIds: ['e1'] });
  const twoSources = phoneCandidate({ evidenceIds: ['e2', 'e3'], sourceUrl: 'https://top.uz/company/x' });
  const forward = mergeContactCandidates([oneSource, twoSources]);
  assert.equal(forward.length, 1);
  assert.deepEqual(forward[0].evidenceIds, ['e2', 'e3']);

  // Order must not decide the winner.
  const backward = mergeContactCandidates([twoSources, oneSource]);
  assert.deepEqual(backward[0].evidenceIds, ['e2', 'e3']);
});

test('merge keeps distinct phone keys separate and bounded', () => {
  const rows = Array.from({ length: 60 }, (_unused, index) => phoneCandidate({
    key: `phone:+9989012345${String(index).padStart(2, '0')}`,
    value: `+9989012345${String(index).padStart(2, '0')}`,
  }));
  assert.equal(mergeContactCandidates(rows).length, 40);
});
