# React Router 8 migration evidence

Date: 2026-07-28. Scope: local R0.4 release-candidate preparation only.
No push, deployment, production configuration change, D1 mutation, webhook
mutation or n8n mutation was performed.

## Security decision

`GHSA-qwww-vcr4-c8h2` affects `react-router >=7.12.0 <8.3.0`; the reviewed
patched release is `8.3.0`. GPTBot previously resolved `7.18.1`, so the package
was in the affected range even though the vulnerable unstable RSC path was not
reachable. The temporary reachability exception has been removed. The root
production audit must now return zero findings.

Selected exact versions:

- `react`: `19.2.7`
- `react-dom`: `19.2.7`
- `react-router`: `8.3.0`
- `react-router-dom`: absent
- local verification runtime: Node `24.13.0`, Vite `8.0.14`

These versions satisfy the v8 minimums: Node 22.22+, React/React DOM 19.2.7+
and Vite 7+. React Router v8 is ESM-only and removes the
`react-router-dom` compatibility package.

Primary sources:

- GitHub reviewed advisory and patched range:
  <https://github.com/advisories/GHSA-qwww-vcr4-c8h2>
- Official React Router v7-to-v8 upgrade guide:
  <https://reactrouter.com/upgrading/v7>
- Official React Router changelog:
  <https://reactrouter.com/changelog>
- Published React Router package:
  <https://www.npmjs.com/package/react-router>
- Supported React versions:
  <https://react.dev/versions>

## Reachability and API migration

The dependency/reachability inventory is
`docs/agents-platform/release/REACT_ROUTER_MIGRATION_INVENTORY.json`.
It found 17 source/test import files. Every import is a declarative browser API
available from `react-router`, so all 17 moved from `react-router-dom` to
`react-router`. No API required the `react-router/dom` subpath.

The router remains confined to the lazy admin chunk:

`src/main.tsx` -> lazy `src/admin/AdminRoot.tsx` -> declarative
`BrowserRouter` -> `Routes`/`Route`.

The migration did not introduce framework mode, a data router,
`RouterProvider`, loaders/actions, a server router, SSR, an RSC adapter,
unstable RSC APIs or a `use server` directive.

## Route and boundary proof

The generated pre-migration inventory is
`reports/release/react-router-route-parity-before.json`. The generated
post-migration inventory and diff are:

- `reports/release/react-router-route-parity-after.json`
- `reports/release/react-router-route-parity-diff.json`

The contract contains 207 static canonical routes and 17 admin route patterns,
224 total. The diff must be `pass` with no additions, removals, invariant
changes or count deltas.

The following boundaries remain explicit:

- only `/admin-tools/*` receives the SPA rewrite;
- unknown public routes retain the static 404 and no public `/*` fallback;
- every admin route except `/admin-tools/login` remains protected;
- canonical-host, legacy-blog and `?lang=ru|uz` redirects remain present;
- RU/UZ prerender and sitemap generation remain file-based;
- first-party automation routes remain present;
- legacy n8n ingest remains disabled unless explicitly enabled.

## Dependency and build gates

The root package manager is Yarn 1.22.22 with `yarn.lock` as its sole root
lock authority. The stale root `package-lock.json` was removed.
`apps/gpt-backend/package-lock.json` remains the backend npm authority.

Required evidence:

- frozen Yarn install;
- exact installed package graph with no `react-router-dom` or second Router
  major;
- root Yarn production audit with zero findings;
- independent npm production-audit cross-check in a disposable directory;
- root typecheck, production build, prerender and sitemap generation;
- route-parity generation and the dedicated migration suite;
- canonical secret scan, release-preparation suite and full regression set;
- backend install, audit, typecheck and build;
- unchanged known Functions typecheck baseline;
- rollback rehearsal in a disposable clone.

Build-size comparison and final gate outcomes are recorded in the local RC
manifest. No production-readiness claim is made: R0.3 remains in progress,
R0.3B remains blocked, R0.4 is incomplete and R1/P3 have not started.
