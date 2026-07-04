// TEMPORARY DIAGNOSTIC — remove after debugging lang redirect issue
// Tests whether _middleware.ts receives the ?lang= query parameter
export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const langParam = url.searchParams.get('lang');
  return new Response(JSON.stringify({
    url: request.url,
    pathname: url.pathname,
    search: url.search,
    langParam: langParam,
    hasLang: langParam !== null,
    note: 'If middleware redirect worked, you would not see this response',
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
