import type { Redirect } from '../src/shared/types';

const APEX_ORIGIN = 'https://gptbot.uz';
const WWW_ORIGIN = 'https://www.gptbot.uz';

/**
 * Build host-specific redirects for legacy paths before the generic www rule.
 *
 * Without these rules, a legacy URL on www takes two hops:
 * www old path -> apex old path -> apex canonical target.
 * Cloudflare Pages uses first-match ordering, so the specific rules must be
 * emitted before the generic www -> apex wildcard.
 */
export function buildDirectWwwLegacyRules(redirects: Redirect[]): string[] {
  return redirects.flatMap((redirect) => {
    if (!redirect.from.startsWith('/')) return [];

    const target = redirect.to.startsWith('/')
      ? `${APEX_ORIGIN}${redirect.to}`
      : redirect.to;

    return [`${WWW_ORIGIN}${redirect.from}  ${target}  ${redirect.statusCode}`];
  });
}
