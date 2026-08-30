import type { LeadRadarContactSource } from '../../../src/shared/lead-radar-contact-sources';
import { businessNameKey } from './business-contact-data';
import { extractPublicBusinessContacts } from './public-contact-discovery';
import { readPublicPageHtml, readPublicWebsiteRobots, robotsAllows, type ExpectedCompanyWebsiteIdentity } from './sources';
import { safePublicHttpUrl } from './validation';

const ORIGIN = 'https://top.uz';
const MAX_CATEGORY_PAGES = 40;
const INDEX_TTL_MS = 15 * 60_000;
type Index = { listings: Array<{ url: string; name: string }>; hasNext: boolean };
// URLs/names only: cached retrieval hints never become ownership evidence.
const indexes = new Map<string, { expiresAt: number; value: Index }>();

export interface FreeCatalogResult {
  sources: LeadRadarContactSource[];
  status: 'complete' | 'limited' | 'unavailable';
  reason: string;
}

export function topUzCategoryPath(category: string): string | null {
  // Only verified category routes. New niches need a policy/format fixture,
  // not guessed URLs. All other niches still have the free own-site path.
  return /dent|stomat|стомат|tish/iu.test(category) ? '/section/stomatologii' : null;
}

export function parseTopUzIndex(html: string, pageUrl: URL): Index {
  const listings = new Map<string, { url: string; name: string }>();
  let hasNext = false;
  const page = Number(pageUrl.searchParams.get('PAGEN_1') ?? '1');
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try { url = new URL(match[1].replaceAll('&amp;', '&'), pageUrl); } catch { continue; }
    if (url.origin !== ORIGIN) continue;
    if (url.pathname === pageUrl.pathname && Number(url.searchParams.get('PAGEN_1')) === page + 1) hasNext = true;
    if (!/^\/company\/[a-z0-9-]+\/?$/i.test(url.pathname) || url.search) continue;
    url.hash = '';
    const label = match[2].replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|quot|amp);/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    // The live category repeats each URL for its name AND a longer map CTA.
    // Navigation labels must not overwrite the actual company name.
    const name = /^(?:показать схему проезда на карте|показать на карте|подробнее|отзывы|контакты)$/iu.test(label) ? '' : label;
    const previous = listings.get(url.toString());
    if (!previous || name.length > previous.name.length) listings.set(url.toString(), { url: url.toString(), name });
    if (listings.size > 100) break;
  }
  return { listings: [...listings.values()], hasNext };
}

/** One bounded page per delivery. The continuation cursor lives in the existing
 * enrichment reason; no per-completion D1 statements or paid API are needed. */
export async function discoverFreeTopUzContacts(input: {
  identity: ExpectedCompanyWebsiteIdentity; category: string; previousReason?: string; observedAt: string;
  robots?: typeof readPublicWebsiteRobots;
  readPage?: typeof readPublicPageHtml;
}): Promise<FreeCatalogResult> {
  const none = (status: FreeCatalogResult['status'], reason: string): FreeCatalogResult => ({ sources: [], status, reason });
  const key = businessNameKey(input.identity.name);
  if (key.length < 3) return none('complete', 'insufficient_company_identity');
  // Retain the page even when its policy/read failed on the previous delivery.
  const continuation = /^free_catalog_page_(\d+)(?:_|$)/.exec(input.previousReason ?? '');
  const page = Math.max(1, Math.min(MAX_CATEGORY_PAGES, Number(continuation?.[1] ?? '1')));
  const failed = (detail: string) => none('unavailable', `free_catalog_page_${page}_${detail}`);
  let policy: string | null;
  try { policy = await (input.robots ?? readPublicWebsiteRobots)(new URL(ORIGIN)); }
  catch { return failed('policy_unavailable'); }
  const allowed = (url: URL) => policy === null || robotsAllows(policy, url);
  const read = input.readPage ?? readPublicPageHtml;
  const search = new URL('/search/', ORIGIN);
  search.searchParams.set('text', [input.identity.name, input.identity.city].filter(Boolean).join(' ').slice(0, 90));
  const categoryPath = topUzCategoryPath(input.category);
  const useSearch = allowed(search);
  if (!useSearch && !categoryPath) return none('unavailable', 'free_catalog_niche_not_supported');
  const indexUrl = useSearch ? search : new URL(categoryPath!, ORIGIN);
  if (!useSearch && page > 1) indexUrl.searchParams.set('PAGEN_1', String(page));
  if (!allowed(indexUrl)) return failed('robots_blocked');
  let index: Index;
  const cached = indexes.get(indexUrl.toString());
  // An injected reader gets no shared cache, keeping fixtures deterministic.
  if (!input.readPage && cached && cached.expiresAt > Date.parse(input.observedAt)) index = cached.value;
  else {
    let html: string | null;
    try { html = await read(indexUrl.toString(), { maxBytes: 900_000, sameOrigin: true, allowRedirects: false }); }
    catch { return failed('unavailable'); }
    if (!html) return failed('unavailable');
    index = parseTopUzIndex(html, indexUrl);
    // A challenge/changed DOM is not proof that the company has no contact.
    if (!index.listings.length) return failed('unrecognized_index');
    if (!input.readPage) {
      if (indexes.size >= 64) indexes.delete(indexes.keys().next().value!);
      indexes.set(indexUrl.toString(), { expiresAt: Date.parse(input.observedAt) + INDEX_TTL_MS, value: index });
    }
  }
  const matches = index.listings.filter(item => {
    if (useSearch) return true; // The fetched entity must still pass exact proof.
    const label = businessNameKey(item.name);
    const slug = businessNameKey(new URL(item.url).pathname.split('/').filter(Boolean).pop() ?? '');
    return label === key || slug === key || `${slug}-`.startsWith(`${key}-`);
  });
  const sources: LeadRadarContactSource[] = [];
  let unavailable = false;
  for (const listing of matches.slice(0, 2)) {
    const url = safePublicHttpUrl(listing.url);
    if (!url || !allowed(url)) { unavailable = true; continue; }
    let html: string | null;
    try { html = await read(url.toString(), { sameOrigin: true, allowRedirects: false }); }
    catch { unavailable = true; continue; }
    if (!html) { unavailable = true; continue; }
    const source = await extractPublicBusinessContacts(url.toString(), html, input.identity, input.observedAt);
    if (source) sources.push(source);
  }
  if (sources.length) return { sources, status: 'complete', reason: 'public_contact_candidates' };
  if (unavailable) return failed('listing_unavailable');
  if (matches.length > 2) return none('unavailable', 'free_catalog_ambiguous_identity');
  if (!useSearch && index.hasNext) return page < MAX_CATEGORY_PAGES
    ? none('limited', `free_catalog_page_${page + 1}`)
    : none('unavailable', 'free_catalog_page_limit');
  return none('complete', 'free_catalog_no_match');
}
