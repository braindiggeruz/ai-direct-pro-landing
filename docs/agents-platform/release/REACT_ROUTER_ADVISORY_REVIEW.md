# GHSA-qwww-vcr4-c8h2 review

Reviewed: 2026-07-28.

Disposition: not reachable in the current build; temporary R0.4-prep exception
only. R1 remains blocked until an isolated major-upgrade spike or a fresh
owner security review closes the advisory.

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

## Machine-verifiable proof

`scripts/release-preflight.ts --deep` accepts the warning in `r0.4-prep` only
when all of these are simultaneously true:

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

## Upgrade options

1. **Safe upgrade now:** rejected. The only patch is React Router 8.3.0, a
   major upgrade. React Router v8 requires Node 22.22+, React/React DOM
   19.2.7+ and Vite 7+. Node and Vite already satisfy those minima, but the
   installed React pair is one patch below the minimum. v8 also removes
   `react-router-dom`, while this application imports its declarative browser
   APIs from that package. This is not a dependency-only patch.
2. **Isolated migration spike:** required before production R1 if the team
   wants the advisory removed. In a temporary worktree, update React and React
   DOM to at least 19.2.7, replace `react-router-dom` imports with the v8
   `react-router`/`react-router/dom` surfaces, install React Router 8.3.0,
   follow the v7 future-flag guidance, and run all admin deep-route, auth,
   browser navigation, build and prerender tests. Do not merge on audit output
   alone.
3. **Temporary exception with proof:** selected for local R0.4 preparation
   only. The closed marker scan and exact audit-shape check remain mandatory.

No blind major upgrade was performed. R1 remains blocked.
