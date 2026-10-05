// scripts/email-off.ts: what Cloudflare Email Address Obfuscation would
// rewrite is wrapped in <!--email_off-->, nothing else moves, and the download
// guide is held back until R-S2 (roadmap R-S1 item 2.6).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { EMAIL_OFF, EMAIL_OFF_EXCLUDED_PATHS, EMAIL_ON, addressesLeftForTheEdge, withEmailOff } from '../scripts/email-off';
import { seoContract } from '../scripts/seo-protection';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const hasBuild = fs.existsSync(path.join(DIST, '.vite/manifest.json'));
const DOWNLOAD_GUIDE = '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/';
const LOGIN_GUIDE = '/uz/blog/chatgptga-qanday-kirish-mumkin/';
const page = (body: string, head = '<title>T</title>') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test('a mailto link is wrapped whole, its href and its text in one piece', () => {
  const html = page('<p>Yozing: <a href="mailto:ceo@gptbot.uz" class="x">ceo@gptbot.uz</a>.</p>');
  const out = withEmailOff(html, '/uz/');
  assert.equal(out, page(`<p>Yozing: ${EMAIL_OFF}<a href="mailto:ceo@gptbot.uz" class="x">ceo@gptbot.uz</a>${EMAIL_ON}.</p>`));
});

test('an address standing in text is wrapped, the sentence around it is not', () => {
  const html = page('<p>Напишите на ceo@gptbot.uz или позвоните.</p>');
  assert.equal(withEmailOff(html, '/ru/o-kompanii/'),
    page(`<p>Напишите на ${EMAIL_OFF}ceo@gptbot.uz${EMAIL_ON} или позвоните.</p>`));
});

test('what the edge never rewrites is left byte for byte: head, scripts, noscript, comments, other attributes', () => {
  const head = '<title>T</title><meta name="author" content="ceo@gptbot.uz"><script type="application/ld+json">{"email":"ceo@gptbot.uz"}</script>';
  const body = '<!-- ceo@gptbot.uz --><script>var e="ceo@gptbot.uz"</script><noscript>ceo@gptbot.uz</noscript>'
    + '<img alt="x" data-mail="ceo@gptbot.uz" src="/a.webp"><header><a href="/uz/">GPTBot.uz</a></header>';
  const html = page(body, head);
  assert.equal(withEmailOff(html, '/'), html);
});

test('a Telegram handle is not an address', () => {
  const html = page('<p>Bot: @gptbotuz_bot</p>');
  assert.equal(withEmailOff(html, '/uz/'), html);
});

test('the download guide is held back and comes back unchanged', () => {
  assert.ok(EMAIL_OFF_EXCLUDED_PATHS.has(DOWNLOAD_GUIDE));
  assert.equal(EMAIL_OFF_EXCLUDED_PATHS.size, 1);
  const html = page('<a href="mailto:ceo@gptbot.uz">ceo@gptbot.uz</a>');
  assert.equal(withEmailOff(html, DOWNLOAD_GUIDE), html);
});

test('the protected-page gate does not see the wrapper (comments are stripped before the fingerprint)', () => {
  const html = page('<main><h1>H</h1><p>E-mail: <a href="mailto:ceo@gptbot.uz">ceo@gptbot.uz</a>, ceo@gptbot.uz</p></main>');
  assert.deepEqual(seoContract(withEmailOff(html, '/')), seoContract(html));
});

test('running twice is a build error, not a nested wrapper', () => {
  const once = withEmailOff(page('<a href="mailto:ceo@gptbot.uz">x</a>'), '/');
  assert.throws(() => withEmailOff(once, '/'), /already wrapped/);
});

test('the checker sees exactly what the edge would still rewrite', () => {
  const html = page('<p>Kod: noreply@tm.openai.com</p><a href="mailto:ceo@gptbot.uz">yozing</a>',
    '<title>T</title><script type="application/ld+json">{"email":"ceo@gptbot.uz"}</script>');
  assert.deepEqual(addressesLeftForTheEdge(html), ['<a href="mailto:ceo@gptbot.uz">yozing</a>', 'noreply@tm.openai.com']);
  assert.deepEqual(addressesLeftForTheEdge(withEmailOff(html, '/uz/')), []);
});

// Build output (skipped without dist/): only the download guide keeps an
// address for the edge until R-S2, and the login guide's own facts — the OTP
// sender addresses and noreply@openai.com in its error table and FAQ — reach
// readers as text, never as «[email protected]». Those sentences ship only
// together with withEmailOff; never revert email_off on that page alone.
const builtPages = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) out.push(full);
    }
  };
  walk(DIST);
  return out;
};
const pathnameOf = (file: string) => {
  const rel = path.relative(DIST, file).split(path.sep).join('/');
  return rel.endsWith('index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
};

test('in the build, every page but the download guide leaves nothing for the edge', {
  skip: !hasBuild && 'run the public build first',
}, () => {
  const left = builtPages()
    .filter((file) => !EMAIL_OFF_EXCLUDED_PATHS.has(pathnameOf(file)))
    .map((file) => ({ page: pathnameOf(file), left: addressesLeftForTheEdge(fs.readFileSync(file, 'utf8')) }))
    .filter((p) => p.left.length > 0);
  assert.deepEqual(left, []);
  const download = fs.readFileSync(path.join(DIST, `${DOWNLOAD_GUIDE.slice(1)}index.html`), 'utf8');
  assert.ok(!download.includes(EMAIL_OFF), 'the download guide is not wrapped before R-S2');
});

test('in the build, the login guide shows its code-sender addresses as wrapped text', {
  skip: !hasBuild && 'run the public build first',
}, () => {
  const html = fs.readFileSync(path.join(DIST, `${LOGIN_GUIDE.slice(1)}index.html`), 'utf8');
  for (const address of ['noreply@tm.openai.com', 'otp@tm1.openai.com', 'noreply@openai.com']) {
    assert.ok(html.includes(`${EMAIL_OFF}${address}${EMAIL_ON}`), `${address} is wrapped`);
  }
  assert.deepEqual(addressesLeftForTheEdge(html), []);
});
