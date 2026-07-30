import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import fg from 'fast-glob';

import {
  collectRouteInventory,
  compareRouteInventories,
  OWNER_CONTROL_CENTER_ADMIN_ROUTES,
  type RouteInventory,
} from '../scripts/release/react-router-route-inventory.ts';
import { scanText } from '../scripts/scan-secrets.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function readJson<T>(relative: string): T {
  return JSON.parse(read(relative)) as T;
}

function runtimeSource(): string {
  const files = fg.sync([
    'src/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    'functions/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    'vite.config.*',
  ], {
    cwd: ROOT,
    absolute: true,
    ignore: ['node_modules/**', 'dist/**', 'gptbot.uz-audit/**', 'gptbot-audit/**'],
  });
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

test('the supported React and Router versions are exact in the root manifest', () => {
  const pkg = readJson<{ dependencies: Record<string, string> }>('package.json');
  assert.equal(pkg.dependencies.react, '19.2.7');
  assert.equal(pkg.dependencies['react-dom'], '19.2.7');
  assert.equal(pkg.dependencies['react-router'], '8.3.0');
});

test('the installed React and Router versions match the root manifest', () => {
  for (const [name, version] of [
    ['react', '19.2.7'],
    ['react-dom', '19.2.7'],
    ['react-router', '8.3.0'],
  ]) {
    const pkg = readJson<{ version: string }>(`node_modules/${name}/package.json`);
    assert.equal(pkg.version, version, name);
  }
});

test('the Yarn lock resolves only the patched direct Router version', () => {
  const lock = read('yarn.lock');
  assert.match(lock, /^react-router@8\.3\.0:\r?$/m);
  assert.doesNotMatch(lock, /^react-router@(?:7\.|>=7\.12\.0)/m);
});

test('react-router-dom is absent from manifest, lockfile and installed graph', () => {
  const pkg = readJson<{ dependencies: Record<string, string> }>('package.json');
  assert.equal(pkg.dependencies['react-router-dom'], undefined);
  assert.doesNotMatch(read('yarn.lock'), /^react-router-dom@/m);
  assert.equal(fs.existsSync(path.join(ROOT, 'node_modules', 'react-router-dom')), false);
});

test('the root has one Yarn authority while the backend retains its npm lock', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'yarn.lock')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'package-lock.json')), false);
  assert.equal(
    fs.existsSync(path.join(ROOT, 'apps', 'gpt-backend', 'package-lock.json')),
    true,
  );
});

test('no second React Router major is present in the lockfile', () => {
  const keys = [...read('yarn.lock').matchAll(/^react-router@([^:]+):\r?$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(keys, ['8.3.0']);
});

test('all application Router imports use the v8 declarative package', () => {
  const files = fg.sync(['src/**/*.{ts,tsx}', 'tests/web-security-hardening.test.ts'], {
    cwd: ROOT,
    absolute: true,
  });
  const imports = files.flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/from ['"](react-router[^'"]*)['"]/g)]
      .map((match) => match[1]));
  assert.equal(imports.length, 20);
  assert.deepEqual([...new Set(imports)], ['react-router']);
});

test('no DOM subpath API is needed by this declarative BrowserRouter tree', () => {
  assert.doesNotMatch(runtimeSource(), /from ['"]react-router\/dom['"]/);
});

test('no React Server Components runtime package is installed', () => {
  const pkg = read('package.json');
  const lock = read('yarn.lock');
  assert.doesNotMatch(`${pkg}\n${lock}`, /react-server-dom-(?:webpack|parcel|turbopack)/);
});

test('unstable RSC APIs and use-server directives remain unreachable', () => {
  assert.doesNotMatch(
    runtimeSource(),
    /unstable_(?:matchRSCServerRequest|reactRouterRSC|RSC)|RSCStaticRouter|["']use server["']/i,
  );
});

test('server routers and SSR entries remain absent', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(inventory.invariants.server_router_absent, true);
  assert.equal(inventory.invariants.ssr_entry_absent, true);
});

test('data routers, loaders and actions remain absent', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(inventory.invariants.data_router_absent, true);
  assert.equal(inventory.invariants.loaders_actions_absent, true);
});

test('BrowserRouter stays declarative and inside the lazy admin chunk', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(inventory.invariants.browser_router_declarative, true);
  assert.equal(inventory.invariants.admin_lazy_loaded, true);
});

test('the migration preserves every public and admin route pattern', () => {
  const before = readJson<RouteInventory>(
    'reports/release/react-router-route-parity-before.json',
  );
  const after = collectRouteInventory('after');
  const diff = compareRouteInventories(before, after, {
    expectedAdminAdditions: OWNER_CONTROL_CENTER_ADMIN_ROUTES,
  });
  assert.equal(diff.status, 'pass');
  assert.equal(after.counts.total_route_patterns, 248);
  assert.deepEqual(diff.added_static_routes, []);
  assert.deepEqual(diff.removed_static_routes, []);
  assert.deepEqual(
    [...diff.added_admin_routes].sort(),
    [...OWNER_CONTROL_CENTER_ADMIN_ROUTES].sort(),
  );
});

test('all admin routes except login stay protected and fallback stays closed', () => {
  const inventory = collectRouteInventory('migration-test');
  const unprotected = inventory.admin_routes.filter((route) => !route.protected);
  assert.deepEqual(unprotected.map((route) => route.path), ['/admin-tools/login']);
  assert.equal(
    inventory.admin_routes.find((route) => route.kind === 'fallback')?.protected,
    true,
  );
});

test('unknown public routes retain a real 404 without a public SPA catch-all', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(inventory.cloudflare.public_catch_all_absent, true);
  assert.equal(inventory.cloudflare.public_404_present, true);
  assert.equal(
    inventory.cloudflare.routes_include.includes('/*'),
    false,
  );
});

test('the admin-only Cloudflare SPA rewrite remains exact', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(
    inventory.cloudflare.admin_spa_rewrite,
    '/admin-tools/*  /index.html  200',
  );
  assert.ok(inventory.cloudflare.routes_include.includes('/admin-tools/*'));
});

test('canonical host and legacy blog redirects remain present', () => {
  const redirects = read('public/_redirects');
  assert.match(
    redirects,
    /https:\/\/www\.gptbot\.uz\/\*\s+https:\/\/gptbot\.uz\/:splat\s+301/,
  );
  assert.match(redirects, /^\/blog\/\*\s+\/ru\/blog\/:splat\s+301$/m);
});

test('RU and UZ locale redirects and route families remain present', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(inventory.invariants.locale_redirects_present, true);
  assert.ok(inventory.static_canonical_routes.some((route) => route.startsWith('/ru/')));
  assert.ok(inventory.static_canonical_routes.some((route) => route.startsWith('/uz/')));
});

test('prerender generation remains part of the route contract', () => {
  assert.equal(
    collectRouteInventory('migration-test').invariants.prerender_generation_present,
    true,
  );
});

test('sitemap generation retains all 223 static canonical entries', () => {
  const inventory = collectRouteInventory('migration-test');
  assert.equal(inventory.invariants.sitemap_generation_present, true);
  assert.equal(inventory.counts.sitemap_entries, 223);
});

test('first-party automation routes remain present', () => {
  assert.equal(
    collectRouteInventory('migration-test')
      .invariants.first_party_automation_routes_present,
    true,
  );
});

test('the route inventory carries no n8n invariant', () => {
  // n8n retirement is asserted by tests/n8n-retirement.test.ts. Route parity
  // must not depend on it, or deleting the legacy env declaration would block
  // the routing gate for a non-routing reason.
  const invariants = collectRouteInventory('migration-test').invariants as Record<string, unknown>;
  assert.equal('legacy_n8n_default_off' in invariants, false);
  assert.equal(
    Object.keys(invariants).some((key) => /n8n/i.test(key)),
    false,
  );
});

test('the active audit policy has no advisory exception', () => {
  const policy = readJson<{
    advisories: unknown[];
    resolved_advisories: Array<{ id: string; disposition: string }>;
    enforcement: {
      production_audit_requires_zero_findings: boolean;
      temporary_router_exception_allowed: boolean;
    };
  }>('config/release-audit-policy.json');
  assert.deepEqual(policy.advisories, []);
  assert.deepEqual(policy.resolved_advisories, [{
    id: 'GHSA-qwww-vcr4-c8h2',
    package: 'react-router',
    severity: 'high',
    disposition: 'resolved_by_upgrade',
    resolved_on: '2026-07-28',
    resolved_version: '8.3.0',
    evidence: [
      'root Yarn production audit has zero findings',
      'react-router-dom is absent from the manifest, lockfile and installed graph',
      'React Router 8.3.0 is installed directly',
      'RSC, data-router, server-router and SSR runtime surfaces remain absent',
    ],
    migration_evidence:
      'docs/agents-platform/release/REACT_ROUTER_V8_MIGRATION_EVIDENCE.md',
  }]);
  assert.equal(policy.enforcement.production_audit_requires_zero_findings, true);
  assert.equal(policy.enforcement.temporary_router_exception_allowed, false);
});

test('built browser assets contain no credential-shaped values', () => {
  const files = fg.sync('dist/**/*.{html,js,css,json,txt,xml}', {
    cwd: ROOT,
    absolute: true,
  });
  assert.ok(files.length > 0, 'production build output is required');
  const findings = files.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const chunked = text.match(/.{1,2000}/gs)?.join('\n') ?? text;
    return scanText('build-output.txt', chunked);
  });
  assert.deepEqual(findings, []);
});

test('Router rollback instructions are present and deny remote mutation', () => {
  const rollback = read('docs/agents-platform/release/REACT_ROUTER_V8_ROLLBACK.md');
  for (const required of [
    'b128772e5375cfee87ad57622d546e7e363acc03',
    'React Router',
    'yarn.lock',
    'route parity',
    'forward fix',
    'no force-push',
    'no production deployment',
  ]) {
    assert.ok(rollback.toLowerCase().includes(required.toLowerCase()), required);
  }
});
