const SITE_ORIGIN = 'https://gptbot.uz';

type RelatedLink = { target: string; anchor: string };

/** Resolve only this site's article paths; navigation and external links stay intact. */
function articlePath(target: string): string | undefined {
  if (!target.startsWith('/') && !/^https?:\/\//i.test(target)) return undefined;
  try {
    const url = new URL(target, SITE_ORIGIN);
    if (url.hostname !== 'gptbot.uz' || url.port) return undefined;
    if (!/^\/(?:ru|uz)\/blog\/.+/.test(url.pathname)) return undefined;
    return `${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return undefined;
  }
}

/** Keep related article cards only when their target is actually being published.
 * The publication set comes from the same build selection as the prerenderer.
 * This changes neither a retained card's wording/destination nor its metadata.
 */
export function publishedRelatedLinks<T extends RelatedLink>(
  links: readonly T[],
  publishedArticleUrls: ReadonlySet<string>,
): T[] {
  const publishedPaths = new Set(
    [...publishedArticleUrls].map(articlePath).filter((p): p is string => p !== undefined),
  );
  return links.filter((link) => {
    const targetPath = articlePath(link.target);
    return targetPath === undefined || publishedPaths.has(targetPath);
  });
}
