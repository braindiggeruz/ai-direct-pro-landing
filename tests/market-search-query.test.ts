import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATALOG_LIMITS } from '../functions/agents/sotuvchi/catalog';
import { reduceSearchQuery } from '../functions/market/search-query';
import { interpretVoiceQuery } from '../functions/market/voice';

const ROOT = new URL('../', import.meta.url);

function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('a typed Russian sentence searches for the product, not for the intent', () => {
  const reduced = reduceSearchQuery('Мне нужен блокнот.');
  assert.equal(reduced.query, 'блокнот');
  assert.deepEqual([...reduced.removed], ['мне', 'нужен']);
  assert.equal(reduced.unchanged, false);
});

test('the same sentence spoken and typed reaches the catalog identically', () => {
  const sentence = 'Мне нужен блокнот.';
  assert.equal(
    reduceSearchQuery(sentence).query,
    interpretVoiceQuery(sentence).productQuery,
  );
});

test('a Uzbek Latin request keeps the product word only', () => {
  assert.equal(reduceSearchQuery('Menga bloknot kerak').query, 'bloknot');
  assert.equal(reduceSearchQuery('Quloqchin bormi?').query, 'quloqchin');
});

test('an already reduced query is returned unchanged', () => {
  const once = reduceSearchQuery('Мне нужен блокнот.');
  const twice = reduceSearchQuery(once.query);
  assert.equal(twice.query, once.query);
  assert.equal(twice.unchanged, true);
  assert.deepEqual([...twice.removed], []);
});

test('a typed model number survives, unlike a spoken one', () => {
  // Voice holds a bare number back because `20000` may be a price or a battery
  // capacity. Typing it carries no such doubt, so deleting it would be the
  // worse answer.
  assert.equal(reduceSearchQuery('power bank 20000').query, 'power bank 20000');
  assert.equal(reduceSearchQuery('блокнот a5').query, 'блокнот a5');
  assert.equal(interpretVoiceQuery('power bank 20000').productQuery, 'power bank');
});

test('intent words alone never turn into a whole-catalog listing', () => {
  // Returning every product would read as a match. The unreduced query is
  // searched instead, so an honest zero result stays a zero result.
  const reduced = reduceSearchQuery('мне нужен');
  assert.equal(reduced.query, 'мне нужен');
  assert.notEqual(reduced.query, '');
});

test('an empty or blank query still means browse, not search', () => {
  assert.equal(reduceSearchQuery('').query, '');
  assert.equal(reduceSearchQuery('   ').query, '');
});

test('any sentence reduces to a query the catalog search accepts', () => {
  const sentences = [
    'Мне нужен блокнот.',
    'Покажите пожалуйста какие есть беспроводные наушники в наличии до 400000 сум',
    'Menga arzonroq quloqchin kerak, iltimos toping',
    'нужен нужен нужен нужен нужен блокнот ручка папка кружка лампа кабель зонт',
  ];
  for (const sentence of sentences) {
    const { query } = reduceSearchQuery(sentence);
    assert.ok(query.split(' ').filter(Boolean).length <= CATALOG_LIMITS.queryTokens);
    assert.ok(query.length <= CATALOG_LIMITS.queryLength);
  }
});

test('understanding lives in the one shared catalog path', async () => {
  const router = await source('functions/market/router.ts');
  // One grounding pass and one AI fallback, both inside runCatalogSearch.
  // Doing either at a caller would let typed and voice search drift apart.
  assert.equal((router.match(/groundQueryInCatalog\(/g) ?? []).length, 1);
  assert.equal((router.match(/resolveSearchIntentWithAi\(/g) ?? []).length, 1);
  assert.equal((router.match(/reduceSearchQuery\(/g) ?? []).length, 1);
  // The catalog receives the grounded query, never the raw sentence.
  assert.match(router, /searchPublishedProducts\(\s*\n\s*context\.access\.buyer,\s*\n\s*queryApplied,/);
  assert.doesNotMatch(router, /searchPublishedProducts\([\s\S]{0,120}input\.query/);
  // The model is a fallback, not the default: it runs only when nothing in the
  // sentence matched a real catalog word.
  assert.match(router, /if \(!grounded\.grounded && aiSearchAvailable\(context\.env\)\)/);
});

test('voice and typed search share one stop-word vocabulary', async () => {
  const constraints = await source('functions/market/voice/constraints.ts');
  // A second copy of the vocabulary is how the two paths silently diverge.
  assert.match(constraints, /from '\.\.\/search-query'/);
  assert.doesNotMatch(constraints, /const STOP_WORDS/);
});
