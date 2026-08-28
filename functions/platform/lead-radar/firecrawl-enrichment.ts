import type { FirecrawlEnvironment } from './firecrawl-client';
import { FirecrawlClient, FirecrawlError, firecrawlConfig, firecrawlDigest, firecrawlObject, firecrawlPublicUrl } from './firecrawl-client';
import { FirecrawlStore, type FirecrawlJobContext } from './firecrawl-store';
import type { LeadRadarQueueDependencies } from './queue';
import {
  enrichCompanyWebsiteDetailed, extractCompanyPageFacts, readPublicWebsiteRobots, robotsAllows,
  verifyCompanyWebsiteBinding, type ExpectedCompanyWebsiteIdentity, type WebsiteFacts,
} from './sources';
import { normalizeCompanyKey } from './validation';

export type WebsiteEnrichmentResult = {
  facts: WebsiteFacts | null;
  reason: 'enriched' | 'no_relevant_evidence' | 'invalid_website' | 'robots_blocked' | 'http_blocked'
    | 'source_timeout' | 'source_unavailable' | 'no_website';
  retryable: boolean;
  /** Local capacity/continuation is scheduling, not a failed provider attempt. */
  deferUntil?: string;
};

interface PageResult {
  url: string;
  requestedUrl: string;
  contentHash: string;
  observedAt: string;
  providerId: string | null;
  freshRequested: true;
  bound: boolean;
  facts: WebsiteFacts;
  links: string[];
}

export interface FirecrawlEnrichmentDependencies {
  fetch?: typeof fetch;
  now?: () => Date;
  direct?: typeof enrichCompanyWebsiteDetailed;
  robots?: typeof readPublicWebsiteRobots;
}

function urlsFrom(value: unknown, base?: URL): string[] {
  if (!Array.isArray(value)) throw new FirecrawlError('invalid_response');
  const result: string[] = [];
  for (const item of value.slice(0, 100)) {
    const raw = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { url?: unknown }).url : null;
    if (typeof raw !== 'string') continue;
    try {
      const url = firecrawlPublicUrl(base ? new URL(raw, base).toString() : raw);
      if (url && (!base || url.origin === base.origin) && !result.includes(url.toString())) result.push(url.toString());
    } catch { /* An invalid source link is not actionable. */ }
  }
  return result;
}

export function selectFirecrawlContactPages(values: string[], home: URL): string[] {
  const rank = (url: string) => /contact|kontakt|aloqa|контакт/i.test(decodeURI(url)) ? 0 : 1;
  return urlsFrom(values, home).filter((url) => url !== home.toString()
    && /contact|kontakt|aloqa|about|company|team|doctor|staff|контакт|команд|врач/i.test(url))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, 3);
}

function conflictingPhone(expected: ExpectedCompanyWebsiteIdentity, html: string): boolean {
  const expectedPhone = expected.phone?.replace(/\D/g, '');
  const advertisedPhones = [...html.matchAll(/(?:\+|tel:)\d(?:[\s().-]*\d){8,14}/g)]
    .map((match) => match[0].replace(/\D/g, ''));
  return !!expectedPhone && advertisedPhones.length > 0 && !advertisedPhones.includes(expectedPhone);
}

/** New domains require a phone anchor OR name + city/address, never a snippet. */
function identityBound(expected: ExpectedCompanyWebsiteIdentity, url: URL, html: string, discovered: boolean): boolean {
  const binding = verifyCompanyWebsiteBinding(expected, [{ url, html }]);
  if (!binding.verified) return false;
  if (binding.method === 'phone') return true;
  // A same-name website with a conflicting public phone needs review.
  if (conflictingPhone(expected, html)) return false;
  if (!discovered) return true;
  // "Стоматология + Ташкент" describes a category, not a unique business.
  // Generic names need an exact phone anchor (handled above), not city overlap.
  const generic = new Set(['стоматология', 'стоматологии', 'стоматолог', 'стоматологическая',
    'клиника', 'клиники', 'центр', 'зубов', 'зубная', 'имплантации', 'детская',
    'dental', 'dentist', 'dentistry', 'clinic', 'stomatologiya', 'mchj', 'ооо', 'чп']);
  if (!normalizeCompanyKey(expected.name).split('-').some((token) => token.length >= 3 && !generic.has(token) && !/^\d+$/.test(token))) return false;
  const text = normalizeCompanyKey(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' '));
  const city = normalizeCompanyKey(expected.city ?? '');
  const address = normalizeCompanyKey(expected.address ?? '');
  const aliases = ['ташкент', 'tashkent', 'toshkent'];
  const cities = aliases.includes(city) ? aliases : [city];
  return cities.some((c) => c.length >= 3 && `-${text}-`.includes(`-${c}-`))
    || address.length >= 10 && text.includes(address);
}

export function combineFirecrawlPages(pages: PageResult[]): WebsiteFacts {
  const bound = pages.filter((page) => page.bound);
  const first = bound[0];
  if (!first) throw new FirecrawlError('identity_unconfirmed');
  const contacts = bound.flatMap((page) => page.facts.telegramContacts ?? [])
    .filter((contact, index, all) => all.findIndex((item) => item.url === contact.url && item.type === contact.type) === index);
  const rank = { business: 6, human: 5, channel: 3, group: 2, unknown: 1, bot: 0 };
  contacts.sort((a, b) => rank[b.type] - rank[a.type] || b.confidence - a.confidence);
  const contact = contacts[0] ?? null;
  return {
    website: new URL(first.url).origin,
    phone: bound.find((p) => p.facts.phone)?.facts.phone ?? null,
    genericEmail: bound.find((p) => p.facts.genericEmail)?.facts.genericEmail ?? null,
    telegramContact: contact,
    telegramContacts: contacts,
    telegramUrl: contact && ['business', 'human'].includes(contact.type) ? contact.url : null,
    decisionMakers: bound.flatMap((p) => p.facts.decisionMakers),
    evidence: bound.flatMap((p) => p.facts.evidence),
    signals: bound.flatMap((p) => p.facts.signals).filter((signal, index, all) => all.findIndex((s) => s.type === signal.type) === index),
  };
}

/** Creates no network traffic and touches no optional schema while disabled. */
export async function createFirecrawlQueueDependencies(
  env: FirecrawlEnvironment, db: D1Database, orgId: string, personalDataEnabled: boolean,
  deps: FirecrawlEnrichmentDependencies = {},
): Promise<LeadRadarQueueDependencies> {
  const config = firecrawlConfig(env, orgId);
  if (!config) return {};
  const store = new FirecrawlStore(db);
  if (!await store.available()) return {}; // Old deployment stays functional until 0049 is applied.
  const now = deps.now ?? (() => new Date());
  return {
    resolveMissingWebsites: true,
    enrichLead: async (website, expected, job) => {
      const direct: WebsiteEnrichmentResult = website
        ? await (deps.direct ?? enrichCompanyWebsiteDetailed)(website, expected)
        : { facts: null, reason: 'no_website', retryable: false };
      const ctx: FirecrawlJobContext = {
        orgId: job.orgId, searchId: job.searchId, jobId: job.id, companyId: job.companyId!,
        leaseOwner: job.leaseOwner!, leaseGeneration: job.leaseGeneration,
      };
      const directCount = direct.facts?.telegramContact?.type === 'business' ? 1 : 0;
      if (config.mode === 'fallback' && directCount) return direct;
      // A provider is not a way around an explicit denial.
      if (['robots_blocked', 'http_blocked', 'invalid_website'].includes(direct.reason)) {
        await store.report(ctx, config.mode, direct.reason, 0, 0, directCount, now().toISOString());
        return direct;
      }
      const client = new FirecrawlClient(config, store, ctx, deps.fetch, now);
      const pages: PageResult[] = [];
      let partialFailure: string | null = null;
      const policies = new Map<string, string | null>();
      const allowed = async (url: URL) => {
        if (!policies.has(url.origin)) {
          try { policies.set(url.origin, await (deps.robots ?? readPublicWebsiteRobots)(url)); }
          catch { throw new FirecrawlError('robots_unavailable'); }
        }
        const policy = policies.get(url.origin)!;
        if (policy !== null && (!robotsAllows(policy, url) || !robotsAllows(policy, url, 'firecrawl firecrawlbot firecrawlagent'))) {
          throw new FirecrawlError('robots_blocked');
        }
      };
      const scrape = async (url: URL, discovered: boolean, boundOrigin?: string): Promise<PageResult> => {
        await allowed(url);
        return client.request('scrape', url.hostname, {
          url: url.toString(), formats: ['html', 'rawHtml', 'links'],
          onlyMainContent: false, onlyCleanContent: false, skipTlsVerification: false,
          maxAge: 0, storeInCache: false, parsers: [], timeout: 30_000,
        }, async (response, observedAt) => {
          const data = firecrawlObject(response.data);
          const metadata = firecrawlObject(data.metadata);
          if (metadata.statusCode !== 200) throw new FirecrawlError('target_http_error');
          if (metadata.cacheState === 'hit' || metadata.cacheState === 'cached') throw new FirecrawlError('stale_cache');
          const source = typeof metadata.sourceURL === 'string' ? firecrawlPublicUrl(metadata.sourceURL) : null;
          const final = typeof metadata.url === 'string' ? firecrawlPublicUrl(metadata.url) : source;
          if (!source || !final || source.origin !== url.origin || final.origin !== url.origin) throw new FirecrawlError('unsafe_redirect');
          await allowed(final);
          const html = [data.rawHtml, data.html].filter((v): v is string => typeof v === 'string').join('\n');
          if (!html || new TextEncoder().encode(html).byteLength > 900_000) throw new FirecrawlError('invalid_page');
          // A same-origin contact page can inherit the independently verified
          // homepage identity, but never a conflicting explicit phone or redirect.
          const bound = identityBound(expected, final, html, discovered)
            || (boundOrigin === final.origin && !conflictingPhone(expected, html));
          const facts = { website: final.origin, ...extractCompanyPageFacts(final, html, bound, observedAt) };
          // Persist compact evidence, not upstream HTML or disallowed person records.
          facts.telegramContacts = (facts.telegramContacts ?? []).filter((c) => personalDataEnabled || c.type !== 'human').slice(0, 20);
          if (!personalDataEnabled) {
            facts.decisionMakers = [];
            facts.evidence = facts.evidence.filter((e) => !e.fieldPath.startsWith('decision_makers.') && e.fieldPath !== 'web.telegram.human');
          }
          facts.evidence = facts.evidence.slice(0, 70).map((e) => ({ ...e,
            observedAt: e.fieldPath.startsWith('signals.') ? e.observedAt : observedAt,
          }));
          facts.telegramContact = facts.telegramContacts.find((c) => c.type === 'business') ?? facts.telegramContacts[0] ?? null;
          facts.telegramUrl = facts.telegramContact && ['business', 'human'].includes(facts.telegramContact.type) ? facts.telegramContact.url : null;
          if (bound) facts.evidence.push({ id: `fc_binding_${crypto.randomUUID()}`, fieldPath: 'web.company_binding',
            value: 'Принадлежность сайта подтверждена по данным компании', sourceUrl: final.toString(),
            sourceType: 'company_website', observedAt, confidence: 0.9, classification: 'fact' });
          return { url: final.toString(), requestedUrl: url.toString(), contentHash: await firecrawlDigest(html),
            observedAt, providerId: typeof metadata.scrapeId === 'string' ? metadata.scrapeId.slice(0, 120) : null,
            freshRequested: true as const, bound, facts, links: urlsFrom(data.links ?? [], final).slice(0, 30) };
        }, JSON.stringify([expected, personalDataEnabled, discovered, boundOrigin ?? null]));
      };
      try {
        let home = website ? firecrawlPublicUrl(website) : null;
        if (website && !home) throw new FirecrawlError('unsafe_url');
        if (!home) {
          const query = `${expected.name} ${expected.city ?? ''} официальный сайт`.slice(0, 220);
          const candidates = await client.request('search', `search:${ctx.companyId}`, { query, limit: 5 }, (response) => {
            const data = firecrawlObject(response.data);
            return urlsFrom(data.web).slice(0, 5);
          });
          // At most two candidate domains; mismatch never upgrades to first-party.
          // Revalidate cached Search results too: safety policy may be tightened
          // during deployment, without changing the key or charging Search again.
          for (const candidate of [...new Set(candidates.flatMap((value) => {
            const url = firecrawlPublicUrl(value);
            return url ? [url.origin] : [];
          }))].slice(0, 2)) {
            const url = new URL(candidate);
            try {
              const page = await scrape(url, true);
              if (page.bound) { pages.push(page); home = new URL(page.url); break; }
            } catch (e) {
              if (!(e instanceof FirecrawlError) || !['robots_blocked','robots_unavailable','target_http_error','unsafe_redirect'].includes(e.code)) throw e;
            }
          }
          if (!home) throw new FirecrawlError('identity_unconfirmed');
        } else {
          const page = await scrape(home, false);
          if (!page.bound) throw new FirecrawlError('identity_unconfirmed');
          pages.push(page);
          home = new URL(page.url);
        }
        // Map is bounded and may fail without throwing away a useful homepage.
        let pageUrls = pages[0].links;
        try {
          const mapped = await client.request('map', home.hostname, { url: home.toString(), limit: 20,
            includeSubdomains: false, ignoreQueryParameters: true, timeout: 30_000 }, (response) => urlsFrom(response.links, home!));
          pageUrls = [...pageUrls, ...mapped];
        } catch (e) {
          if (e instanceof FirecrawlError && e.retryable) throw e;
          partialFailure = e instanceof FirecrawlError ? e.code : 'provider_unavailable';
        }
        for (const link of selectFirecrawlContactPages(pageUrls, home)) {
          if (pages.length >= 4) break;
          try { pages.push(await scrape(new URL(link), !website, home.origin)); }
          catch (e) {
            if (e instanceof FirecrawlError && e.retryable) throw e;
            partialFailure = e instanceof FirecrawlError ? e.code : 'provider_unavailable';
            if (e instanceof FirecrawlError && ['budget_or_lease_blocked','credits_exhausted','authentication_failed','request_unknown'].includes(e.code)) break;
          }
        }
        const facts = combineFirecrawlPages(pages);
        const contacts = facts.telegramContacts?.filter((c) => c.type === 'business').length ?? 0;
        await store.report(ctx, config.mode, partialFailure ?? (contacts ? 'enriched' : 'no_business_telegram'), pages.length, contacts, directCount, now().toISOString());
        return config.mode === 'shadow' ? direct : { facts, reason: 'enriched', retryable: false };
      } catch (error) {
        const code = error instanceof FirecrawlError ? error.code : 'provider_unavailable';
        await store.report(ctx, config.mode, code, pages.length, 0, directCount, now().toISOString());
        if (error instanceof FirecrawlError && error.retryable) return {
          facts: null, reason: 'source_timeout', retryable: true,
          ...(['rate_limited', 'continuation'].includes(error.code) ? {
            deferUntil: error.retryAt ?? new Date(now().getTime() + (error.code === 'continuation' ? 5_000 : 60_000)).toISOString(),
          } : {}),
        };
        if (config.mode === 'shadow') return direct;
        // Preserve useful direct facts. Unknown submission is terminal and visible,
        // not an automatic second charge on the next delivery of this job.
        return { ...direct, retryable: false };
      }
    },
  };
}
