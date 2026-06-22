// Adds CORS + Alt-Svc: clear headers globally.
//
// - CORS: the admin and the landing are both served from the same
//   Cloudflare Pages project, so cross-origin is rarely needed — but
//   during preview deploys the admin may be on a *.pages.dev subdomain.
// - Alt-Svc: clear forces every visiting browser to discard any cached
//   HTTP/3 (QUIC) advertisement for this origin. Together with the zone
//   setting `http3 = off`, this guarantees that returning visitors will
//   not hit `ERR_QUIC_PROTOCOL_ERROR` from a stale Alt-Svc cache
//   (Cloudflare strips Alt-Svc set via _headers, but respects Alt-Svc
//   set by a Pages Function).
export const onRequest: PagesFunction = async ({ request, next }) => {
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
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};
