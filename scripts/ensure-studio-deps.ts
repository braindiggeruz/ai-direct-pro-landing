// The main chat imports Studio lazily, so a fresh root build needs its pinned
// dependencies before Vite starts. Existing matching installs are left alone.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const studio = fileURLToPath(new URL('../apps/studio/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(studio + 'package.json', 'utf8'));
const ready = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).every(([name, version]) => {
  try { return JSON.parse(fs.readFileSync(studio + `node_modules/${name}/package.json`, 'utf8')).version === version; }
  catch { return false; }
});
if (!ready) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/c', 'npm --prefix apps/studio ci'], { cwd: root, stdio: 'inherit' })
    : spawnSync('npm', ['--prefix', 'apps/studio', 'ci'], { cwd: root, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
