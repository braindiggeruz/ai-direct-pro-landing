import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

test('real HTTP process exposes bounded private-free liveness and no render endpoint', { timeout: 20000 }, async () => {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const secret = 'test-health-secret-never-exposed-000000';
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: String(port), DOCUMENT_API_BASE_URL: 'https://document-worker.invalid', DOCUMENT_API_ALLOWED_HOSTS: 'document-worker.invalid', DOCUMENT_WORKER_SECRET: secret };
  const child = spawn(process.execPath, [fileURLToPath(new URL('../apps/document-worker/src/index.mjs', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('startup_timeout')), 10000);
      child.stdout.on('data', chunk => { logs += chunk; if (logs.includes('document_worker_started')) { clearTimeout(timeout); resolve(); } });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('unexpected_exit')); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok', busy: false });
    const denied = await fetch(`http://127.0.0.1:${port}/render`, { method: 'POST', body: '<script>secret</script>' });
    assert.equal(denied.status, 404); assert.equal(await denied.text(), '{"error":"not_found"}');
    assert.ok(!logs.includes(secret)); assert.ok(!logs.includes('document-worker.invalid'));
  } finally { child.kill('SIGKILL'); }
});
