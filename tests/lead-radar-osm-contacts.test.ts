import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  candidateFromOsmElement,
  osmAdditionalPhones,
  osmTelegramLocators,
} from '../functions/platform/lead-radar/sources';

const INPUT: LeadRadarSearchInput = {
  niche: 'Стоматология',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'Автоматизация заявок',
  desiredCount: 20,
  telegramRequired: false,
  languages: ['ru', 'uz'],
};

function osm(tags: Record<string, string>) {
  return candidateFromOsmElement({ type: 'node', id: 4242, tags: { name: 'Smile Dent', amenity: 'dentist', ...tags } }, INPUT, 'Стоматология',
    '2026-11-22T00:00:00.000Z');
}

const phonesOf = (item: ReturnType<typeof osm>) => item!.evidence
  .filter((e) => e.fieldPath === 'company_contacts.phone').map((e) => e.value);
const telegramOf = (item: ReturnType<typeof osm>) => item!.evidence
  .filter((e) => e.fieldPath.startsWith('web.telegram.')).map((e) => e.value);

test('every number of a multi-value phone tag becomes evidence, the first stays the primary phone', () => {
  const item = osm({ phone: '+998 71 200-00-01; +998 90 123-45-67, +998 93 765 43 21' });
  assert.equal(item?.phone, '+998712000001', 'the stored primary phone is unchanged');
  assert.deepEqual(phonesOf(item), ['+998712000001', '+998901234567', '+998937654321']);
});

test('mobile and WhatsApp tags are read, and a mobile-only row gets a primary phone', () => {
  const mobileOnly = osm({ 'contact:mobile': '+998 90 111 22 33' });
  assert.equal(mobileOnly?.phone, '+998901112233');
  assert.deepEqual(phonesOf(mobileOnly), ['+998901112233']);

  const both = osm({ phone: '+998 71 200 00 01', 'contact:whatsapp': 'https://wa.me/998901234567', mobile: '+998901234567' });
  assert.deepEqual(phonesOf(both), ['+998712000001', '+998901234567'], 'one number seen twice is kept once');
});

test('osmAdditionalPhones skips the primary number and caps the list', () => {
  assert.deepEqual(osmAdditionalPhones({ phone: '+998901234567' }, '+998901234567', 'UZ'), []);
  const many = Array.from({ length: 10 }, (_, index) => `+99890${String(1000000 + index)}`).join(';');
  assert.equal(osmAdditionalPhones({ phone: many }, null, 'UZ').length, 6);
});

test('Telegram is read in every shape mappers use, from every Telegram tag', () => {
  assert.deepEqual(osmTelegramLocators({ telegram: 'smile_dent_uz' }), ['https://t.me/smile_dent_uz']);
  assert.deepEqual(osmTelegramLocators({ 'contact:telegram': '@smile_dent_uz' }), ['https://t.me/smile_dent_uz']);
  assert.deepEqual(osmTelegramLocators({ telegram: 't.me/smile_dent_uz' }), ['https://t.me/smile_dent_uz']);
  assert.deepEqual(osmTelegramLocators({ telegram: 'https://www.t.me/smile_dent_uz' }), ['https://t.me/smile_dent_uz']);
  assert.deepEqual(osmTelegramLocators({ telegram: 'tg://resolve?domain=smile_dent_uz' }), ['https://t.me/smile_dent_uz']);
  assert.deepEqual(
    osmTelegramLocators({ 'contact:telegram': '@smile_dent_uz; https://t.me/smile_admin', 'social:telegram': 'SMILE_DENT_UZ' }),
    ['https://t.me/smile_dent_uz', 'https://t.me/smile_admin'],
    'several handles are kept, case-insensitive duplicates are not',
  );
});

test('free text in a Telegram tag never becomes a stranger\'s handle', () => {
  assert.deepEqual(osmTelegramLocators({ telegram: 'Smile Dent channel' }), []);
  assert.deepEqual(osmTelegramLocators({ telegram: 'Пишите: @smile_dent_uz' }), ['https://t.me/smile_dent_uz'], 'an explicit @handle in a sentence still counts');
  assert.deepEqual(osmTelegramLocators({ telegram: 'smile_dent_uz, Smile Admin' }), ['https://t.me/smile_dent_uz']);
});

test('a t.me website counts as Telegram; an ordinary website, a channel preview or an invite does not', () => {
  assert.deepEqual(osmTelegramLocators({ website: 'https://t.me/smile_dent_uz' }), ['https://t.me/smile_dent_uz']);
  assert.deepEqual(osmTelegramLocators({ website: 'https://smile.uz' }), []);
  assert.deepEqual(osmTelegramLocators({ website: 'smile_dent_uz' }), [], 'a bare word in website is not a handle');
  assert.deepEqual(osmTelegramLocators({ telegram: 'https://t.me/s/smile_news' }), []);
  assert.deepEqual(osmTelegramLocators({ telegram: 'https://t.me/+AbCdEf123456' }), []);
  assert.deepEqual(osmTelegramLocators({ telegram: 'https://t.me/joinchat/AbCdEf' }), []);
});

test('the first handle drives the unverified Telegram contact, further handles stay evidence', () => {
  const item = osm({ telegram: 'smile_dent_uz; smile_admin_uz' });
  assert.equal(item?.telegramContact?.username, 'smile_dent_uz');
  assert.equal(item?.telegramContact?.messageable, false);
  assert.equal(item?.telegramUrl, null, 'OSM never verifies Telegram');
  assert.deepEqual(telegramOf(item), ['https://t.me/smile_dent_uz', 'https://t.me/smile_admin_uz']);
});

test('an Overpass answer with a server-side timeout remark is a failed mirror, not an empty city', async (t) => {
  const { OpenStreetMapLeadSource } = await import('../functions/platform/lead-radar/sources');
  let overpassCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://nominatim.openstreetmap.org/')) {
      return Response.json([{ boundingbox: ['41.17', '41.43', '69.11', '69.43'], lat: '41.3', lon: '69.27', display_name: 'Ташкент, Узбекистан', class: 'boundary', type: 'administrative', addresstype: 'city' }]);
    }
    if (/interpreter$/.test(url)) {
      overpassCalls += 1;
      if (overpassCalls === 1) {
        return Response.json({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 25 seconds.' });
      }
      return Response.json({ elements: [{ type: 'node', id: 77, lat: 41.3, lon: 69.27, tags: { name: 'Smile Dent', amenity: 'dentist', phone: '+998901234567' } }] });
    }
    throw new Error(`unexpected ${url}`);
  });
  const result = await new OpenStreetMapLeadSource().discoverRaw(INPUT);
  assert.ok(overpassCalls >= 2, 'the next mirror is asked');
  assert.ok(result.sourceWarnings.some((warning) => /_remark_timeout$/.test(warning)), result.sourceWarnings.join(','));
  assert.ok(result.candidates.some((candidate) => candidate.name === 'Smile Dent'));
});
