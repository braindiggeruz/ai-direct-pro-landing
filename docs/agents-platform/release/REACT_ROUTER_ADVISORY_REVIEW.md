# GHSA-qwww-vcr4-c8h2 historical review

Reviewed and superseded: 2026-07-28.

Disposition: closed by the exact React Router 8.3.0 migration documented in
`REACT_ROUTER_V8_MIGRATION_EVIDENCE.md`. This file preserves the reasoning that
allowed local preparation before the upgrade; it is no longer an active audit
exception. R1 remains blocked by the existing release sequence and production
gates, not by this advisory.

## Verified facts

- Installed `react-router` and `react-router-dom`: `7.18.1`.
- Installed `react` and `react-dom`: `19.2.6`.
- Local verification runtime: Node `24.13.0`; Vite `8.0.14`.
- GitHub's reviewed advisory affects `react-router >=7.12.0 <8.3.0`; patched
  version is `8.3.0`.
- The advisory explicitly says it affects only applications using unstable
  RSC APIs.
- Application routing is the declarative browser SPA:
  `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Link` and navigation hooks
  imported from `react-router-dom`.
- No `@react-router/dev`, `react-server-dom-*`, RSC entry file, RSC router,
  RSC request matcher or `"use server"` application directive is installed or
  imported.
- Vite builds a static/client application. There is no React Router Framework
  Mode server build or RSC request handler.

Primary sources:

- Advisory and affected/patched ranges:
  <https://github.com/advisories/GHSA-qwww-vcr4-c8h2>
- React Router RSC API/setup documentation:
  <https://reactrouter.com/how-to/react-server-components>
- v7 to v8 migration guidance:
  <https://reactrouter.com/upgrading/v7>
- v8.3.0 change log:
  <https://reactrouter.com/start/start/changelog>

## Reachability

The vulnerable flow requires an unstable RSC action/request path. The current
bundle has no RSC server entry, no RSC dependency, no React Router action
server and no route capable of dispatching such a request. The vulnerable path
is therefore not reachable in the current build.

This is not a claim that the installed package is outside the affected range.
It is inside the range and root production audit correctly reports the
advisory.

## Historical machine-verifiable proof

Before the migration, `scripts/release-preflight.ts --deep` accepted the
warning in `r0.4-prep` only when all of these were simultaneously true:

1. exactly `react-router` and `react-router-dom` are reported;
2. the only accepted advisory URL ends in `GHSA-qwww-vcr4-c8h2`;
3. policy disposition is `not_reachable_in_current_build`;
4. tracked `src` and `functions` contain none of the closed RSC markers;
5. R1 is not the selected phase.

The marker set includes:

```text
unstable_matchRSCServerRequest
unstable_reactRouterRSC
unstable_RSC
RSCStaticRouter
entry.rsc
react-server-dom
react-server
"use server"
```

Any marker, additional advisory or changed audit shape fails closed.

That exception path has now been removed. The current deep preflight uses the
canonical Yarn lock and requires a zero-finding production audit.

## Resolution

The isolated migration selected React/React DOM 19.2.7 and React Router 8.3.0,
removed `react-router-dom`, migrated all declarative imports, proved route
parity, retained the negative RSC/SSR/data-router surface and changed the
release preflight to require a zero-finding root production audit.

No blind dependency-only upgrade was performed. No production change was
performed. R0.3 remains in progress, R0.4 remains incomplete and R1 remains
blocked.
