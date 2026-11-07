# Yandex Metrica regional fallback CSP correction — 2026-11-07

The parent release check reported two enforced-CSP errors in PageSpeed Insights
after production release `504d3bac271a04bc8104dad1e0710fba61ca934d`:

- An HTTPS connection to `mc.yandex.com/watch/111312750` was rejected by `connect-src`.
- The same endpoint's callback/JSONP script fallback was rejected by `script-src`.

The normal browser run did not reproduce those errors. A successful request to
the existing `.ru` host does not cover the `.com` fallback observed by PSI.

Primary source checked on 2026-11-07: [Yandex Metrica — Installing a tag on a site
with CSP](https://yandex.com/support/metrica/en/code/install-counter-csp). The
general address list explicitly includes `https://mc.yandex.com`. The document
also lists WebSocket and other regional addresses; they are not evidence that
this site needs all of them.

The narrow fix adds only `https://mc.yandex.com` to `script-src` and `connect-src`
in both `public/_headers` and `scripts/generate-robots.ts`, which generates the
production `dist/_headers`. Existing `.ru` script/frame/connection permissions
and its WebSocket permission are preserved. No `.com` frame or WebSocket origin,
wildcard, general scheme permission, or other directive is added.

Counter settings, tag bootstrap, payload sanitization, replay masking, user
interface, SEO metadata and shared application bundles are unchanged. Tests pin
the exact Yandex origins separately for script, connection and frame directives
and reject `.com` in other directives. Rebuild/deploy and a fresh PSI run are
required to establish that the production fallback now passes CSP; local tests
alone do not prove that outcome.

Local validation completed before handoff:

- `node --import tsx --test tests/yandex-metrika.test.ts`: 72 passed, zero failures or skips.
- Scoped ESLint for `scripts/generate-robots.ts` and `tests/yandex-metrika.test.ts`: clean.
- `git diff --check` for the changed sources: clean.
- Independent parsing of the HEAD and candidate CSPs confirmed exactly two
  additions per source: `https://mc.yandex.com` in `script-src` and `connect-src`.
  Every other directive and origin was identical. No build, commit, deployment,
  or external settings mutation was performed by this worker.
