import { assessLeadRadarPhone, extractLeadRadarPhones } from '../../../src/shared/lead-radar-contacts';
import { normalizeCompanyKey } from './validation';

const CYRILLIC: Record<string, string> = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',қ:'q',ғ:'g',ҳ:'h',ў:'o'};
const GENERIC = new Set(['ooo','llc','ltd','inc','ip','mchj','chp','xk','aj','jsc','kompaniya','company',
  'stomatologiya','stomatologii','stomatologicheskaya','semeinaya','semeynaya','klinika','kliniki','clinic','dental','dentist','dentistry',
  'stomatology','dent','center','centre','markaz','tsentr','salon','restaurant','restoran','school','shkola','academy','akademiya',
  'shop','store','magazin','beauty','krasoty','avtoservis','parikmaherskaya']);

export function latinBusinessName(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/[а-яёқғҳў]/g, letter => CYRILLIC[letter] ?? letter).replace(/['‘’ʻʼ`]/g, '');
}
export function businessNameKey(value: string): string {
  return normalizeCompanyKey(latinBusinessName(value)).split('-').filter(word => !GENERIC.has(word)).join('-');
}
export function hasDistinctBusinessName(value: string): boolean {
  return businessNameKey(value).split('-').some(word => word.length >= 3 && !/^\d+$/.test(word));
}

const BUSINESS_TYPES = new Set(['Organization','LocalBusiness','Dentist','MedicalClinic','MedicalBusiness','Hospital','Pharmacy',
  'BeautySalon','HairSalon','HealthAndBeautyBusiness','DaySpa','Store','ClothingStore','ElectronicsStore','FurnitureStore',
  'AutoRepair','AutoDealer','AutomotiveBusiness','AutoPartsStore','EducationalOrganization','School','LanguageSchool',
  'TravelAgency','RealEstateAgent','ProfessionalService','HomeAndConstructionBusiness','FoodEstablishment','Restaurant',
  'CafeOrCoffeeShop','SportsActivityLocation','ExerciseGym','Hotel','LodgingBusiness']);
const PRIVATE_CONTACT = /personal|owner|director|личн|директор|владелец/i;

export interface PublishedBusinessEntity {
  name: string;
  address: string;
  phones: string[];
  links: Array<{ value: string; context: string }>;
}

/** Bounded provider-neutral extraction. ContactPoints belong only to their parent
 * organization; Person, publisher and unrelated graph nodes are not flattened. */
export function publishedBusinessEntities(html: string): PublishedBusinessEntity[] {
  const result: PublishedBusinessEntity[] = [];
  let visited = 0;
  const strings = (value: unknown): string[] => [value].flat().filter((v): v is string => typeof v === 'string').slice(0, 40);
  const visit = (node: unknown, depth = 0): void => {
    if (++visited > 300 || depth > 8 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.slice(0, 50).forEach(n => visit(n, depth + 1)); return; }
    const entity = node as Record<string, unknown>;
    if (strings(entity['@type']).some(t => BUSINESS_TYPES.has(t)) && typeof entity.name === 'string') {
      const address = typeof entity.address === 'string' ? entity.address : entity.address && typeof entity.address === 'object'
        ? String((entity.address as Record<string, unknown>).streetAddress ?? '') : '';
      const phones = strings(entity.telephone);
      const links = [...strings(entity.url), ...strings(entity.sameAs)].map(value => ({ value, context: '' }));
      for (const value of [entity.contactPoint].flat().slice(0, 40)) {
        if (!value || typeof value !== 'object') continue;
        const point = value as Record<string, unknown>;
        const context = typeof point.contactType === 'string' ? point.contactType : '';
        if (PRIVATE_CONTACT.test(context)) continue;
        phones.push(...strings(point.telephone));
        links.push(...[...strings(point.url), ...strings(point.sameAs)].map(value => ({ value, context })));
      }
      result.push({ name: entity.name, address, phones: [...new Set(phones)], links });
    }
    for (const [key, value] of Object.entries(entity)) {
      if (!['author','publisher','creator','employee','founder','review','reviews'].includes(key)) visit(value, depth + 1);
    }
  };
  for (const match of html.slice(0, 900_000).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Invalid JSON is not evidence. */ }
  }
  return result;
}

export interface BusinessIdentity { name: string; phone?: string | null; address?: string | null }
export function matchesBusinessIdentity(entity: Pick<PublishedBusinessEntity, 'name' | 'phones' | 'address'>, expected: BusinessIdentity): boolean {
  const actualKey = businessNameKey(entity.name), expectedKey = businessNameKey(expected.name);
  const sameName = normalizeCompanyKey(entity.name) === normalizeCompanyKey(expected.name)
    || actualKey.length >= 3 && actualKey === expectedKey;
  const expectedPhones = expected.phone ? extractLeadRadarPhones(expected.phone).flatMap(p => p.e164 ? [p.e164] : []) : [];
  const advertised = entity.phones.flatMap(p => extractLeadRadarPhones(p).flatMap(phone => phone.e164 ? [phone.e164] : []));
  const samePhone = expectedPhones.some(phone => advertised.includes(phone));
  if (expectedPhones.length && advertised.length && !samePhone) return false;
  const address = normalizeCompanyKey(expected.address ?? '');
  return sameName && (samePhone || address.length >= 12 && normalizeCompanyKey(entity.address) === address);
}

/** Only phones actually published in page text/tel links or a single business
 * entity. Arbitrary script variables, analytics IDs and Person JSON are ignored. */
export function publishedPagePhones(html: string, expected?: BusinessIdentity): ReturnType<typeof assessLeadRadarPhone>[] {
  const content = html.replace(/<!--[^]*?-->/g, ' ').replace(/<(script|style|nav|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const text = content.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|#39);/gi, ' ');
  const excluded = new Set<string>();
  const anchors = [...content.matchAll(/href\s*=\s*["'](tel:[^"']{3,180})["']/gi)].flatMap(match => {
    const phone = assessLeadRadarPhone(match[1]);
    const nearby = content.slice(Math.max(0, match.index! - 140), match.index! + match[0].length + 140).replace(/<[^>]*>/g, ' ');
    if (/разработк[аи] сайта|создание сайта|powered by|website by|web design|личный телефон|personal phone/i.test(nearby)) {
      if (phone.e164) excluded.add(phone.e164);
      return [];
    }
    return [phone];
  });
  // A text-only vendor/personal phone is no more trustworthy than its tel link.
  for (const block of content.matchAll(/<(p|span|address|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if (/разработк[аи] сайта|создание сайта|powered by|website by|web design|личный телефон|personal phone/i.test(block[2])) {
      for (const phone of extractLeadRadarPhones(block[2].replace(/<[^>]*>/g, ' '))) if (phone.e164) excluded.add(phone.e164);
    }
  }
  const entities = publishedBusinessEntities(html);
  const bound = expected ? entities.filter(entity => matchesBusinessIdentity(entity, expected)) : entities.length === 1 ? entities : [];
  const structured = bound.flatMap(entity => entity.phones.flatMap(phone => extractLeadRadarPhones(phone)));
  const phones = new Map<string, ReturnType<typeof assessLeadRadarPhone>>();
  for (const phone of [...anchors, ...extractLeadRadarPhones(text), ...structured]) {
    if (phone.e164 && phone.reason !== 'extension' && !excluded.has(phone.e164)) phones.set(phone.e164, phone);
  }
  return [...phones.values()];
}
