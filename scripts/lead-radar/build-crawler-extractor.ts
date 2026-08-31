/** Offline single-file canonical helper, packaged by the isolated installer. */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('usage: build-crawler-extractor.ts [--out path]');
const outfile = args.length ? resolve(args[1]) : resolve(root, 'tools/lead-radar-crawler/dist/extractor.mjs');
await build({ entryPoints: [resolve(root, 'tools/lead-radar-crawler/extractor-cli.ts')], outfile,
  bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'bundle',
  minify: false, sourcemap: false, legalComments: 'none', logLevel: 'warning' });
console.log('crawler_extractor_built');
