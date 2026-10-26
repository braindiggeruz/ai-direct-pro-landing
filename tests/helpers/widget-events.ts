// Ш4 (monetization roadmap 2026-10-25 §5.2): each widget entry sends GA4
// events through its own small report() helper, once per page view, with a
// fixed name from a closed list and nothing but the page's path and language
// (the quiz adds how many answers were right). The helper is copied into each
// entry on purpose: a module the widgets shared would become a chunk of its
// own. These checks read the entry's source and run its helper.
import assert from 'node:assert/strict';
import ts from 'typescript';

function helperSource(source: string): string {
  const from = source.indexOf('/** Ш4: the steps GA4 hears about');
  const fn = source.indexOf('function report(');
  const to = source.indexOf('\n}\n', fn);
  assert.ok(from >= 0 && fn > from && to > fn, 'the entry has the report() helper');
  return source.slice(from, to + 3);
}

/** The entry sends exactly `names`, only through report(), never to Metrika, never a request. */
export function assertWidgetEvents(file: string, raw: string, names: readonly string[]): void {
  const source = raw.replace(/\r\n/g, '\n');
  const helper = helperSource(source);
  const type = helper.match(/type WidgetEvent = ([^;]+);/);
  assert.ok(type, `${file}: a closed list of events`);
  assert.deepEqual([...type[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...names], file);
  assert.match(helper, /if \(reported\.has\(event\)\) return;\s*reported\.add\(event\);/, `${file}: once per page view`);
  assert.match(helper, /const data = \{ route: location\.pathname, lang: document\.documentElement\.lang\.slice\(0, 2\)(?:, \.\.\.counts)? \};/, `${file}: the path and language only`);
  const outside = source.replace(helper, '');
  assert.doesNotMatch(outside, /gtag|dataLayer/, `${file}: GA4 only through report()`);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|ym\(|localStorage|sessionStorage/, `${file}: no request, no Metrika call, no storage`);
  const sent = [...outside.matchAll(/report\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(sent)].sort(), [...names].sort(), `${file}: every event is sent somewhere, none outside the list`);
}

/** Runs the entry's helper against a fake window: what GA4 (or GTM's dataLayer) receives. */
export function runReport(raw: string, opts: { gtag: boolean; path?: string; lang?: string }) {
  const source = raw.replace(/\r\n/g, '\n');
  const helper = helperSource(source).replace(/^type WidgetEvent = [^;]+;$/m, '');
  const js = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022 }, reportDiagnostics: false }).outputText;
  const calls: unknown[][] = [];
  const window: { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] } = opts.gtag ? { gtag: (...args) => { calls.push(args); } } : {};
  const report = new Function('window', 'location', 'document', `${js}\nreturn report;`)(
    window,
    { pathname: opts.path ?? '/uz/kalkulyator/' },
    { documentElement: { lang: opts.lang ?? 'uz' } },
  ) as (event: string, counts?: Record<string, number>) => void;
  return { report, calls, window };
}
