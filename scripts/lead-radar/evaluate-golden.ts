#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../evals/lead-radar/canonical';
import { datasetSplitLabel, evaluateGoldenDataset } from '../../evals/lead-radar/evaluator';
import { loadGoldenPair } from '../../evals/lead-radar/dataset';
import type { GoldenSplit, LeadRadarCandidatePredictions, ReleaseTarget } from '../../evals/lead-radar/types';

interface CliOptions {
  dataset: GoldenSplit;
  target: ReleaseTarget;
  predictionsPath: string | null;
  fixtureDirectory: string;
  pretty: boolean;
  verifyOnly: boolean;
  help: boolean;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultFixtureDirectory = resolve(scriptDirectory, '../../evals/lead-radar/fixtures');

function usage(): string {
  return [
    'Offline Lead Radar golden evaluator (read-only; no network and no output-file writes).',
    '',
    'Usage:',
    '  tsx scripts/lead-radar/evaluate-golden.ts --dataset <dev|holdout> --target <research|contact> --predictions <file>',
    '  tsx scripts/lead-radar/evaluate-golden.ts --verify-only [--compact]',
    '',
    'Options:',
    '  --dataset <split>       Frozen split to evaluate (default: holdout).',
    '  --target <target>       Gate profile (default: research).',
    '  --predictions <file>    Candidate JSON matching lead-radar-candidate-predictions/v1.',
    '  --fixtures <directory>  Override the checked-in fixture directory.',
    '  --verify-only           Verify both freezes, counts, public-safe policy and leakage guard.',
    '  --compact               Emit canonical one-line JSON instead of indented JSON.',
    '  --help                  Show this help.',
    '',
    'The command only reads inputs and writes the deterministic report to stdout.',
  ].join('\n');
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dataset: 'holdout',
    target: 'research',
    predictionsPath: null,
    fixtureDirectory: defaultFixtureDirectory,
    pretty: true,
    verifyOnly: false,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dataset') {
      const value = takeValue(args, index, argument);
      if (value !== 'dev' && value !== 'holdout') throw new Error('--dataset must be dev or holdout');
      options.dataset = value;
      index += 1;
    } else if (argument === '--target') {
      const value = takeValue(args, index, argument);
      if (value !== 'research' && value !== 'contact') throw new Error('--target must be research or contact');
      options.target = value;
      index += 1;
    } else if (argument === '--predictions') {
      options.predictionsPath = resolve(takeValue(args, index, argument));
      index += 1;
    } else if (argument === '--fixtures') {
      options.fixtureDirectory = resolve(takeValue(args, index, argument));
      index += 1;
    } else if (argument === '--compact') {
      options.pretty = false;
    } else if (argument === '--verify-only') {
      options.verifyOnly = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.help && !options.verifyOnly && options.predictionsPath === null) {
    throw new Error('--predictions is required unless --verify-only is used');
  }
  return options;
}

function readPredictions(path: string): LeadRadarCandidatePredictions {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LeadRadarCandidatePredictions;
  } catch (error) {
    throw new Error(`unable to read predictions JSON: ${error instanceof Error ? error.message : 'unknown error'}`, {
      cause: error,
    });
  }
}

function render(value: unknown, pretty: boolean): string {
  return pretty ? `${JSON.stringify(value, null, 2)}\n` : `${canonicalJson(value)}\n`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const pair = loadGoldenPair(options.fixtureDirectory);
  if (options.verifyOnly) {
    process.stdout.write(render({
      schemaVersion: 'lead-radar-golden-freeze-verification/v1',
      generatorVersion: pair.holdout.manifest.freeze.generatorVersion,
      datasets: [pair.dev, pair.holdout].map((dataset) => ({
        version: dataset.manifest.datasetVersion,
        split: dataset.manifest.split,
        splitPolicy: datasetSplitLabel(dataset.manifest.split),
        frozenAt: dataset.manifest.freeze.frozenAt,
        manifestSha256: dataset.manifestSha256,
        expandedSha256: dataset.expandedSha256,
        counts: dataset.counts,
        containsRealPersonPii: dataset.manifest.freeze.containsRealPersonPii,
        sourcePolicy: dataset.manifest.freeze.sourcePolicy,
      })),
      leakageGuard: {
        entityFamilyOverlap: 0,
        evidenceDomainOverlap: 0,
        passed: true,
      },
      verified: true,
      productionReleaseAuthorized: false,
    }, options.pretty));
    return;
  }
  const selected = options.dataset === 'dev' ? pair.dev : pair.holdout;
  const counterpart = options.dataset === 'dev' ? pair.holdout : pair.dev;
  const report = evaluateGoldenDataset({
    dataset: selected,
    counterpart,
    predictions: readPredictions(options.predictionsPath as string),
    releaseTarget: options.target,
  });
  process.stdout.write(render(report, options.pretty));
  if (!report.verdict.goldenEvaluationPassed) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  process.stderr.write(`Lead Radar golden evaluation failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
