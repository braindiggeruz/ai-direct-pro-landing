import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENTRIES, readViteManifest, type ViteManifest } from './vite-manifest';

// What the AI-chat page downloads before it can answer, and what each lazy part
// adds the first time it is needed (10-PROD-PLAN §1, WP-10):
//   start      — the chat entry and every chunk it imports statically, ≤ 110 kB;
//   lazy part  — a chunk the start may import() plus its static imports that
//                the start does not already carry, ≤ 12 kB each;
//   growth     — the start may grow by ≤ 3 kB per release against the baseline
//                recorded at the last release (docs/paid-chat/bundle-baseline.json);
//   start CSS  — the chat's own stylesheet (the CSS its entry and the start's
//                chunks import: premium.css, account.css, article.css; chat
//                design 2026-10-06), ≤ 7 kB, growth ≤ 1 kB per release once a
//                baseline records it;
//   page CSS   — what blocks the chat page's first paint: the site's shared
//                index-*.css (the landing entry's sheet, on every page) plus the
//                chat's own, ≤ 27 kB, so moving rules between the two sheets
//                cannot hide growth (production 0f983c1c: 24 267 B, one sheet).
// Sizes are brotli quality 11 per file (each file travels compressed on its
// own), in decimal kB as map 03 §7 measured them.
//
//   npx tsx scripts/chat-bundle-budget.ts                  check dist/
//   npx tsx scripts/chat-bundle-budget.ts --dist <dir>     check another build
//   npx tsx scripts/chat-bundle-budget.ts --record         write the baseline (release step)

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BASELINE_FILE = 'docs/paid-chat/bundle-baseline.json';
export const CHAT_BUDGET = { start: 110_000, lazyPart: 12_000, startGrowth: 3_000, startCss: 7_000, startCssGrowth: 1_000, pageCss: 27_000 } as const;
export type ChatBudget = { start: number; lazyPart: number; startGrowth: number; startCss: number; startCssGrowth: number; pageCss: number };

export interface BundlePart {
  /** The manifest name of the chunk the part is loaded through (chat-account, …). */
  name: string;
  bytes: number;
  files: string[];
}
export interface BundleReport {
  entry: string;
  start: { bytes: number; files: string[] };
  /** The chat's own stylesheet: the CSS the start's chunks import. */
  startCss: { bytes: number; files: string[] };
  /** Every stylesheet the chat page links before it paints: the site's shared sheet and the chat's. */
  pageCss: { bytes: number; files: string[] };
  parts: BundlePart[];
}
export interface BundleBaseline {
  /** 2 adds startCssBytes; a schema 1 baseline (before the chat had a sheet of its own) has none. */
  schema: 1 | 2;
  recordedAt: string;
  /** Which build the numbers come from, in words (a commit cannot name itself). */
  source: string;
  entry: string;
  startBytes: number;
  startCssBytes?: number;
  parts: Record<string, number>;
}

/** Every chunk reachable from `roots` through static imports, roots included. */
export function staticClosure(manifest: ViteManifest, roots: string[]): string[] {
  const seen = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`The manifest has no chunk ${key}.`);
    seen.add(key);
    for (const next of chunk.imports ?? []) visit(next);
  };
  roots.forEach(visit);
  return [...seen];
}

const scripts = (manifest: ViteManifest, keys: Iterable<string>) =>
  [...keys].map((key) => manifest[key].file).filter((file) => file.endsWith('.js')).sort();
const styles = (manifest: ViteManifest, keys: Iterable<string>) =>
  [...new Set([...keys].flatMap((key) => manifest[key]?.css ?? []))].sort();

/**
 * The start closure of `entry`, then every lazy part reachable from it through
 * import(), parts inside parts included. A part costs what it adds to the start.
 */
export function measureChatBundle(
  manifest: ViteManifest,
  size: (file: string) => number,
  entry: string = ENTRIES.chat,
): BundleReport {
  if (!manifest[entry]?.isEntry) throw new Error(`Vite entry ${entry} is not in the manifest.`);
  const start = staticClosure(manifest, [entry]);
  const loaded = new Set(start);
  const sum = (files: string[]) => files.reduce((total, file) => total + size(file), 0);
  const parts: BundlePart[] = [];
  const queued = new Set<string>();
  const queue = start.flatMap((key) => manifest[key].dynamicImports ?? []);
  while (queue.length) {
    const root = queue.shift()!;
    if (queued.has(root) || loaded.has(root)) continue;
    queued.add(root);
    const closure = staticClosure(manifest, [root]);
    const files = scripts(manifest, closure.filter((key) => !loaded.has(key)));
    parts.push({ name: manifest[root].name ?? root, bytes: sum(files), files });
    for (const key of closure) queue.push(...(manifest[key].dynamicImports ?? []));
  }
  const startFiles = scripts(manifest, start);
  const cssFiles = styles(manifest, start);
  const pageFiles = [...new Set([...styles(manifest, [ENTRIES.landing]), ...cssFiles])];
  return {
    entry,
    start: { bytes: sum(startFiles), files: startFiles },
    startCss: { bytes: sum(cssFiles), files: cssFiles },
    pageCss: { bytes: sum(pageFiles), files: pageFiles },
    parts: parts.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** What breaks the budget; empty when the build passes. */
export function budgetFailures(
  report: BundleReport,
  baseline: BundleBaseline | null,
  budget: ChatBudget = CHAT_BUDGET,
): string[] {
  const failures: string[] = [];
  if (report.start.bytes > budget.start) {
    failures.push(`start ${kb(report.start.bytes)} > ${kb(budget.start)}`);
  }
  if (report.startCss.bytes > budget.startCss) failures.push(`start CSS ${kb(report.startCss.bytes)} > ${kb(budget.startCss)}`);
  if (report.pageCss.bytes > budget.pageCss) failures.push(`page CSS ${kb(report.pageCss.bytes)} > ${kb(budget.pageCss)}`);
  for (const part of report.parts) {
    if (part.bytes > budget.lazyPart) failures.push(`lazy part ${part.name} ${kb(part.bytes)} > ${kb(budget.lazyPart)}`);
  }
  if (!baseline) {
    failures.push(`no baseline: record one with --record (${BASELINE_FILE})`);
    return failures;
  }
  if (baseline.entry !== report.entry) failures.push(`baseline is for ${baseline.entry}, not ${report.entry}`);
  const growth = report.start.bytes - baseline.startBytes;
  if (growth > budget.startGrowth) {
    failures.push(`start grew ${kb(growth)} since the baseline (${kb(baseline.startBytes)}) > ${kb(budget.startGrowth)}`);
  }
  const cssGrowth = baseline.startCssBytes === undefined ? 0 : report.startCss.bytes - baseline.startCssBytes;
  if (cssGrowth > budget.startCssGrowth) {
    failures.push(`start CSS grew ${kb(cssGrowth)} since the baseline (${kb(baseline.startCssBytes!)}) > ${kb(budget.startCssGrowth)}`);
  }
  // A part the baseline knows that the build lost was most likely imported
  // statically somewhere: it now loads with the start for everyone.
  for (const name of Object.keys(baseline.parts)) {
    if (!report.parts.some((part) => part.name === name)) failures.push(`lazy part ${name} is gone: is it imported statically now?`);
  }
  return failures;
}

export function brotliSize(content: Buffer): number {
  return zlib.brotliCompressSync(content, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: content.length,
    },
  }).length;
}

export function kb(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

export function readBaseline(file = path.join(ROOT, BASELINE_FILE)): BundleBaseline | null {
  if (!fs.existsSync(file)) return null;
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8')) as BundleBaseline;
  if ((baseline.schema !== 1 && baseline.schema !== 2) || !Number.isInteger(baseline.startBytes) || typeof baseline.parts !== 'object'
    || (baseline.schema === 2 && !Number.isInteger(baseline.startCssBytes))) {
    throw new Error(`Invalid bundle baseline ${BASELINE_FILE}.`);
  }
  return baseline;
}

export function measureDist(dist: string): BundleReport {
  return measureChatBundle(readViteManifest(dist), (file) => brotliSize(fs.readFileSync(path.join(dist, file))));
}

/** The release gate: throws with every failure, or returns the report. */
export function assertChatBundleBudget(dist: string, baselineFile = path.join(ROOT, BASELINE_FILE)): BundleReport {
  const report = measureDist(dist);
  const failures = budgetFailures(report, readBaseline(baselineFile));
  if (failures.length) throw new Error(`Chat bundle over budget:\n${failures.join('\n')}`);
  return report;
}

function describe(report: BundleReport, baseline: BundleBaseline | null): string {
  const delta = (now: number, before: number | undefined) =>
    before === undefined ? '' : ` (${now - before >= 0 ? '+' : ''}${now - before} B vs baseline)`;
  return [
    `start ${report.start.bytes} B br = ${kb(report.start.bytes)}${delta(report.start.bytes, baseline?.startBytes)}`,
    ...report.start.files.map((file) => `  ${file}`),
    `start CSS ${report.startCss.bytes} B br = ${kb(report.startCss.bytes)}${delta(report.startCss.bytes, baseline?.startCssBytes)}: ${report.startCss.files.join(', ')}`,
    `page CSS ${report.pageCss.bytes} B br = ${kb(report.pageCss.bytes)}: ${report.pageCss.files.join(', ')}`,
    ...report.parts.map((part) =>
      `lazy ${part.name} ${part.bytes} B br = ${kb(part.bytes)}${delta(part.bytes, baseline?.parts[part.name])}: ${part.files.join(', ')}`),
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const at = args.indexOf('--dist');
  const dist = path.resolve(at >= 0 && args[at + 1] ? args[at + 1] : path.join(ROOT, 'dist'));
  const report = measureDist(dist);
  const baseline = readBaseline();
  console.log(describe(report, baseline));
  if (args.includes('--record')) {
    const hard = budgetFailures(report, null).filter((failure) => !failure.startsWith('no baseline'));
    if (hard.length) throw new Error(`Refusing to record a baseline over budget:\n${hard.join('\n')}`);
    const source = args[args.indexOf('--record') + 1];
    const recorded: BundleBaseline = {
      schema: 2,
      recordedAt: new Date().toISOString(),
      source: source && !source.startsWith('--') ? source : 'local build',
      entry: report.entry,
      startBytes: report.start.bytes,
      startCssBytes: report.startCss.bytes,
      parts: Object.fromEntries(report.parts.map((part) => [part.name, part.bytes])),
    };
    fs.writeFileSync(path.join(ROOT, BASELINE_FILE), `${JSON.stringify(recorded, null, 2)}\n`);
    console.log(`Recorded ${BASELINE_FILE}.`);
    return;
  }
  const failures = budgetFailures(report, baseline);
  if (failures.length) throw new Error(`Chat bundle over budget:\n${failures.join('\n')}`);
  console.log(`Chat bundle within budget: start ≤ ${kb(CHAT_BUDGET.start)}, lazy parts ≤ ${kb(CHAT_BUDGET.lazyPart)}, growth ≤ ${kb(CHAT_BUDGET.startGrowth)}; start CSS ≤ ${kb(CHAT_BUDGET.startCss)}, page CSS ≤ ${kb(CHAT_BUDGET.pageCss)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Chat bundle budget failed.');
    process.exitCode = 1;
  }
}
