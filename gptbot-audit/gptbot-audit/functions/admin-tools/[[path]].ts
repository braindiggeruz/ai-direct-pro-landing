// Catch-all Pages Function for the admin SPA at /admin-tools/*.
//
// WHY THIS EXISTS:
//   Cloudflare Pages' `_redirects` splat-rewrite rule
//     /admin-tools/*  /index.html  200
//   intermittently does NOT fire for unmatched static paths — Pages instead
//   serves the auto-/404.html with HTTP 404, breaking the SPA entry point.
//
//   A Function on /admin-tools/* takes precedence over the static-404 fallback,
//   so this is the reliable way to keep the admin SPA reachable WITHOUT
//   re-introducing a site-wide `/* /index.html 200` rule (which would cause
//   every typo URL to serve a 200 SPA shell and re-break SEO indexation).
//
// EFFECT:
//   - /admin-tools, /admin-tools/, /admin-tools/login, /admin-tools/pages, etc.
//     -> always return dist/index.html with HTTP 200 (no-store), so the React
//        Router can mount AdminApp.
//   - Random URLs (e.g. /foo/bar/) continue to fall through to /404.html (404).
//   - /api/* keeps going to its own Functions (unchanged).
//   - Sitemap, robots, draft URLs unchanged.

interface AssetsBinding {
  fetch: (req: Request) => Promise<Response>;
}

export const onRequest: PagesFunction<{ ASSETS: AssetsBinding }> = async ({ request, env }) => {
  // Rewrite the request URL to /index.html and ask the static-asset binding for it.
  const url = new URL(request.url);
  url.pathname = '/index.html';
  url.search = '';
  const indexRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const res = await env.ASSETS.fetch(indexRequest);

  // Force HTTP 200 + no-store so browsers always re-fetch the admin shell
  // (the SPA JS bundle is hashed, so cache invalidation is automatic anyway).
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Strip every analytics/tracking tag from the admin response so /admin-tools/*
  // is never tracked. Public pages still ship those tags; we identify each one
  // by a stable data-tag attribute:
  //   data-tag="gtm"    -> Google Tag Manager (script + noscript iframe)
  //   data-tag="ga"     -> Google Analytics gtag.js inline loader
  //   data-tag="meta"   -> Meta (Facebook) Pixel
  const rewriter = new HTMLRewriter()
    .on('script[data-tag="gtm"]', { element(el) { el.remove(); } })
    .on('script[data-tag="ga"]', { element(el) { el.remove(); } })
    .on('script[data-tag="meta"]', { element(el) { el.remove(); } })
    .on('noscript[data-tag="meta"]', { element(el) { el.remove(); } })
    .on('noscript[data-tag="gtm"]', { element(el) { el.remove(); } });
  return rewriter.transform(new Response(res.body, { status: 200, statusText: 'OK', headers }));
};
