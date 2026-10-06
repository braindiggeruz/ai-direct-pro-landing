// The studio's funnel in the browser (STUDIO-SPEC §10.2, §10.5, §14.1):
// its own closed Metrika goal list, every goal fired somewhere, a closed
// GA4 catalogue and parameter list, server events from the closed lists of
// functions/lib/studio/events.ts, and never a `purchase` from the browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  STUDIO_GA4_EVENTS,
  STUDIO_GA4_PARAMS,
  STUDIO_YM_COUNTER_ID,
  STUDIO_YM_GOALS,
  cleanGa4Params,
  createFunnel,
  randomId,
  reachStudioGoal,
  trackGa4,
  type Funnel,
} from '../apps/studio/src/analytics';
import type { EventBody } from '../apps/studio/src/api';
import { YANDEX_METRIKA_COUNTER_ID, YANDEX_METRIKA_GOALS } from '../scripts/analytics-metrika';
import { STUDIO_UI_EVENTS, parseStudioEvent } from '../functions/lib/studio/events';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'apps/studio/src');

/** Every source file of the island except analytics.ts itself, by repository path. */
function islandSources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of fs.readdirSync(SRC, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(file) || file.replace(/\\/g, '/') === 'analytics.ts') continue;
    files.set(`apps/studio/src/${file.replace(/\\/g, '/')}`, fs.readFileSync(path.join(SRC, file), 'utf8'));
  }
  return files;
}

interface Calls {
  gtag: unknown[][];
  ym: unknown[][];
  dataLayer: Record<string, unknown>[];
}

/** A page's analytics globals, recorded. */
function fakeWindow(options: { gtag?: boolean; ym?: boolean } = {}): Calls {
  const calls: Calls = { gtag: [], ym: [], dataLayer: [] };
  const win: Record<string, unknown> = { dataLayer: calls.dataLayer };
  if (options.gtag !== false) win.gtag = (...args: unknown[]) => calls.gtag.push(args);
  if (options.ym !== false) win.ym = (...args: unknown[]) => calls.ym.push(args);
  (globalThis as { window?: unknown }).window = win;
  return calls;
}

test.afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

// --- Metrika -----------------------------------------------------------------------

test('metrika: the studio goal list is closed, on the site\'s counter, apart from the site\'s catalogue', () => {
  assert.deepEqual(Object.values(STUDIO_YM_GOALS), ['studio_tool_started', 'studio_result', 'studio_tariffs_viewed', 'studio_checkout']);
  assert.equal(STUDIO_YM_COUNTER_ID, YANDEX_METRIKA_COUNTER_ID);
  for (const goal of Object.values(STUDIO_YM_GOALS)) {
    assert.ok(!(YANDEX_METRIKA_GOALS as readonly string[]).includes(goal), `${goal} is not in the site's catalogue`);
  }
  // The site's catalogue and wrapper stay as they were (tests/yandex-metrika.test.ts holds them).
  for (const file of ['src/lib/analytics/yandexMetrika.ts', 'scripts/analytics-metrika.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), /studio_(tool_started|result|tariffs_viewed|checkout)/, file);
  }
});

test('metrika: a goal carries its name only; an unknown name is dropped; a missing or throwing ym is harmless', () => {
  const calls = fakeWindow();
  reachStudioGoal(STUDIO_YM_GOALS.result);
  reachStudioGoal('lead_form_success' as never);
  assert.deepEqual(calls.ym, [[111312750, 'reachGoal', 'studio_result']]);
  fakeWindow({ ym: false });
  assert.doesNotThrow(() => reachStudioGoal(STUDIO_YM_GOALS.result));
  (globalThis as { window?: unknown }).window = { ym: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => reachStudioGoal(STUDIO_YM_GOALS.result));
});

/**
 * Funnel steps whose screen arrives with a later task. Each is fired by
 * analytics.ts already (the test below), but no component calls it yet:
 *   tariffsViewed    the «Tariflar» card after a result and at the limit,
 *                    shown only once payments are on (T3.2 billing/Tariffs.tsx, T5.1)
 *   checkoutStarted  the Click checkout (T3.2 billing/Checkout.tsx, T4.1)
 *   checkoutResult   the return from Click (T4.1 billing/PayReturn.tsx)
 * When a task wires one, it must leave this list (the test fails until it does).
 */
const LATER_STEPS = new Set<keyof Funnel>(['tariffsViewed', 'checkoutStarted', 'checkoutResult']);

const STEP_GOALS: Record<keyof Funnel, string | null> = {
  toolStarted: 'studio_tool_started',
  resultReady: 'studio_result',
  tariffsViewed: 'studio_tariffs_viewed',
  checkoutStarted: 'studio_checkout',
  checkoutResult: null,
  download: null,
  limitHit: null,
  error: null,
};

function fireStep(funnel: Funnel, step: keyof Funnel): void {
  switch (step) {
    case 'toolStarted': return funnel.toolStarted('presentation');
    case 'resultReady': return funnel.resultReady('presentation', 'free');
    case 'tariffsViewed': return funnel.tariffsViewed('limit');
    case 'checkoutStarted': return funnel.checkoutStarted('oylik');
    case 'checkoutResult': return funnel.checkoutResult('paid');
    case 'download': return funnel.download('presentation', 2);
    case 'limitHit': return funnel.limitHit('free_limit');
    case 'error': return funnel.error('studio_busy');
  }
}

test('metrika: every studio goal is fired by a funnel step, and every step with a screen is called from the island', () => {
  const reached = new Set<string>();
  for (const step of Object.keys(STEP_GOALS) as (keyof Funnel)[]) {
    const calls = fakeWindow();
    fireStep(createFunnel(() => {}), step);
    const goals = calls.ym.map((call) => call[2] as string);
    assert.deepEqual(goals, STEP_GOALS[step] ? [STEP_GOALS[step]] : [], `${step} reaches ${STEP_GOALS[step] ?? 'no goal'}`);
    for (const goal of goals) reached.add(goal);
  }
  assert.deepEqual([...reached].sort(), Object.values(STUDIO_YM_GOALS).sort(), 'each goal is fired by some step');

  const code = [...islandSources().values()].join('\n');
  for (const step of Object.keys(STEP_GOALS) as (keyof Funnel)[]) {
    const called = new RegExp(`funnel\\.${step}\\(`).test(code);
    if (LATER_STEPS.has(step)) assert.ok(!called, `${step} is called now: take it off LATER_STEPS`);
    else assert.ok(called, `${step} is never called from the island`);
  }
});

test('metrika and server: a step repeated on the page counts once per view; GA4 sees each', () => {
  const calls = fakeWindow();
  const sent: EventBody[] = [];
  const funnel = createFunnel((body) => sent.push(body), randomId());
  funnel.toolStarted('presentation');
  funnel.toolStarted('presentation');
  funnel.resultReady('presentation', 'free');
  assert.equal(calls.ym.length, 2);
  assert.equal(sent.length, 2);
  assert.equal(calls.gtag.filter((call) => call[1] === 'studio_tool_started').length, 2);
});

// --- server events -----------------------------------------------------------------

test('server: every event the funnel sends is one the server accepts; one view id, fresh event ids', () => {
  fakeWindow();
  const sent: EventBody[] = [];
  const view = randomId();
  const funnel = createFunnel((body) => sent.push(body), view);
  for (const step of Object.keys(STEP_GOALS) as (keyof Funnel)[]) fireStep(funnel, step);
  funnel.tariffsViewed('after_result');
  funnel.checkoutStarted('kunlik');
  funnel.checkoutResult('pending');
  funnel.checkoutResult('cancelled');
  funnel.resultReady('presentation', 'paid');
  funnel.toolStarted('photo');
  assert.ok(sent.length >= 10);
  const kinds = new Set<string>();
  for (const body of sent) {
    const parsed = parseStudioEvent(JSON.parse(JSON.stringify(body)));
    assert.ok(parsed, `${body.type}/${body.detail} is accepted by functions/lib/studio/events.ts`);
    assert.equal(body.viewId, view);
    kinds.add(`${body.type}:${body.detail}`);
  }
  assert.equal(new Set(sent.map((body) => body.id)).size, sent.length, 'each event has its own id');
  // Every type and qualifier of the server's closed lists can be produced.
  for (const [type, details] of Object.entries(STUDIO_UI_EVENTS)) {
    for (const detail of details) assert.ok(kinds.has(`${type}:${detail}`), `${type}:${detail}`);
  }
  // download, limitHit and error are GA4 only.
  assert.ok(!sent.some((body) => !(body.type in STUDIO_UI_EVENTS)));
});

test('server: a failing sender never breaks the page', () => {
  fakeWindow();
  const funnel = createFunnel(() => { throw new Error('offline'); });
  assert.doesNotThrow(() => funnel.toolStarted('presentation'));
});

test('ids: random ids are UUID v4, also without crypto.randomUUID', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(randomId(), uuid);
  const original = crypto.randomUUID;
  try {
    (crypto as { randomUUID?: unknown }).randomUUID = undefined;
    assert.match(randomId(), uuid);
  } finally {
    (crypto as { randomUUID?: unknown }).randomUUID = original;
  }
});

// --- GA4 -----------------------------------------------------------------------------

test('ga4: only catalogued events, only listed parameters, never the topic', () => {
  const calls = fakeWindow();
  trackGa4(STUDIO_GA4_EVENTS.toolStarted, { tool: 'presentation', topic: 'Amir Temur', slides: 6, code: 'x'.repeat(60) } as never);
  trackGa4('purchase' as never, { value: 39900 } as never);
  trackGa4('page_view' as never);
  assert.equal(calls.gtag.length, 1);
  const [kind, name, params] = calls.gtag[0] as [string, string, Record<string, unknown>];
  assert.equal(kind, 'event');
  assert.equal(name, 'studio_tool_started');
  assert.equal(params.topic, undefined, 'the topic never reaches GA4');
  assert.equal(params.tool, 'presentation');
  assert.equal(params.slides, 6);
  assert.equal((params.code as string).length, 40);
  assert.ok(!STUDIO_GA4_PARAMS.has('topic'));
  assert.deepEqual(cleanGa4Params({ unknown: 'x', images: 2, inapp: 'telegram', bad: {} } as never), { images: 2, inapp: 'telegram' });
});

test('ga4: without gtag the event goes to dataLayer once; a throwing gtag is harmless', () => {
  const calls = fakeWindow({ gtag: false });
  trackGa4(STUDIO_GA4_EVENTS.download, { tool: 'presentation', images: 2 });
  assert.deepEqual(calls.dataLayer, [{ event: 'studio_download', tool: 'presentation', images: 2 }]);
  (globalThis as { window?: unknown }).window = { gtag: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => trackGa4(STUDIO_GA4_EVENTS.download, {}));
});

test('ga4: the browser never sends purchase (GA4 purchase is the server\'s, weeks 6–7)', () => {
  assert.ok(!(Object.values(STUDIO_GA4_EVENTS) as string[]).includes('purchase'));
  for (const [file, code] of islandSources()) {
    const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(withoutComments, /['"`]purchase['"`]/, `${file} names a purchase event`);
    assert.doesNotMatch(withoutComments, /gtag\(|\bym\(|dataLayer/, `${file} talks to analytics directly instead of through analytics.ts`);
  }
});
