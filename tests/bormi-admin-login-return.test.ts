import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ADMIN_LOGIN_DEFAULT,
  ADMIN_RETURN_PARAM,
  safeAdminReturnPath,
} from '../src/shared/admin-return-path';

// ── The way back into the panel ───────────────────────────────────────────────
//
// The defect these tests exist for: `/admin/` sent an operator with no session
// to `/admin-tools/login`, the login signed them in and navigated to its own
// fixed destination, and the panel they had asked for was never reached. The
// old console became the end of the journey rather than a neighbour of it.
//
// The fix is a return path, and a return path is the standard open-redirect
// hole, so most of what follows is about what the login refuses to do with it.
// The rule is a whitelist: a path this origin serves under `/admin`, nothing
// else, and no credential anywhere near it.

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** Source with prose removed, so assertions test code and not comments. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const LOGIN = 'src/admin/pages/Login.tsx';
const PANEL_API = 'apps/bormi-admin/src/lib/api.ts';
const PANEL_APP = 'apps/bormi-admin/src/App.tsx';
const PANEL_QUERY = 'apps/bormi-admin/src/lib/useQuery.ts';

// ── What a return path may be ────────────────────────────────────────────────

test('return path: every screen this panel serves is accepted', () => {
  for (const path of [
    '/admin',
    '/admin/',
    '/admin/listings',
    '/admin/listings/prod_123',
    '/admin/categories',
    '/admin/operations',
    '/admin/operations/orders/ord_1',
    '/admin/audit',
    '/admin/system',
    '/admin/access',
  ]) {
    assert.equal(safeAdminReturnPath(path), path, `${path} should be allowed`);
  }
});

test('return path: nothing outside this panel is accepted', () => {
  for (const path of [
    // Somewhere else on this site, including the console we came from: the
    // panel asks to return to the panel, never to redirect the browser onward.
    '/',
    '/admin-tools/agents',
    '/admin-tools/login',
    '/ru/blog',
    '/api/admin/overview',
    // Not the panel, merely prefixed like it.
    '/administrator',
    '/adminx',
    '/admin-tools',
  ]) {
    assert.equal(safeAdminReturnPath(path), null, `${path} should be refused`);
  }
});

test('return path: every off-origin shape is refused', () => {
  for (const hostile of [
    'https://evil.example/admin/',
    'http://evil.example/admin/',
    '//evil.example/admin/',
    '/\\evil.example/admin/',
    '\\\\evil.example\\admin',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>',
    'admin/listings',
    ' /admin/listings',
    '/admin/listings\n',
    '/admin/../admin-tools/agents',
    `/admin/${'a'.repeat(300)}`,
  ]) {
    assert.equal(safeAdminReturnPath(hostile), null, `${hostile} should be refused`);
  }
});

test('return path: an absent, empty or malformed value is simply absent', () => {
  for (const nothing of [null, undefined, '', '   ']) {
    assert.equal(safeAdminReturnPath(nothing), null);
  }
  // A percent-escape is refused rather than decoded: decoding is how `%2F%2F`
  // becomes `//` one layer too late.
  assert.equal(safeAdminReturnPath('/admin/%2e%2e%2fadmin-tools'), null);
});

test('return path: the default the login already had is unchanged', () => {
  assert.equal(ADMIN_LOGIN_DEFAULT, '/admin-tools/');
  assert.equal(ADMIN_RETURN_PARAM, 'returnTo');
});

// ── How the login uses it ────────────────────────────────────────────────────

test('login: the return path is read from the query and validated before use', async () => {
  const login = code(await source(LOGIN));
  assert.match(login, /safeAdminReturnPath\(searchParams\.get\(ADMIN_RETURN_PARAM\)\)/);
  // The raw parameter never reaches a navigation. Every use goes through the
  // validated `returnTo`.
  assert.doesNotMatch(login, /(?:assign|replace|nav)\(\s*searchParams\.get/);
  // And it comes from the query string only — not from the referrer, not from
  // storage, not from anything the previous page could have left behind.
  assert.doesNotMatch(login, /document\.referrer|localStorage\.getItem\('returnTo'\)|sessionStorage/);
});

test('login: a validated return path is a document load that leaves no history entry', async () => {
  const login = code(await source(LOGIN));
  // The panel is a separate application behind its own Function, so a router
  // navigation would render nothing. `replace` is what stops Back from walking
  // into a signed-in login form and bouncing forward again.
  assert.match(login, /window\.location\.replace\(returnTo\)/);
  assert.doesNotMatch(login, /window\.location\.assign\(returnTo\)/);
});

test('login: without a return path the legacy destination is exactly what it was', async () => {
  const login = code(await source(LOGIN));
  assert.match(login, /nav\('\/admin-tools\/'\)/);
  assert.match(login, /nav\('\/admin-tools\/', \{ replace: true \}\)/);
});

test('login: signing in still mints one session through the endpoint that owns it', async () => {
  const login = code(await source(LOGIN));
  // The fix added a destination, not an authority: the same call, the same
  // token store, the same captcha gate in front of it.
  assert.match(login, /api\.login\(email, password, turnstileToken \|\| undefined\)/);
  assert.match(login, /setToken\(r\.token\)/);
  const setTokenCalls = [...login.matchAll(/setToken\(/g)].length;
  assert.equal(setTokenCalls, 1, 'exactly one place stores a session');
  assert.match(login, /if \(turnstileRequired && !turnstileToken\)/);
});

// ── How the panel asks ───────────────────────────────────────────────────────

test('panel: the login is told which screen asked, and only ever one of ours', async () => {
  const api = code(await source(PANEL_API));
  assert.match(api, /export function loginUrl\(\)/);
  assert.match(api, /\$\{LOGIN_URL\}\?returnTo=\$\{encodeURIComponent\(here\)\}/);
  // A path that is not this panel's falls back to the bare login rather than
  // being sent along.
  assert.match(api, /if \(!\/\^\\\/admin.*\.test\(here\)\) return LOGIN_URL;/);
  // The panel still has no login of its own and still writes no credential.
  assert.match(api, /export const LOGIN_URL = '\/admin-tools\/login'/);
  assert.doesNotMatch(api, /localStorage\.setItem/);
});

test('panel: no session and an expired session both go back the same way', async () => {
  const app = code(await source(PANEL_APP));
  const query = code(await source(PANEL_QUERY));
  assert.match(app, /window\.location\.assign\(loginUrl\(\)\)/);
  assert.match(query, /failure\.status === 401/);
  assert.match(query, /window\.location\.assign\(loginUrl\(\)\)/);
});

test('panel: an expired session is dropped before the login is handed the browser', async () => {
  const query = code(await source(PANEL_QUERY));
  // The order is the whole point. The login returns a caller who still holds a
  // token straight back to the screen that just rejected it, so a token left in
  // storage is an endless round trip rather than a form to sign in on.
  const branch = query.slice(query.indexOf('failure.status === 401'));
  const cleared = branch.indexOf('clearSession()');
  const left = branch.indexOf('window.location.assign(loginUrl())');
  assert.ok(cleared >= 0, 'the dead session is cleared');
  assert.ok(left > cleared, 'it is cleared before the browser leaves');

  const api = code(await source(PANEL_API));
  // One removal, used by both the sign-out control and the expiry path. Still
  // no second store and still nothing written under a new key.
  assert.match(api, /export function clearSession\(\)/);
  assert.match(api, /localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.doesNotMatch(api, /localStorage\.setItem/);
  const removals = [...api.matchAll(/localStorage\.removeItem/g)].length;
  assert.equal(removals, 1, 'exactly one place forgets a session');
});

test('panel: a 403 says no, and never redirects into the other console', async () => {
  const app = code(await source(PANEL_APP));
  const forbidden = app.slice(app.indexOf("error === 'insufficient_role'"));
  const nextGuard = forbidden.indexOf('if (error || !data)');
  const branch = forbidden.slice(0, nextGuard > 0 ? nextGuard : undefined);
  // The old console is offered as a link the operator may press. It is not a
  // redirect, and it is not the login.
  assert.doesNotMatch(branch, /window\.location|loginUrl\(\)|Navigate/);
  assert.match(branch, /href="\/admin-tools\/agents"/);
});

test('panel: nothing about this puts a credential in a URL', async () => {
  for (const file of [PANEL_API, PANEL_APP, PANEL_QUERY, LOGIN]) {
    const text = code(await source(file));
    assert.doesNotMatch(text, /[?&](token|jwt|bearer|access_token|password)=/i, `${file}`);
  }
  const api = code(await source(PANEL_API));
  // `loginUrl` is built from the location only. The token is not in scope there.
  const fn = api.slice(api.indexOf('export function loginUrl'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.doesNotMatch(body, /token\(\)|TOKEN_KEY|Authorization/);
});

test('panel: it still imports nothing from the application around it', async () => {
  for (const file of [PANEL_API, PANEL_APP, PANEL_QUERY]) {
    const text = code(await source(file));
    assert.doesNotMatch(text, /from '(\.\.\/)+\.\.\/src\//, `${file} reaches into the root app`);
    assert.doesNotMatch(text, /shared\/admin-return-path/, `${file} shares a module across builds`);
  }
});

// ── What this change is not ──────────────────────────────────────────────────

test('the way back adds no migration, no endpoint and no flag', async () => {
  const login = code(await source(LOGIN));
  const api = code(await source(PANEL_API));
  const shared = code(await source('src/shared/admin-return-path.ts'));
  for (const text of [login, api, shared]) {
    assert.doesNotMatch(text, /INSERT |UPDATE |DELETE |CREATE TABLE|ALTER TABLE/i);
    assert.doesNotMatch(text, /MARKET_QUICKPOST|MARKET_OWNER_TELEGRAM_BINDING|BORMI_ADMIN_V2_ENABLED/);
  }
  // No second front door: the only login on this origin is still the one that
  // was already here.
  assert.doesNotMatch(shared, /password|credential|token/i);
});
