/**
 * Signal Radar — the chat surface: finding rooms a stranger is allowed to
 * write in.
 *
 * A channel is a megaphone. Someone posts, half a million people read, and not
 * one of them can answer. A group is a room. The operator's actual question is
 * not "who is broadcasting about websites" but "where could I post an offer
 * and be read, and answer a reply". Those are different objects and they have
 * to be collected differently.
 *
 * WHAT IS VERIFIED HERE (probed live 2026-09-03, not assumed)
 *
 *   `t.me/s/<group>`   HTTP 200, ~12 KB. Renders a profile card:
 *                        div.tgme_page_title       -> the real name
 *                        div.tgme_page_description -> the about text
 *                        div.tgme_page_extra       -> "3 264 members, 240 online"
 *                        message widgets           -> none. Zero.
 *
 *   `t.me/s/<channel>` HTTP 200, ~145 KB. Renders ~20 message widgets and a
 *                      counter pair (`counter_type` = subscribers).
 *
 *   tgchats.org/?search=<kw>&city=<city>
 *                      server-rendered, 49-52 results per page, each with the
 *                      slug, the name, a member-count badge and a description.
 *                      robots.txt carries content signals and no Disallow, and
 *                      no Content-Signal header is served.
 *
 *   telegid.me/catalog/<country>/<city>
 *                      server-rendered, 100+ entries with name, description and
 *                      link. robots.txt says `Disallow: *?*`, so this source is
 *                      only ever fetched as a bare path — never with a query.
 *
 *   tgstat                 returns 200 with an auth interstitial; 0 entities.
 *   tgram.io, tg-cat.com   200 but JS-rendered; 1-3 slugs, unusable.
 *
 * So: the web is enough to *find and qualify* a group, and not enough to read
 * one. Reading costs a join, which is a different module's decision. Everything
 * in this file therefore stops at the card. It never pretends to know what was
 * said in a room it has not entered.
 *
 * The one number the web does give us about liveness is `online` — how many
 * people are in the room right now. For "where do I find a client" that is a
 * better signal than a last-post date would be, and it is the only one that
 * exists without joining, so it is what the activity filter is built on.
 */

import { decodeHtmlEntities, htmlToText } from './signal-discovery';

/* ------------------------------------------------------------------ topics */

export interface ChatTopicPack {
  id: string;
  label: string;
  /** Typed into a catalogue search box. Short: catalogues match titles. */
  search: string[];
  /**
   * Words only someone in the trade writes.
   *
   * "веб-студия", "таргетолог", "dasturlash". A bakery never types these; a
   * competitor's studio always does. One strong hit is enough to name a topic.
   */
  strong: string[];
  /**
   * Words a relevant room often uses that a thousand irrelevant rooms use
   * too. "сайт", "заказ", "дизайн", "it".
   *
   * Two of them name a topic. One of them names nothing, and that rule is the
   * whole reason this file has two lists instead of one.
   *
   * Measured on 2026-09-03 over 1 614 live Uzbek rooms: with a single
   * undifferentiated list, the three words `заказ`, `buyurtma` and `проект`
   * were the *only* evidence of relevance for 20 of the 37 rooms the harvest
   * kept. Every one of those twenty was a retail business — a bakery, a door
   * workshop, a costume-jewellery seller, an intercity taxi dispatch with
   * 10 445 members. They were kept because they take orders, and taking
   * orders is not the same thing as buying advertising.
   */
  weak: string[];
}

/**
 * Packs are keyed by the thing the operator sells, not by Telegram's idea of a
 * category. Russian and Uzbek both: a Tashkent room advertises itself in
 * whichever language its admin typed first, and a pack that only knows Russian
 * misses half the country.
 */
export const CHAT_TOPIC_PACKS: ChatTopicPack[] = [
  {
    id: 'ads',
    label: 'Реклама и маркетинг',
    search: [
      'реклама', 'маркетинг', 'smm', 'таргет', 'seo', 'копирайтинг',
      'рекламное агентство', 'таргетолог', 'контент', 'брендинг',
      'reklama', 'marketing',
    ],
    strong: [
      'рекламное агентство', 'рекламодател', 'рекламщик', 'reklama agentligi',
      'marketing agentligi', 'marketing xizmati',
      'маркетинговое агентство', 'маркетинг агентств',
      'таргетолог', 'targetolog', 'директолог', 'контекстолог',
      'smm mutaxassis', 'smm-специалист', 'smm xizmati',
      'копирайтинг', 'copywriting', 'seo-оптимизац', 'seo optimizatsiya',
      'контекстная реклам', 'контекстная реклама',
      'digital agentligi', 'digital-агентство', 'digital агентств',
      'yandex direct', 'google ads', 'рекламный бюджет',
      'лидогенерац', 'lead generation',
      // "реклама услуг", "реклама хизмати" and "reklama xizmati" were tried
      // and removed, and not because the phrase is rare — because in an Uzbek
      // room it means the opposite of what it looks like. "Реклама хизмати
      // бор. 1 эълон — 40 минг сум" is a room selling a slot, not a room
      // buying a service. It carried "DARVOZACHI AKA UKA" (108 805 members of
      // gate fitters), "Tug'ilgan kun uchun tabriklar" (71 237), "BOLALAR
      // PULI" (child benefit applications) and "Popda ish bor" (a district job
      // board) into the confirmed band on 2026-09-03.
      //
      // "smm xizmati" and "marketing xizmati" stay, because they name the
      // profession rather than the slot: the people in them buy websites.
    ],
    weak: [
      // The bare stem "реклам"/"reklama" is gone from this list, and it is
      // the most expensive deletion in the file.
      //
      // The word has two meanings in the rooms we crawl and no weighting can
      // separate them: it means the trade ("реклама услуг"), and it means
      // "post your ad here" or "don't post ads here". The second meaning is
      // everywhere, because nearly every Uzbek group either sells ad slots in
      // its footer or forbids them in its rules. In the 2026-09-03 sweep the
      // stem carried 60 of the 524 kept rooms — more than any other term —
      // and among them: "ЛОГИСТИКА УЗБЕКИСТАНА" (29 939 members, the word
      // survived in "Рухсатсиз реклама килганлар ⛔️спам"), "Комменты
      // Ташкента" (a rules list that says "Спам, флуд и реклама"), "Хolis
      // mobil olam" (a phone shop), "КУНЛИК ДЕН - НОЧ ИШЛАР" (daily labour)
      // and a mahalla citizens' assembly in Karasu.
      //
      // The boilerplate stripper did not save us, because it removes only the
      // occurrence followed by a contact handle. A room that mentions the
      // word twice keeps the second one.
      //
      // A room that genuinely sells advertising has other things to say —
      // smm, таргет, маркетинг, seo, продвижение, or one of the compounds
      // above. A room whose only claim is the word is a billboard, and we are
      // not looking for billboards.
      'маркетинг', 'marketing', 'smm', 'таргет', 'targeting',
      // "контент" is out. It named "Чат для игроков PUBG MOBILE" (696
      // members, "хвастаться скриншотами") and nothing that sells anything:
      // every media room, gaming room and meme room in the country produces
      // content. A marketing room says smm, таргет, seo or продвижение.
      'пиар', ' pr ', 'копирайт', 'seo', 'брендинг', 'brending',
      'трафик', 'медиа', 'media', 'продвижен',
    ],
  },
  {
    id: 'dev',
    label: 'Разработка: сайты, боты, приложения',
    search: [
      'разработка сайтов', 'боты', 'программирование', 'веб', 'сайты',
      'веб-студия', 'лендинг', 'telegram бот', 'frontend', 'backend',
      'python', 'javascript', 'wordpress', 'tilda', 'мобильное приложение',
      'dasturlash', 'sayt', 'bot', 'it',
    ],
    strong: [
      'разработка сайтов', 'создание сайтов', 'sayt yaratish', 'sayt tuzish',
      'sayt yasash', 'веб-студия', 'веб студия', 'web-studio', 'web studio',
      'веб-разработк', 'veb dasturlash', 'разработка бот', 'создание бот',
      // "telegram bot" and "tg bot" are deliberately down in the weak list
      // now. As a strong term it confirmed "ADM Academy" in Jizzakh, whose
      // entire claim to being a development room was the sentence "записаться
      // на курс можно через следующий Telegram bot". Every school, shop and
      // delivery service in the country has one. Having a bot is not making
      // one.
      'bot yaratish', 'бот на заказ',
      'dasturlash', 'dasturchi', 'программист', 'programmist',
      'frontend', 'backend', 'fullstack', 'full-stack', 'full stack',
      'wordpress', 'laravel', 'react ', 'vue ', 'node.js', 'nodejs',
      'python', 'javascript', 'php ', 'tilda',
      'мобильное приложение', 'mobil ilova', 'приложение на заказ',
      'интернет-магазин под ключ', 'onlayn do‘kon yaratish',
      "onlayn do'kon yaratish",
      // "разработчик" and "мы делаем сайты" name the trade without naming the
      // product, which is exactly what a bare "сайт" cannot do. A chat called
      // "Чат разработчиков Ташкент" whose description is "обсуждение сайтов и
      // ботов" has no compound in it at all, and under a compounds-only
      // vocabulary it was rejected as off-topic — the one room in the test
      // suite that must survive, thrown away by a rule written to keep lawn
      // care out.
      'разработчик', 'создание сайт', 'создаем сайт', 'создаём сайт',
      'делаем сайт', 'делаем бот', 'пишем бот', 'web dasturlash',
      'веб-программир', 'programming', 'разработка приложен',
      // "linux" and "rivojlantiruvchi" are here because of one room:
      // "Xinux Oʻzbekiston" (663 members, "O‘zbekistondagi Nix va Linux
      // rivojlantiruvchi hamjamiyatiga"). It was the only genuine miss in
      // the 794 rooms the 2026-09-03 sweep threw away as off-topic — the
      // other 793 were phone bazaars and classifieds, and the word counts
      // behind that claim are in the commit that added these two lines.
      // A Linux users' group is a developers' group.
      'linux', 'rivojlantiruvchi',
    ],
    weak: [
      // No bare "сайт", "веб" or "бот", in either language, and the reason is
      // a measured one. Every business in this country advertises "наш сайт"
      // and takes orders through "@shop_bot"; the 2026-09-03 sweep confirmed
      // 471 rooms and three of the loudest were "Gazon Landshaftniy dizayn"
      // (190 069 members, weak hits: сайт + бот), "Tug'ilgan kun uchun
      // tabriklar" (71 237) and "TELEGRAM PREMIUM OLISH". Owning a website is
      // not selling websites. Only compounds are safe.
      'веб-сайт', 'вебсайт', 'web-sayt', 'сайт под ключ', 'sayt buyurtma',
      'telegram bot', 'tg bot', 'telegram-бот', 'телеграм бот',
      'landing', 'лендинг', 'crm',
      'интернет-магазин', 'onlayn do‘kon', "onlayn do'kon",
      'программн', 'программирован',
      'автоматизац', 'avtomatlashtir', 'verstka', 'вёрстк',
      //
      // Four deletions, every one of them a room that was sitting in the
      // table on 2026-09-03:
      //
      //   "dastur"      — also "dasturxon", the tablecloth. It carried the
      //                   textile room "robiyahometextil" (3 866), the carpet
      //                   room "gilam_cheholl" (3 100) and a Tashkent cake
      //                   shop "Zilola_tort_Toshkent" (3 281). "dasturlash"
      //                   and "dasturchi" are strong and are what a dev room
      //                   actually says.
      //   "код"/"kod"   — "UZFOR_RUBLSAVDO" (836 members, a ruble exchange)
      //                   matched on "Rasmiy Kod: 100400".
      //   "ilova"       — the Uzbek for an app, and therefore for any app,
      //                   including the game in "mobile_legends_uz_chat"
      //                   (6 436). "mobil ilova" is strong and stays.
      //   "приложен"    — the Russian for the same, and it appears in every
      //                   "скачать приложение" footer in the country.
      //   "разработк"   — kept. It is a verb only a builder uses.
      'разработк',
    ],
  },
  {
    id: 'design',
    label: 'Дизайн и брендинг',
    search: ['дизайн', 'графический дизайн', 'логотип', 'figma', 'ui ux'],
    strong: [
      'графический дизайн', 'график дизайн', 'grafik dizayn',
      'веб-дизайн', 'веб дизайн', 'логотип', 'logotip',
      'figma', 'ui/ux', 'ui ux', 'дизайн-студия', 'дизайн студия',
      'dizayn studiya', 'dizayner', 'дизайнер',
      // "брендинг" was strong and is not. "Текстиль Производства
      // Узбекистана" (9 483 members) is a textile B2B room whose description
      // says "Реклама оркали — Брендингизни тарғиб қилинг": promote your
      // brand. Everybody promotes a brand; almost nobody buys a brand system.
      'айдент', 'logotip yaratish', 'бренд-дизайн',
    ],
    weak: [
      // "дизайн" alone is not a design room in this country: "Самарканд
      // Гуллари" — a flower shop — scored 44 on the word and sat in the
      // table. Floral design is design. It is not a prospect.
      //
      // The flower shop was the argument; the 2026-09-03 table was the
      // proof. Fourteen of the rooms sitting on that one word were trades:
      // blinds ("jalyuziuy" 48 801, "JalyuziUzbekistan_N1" 26 335), gates
      // and railings ("DarvozavaPanjaralarSamarqand" 14 812), stretch
      // ceilings ("natyajnoy_potolog_xorazm" 14 517, "Toshkentsifatlinatijnoy"
      // 3 902), lawns ("Gazon_landshaft" 6 589), furniture ("Tapchan_Surilar_
      // Karavat" 110 956), cakes ("asl_tort_markaz" 5 771) and a builders'
      // exchange ("stroiteluz" 5 492). "В любом дизайне" is a promise every
      // workshop in Uzbekistan makes, and it is not a design business.
      //
      // A studio names the trade instead, and the strong list names it back:
      // "дизайнер", "логотип", "figma", "ui/ux", "веб-дизайн", "графический
      // дизайн", "макет". All of them survive.
      //
      // "лого" goes with it: it is the front half of "логопед" — a speech
      // therapist — and "surdologo_kab" (2 046 members of a speech-therapy
      // club) was in the table on it.
      'макет', 'иллюстрац', 'презентац',
      'presentatsiya', 'grafika', 'шрифт',
    ],
  },
  {
    id: 'it',
    label: 'IT-сообщество',
    search: [
      'it', 'айти', 'технологии', 'digital', 'айтишники', 'it park',
      'it сообщество', 'axborot texnologiyalari',
    ],
    strong: [
      'it park', 'it-park', 'it parki', 'it hub', 'it center', 'it markaz',
      'it-сообщество', 'it сообщество', 'it community', 'it jamiyat',
      'it kompaniya', 'it-kompaniya', 'it cluster', 'it klaster',
      'айтишник', 'it akademiya', 'it academy', 'it maktab',
      'axborot texnologiyalari', 'axborot texnologiyasi',
      'информационные технолог', 'информационных технолог',
      // "it hamjamiyat" is "it jamiyat" with a prefix, and "hamjamiyat" is
      // the ordinary Uzbek word for a community — it would not match the
      // term above it and there is no reason it should have to.
      'it hamjamiyat',
      // Information security, named in full and in both languages. A security
      // community is a room full of engineers, and the operator's brief asks
      // for IT communities by name. "Cyber Community 🇺🇿" (889 members,
      // "Форум на тему информационной безопасности") is what made the case.
      'информационной безопасн', 'информационная безопасн',
      'information security', 'кибербезопасн', 'kiberxavfsizlik',
    ],
    weak: [
      // No bare "it", in any form. "MANG‘IT NUKUS POPUTI" — an intercity
      // ride-share board — contains "it" between an apostrophe and a space,
      // matched the old term, and was kept twice under two different slugs.
      // Only compounds are safe.
      'айти', 'texnologiya', 'texnologiyalar', 'digital',
      'developer', 'софт', 'soft', 'кибер', 'kiber', 'tech',
      'it-', 'стартап', 'startap',
      //
      // "технолог" and "raqamli" are out, and they are out for the same
      // reason: in this country they are attached to a substance, not to
      // computing. "технолог" carried "sutuzb" (4 713 members, milk-
      // processing equipment: "Сутни қайта ишлаш технологиялари") and
      // "smsklinikaandijon" (3 994, an ear-nose-throat clinic). "raqamli"
      // carried two 70-thousand-member Tashkent flat-rental boards, whose
      // only digital anything is the ministry in their registration footer.
    ],
  },
  {
    id: 'biz',
    label: 'Бизнес и предприниматели',
    search: [
      'бизнес', 'предприниматели', 'бизнес клуб', 'бизнес сообщество',
      'стартап', 'biznes', 'tadbirkor',
    ],
    strong: [
      'предпринимат', 'tadbirkor', 'бизнес-клуб', 'бизнес клуб',
      'бизнес-сообщество', 'бизнес сообщество', 'бизнес-форум',
      'ishbilarmon', 'бизнесмен', 'бизнес-завтрак', 'бизнес-встреч',
      'стартап', 'startap', 'деловые люди', 'бизнес-чат', 'бизнес чат',
      'бизнес-сообщест', 'tadbirkorlar',
    ],
    weak: [
      // No "savdo", no "продажи", no "xizmat". Uzbek for trade and for
      // service, and they appear in the description of every shop, cargo
      // office and grain wholesaler in the country. A pack built on them does
      // not find business communities — it finds commerce, which is most
      // rooms, which is no filter at all.
      //
      // "компани" is weak for the same reason: "Atomy Namangan Markazi" — a
      // multi-level-marketing cell — named its company and was kept.
      'бизнес', 'biznes', 'инвест', 'invest', 'компани', 'kompaniya',
      'фирм', 'заказчик', 'офлайн', 'офлайн-', 'нетворкинг', 'networking',
      //
      // Four words for "customer" and "project" are gone, and the table they
      // leave was not a business table:
      //
      //   "mijoz"       — "Stop_semizlik" (194 297 members, a dietitian),
      //                   "asqarmallcenter11" (41 074, a shopping centre),
      //                   "UZB_Oziq_Ovqat" (2 957, food wholesale) and two
      //                   stock-exchange rooms (192 070 and 55 212) that say
      //                   "barcha ishtirokchilarni va mijozlarni".
      //   "клиент"     — the same word in Russian, and the same rooms.
      //   "loyiha"     — "DilIzhorlar_Loyihasi" (1 648, birthday greetings)
      //                   and "Slaydlar_Mustaqilishi" (289 957, a coursework
      //                   mill whose "проект" is a term paper).
      //   "проект"     — the Russian for it.
      //   "buyurtmachi"— "BuvaydaTitan" (579, titanium gates).
      //
      // Every shop in the country has customers and every student has a
      // project. A business community names itself: tadbirkor, предприниматель,
      // бизнес-клуб, стартап, нетворкинг, инвест.
    ],
  },
  {
    id: 'freelance',
    label: 'Фриланс и заказы',
    search: [
      'фриланс', 'заказы', 'удаленная работа', 'фрилансеры',
      'frilans', 'buyurtma',
    ],
    strong: [
      'фриланс', 'frilans', 'freelance', 'биржа фриланса',
      'удаленная работ', 'удалённая работ', 'masofaviy ish',
      'удаленка', 'kwork', 'fl.ru', 'фрилансер', 'frilanser',
    ],
    weak: [
      // No "заказ" and no "buyurtma", and this is the change that fixed the
      // harvest. Between them they were the entire case for twenty of the
      // thirty-seven rooms the sweep kept on 2026-09-03: "Tort_soliha",
      // "Кунград тойларга салат заказ", "JOZIBA ESHIK ZINALAR",
      // "Вкусная выпечка (Чирчик)". Every one of them takes orders. Not one
      // of them will ever commission a landing page. A word that describes
      // every made-to-order business in the country describes no business in
      // particular, and a filter cannot be built on it.
      'исполнител', 'ijrochi', 'подрядчик', 'pudratchi', 'бирж',
      'портфолио', 'portfolio', 'заказы', 'buyurtmalar', 'тендер',
    ],
  },
];
export const CHAT_TOPIC_IDS = CHAT_TOPIC_PACKS.map((pack) => pack.id);

/* ----------------------------------------------------------------- config */

export interface ChatHarvestConfig {
  /** Enabled pack ids. Empty means all of them. */
  topics: string[];
  /**
   * The operator's own words — "нужен бот", "разработка лендинга", whatever.
   * Used twice: as extra catalogue queries, and as match terms, so a room the
   * packs never heard of can still be recognised.
   */
  keywords: string[];
  /** City filter handed to the catalogue. Empty for the whole country. */
  city: string;
  minMembers: number;
  /** Telegram reports `online` for a live room and omits it for a dead one. */
  minOnline: number;
  minRelevance: number;
  /**
   * Require the room to name Uzbekistan or one of its cities.
   *
   * On by default, because a Moscow marketing room is worth nothing to a
   * studio in Tashkent and the open web is four fifths Moscow. A room that
   * never mentions geography is not assumed to be local — it is set aside
   * with `no-geo`, and one toggle brings it back into view. Rejecting it
   * silently would be a lie about what we know; keeping it by default would
   * be the nonsense list all over again.
   */
  localOnly: boolean;
  /** Hard cap on rows kept from one harvest. */
  limit: number;
}

export const CHAT_HARVEST_LIMITS = {
  /**
   * Thirty, and it was a hundred and fifty until 2026-09-03.
   *
   * The floor was raised to 150 to keep a harvest clean, and it kept the
   * harvest clean by throwing away the rooms that mattered. At 150 the table
   * had 64 rooms; at 30 it has 85, and the twenty-one below the old floor are
   * the most on-target rooms in the whole set:
   *
   *   @uz_js          (58)  — the Uzbek JavaScript community, and the hub:
   *                           its description links @vuejs_uz, @react_uz,
   *                           @laravel_uz, @linux_uzbek, @python_uz and six
   *                           more. Small rooms are not the tail of this
   *                           market; they are its index.
   *   @gde_frilanseri (42)  — "Если вы фрилансер или агентство поможем найти
   *                           заказ". The brief, in the room's own words.
   *   @neprogersuz    (45)  and @progersuz_offtop (30) — the developers' chat
   *                           and its offtop.
   *   @tadbirkor_samarkand (93), @frilansuzb_org (38), @crystalart_info (37),
   *   @jeteducation_group (43), @Kompyuterga_qiziquvchi (105).
   *
   * What comes in with them is a tail of single-word rooms — multi-level
   * marketing, a curtain salon, a law firm — and every one of them lands in
   * the tentative band, at the bottom of a table sorted by relevance. The
   * confirmed band gained eleven rooms and lost none.
   */
  minMembers: { min: 0, max: 100_000, fallback: 30 },
  minOnline: { min: 0, max: 10_000, fallback: 3 },
  minRelevance: { min: 0, max: 100, fallback: 25 },
  limit: { min: 10, max: 2_000, fallback: 400 },
  keywordsMax: 40,
  keywordMaxLength: 60,
} as const;

export const DEFAULT_CHAT_HARVEST: ChatHarvestConfig = {
  topics: [],
  keywords: [],
  city: 'Ташкент',
  minMembers: CHAT_HARVEST_LIMITS.minMembers.fallback,
  minOnline: CHAT_HARVEST_LIMITS.minOnline.fallback,
  minRelevance: CHAT_HARVEST_LIMITS.minRelevance.fallback,
  localOnly: true,
  limit: CHAT_HARVEST_LIMITS.limit.fallback,
};

function clampNumber(value: unknown, spec: { min: number; max: number; fallback: number }): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return spec.fallback;
  return Math.min(spec.max, Math.max(spec.min, Math.trunc(parsed)));
}

function cleanTerms(value: unknown, max: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, maxLength);
    if (trimmed.length === 0) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Accepts whatever the UI or the queue hands us and returns something sane.
 * A half-typed config must degrade to defaults, not to a crash mid-harvest:
 * the difference between a bad keyword and no keyword is one bad room, while
 * the difference between a bad keyword and a thrown error is an empty table.
 */
export function normalizeChatHarvest(raw: unknown): ChatHarvestConfig {
  const input = (raw ?? {}) as Record<string, unknown>;
  const topics = cleanTerms(input.topics, CHAT_TOPIC_PACKS.length, 32)
    .filter((id) => CHAT_TOPIC_IDS.includes(id));
  return {
    topics,
    keywords: cleanTerms(input.keywords, CHAT_HARVEST_LIMITS.keywordsMax, CHAT_HARVEST_LIMITS.keywordMaxLength),
    city: typeof input.city === 'string' ? input.city.trim().slice(0, 60) : DEFAULT_CHAT_HARVEST.city,
    minMembers: clampNumber(input.minMembers, CHAT_HARVEST_LIMITS.minMembers),
    minOnline: clampNumber(input.minOnline, CHAT_HARVEST_LIMITS.minOnline),
    minRelevance: clampNumber(input.minRelevance, CHAT_HARVEST_LIMITS.minRelevance),
    // Explicit `false` only. A missing key keeps the default, so every stored
    // config written before this flag existed stays local rather than silently
    // widening into the whole Russian-language web.
    localOnly: input.localOnly === false ? false : true,
    limit: clampNumber(input.limit, CHAT_HARVEST_LIMITS.limit),
  };
}

/** Enabled packs, or every pack when the operator has not narrowed it down. */
export function activeChatPacks(config: ChatHarvestConfig): ChatTopicPack[] {
  if (config.topics.length === 0) return CHAT_TOPIC_PACKS;
  return CHAT_TOPIC_PACKS.filter((pack) => config.topics.includes(pack.id));
}

/**
 * Place names, searched on their own.
 *
 * The highest-yield queries in the whole harvest, and the reason they are not
 * combined with a topic word: the catalogue ANDs its tokens, so "маркетинг
 * Ташкент" returns nothing at all while "ташкент" returns a full page of
 * fifty. Verified live — three separate wordings, the same empty result each
 * time.
 *
 * So geography and topic are two separate passes, and the topic filter does
 * its work on the card, where the room's full name and about text are
 * available, rather than in a query box that only ever sees one phrase.
 */
export const CHAT_GEO_QUERIES = [
  'ташкент', 'tashkent', 'toshkent',
  'узбекистан', 'uzbekistan', "o'zbekiston",
  'самарканд', 'samarkand', 'андижан', 'наманган',
];

/**
 * Queries to fire at the catalogues: places first, then topics, then the
 * operator's own words.
 *
 * Ordered by yield, not by importance. A topic query such as "реклама" returns
 * a page of Russian mutual-promotion rooms; a place query returns the rooms
 * the operator could actually visit. When a harvest is cut short by a rate
 * limit or a tick boundary, the first thing dropped is the query that was
 * least likely to produce a client.
 */
/**
 * True when a query is itself a place.
 *
 * A room returned by `?search=ташкент` is in Tashkent for the same reason a
 * room on `?city=Ташкент` is: the catalogue matched the word, and the word is
 * a city. Without this, half the harvest was rejected as `no-geo` — measured
 * at 50 of 133 on a live run — because the room's own name said "Чат" and its
 * description said nothing at all, while the query that found it said
 * "Ташкент" the whole time.
 *
 * "маркетинг" is not a place, and a room found under it stays unlocal. That
 * is the point of the distinction: those pages are the Russian mutual-
 * promotion swamps this whole geography filter exists to keep out.
 */
export function isLocalQuery(query: string): boolean {
  return foundIn(normalize(query), CHAT_HOME_TERMS).length > 0;
}

export function buildChatQueries(config: ChatHarvestConfig): string[] {
  const packs = activeChatPacks(config);
  const out: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !out.includes(trimmed)) out.push(trimmed);
  };

  for (const place of CHAT_GEO_QUERIES) push(place);
  for (const pack of packs) for (const term of pack.search) push(term);
  for (const keyword of config.keywords) push(keyword);
  return out;
}

/**
 * Catalogue URLs for one query.
 *
 * No `city` parameter, and no city appended to the query either. Both were
 * tried live on 2026-09-03 and both are traps:
 *
 *   `?search=маркетинг&city=Ташкент`  -> 200, zero results. The parameter is
 *                                        matched exactly and the value we
 *                                        would send is not one it knows.
 *   `?search=маркетинг Ташкент`       -> 200, zero results. The search box
 *                                        ANDs its tokens, so adding a city to
 *                                        a topic word returns nothing unless a
 *                                        room's own title contains both.
 *   `?search=маркетинг`               -> 200, ~86 KB, a real result set.
 *
 * So the query stays a single topic word and location is decided downstream,
 * from the t.me card, where the room's own title and about text say where it
 * actually is. That is both more accurate and far cheaper than guessing a
 * parameter the form never documented.
 *
 * telegid is deliberately query-free: its robots.txt disallows `*?*`, and a
 * crawler that honours robots only on the pages where it is convenient is a
 * crawler that gets blocked. Its city catalogues are reachable as bare paths,
 * so that is how we reach them.
 */
export function chatDirectoryUrls(query: string): string[] {
  return [`https://tgchats.org/?search=${encodeURIComponent(query)}`];
}

/**
 * tgchats city pages.
 *
 * The site has no documented city filter, but the homepage links 1 093
 * `?city=` URLs, and the parameter works. Verified live on 2026-09-03 with
 * the counts below; there is no pagination — `&page=2` returns page one.
 *
 * This is the single biggest source of *local* rooms found so far: 1 344 of
 * them, versus the ~50 per keyword page that a bare search returns, four
 * fifths of which are Russia.
 *
 * The homepage links 1 098 `?city=` values and every one of them is a Russian
 * town, so the Uzbek pages are not advertised anywhere — they were found by
 * handing the parameter sixty-six candidate names and keeping the sixty-four
 * that answered. Transliterations are included deliberately: `Tashkent` and
 * `Ташкент` are different pages with different rooms on them, which is only
 * discoverable by asking.
 */
export const TGCHATS_CITIES = [
  'Ташкент', 'Самарканд', 'Андижан', 'Ангрен', 'Кунград', 'Бухара', 'Наманган',
  'Узбекистан', 'Нукус', 'Карши', 'Чирчик', 'Алмалык', 'Термез', 'Навои',
  'Чуст', 'Фергана', 'Гулистан', 'Зарафшан', 'Каттакурган', 'Асака', 'Коканд',
  'Маргилан', 'Ахангаран', 'Шахрихан', 'Бекабад', 'Яккабаг', 'Янгиюль',
  'Учкудук', 'Ургенч', 'Риштан', 'Гиждуван', 'Джизак', 'Шахрисабз', 'Кува',
  'Каган', 'Кибрай', 'Сырдарья', 'Учкурган', 'Пскент', 'Шеробод', 'Паркент',
  'Камаши', 'Ромитан', 'Олтинкуль', 'Ургут', 'Муйнак', 'Янгиабад', 'Шурчи',
  'Нурабад', 'Касансай', 'Вабкент',
  // Latin spellings. Same country, different index.
  'Tashkent', 'Samarkand', 'Namangan', 'Termez', 'Andijan', 'Nukus', 'Bukhara',
  'Fergana', 'Navoi', 'Kokand', 'Karshi', 'Jizzakh', 'Urgench',
];

export function tgchatsCityUrl(city: string): string {
  return `https://tgchats.org/?city=${encodeURIComponent(city)}`;
}

/**
 * Path-only Telegid catalogues: every Uzbekistan city the site publishes.
 *
 * Taken from `https://telegid.me/sitemap.xml`, which is the index its own
 * robots.txt advertises — so these are paths the operator explicitly offers,
 * not paths guessed from URL shapes. Each one is server-rendered and each one
 * was fetched to confirm the entry count: Tashkent 62, Samarkand 59, Gulistan
 * 32, Bukhara 20, Andizhan 14, Termez 11, Urgench 4.
 *
 * The country catalogue is last and largest: 260 rooms, 52 of which appear in
 * no city page at all. It is fetched by the same path-only rule.
 *
 * Roughly two hundred and fifty rooms, all of them already local. That is the
 * whole value of this source: no geography to guess, because the city is the
 * path.
 */
export const TELEGID_CATALOGUES = [
  'https://telegid.me/catalog/uzbekistan/tashkent',
  'https://telegid.me/catalog/uzbekistan/samarkand',
  'https://telegid.me/catalog/uzbekistan/gulistan',
  'https://telegid.me/catalog/uzbekistan/buhara',
  'https://telegid.me/catalog/uzbekistan/andizhan',
  'https://telegid.me/catalog/uzbekistan/termez',
  'https://telegid.me/catalog/uzbekistan/urgench',
  'https://telegid.me/catalog/uzbekistan',
];

/* ------------------------------------------------------------------- tgstat */

/**
 * TGStat's chat ratings, filtered by country and category.
 *
 * This is the one source in the pipeline that is filed by *topic* rather than
 * by city, and the difference in yield is not subtle. Measured on 2026-09-03:
 *
 *   city directories   1 614 rooms  ->  37 kept, of which 20 were bakeries,
 *                                       door workshops and taxi dispatch,
 *                                       held up entirely by the words
 *                                       "заказ" and "buyurtma".
 *   tgstat categories  100 per category, 49 categories, already sorted by
 *                      member count, already classified by a human editor.
 *
 * A room in `/ratings/chats/tech` was read and filed there by someone. That is
 * worth more than any keyword we can match, because it is a classification of
 * the room rather than a search of its text — and it rescues exactly the rooms
 * keywords cannot: the ones called "IT Tashkent" that say nothing else about
 * themselves.
 *
 * Two limits, both measured. Sorting is `sort=members` only: `er`, `views`,
 * `members_day`, `members_week`, `avg_reach` and `reach` all return an empty
 * list to an anonymous client. Pagination does not exist for one either —
 * `page`, `offset`, `start`, `limit` and `perPage` all return page one. So one
 * category is exactly one hundred rooms, and breadth comes from the number of
 * categories we ask for, not from how deep we scroll.
 */
export const TGSTAT_COUNTRY = 'uz';

export interface TgstatCategory {
  id: string;
  /** The pack this category is evidence for. Null means "just look". */
  topic: string | null;
}

/**
 * The ratings we sweep, and what each one is worth.
 *
 * Fifteen categories was the first cut and it harvested 2 425 rooms, of which
 * 73 survived the classifier. That is too few to be a product, and the reason
 * is coverage rather than judgement: TGStat publishes 49 categories for
 * Uzbekistan, 100 chats each, and we were reading under a third of them.
 *
 * The sweeps now read 29. The twenty that are missing are the ones where a
 * buyer has never been found and will not be: adult, erotica, shock, darknet,
 * gambling, religion, politics, quotes, babies, sport, music, nature,
 * travels, books, language, psychology, esoterics, private, other, video.
 *
 * A `topic` here is only a tie-breaker now, and the comment on the weighing
 * loop explains why. The categories that are not about our trade are still
 * swept with `null`: a builders' chat is not a development room, but the
 * people in it commission websites.
 */
export const TGSTAT_CATEGORIES: TgstatCategory[] = [
  { id: 'tech', topic: 'it' },
  { id: 'marketing', topic: 'ads' },
  { id: 'business', topic: 'biz' },
  { id: 'design', topic: 'design' },
  { id: 'apps', topic: 'dev' },
  { id: 'sales', topic: 'ads' },
  { id: 'career', topic: 'freelance' },
  { id: 'courses', topic: 'it' },
  { id: 'education', topic: 'it' },
  { id: 'economics', topic: 'biz' },
  { id: 'instagram', topic: 'ads' },
  { id: 'construction', topic: 'biz' },
  { id: 'transport', topic: 'biz' },
  { id: 'games', topic: 'dev' },
  { id: 'art', topic: 'design' },
  // "telegram" is a category about Telegram itself — premium accounts,
  // накрутка, member-adding services — and not about building anything. It was
  // mapped to `dev` and that mapping is what put "Futboltv ⚽️" (1 599 969
  // members), "MELBET • 1XBET" (1 540 062) and "Gazon Landshaftniy dizayn"
  // (190 069) at the head of the development table on 2026-09-03: the hint
  // plus one weak word outvoted the room's own words.
  //
  // Not about our trade, but swept all the same, and judged on words alone:
  { id: 'telegram', topic: null },
  { id: 'crypto', topic: null },
  { id: 'handmade', topic: null },
  { id: 'law', topic: null },
  { id: 'medicine', topic: null },
  { id: 'health', topic: null },
  { id: 'beauty', topic: null },
  { id: 'food', topic: null },
  { id: 'pics', topic: null },
  { id: 'public', topic: null },
  { id: 'blogs', topic: null },
  { id: 'entertainment', topic: null },
  { id: 'edutainment', topic: null },
  { id: 'news', topic: null },
];

export function tgstatCategoryUrl(category: string, country = TGSTAT_COUNTRY): string {
  return `https://${country}.tgstat.com/ratings/chats/${encodeURIComponent(category)}?sort=members`;
}

/**
 * Peer handles out of a ratings page.
 *
 * `/chat/` paths only, and that is measured rather than assumed: across the
 * tech, business, marketing and design ratings for Uzbekistan on 2026-09-03,
 * the pages linked 397 `/chat/` peers and zero `/channel/` ones. This is the
 * chats rating, so reading it as chats costs nothing and skips the card
 * fetches that a channel would have wasted before being rejected.
 *
 * TGStat puts the `@` inside the path — `/chat/@tashkent_dev_chat` — so
 * stripping it is the parser's job rather than the caller's. Bot peers are
 * dropped: a bot is not a room, and a hundred slots per category is a budget
 * better spent on rooms.
 */
const TGSTAT_PEER_RE = /\/chat\/(@?[A-Za-z][A-Za-z0-9_]{3,40})/g;
const TGSTAT_BOT_RE = /(?:^|_)(?:bot|robot)$/i;

export function parseTgstatPeers(html: string): string[] {
  const out = new Set<string>();
  for (const match of html.matchAll(TGSTAT_PEER_RE)) {
    const slug = match[1].replace(/^@/, '');
    if (TGSTAT_BOT_RE.test(slug)) continue;
    out.add(slug);
  }
  return [...out];
}

/* ----------------------------------------------------------------- parsing */

export interface ChatCard {
  slug: string;
  kind: 'group' | 'channel' | 'unknown';
  title: string;
  about: string;
  members: number | null;
  online: number | null;
  indexable: boolean;
  /** @handles and t.me links in the about text — the crawl frontier. */
  linkedSlugs: string[];
}

const NOINDEX_RE = /<meta\s+name="robots"[^>]*\bnoindex/i;
const PAGE_TITLE_RE = /class="tgme_page_title"[^>]*>([\s\S]*?)<\/(?:span|div)>/;
const PAGE_ABOUT_RE = /class="tgme_page_description"[^>]*>([\s\S]*?)<\/div>/;
const PAGE_EXTRA_RE = /class="tgme_page_extra"[^>]*>([\s\S]*?)<\/div>/;
const OG_TITLE_RE = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/;
const OG_ABOUT_RE = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/;
const COUNTER_RE = /class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">([a-z]+)</g;
const MEMBERS_RE = /([\d][\d\s.,]*?)\s*(?:members|участник)/i;
const ONLINE_RE = /([\d][\d\s.,]*?)\s*(?:online|онлайн)/i;

function parseLooseCount(raw: string): number | null {
  const cleaned = decodeHtmlEntities(raw).replace(/[\s,]/g, '').trim();
  const match = /^(\d+(?:\.\d+)?)([KkMm])?$/.exec(cleaned);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const scale = match[2] ? (match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000) : 1;
  return Math.round(value * scale);
}

const HANDLE_RE = /@([A-Za-z][A-Za-z0-9_]{4,31})/g;
const TME_LINK_RE = /(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,40})(?![A-Za-z0-9_])/g;
const LINK_PATH_STOP = new Set([
  's', 'share', 'joinchat', 'login', 'proxy', 'iv', 'addstickers', 'setlanguage', 'contact', 'c',
]);

/**
 * A handle introduced as a channel is a channel.
 *
 * "Наш основной канал @ISHboor" is the most common sentence in an Uzbek group
 * description, and following it is the most expensive way in this pipeline to
 * learn nothing: one paced card fetch, one row, one `not-a-group`. Measured on
 * a live run at 77 of 372 rooms — a fifth of a harvest spent confirming that
 * megaphones are megaphones.
 *
 * The exception is the marketing sense of the word. "Канал продаж @sales" names
 * a sales channel, not a broadcast one, and those rooms are exactly the ones
 * we came for.
 */
const CHANNEL_REF_HINT = /(?:канал|channel|подпис|подпиш|subscribe)/i;
const SALES_CHANNEL_RE = /канал(?:ы|ов|ами|ах)?\s+(?:продаж|сбыта|трафика|привлечени|коммуникаци|маркетинг|реклам)/i;
/** How far back to look for the word that introduced the handle. */
const HANDLE_CONTEXT = 56;

function advertisesChannel(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - HANDLE_CONTEXT), at);
  return CHANNEL_REF_HINT.test(before) && !SALES_CHANNEL_RE.test(before);
}

/**
 * Public @handles in a body of text.
 *
 * Most Telegram chats advertise their siblings as `@name`, with no link, so a
 * link-only extractor sees an empty graph on exactly the pages where the graph
 * is richest. Handlers for bots and people are indistinguishable from chat
 * handles by shape alone — they are filtered later, by asking the card.
 */
export function extractHandles(text: string, exclude?: string): string[] {
  const out = new Set<string>();
  const accept = (slug: string, at: number | undefined): boolean => {
    if (LINK_PATH_STOP.has(slug.toLowerCase())) return false;
    if (exclude && slug.toLowerCase() === exclude.toLowerCase()) return false;
    return typeof at !== 'number' || !advertisesChannel(text, at);
  };
  for (const match of text.matchAll(HANDLE_RE)) {
    if (accept(match[1], match.index)) out.add(match[1]);
  }
  for (const match of text.matchAll(TME_LINK_RE)) {
    if (accept(match[1], match.index)) out.add(match[1]);
  }
  return [...out];
}

/**
 * Parse a `t.me/s/<slug>` card for either shape.
 *
 * The split is `tgme_page_extra`: a room says "N members, M online", a channel
 * says "N subscribers" (or exposes the channel counter pair instead). Groups
 * carry no message widgets at all, which is not a parsing failure — it is the
 * whole reason this card gets its own parser instead of piggybacking on the
 * channel preview one, which would call it `unknown` and throw it away.
 */
export function parseChatCard(html: string, slug: string): ChatCard {
  const indexable = !NOINDEX_RE.test(html);
  const dead: ChatCard = {
    slug, kind: 'unknown', title: '', about: '', members: null, online: null,
    indexable, linkedSlugs: [],
  };
  if (!indexable) return dead;

  const titleMatch = PAGE_TITLE_RE.exec(html) ?? OG_TITLE_RE.exec(html);
  const aboutMatch = PAGE_ABOUT_RE.exec(html) ?? OG_ABOUT_RE.exec(html);
  const title = titleMatch ? htmlToText(titleMatch[1]) : '';
  const about = aboutMatch ? htmlToText(aboutMatch[1]) : '';

  const counters: Record<string, string> = {};
  for (const match of html.matchAll(COUNTER_RE)) counters[match[2]] = match[1];

  const extraMatch = PAGE_EXTRA_RE.exec(html);
  const extra = extraMatch ? htmlToText(extraMatch[1]) : '';
  const extraMembers = MEMBERS_RE.exec(extra);
  const extraOnline = ONLINE_RE.exec(extra);

  const members = counters.members
    ? parseLooseCount(counters.members)
    : counters.subscribers
      ? parseLooseCount(counters.subscribers)
      : extraMembers
        ? parseLooseCount(extraMembers[1])
        : null;

  // A room with no title and no counter told us nothing. Telegram serves a
  // 200 for a deleted slug, so status alone cannot distinguish "gone" from
  // "here" — the absence of both is what says gone.
  const isGroup = Boolean(counters.members) || Boolean(extraMembers);
  const isChannel = !isGroup && (Boolean(counters.subscribers) || /(?:subscribers|подписчик)/i.test(extra));
  if (!title && members === null) return dead;

  return {
    slug,
    kind: isGroup ? 'group' : isChannel ? 'channel' : 'unknown',
    title,
    about,
    members,
    online: extraOnline ? parseLooseCount(extraOnline[1]) : null,
    indexable,
    linkedSlugs: extractHandles(`${title}\n${about}`, slug),
  };
}

export interface DirectoryEntry {
  slug: string;
  title: string;
  about: string;
  members: number | null;
}

const RESULT_ITEM_RE = /<div class="result-item[\s"']/g;
const ITEM_LINK_RE = /<a\s+href="https?:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{3,40})"[^>]*>([\s\S]*?)<\/a>/;
const ITEM_BADGE_RE = /class="badge"[^>]*>([^<]*)</;
const ITEM_DESC_RE = /<small>([\s\S]*?)<\/small>/;

/** tgchats.org search results. Each card carries its own member count. */
export function parseTgchatsResults(html: string): DirectoryEntry[] {
  const starts: number[] = [];
  for (const match of html.matchAll(RESULT_ITEM_RE)) starts.push(match.index);
  const out: DirectoryEntry[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const chunk = html.slice(starts[index], starts[index + 1] ?? html.length);
    const link = ITEM_LINK_RE.exec(chunk);
    if (!link) continue;
    const slug = link[1];
    if (LINK_PATH_STOP.has(slug.toLowerCase())) continue;
    const badge = ITEM_BADGE_RE.exec(chunk);
    const desc = ITEM_DESC_RE.exec(chunk);
    out.push({
      slug,
      title: htmlToText(link[2]),
      about: desc ? htmlToText(desc[1]) : '',
      members: badge ? parseLooseCount(badge[1]) : null,
    });
  }
  return out;
}

const TELEGID_ITEM_RE = /<div class="link-container"/g;
const TELEGID_TITLE_RE = /class="text-truncate link-container-title">([\s\S]*?)<\/div>/;
const TELEGID_DESC_RE = /class="text-muted small link-container-desc">([\s\S]*?)<\/div>/;
const TELEGID_LINK_RE = /href="https?:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{3,40})"/;

/** telegid.me catalogue cards. No member count here — the card will supply it. */
export function parseTelegidEntries(html: string): DirectoryEntry[] {
  const starts: number[] = [];
  for (const match of html.matchAll(TELEGID_ITEM_RE)) starts.push(match.index);
  const out: DirectoryEntry[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const chunk = html.slice(starts[index], starts[index + 1] ?? html.length);
    const link = TELEGID_LINK_RE.exec(chunk);
    if (!link) continue;
    const slug = link[1];
    if (LINK_PATH_STOP.has(slug.toLowerCase())) continue;
    const title = TELEGID_TITLE_RE.exec(chunk);
    const desc = TELEGID_DESC_RE.exec(chunk);
    out.push({
      slug,
      title: title ? htmlToText(title[1]) : '',
      about: desc ? htmlToText(desc[1]) : '',
      members: null,
    });
  }
  return out;
}

/* -------------------------------------------------------------- qualifying */

/**
 * Rooms that are not merely off-topic but actively useless or worse.
 *
 * Uzbek catalogues are dominated by three things: taxi dispatch, apartment
 * rental and crypto casinos. None of them is a lead, and crypto rooms in
 * particular are so keyword-greedy ("заработок", "доход") that they match an
 * ads pack cleanly. They are rejected before scoring, not out-scored.
 */
export const CHAT_JUNK_TERMS = [
  // Crypto, casinos, "easy money" — matches marketing vocabulary by design.
  'казино', 'casino', 'kazino', 'ставки на спорт', 'букмекер', 'bukmeker',
  'крипт', 'kripto', 'binance', 'bybit', 'okx', 'трейдинг', 'treyding',
  'памп', 'pamp', 'сигналы на', 'быстрые деньги', 'легкие деньги',
  'заработок в интернете', 'лохотрон', 'схемы заработка', 'инвестиции в крипт',
  // Adult.
  'интим', 'эротик', 'порно', 'porno', '18+', 'секс', 'seks', 'эскорт',
  'intim', 'знакомства для', 'tanishuv',
  // Fraud-adjacent.
  'обнал', 'дроповод', 'дропа', 'траст', 'откат', 'серые схемы', 'карты для',
  // Referral spam and giveaway churn.
  'реферал', 'рефкод', 'промокод', 'халява', 'раздача денег', 'розыгрыш денег',
  // Pure logistics: a courier room will never commission a website.
  // "taksi" is not a typo — it is the Uzbek transliteration, and leaving it
  // out let eight taxi dispatch rooms through a filter that was certain it
  // covered taxis. They were the largest single block of false positives in
  // the first Tashkent harvest.
  'такси', 'taxi', 'taksi', 'дальнобой', 'грузоперевозк', 'попутчик',
  'poputchik', 'yuk tashish', 'haydovchi', 'haydovchilar', 'трансфер',
  'reys', 'рейс',
  //
  // Everything below was added after reading the 2026-09-03 table rather than
  // guessing at it: each line is a room that was sitting in the output.
  //
  // Multi-level marketing. "Tarmoqli marketingda 9 yillik tajriba" is the
  // loudest genre of Uzbek business group that is not a business.
  'tarmoqli marketing', 'сетевой маркетинг', 'network marketing', ' mlm',
  'bitcoin', 'bitkoin',
  //
  // The junk list was written in Cyrillic and half the country writes Latin.
  // Two Tashkent flat-rental boards of 69 825 and 46 876 members were in the
  // table as IT rooms because "kvartira" and "arenda" are not "квартир" and
  // "аренда", and the same gap let a dental clinic and a gynaecology clinic
  // through as technology rooms.
  'kvartira', 'arenda', 'klinika', 'клиник', 'ginek',
  //
  // Building trades. Each of these was in the table on the word "дизайн".
  'jalyuzi', 'potolok', 'потолк', 'натяжн', 'natya', 'darvoza', 'panjara',
  'gazon', 'landshaft', 'dasturxon', 'gilam', 'ustalar', 'ustalari',
  //
  // Couriers, gaming, and the coursework industry: "Slayd, kurs ishi,
  // mustaqil ishlar, referat, diplom ishi" is one room with 289 957 members
  // and it is not a prospect, though it does use the word "mijoz".
  'kuryer', 'курьер',   'gaming', 'geyming',
  'diplom', 'referat', 'kurs ishi', 'mustaqil ish',
  //
  // A curtain salon whose come-on is "бесплатный выезд дизайнера" is a curtain
  // salon. A restaurant's own chat is a place to order dinner.
  'штор', 'карниз', 'портьер', 'ресторан', 'restoran', 'shtori',
  //
  // The three multi-level-marketing brands whose cells dominate Uzbek
  // Telegram, named because "tarmoqli marketing" is not always spelled out:
  // "Faberlik arzon narxlarda" and "Ерсаг корпорацияси" are two rooms the
  // 30-member floor let in.
  'faberlic', 'ersag', 'trading robot',
];

/**
 * Consumer boards. Not harmful like the junk list — just not buyers.
 *
 * This list exists because of a specific failure. Every Uzbek classifieds room
 * calls itself "реклама", so the ads pack matched a massage parlour, a modelling
 * casting call, a currency exchange and a group for pregnant women, and scored
 * all four in the eighties. They were, technically, rooms where the word
 * "реклама" appeared. They were never going to commission a landing page.
 *
 * Entries are chosen to avoid eating our own vocabulary: 'авто ' needs the
 * trailing space so it cannot touch "автоматизация", ' мед ' cannot touch
 * "медиа", and the Cyrillic 'модель' is deliberately absent because
 * "бизнес-модель" is exactly the kind of room we want.
 */
export const CHAT_NOISE_TERMS = [
  // Body and appearance services.
  'массаж', 'massaj', 'маникюр', 'ногт', 'ресниц', 'бров', 'салон красот',
  'тату', 'tattoo', 'косметолог', 'oriflame', 'avon', 'амвей',
  'herbalife', 'косметик',
  // Modelling and casting. The Cyrillic plural is here and the singular is
  // not, on purpose: "Модели Ташкента" is an agency, "бизнес-модель" is not.
  'нужна модель', 'фотомодел', 'кастинг', 'casting', 'актрис', 'актёр',
  'актер', 'model ', 'modeli ', 'модели ',
  // Medicine and children — a doctor's room is not a marketing budget.
  'врач', 'vrach', 'доктор', 'медицинск', 'беремен', 'беременяшк', 'мамочк',
  'детск', 'груднич',
  // Money changing.
  'обмен валют', 'валют', 'доллар', 'valyuta', 'kurs doll',
  // Property rental and consumer buy-sell.
  'квартир', 'аренд', 'ijara', 'сдам ', 'сним ', 'барахолк', 'baraholka',
  'barakholka', 'ремонт квартир', 'недвижим',
  // Vehicles.
  'автомобил', ' авто ', 'avto ', 'avtomobil', 'mashina sotib',
  // Pets, food, clothes.
  'животн', 'кошк', 'котик', 'котят', ' кот ', 'собак', 'щен', 'питомц',
  ' мёд', ' мед ', 'пчел', ' asal ',
  'фрукт', 'овощ', 'одежд', 'обувь', 'сумк', 'kiyim',
  // Beauty, retail and trades: real businesses, none of them our buyer.
  'красот', 'beauty ', 'колорист', 'colorist', 'парикмахер', 'барбер',
  'iherb', 'sexshop', 'сексшоп', 'парфюм', 'parfyum', 'духи',
  'мебел', 'mebel', 'софа', 'sofa ', 'диван', 'сантехник', 'santexnika',
  'сварк', 'kumush', 'кумюш', 'золот', 'тилло',
  // Wholesale, cargo, agriculture, handicraft, livestock: commerce, yes,
  // but none of it is ever going to commission a Telegram bot.
  'оптом', 'optom', ' опт ', 'yuk markazi', ' yuk ', 'cargo', 'карго',
  'доставк', 'yetkazib', 'асалари', 'asalari', 'асал ', 'пчеловод',
  'кабутар', 'kabutar', 'голуб', 'семечк', 'семена', 'semechk', 'semechka',
  ' дон ', 'уруг',
  'совчи', 'sovchi', 'ансамбл', 'ansambl', 'тикувчи', 'chevar', ' tikuv',
  // Consumer finance.
  'микрокредит', 'mikrokredit', 'кредит', 'kredit', 'займ', 'рассрочк',
  'muddatli',
  // Dating and partying.
  'знакомств', 'свидан', 'dating', 'tanishuv', 'вписк',
  // Recruitment. The largest rooms in Uzbek Telegram are job boards, and a
  // 143-thousand-member "Работа в Ташкенте" has never commissioned anything.
  //
  // Deliberately no bare stem for "работа": the word sits inside
  // "разработка", and a portfolio room saying "наши работы" is a peer, not a
  // job board. Only the recruitment vocabulary is here — employers, salaries,
  // vacancies and CVs — which no studio describes itself with.
  'ваканс', 'vakans', 'работодател', 'ищу работ', 'ищем работ', 'ищут работ',
  'зарплат', 'maosh', 'ish haqi', 'oylik', 'резюме', 'rezyume',
  'трудоустройств', 'ish qidir', 'ish izla', 'ishga joylash', 'ish o‘rin',
  'ish orin', 'ishchi', 'ishga',
  // Life coaching, sport, tuition, weddings.
  'психолог', 'psixolog', 'фитнес', 'fitnes', 'тренаж', 'спортзал',
  'репетитор', 'курсы английск', 'свадьб', ' to‘y', " to'y", 'никях', 'nikoh',
  // Consumer marketplaces, beauty hardware, Telegram dice games.
  ' рынок ', 'олх', 'olx', 'эпиляц', 'лазерн', 'ролок', 'ролки',
  // Classifieds boards. The single most common thing in Uzbek Telegram after
  // taxi dispatch, and the reason the first harvest's top of the table was a
  // bazaar, a houses-for-sale room and two "доска объявлений". A room whose
  // purpose is letting strangers post notices is not a room where a stranger
  // finds a client — it is a wall.
  'объявлени', 'elonlar', "e'lonlar", 'e’lonlar', ' доска ', 'doska',
  'базар', 'bazar', 'bozor',
  // Property, in the words the region actually uses. "TERMEZ UYLARI
  // SOTUVDA" — Termez houses for sale — was the clearest piece of nonsense
  // the first harvest kept, and it kept it because the Cyrillic property
  // vocabulary in this list says nothing about Uzbek.
  'уйлар', 'uylar', 'sotuvda', 'sotaman', 'sotib olaman', ' uy ', 'hovli',
  'томорк', 'tomorqa',
  // Consumer-protection rooms: complaints about shops, not budgets.
  'потребител', "iste'molchi", 'iste’molchi', 'iste`molchi',
];

/**
 * Mutual-promotion swamps.
 *
 * The single largest source of false positives, and the reason the first
 * harvest looked like nonsense. "реклама" as a room topic means two entirely
 * different things:
 *
 *   "Ищу, где разместить рекламу"    -> a buyer. This is what we want.
 *   "Все посят рекламу своих каналов" -> a room full of channel admins
 *                                        swapping promos with each other.
 *
 * The second kind outnumbers the first by roughly ten to one, matches every
 * word in the ads pack, and has large member counts and high online numbers,
 * so it out-scores the buyers. They are not prospects — they are competitors
 * trading favours, and a room whose entire economy is "you post mine, I post
 * yours" has no budget for a landing page.
 *
 * Rejected outright rather than scored down: they are not marginal, they are
 * a different thing wearing the same words.
 */
export const CHAT_PROMO_SWAMP_TERMS = [
  'взаимный пиар', 'взаимопиар', 'взаимн', 'взаим', 'взаимподписк',
  'пиар чат', 'пиарчат', 'pr chat', 'накрутк', 'раскрутк', 'просмотры',
  'граммы', 'gramm', 'продвижение канал', 'продвижение тг', 'реклама тг',
  'реклама тгк', 'ваших тгк', 'подписчиков', 'подпишись', 'лайкос',
  'бесплатная реклама', 'free реклама', 'реклама 24/7', 'реклама 24 7',
  'обмен реклам', 'реклама каналов', 'ваш канал', 'наши каналы',
];

/**
 * Where we can actually operate, and where we plainly cannot.
 *
 * Deliberately asymmetric. A room that never names a city is left alone —
 * plenty of good Tashkent rooms say nothing about geography. Only a room that
 * names somewhere we are not is rejected, and a room that names somewhere we
 * are gets a bonus. Rejecting the silent ones would have thrown away more
 * good rooms than it caught bad ones.
 */
export const CHAT_HOME_TERMS = [
  'ташкент', 'tashkent', 'toshkent', 'узбекистан', 'uzbekistan',
  'o‘zbekiston', "o'zbekiston", 'самарканд', 'samarqand', 'бухар', 'buxoro',
  'наманган', 'андижан', 'andijon', 'ферган', 'farg‘ona', "farg'ona",
  'карши', 'qarshi', 'нукус', 'nuqus', 'ургенч', 'urganch', 'коканд',
];

export const CHAT_FOREIGN_TERMS = [
  'москв', 'moscow', 'санкт-петербург', 'питер', ' спб', 'алмат', 'almaty',
  'астана', 'astana', 'киев', 'kyiv', 'бишкек', 'bishkek', 'душанбе',
  'баку', 'минск', 'minsk', 'новосибирск', 'екатеринбург', 'казан', 'istanbul',
  'краснодар', 'сочи', 'дубай', 'dubai', 'турция',
  'воронеж', 'voronej', 'voronezh', 'липецк', 'ростов', 'уфа', 'челябинск',
  'саратов', 'волгоград', 'тюмень', 'иркутск', 'владивосток', 'гуанчжоу',
  'гуанжоу', 'синьцзян', 'ургенч бишкек', 'москва-ташкент',
];

const CAN_WRITE_YES = [
  'обсуждени', 'форум', 'forum', 'болталк', 'гурунг', 'suhbat', 'muhokama',
  'muloqot', 'общени', 'общаться', 'пишите', 'yozing', 'можно писать',
  'свободно пиш', 'чат для общения', 'muhokama qilish', 'fikr almashish',
];

const CAN_WRITE_NO = [
  'только админ', 'админы пишут', 'писать могут только', 'админлар ёзади',
  'faqat admin', 'только администратор', 'read only', 'read-only',
  'только чтение', 'комментарии отключен', 'только просмотр',
];

export type ChatActivity = 'live' | 'slow' | 'unknown';
export type CanWrite = 'yes' | 'no' | 'unknown';

export interface ChatAssessment {
  topic: string | null;
  /**
   * Whether the room said enough to be believed.
   *
   * 'confirmed' means it named the trade — a strong term, or two weak ones.
   * 'tentative' means it used one weak word and nothing else: "сайт", "дизайн",
   * "it". Such a room may be exactly what we are looking for and simply does
   * not describe itself, or it may be a flower shop. It is kept and scored
   * below the confirmed band so the operator meets it after the rooms that
   * earned their place, never instead of them.
   */
  confidence: 'confirmed' | 'tentative' | null;
  relevance: number;
  matched: string[];
  activity: ChatActivity;
  canWrite: CanWrite;
  /** 'api' is binding. 'heuristic' is a guess, kept visible as one. */
  canWriteBasis: 'api' | 'heuristic' | null;
  /** Null means it survived. A string is the reason it did not. */
  reject: string | null;
}

const REJECTED: Omit<ChatAssessment, 'reject'> = {
  topic: null, confidence: null, relevance: 0, matched: [], activity: 'unknown',
  canWrite: 'unknown', canWriteBasis: null,
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

/**
 * The advertising boilerplate that ends almost every Uzbek group description.
 *
 * "Реклама: @sherbeh", "реклама +9989...", "PR: t.me/x", "по вопросам рекламы
 * пишите @admin". It is a contact line for buying ad space in that room, and
 * it is not a statement about what the room is for.
 *
 * Left in place it was the single worst source of false positives in the whole
 * harvest. A furniture shop in Jizzakh, a Namangan beekeepers' collective and
 * a pigeon fanciers' club all scored in the eighties as advertising rooms,
 * because all three descriptions ended with the words "реклама" and an
 * @handle. The word was there. The topic was not.
 *
 * Only the boilerplate shape is removed — the word followed closely by a
 * handle, a phone or a link. A room that is genuinely about advertising keeps
 * the phrase where it actually means something: "РЕКЛАМА В ТАШКЕНТЕ" survives
 * intact even when the same page ends with "реклама: @admin".
 */
// The gap may cross a newline but never a full stop. Uzbek descriptions put
// the contact on its own line ("Reklama xizmati mavjud 👇\n\n@Mohim925"), and
// the stop is what keeps "РЕКЛАМА В ТАШКЕНТЕ. Реклама: @admin" intact.
const PROMO_BOILERPLATE_RE = /(?:реклам\w*|reklama|пиар\w*|piar|pr)(?:[^.]{0,60}?)(?=@[A-Za-z0-9_]{4,}|\+\d{7,}|t\.me\/|https?:\/\/|в личк|в лс|писать|пишите|murojaat)/gi;

/**
 * The sentence that means "you can buy ad space in this room", in Uzbek.
 *
 *   "REKLAMA XIZMATI BOR💰💰"          DARVOZACHI AKA UKA — 108 833 members
 *   "Реклама хизмати бор."             Popda ish bor      —  13 855, a job board
 *   "Reklama xizmati mavjud 👇 @x"     BOLALAR PULI       —   8 376, benefits
 *   "REKLAMA XIZMATI"                  Tug'ilgan kun...   —  71 237, greetings
 *
 * Four of the loudest rooms in the 2026-09-03 confirmed band, every one of
 * them confirmed on this phrase and on nothing else. It is not a statement
 * about what a room is for; it is a price list for posting in it, and it sits
 * at the end of the description with no contact attached, which is exactly
 * why the contact-shaped rule above never touched it.
 *
 * The phrase is removed from the vocabulary too. An agency that sells
 * advertising says "reklama agentligi", "marketing xizmati" or "smm xizmati";
 * the rooms that say only "reklama xizmati" are selling space in themselves.
 */
const AD_SLOT_OFFER_RE =
  /(?:реклам\w+|reklama|эълон|e'lon|e’lon)\s+(?:хизмат\w*|xizmat\w*|нарх\w*|narx\w*)(?:\s+(?:бор|bor|mavjud|мавжуд|учун|uchun))?/gi;

export function stripPromoBoilerplate(value: string): string {
  return value
    .replace(AD_SLOT_OFFER_RE, ' ')
    .replace(PROMO_BOILERPLATE_RE, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Everything a room says about itself, padded with spaces so "pr" cannot match
 * inside "премия" and "it" still can.
 *
 * The slug is in here deliberately. Uzbek group slugs are descriptive rather
 * than cute — `toshkent_bekobod_taxi`, `qorakol_toshkent_taksi_xizmati` — and
 * a room that calls itself "Toshkent Bekobod" in the title says what it
 * actually is in the address. Filtering on title and description alone let a
 * 24-thousand-member intercity taxi dispatch room through, twice.
 */
function haystack(slug: string, title: string, about: string): string {
  const text = `${slug.replace(/[_-]+/g, ' ')} ${title} ${stripPromoBoilerplate(stripUrls(about))}`;
  return ` ${normalize(text)} `;
}

/**
 * Remove links before any vocabulary touches the text.
 *
 * Two rooms in the 2026-09-03 table were there because of their own URLs:
 *
 *   "Термез Мафтуна бижутерия" (239 members, a jewellery shop) was confirmed
 *     as a development room on `profile.php?id=100079557645095`.
 *   "Benison" restaurant (3 821) was confirmed as a startup room on
 *     `t.me/benisonMenubot?startapp` — "startap" has no right-hand boundary,
 *     because stems like "ташкент" and "предпринимат" need to match
 *     "Ташкенте" and "предпринимателей", and "startapp" is one letter away.
 *
 * Tightening the right-hand boundary would be the obvious repair and it would
 * break every stem in the file. Deleting the link is the other one, and it is
 * correct anyway: the words inside a URL are a domain and a query string, and
 * neither of them is the room talking about itself.
 */
function stripUrls(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ');
}

/**
 * Match a vocabulary term as a word, not as a substring.
 *
 * This used to be `hay.includes(term)`, and two real rooms are why it is not
 * any more:
 *
 *   "Запрещено: ссылки, реклама групп"  -> rejected as `noise:щен`, because
 *                                          "щен" (puppies) sits inside
 *                                          "запрещено" (forbidden).
 *   "Работа в Ташкенте"                 -> scored 68 as a `dev` room, because
 *                                          "бот" sits inside "Работа".
 *
 * A job board is the single loudest thing in Uzbek Telegram and it is the
 * exact opposite of a client. Plain substring matching cannot tell it from a
 * bot-order room, so the match is anchored to the start of a word: stems like
 * "животн" and "ташкент" still catch "животных" and "ташкенте", while "щен"
 * inside "запрещено" and "бот" inside "работа" stop matching anything.
 *
 * A term written with a trailing space keeps its trailing boundary too. The
 * author wrote "авто " that way because "автоматизация" starts with "авто",
 * and "кот " because "коттедж" starts with "кот" — both are real words in
 * rooms this vocabulary is supposed to let through.
 */
const WORD_LEFT = '(?:^|[^a-z0-9_а-я])';
const WORD_RIGHT = '(?![a-z0-9_а-я])';

const matcherCache = new Map<string, RegExp | null>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcherFor(term: string): RegExp | null {
  const cached = matcherCache.get(term);
  if (cached !== undefined) return cached;
  const body = normalize(term).trim();
  const re = body === ''
    ? null
    : new RegExp(WORD_LEFT + escapeRegExp(body) + (/\s$/.test(term) ? WORD_RIGHT : ''));
  matcherCache.set(term, re);
  return re;
}

export function foundIn(hay: string, terms: string[]): string[] {
  const out: string[] = [];
  for (const term of terms) {
    const re = matcherFor(term);
    if (re && re.test(hay)) out.push(term);
  }
  return out;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', ғ: 'g', қ: 'q', ҳ: 'h',
};

/** "дизайн" and "dizayn" become the same key, because they are one word. */
function conceptKey(term: string): string {
  let out = '';
  for (const ch of normalize(term)) out += CYRILLIC_TO_LATIN[ch] ?? ch;
  return out.replace(/[^a-z0-9]/g, '');
}

/**
 * Collapse the words that are the same claim in two languages.
 *
 * The vocabularies carry both scripts on purpose — an Uzbek room writes
 * "dizayn" and a Russian one writes "дизайн", and a matcher that only knew
 * one of them would miss half the country. But two weak hits are supposed to
 * mean two pieces of evidence, and "дизайн" plus "dizayn" is one piece of
 * evidence wearing two hats.
 *
 * This is what let "Gazon Landshaftniy dizayn" (190 069 members, a lawn
 * company) be *confirmed* as a design room: its title says the word twice,
 * once per alphabet, and the rule counted it twice. The same trick confirmed
 * a customs helpdesk on "tadbirkor" + "tadbirkorlar", an investment club on
 * "инвест" + "invest" and an accounting firm on "компани" + "kompaniya".
 *
 * Terms are folded to a Latin key and then dropped when they share a stem of
 * four characters or more with a term already counted. Four is low enough to
 * catch "компани"/"kompaniya" and high enough to leave "код"/"crm" apart.
 */
export function collapseTwins(terms: string[]): string[] {
  const keyed = terms
    .map((term) => ({ term, key: conceptKey(term) }))
    .filter((item) => item.key.length > 0)
    .sort((a, b) => b.key.length - a.key.length || a.key.localeCompare(b.key));
  const anchors: string[] = [];
  const kept: string[] = [];
  for (const item of keyed) {
    const twin = anchors.some((anchor) => {
      const shared = anchor.startsWith(item.key) || item.key.startsWith(anchor);
      return shared && Math.min(anchor.length, item.key.length) >= 4;
    });
    if (twin) continue;
    anchors.push(item.key);
    kept.push(item.term);
  }
  return kept;
}

export function chatActivity(online: number | null, minOnline: number): ChatActivity {
  if (online === null) return 'unknown';
  return online >= minOnline ? 'live' : 'slow';
}

/**
 * Decide whether a room is worth the operator's attention.
 *
 * Order matters. Membership and activity are cheap checks that throw away most
 * of a harvest, so they run before the keyword work; the junk list runs before
 * scoring because a crypto room scores well and is worth nothing. Rejections
 * carry their reason rather than a boolean, because "no" without "why" is the
 * thing that makes an operator stop trusting a filter.
 */
export function assessChat(
  input: {
    slug: string;
    kind: ChatCard['kind'];
    title: string;
    about: string;
    members: number | null;
    online: number | null;
    indexable: boolean;
    /**
     * The room is local because of where we found it, not because of anything
     * it says about itself.
     *
     * A city catalogue is a statement of geography: a room listed under
     * Tashkent is in Tashkent. Most of those rooms never type the word — the
     * title says "IshBor" and the description talks about work. Without this
     * hint every one of them would be dropped as `no-geo`, which would throw
     * away the single most local source we have for the sake of a rule that
     * exists only because the open web is four fifths Moscow.
     */
    localHint?: boolean;
    /**
     * The topic the catalogue filed this room under, if it files by topic.
     *
     * TGStat's ratings are a human-edited taxonomy, not our guess: a room in
     * `/ratings/chats/tech` was read by someone and put there. That makes the
     * hint good enough to *choose* a topic — a room called "IT Tashkent",
     * which says nothing else about itself, still belongs to the IT pack
     * instead of being dropped as off-topic.
     *
     * What it is not good enough for is *believing* the topic. On 2026-09-03
     * the hint alone confirmed a birthday-greeting room with 71 237 members
     * (filed under `telegram`), a child-benefit application room (filed under
     * `economics`) and a board of gatekeepers with 108 833 members. A
     * taxonomy names what a room is *about*, not whether anyone in it buys
     * services.
     *
     * So the hint picks the pack; the room's own words decide whether we
     * believe it. See the verdict below.
     */
    topicHint?: string | null;
  },
  config: ChatHarvestConfig,
): ChatAssessment {
  if (!input.indexable) return { ...REJECTED, reject: 'noindex' };
  // The operator asked for chats. A channel is a megaphone with a comment
  // box: no one can start a conversation in it, and handing one over as a
  // "chat" is worse than handing over nothing.
  if (input.kind === 'channel') return { ...REJECTED, reject: 'not-a-group' };
  if (input.kind === 'unknown') return { ...REJECTED, reject: 'unresolved' };

  if (input.members !== null && input.members < config.minMembers) {
    return { ...REJECTED, reject: 'too-small' };
  }
  const activity = chatActivity(input.online, config.minOnline);
  // The activity verdict is carried into the rejection. A room with two
  // people in it is quiet whether or not its words are right, and the table
  // shows that column for rejected rows too — an operator deciding whether to
  // restore one needs to know if there is anyone left to talk to.
  if (activity === 'slow') return { ...REJECTED, activity, reject: 'inactive' };

  const hay = haystack(input.slug, input.title, input.about);
  const junk = foundIn(hay, CHAT_JUNK_TERMS);
  if (junk.length > 0) return { ...REJECTED, activity, reject: `junk:${junk[0]}` };
  const noise = foundIn(hay, CHAT_NOISE_TERMS);
  if (noise.length > 0) return { ...REJECTED, activity, reject: `noise:${noise[0]}` };

  const swamp = foundIn(hay, CHAT_PROMO_SWAMP_TERMS);
  if (swamp.length > 0) return { ...REJECTED, activity, reject: `promo-swamp:${swamp[0]}` };

  const home = foundIn(hay, CHAT_HOME_TERMS);
  const foreign = foundIn(hay, CHAT_FOREIGN_TERMS);
  // Any foreign name, not just a foreign name unaccompanied by a local one.
  // "Воронеж Иш Узбекистан" names both, and it is a room for labour migrants
  // in Voronezh — it names Uzbekistan far more loudly than it is in it. A
  // room that has to mention another country at all is not a local room.
  if (foreign.length > 0) {
    return { ...REJECTED, activity, reject: `wrong-city:${foreign[0]}` };
  }
  const local = home.length > 0 || input.localHint === true;
  if (config.localOnly && !local) {
    return { ...REJECTED, activity, reject: 'no-geo' };
  }

  const packs = activeChatPacks(config);
  const custom = config.keywords.length > 0 ? foundIn(hay, config.keywords) : [];
  const matched: string[] = [];

  /**
   * Weight a room against one pack.
   *
   * Two weak words, or one strong one, name a topic. One weak word names
   * nothing, and that is the whole rule.
   */
  interface Weighed {
    pack: ChatTopicPack; strong: string[]; weak: string[]; weight: number; hinted: boolean;
  }
  const weighed: Weighed[] = [];
  for (const pack of packs) {
    // Twins are folded before the count, so "дизайн" plus "dizayn" is one
    // piece of evidence and not two. See collapseTwins for the room that
    // taught us this.
    const strong = collapseTwins(foundIn(hay, pack.strong));
    const weak = collapseTwins(foundIn(hay, pack.weak));
    const hinted = input.topicHint === pack.id;
    if (strong.length === 0 && weak.length === 0) continue;
    weighed.push({ pack, strong, weak, weight: strong.length * 2 + weak.length, hinted });
  }
  // A room has to say something. This is the rule that cost the most to
  // learn, because the alternative sounds so reasonable: a catalogue that
  // files rooms by topic has already read them, so why not trust it?
  //
  // Because we measured what the categories actually contain. TGStat's UZ
  // "Texnologiyalar" rating is phone bazaars and construction equipment;
  // "Marketing, PR, reklama" is labour migration and daily-work boards;
  // "Dizayn" leads with 1WIN and AVIATOR. Sorting by members — the only sort
  // the site offers an anonymous client — surfaces the largest rooms, and the
  // largest Uzbek rooms are classifieds.
  //
  // With the hint counted as evidence, 383 of the 436 rooms in the table on
  // 2026-09-03 had not said a single word from any vocabulary. They were in
  // the table because a category was. Among them: "999 MAGAZIN" (43 425),
  // "SPESTEXNIKA.UZB" (22 624), "Трансформатор сотилади" (15 163) and
  // "Сутни қайта ишлаш технологиялари" (4 525, milk-processing equipment).
  //
  // So the filing is a tie-breaker and nothing more: when a room's own words
  // point at two packs equally, the catalogue decides which one. It can no
  // longer put a silent room in the table at all.
  weighed.sort((a, b) => b.weight - a.weight || Number(b.hinted) - Number(a.hinted));

  const winner = weighed[0];
  let topic: string | null = null;
  let confidence: ChatAssessment['confidence'] = null;
  let depth = 0;

  // The catalogue's filing picks the topic. It does not confirm it.
  //
  // This distinction cost a harvest to learn. With the hint counted as a
  // strong hit, the 2026-09-03 sweep confirmed 471 rooms and the confirmed
  // band still contained "Tug'ilgan kun uchun tabriklar" (birthday greetings,
  // 71 237 members), "BOLALAR PULI" (child benefit applications), "DARVOZACHI
  // AKA UKA" (108 833 members of gatekeepers) and "Gazon Landshaftniy dizayn".
  //
  // All of them came from broad TGStat categories — `marketing`, `telegram`,
  // `education`, `economics`, `news` — where the taxonomy names what a room
  // is *about*, not whether anyone in it buys services. A room about
  // marketing is not a marketing room.
  //
  // So the hint decides *which* pack a room belongs to when the words are
  // silent, and only the room's own words decide whether we believe it: one
  // strong term, or two weak ones.
  if (winner && winner.weight >= 2) {
    topic = winner.pack.id;
    confidence = winner.strong.length > 0 || winner.weak.length >= 2 ? 'confirmed' : 'tentative';
    depth = winner.strong.length * 2 + winner.weak.length;
    matched.push(...winner.strong, ...winner.weak);
  } else if (winner && winner.weight === 1) {
    // One weak word. The room stays visible — it may be a studio that never
    // describes itself — but it is labelled as a guess and capped below the
    // confirmed band.
    topic = winner.pack.id;
    confidence = 'tentative';
    depth = 1;
    matched.push(...winner.weak);
  }

  matched.push(...custom);
  if (custom.length > 0) confidence = 'confirmed';

  if (topic === null && custom.length === 0) {
    return { ...REJECTED, activity, reject: 'off-topic' };
  }

  // Breadth is capped at two packs. An earlier version paid 16 points per
  // pack with no ceiling, which put a massage parlour and a genuine marketing
  // room in the same band: both said "реклама", both said "объявления". Two
  // packs is breadth; five is a room that used every word in the language.
  const packCount = weighed.filter((w) => w.weight >= 2).length;
  let score = Math.min(2, packCount) * 10;
  if (custom.length > 0) score += 12;
  // Depth: how much the winning pack actually heard the room say.
  //
  // Topic outweighs everything else, because it is the only thing here that
  // is evidence of relevance. The first weighting gave size and activity 35
  // points between them and depth 18, so "Узбекистан. Чат" — two thousand
  // people discussing nothing in particular, which happened to mention a bot
  // in its promo line — scored 96 and sat above every room that actually
  // offered a service. Size is a tiebreaker between rooms that are already
  // relevant. It is not a reason to call a room relevant.
  score += Math.min(30, (depth + custom.length) * 6);

  if (input.members !== null) {
    if (input.members >= 5_000) score += 12;
    else if (input.members >= 1_000) score += 9;
    else if (input.members >= 300) score += 6;
    else score += 3;
  }
  if (input.online !== null) {
    if (input.online >= 50) score += 10;
    else if (input.online >= 15) score += 7;
    else if (input.online >= 5) score += 4;
  }
  if (/(?:^|\s)(?:чат|chat|guruh|гурунг|группа|community|jamiyat)/.test(hay)) score += 6;
  if (local) score += 14;

  const heuristic = inferCanWrite(hay, input.kind);
  if (heuristic === 'yes') score += foundIn(hay, CAN_WRITE_YES).length > 0 ? 8 : 4;

  // A room that matched one weak word has not told us its topic, it has
  // merely used a word. "сайт" appears in ten thousand descriptions and
  // "дизайн" in every flower shop in Samarkand, and a single hit from either
  // is the whole of what "Узбекистан. Чат" had to say for itself.
  //
  // Such a room stays visible — it may be a studio that never describes
  // itself, and the harvest would be poorer without it — but it is capped
  // below the band where a room that named its trade lands, so it can never
  // sit at the top of a table the operator reads from the top down.
  if (confidence === 'tentative' && custom.length === 0) score = Math.min(score, 48);

  score = Math.max(0, Math.min(100, Math.round(score)));
  if (score < config.minRelevance) {
    return {
      ...REJECTED, activity, reject: 'off-topic', topic,
      matched: [...new Set(matched)],
    };
  }

  return {
    topic,
    confidence,
    relevance: score,
    matched: [...new Set(matched)],
    activity,
    canWrite: heuristic,
    canWriteBasis: heuristic === 'unknown' ? null : 'heuristic',
    reject: null,
  };
}

/**
 * Whether a non-admin may write here.
 *
 * Web markup does not say anything. `tgme_page_action` reads "View in Telegram"
 * for every public room regardless of its permissions, and the permissions
 * themselves live in MTProto, behind a join.
 *
 * So this reads the room's own name and description, and it starts from the
 * behaviour of the platform rather than from zero: a Telegram group defaults to
 * open posting, and restricting it is an action an admin has to take. Evidence
 * of that action — "только админы", "писать могут только" — is what flips the
 * answer to no. Everything else stays yes.
 *
 * That is an inference, not a measurement, and the table says so. The
 * measurement comes from `getChat` the moment a probe token is configured,
 * and it overwrites this.
 */
export function inferCanWrite(hay: string, kind: ChatCard['kind'] = 'group'): CanWrite {
  if (kind !== 'group') return 'no';
  if (foundIn(hay, CAN_WRITE_NO).length > 0) return 'no';
  return 'yes';
}

/** Telegram Bot API `getChat` verdict, when a token is available. */
export interface TelegramChatInfo {
  type: string;
  canSendMessages: boolean | null;
}

export function canWriteFromApi(info: TelegramChatInfo): CanWrite | null {
  if (info.type !== 'group' && info.type !== 'supergroup') return 'no';
  if (info.canSendMessages === null) return null;
  return info.canSendMessages ? 'yes' : 'no';
}
