import { normalizeLeadRadarIntentText } from './intent';

/**
 * Rule-based demand triage for Signal Radar.
 *
 * Deliberately not an LLM. Three reasons, in order of importance:
 *   1. A rule engine is explainable — every verdict carries the exact phrases
 *      that produced it, so a wrong call is a one-line dictionary fix.
 *   2. It is deterministic and unit-testable, which the false-positive traps
 *      below absolutely require.
 *   3. It costs nothing and fits in a fraction of the 30 ms CPU budget that
 *      Cloudflare's free tier allows per request.
 *
 * The three traps this engine exists to survive:
 *   - "ищу работу" is by far the loudest false positive in Russian-speaking
 *     groups. It shares the word "ищу" with a real buyer and would otherwise
 *     score as demand every single time.
 *   - SPROS vs PREDLOZHENIE. "делаю ботов" is a competitor advertising, not a
 *     lead. Replying to it with your own offer is the most embarrassing and
 *     most common failure mode of this whole product.
 *   - Recruitment. "Курьеры нужны, 13 млн в месяц, @yandex_ish_bot" hits every
 *     demand marker the engine has and is worth nothing to a studio. It is the
 *     dominating noise class in Uzbekistan's groups, and the `jobseeker`
 *     verdict covers both directions of the labour market.
 */

export const SIGNAL_SERVICES = [
  'ads', 'seo', 'bots', 'sites', 'apps', 'design', 'crm',
] as const;

export type SignalService = typeof SIGNAL_SERVICES[number];

export type SignalVerdict = 'lead' | 'review' | 'discard' | 'supply' | 'jobseeker';

export interface SignalTriage {
  verdict: SignalVerdict;
  /** 0..100. Only meaningful for `lead` and `review`. */
  score: number;
  service: SignalService | null;
  services: SignalService[];
  /** Exact stems that fired, in evaluation order. Shown in the UI. */
  reasons: string[];
  hasContact: boolean;
}

export interface SignalTriageThresholds {
  lead: number;
  review: number;
}

export const SIGNAL_TRIAGE_THRESHOLDS: SignalTriageThresholds = { lead: 60, review: 30 };

// Labels live in `src/shared` so the admin UI can render them without pulling
// this module (and the whole intent dictionary behind it) into the browser
// bundle. Re-exported here to keep existing imports working.
export { SIGNAL_SERVICE_LABELS } from '../../../src/shared/signal-radar';

/**
 * Links and @handles are stripped before any keyword matching happens.
 *
 * This is not hygiene, it is the fix for the worst false positive the engine
 * has shipped. A recruitment post for Yandex Eats scored as a `bots` lead with
 * confidence 79 purely because it ended with the contact `@yandex_ish_bot`:
 * the normalizer turns the underscore into a space, and "bot" then matches at
 * the start of a word. The same post picked up `question` from the `?` in its
 * tracking URL. Every Telegram post carries a handle, so without this mask the
 * word "bot" is not a service signal at all — it is a constant.
 *
 * Contact detection stays on the original text: a handle is still a handle, it
 * just is not allowed to vote on what the post is about.
 */
function maskNoise(raw: string): string {
  return raw
    // Full URLs first, so a query string cannot leak a "?" into the question
    // check below.
    .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, ' ')
    .replace(/@[A-Za-z0-9_]{3,}/g, ' ')
    // Bare domains. The final label must be letters, so "11.400.000" stays a
    // number and "reg.eda.yandex.uz" does not survive.
    .replace(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,24})+(?:\/[^\s]*)?/gi, ' ');
}

/**
 * Every dictionary below holds *stems*, matched from the start of a word. That
 * single rule is why the lists stay short: "бот" covers бот, бота, ботов,
 * ботами without listing each inflection.
 *
 * It is also the fix for a real bug. Plain substring matching made the urgency
 * term "ап" (Telegram slang for bumping a post) fire inside "з-ап-иси", and
 * "курс" inside "э-курс-ия". Anchoring at a word boundary makes short stems
 * safe to use at all.
 */
const WORD_START = '(^|[^A-Za-z0-9_а-яё])';

const patternCache = new Map<string, RegExp | null>();

function stemPattern(term: string): RegExp | null {
  const cached = patternCache.get(term);
  if (cached !== undefined) return cached;
  const stem = normalizeLeadRadarIntentText(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // No control characters are ever produced here: the stem is already reduced
  // to lowercase letters, digits and single spaces by the normalizer.
  const pattern = stem ? new RegExp(`${WORD_START}${stem}`, 'i') : null;
  patternCache.set(term, pattern);
  return pattern;
}

export interface StemHit {
  term: string;
  /** Offset of the stem itself, excluding the boundary character consumed. */
  index: number;
}

function stemHits(normalized: string, terms: readonly string[]): StemHit[] {
  const hits: StemHit[] = [];
  for (const term of terms) {
    const pattern = stemPattern(term);
    if (!pattern) continue;
    const match = pattern.exec(normalized);
    if (match) hits.push({ term, index: match.index + match[1].length });
  }
  return hits;
}

/**
 * Russian and Uzbek (Latin) stems side by side. Uzbekistan's Telegram groups
 * post in both, and a radar that only reads Cyrillic silently throws away a
 * large share of the local market.
 */
const SERVICE_TERMS: Record<SignalService, readonly string[]> = {
  ads: [
    'реклам', 'таргет', 'контекст', 'директ', 'гугл адс', 'google ads',
    'смм', 'smm', 'продвиж', 'продвинут', 'трафик', 'лидогенерац', 'арбитраж',
    'посев', 'инфлюенс', 'блогер', 'риелс',
    'reklama', 'targeting', 'target', 'reklama', 'smm', 'trafik',
  ],
  seo: [
    'seo', 'сео', 'сэо', 'поисков', 'поисковик', 'в топ', 'топ 10', 'топ10',
    'оптимизац', 'семантик', 'ключев', 'индексац',
    'qidiruv', 'optimizatsiya',
  ],
  bots: [
    'бот', 'чат бот', 'чатбот', 'телеграм бот', 'тг бот', 'tg bot',
    'telegram bot', 'автоворонк', 'мини апп', 'mini app', 'вебхук', 'webhook',
    'bot',
  ],
  sites: [
    'сайт', 'лендинг', 'landing', 'веб сайт', 'вебсайт', 'интернет магазин',
    'многостраничник', 'одностраничник', 'визитк', 'посадочн', 'тильда', 'tilda',
    'фронтенд', 'верстк',
    'sayt', 'vebsayt', 'landing', 'internet dokon', 'veb sayt',
  ],
  apps: [
    'приложен', 'мобил', 'android', 'ios', 'flutter', 'react native',
    'ilova', 'mobil ilova', 'dastur',
  ],
  design: [
    'дизайн', 'логотип', 'фирменный стиль', 'брендинг', 'макет', 'ui ux',
    'uiux', 'баннер', 'обложк', 'креатив', 'иллюстрац',
    'dizayn', 'logo', 'brending', 'maket',
  ],
  crm: [
    'crm', 'црм', 'битрикс', 'bitrix', 'amocrm', 'амосрм', 'автоматизац',
    'автоматизир', 'интеграц', 'интегрир',
    'avtomatlashtirish', 'integratsiya',
  ],
};

/**
 * Looking for work. Terminal: a person hunting for a job is not a buyer, no
 * matter how many service words they used.
 */
const JOBSEEKER_TERMS: readonly string[] = [
  'ищу работ', 'ищет работ', 'ищем работ', 'ищут работ', 'в поиске работ',
  'в поисках работ', 'резюме', 'ваканс', 'соискател', 'трудоустр', 'устроит',
  'устроюсь', 'стажировк', 'подработк', 'готов работ', 'без опыт',
  'отклик на ваканс', 'претендую на', 'ищу команд', 'в команд', 'на работ',
  'работ удаленн', 'удаленку ищу', 'ищу удаленн', 'фриланс ищу', 'ищу заказ',
  'ищу подработ', 'устроит на работ',
  'ish qidir', 'ish izla', 'ish kerak', 'ish topish', 'rezume', 'vakansiya',
  'amaliyot', 'ishga joyla', 'ishga kir', 'tajriba orttir',
];

/**
 * Offering work. The mirror image of job seeking, and in Uzbekistan's groups
 * far louder: courier, driver and sales-staff recruitment is the single
 * biggest class of noise in the feed. It is structurally identical to a real
 * brief — "kerak", "нужен", a contact, urgency, money — so it has to be caught
 * before scoring rather than out-scored afterwards.
 *
 * Nothing here is a bare hiring verb. "Требуется бот для Telegram" is a
 * genuine buyer, and "требуется" on its own would have killed it: every term
 * names either the role being hired or the machinery of employment itself
 * (salary, shifts, probation, applications).
 */
const JOB_OFFER_TERMS: readonly string[] = [
  // Russian — employment machinery.
  'набираем', 'набор персонал', 'набор сотрудник', 'в штат', 'в нашу команд',
  'трудоустройств', 'оформление по тк', 'испытательн', 'зарплат', 'оклад',
  'график работ', 'сменный график', 'собеседован', 'отдел кадр',
  'присылайте резюме', 'пришлите резюме', 'отправьте резюме', 'резюме на',
  'эйчар', 'hr менеджер', 'работа в ташкент', 'работа удаленн',
  'ищем сотрудник', 'ищем работник', 'ищем персонал', 'требуются сотрудник',
  'требуется сотрудник', 'требуются работник', 'требуются персонал',
  // Russian — the roles themselves.
  'ищем кур', 'требуются кур', 'ищем водител', 'требуются водител',
  'ищем кассир', 'ищем продавц', 'требуются продавц', 'ищем официант',
  'ищем повар', 'ищем бармен', 'ищем грузчик', 'ищем охранник',
  'ищем уборщиц', 'ищем администратор', 'ищем менеджер по продаж',
  'ищем кладовщик', 'ищем сборщик', 'ищем комплектовщик',
  // Uzbek — employment machinery.
  'ishga taklif', 'ish taklif', 'ishga olamiz', 'ishga qabul',
  'ishga joylashtir', 'ish orni', 'ish ornini', 'ish beramiz', 'ish haqi',
  'maosh', 'ish jadval', 'ish vaqti', 'ariza qoldiring', 'royxatdan oting',
  'ariza topshir', 'jamoaga qoshil', 'suhbatdan',
  // Uzbek — the roles themselves.
  'ishchi kerak', 'ishchilar kerak', 'xodim kerak', 'xodimlar kerak',
  'kuryer kerak', 'kuryerlar kerak', 'kuryer boling', 'haydovchi kerak',
  'sotuvchi kerak', 'kassir kerak', 'ofitsiant kerak', 'oshpaz kerak',
  'qorovul kerak',
  // The vocabulary of a vacancy advert that is not a job title. A Product
  // Manager opening passed straight through the first version of this list
  // — it said "на полный рабочий день" and listed "обязанности", and neither
  // a role name nor a salary was anywhere in the post.
  'полный рабочий день', 'неполный рабочий день', 'полная занятост',
  'частичная занятост', 'обязанност', 'на постоянной основе',
  'постоянная работ', 'официальное трудоустройств', 'оформляем официальн',
  'белая зарплат', 'дружн команд', 'молодой команд', 'в наш коллектив',
  'наш коллектив', 'open vacancy', 'full-time', 'part-time', 'job offer',
  'to‘liq stavka', 'ish tartibi', 'jamoamizga', 'oylik maosh',
];

/**
 * Congratulations, anniversaries and holiday posts. Terminal and cheap: a
 * greeting is the most reliably-shaped text in any group and never a purchase
 * request, yet it is stuffed with exactly our service vocabulary — one
 * independence-day post from a marketing association scored 72 on
 * "креатив", "хоч" and "сегодня" alone.
 */
const GREETING_TERMS: readonly string[] = [
  'поздравл', 'с наступающ', 'с днём рожд', 'с днем рожд', 'с праздник',
  'с новым годом', 'с 8 марта', 'с юбиле', 'юбиле', 'годовщин',
  'желаем вам', 'желаю вам', 'от всей души',
  'muborak', 'tabrikla', 'qutla', 'bayram', 'yubiley', 'yangi yil',
  'bayramingiz', 'tabarak',
];

/**
 * A way to answer. A gate, not a score booster.
 *
 * A post that names no handle, no number, no budget and no way to reach its
 * author reads like a brief and scores like one, but the operator cannot act
 * on it — and an inbox full of things nobody can act on is worse than an
 * empty one. The first-person story that scored 82 was exactly this: a
 * marketer writing about her own wedding, mentioning bots and sites in
 * passing, with nothing in it for anyone to reply to.
 *
 * These are the ways people here actually say "get in touch", including the
 * ones a polite dictionary would miss: "в личку", "в лс", "писать сюда".
 */
/**
 * The register of someone writing rather than buying. Every term here is a
 * construction, not a word: "нужно подумать" is an essay, "нужен подрядчик"
 * is a brief, and the difference is entirely in what follows the verb.
 */
const PROSE_TERMS: readonly string[] = [
  'нужно подумать', 'нужно понять', 'нужно помнить', 'нужно понимать',
  'нужно учитывать', 'нужно учесть', 'надо подумать', 'надо понять',
  'стоит отметить', 'важно понимать', 'важно помнить', 'важно отметить',
  'как оказалось', 'хочу поделиться', 'хочу рассказать', 'хочу показать',
  'делюсь опытом', 'личный опыт', 'моя история', 'история одного',
  'в этой статье', 'в этом посте', 'подведём итог', 'подведем итог',
  'делаем вывод', 'вывод прост', 'в заключение', 'написал стать',
  'написал пост', 'почитать можно', 'советую почитать',
];

const CTA_TERMS: readonly string[] = [
  'пишите', 'пиши', 'напишите', 'напиши', 'звоните', 'звони', 'позвоните',
  'свяжитесь', 'свяжи', 'обращайтесь', 'откликнитесь', 'откликайтесь',
  'отзовитес', 'предложите', 'предлагайте', 'жду предложен', 'жду отклик',
  'контакт', 'телефон', 'whatsapp', 'ватсап', 'в личк', 'в лс', 'личк',
  'boglaning', 'yozing', 'qo‘ng‘iroq', 'qongiroq', 'aloqa', 'murojaat',
];

/** Offering services rather than asking for them. */
const SUPPLY_TERMS: readonly string[] = [
  'делаю', 'делаем', 'делает', 'делают', 'занимаюс', 'занимаемся', 'занимается',
  'мои услуги', 'наши услуги', 'предлагаю', 'предлагаем', 'предлагает',
  'выполню', 'выполним', 'выполняет', 'сделаю', 'сделаем', 'разрабатываю',
  'разрабатываем', 'разработаю', 'собираю', 'верстаю', 'проектирую',
  'прайс', 'портфолио', 'кейсы', 'мои работы', 'наши работы', 'цены от',
  'стоимость от', 'от сумм', 'запись на', 'осталос мест', 'обуч', 'курс',
  'научу', 'вебинар', 'скидк', 'акци', 'оставьте заявк', 'пишите в личк',
  'звоните', 'бесплатная консультац', 'бесплатн диагност', 'гаранти',
  'опыт более', 'в подарок', 'промокод', 'тариф', 'пакет услуг',
  'qilaman', 'qilamiz', 'qilib beraman', 'xizmat', 'narxlar', 'portfolio',
  'kurs', 'orgataman', 'chegirma', 'bepul konsultatsiya',
];

/** Asking for services. */
const DEMAND_TERMS: readonly string[] = [
  // "нужен" and "нужна/нужно/нужны" diverge at the fourth letter, so both
  // stems are required. Dropping "нужен" silently lost the most common
  // demand phrase in the language.
  'ищу', 'ищем', 'ищет', 'ищут', 'нужен', 'нужн', 'требу', 'надо', 'хоч',
  'кто делает', 'кто сделает', 'кто может', 'кто занимается', 'кто знает',
  'кто напишет', 'кто поможет', 'посовет', 'подскаж', 'заказ', 'сколько',
  'почем', 'почём', 'цена', 'стоимост', 'бюджет', 'оплачу', 'плачу',
  'ищу исполнител', 'ищем исполнител', 'ищу подрядчик', 'ищем подрядчик',
  'ищу человек', 'ищем человек', 'ищу мастер', 'ищу разработчик',
  'ищу программист', 'ищем разработчик', 'ищем программист', 'возьметес',
  'возьмётес', 'возьмете в работ', 'можете сделать', 'делаете ли',
  'занимаетесь ли', 'нужна помощ', 'нужен специалист', 'найму',
  'kerak', 'qidiryapman', 'qidirayotgan', 'izlayapman', 'izlayman',
  'kim qila', 'kim yasa', 'narxi', 'qancha', 'buyurtma', 'yordam kerak',
  'qilib bera', 'yordam bera', 'topish kerak', 'qilish kerak', 'bajarib bera',
];

const URGENCY_TERMS: readonly string[] = [
  'срочн', 'сегодня', 'до завтра', 'на этой неделе', 'до конца недели',
  'в ближайшее время', 'как можно быстрее', 'максимально быстро', 'в приоритет',
];

const BUDGET_TERMS: readonly string[] = [
  'бюджет', 'оплачу', 'плачу', 'сколько стоит', 'цена вопроса', 'сумм',
  'доллар', 'usd', 'млн', 'тыс', 'млрд', 'готов заплатить', 'в пределах',
];

const SCORE = {
  firstService: 34,
  extraService: 10,
  demand: 30,
  contact: 10,
  urgency: 8,
  budget: 10,
  question: 5,
} as const;

/** Public @handle or a phone-ish digit run. Used only as a score booster. */
export function detectSignalContact(raw: string): boolean {
  return /(^|[\s(])@[A-Za-z][A-Za-z0-9_]{4,31}\b/.test(raw)
    || /(?:\+?\d[\d\s()-]{7,17}\d)/.test(raw);
}

export function triageSignal(
  rawText: string,
  thresholds: SignalTriageThresholds = SIGNAL_TRIAGE_THRESHOLDS,
): SignalTriage {
  const text = typeof rawText === 'string' ? rawText : '';
  // Links and handles are removed for every decision about *what the post is
  // about*, and kept for the one decision about *whether we can reply*.
  const masked = maskNoise(text);
  const normalized = normalizeLeadRadarIntentText(masked);
  if (normalized.length === 0) {
    return { verdict: 'discard', score: 0, service: null, services: [], reasons: ['empty'], hasContact: false };
  }

  // 1. Employment, in both directions, is terminal. It shares "ищу" and "нужен"
  //    with genuine demand and is the single largest source of false positives
  //    in the region's groups — mostly recruitment ads, not job seekers.
  const jobseeker = stemHits(normalized, JOBSEEKER_TERMS);
  const jobOffer = stemHits(normalized, JOB_OFFER_TERMS);
  const job = jobseeker[0] ?? jobOffer[0] ?? null;
  if (job) {
    return {
      verdict: 'jobseeker',
      score: 0,
      service: null,
      services: [],
      reasons: [`${jobseeker.length > 0 ? 'jobseeker' : 'joboffer'}:${job.term}`],
      hasContact: false,
    };
  }

  // 1b. Greetings are terminal for the same reason employment is: they share
  //     all our vocabulary and none of our intent.
  const greeting = stemHits(normalized, GREETING_TERMS);
  if (greeting.length > 0) {
    return {
      verdict: 'discard',
      score: 0,
      service: null,
      services: [],
      reasons: [`greeting:${greeting[0].term}`],
      hasContact: false,
    };
  }

  // 2. Which services is this about at all? No service, no lead — ever.
  //    Ordering matters: "Нужен CRM, чтобы заявки с сайта не терялись" names
  //    two services, and dictionary order would have filed it under sites. The
  //    primary service is the one the post leans on — most stems first, then
  //    the earliest mention as a tie-break.
  const matched: Array<{
    service: SignalService;
    hits: StemHit[];
    earliest: number;
  }> = [];
  for (const service of SIGNAL_SERVICES) {
    const hits = stemHits(normalized, SERVICE_TERMS[service]);
    if (hits.length === 0) continue;
    matched.push({
      service,
      hits,
      earliest: Math.min(...hits.map((hit) => hit.index)),
    });
  }
  matched.sort((left, right) => (
    right.hits.length - left.hits.length || left.earliest - right.earliest
  ));
  const services = matched.map((entry) => entry.service);
  const serviceReasons = matched.map((entry) => `${entry.service}:${entry.hits[0].term}`);
  if (services.length === 0) {
    return {
      verdict: 'discard',
      score: 0,
      service: null,
      services: [],
      reasons: ['no_service'],
      hasContact: false,
    };
  }

  // 3. Supply beats demand. Someone advertising bots is a competitor card, and
  //    messaging them with our own offer is the worst possible outcome.
  const supply = stemHits(normalized, SUPPLY_TERMS);
  const demand = stemHits(normalized, DEMAND_TERMS);
  if (supply.length > 0 && supply.length >= demand.length) {
    return {
      verdict: 'supply',
      score: 0,
      service: services[0] ?? null,
      services,
      reasons: [`supply:${supply[0].term}`, ...serviceReasons],
      hasContact: detectSignalContact(text),
    };
  }

  // 4. A service noun with no demand marker is chatter, not a brief. Someone
  //    saying "сайт" in a conversation about sites is not asking for one. This
  //    gate is what keeps the inbox readable; without it every mention of a
  //    service word lands in review and precision collapses.
  const serviceScore = SCORE.firstService + (services.length - 1) * SCORE.extraService;
  if (demand.length === 0) {
    return {
      verdict: 'discard',
      score: serviceScore,
      service: services[0] ?? null,
      services,
      reasons: ['no_demand', ...serviceReasons],
      hasContact: detectSignalContact(text),
    };
  }

  // 5. Score the demand.
  const reasons: string[] = [...serviceReasons, `demand:${demand[0].term}`];
  let score = serviceScore + SCORE.demand;

  // 4b. Blog register. Someone writing about their week mentions every service
  //     word and needs none of them. A marketer's story about planning her own
  //     wedding — "нужно подумать о многом", bots and sites in passing —
  //     scored 82 and read exactly like a brief.
  //
  //     Deliberately not terminal, and deliberately conditional: a person may
  //     open with a story and close with a real request, so prose only
  //     disqualifies a post that offers nothing to act on either. A handle, a
  //     number, a budget or a "пишите" is enough to keep it alive.
  const prose = stemHits(normalized, PROSE_TERMS);
  const cta = stemHits(normalized, CTA_TERMS);
  const budgetHits = stemHits(normalized, BUDGET_TERMS);
  const hasContact = detectSignalContact(text);
  if (prose.length > 0 && !hasContact && budgetHits.length === 0 && cta.length === 0) {
    return {
      verdict: 'discard',
      score: 0,
      service: services[0] ?? null,
      services,
      reasons: [`prose:${prose[0].term}`, ...serviceReasons],
      hasContact,
    };
  }

  if (hasContact) {
    score += SCORE.contact;
    reasons.push('contact');
  }
  // `.term`, not the hit object: these reasons are rendered in the lead card
  // under "Почему это заявка", and a stringified object there reads as a bug
  // to the operator who is deciding whether to spend money on the reply.
  const urgency = stemHits(normalized, URGENCY_TERMS);
  if (urgency.length > 0) {
    score += SCORE.urgency;
    reasons.push(`urgency:${urgency[0].term}`);
  }
  const budget = budgetHits;
  if (budget.length > 0) {
    score += SCORE.budget;
    reasons.push(`budget:${budget[0].term}`);
  }
  // "?" only counts when a human typed it. Every tracking URL carries one, and
  // a recruitment post for a delivery service should not read as a question.
  if (masked.includes('?')) {
    score += SCORE.question;
    reasons.push('question');
  }

  const clamped = Math.max(0, Math.min(100, score));
  const verdict: SignalVerdict = clamped >= thresholds.lead
    ? 'lead'
    : clamped >= thresholds.review
      ? 'review'
      : 'discard';
  return { verdict, score: clamped, service: services[0] ?? null, services, reasons, hasContact };
}

/**
 * The sentence worth quoting back. Operators reply faster when the draft shows
 * the buyer's own words, and the buyer replies faster when they are quoted.
 */
export function pickSignalQuote(rawText: string, max = 280): string {
  const text = (rawText ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const sentences = text.split(/(?<=[.!?…])\s+/).filter((part) => part.trim().length > 0);
  for (const sentence of sentences) {
    if (sentence.length <= max && triageSignal(sentence).services.length > 0) {
      return sentence.trim();
    }
  }
  const clipped = text.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}
