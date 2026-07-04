// Adds CORS + connection-stabilising headers globally.
//
// - CORS: the admin and the landing are both served from the same
//   Cloudflare Pages project, so cross-origin is rarely needed — but
//   during preview deploys the admin may be on a *.pages.dev subdomain.
// - Alt-Svc: clear forces every visiting browser to discard any cached
//   HTTP/3 (QUIC) advertisement for this origin. Together with the zone
//   setting `http3 = off`, this guarantees that returning visitors will
//   not hit `ERR_QUIC_PROTOCOL_ERROR` from a stale Alt-Svc cache.
// - Strict-Transport-Security: long max-age + preload helps the browser
//   pin HTTPS early in the connection and avoid mid-session protocol
//   downgrades that can manifest as ERR_CONNECTION_RESET.
// - Clear-Site-Data ("cache") on /admin-tools/login flushes any stale
//   service-worker, HTTP cache, or preloaded resource the browser may
//   still be trying to reuse from a previous broken QUIC session.
//   Note: we intentionally do NOT clear "cookies" — that would log out
//   an already-authenticated admin.
export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);

  // GSC fix: strip ?lang= query-parameter variants.
  // Google was crawling /?lang=ru and /?lang=uz as separate URLs and marking
  // them as "Alternate page with proper canonical tag" (29 pages in GSC report
  // dated 2026-07-04). Cloudflare Pages _redirects does not support
  // query-string matching, so we handle it here in the edge middleware.
  // Redirect: /?lang=ru → /ru/  |  /?lang=uz → /uz/  |  other ?lang= → /
  const langParam = url.searchParams.get('lang');
  // DEBUG: temporary header to confirm middleware is invoked (remove after fix verified)
  if (langParam === '__mw_check__') {
    return new Response('middleware_active', { status: 200, headers: { 'X-Middleware': 'active', 'Cache-Control': 'no-store' } });
  }
  if (langParam) {
    // If already on a localized path (/ru/... or /uz/...), just strip the param.
    const alreadyLocalized =
      url.pathname.startsWith('/ru/') || url.pathname.startsWith('/uz/') ||
      url.pathname === '/ru' || url.pathname === '/uz';
    const target = alreadyLocalized
      ? `https://gptbot.uz${url.pathname}`
      : langParam === 'ru'
        ? `https://gptbot.uz/ru${url.pathname === '/' ? '/' : url.pathname}`
        : langParam === 'uz'
          ? `https://gptbot.uz/uz${url.pathname === '/' ? '/' : url.pathname}`
          : `https://gptbot.uz${url.pathname}`;
    return Response.redirect(target, 301);
  }

  const isLoginPage =
    url.pathname === '/admin-tools/login' ||
    url.pathname === '/admin-tools/login/';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Alt-Svc': 'clear',
      },
    });
  }
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Alt-Svc', 'clear');
  // Pin HTTPS for 1 year (no preload — owner controls preload submission).
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (isLoginPage) {
    // Browser flushes its HTTP cache + service-worker registrations for
    // this origin. Helps recover from ERR_CONNECTION_RESET caused by a
    // stale cached preload pointing at a closed TCP socket.
    headers.set('Clear-Site-Data', '"cache", "storage"');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};
