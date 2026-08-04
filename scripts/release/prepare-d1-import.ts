import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  prepareRestoreStatements,
  splitSqlStatements,
} from './d1-export-restore';

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (!value) throw new Error(`missing ${name}`);
  return path.resolve(value);
}

async function main(): Promise<void> {
  const input = argument('--input');
  const output = argument('--output');
  const root = path.resolve(import.meta.dirname, '../..');
  if (input === output) throw new Error('input and output must differ');
  if (output.startsWith(`${root}${path.sep}`)) {
    throw new Error('prepared import must stay outside the Git workspace');
  }
  const dump = await readFile(input, 'utf8');
  const prepared = prepareRestoreStatements(splitSqlStatements(dump));
  if (prepared.statements.length === 0) throw new Error('empty D1 export');
  await writeFile(
    output,
    `${prepared.statements.map((statement) => `${statement};`).join('\n')}\n`,
    'utf8',
  );
  console.log(JSON.stringify({
    verdict: 'PASS',
    statements: prepared.statements.length,
    reorderedStatements: prepared.reorderedStatements,
    output: 'external-release-artifact',
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'D1 import preparation failed');
  process.exitCode = 1;
});
