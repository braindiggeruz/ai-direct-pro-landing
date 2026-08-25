export type LeadRadarIntentId =
  | 'dentistry'
  | 'medical_clinic'
  | 'beauty'
  | 'real_estate'
  | 'education'
  | 'automotive'
  | 'food_service'
  | 'fitness'
  | 'retail'
  | 'pharmacy'
  | 'veterinary'
  | 'legal'
  | 'accounting'
  | 'marketing'
  | 'information_technology'
  | 'hospitality'
  | 'logistics';

export type LeadRadarIntentMatchKind = 'exact' | 'alias' | 'semantic' | 'fuzzy' | 'fallback';
export type LeadRadarIntentTier = 'primary' | 'related' | 'fallback' | 'none';

export interface LeadRadarOsmTagCondition {
  key: string;
  operation: 'equals' | 'matches' | 'exists';
  value?: string;
}

export interface LeadRadarIntentOsmFilter {
  tier: Exclude<LeadRadarIntentTier, 'fallback' | 'none'>;
  conditions: LeadRadarOsmTagCondition[];
}

export interface LeadRadarIntentResolution {
  canonicalId: LeadRadarIntentId | null;
  canonicalLabel: string;
  matchKind: LeadRadarIntentMatchKind;
  confidence: number;
  expanded: boolean;
  matchedAlias: string | null;
  aliasesUsed: string[];
  normalizedQuery: string;
  queryTokens: string[];
  /** Bounded literal terms used only for an OSM name fallback. */
  nameFallbackTokens: string[];
  osmFilters: LeadRadarIntentOsmFilter[];
}

export interface LeadRadarOsmIntentScore {
  tier: LeadRadarIntentTier;
  score: number;
}

interface IntentDefinition {
  id: LeadRadarIntentId;
  canonicalLabel: string;
  aliases: string[];
  distinctiveRoots: string[];
  weakRoots?: string[];
  nameFallbackTokens: string[];
  osmFilters: LeadRadarIntentOsmFilter[];
}

const eq = (key: string, value: string): LeadRadarOsmTagCondition => ({
  key,
  operation: 'equals',
  value,
});
const matches = (key: string, value: string): LeadRadarOsmTagCondition => ({
  key,
  operation: 'matches',
  value,
});
const exists = (key: string): LeadRadarOsmTagCondition => ({ key, operation: 'exists' });
const primary = (...conditions: LeadRadarOsmTagCondition[]): LeadRadarIntentOsmFilter => ({
  tier: 'primary',
  conditions,
});
const related = (...conditions: LeadRadarOsmTagCondition[]): LeadRadarIntentOsmFilter => ({
  tier: 'related',
  conditions,
});

/**
 * A closed, deterministic vocabulary. It deliberately maps language to
 * evidence-backed OSM tags and never invents a business category with an LLM.
 */
const INTENTS: IntentDefinition[] = [
  {
    id: 'dentistry',
    canonicalLabel: 'Стоматология',
    aliases: [
      'Стоматология', 'стоматолог', 'стоматологическая клиника', 'зубная клиника',
      'дантист', 'dentist', 'dentistry', 'dental', 'dental clinic', 'stomatologia',
      'stomatologiya', 'stomatolog', 'clinica stomatologica', 'tish shifokori',
      'tish klinikasi', 'tish tabibi', 'ortodont', 'ортодонт', 'зуб', 'зубы',
      'лечение зубов',
    ],
    distinctiveRoots: ['stomat', 'dent', 'zubo', 'zubn', 'tish', 'ortodont'],
    nameFallbackTokens: ['стомат', 'stomat', 'dent', 'dental', 'зуб', 'zub', 'tish', 'ортодонт', 'ortodont'],
    osmFilters: [
      primary(eq('amenity', 'dentist')),
      primary(eq('healthcare', 'dentist')),
      related(eq('amenity', 'clinic'), matches('healthcare:speciality', 'dentist|dental|stomatolog|orthodont')),
      related(eq('healthcare', 'clinic'), matches('healthcare:speciality', 'dentist|dental|stomatolog|orthodont')),
    ],
  },
  {
    id: 'medical_clinic',
    canonicalLabel: 'Медицинская клиника',
    aliases: [
      'Медицинская клиника', 'клиника', 'медицинский центр', 'поликлиника', 'врач',
      'clinic', 'medical clinic', 'medical center', 'doctor', 'doctors', 'shifoxona',
      'tibbiyot markazi', 'tibbiy klinika',
    ],
    distinctiveRoots: ['meditsin', 'medical', 'poliklin', 'shifox', 'tibbiy', 'doctor', 'vrach'],
    weakRoots: ['klinik', 'clinic'],
    nameFallbackTokens: ['медицин', 'medical', 'поликлин', 'poliklin', 'shifox', 'tibbiy', 'врач', 'doctor'],
    osmFilters: [
      primary(eq('amenity', 'clinic')),
      primary(eq('amenity', 'doctors')),
      primary(eq('healthcare', 'clinic')),
      primary(eq('healthcare', 'doctor')),
    ],
  },
  {
    id: 'beauty',
    canonicalLabel: 'Красота и уход',
    aliases: [
      'Салон красоты', 'красота', 'парикмахерская', 'барбершоп', 'beauty salon',
      'beauty', 'hairdresser', 'hair salon', 'barbershop', 'gozallik saloni',
      'go‘zallik saloni', 'sartaroshxona', 'spa salon', 'стрижка', 'подстричься',
      'салон для волос', 'маникюр', 'ногти', 'nails', 'cosmetology', 'косметология',
    ],
    distinctiveRoots: [
      'krasot', 'beaut', 'parikmah', 'hair', 'barber', 'gozall', 'sartarosh',
      'strizhk', 'podstrich', 'volos', 'manikyur', 'nogt', 'nail', 'cosmetolog',
    ],
    nameFallbackTokens: [
      'красот', 'beaut', 'парикмах', 'hair', 'барбер', 'barber', 'gozall', 'sartarosh',
      'стриж', 'strizh', 'волос', 'volos', 'маникюр', 'manikyur', 'nail', 'косметолог',
    ],
    osmFilters: [
      primary(eq('shop', 'beauty')),
      primary(eq('shop', 'hairdresser')),
      related(eq('leisure', 'spa')),
      related(eq('craft', 'barber')),
      related(eq('shop', 'cosmetics')),
    ],
  },
  {
    id: 'real_estate',
    canonicalLabel: 'Недвижимость',
    aliases: [
      'Недвижимость', 'агентство недвижимости', 'риелтор', 'риэлтор', 'real estate',
      'real estate agency', 'estate agent', 'kochmas mulk', "ko'chmas mulk", 'uy sotish',
      'квартира', 'жилье', 'жильё', 'продажа квартир', 'аренда жилья', 'снять квартиру',
    ],
    distinctiveRoots: ['nedvizh', 'rieltor', 'rieltor', 'estate', 'kochmas', 'kvartir', 'zhile', 'arend'],
    nameFallbackTokens: [
      'недвиж', 'риелтор', 'риэлтор', 'estate', 'kochmas', 'koʻchmas', 'квартир',
      'kvartir', 'жиль', 'zhil', 'аренд', 'arend',
    ],
    osmFilters: [
      primary(eq('office', 'estate_agent')),
      related(eq('office', 'property_management')),
    ],
  },
  {
    id: 'education',
    canonicalLabel: 'Образование и курсы',
    aliases: [
      'Образование', 'учебный центр', 'курсы', 'школа', 'языковая школа', 'training center',
      'education', 'courses', 'school', 'language school', 'oquv markazi', "o'quv markazi",
      'talim markazi', "ta'lim markazi", 'kurslar',
    ],
    distinctiveRoots: ['obrazovan', 'ucheb', 'kurs', 'education', 'training', 'school', 'oquv', 'talim'],
    nameFallbackTokens: ['образован', 'учеб', 'курс', 'education', 'training', 'школ', 'school', 'oquv', 'o‘quv', 'talim'],
    osmFilters: [
      primary(eq('amenity', 'language_school')),
      primary(eq('amenity', 'training')),
      primary(eq('amenity', 'college')),
      primary(eq('amenity', 'school')),
      related(eq('office', 'educational_institution')),
    ],
  },
  {
    id: 'automotive',
    canonicalLabel: 'Авто и автосервис',
    aliases: [
      'Автосалон', 'автосервис', 'ремонт автомобилей', 'машины', 'авто', 'car dealer',
      'car repair', 'auto service', 'autosalon', 'avtoservis', 'mashina tamirlash',
      'шиномонтаж', 'СТО', 'станция техобслуживания', 'car',
    ],
    distinctiveRoots: ['avto', 'auto', 'mashin', 'vehicle', 'shinomont', 'tehobsluzh'],
    nameFallbackTokens: [
      'авто', 'avto', 'auto', 'машин', 'mashin', 'car', 'шиномонт', 'shinomont', 'сто', 'sto',
    ],
    osmFilters: [
      primary(eq('shop', 'car')),
      primary(eq('shop', 'car_repair')),
      primary(eq('amenity', 'car_repair')),
      related(eq('shop', 'tyres')),
      related(eq('shop', 'car_parts')),
      related(eq('amenity', 'car_rental')),
    ],
  },
  {
    id: 'food_service',
    canonicalLabel: 'Рестораны и кафе',
    aliases: [
      'Ресторан', 'кафе', 'общепит', 'доставка еды', 'restaurant', 'cafe', 'coffee shop',
      'fast food', 'horeca', 'ovqatlanish', 'restoran', 'qahvaxona',
    ],
    distinctiveRoots: ['restoran', 'restaurant', 'cafe', 'kafe', 'horeca', 'ovqat', 'qahva'],
    nameFallbackTokens: ['ресторан', 'restoran', 'restaurant', 'кафе', 'cafe', 'kafe', 'horeca', 'ovqat', 'qahva'],
    osmFilters: [
      primary(eq('amenity', 'restaurant')),
      primary(eq('amenity', 'cafe')),
      primary(eq('amenity', 'fast_food')),
      related(eq('amenity', 'food_court')),
      related(eq('amenity', 'bar')),
    ],
  },
  {
    id: 'fitness',
    canonicalLabel: 'Фитнес и спорт',
    aliases: [
      'Фитнес', 'спортзал', 'тренажерный зал', 'фитнес клуб', 'fitness', 'gym',
      'fitness club', 'sport center', 'sport zal', 'fitnes markazi',
    ],
    distinctiveRoots: ['fitnes', 'fitness', 'sportzal', 'trenazher'],
    weakRoots: ['sport'],
    nameFallbackTokens: ['фитнес', 'fitness', 'спортзал', 'sportzal', 'gym', 'тренажер', 'trenazher'],
    osmFilters: [
      primary(eq('leisure', 'fitness_centre')),
      primary(eq('leisure', 'sports_centre')),
      related(eq('leisure', 'sports_hall')),
      related(eq('club', 'sport')),
    ],
  },
  {
    id: 'retail',
    canonicalLabel: 'Розничная торговля',
    aliases: [
      'Магазин', 'розничная торговля', 'ритейл', 'retail', 'shop', 'store', 'докон',
      'do‘kon', "do'kon", 'savdo dokon',
    ],
    distinctiveRoots: ['magazin', 'retail', 'shop', 'store', 'dokon', 'savdo'],
    nameFallbackTokens: ['магазин', 'magazin', 'retail', 'shop', 'store', 'докон', 'dokon', 'savdo'],
    osmFilters: [primary(exists('shop'))],
  },
  {
    id: 'pharmacy',
    canonicalLabel: 'Аптека',
    aliases: ['Аптека', 'фармация', 'pharmacy', 'drugstore', 'dorixona', 'dori xona'],
    distinctiveRoots: ['aptek', 'farmats', 'pharmac', 'drugstore', 'dorixon'],
    nameFallbackTokens: ['аптек', 'aptek', 'фармац', 'pharmac', 'dorixon'],
    osmFilters: [
      primary(eq('amenity', 'pharmacy')),
      related(eq('healthcare', 'pharmacy')),
    ],
  },
  {
    id: 'veterinary',
    canonicalLabel: 'Ветеринария',
    aliases: [
      'Ветеринария', 'ветклиника', 'ветеринарная клиника', 'veterinary', 'vet clinic',
      'animal clinic', 'veterinariya', 'hayvonlar klinikasi',
    ],
    distinctiveRoots: ['veterinar', 'veterinary', 'vetklinik', 'animal', 'hayvon'],
    nameFallbackTokens: ['ветеринар', 'veterinar', 'ветклиник', 'vet', 'animal', 'hayvon'],
    osmFilters: [
      primary(eq('amenity', 'veterinary')),
      primary(eq('healthcare', 'veterinary')),
    ],
  },
  {
    id: 'legal',
    canonicalLabel: 'Юридические услуги',
    aliases: [
      'Юридические услуги', 'юрист', 'адвокат', 'нотариус', 'law firm', 'lawyer',
      'legal services', 'attorney', 'notary', 'yuridik xizmatlar', 'advokat', 'notarius',
    ],
    distinctiveRoots: ['yurid', 'yurist', 'advokat', 'lawyer', 'legal', 'attorney', 'notari'],
    nameFallbackTokens: ['юрид', 'yurid', 'юрист', 'yurist', 'адвокат', 'advokat', 'lawyer', 'legal', 'нотари', 'notari'],
    osmFilters: [
      primary(eq('office', 'lawyer')),
      primary(eq('office', 'notary')),
    ],
  },
  {
    id: 'accounting',
    canonicalLabel: 'Бухгалтерские услуги',
    aliases: [
      'Бухгалтерия', 'бухгалтерские услуги', 'налоговый консультант', 'accounting',
      'accountant', 'bookkeeping', 'tax advisor', 'buxgalteriya', 'soliq maslahati',
    ],
    distinctiveRoots: ['buhgalter', 'buxgalter', 'account', 'bookkeep', 'soliq', 'nalog'],
    nameFallbackTokens: ['бухгалтер', 'buhgalter', 'buxgalter', 'account', 'bookkeep', 'налог', 'nalog', 'soliq'],
    osmFilters: [
      primary(eq('office', 'accountant')),
      primary(eq('office', 'tax_advisor')),
      related(eq('office', 'financial')),
    ],
  },
  {
    id: 'marketing',
    canonicalLabel: 'Маркетинг и реклама',
    aliases: [
      'Маркетинговое агентство', 'рекламное агентство', 'маркетинг', 'реклама',
      'marketing agency', 'advertising agency', 'digital agency', 'reklama agentligi',
    ],
    distinctiveRoots: ['marketing', 'reklam', 'advertis', 'digital'],
    nameFallbackTokens: ['маркетинг', 'marketing', 'реклам', 'reklam', 'advertis', 'digital'],
    osmFilters: [primary(eq('office', 'advertising_agency'))],
  },
  {
    id: 'information_technology',
    canonicalLabel: 'IT и разработка',
    aliases: [
      'IT компания', 'разработка программ', 'программное обеспечение', 'software company',
      'software development', 'IT services', 'web studio', 'dasturiy taminot',
    ],
    distinctiveRoots: ['software', 'dastur', 'programmn', 'razrabot', 'vebstud', 'webstudio'],
    nameFallbackTokens: ['software', 'dastur', 'программ', 'program', 'разработ', 'razrabot', 'webstudio', 'вебстуд'],
    osmFilters: [
      primary(eq('office', 'it')),
      primary(eq('office', 'software')),
      related(eq('office', 'telecommunication')),
    ],
  },
  {
    id: 'hospitality',
    canonicalLabel: 'Гостиницы',
    aliases: [
      'Гостиница', 'отель', 'хостел', 'hotel', 'hostel', 'guest house', 'mehmonxona',
      'yotoqxona',
    ],
    distinctiveRoots: ['gostin', 'otel', 'hotel', 'hostel', 'mehmon', 'yotoq', 'guesthouse'],
    nameFallbackTokens: ['гостин', 'gostin', 'отель', 'otel', 'hotel', 'hostel', 'mehmon', 'yotoq'],
    osmFilters: [
      primary(eq('tourism', 'hotel')),
      primary(eq('tourism', 'guest_house')),
      primary(eq('tourism', 'hostel')),
      related(eq('tourism', 'apartment')),
    ],
  },
  {
    id: 'logistics',
    canonicalLabel: 'Логистика и доставка',
    aliases: [
      'Логистика', 'курьерская служба', 'служба доставки', 'logistics', 'courier service',
      'delivery service', 'cargo', 'yuk tashish', 'yetkazib berish',
    ],
    distinctiveRoots: ['logistik', 'courier', 'kurer', 'delivery', 'cargo', 'yetkaz', 'tashish'],
    nameFallbackTokens: ['логист', 'logist', 'курьер', 'kurer', 'courier', 'delivery', 'cargo', 'yetkaz', 'tashish'],
    osmFilters: [
      primary(eq('office', 'logistics')),
      primary(eq('office', 'courier')),
    ],
  },
];

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', қ: 'q', ғ: 'g',
  ҳ: 'h', ў: 'o',
};

const STOP_WORDS = new Set([
  'biznes', 'biznesy', 'business', 'company', 'kompaniya', 'kompanii', 'firma',
  'service', 'services', 'usluga', 'uslugi', 'hizmat', 'xizmat', 'xizmatlar',
  'find', 'search', 'naydi', 'nayti', 'ischu', 'ishu', 'pokazhi', 'nuzhen', 'nuzhna',
  'nuzhno', 'nuzhny', 'hochu', 'mne', 'dlya', 'uchun', 'with', 'for', 'where',
  'gde', 'qayerda', 'place', 'mesto', 'joy', 'that', 'kotoryy', 'kotoraya', 'kotoroe',
  'near', 'ryadom', 'yaqin', 'est', 'bor', 'kerak', 'the', 'and', 'ili', 'or', 'eto',
  'po', 'na', 'pod', 'v', 's', 'i', 'a', 'to', 'of', 'in', 'uz', 'ru',
]);
const STOP_ROOTS = ['biznes', 'kompani', 'uslug', 'xizmat', 'nuzh', 'pokazh', 'nayt', 'isch', 'kotory'];

export function normalizeLeadRadarIntentText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[‘’ʻʼ`´']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function transliterate(value: string): string {
  return [...value].map((character) => CYRILLIC_TO_LATIN[character] ?? character).join('');
}

function comparable(value: string): string {
  return transliterate(normalizeLeadRadarIntentText(value))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(normalizedQuery: string): Array<{ source: string; comparable: string }> {
  return normalizedQuery
    .split(' ')
    .map((source) => ({ source, comparable: comparable(source) }))
    .filter(({ comparable: token }) => (
      token.length >= 3
      && !STOP_WORDS.has(token)
      && !STOP_ROOTS.some((root) => token.startsWith(root))
    ));
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - (levenshtein(left, right) / longest);
}

function tokenStartsWithRoot(token: string, root: string): boolean {
  if (token.startsWith(root)) return true;
  if (token.length < 5 || root.length < 5 || Math.abs(token.length - root.length) > 3) return false;
  return similarity(token, root) >= 0.84;
}

interface IntentMatch {
  definition: IntentDefinition;
  score: number;
  kind: Exclude<LeadRadarIntentMatchKind, 'fallback'>;
  matchedAlias: string | null;
}

function matchIntent(query: string, tokens: string[], definition: IntentDefinition): IntentMatch {
  const canonical = comparable(definition.canonicalLabel);
  const aliases = definition.aliases.map((alias) => ({ alias, comparable: comparable(alias) }));
  if (query === canonical) {
    return { definition, score: 1, kind: 'exact', matchedAlias: definition.canonicalLabel };
  }
  const exactAlias = aliases.find((alias) => alias.comparable === query);
  if (exactAlias) {
    return { definition, score: 0.99, kind: 'alias', matchedAlias: exactAlias.alias };
  }

  let bestScore = 0;
  let bestKind: IntentMatch['kind'] = 'semantic';
  let matchedAlias: string | null = null;
  for (const alias of aliases) {
    const aliasTokens = alias.comparable.split(' ').filter((token) => token.length >= 2);
    const singleTokenAliasScore = aliasTokens[0]?.length <= 3 ? 0.9 : 0.84;
    if (aliasTokens.length === 1 && tokens.includes(aliasTokens[0]) && singleTokenAliasScore > bestScore) {
      bestScore = singleTokenAliasScore;
      bestKind = 'semantic';
      matchedAlias = alias.alias;
    }
    if (alias.comparable.length >= 5 && (` ${query} `).includes(` ${alias.comparable} `)) {
      const containmentScore = alias.comparable.includes(' ') ? 0.96 : 0.84;
      if (containmentScore > bestScore) {
        bestScore = containmentScore;
        bestKind = 'semantic';
        matchedAlias = alias.alias;
      }
    }
    const aliasCompact = alias.comparable.replace(/ /g, '');
    const queryCompact = query.replace(/ /g, '');
    if (queryCompact.length >= 5 && queryCompact.length <= 40 && aliasCompact.length >= 5) {
      const fuzzySimilarity = similarity(queryCompact, aliasCompact);
      if (fuzzySimilarity >= 0.82) {
        const fuzzyScore = 0.78 + fuzzySimilarity * 0.2;
        if (fuzzyScore > bestScore) {
          bestScore = fuzzyScore;
          bestKind = 'fuzzy';
          matchedAlias = alias.alias;
        }
      }
    }
    if (aliasTokens.length >= 2) {
      const overlap = aliasTokens.filter((aliasToken) => (
        tokens.some((token) => tokenStartsWithRoot(token, aliasToken) || tokenStartsWithRoot(aliasToken, token))
      )).length;
      if (overlap === aliasTokens.length) {
        const overlapScore = 0.88 + Math.min(0.06, overlap * 0.02);
        if (overlapScore > bestScore) {
          bestScore = overlapScore;
          bestKind = 'semantic';
          matchedAlias = alias.alias;
        }
      }
    }
  }

  const distinctiveMatches = definition.distinctiveRoots.filter((root) => (
    tokens.some((token) => tokenStartsWithRoot(token, root))
  )).length;
  if (distinctiveMatches > 0) {
    const rootScore = 0.92 + Math.min(0.05, (distinctiveMatches - 1) * 0.025);
    if (rootScore > bestScore) {
      bestScore = rootScore;
      bestKind = 'semantic';
    }
  }
  const weakMatches = (definition.weakRoots ?? []).filter((root) => (
    tokens.some((token) => tokenStartsWithRoot(token, root))
  )).length;
  if (weakMatches > 0 && 0.76 > bestScore) {
    bestScore = 0.76;
    bestKind = 'semantic';
  }
  return { definition, score: bestScore, kind: bestKind, matchedAlias };
}

function uniqueBounded(values: string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

export function resolveLeadRadarIntent(niche: string): LeadRadarIntentResolution {
  const normalizedQuery = normalizeLeadRadarIntentText(niche).slice(0, 120);
  const tokenPairs = meaningfulTokens(normalizedQuery);
  const comparisonQuery = comparable(normalizedQuery);
  const comparisonTokens = tokenPairs.map((token) => token.comparable);
  const ranked = INTENTS
    .map((definition) => matchIntent(comparisonQuery, comparisonTokens, definition))
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id));
  const best = ranked[0];
  const second = ranked[1];
  const unambiguous = Boolean(
    best
    && best.score >= 0.74
    && (!second || best.score >= 0.96 || best.score - second.score >= 0.07),
  );

  if (best && unambiguous) {
    const aliasesUsed = uniqueBounded([
      best.definition.canonicalLabel,
      best.matchedAlias ?? '',
      ...best.definition.aliases.slice(0, 3),
    ], 5);
    return {
      canonicalId: best.definition.id,
      canonicalLabel: best.definition.canonicalLabel,
      matchKind: best.kind,
      confidence: Number(best.score.toFixed(2)),
      expanded: true,
      matchedAlias: best.matchedAlias,
      aliasesUsed,
      normalizedQuery,
      queryTokens: tokenPairs.map((token) => token.source),
      nameFallbackTokens: uniqueBounded(best.definition.nameFallbackTokens, 20),
      osmFilters: best.definition.osmFilters.map((filter) => ({
        tier: filter.tier,
        conditions: filter.conditions.map((condition) => ({ ...condition })),
      })),
    };
  }

  const nameFallbackTokens = uniqueBounded(tokenPairs.flatMap((token) => (
    token.source === token.comparable ? [token.source] : [token.source, token.comparable]
  )), 8);
  return {
    canonicalId: null,
    canonicalLabel: normalizedQuery || niche.trim().slice(0, 120),
    matchKind: 'fallback',
    confidence: 0,
    expanded: false,
    matchedAlias: null,
    aliasesUsed: [],
    normalizedQuery,
    queryTokens: tokenPairs.map((token) => token.source),
    nameFallbackTokens,
    osmFilters: [],
  };
}

function conditionMatches(tags: Record<string, string>, condition: LeadRadarOsmTagCondition): boolean {
  const value = tags[condition.key];
  if (condition.operation === 'exists') return typeof value === 'string' && value.trim().length > 0;
  if (typeof value !== 'string' || typeof condition.value !== 'string') return false;
  if (condition.operation === 'equals') return value.toLocaleLowerCase('en-US') === condition.value.toLocaleLowerCase('en-US');
  try {
    return new RegExp(condition.value, 'i').test(value);
  } catch {
    return false;
  }
}

function textMatchScore(tags: Record<string, string>, resolution: LeadRadarIntentResolution): number {
  const sourceText = Object.entries(tags)
    .filter(([key]) => key === 'name' || key.startsWith('name:') || key === 'brand' || key === 'operator')
    .map(([, value]) => value)
    .join(' ');
  const normalizedSource = normalizeLeadRadarIntentText(sourceText);
  if (!normalizedSource) return 0;
  const comparableSource = comparable(normalizedSource);
  const sourceCompact = comparableSource.replace(/ /g, '');
  const queryCompact = comparable(resolution.normalizedQuery).replace(/ /g, '');
  if (queryCompact.length >= 3 && sourceCompact === queryCompact) return 40;
  if (queryCompact.length >= 4 && sourceCompact.includes(queryCompact)) return 32;

  const matchedTerms = resolution.nameFallbackTokens.filter((term) => {
    const normalizedTerm = comparable(term);
    if (normalizedTerm.length < 3) return false;
    return comparableSource.split(' ').some((token) => tokenStartsWithRoot(token, normalizedTerm));
  }).length;
  return Math.min(28, matchedTerms * 7);
}

/**
 * Scores only facts present in an OSM element. Tier gaps are intentionally
 * larger than text bonuses, preserving primary > related > name fallback.
 */
export function scoreLeadRadarOsmTags(
  tags: Record<string, string>,
  resolution: LeadRadarIntentResolution,
): LeadRadarOsmIntentScore {
  const textScore = textMatchScore(tags, resolution);
  const matchedPrimary = resolution.osmFilters.some((filter) => (
    filter.tier === 'primary' && filter.conditions.every((condition) => conditionMatches(tags, condition))
  ));
  if (matchedPrimary) return { tier: 'primary', score: 300 + textScore };

  const matchedRelated = resolution.osmFilters.some((filter) => (
    filter.tier === 'related' && filter.conditions.every((condition) => conditionMatches(tags, condition))
  ));
  if (matchedRelated) return { tier: 'related', score: 200 + textScore };
  if (textScore > 0) return { tier: 'fallback', score: 100 + textScore };
  return { tier: 'none', score: 0 };
}
