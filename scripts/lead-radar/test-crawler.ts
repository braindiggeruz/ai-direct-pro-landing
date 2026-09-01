/** Offline collector tests in its own environment; never reuse the Telegram venv. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../..', import.meta.url));
const python = path.join(root, 'tools/lead-radar-crawler/.venv-scrapling',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python)) {
  console.error('crawler_test_environment_missing: create the isolated hash-pinned .venv-scrapling documented in tools/lead-radar-crawler/README.md');
  process.exitCode = 1;
} else {
  const types = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.crawler.json'], {
    cwd: root, stdio: 'inherit', shell: false, windowsHide: true, timeout: 60_000,
  });
  if (types.error || types.status !== 0) throw new Error('crawler_extractor_typecheck_failed');
  const build = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/lead-radar/build-crawler-extractor.ts'], {
    cwd: root, stdio: 'inherit', shell: false, windowsHide: true, timeout: 60_000,
  });
  if (build.error || build.status !== 0) throw new Error('crawler_extractor_build_failed');
  const run = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], {
    cwd: path.join(root, 'tools/lead-radar-crawler'), stdio: 'inherit', shell: false,
    timeout: 180_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', CRAWLER_TOKEN: '', CRAWLER_API_BASE: '',
      CRAWLER_NODE: process.execPath, CRAWLER_EXTRACTOR: path.join(root, 'tools/lead-radar-crawler/dist/extractor.mjs') },
  });
  if (run.error) console.error('crawler_test_process_failed');
  process.exitCode = run.status ?? 1;
}
