/**
 * Serve the Bormi Admin shell for every client-rendered route under `/admin/`.
 *
 * ## Why this is a Function and not a `_redirects` rewrite
 *
 * The obvious rule — `/admin/*  /admin/index.html  200` — does not work, and it
 * fails in two different ways depending on how it is written. Both were
 * reproduced against the real Pages runtime (`wrangler pages dev dist`) before
 * this file existed:
 *
 *   `/admin/*  /admin/index.html  200` → **404 on every sub-route.** Pages
 *   strips `.html` from a destination, so the rewrite lands on `/admin/`, which
 *   matches `/admin/*` again. The loop is broken by giving up.
 *
 *   `/admin/*  /admin/  200` → **200 on every sub-route, and 200 on every
 *   asset too.** `_redirects` is evaluated *before* static assets, so
 *   `/admin/assets/index-*.js` was answered with the HTML shell and the panel
 *   never loaded its own JavaScript.
 *
 * There is no way to write "rewrite only what is not a file" in `_redirects`,
 * and the marketing SPA does not hit this because its assets live at
 * `/assets/*`, outside its `/admin-tools/*` pattern.
 *
 * So the routing decision moves here, and `_routes.json` excludes
 * `/admin/assets/*` so that the panel's hashed chunks are still served straight
 * from the asset store without paying for an invocation.
 *
 * ## Why the headers are set here too
 *
 * `_headers` **merges** matching blocks rather than letting the more specific
 * one win. A `/admin/*` block on top of the global `/*` block produced
 * `Cache-Control: public, max-age=0, s-maxage=3600, …, no-store, …` and
 * `X-Frame-Options: SAMEORIGIN, DENY` — a cache directive that contradicts
 * itself and a frame policy browsers treat as malformed. A Function response
 * bypasses `_headers` entirely, so what is written below is exactly what the
 * browser receives.
 */
import type { Env } from '../_types';

/** The asset store binding Pages gives every Functions project. */
interface AssetsEnv extends Env {
  ASSETS: { fetch: (request: Request | string | URL) => Promise<Response> };
}

/**
 * Never cached, never indexed, never framed.
 *
 * `noindex` also ships in the panel's own `<meta>`; this is the copy an
 * indexer sees without parsing the HTML. `nosnippet` and `noarchive` are here
 * because a control center that leaks a text fragment into a result page leaks
 * operational state.
 */
const SHELL_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export const onRequest: PagesFunction<AssetsEnv> = async ({ request, env }) => {
  // Only a document request gets the shell. Anything else under /admin/ that
  // reaches this Function is a path with no asset behind it, and answering a
  // POST or a DELETE with an HTML page would be answering it wrongly.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, HEAD' },
    });
  }

  const url = new URL(request.url);
  // Lead Radar belongs to the existing SEO owner console. Keep the intuitive
  // `/admin/lead-radar` bookmark working without duplicating authorization or
  // shipping a second copy of the feature inside Bormi Admin.
  if (url.pathname === '/admin/lead-radar' || url.pathname === '/admin/lead-radar/') {
    const target = new URL('/admin-tools/lead-radar', url);
    target.search = url.search;
    return new Response(null, {
      status: 302,
      headers: {
        ...SHELL_HEADERS,
        Location: target.toString(),
      },
    });
  }

  // The shell itself, fetched from the asset store by its directory form so
  // Pages does not answer with its own `.html` redirect.
  const shell = await env.ASSETS.fetch(new URL('/admin/', url).toString());
  if (!shell.ok) {
    // The panel was not built into `dist/admin`. Say so rather than serving a
    // blank page: the build order (`npm run build` then `npm run build:admin`)
    // is the one thing that produces this, and a silent empty screen would send
    // somebody looking at the wrong layer.
    return new Response('Bormi Admin is not built for this deployment.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const headers = new Headers(shell.headers);
  for (const [name, value] of Object.entries(SHELL_HEADERS)) headers.set(name, value);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(request.method === 'HEAD' ? null : shell.body, {
    status: 200,
    headers,
  });
};
