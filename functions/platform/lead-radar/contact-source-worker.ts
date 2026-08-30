import { contactCandidatesForLead } from './contact-candidates';
import { contactSourceSchemaReady, loadContactEnrichments, saveContactEnrichment } from './contact-source-store';
import { FirecrawlClient, FirecrawlError, firecrawlConfig, firecrawlObject, type FirecrawlEnvironment, FIRECRAWL_DIRECTORY_DOMAINS } from './firecrawl-client';
import { FirecrawlStore } from './firecrawl-store';
import { JinaReaderClient, JinaReaderError, jinaReaderConfig, type JinaReaderEnvironment } from './jina-reader-client';
import { extractPublicBusinessContacts, publicContactSearchQueries, publicContactSourceUrl } from './public-contact-discovery';
import { readPublicPageHtml, readPublicWebsiteRobots, robotsAllows, type ExpectedCompanyWebsiteIdentity } from './sources';
import { safePublicHttpUrl } from './validation';
import type { LeadRadarQueueDependencies } from './queue';
import type { LeadRadarContactSource } from '../../../src/shared/lead-radar-contact-sources';

const TOP_UZ_ORIGIN = 'https://top.uz';

/** Free Tier-1 catalog discovery (audit-2026-08-30): query top.uz directly —
 * verified live on 2026-08-30 that /search/?text=<q> returns /company/<slug>
 * listings and the origin's robots allows public paths. Bounded: one search
 * page + ≤5 listings, robots-checked, same identity extraction as the
 * provider path. Any failure yields no sources and never fails the job. */
async function discoverTopUzListings(
  identity: ExpectedCompanyWebsiteIdentity,
  robotsFor: (url: URL) => Promise<string | null>,
  observedAt: string,
): Promise<LeadRadarContactSource[]> {
  const query = [identity.name, identity.city].filter((part): part is string => Boolean(part)).join(' ').slice(0, 90);
  if (query.length < 3) return [];
  const searchUrl = safePublicHttpUrl(`${TOP_UZ_ORIGIN}/search/?text=${encodeURIComponent(query)}`);
  if (!searchUrl) return [];
  const policies = new Map<string, string | null>();
  const allowed = async (url: URL): Promise<boolean> => {
    if (!policies.has(url.origin)) {
      try { policies.set(url.origin, await robotsFor(url)); } catch { return false; }
    }
    const policy = policies.get(url.origin)!;
    return policy === null || robotsAllows(policy, url);
  };
  if (!await allowed(searchUrl)) return [];
  const html = await readPublicPageHtml(searchUrl.toString());
  if (!html) return [];
  const seen = new Set<string>();
  const listings: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["'](\/company\/[a-z0-9-]+\/?)(?:#[^"']*)?["']/gi)) {
    const absolute = safePublicHttpUrl(`${TOP_UZ_ORIGIN}${match[1]}`);
    if (!absolute || seen.has(absolute.toString())) continue;
    seen.add(absolute.toString());
    listings.push(absolute.toString());
    if (listings.length >= 5) break;
  }
  const sources: LeadRadarContactSource[] = [];
  for (const listing of listings) {
    if (!await allowed(new URL(listing))) continue;
    const page = await readPublicPageHtml(listing);
    if (!page) continue;
    const parsed = await extractPublicBusinessContacts(listing, page, identity, observedAt);
    if (parsed) sources.push(parsed);
    if (sources.some((s) => s.candidates.some((c) => c.kind === 'telegram' && c.ownership === 'company'))) break;
  }
  return sources.slice(0, 4);
}

export async function createContactSourceQueueDependencies(env: FirecrawlEnvironment & JinaReaderEnvironment, db: D1Database, orgId: string,
  deps: { fetch?: typeof fetch; now?: () => Date; robots?: typeof readPublicWebsiteRobots; sleep?: (ms: number) => Promise<void> } = {}): Promise<LeadRadarQueueDependencies> {
  const config=firecrawlConfig(env,orgId);
  if (!await contactSourceSchemaReady(db)) return {};
  const store=new FirecrawlStore(db);
  if (config && !await store.available()) return {};
  const now=deps.now ?? (() => new Date());
  // Optional free Jina Reader fallback. When the flag is off no client is
  // built and no D1 query is added: behaviour stays byte-identical.
  let jina: JinaReaderClient | null=null;
  const jinaConfig=jinaReaderConfig(env);
  if (jinaConfig) {
    const candidate=new JinaReaderClient(jinaConfig,db,deps.fetch,now,deps.sleep);
    if (await candidate.available()) jina=candidate;
  }
  return { discoverLeadContactSources: async (job,lead) => {
    if (!job.companyId || !job.leaseOwner || lead.suppressed || lead.lifecycle==='do_not_contact') return {pending:false};
    const identity={name:lead.name,phone:lead.phone,address:lead.address,city:lead.city};
    const cached=await loadContactEnrichments(db,job.orgId,[{id:job.companyId,...identity}],now().toISOString());
    const previous=cached.get(job.companyId);
    // A temporary limit is not a completed search. Re-evaluate the atomic
    // reservation under current limits; this does not itself spend credits.
    if (previous?.status==='complete') return {pending:false};
    if (contactCandidatesForLead(lead).some((c) => c.lookupEligible && c.ownership==='company' && c.kind==='telegram')) return {pending:false};
    const client=config ? new FirecrawlClient(config,store,{orgId:job.orgId,searchId:job.searchId,companyId:job.companyId,
      jobId:job.id,leaseOwner:job.leaseOwner,leaseGeneration:job.leaseGeneration},deps.fetch,now) : null;
    const sources: LeadRadarContactSource[]=[];
    const seen=new Set<string>();
    let reason='no_matching_public_contact', status: 'complete'|'limited'|'unavailable'='complete';
    let retryAfterSeconds=60;
    const policies=new Map<string,string|null>();
    const allowed=async (url:URL) => {
      if (!policies.has(url.origin)) {
        try { policies.set(url.origin,await (deps.robots ?? readPublicWebsiteRobots)(url)); }
        catch { throw new FirecrawlError('robots_unavailable'); }
      }
      const policy=policies.get(url.origin)!;
      if (policy!==null && (!robotsAllows(policy,url) || !robotsAllows(policy,url,'firecrawl firecrawlbot firecrawlagent'))) throw new FirecrawlError('robots_blocked');
    };
    const queries=publicContactSearchQueries(identity);
    if (queries.length===0) reason='insufficient_company_identity';
    // Free Tier-1 first: direct top.uz discovery spends nothing, so an
    // exhausted provider budget no longer stops public contact sourcing.
    if (config?.mode!=='shadow') {
      try {
        sources.push(...await discoverTopUzListings(identity,(url)=>(deps.robots ?? readPublicWebsiteRobots)(url),now().toISOString()));
      } catch { /* Best-effort: the provider path below still runs. */ }
    }
    const freeHit=sources.some((s)=>s.candidates.some((c)=>c.kind==='telegram' && c.ownership==='company'));
    // Jina Reader renders the same URL when the direct provider fetch is
    // blocked by the origin (HTTP 521/5xx, empty page). The origin's robots
    // policy was already accepted above, so this never bypasses a denial.
    const jinaSource=async (raw:string,url:URL): Promise<LeadRadarContactSource|null> => {
      if (!jina) return null;
      try {
        const html=await jina.fetchHtml(raw);
        return await extractPublicBusinessContacts(url.toString(),html,identity,now().toISOString());
      } catch (error) {
        // Retryable provider states keep the queue's reason-code taxonomy.
        if (error instanceof JinaReaderError && error.retryable) throw new FirecrawlError(error.code,true,error.retryAt);
        return null;
      }
    };
    const firecrawl=client && !freeHit ? client : null;
    try {
      for (const query of firecrawl ? queries : []) {
        const urls=await firecrawl!.request('search',`contact-search:${job.companyId}`,{query,limit:5,sources:['web'],
          includeDomains:[...FIRECRAWL_DIRECTORY_DOMAINS,'t.me','telegram.me']}, (data) => {
          const web=firecrawlObject(data.data).web;
          if (!Array.isArray(web)) throw new FirecrawlError('invalid_response');
          return web.flatMap((item) => {
            const raw=item && typeof item==='object' ? (item as {url?:unknown}).url : null;
            const source=typeof raw==='string' ? publicContactSourceUrl(raw) : null;
            return source ? [source.url.toString()] : [];
          }).slice(0,5);
        },'contact-first:v2');
        for (const raw of urls) {
          if (seen.has(raw) || seen.size>=5) continue;
          seen.add(raw);
          const url=publicContactSourceUrl(raw)!.url;
          try {
            await allowed(url);
            const source=await firecrawl!.request('scrape',url.hostname,{url:raw,formats:['rawHtml','html'],
              onlyMainContent:false,onlyCleanContent:false,skipTlsVerification:false,maxAge:0,storeInCache:false,parsers:[],timeout:30_000},async (response,observedAt) => {
              const data=firecrawlObject(response.data), meta=firecrawlObject(data.metadata);
              if (meta.statusCode!==200) throw new FirecrawlError('target_http_error');
              if (['hit','cached'].includes(String(meta.cacheState))) throw new FirecrawlError('stale_cache');
              const original=typeof meta.sourceURL==='string' ? publicContactSourceUrl(meta.sourceURL) : null;
              const final=typeof meta.url==='string' ? publicContactSourceUrl(meta.url) : original;
              if (!original || !final || original.url.origin!==url.origin || final.url.origin!==url.origin) throw new FirecrawlError('unsafe_redirect');
              await allowed(final.url);
              const representations=[...new Set([data.rawHtml,data.html].filter((h):h is string => typeof h==='string'
                && h.length>0 && new TextEncoder().encode(h).byteLength<=900_000))];
              if (!representations.length) throw new FirecrawlError('invalid_page');
              let combined:LeadRadarContactSource|null=null;
              for (const html of representations) {
                // Match identity independently in each representation. Never
                // borrow a name from raw HTML to trust a phone in another DOM.
                const parsed=await extractPublicBusinessContacts(final.url.toString(),html,identity,observedAt);
                if (!parsed) continue;
                if (!combined) { combined=parsed; continue; }
                for (const candidate of parsed.candidates) {
                  const old=combined.candidates.findIndex(c=>c.key===candidate.key);
                  if (old<0) combined.candidates.push(candidate);
                  else if (combined.candidates[old].ownership!=='company' && candidate.ownership==='company') combined.candidates[old]=candidate;
                }
                combined.candidates=combined.candidates.slice(0,12);
              }
              return combined;
            },JSON.stringify(['contact-proof:v2',identity]));
            if (source) sources.push(source);
            if (source?.candidates.some(c=>c.kind==='telegram' && c.ownership==='company')) break;
          } catch (error) {
            if (error instanceof FirecrawlError && ['robots_blocked','robots_unavailable','target_http_error','unsafe_redirect','invalid_page'].includes(error.code)) {
              // robots_blocked/unsafe_redirect are explicit safety denials and
              // are never retried through an alternate fetch path.
              if (['target_http_error','invalid_page'].includes(error.code)) {
                const fallback=await jinaSource(raw,url);
                if (fallback) sources.push(fallback);
                if (fallback?.candidates.some(c=>c.kind==='telegram' && c.ownership==='company')) break;
              }
              continue;
            }
            throw error;
          }
        }
        if (sources.some((s)=>s.candidates.some((c)=>c.kind==='telegram' && c.ownership==='company')) || seen.size>=5) break;
      }
    } catch (error) {
      if (error instanceof FirecrawlError && error.retryable) return {pending:true,reason:`contact_sources_${error.code}`,
        retryAfterSeconds:error.retryAt ? Math.max(15,Math.ceil((Date.parse(error.retryAt)-now().getTime())/1000)) : 15};
      reason=error instanceof FirecrawlError ? error.code : 'source_unavailable';
      status=/budget|credits|rate_limit/.test(reason) ? 'limited' : 'unavailable';
      if (reason==='daily_budget_exhausted' || reason==='domain_budget_exhausted') retryAfterSeconds=900;
    }
    if (sources.length && status==='complete') reason='public_contact_candidates';
    const at=now();
    const saved=await saveContactEnrichment(db,job,identity,{status,reason:config?.mode==='shadow' ? 'shadow_only' : reason,
      sources:config?.mode==='shadow' ? [] : sources.slice(0,4),checkedAt:at.toISOString(),expiresAt:new Date(at.getTime()+86400_000).toISOString()});
    // A separate delivery handles Telegram. Paid parsing + account lookup must
    // not share one Workers Free D1/subrequest budget.
    // Partial evidence must not hide a budget/provider failure. Queue status
    // retains the reason instead of marking unfinished discovery successful.
    return {pending:true,reason:saved && status==='complete' ? 'contact_sources_pending' : `contact_sources_${reason}`,
      retryAfterSeconds:status==='complete' ? 15 : retryAfterSeconds};
  } };
}
