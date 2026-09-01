interface BlogIndexAssetEnv {
  ASSETS: Fetcher;
}

export type BlogIndexPath = '/ru/blog/' | '/uz/blog/';

export function createBlogIndexHandler(pathname: BlogIndexPath): PagesFunction<BlogIndexAssetEnv> {
  return async ({ request, env }) => {
    const url = new URL(request.url);

    if (url.searchParams.has('q')) {
      url.searchParams.delete('q');
      url.protocol = 'https:';
      url.hostname = 'gptbot.uz';
      url.port = '';
      url.pathname = pathname;
      url.hash = '';
      return Response.redirect(url.toString(), 301);
    }

    // This explicit Pages Function makes the blog index pass through the edge
    // even when Cloudflare's generated routes would otherwise serve the static
    // file directly. ASSETS.fetch bypasses Functions and returns that exact
    // prerendered index without a recursive request.
    return env.ASSETS.fetch(request);
  };
}
