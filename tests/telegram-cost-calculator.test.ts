import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEstimateSummary,
  calculateEstimate,
  DEFAULT_SELECTION,
  FEATURES,
  formatSum,
  GOALS,
  type CalculatorSelection,
} from '../src/calculator/pricing';

test('default estimate matches the public starting range', () => {
  const result = calculateEstimate(DEFAULT_SELECTION);
  assert.equal(result.implementationMin, 990_000);
  assert.equal(result.implementationMax, 1_490_000);
  assert.equal(result.daysMin, 3);
  assert.equal(result.daysMax, 5);
});

test('selected modules are added deterministically', () => {
  const selection: CalculatorSelection = {
    goalId: 'catalog',
    featureIds: ['crm', 'bilingual'],
    volumeId: 'growth',
    readinessId: 'partial',
  };
  const result = calculateEstimate(selection);
  assert.equal(result.implementationMin, 3_460_000);
  assert.equal(result.implementationMax, 6_460_000);
  assert.equal(result.monthlyMin, 300_000);
  assert.equal(result.monthlyMax, 900_000);
  assert.equal(result.daysMin, 11);
  assert.equal(result.daysMax, 23);
});

test('unknown feature ids cannot influence the total at runtime', () => {
  const selection = {
    ...DEFAULT_SELECTION,
    featureIds: ['not-a-real-feature'],
  } as unknown as CalculatorSelection;
  assert.deepEqual(calculateEstimate(selection), calculateEstimate(DEFAULT_SELECTION));
});

test('every configured range is ordered and non-negative', () => {
  for (const item of [...GOALS, ...FEATURES]) {
    assert.ok(item.min >= 0);
    assert.ok(item.max >= item.min);
    assert.ok(item.daysMin >= 0);
    assert.ok(item.daysMax >= item.daysMin);
  }
});

test('formatSum removes non-breaking spaces for predictable copy', () => {
  assert.equal(formatSum(1_490_000), '1 490 000');
});

test('summary contains the estimate, term and disclaimer', () => {
  const summary = buildEstimateSummary(calculateEstimate({
    goalId: 'ai',
    featureIds: ['crm'],
    volumeId: 'scale',
    readinessId: 'research',
  }));
  assert.match(summary, /AI-консультант/);
  assert.match(summary, /4 470 000–8 970 000 сум/);
  assert.match(summary, /рабочих дней/);
  assert.match(summary, /ориентировочный/);
});
