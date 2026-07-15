// functions/index.ts
//
// WHY THIS EXISTS (2026-07-04):
// Cloudflare Pages serves static assets (index.html) DIRECTLY, bypassing the
// global _middleware.ts for requests that match a file in the build output.
// The root path "/" matches /dist/index.html, so _middleware.ts never runs
// for "/?lang=ru" — the static file is returned as-is (HTTP 200).
//
// Google Search Console reported 29 pages as "Alternate page with proper
// canonical tag" because it crawled /?lang=ru as a separate URL. The canonical
// tag on that page points to https://gptbot.uz/ (correct), but Google still
// treats the ?lang= variant as a distinct URL until it receives a 301.
//
// FIX: This route-level function intercepts GET / (and any path with ?lang=)
// BEFORE the static asset is served, checks for the ?lang= query parameter,
// and issues a 301 redirect to the appropriate localized path.
//
// Redirect rules:
//   /?lang=ru           → 301 → /ru/
//   /?lang=uz           → 301 → /uz/
//   /ru/...?lang=ru     → 301 → /ru/...   (strip param, no double-prefix)
//   /uz/...?lang=uz     → 301 → /uz/...
//   any other ?lang=X   → 301 → / (strip unknown lang)
//   no ?lang=           → pass through to static index.html

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  const langParam = url.searchParams.get('lang');

  if (langParam) {
    const alreadyLocalized =
      url.pathname.startsWith('/ru/') ||
      url.pathname.startsWith('/uz/') ||
      url.pathname === '/ru' ||
      url.pathname === '/uz';

    const target = alreadyLocalized
      ? `https://gptbot.uz${url.pathname}`
      : langParam === 'ru'
        ? `https://gptbot.uz/ru${url.pathname === '/' ? '/' : url.pathname}`
        : langParam === 'uz'
          ? `https://gptbot.uz/uz${url.pathname === '/' ? '/' : url.pathname}`
          : `https://gptbot.uz${url.pathname}`;

    return Response.redirect(target, 301);
  }

  return next();
};
