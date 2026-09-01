import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  accumulateSourceYield,
  candidateYield,
  emptySourceYield,
  mergeSourceYield,
  sourceYieldRate,
  SourceYieldRecorder,
  type SourceYieldCounters,
} from '../functions/platform/lead-radar/source-yield';
import type { SourceCandidate } from '../functions/platform/lead-radar/types';

function candidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: 'openstreetmap',
    sourceUrl: 'https://www.openstreetmap.org/node/1',
    name: 'Test Company',
    category: 'Стоматология',
    city: 'Ташкент',
    country: 'UZ',
    address: 'ул. Тестовая, 1',
    website: null,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    evidence: [],
    signals: [],
    ...overrides,
  };
}

test('candidateYield counts fields that already exist, never guesses', () => {
  assert.deepEqual(candidateYield(candidate()), {
    requested: 1, withPhone: 0, withWebsite: 0, withTelegram: 0,
  });
  assert.deepEqual(candidateYield(candidate({ phone: '+998901234567' })), {
    requested: 1, withPhone: 1, withWebsite: 0, withTelegram: 0,
  });
  assert.deepEqual(candidateYield(candidate({ website: 'https://clinic.uz' })), {
    requested: 1, withPhone: 0, withWebsite: 1, withTelegram: 0,
  });
  assert.deepEqual(candidateYield(candidate({ telegramUrl: 'https://t.me/clinic' })), {
    requested: 1, withPhone: 0, withWebsite: 0, withTelegram: 1,
  });
});

test('a telegram contact counts even when no telegramUrl is set', () => {
  const counters = candidateYield(candidate({
    telegramContact: { type: 'business', url: 'https://t.me/clinic', confidence: 0.9 },
  }));
  assert.equal(counters.withTelegram, 1);
});

test('accumulate adds into its target and returns it for chaining', () => {
  const base = emptySourceYield();
  const patch: SourceYieldCounters = { requested: 2, withPhone: 1, withWebsite: 1, withTelegram: 0 };
  const accumulated = accumulateSourceYield(base, patch);
  assert.deepEqual(accumulated, patch);
  assert.equal(accumulated, base, 'accumulate folds into the target; snapshot() is the copy');

  accumulateSourceYield(base, patch);
  assert.deepEqual(base, { requested: 4, withPhone: 2, withWebsite: 2, withTelegram: 0 });
});

test('merge combines maps per source and never mutates its inputs', () => {
  const osmA = { requested: 10, withPhone: 2, withWebsite: 3, withTelegram: 0 };
  const osmB = { requested: 5, withPhone: 1, withWebsite: 0, withTelegram: 1 };
  const topuz = { requested: 4, withPhone: 4, withWebsite: 4, withTelegram: 0 };

  const merged = mergeSourceYield(
    { osm: osmA },
    { osm: osmB },
    { topuz },
  );
  assert.deepEqual(merged.osm, { requested: 15, withPhone: 3, withWebsite: 3, withTelegram: 1 });
  assert.deepEqual(merged.topuz, topuz);

  // Inputs must be untouched: callers reuse the same counter objects.
  assert.deepEqual(osmA, { requested: 10, withPhone: 2, withWebsite: 3, withTelegram: 0 });
  assert.deepEqual(osmB, { requested: 5, withPhone: 1, withWebsite: 0, withTelegram: 1 });
  assert.notEqual(merged.topuz, topuz, 'merge must copy, not alias');
});

test('merge handles empty input', () => {
  assert.deepEqual(mergeSourceYield(), {});
});

test('sourceYieldRate returns null instead of dividing by zero', () => {
  assert.equal(sourceYieldRate(emptySourceYield(), 'withPhone'), null);
  const counters: SourceYieldCounters = { requested: 4, withPhone: 1, withWebsite: 0, withTelegram: 0 };
  assert.equal(sourceYieldRate(counters, 'withPhone'), 0.25);
  assert.equal(sourceYieldRate(counters, 'withWebsite'), 0);
});

test('recorder aggregates per source and snapshots a defensive copy', () => {
  const recorder = new SourceYieldRecorder({ city: 'Ташкент' });
  recorder.recordCandidate('openstreetmap', candidate({ phone: '+998901234567' }));
  recorder.recordCandidate('openstreetmap', candidate());
  recorder.recordRequested('openstreetmap', 3);

  const snapshot = recorder.snapshot();
  assert.deepEqual(snapshot.openstreetmap, {
    requested: 5, withPhone: 1, withWebsite: 0, withTelegram: 0,
  });

  snapshot.openstreetmap.requested = 999;
  assert.equal(recorder.snapshot().openstreetmap.requested, 5, 'snapshot must be a copy');
});

test('recorder ignores non-positive requested counts', () => {
  const recorder = new SourceYieldRecorder();
  recorder.recordRequested('openstreetmap', 0);
  recorder.recordRequested('openstreetmap', -5);
  recorder.recordRequested('openstreetmap', Number.NaN);
  assert.equal(recorder.snapshot().openstreetmap, undefined);
});

test('logging emits one structured line and never throws', () => {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    const recorder = new SourceYieldRecorder({ city: 'Самарканд', niche: 'стоматология' });
    recorder.recordCandidate('openstreetmap', candidate({ phone: '+998901234567' }));
    const snapshot = recorder.log({ geocodeOrigin: 'static_city' });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /lead_radar\.source_yield/);
    assert.match(lines[0], /"geocodeOrigin":"static_city"/);
    assert.match(lines[0], /"phoneRate":1/);
    assert.equal(snapshot.openstreetmap.withPhone, 1);
  } finally {
    console.log = original;
  }
});

test('a source with many rows and no contacts is visible as a zero rate', () => {
  const original = console.log;
  console.log = () => { /* swallow */ };
  try {
    const recorder = new SourceYieldRecorder();
    for (let index = 0; index < 29; index += 1) recorder.recordCandidate('openstreetmap', candidate());
    const snapshot = recorder.log();
    assert.equal(snapshot.openstreetmap.requested, 29);
    assert.equal(sourceYieldRate(snapshot.openstreetmap, 'withPhone'), 0);
  } finally {
    console.log = original;
  }
});
