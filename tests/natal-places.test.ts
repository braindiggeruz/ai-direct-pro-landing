import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  normalizePlace,
  searchPlaces,
  shardKeyFor,
  shardKeysFor,
  shardPrefix,
  type PlaceEntry,
  type PlacesMeta,
} from '../src/tools/natal/places';

const ROOT = path.resolve(import.meta.dirname, '..');
const PLACES = path.join(ROOT, 'public', 'natal', 'places');
const TZ = path.join(ROOT, 'public', 'natal', 'tz');
const meta = JSON.parse(readFileSync(path.join(PLACES, 'meta.json'), 'utf8')) as PlacesMeta;
const shardCache = new Map<string, PlaceEntry[]>();

function shard(key: string): PlaceEntry[] {
  let entries = shardCache.get(key);
  if (!entries) {
    entries = JSON.parse(readFileSync(path.join(PLACES, `${key}.json`), 'utf8')) as PlaceEntry[];
    shardCache.set(key, entries);
  }
  return entries;
}

// What a client does: load the shards a query can live in, search them.
function search(query: string, limit = 8): PlaceEntry[] {
  const keys = shardKeysFor(normalizePlace(query), meta.shards);
  return searchPlaces(query, keys.flatMap(shard), limit);
}

function zoneOf(entry: PlaceEntry): string {
  return meta.zones[entry[8]];
}

const SAMPLES: Array<[string, string]> = [
  ['Ташкент', 'tashkent'], ['Тошкент', 'toshkent'], ['Самарканд', 'samarkand'], ['Самарқанд', 'samarqand'],
  ['Фарғона', 'fargona'], ['Фергана', 'fergana'], ['Ўзбекистон', 'ozbekiston'], ['Fargʻona', 'fargona'],
  ["Oʻzbekiston", 'ozbekiston'], ['Москва', 'moskva'], ['Нью-Йорк', 'nyu york'], ['New York', 'new york'],
  ['Xorazm viloyati', 'xorazm viloyati'], ['Хорезмская область', 'xorezmskaya oblast'], ['Андижан', 'andijan'],
  ['Қўқон', 'qoqon'], ['Ургенч', 'urgench'], ['Щёлково', 'shyolkovo'],
  ['São Paulo', 'sao paulo'], ['Zürich', 'zurich'], ['Łódź', 'lodz'], ['İstanbul', 'istanbul'],
  ["Ba'lbek", 'balbek'], ['Ust-Kamenogorsk', 'ust kamenogorsk'], ['  Buxoro  ', 'buxoro'],
  ['Чирчиқ', 'chirchiq'], ['Наманган', 'namangan'], ['Нукус', 'nukus'], ['Ёшлик', 'yoshlik'], ['Ашхабад', 'ashxabad'],
];

test('normalizePlace maps Uzbek Latin, Uzbek Cyrillic and Russian to one key', () => {
  for (const [input, expected] of SAMPLES) {
    assert.equal(normalizePlace(input), expected, input);
  }
  assert.equal(normalizePlace('Ташкент'), normalizePlace('tashkent'));
  assert.equal(normalizePlace('Тошкент'), normalizePlace('Toshkent'));
  assert.equal(normalizePlace('Самарқанд'), normalizePlace('Samarqand'));
  assert.equal(normalizePlace('Фарғона'), normalizePlace("Fargʻona"));
  assert.equal(normalizePlace(''), '');
  assert.equal(normalizePlace('---'), '');
});

test('normalizePlace agrees with the Python converter on 30 sample names', (t) => {
  const inputs = SAMPLES.map(([input]) => input);
  const run = spawnSync('py', ['-3', '-I', path.join(ROOT, 'scripts', 'natal', 'build-places.py'), '--normalize'], {
    input: JSON.stringify(inputs),
    encoding: 'utf8',
  });
  if (run.error || run.status !== 0) {
    t.skip(`python launcher not available: ${run.error?.message ?? run.stderr}`);
    return;
  }
  const python = JSON.parse(run.stdout) as string[];
  assert.equal(python.length, inputs.length);
  inputs.forEach((input, i) => assert.equal(python[i], normalizePlace(input), `python vs ts for ${input}`));
});

test('Tashkent is found first by all four spellings', () => {
  for (const q of ['Toshkent', 'Тошкент', 'Ташкент', 'tashkent']) {
    const [first] = search(q);
    assert.ok(first, q);
    assert.equal(first[5], 'UZ', q);
    assert.equal(first[0], 1512569, `${q} -> ${first[1]}`);
    assert.equal(zoneOf(first), 'Asia/Tashkent', q);
  }
});

test('Samarkand, Nukus, Fergana', () => {
  for (const q of ['Samarqand', 'Самарканд']) {
    const [first] = search(q);
    assert.equal(first[0], 1216265, q);
    assert.equal(zoneOf(first), 'Asia/Samarkand', q);
  }
  const nukus = search('Nukus')[0];
  assert.equal(nukus[1], 'Nukus');
  assert.equal(nukus[5], 'UZ');
  assert.equal(zoneOf(nukus), 'Asia/Samarkand'); // as GeoNames has it
  for (const q of ['Fargʻona', 'Farg\'ona', 'Фергана', 'Фарғона']) {
    const [first] = search(q);
    assert.ok(first, q);
    assert.equal(first[0], 1514019, `${q} -> ${first[1]}`);
    assert.equal(zoneOf(first), 'Asia/Tashkent', q);
  }
});

test('a small Uzbek village with no population figure is found by its Uzbek name', () => {
  const id = 11104911; // Shaftolizor, Andijon viloyati, population 0
  const found = search('Shaftolizor');
  const hit = found.find((e) => e[0] === id);
  assert.ok(hit);
  assert.equal(hit[9], 0);
  assert.equal(hit[5], 'UZ');
  assert.equal(hit[3], 'Andijon viloyati');
});

test('world cities: Moscow in Russian and New York', () => {
  const [moscow] = search('Москва');
  assert.equal(moscow[0], 524901);
  assert.equal(zoneOf(moscow), 'Europe/Moscow');
  const [york] = search('New York');
  assert.equal(york[5], 'US');
  assert.equal(zoneOf(york), 'America/New_York');
  assert.ok(search('Нью-Йорк').some((e) => e[0] === york[0]));
});

test('searchPlaces: word starts, limit, empty query', () => {
  // a word-start match works on the entries that are loaded (shards are chosen by the first letter of a name)
  const loaded = shardKeysFor('new', meta.shards).flatMap(shard);
  assert.ok(searchPlaces('york city', loaded).some((e) => e[1] === 'New York City'));
  assert.equal(search('to', 3).length, 3);
  assert.deepEqual(search('   '), []);
  assert.deepEqual(search('zzzzqqqq'), []);
});

test('shard lookup follows the split of meta.shards', () => {
  assert.equal(shardKeyFor('toshkent', meta.shards) === '' ? 'none' : 'some', 'some');
  assert.equal(shardKeyFor('', meta.shards), '');
  const synthetic = { a: 1, ta: 1, tab: 1, tas: 3, _: 1 };
  assert.equal(shardKeyFor('tashkent', synthetic), 'tas');
  assert.deepEqual(shardKeysFor('t', synthetic), ['tas', 'ta', 'tab']);
  assert.equal(shardKeyFor('7', synthetic), '_');
  assert.equal(shardKeyFor('apple', synthetic), 'a');
});

test('every zone has a table file; attribution and counts', () => {
  assert.match(meta.attribution, /GeoNames/);
  assert.match(meta.attribution, /CC BY 4\.0/);
  assert.ok(meta.version);
  assert.deepEqual([...meta.zones], [...meta.zones].sort());
  for (const zone of meta.zones) {
    const file = path.join(TZ, `${zone.replace(/\//g, '__')}.json`);
    assert.ok(existsSync(file), `missing zone table ${file}`);
  }
  assert.deepEqual(meta.countries.UZ, { uz: 'Oʻzbekiston', ru: 'Узбекистан' });
  assert.equal(meta.countries.RU.ru, 'Россия');
});

test('shards: sizes, counts, Uzbekistan completeness', () => {
  const files = readdirSync(PLACES).filter((f) => f.endsWith('.json') && f !== 'meta.json').sort();
  assert.deepEqual(files, Object.keys(meta.shards).map((k) => `${k}.json`).sort());
  const uz = new Set<number>();
  for (const key of Object.keys(meta.shards)) {
    const file = path.join(PLACES, `${key}.json`);
    assert.ok(statSync(file).size <= 200 * 1024, `${key}.json is ${statSync(file).size} bytes`);
    const entries = shard(key);
    assert.equal(entries.length, meta.shards[key], key);
    for (const e of entries) {
      assert.equal(e.length, 11);
      assert.ok(e[8] >= 0 && e[8] < meta.zones.length);
      assert.ok(e[10].split('|').some((k) => shardPrefix(k, key.length) === key), `${e[0]} not in ${key}`);
      if (e[5] === 'UZ') uz.add(e[0]);
    }
  }
  assert.ok(uz.size >= 1000, `UZ entries: ${uz.size}`);
});
