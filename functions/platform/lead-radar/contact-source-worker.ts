import { contactCandidatesForLead } from './contact-candidates';
import { contactSourceSchemaReady, loadContactEnrichments, saveContactEnrichment } from './contact-source-store';
import { FirecrawlClient, FirecrawlError, firecrawlConfig, firecrawlObject, type FirecrawlEnvironment, FIRECRAWL_DIRECTORY_DOMAINS } from './firecrawl-client';
import { FirecrawlStore } from './firecrawl-store';
import { extractPublicBusinessContacts, publicContactSearchQueries, publicContactSourceUrl } from './public-contact-discovery';
import { readPublicWebsiteRobots, robotsAllows } from './sources';
import type { LeadRadarQueueDependencies } from './queue';
import type { LeadRadarContactSource } from '../../../src/shared/lead-radar-contact-sources';

export async function createContactSourceQueueDependencies(env: FirecrawlEnvironment, db: D1Database, orgId: string,
  deps: { fetch?: typeof fetch; now?: () => Date; robots?: typeof readPublicWebsiteRobots } = {}): Promise<LeadRadarQueueDependencies> {
  const config=firecrawlConfig(env,orgId);
  if (!config || !await contactSourceSchemaReady(db)) return {};
  const store=new FirecrawlStore(db);
  if (!await store.available()) return {};
  const now=deps.now ?? (() => new Date());
  return { discoverLeadContactSources: async (job,lead) => {
    if (!job.companyId || !job.leaseOwner || lead.suppressed || lead.lifecycle==='do_not_contact') return {pending:false};
    const identity={name:lead.name,phone:lead.phone,address:lead.address,city:lead.city};
    const cached=await loadContactEnrichments(db,job.orgId,[{id:job.companyId,...identity}],now().toISOString());
    if (cached.has(job.companyId)) return {pending:false};
    if (contactCandidatesForLead(lead).some((c) => c.lookupEligible && c.ownership==='company' && c.kind==='telegram')) return {pending:false};
    const client=new FirecrawlClient(config,store,{orgId:job.orgId,searchId:job.searchId,companyId:job.companyId,
      jobId:job.id,leaseOwner:job.leaseOwner,leaseGeneration:job.leaseGeneration},deps.fetch,now);
    const sources: LeadRadarContactSource[]=[];
    const seen=new Set<string>();
    let reason='no_matching_public_contact', status: 'complete'|'limited'|'unavailable'='complete';
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
    try {
      for (const query of queries) {
        const urls=await client.request('search',`contact-search:${job.companyId}`,{query,limit:5,sources:['web'],
          includeDomains:[...FIRECRAWL_DIRECTORY_DOMAINS,'t.me','telegram.me']}, (data) => {
          const web=firecrawlObject(data.data).web;
          if (!Array.isArray(web)) throw new FirecrawlError('invalid_response');
          return web.flatMap((item) => {
            const raw=item && typeof item==='object' ? (item as {url?:unknown}).url : null;
            const source=typeof raw==='string' ? publicContactSourceUrl(raw) : null;
            return source ? [source.url.toString()] : [];
          }).slice(0,2);
        },'contact-first:v1');
        for (const raw of urls) {
          if (seen.has(raw) || seen.size>=3) continue;
          seen.add(raw);
          const url=publicContactSourceUrl(raw)!.url;
          try {
            await allowed(url);
            const source=await client.request('scrape',url.hostname,{url:raw,formats:['rawHtml','html'],
              onlyMainContent:false,onlyCleanContent:false,skipTlsVerification:false,maxAge:0,storeInCache:false,parsers:[],timeout:30_000},async (response,observedAt) => {
              const data=firecrawlObject(response.data), meta=firecrawlObject(data.metadata);
              if (meta.statusCode!==200) throw new FirecrawlError('target_http_error');
              if (['hit','cached'].includes(String(meta.cacheState))) throw new FirecrawlError('stale_cache');
              const original=typeof meta.sourceURL==='string' ? publicContactSourceUrl(meta.sourceURL) : null;
              const final=typeof meta.url==='string' ? publicContactSourceUrl(meta.url) : original;
              if (!original || !final || original.url.origin!==url.origin || final.url.origin!==url.origin) throw new FirecrawlError('unsafe_redirect');
              await allowed(final.url);
              const html=[data.rawHtml,data.html].find((h):h is string => typeof h==='string' && h.length>0 && new TextEncoder().encode(h).byteLength<=900_000);
              if (!html) throw new FirecrawlError('invalid_page');
              return extractPublicBusinessContacts(final.url.toString(),html,identity,observedAt);
            },JSON.stringify(['contact-proof:v1',identity]));
            if (source) sources.push(source);
          } catch (error) {
            if (error instanceof FirecrawlError && ['robots_blocked','robots_unavailable','target_http_error','unsafe_redirect','invalid_page'].includes(error.code)) continue;
            throw error;
          }
        }
        if (sources.some((s)=>s.candidates.some((c)=>c.ownership==='company')) || seen.size>=3) break;
      }
    } catch (error) {
      if (error instanceof FirecrawlError && error.retryable) return {pending:true};
      reason=error instanceof FirecrawlError ? error.code : 'source_unavailable';
      status=/budget|credits|rate_limit/.test(reason) ? 'limited' : 'unavailable';
    }
    if (sources.length) { status='complete'; reason='public_contact_candidates'; }
    const at=now();
    const saved=await saveContactEnrichment(db,job,identity,{status,reason:config.mode==='shadow' ? 'shadow_only' : reason,
      sources:config.mode==='shadow' ? [] : sources,checkedAt:at.toISOString(),expiresAt:new Date(at.getTime()+86400_000).toISOString()});
    // A separate delivery handles Telegram. Paid parsing + account lookup must
    // not share one Workers Free D1/subrequest budget.
    return {pending:saved};
  } };
}
