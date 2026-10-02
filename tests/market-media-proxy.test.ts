// The GPTBot Market media proxy (functions/platform/market/media.ts) on the
// Workers runtime: workerd rejects fetch(..., { redirect: 'error' }) before
// sending anything, so the proxy asks for 'manual' and refuses any 3xx itself
// (the bot token is in Telegram's URLs; a redirect is never followed).
// Run: node --import tsx --test tests/market-media-proxy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { proxyTelegramMedia } from '../functions/platform/market/media';
import { refuseLikeWorkerd } from './helpers/click-merchant-fake';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOKEN = '123456789:fixture-token-not-real';

interface Call {
  url: string;
  redirect: RequestRedirect | undefined;
}

/** A Telegram Bot API fake that answers like workerd: 'error' throws, 'manual' hands back a 3xx. */
function telegram(t: { after: (fn: () => void) => void }, answers: Array<() => Response>) {
  const calls: Call[] = [];
  const cancelled: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    refuseLikeWorkerd(init);
    const url = String(input);
    calls.push({ url, redirect: init?.redirect });
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected call ${url}`);
    const response = answer();
    // Record a released body: a refused redirect must not hold the connection.
    const body = response.body;
    if (body) {
      const cancel = body.cancel.bind(body);
      body.cancel = async (reason?: unknown) => {
        cancelled.push(url);
        return cancel(reason);
      };
    }
    return response;
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  return { calls, cancelled };
}

const fileInfo = () => Response.json({ ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 1024 } });
const moved = (to: string) => new Response('moved', { status: 302, headers: { Location: to } });

test('an image is proxied: two calls, both without following redirects', async (t) => {
  const fake = telegram(t, [fileInfo, () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '3' } })]);
  const response = await proxyTelegramMedia(TOKEN, 'file-id');
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  assert.deepEqual(fake.calls.map((call) => call.redirect), ['manual', 'manual']);
});

test('a redirect at getFile or at the file is a failure, never followed, its body released', async (t) => {
  const atInfo = telegram(t, [() => moved('https://collector.example/steal')]);
  assert.equal(await proxyTelegramMedia(TOKEN, 'file-id'), null);
  assert.equal(atInfo.calls.length, 1);
  assert.equal(atInfo.cancelled.length, 1);
  const atFile = telegram(t, [fileInfo, () => moved('https://collector.example/steal')]);
  assert.equal(await proxyTelegramMedia(TOKEN, 'file-id'), null);
  assert.equal(atFile.calls.length, 2);
  assert.ok(atFile.calls.every((call) => !call.url.includes('collector.example')));
  assert.deepEqual(atFile.cancelled, [atFile.calls[1].url]);
});

test("no Workers code asks fetch for redirect 'error' (workerd refuses it at runtime)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|js|mjs)$/.test(name)) files.push(full);
    }
  };
  for (const dir of ['functions', 'workers']) walk(path.join(ROOT, dir));
  assert.ok(files.length > 100);
  const offenders = files.filter((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .some((line) => !/^\s*(\*|\/\/)/.test(line) && /redirect\s*:\s*['"]error['"]/.test(line)),
  );
  assert.deepEqual(offenders.map((file) => path.relative(ROOT, file)), []);
});
