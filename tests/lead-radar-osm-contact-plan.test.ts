import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  buildLeadRadarQueryPlan,
  contactFilterLines,
  mergeOsmElements,
  OSM_CONTACT_KEYS,
} from '../functions/platform/lead-radar/sources';

const SEARCH_INPUT: LeadRadarSearchInput = {
  niche: 'Stomatologia',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'Автоматизация обработки заявок',
  desiredCount: 50,
  telegramRequired: false,
  languages: ['ru', 'uz', 'en'],
};

const BOUNDS: [number, number, number, number] = [41.1, 69.1, 41.4, 69.5];

test('the default plan is unchanged and stays broad', () => {
  const plan = buildLeadRadarQueryPlan(SEARCH_INPUT, BOUNDS);
  assert.equal(plan.version, 'osm-overpass-v3');
  assert.equal(plan.contactOnly, false);
  assert.match(plan.query, /nwr\["amenity"="dentist"\]\(/);
  assert.doesNotMatch(plan.query, /\["contact:phone"\]/);
  assert.match(plan.query, /out meta center 240;/);
});

test('contact plan selects only rows that already carry a contact tag', () => {
  const plan = buildLeadRadarQueryPlan(SEARCH_INPUT, BOUNDS, { contactOnly: true });
  assert.equal(plan.version, 'osm-overpass-v3');
  assert.equal(plan.contactOnly, true);

  // Every selector line must carry a contact key, otherwise the plan silently
  // degrades back into the broad scan it is supposed to replace.
  const lines = plan.query
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('nwr') && line.endsWith(';'));
  assert.ok(lines.length > 0, 'contact plan produced no selectors');
  for (const line of lines) {
    const keyCount = OSM_CONTACT_KEYS.filter((key) => line.includes(`["${key}"]`)).length;
    assert.equal(keyCount, 1, `selector must carry exactly one contact key: ${line}`);
  }

  // The category selectors are preserved, not replaced.
  assert.match(plan.query, /nwr\["amenity"="dentist"\]\["(contact:phone|phone|contact:website|website)"\]\(/);
  assert.match(plan.query, /\["healthcare:speciality"~"dentist\|dental\|stomatolog\|orthodont",i\]/);
  assert.match(plan.query, /out meta center 240;/);
});

test('contact plan is a strict superset of restrictions on the broad plan', () => {
  const broad = buildLeadRadarQueryPlan(SEARCH_INPUT, BOUNDS);
  const contact = buildLeadRadarQueryPlan(SEARCH_INPUT, BOUNDS, { contactOnly: true });
  const broadLines = new Set(
    broad.query.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('nwr')),
  );
  const contactLines = contact.query
    .split('\n').map((line) => line.trim()).filter((line) => line.startsWith('nwr'));

  assert.equal(contactLines.length, broadLines.size * OSM_CONTACT_KEYS.length);
  for (const line of contactLines) {
    const stripped = OSM_CONTACT_KEYS.reduce(
      (acc, key) => acc.replace(`["${key}"]`, ''),
      line,
    );
    assert.ok(broadLines.has(stripped), `contact selector has no broad parent: ${line}`);
  }
});

test('contactFilterLines expands one selector per contact key', () => {
  assert.deepEqual(contactFilterLines(['["amenity"="dentist"]']), [
    '["amenity"="dentist"]["contact:phone"]',
    '["amenity"="dentist"]["phone"]',
    '["amenity"="dentist"]["contact:website"]',
    '["amenity"="dentist"]["website"]',
  ]);
  assert.deepEqual(contactFilterLines([]), []);
});

test('mergeOsmElements keeps contact-plan rows first and dedupes by identity', () => {
  const contactRows = [
    { type: 'node', id: 1, tags: { amenity: 'dentist', phone: '+998901234567', name: 'A' } },
    { type: 'node', id: 2, tags: { amenity: 'dentist', website: 'https://b.uz', name: 'B' } },
  ];
  const broadRows = [
    { type: 'node', id: 2, tags: { amenity: 'dentist', website: 'https://b.uz', name: 'B' } },
    { type: 'node', id: 3, tags: { amenity: 'dentist', name: 'C' } },
    { type: 'way', id: 1, tags: { amenity: 'dentist', name: 'D' } },
  ];

  const merged = mergeOsmElements(contactRows, broadRows) as Array<{ type: string; id: number }>;
  assert.deepEqual(
    merged.map((row) => `${row.type}/${row.id}`),
    ['node/1', 'node/2', 'node/3', 'way/1'],
  );
});

test('mergeOsmElements preserves unshaped rows instead of dropping them', () => {
  const merged = mergeOsmElements([{ type: 'node', id: 1 }], [{ type: 'node', id: 1 }, 42, null]);
  assert.equal(merged.length, 3, 'rows without a usable identity must survive, not vanish');
});

test('mergeOsmElements handles empty inputs', () => {
  assert.deepEqual(mergeOsmElements([], []), []);
  assert.deepEqual(mergeOsmElements([], [{ type: 'node', id: 7 }]), [{ type: 'node', id: 7 }]);
  assert.deepEqual(mergeOsmElements([{ type: 'node', id: 7 }], []), [{ type: 'node', id: 7 }]);
});
