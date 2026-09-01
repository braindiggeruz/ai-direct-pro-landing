import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  TwoGisLeadSource,
  boundsToCircle,
  candidateFromTwoGisItem,
  extractTwoGisContacts,
  isTwoGisBusinessItem,
  twoGisFirmUrl,
} from '../functions/platform/lead-radar/two-gis-source';

const NOW = '2026-09-01T12:00:00.000Z';

function input(overrides: Partial<LeadRadarSearchInput> = {}): LeadRadarSearchInput {
  return {
    niche: 'стоматология',
    city: 'Ташкент',
    country: 'UZ',
    offer: 'AI-ассистент для записи',
    desiredCount: 25,
    telegramRequired: false,
    languages: ['ru', 'uz'],
    ...overrides,
  };
}

/** A full branch item in the shape the Places API documents. */
function branchItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '70000001098765432',
    type: 'branch',
    name: 'Клиника Улыбка',
    address_name: 'ул. Амира Темура, 15',
    point: { lat: 41.311081, lon: 69.240562 },
    rubrics: [{ name: 'Стоматология' }],
    contact_groups: [
      {
        contacts: [
          { type: 'phone', value: '+998 90 123 45 67' },
          { type: 'website', url: 'https://ulybka.uz' },
          { type: 'email', value: 'info@ulybka.uz' },
          { type: 'telegram', url: 'https://t.me/ulybka_clinic' },
        ],
      },
    ],
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('2GIS takes lon,lat — the order trap is covered by a test', () => {
  // Tashkent bounds are [south, west, north, east].
  const circle = boundsToCircle([41.1577334, 69.121797, 41.4224955, 69.525908]);
  assert.equal(circle.lat > 41 && circle.lat < 41.43, true, 'latitude is around Tashkent');
  assert.equal(circle.lon > 69 && circle.lon < 69.53, true, 'longitude is around Tashkent');
  assert.equal(circle.lon > circle.lat, true, 'longitude comes out as the larger value here');
  assert.ok(circle.radius >= 1_000 && circle.radius <= 50_000, `radius clamped, got ${circle.radius}`);
});

test('a tiny city box still asks for a usable radius', () => {
  const circle = boundsToCircle([41.3, 69.2, 41.31, 69.21]);
  assert.equal(circle.radius, 1_000, 'never below the floor');
});

test('buildings, streets and districts are not businesses', () => {
  assert.equal(isTwoGisBusinessItem({ type: 'branch' }), true);
  assert.equal(isTwoGisBusinessItem({ type: 'building' }), false);
  assert.equal(isTwoGisBusinessItem({ type: 'street' }), false);
  assert.equal(isTwoGisBusinessItem({ type: 'adm_div' }), false);
  assert.equal(isTwoGisBusinessItem({ type: 'Branch' }), true, 'type matching is case-insensitive');
  assert.equal(isTwoGisBusinessItem({}), false, 'no type means no business');
});

test('contacts are read from whichever carrier 2GIS used', () => {
  const contacts = extractTwoGisContacts({
    contact_groups: [
      { contacts: [{ type: 'phone', value: '+998901234567' }] },
      { contacts: [{ type: 'website', url: 'https://example.uz' }] },
      { contacts: [{ type: 'telegram', text: 'https://t.me/shop' }] },
    ],
  });
  assert.equal(contacts.phone, '+998901234567');
  assert.equal(contacts.website, 'https://example.uz');
  assert.equal(contacts.telegram, 'https://t.me/shop');
});

test('a WhatsApp contact is also a phone, because it is one', () => {
  const contacts = extractTwoGisContacts({
    contact_groups: [{ contacts: [{ type: 'whatsapp', value: '+998 93 111 22 33' }] }],
  });
  assert.equal(contacts.phone, '+998 93 111 22 33');
  assert.equal(contacts.whatsapp, '+998 93 111 22 33');
});

test('a key without the contact_groups permission yields nulls, not guesses', () => {
  const contacts = extractTwoGisContacts({ name: 'Клиника Улыбка', type: 'branch' });
  assert.deepEqual(contacts, { phone: null, website: null, email: null, telegram: null, whatsapp: null });
});

test('unknown contact types are ignored rather than guessed at', () => {
  const contacts = extractTwoGisContacts({
    contact_groups: [{ contacts: [{ type: 'skype', value: 'live:clinic' }, { type: 'phone', value: '+998901234567' }] }],
  });
  assert.equal(contacts.phone, '+998901234567');
  assert.equal(contacts.website, null);
});

test('an item becomes a candidate with a normalised E.164 phone', () => {
  const candidate = candidateFromTwoGisItem(branchItem(), input(), NOW);
  assert.ok(candidate, 'a branch item is a candidate');
  assert.equal(candidate?.name, 'Клиника Улыбка');
  assert.equal(candidate?.phone, '+998901234567', 'phone normalised to E.164');
  assert.equal(candidate?.website, 'https://ulybka.uz/');
  assert.equal(candidate?.genericEmail, 'info@ulybka.uz');
  assert.equal(candidate?.city, 'Ташкент');
  assert.equal(candidate?.category, 'Стоматология');
  assert.equal(candidate?.telegramContact?.username, 'ulybka_clinic');
  assert.equal(candidate?.telegramContact?.messageable, false, 'a catalog listing is fail-closed');
  assert.equal(candidate?.enrichmentStatus, 'pending', 'a website means enrichment can run');
});

test('every spelling 2GIS uses for a Telegram handle becomes a contact', () => {
  // A catalog that types a contact as `telegram` has already asserted what the
  // string is, so a bare handle is trustworthy here. On a scraped page the
  // shared cleaner rightly refuses it — that rule is not weakened here, the
  // shape is completed before the shared cleaner validates the handle itself.
  const shapes: Array<[string, Record<string, string>]> = [
    ['full url', { value: 'https://t.me/urlhandle' }],
    ['url without a scheme', { text: 't.me/slashless' }],
    ['@handle', { value: '@athandle' }],
    ['bare handle', { value: 'shop_tashkent' }],
    ['url in the url carrier', { url: 'https://t.me/urlfield' }],
  ];
  for (const [label, carrier] of shapes) {
    const candidate = candidateFromTwoGisItem(
      branchItem({ contact_groups: [{ contacts: [{ type: 'telegram', ...carrier }] }] }),
      input(),
      NOW,
    );
    assert.ok(
      candidate?.telegramContact?.url?.startsWith('https://t.me/'),
      `${label} must resolve to a canonical t.me url, got ${candidate?.telegramContact?.url}`,
    );
    assert.equal(candidate?.telegramContact?.messageable, false, `${label} stays fail-closed`);
  }
});

test('a longer telegram type spelling is not dropped by an exact match', () => {
  const candidate = candidateFromTwoGisItem(
    branchItem({ contact_groups: [{ contacts: [{ type: 'telegram_channel', value: 'chan_handle' }] }] }),
    input(),
    NOW,
  );
  assert.equal(candidate?.telegramContact?.username, 'chan_handle');
});

test('a telegram value that is prose is still rejected', () => {
  // Completing the shape must not turn into accepting anything.
  const candidate = candidateFromTwoGisItem(
    branchItem({ contact_groups: [{ contacts: [{ type: 'telegram', value: 'Написать в Telegram' }] }] }),
    input(),
    NOW,
  );
  assert.equal(candidate?.telegramContact, null, 'no invented handle');
  assert.equal(candidate?.telegramUrl, null);
});

test('the WhatsApp signal is recorded, not silently dropped', () => {
  const candidate = candidateFromTwoGisItem(
    branchItem({ contact_groups: [{ contacts: [{ type: 'whatsapp', value: '+998901234567' }] }] }),
    input(),
    NOW,
  );
  assert.equal(candidate?.signals.length, 1);
  assert.equal(candidate?.signals[0]?.type, 'messenger');
  assert.equal(candidate?.signals[0]?.label, 'whatsapp');
  assert.equal(candidate?.phone, '+998901234567');
});

test('an item with no website skips enrichment instead of queueing a crawl', () => {
  const candidate = candidateFromTwoGisItem(branchItem({ contact_groups: [] }), input(), NOW);
  assert.equal(candidate?.enrichmentStatus, 'terminal');
  assert.equal(candidate?.enrichmentReason, 'no_website');
});

test('a candidate is rejected when it cannot identify a business', () => {
  assert.equal(candidateFromTwoGisItem({ type: 'building', id: 'x' }, input(), NOW), null);
  assert.equal(candidateFromTwoGisItem({ type: 'branch' }, input(), NOW), null, 'no id');
  assert.equal(candidateFromTwoGisItem({ type: 'branch', id: 'x', name: 'A' }, input(), NOW), null, 'name too short');
  assert.equal(candidateFromTwoGisItem(null, input(), NOW), null);
});

test('the public permalink carries the id and never a key', () => {
  assert.equal(twoGisFirmUrl('70000001098765432'), 'https://2gis.uz/firm/70000001098765432');
});

test('an unconfigured source makes no request at all', async () => {
  let calls = 0;
  const source = new TwoGisLeadSource({}, {
    fetchImpl: async () => { calls += 1; return response({ result: { items: [] } }); },
  });
  const result = await source.discover(input());
  assert.equal(calls, 0, 'no request without a key');
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.sourceWarnings, ['two_gis_not_configured']);
});

test('an empty key is treated as unconfigured', async () => {
  let calls = 0;
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: '   ' }, {
    fetchImpl: async () => { calls += 1; return response({ result: { items: [] } }); },
  });
  await source.discover(input());
  assert.equal(calls, 0);
});

test('a city outside the static table is skipped, not geocoded at cost', async () => {
  let calls = 0;
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => { calls += 1; return response({ result: { items: [] } }); },
  });
  const result = await source.discover(input({ city: 'Неизвестный Город' }));
  assert.equal(calls, 0);
  assert.deepEqual(result.sourceWarnings, ['two_gis_city_unknown']);
});

test('a healthy response becomes candidates and records yield', async () => {
  let requestedUrl = '';
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'secret-key-abc123' }, {
    fetchImpl: async (url) => {
      requestedUrl = url;
      return response({ result: { total: 1, items: [branchItem()] } });
    },
    now: () => new Date(NOW),
  });
  const result = await source.discover(input());
  assert.equal(result.candidates.length, 1);
  assert.equal(result.rawDiscoveredCount, 1);
  assert.match(requestedUrl, /^https:\/\/catalog\.api\.2gis\.com\/3\.0\/items\?/);
  assert.match(requestedUrl, /location=69\.\d+%2C41\.\d+/, 'location is lon,lat');
  assert.match(requestedUrl, /fields=items\.contact_groups/);
  const yieldRow = result.sourceYield?.['2gis_catalog'];
  assert.equal(yieldRow?.requested, 1);
  assert.equal(yieldRow?.withPhone, 1);
  assert.equal(yieldRow?.withTelegram, 1);
});

test('nothing persisted carries the API key', async () => {
  const key = 'supersecret2giskey';
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: key }, {
    fetchImpl: async () => response({ result: { items: [branchItem()] } }),
    now: () => new Date(NOW),
  });
  const result = await source.discover(input());
  // The key travels in the query string of the outgoing request, so the one
  // thing standing between it and D1 is that we never copy that URL anywhere.
  const persisted = JSON.stringify(result);
  assert.equal(persisted.includes(key), false, 'the key never reaches a stored field');
  assert.equal(persisted.includes('catalog.api.2gis.com'), false, 'and neither does the API URL');
});

test('an HTTP failure fails soft so OSM can still finish the search', async () => {
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => response({ meta: { code: 401 } }, 401),
  });
  const result = await source.discover(input());
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.sourceWarnings, ['two_gis_http_401']);
});

test('a transport error is reported, not rethrown', async () => {
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => { throw new Error('network down'); },
  });
  const result = await source.discover(input());
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.sourceWarnings, ['two_gis_unavailable']);
});

test('a key without the contacts permission says so instead of looking broken', async () => {
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => response({
      result: { items: [{ id: '1', type: 'branch', name: 'Клиника Улыбка', address_name: 'ул. Амира Темура, 15' }] },
    }),
    now: () => new Date(NOW),
  });
  const result = await source.discover(input());
  assert.equal(result.candidates.length, 1, 'the row is still worth having');
  assert.ok(result.sourceWarnings.includes('two_gis_contacts_absent'));
});

test('a malformed payload never throws into the search', async () => {
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => response({ meta: { code: 200 } }),
  });
  const result = await source.discover(input());
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.sourceWarnings, ['two_gis_invalid_payload']);
});

test('page_size never exceeds the cap the live API actually enforces', async () => {
  let requestedUrl = '';
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async (url) => { requestedUrl = url; return response({ result: { items: [] } }); },
  });
  await source.discover(input({ desiredCount: 500 }));
  const size = Number(new URL(requestedUrl).searchParams.get('page_size'));
  // Measured against the live API, not read off the docs: it answers 400 with
  // "Length of parameter 'page_size' should be from 1 to 10". Asking for the
  // 50 the docs suggest used to fail the single request and kill the source.
  assert.equal(size <= 10, true, `page_size capped at 10, got ${size}`);
  assert.equal(size > 0, true);
});

/** A page of distinct branches, so ids never collide across pages. */
function page(size: number, offset = 0) {
  return Array.from({ length: size }, (_, index) => branchItem({
    id: String(70_000_001_000_000_000 + offset + index),
    name: `Клиника ${offset + index}`,
  }));
}

test('ten per page is not a lead list, so pages are walked', async () => {
  const urls: string[] = [];
  let call = 0;
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async (url) => {
      urls.push(url);
      call += 1;
      // Every page comes back full: the catalog still has more to give.
      return response({ result: { items: page(10, call * 100) } });
    },
    now: () => new Date(NOW),
  });
  const result = await source.discover(input({ desiredCount: 25 }));
  // desiredCount 25 targets 50 rows, so five pages of ten are needed.
  assert.deepEqual(
    urls.map((url) => new URL(url).searchParams.get('page')),
    ['1', '2', '3', '4', '5'],
  );
  assert.equal(result.candidates.length, 50, 'a search for 25 should see 50 candidates');
});

test('a short page ends the walk instead of asking for more', async () => {
  let calls = 0;
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => {
      calls += 1;
      return response({ result: { items: calls === 1 ? page(10) : page(3, 100) } });
    },
    now: () => new Date(NOW),
  });
  const result = await source.discover(input({ desiredCount: 25 }));
  assert.equal(calls, 2, 'a three-item second page ends it');
  assert.equal(result.candidates.length, 13);
});

test('a page failing mid-walk keeps what was already collected', async () => {
  let calls = 0;
  const source = new TwoGisLeadSource({ TWOGIS_API_KEY: 'k' }, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response({ result: { items: page(10) } });
      return response({ meta: { code: 500 } }, 500);
    },
    now: () => new Date(NOW),
  });
  const result = await source.discover(input({ desiredCount: 25 }));
  assert.equal(result.candidates.length, 10, 'the first page survives');
  assert.ok(
    result.sourceWarnings.includes('two_gis_page_2_http_500'),
    `expected a page warning, got ${JSON.stringify(result.sourceWarnings)}`,
  );
  assert.equal(calls, 2, 'no retries after a failed page');
});
