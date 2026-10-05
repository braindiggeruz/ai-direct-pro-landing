/** Keep the existing plain chip unless it has a safe, page-scoped content link. */
export function renderHeroTrustChip(label: string, href?: string): string {
  const text = label.replace(/[&<]/g, c => c === '&' ? '&amp;' : '&lt;');
  // Content routes only: never schemes, protocol-relative links, query strings
  // or encoded/control characters in a decorative proof label.
  const internal = typeof href === 'string' && /^\/(?:ru|uz)\/(?:[a-z0-9-]+\/)+$/.test(href);
  const content = internal
    ? `<a href="${href}" class="underline underline-offset-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">${text}</a>`
    : text;
  return `<li class="px-3 py-1 rounded-full border border-white/10 bg-white/5">${content}</li>`;
}
