import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  resolveLeadRadarIntent,
  scoreLeadRadarOsmTags,
} from '../functions/platform/lead-radar/intent';
import {
  buildLeadRadarQueryPlan,
  rankLeadRadarOsmElements,
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

test('intent resolver understands transliteration, morphology, and a bounded typo', () => {
  const cases: Array<[string, string]> = [
    ['Stomatologia', 'dentistry'],
    ['stomatlogia', 'dentistry'],
    ['tish shifokori', 'dentistry'],
    ['клиника для зубов', 'dentistry'],
    ['хочу подстричься', 'beauty'],
    ['где сделать маникюр', 'beauty'],
    ['нужно жильё в аренду', 'real_estate'],
    ['продажа квартир', 'real_estate'],
    ['ищу шиномонтаж', 'automotive'],
    ['нужно СТО', 'automotive'],
  ];
  for (const [query, expectedIntent] of cases) {
    const resolution = resolveLeadRadarIntent(query);
    assert.equal(resolution.canonicalId, expectedIntent, query);
    assert.equal(resolution.expanded, true, query);
    assert.ok(resolution.confidence >= 0.9, query);
    assert.ok(resolution.aliasesUsed.length > 0, query);
  }
});

test('dental meaning wins over a generic clinic while an unqualified clinic stays medical', () => {
  const dental = resolveLeadRadarIntent('клиника для зубов');
  const genericClinic = resolveLeadRadarIntent('клиника');
  assert.equal(dental.canonicalId, 'dentistry');
  assert.equal(genericClinic.canonicalId, 'medical_clinic');

  assert.equal(scoreLeadRadarOsmTags({ amenity: 'clinic', name: 'Family Clinic' }, dental).tier, 'none');
  assert.equal(scoreLeadRadarOsmTags({
    amenity: 'clinic',
    'healthcare:speciality': 'dentist',
    name: 'Family Dental Clinic',
  }, dental).tier, 'related');
});

test('short or generic noise does not trigger a broad semantic category', () => {
  for (const query of ['и', 'для бизнеса', 'student center', 'обычный бизнес']) {
    const resolution = resolveLeadRadarIntent(query);
    assert.equal(resolution.canonicalId, null, query);
    assert.equal(resolution.matchKind, 'fallback', query);
    assert.equal(resolution.expanded, false, query);
  }

  const strictPlan = buildLeadRadarQueryPlan({ ...SEARCH_INPUT, niche: 'и' }, [41.1, 69.1, 41.4, 69.5]);
  assert.match(strictPlan.query, /\["name"~"\^и\$",i\]/);
  assert.doesNotMatch(strictPlan.query, /\["shop"\]/);
  assert.match(strictPlan.query, /out meta center 40;/);
});

test('semantic OSM plan uses grounded tags while unknown niches get bounded name fallback', () => {
  const plan = buildLeadRadarQueryPlan(SEARCH_INPUT, [41.1, 69.1, 41.4, 69.5]);
  assert.equal(plan.version, 'osm-overpass-v3');
  assert.equal(plan.intent.canonicalId, 'dentistry');
  assert.equal(plan.intent.canonicalLabel, 'Стоматология');
  assert.match(plan.query, /\["amenity"="dentist"\]/);
  assert.match(plan.query, /\["amenity"="clinic"\]\["healthcare:speciality"~/);
  assert.doesNotMatch(plan.query, /\["name"~/);
  assert.match(plan.query, /out meta center 240;/);

  const unknown = buildLeadRadarQueryPlan(
    { ...SEARCH_INPUT, niche: 'Сувениры' },
    [41.1, 69.1, 41.4, 69.5],
  );
  assert.equal(unknown.intent.canonicalId, null);
  assert.match(unknown.query, /сувениры\|suveniry/);
  assert.match(unknown.query, /\["brand"~/);
  assert.doesNotMatch(unknown.query, /\["shop"\]/);
});

test('OSM candidates rank primary before related and name-only fallback before fanout', () => {
  const intent = resolveLeadRadarIntent('зубная клиника');
  const elements = [
    { type: 'node', id: 4, tags: { amenity: 'clinic', name: 'Generic Clinic' } },
    { type: 'node', id: 3, tags: { name: 'Stomatologia Smile' } },
    {
      type: 'node',
      id: 2,
      tags: { amenity: 'clinic', 'healthcare:speciality': 'orthodontics', name: 'Ortho Center' },
    },
    { type: 'node', id: 1, tags: { amenity: 'dentist', name: 'Dental Pro' } },
  ];
  const ranked = rankLeadRadarOsmElements(elements, intent) as typeof elements;
  assert.deepEqual(ranked.map((element) => element.id), [1, 2, 3, 4]);
  assert.equal(scoreLeadRadarOsmTags(elements[3].tags, intent).tier, 'primary');
  assert.equal(scoreLeadRadarOsmTags(elements[2].tags, intent).tier, 'related');
  assert.equal(scoreLeadRadarOsmTags(elements[1].tags, intent).tier, 'fallback');
});
