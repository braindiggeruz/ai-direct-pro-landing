import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLeadRadarPhone, extractLeadRadarPhones, parseLeadRadarTelegramLocator } from '../src/shared/lead-radar-contacts';
import { contactCandidatesForLead } from '../functions/platform/lead-radar/contact-candidates';
import { extractCompanyPageFacts } from '../functions/platform/lead-radar/sources';
import { officialDomainsFromListing, officialDomainSearchQuery } from '../functions/platform/lead-radar/official-domain-discovery';

test('an extension and vendor footer never become mobile lookup targets', () => {
  const facts = extractCompanyPageFacts(new URL('https://clinic.uz/'), '<p>Клиника</p>' + ' '.repeat(300)
    + '<footer>Website by Agency <a href="tel:+998901234567">+998901234567</a></footer>', true);
  assert.equal(facts.phone, null);
  const contacts = contactCandidatesForLead({ ...facts, phone: '+998901234567 ext. 42', country: 'UZ', suppressed: false });
  assert.equal(contacts[0]?.reason, 'extension');
  assert.equal(contacts[0]?.lookupEligible, false);
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
