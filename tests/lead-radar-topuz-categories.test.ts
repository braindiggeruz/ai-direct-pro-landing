import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  topUzCategoryPath,
  VERIFIED_TOP_UZ_CATEGORIES,
} from '../functions/platform/lead-radar/top-uz-discovery';

test('every verified route is a same-origin top.uz section path', () => {
  assert.ok(VERIFIED_TOP_UZ_CATEGORIES.length > 1, 'the catalog must cover more than one niche');
  const paths = new Set<string>();
  for (const entry of VERIFIED_TOP_UZ_CATEGORIES) {
    assert.match(entry.path, /^\/section\/[a-z0-9-]+$/, `bad route shape: ${entry.path}`);
    assert.equal(paths.has(entry.path), false, `duplicate route: ${entry.path}`);
    paths.add(entry.path);
  }
});

test('no route pattern swallows an unrelated niche', () => {
  // A pattern that is too broad silently mis-routes a whole niche into the
  // wrong section, where the company will never be found.
  for (const niche of [
    'unverified-niche',
    'строительные материалы',
    'автозапчасти',
    'туризм',
    'Spa-центр',
    'Japan tours',
    'медиа продакшн',
    'мебель',
    'продукты питания',
  ]) {
    assert.equal(topUzCategoryPath(niche), null, `unexpected match for: ${niche}`);
  }
});

test('dentistry keeps the verified stomatologii route', () => {
  for (const niche of ['Stomatologia', 'стоматология', 'dental clinic', 'tish shifokori', 'зубная клиника']) {
    assert.equal(topUzCategoryPath(niche), '/section/stomatologii', niche);
  }
});

test('medical specialities route to their own verified sections', () => {
  const cases: Array<[string, string]> = [
    ['ортодонтия', '/section/ortodontiya'],
    ['брекеты', '/section/ortodontiya'],
    ['офтальмология', '/section/oftalmologii'],
    ['окулист', '/section/oftalmologii'],
    ['дерматология', '/section/dermatologiya'],
    ['кожные болезни', '/section/dermatologiya'],
    ['хирургия', '/section/khirurgiya'],
    ['surgery', '/section/khirurgiya'],
    ['оптика', '/section/optika'],
    ['очки', '/section/optika'],
    ['аптека', '/section/apteka-uz'],
    ['dorixona', '/section/apteka-uz'],
    ['частная клиника', '/section/kliniki-chastnye'],
    ['private clinic', '/section/kliniki-chastnye'],
    ['салон красоты', '/section/krasota-i-zdorove'],
    ['beauty salon', '/section/krasota-i-zdorove'],
    ['медицинский центр', '/section/meditsinskie-tsentry-lechebnye-i-diagnosticheskie-ambulatorii'],
    ['диагностика', '/section/meditsinskie-tsentry-lechebnye-i-diagnosticheskie-ambulatorii'],
  ];
  for (const [niche, expected] of cases) {
    assert.equal(topUzCategoryPath(niche), expected, niche);
  }
});

test('a narrow speciality wins over the broad medical route', () => {
  // "стоматологическая клиника" contains both "стомат" and "клин". The dental
  // route is listed first, so the company is looked up where dentists live.
  assert.equal(topUzCategoryPath('стоматологическая клиника'), '/section/stomatologii');
  assert.equal(topUzCategoryPath('глазная клиника'), '/section/oftalmologii');
});

test('routing is deterministic', () => {
  const niche = 'стоматология';
  const first = topUzCategoryPath(niche);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(topUzCategoryPath(niche), first);
  }
});
