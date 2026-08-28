import { assessLeadRadarPhone, parseLeadRadarTelegramLocator, type LeadRadarContactCandidate } from '../../../src/shared/lead-radar-contacts';
import type { LeadRadarContactSource } from '../../../src/shared/lead-radar-contact-sources';
import { FIRECRAWL_DIRECTORY_DOMAINS, firecrawlDiscoveryUrl, firecrawlDigest } from './firecrawl-client';
import { classifyTelegramContact, type ExpectedCompanyWebsiteIdentity } from './sources';
import { normalizeCompanyKey, safePublicHttpUrl } from './validation';
import { publishedTelegramLocators } from './telegram-locators';

const CYRILLIC:Record<string,string>={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',қ:'q',ғ:'g',ҳ:'h',ў:'o'};
function latinName(value:string):string {
  return value.toLocaleLowerCase('ru').replace(/[а-яёқғҳў]/g,(letter)=>CYRILLIC[letter] ?? letter).replace(/['‘’ʻʼ`]/g,'');
}
function businessNameKey(value:string):string {
  const generic=new Set(['ooo','mchj','chp','kompaniya','company','stomatologiya','stomatologicheskaya','klinika','clinic','dental','dentist','stomatology']);
  return normalizeCompanyKey(latinName(value)).split('-').filter((word)=>!generic.has(word)).join('-');
}

/** Allowlisted public listings/profiles only; never member lists or private links. */
export function publicContactSourceUrl(value: string): { url: URL; kind: LeadRadarContactSource['kind'] } | null {
  const url = safePublicHttpUrl(value);
  if (!url || url.search || url.hash) return null;
  if (/^\/(?:contacts?|about|uslugi|services)(?:\/|$)/i.test(url.pathname)) return null;
  if (['t.me','telegram.me'].includes(url.hostname) && /^\/[a-z][a-z0-9_]{4,31}\/?$/i.test(url.pathname)
    && parseLeadRadarTelegramLocator(url.toString())?.kind === 'username') return {url,kind:'telegram_profile'};
  if (FIRECRAWL_DIRECTORY_DOMAINS.some((d) => url.hostname===d || url.hostname.endsWith(`.${d}`))
    && firecrawlDiscoveryUrl(value)) return {url,kind:'business_listing'};
  return null;
}

export function publicContactSearchQueries(identity: ExpectedCompanyWebsiteIdentity): string[] {
  const quoted = identity.name.match(/["«]([^"»]{3,80})["»]/)?.[1];
  const name = (quoted ?? identity.name.replace(/\b(?:dental clinic|dentist|mchj)\b/gi,' ')
    .replace(/(?:семейная\s+)?стоматологи[яи]|стоматологическая\s+клиника|\b(?:ООО|ЧП)\b/gi,' '))
    .replace(/["\r\n<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
  const city = (identity.city ?? '').replace(/["\r\n<>]/g,' ').slice(0,45);
  const phone = identity.phone ? assessLeadRadarPhone(identity.phone).e164 : null;
  // Retrieval must not require name + phone + RU/UZ contact words on one page.
  // Ownership is checked on the fetched entity, never on these broad results.
  const queries = name.length >= 3 ? [`"${name}" ${city}`] : [];
  if (phone) queries.push(`"${phone}"`);
  else if (name.length >= 3 && latinName(name)!==name.toLowerCase()) queries.push(`"${latinName(name)}" ${city}`);
  return [...new Set(queries)].map((q) => q.slice(0,240));
}

function boundedDiv(html: string, opening: RegExp): string | null {
  const match=opening.exec(html);
  if (!match) return null;
  const start=match.index, tail=html.slice(start,start+100_000);
  let depth=0;
  for (const tag of tail.matchAll(/<\/?div\b[^>]*>/gi)) {
    depth+=tag[0].startsWith('</') ? -1 : 1;
    if (depth===0) return tail.slice(0,tag.index!+tag[0].length);
  }
  return null;
}

function identityMatches(name: string, phones: unknown[], address: string, expected: ExpectedCompanyWebsiteIdentity): boolean {
  const actualKey=businessNameKey(name), expectedKey=businessNameKey(expected.name);
  const sameName = normalizeCompanyKey(name)===normalizeCompanyKey(expected.name)
    || actualKey.length>=3 && actualKey===expectedKey;
  const expectedPhone = expected.phone ? assessLeadRadarPhone(expected.phone).e164 : null;
  const advertised = phones.filter((p): p is string => typeof p==='string').map((p) => assessLeadRadarPhone(p).e164).filter(Boolean);
  if (expectedPhone && advertised.length && !advertised.includes(expectedPhone)) return false;
  const samePhone = !!expectedPhone && advertised.includes(expectedPhone);
  const normalizedAddress = normalizeCompanyKey(expected.address ?? '');
  return sameName && (samePhone || normalizedAddress.length>=12 && normalizeCompanyKey(address)===normalizedAddress);
}

/** Identity and contact must be in the SAME business entity. A page-wide match,
 * search snippet or directory's shared footer cannot establish ownership. */
export async function extractPublicBusinessContacts(value: string, html: string, expected: ExpectedCompanyWebsiteIdentity,
  observedAt: string): Promise<LeadRadarContactSource | null> {
  const source = publicContactSourceUrl(value);
  if (!source) return null;
  const endpoints: Array<{value:string;context:string;structured:boolean;unconfirmed?:boolean}> = [];
  const entities: Array<{name:string;phones:unknown[];address:string}> = [];
  const corporatePhones=new Set<string>();
  if (source.kind==='telegram_profile') {
    const title=html.match(/<div\b[^>]*class=["'][^"']*\btgme_page_title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]?.replace(/<[^>]*>/g,' ').trim() ?? '';
    const description=html.match(/<div\b[^>]*class=["'][^"']*\btgme_page_description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
    const phones=[...description.matchAll(/\+\d(?:[\s().-]*\d){8,14}/g)].map((p) => p[0]);
    if (identityMatches(title,phones,'',expected)) {
      // The published profile is a candidate, not proof it is a user. Bridge
      // rejects channel/group/bot peers. Public business CTAs in its bio may
      // lead to a separate booking account; never inspect members/admin lists.
      endpoints.push({value,context:'',structured:true});
      for (const item of publishedTelegramLocators(description)) endpoints.push({value:item.locator.url,context:item.context.replace(/<[^>]*>/g,' '),structured:false});
    }
  }
  const types = new Set(['Organization','LocalBusiness','Dentist','MedicalClinic','MedicalBusiness','Hospital','Pharmacy',
    'BeautySalon','HairSalon','HealthAndBeautyBusiness','DaySpa','Store','ClothingStore','ElectronicsStore','FurnitureStore',
    'AutoRepair','AutoDealer','AutomotiveBusiness','AutoPartsStore','EducationalOrganization','School','LanguageSchool',
    'TravelAgency','RealEstateAgent','ProfessionalService','HomeAndConstructionBusiness','FoodEstablishment','Restaurant',
    'CafeOrCoffeeShop','SportsActivityLocation','ExerciseGym','Hotel','LodgingBusiness']);
  let visited=0;
  const visit = (node: unknown, depth=0) => {
    if (++visited>300 || depth>8 || !node || typeof node!=='object') return;
    if (Array.isArray(node)) { node.slice(0,50).forEach((n) => visit(n,depth+1)); return; }
    const entity = node as Record<string,unknown>;
    const address = typeof entity.address==='string' ? entity.address : entity.address && typeof entity.address==='object'
      ? String((entity.address as Record<string,unknown>).streetAddress ?? '') : '';
    const business=[entity['@type']].flat().some((t) => typeof t==='string' && types.has(t)) && typeof entity.name==='string';
    if (business) entities.push({name:entity.name as string,phones:[entity.telephone].flat(),address});
    if (business && identityMatches(entity.name as string,[entity.telephone].flat(),address,expected)) {
      for (const raw of [entity.telephone].flat()) if (typeof raw==='string') {
        const phone=assessLeadRadarPhone(raw);
        if (phone.e164 && phone.mobileLookupCandidate) corporatePhones.add(phone.e164);
      }
      for (const endpoint of [entity.url,...[entity.sameAs].flat()]) if (typeof endpoint==='string') endpoints.push({value:endpoint,context:'',structured:true});
      for (const point of [entity.contactPoint].flat()) {
        if (!point || typeof point!=='object') continue;
        const p=point as Record<string,unknown>, context=String(p.contactType ?? '');
        if (/personal|owner|director|личн|директор|владелец/i.test(context)) continue;
        for (const endpoint of [p.url,...[p.sameAs].flat()]) if (typeof endpoint==='string') endpoints.push({value:endpoint,context,structured:true});
      }
    }
    Object.values(entity).forEach((n) => visit(n,depth+1));
  };
  for (const script of html.slice(0,900_000).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(script[1])); } catch { /* No inference from invalid structured data. */ }
  }
  // Top.uz publishes company social links in a bounded card, not JSON-LD.
  // A name/slug-only match is kept for TYPE checking and manual review only.
  // It cannot become a corporate source without the independent phone/address.
  if (/(^|\.)top\.uz$/i.test(source.url.hostname) && source.url.pathname.startsWith('/company/') && entities.length===1) {
    const entity=entities[0], expectedKey=businessNameKey(expected.name);
    const actualKey=businessNameKey(entity.name);
    const slug=normalizeCompanyKey(decodeURIComponent(source.url.pathname.split('/').pop() ?? ''));
    const phone=expected.phone ? assessLeadRadarPhone(expected.phone).e164 : null;
    const phones=entity.phones.filter((p):p is string=>typeof p==='string').map((p)=>assessLeadRadarPhone(p).e164).filter(Boolean);
    const nameMatch=expectedKey.length>=5 && (expectedKey===actualKey || `${slug}-`.startsWith(`${expectedKey}-`));
    const conflict=phone && phones.length>0 && !phones.includes(phone);
    const block=boundedDiv(html,/<div\b[^>]*\bid=["']contacts["'][^>]*>/i);
    if (nameMatch && !conflict && block && [...html.matchAll(/\bid=["']contacts["']/gi)].length===1) {
      const headings=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((h)=>normalizeCompanyKey(h[1].replace(/<[^>]*>/g,' ').trim()));
      if (headings.length>0 && headings.every((h)=>h===normalizeCompanyKey(entity.name))) {
        for (const anchor of block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*Telegram,?\s*<\/a>/gi)) {
          if (parseLeadRadarTelegramLocator(anchor[1])?.kind==='username') endpoints.push({value:anchor[1],context:'',structured:true,
            unconfirmed:!identityMatches(entity.name,entity.phones,entity.address,expected)});
        }
      }
    }
  }
  // Unstructured listings are accepted only inside one bounded main entity,
  // with exact name heading + exact published business phone. No footer/nav.
  const main = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1]
    ?.replace(/<(?:footer|nav|aside|script|style)\b[^>]*>[\s\S]*?<\/(?:footer|nav|aside|script|style)>/gi,'');
  if (main && main.length<60_000) {
    const headings=[...main.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    const phones=[...main.matchAll(/\+\d(?:[\s().-]*\d){8,14}/g)].map((p) => p[0]);
    if (headings.length===1 && identityMatches(headings[0][1].replace(/<[^>]*>/g,' '),phones,'',expected)) {
      for (const item of publishedTelegramLocators(main)) endpoints.push({value:item.locator.url,context:item.context.replace(/<[^>]*>/g,' '),structured:false});
    }
  }
  const id=`lrcs_${(await firecrawlDigest(JSON.stringify([value,expected,observedAt]))).slice(0,32)}`;
  const candidates = new Map<string,LeadRadarContactCandidate>();
  for (const endpoint of endpoints.slice(0,40)) {
    const locator=parseLeadRadarTelegramLocator(endpoint.value);
    if (!locator) continue;
    const classification=classifyTelegramContact({username:locator.kind==='username' ? locator.value : '',context:endpoint.context,
      isOfficialCompanyPage:false,hasNamedDecisionMaker:false,hasStructuredOrganizationOwner:endpoint.structured});
    const company=classification.type==='business' || classification.type==='unknown' && /запис|напишите|связаться|регистратур|qabul|aloqa|bog.lan|contact|booking/i.test(endpoint.context)
      && !/разработ|powered by|website by|web design|личн|personal/i.test(endpoint.context);
    if (!company || locator.kind==='phone' && !assessLeadRadarPhone(locator.value).mobileLookupCandidate) continue;
    const key=`telegram:${locator.kind==='username' ? locator.url.toLowerCase() : locator.url}`;
    if (candidates.get(key)?.ownership==='company' && endpoint.unconfirmed) continue;
    candidates.set(key,{key,kind:'telegram',value:locator.url,phoneType:null,ownership:endpoint.unconfirmed ? 'unconfirmed' : 'company',lookupEligible:true,
      reason:endpoint.unconfirmed ? 'ownership_unconfirmed' : 'telegram_unverified',
      sourceUrl:value,evidenceIds:[id],observedAt});
  }
  for (const phone of corporatePhones) {
    const key=`phone:${phone}`;
    candidates.set(key,{key,kind:'phone',value:phone,phoneType:'mobile',ownership:'company',lookupEligible:true,reason:'mobile_unverified',
      sourceUrl:value,evidenceIds:[id],observedAt});
  }
  return candidates.size ? {id,kind:source.kind,url:value,observedAt,candidates:[...candidates.values()].slice(0,12)} : null;
}
