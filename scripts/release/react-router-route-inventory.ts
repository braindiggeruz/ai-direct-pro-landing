import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import fg from 'fast-glob';

import { ADMIN_HOME, ADMIN_ROUTE_PATHS } from '../../src/admin/routes';
import type { BlogArticle, Page } from '../../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '../..');

export interface AdminRouteInventoryItem {
  path: string;
  kind: 'index' | 'login' | 'protected' | 'fallback';
  protected: boolean;
}

export interface RouteInventory {
  schema_version: 1;
  label: string;
  generated_at: string;
  source_revision: string;
  counts: {
    static_canonical_routes: number;
    admin_route_patterns: number;
    total_route_patterns: number;
    published_pages: number;
    published_articles: number;
    sitemap_entries: number;
  };
  static_canonical_routes: string[];
  admin_routes: AdminRouteInventoryItem[];
  cloudflare: {
    admin_spa_rewrite: string;
    public_catch_all_absent: boolean;
    public_404_present: boolean;
    routes_include: string[];
  };
  invariants: {
    browser_router_declarative: boolean;
    admin_lazy_loaded: boolean;
    data_router_absent: boolean;
    loaders_actions_absent: boolean;
    server_router_absent: boolean;
    rsc_runtime_absent: boolean;
    ssr_entry_absent: boolean;
    canonical_redirects_present: boolean;
    locale_redirects_present: boolean;
    prerender_generation_present: boolean;
    sitemap_generation_present: boolean;
    first_party_automation_routes_present: boolean;
    };
  evidence_files: string[];
}

export interface RouteParityDiff {
  schema_version: 1;
  generated_at: string;
  before_label: string;
  after_label: string;
  status: 'pass' | 'blocked';
  added_static_routes: string[];
  removed_static_routes: string[];
  added_admin_routes: string[];
  removed_admin_routes: string[];
  changed_invariants: string[];
  count_deltas: Record<keyof RouteInventory['counts'], number>;
}

export const OWNER_CONTROL_CENTER_ADMIN_ROUTES = [
  '/admin-tools/agents/audit|protected|true',
  '/admin-tools/agents/automation|protected|true',
  '/admin-tools/agents/handoffs|protected|true',
  '/admin-tools/agents/orders|protected|true',
  '/admin-tools/agents/pilot|protected|true',
  '/admin-tools/agents/stores/:storeId|protected|true',
  '/admin-tools/agents/stores|protected|true',
  '/admin-tools/agents|protected|true',
] as const;

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function readJson<T>(relative: string): T {
  return JSON.parse(read(relative)) as T;
}

function currentRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));
}

function hasRuntimeMarker(pattern: RegExp): boolean {
  const files = fg.sync([
    'src/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    'functions/**/*.{ts,tsx,js,jsx,mjs,cjs}',
    'scripts/prerender*.ts',
    'scripts/generate-sitemap.ts',
    'vite.config.*',
  ], {
    cwd: ROOT,
    absolute: true,
    ignore: ['gptbot.uz-audit/**', 'node_modules/**', 'dist/**'],
  });
  return files.some((file) => pattern.test(fs.readFileSync(file, 'utf8')));
}

export function collectRouteInventory(label: string): RouteInventory {
  const pageFiles = fg.sync('pages/**/*.json', {
    cwd: path.join(ROOT, 'content'),
    absolute: true,
  });
  const pages = pageFiles
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as Page)
    .filter((page) => page.status === 'published' && page.robotsIndex !== false);

  const articleFiles = fg.sync('blog/**/*.json', {
    cwd: path.join(ROOT, 'content'),
    absolute: true,
  });
  const articles = articleFiles
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as BlogArticle)
    .filter((article) => article.status === 'published' && article.robotsIndex !== false);

  const articleLocales = new Set(articles.map((article) =>
    article.locale === 'uz' ? 'uz' : 'ru'));
  const staticRoutes = sorted([
    '/',
    ...pages.map((page) => page.url),
    ...articles.map((article) => article.url),
    ...(articleLocales.has('ru') ? ['/ru/blog/'] : []),
    ...(articleLocales.has('uz') ? ['/uz/blog/'] : []),
  ]);

  const adminRoutes: AdminRouteInventoryItem[] = [
    { path: ADMIN_HOME, kind: 'index', protected: true },
    ...Object.entries(ADMIN_ROUTE_PATHS).map(([name, route]) => ({
      path: route === '*' ? '/admin-tools/*' : `/admin-tools/${route}`,
      kind: route === '*'
        ? 'fallback' as const
        : name === 'login'
          ? 'login' as const
          : 'protected' as const,
      protected: name !== 'login',
    })),
  ].sort((a, b) => a.path.localeCompare(b.path, 'en'));

  const redirects = read('public/_redirects');
  const routesConfig = readJson<{ include?: string[] }>('public/_routes.json');
  const main = read('src/main.tsx');
  const adminRoot = read('src/admin/AdminRoot.tsx');
  const functionsRoot = read('functions/index.ts');

  const rscMarker = /unstable_(?:matchRSCServerRequest|reactRouterRSC|RSC)|RSCStaticRouter|react-server-dom|["']use server["']/i;
  const serverRouterMarker = /\b(?:StaticRouter|createStaticRouter|createRequestHandler|HydratedRouter)\b/;
  const ssrEntryMarker = /\bentry\.(?:server|ssr|rsc)\b/i;
  const dataRouterMarker =
    /\b(?:createBrowserRouter|createMemoryRouter|RouterProvider|useLoaderData|useActionData)\b/;
  const loaderActionMarker = /<Route[^>]+\b(?:loader|action)=/;

  return {
    schema_version: 1,
    label,
    generated_at: '2026-07-28',
    source_revision: currentRevision(),
    counts: {
      static_canonical_routes: staticRoutes.length,
      admin_route_patterns: adminRoutes.length,
      total_route_patterns: staticRoutes.length + adminRoutes.length,
      published_pages: pages.length,
      published_articles: articles.length,
      sitemap_entries: staticRoutes.length,
    },
    static_canonical_routes: staticRoutes,
    admin_routes: adminRoutes,
    cloudflare: {
      admin_spa_rewrite: '/admin-tools/*  /index.html  200',
      public_catch_all_absent: !/^\s*\/\*\s+\/index\.html\s+200\s*$/m.test(redirects),
      public_404_present: fs.existsSync(path.join(ROOT, 'public', '404.html')),
      routes_include: sorted(routesConfig.include ?? []),
    },
    invariants: {
      browser_router_declarative: /\bBrowserRouter\b/.test(adminRoot)
        && !dataRouterMarker.test(adminRoot),
      admin_lazy_loaded: /lazy\(\(\)\s*=>\s*import\(['"]\.\/admin\/AdminRoot['"]\)\)/.test(main),
      data_router_absent: !hasRuntimeMarker(dataRouterMarker),
      loaders_actions_absent: !hasRuntimeMarker(loaderActionMarker),
      server_router_absent: !hasRuntimeMarker(serverRouterMarker),
      rsc_runtime_absent: !hasRuntimeMarker(rscMarker),
      ssr_entry_absent: !hasRuntimeMarker(ssrEntryMarker),
      canonical_redirects_present: redirects.includes(
        'https://www.gptbot.uz/*  https://gptbot.uz/:splat  301',
      ),
      locale_redirects_present: functionsRoot.includes("langParam === 'ru'")
        && functionsRoot.includes("langParam === 'uz'"),
      prerender_generation_present: [
        'scripts/prerender.ts',
        'scripts/prerender-blog.ts',
        'scripts/prerender-home.ts',
      ].every((file) => fs.existsSync(path.join(ROOT, file))),
      sitemap_generation_present: fs.existsSync(
        path.join(ROOT, 'scripts', 'generate-sitemap.ts'),
      ),
      first_party_automation_routes_present: [
        'functions/api/admin/automation/jobs.ts',
        'functions/api/admin/automation/replay.ts',
      ].every((file) => fs.existsSync(path.join(ROOT, file))),
    },
    evidence_files: [
      'src/main.tsx',
      'src/admin/AdminRoot.tsx',
      'src/admin/AdminApp.tsx',
      'src/admin/routes.ts',
      'public/_redirects',
      'public/_routes.json',
      'public/404.html',
      'functions/index.ts',
      'scripts/prerender.ts',
      'scripts/prerender-blog.ts',
      'scripts/prerender-home.ts',
      'scripts/generate-sitemap.ts',
    ],
  };
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

export function compareRouteInventories(
  before: RouteInventory,
  after: RouteInventory,
  options: { expectedAdminAdditions?: readonly string[] } = {},
): RouteParityDiff {
  const beforeAdmin = before.admin_routes.map((route) =>
    `${route.path}|${route.kind}|${route.protected}`);
  const afterAdmin = after.admin_routes.map((route) =>
    `${route.path}|${route.kind}|${route.protected}`);
  const changedInvariants = Object.keys(before.invariants)
    .filter((key) =>
      before.invariants[key as keyof RouteInventory['invariants']]
      !== after.invariants[key as keyof RouteInventory['invariants']]);
  const countKeys = Object.keys(before.counts) as Array<keyof RouteInventory['counts']>;
  const countDeltas = Object.fromEntries(countKeys.map((key) => [
    key,
    after.counts[key] - before.counts[key],
  ])) as Record<keyof RouteInventory['counts'], number>;
  const addedStaticRoutes = difference(
    after.static_canonical_routes,
    before.static_canonical_routes,
  );
  const removedStaticRoutes = difference(
    before.static_canonical_routes,
    after.static_canonical_routes,
  );
  const addedAdminRoutes = difference(afterAdmin, beforeAdmin);
  const removedAdminRoutes = difference(beforeAdmin, afterAdmin);
  const expectedAdminAdditions = sorted(options.expectedAdminAdditions ?? []);
  const actualAdminAdditions = sorted(addedAdminRoutes);
  const additionsMatch =
    JSON.stringify(actualAdminAdditions) === JSON.stringify(expectedAdminAdditions);
  const expectedCountDeltas: Record<keyof RouteInventory['counts'], number> = {
    static_canonical_routes: 0,
    admin_route_patterns: expectedAdminAdditions.length,
    total_route_patterns: expectedAdminAdditions.length,
    published_pages: 0,
    published_articles: 0,
    sitemap_entries: 0,
  };
  const blocked = [
    addedStaticRoutes,
    removedStaticRoutes,
    removedAdminRoutes,
    changedInvariants,
  ].some((items) => items.length > 0)
    || !additionsMatch
    || (Object.keys(countDeltas) as Array<keyof RouteInventory['counts']>)
      .some((key) => countDeltas[key] !== expectedCountDeltas[key]);

  return {
    schema_version: 1,
    generated_at: '2026-07-28',
    before_label: before.label,
    after_label: after.label,
    status: blocked ? 'blocked' : 'pass',
    added_static_routes: addedStaticRoutes,
    removed_static_routes: removedStaticRoutes,
    added_admin_routes: addedAdminRoutes,
    removed_admin_routes: removedAdminRoutes,
    changed_invariants: changedInvariants,
    count_deltas: countDeltas,
  };
}

function writeJson(relative: string, value: unknown): void {
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(path.join(ROOT, 'reports', 'release') + path.sep)) {
    throw new Error('route inventory output must stay in reports/release');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const args = process.argv.slice(2);
  if (args[0] === '--compare') {
    const [beforePath, afterPath, outputPath] = args.slice(1);
    if (!beforePath || !afterPath || !outputPath) {
      throw new Error('usage: --compare <before> <after> <output>');
    }
    const before = readJson<RouteInventory>(beforePath);
    const after = readJson<RouteInventory>(afterPath);
    const expectedAdminAdditions = args.includes('--allow-owner-control-center')
      ? OWNER_CONTROL_CENTER_ADMIN_ROUTES
      : [];
    const diff = compareRouteInventories(before, after, { expectedAdminAdditions });
    writeJson(outputPath, diff);
    console.log(`ROUTE_PARITY=${diff.status.toUpperCase()}`);
    if (diff.status !== 'pass') process.exitCode = 1;
  } else {
    const labelIndex = args.indexOf('--label');
    const outputIndex = args.indexOf('--output');
    const label = labelIndex >= 0 ? args[labelIndex + 1] : undefined;
    const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
    if (!label || !output) {
      throw new Error('usage: --label <label> --output <reports/release/file.json>');
    }
    const inventory = collectRouteInventory(label);
    writeJson(output, inventory);
    console.log(`ROUTE_PATTERNS=${inventory.counts.total_route_patterns}`);
  }
}
