/**
 * Signal Radar — the chat surface (migration 0059).
 *
 * The operator asked for chats, not channels, and the radar could only ever
 * show channels: `parseTelegramPreview` read `counter_value`, which is a
 * channel-only counter, so every group resolved to `kind: 'unknown'` and was
 * discarded. The first task of this file is to keep that specific fact true:
 * a group card must be recognised as a group.
 *
 * The second task is to keep two real rooms honest. Both were wrong on live
 * pages and both were fixed by anchoring the vocabulary match to the start of
 * a word:
 *
 *   "Запрещено: ссылки, реклама групп"  was rejected as `noise:щен`
 *   "Работа в Ташкенте"                 scored 68 as a `dev` room, via "бот"
 *
 * Neither contains the word that rejected or scored it. A substring matcher
 * cannot tell. These tests are the reason the matcher does not use one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessChat,
  buildChatQueries,
  chatActivity,
  chatDirectoryUrls,
  collapseTwins,
  extractHandles,
  foundIn,
  inferCanWrite,
  normalizeChatHarvest,
  parseChatCard,
  parseTelegidEntries,
  parseTgchatsResults,
  parseTgstatPeers,
  stripPromoBoilerplate,
  CHAT_TOPIC_PACKS,
  CHAT_HARVEST_LIMITS,
  DEFAULT_CHAT_HARVEST,
  TELEGID_CATALOGUES,
  TGSTAT_CATEGORIES,
} from '../functions/platform/lead-radar/signal-chats';
import { chatHarvestSources, runChatHarvest, CHAT_CRAWL_LIMITS } from '../functions/platform/lead-radar/signal-chat-crawl';
import {
  chatHarvestStatusFromCursor,
  chatsSchemaReady,
  SignalChatStore,
  signalChatId,
  newSignalChatId,
  readChatHarvestConfig,
  readChatHarvestCursor,
  writeChatHarvestConfig,
  writeChatHarvestCursor,
} from '../functions/platform/lead-radar/signal-chat-store';
import {
  parseSignalChatHarvestQueueMessage,
  signalChatHarvestQueueMessage,
  SIGNAL_CHAT_HARVEST_COOLDOWN_MS,
  SIGNAL_CHAT_QUEUE_SCHEMA,
} from '../src/shared/signal-radar';
import { SqliteD1 } from './helpers/sqlite-d1';
import { SIGNAL_MIGRATIONS, SIGNAL_MIGRATION_SQL } from './helpers/signal-schema';
import {
  CHANNEL_CARD_HTML,
  DEAD_CARD_HTML,
  GROUP_CARD_ABOUT_WITH_HANDLES,
  GROUP_CARD_HTML,
  TELEGID_CONTAINER_BLOCKS,
  TGCHATS_RESULT_BLOCKS,
  TGSTAT_RATINGS_HTML,
} from './fixtures/signal-chats-html';

const ORG = 'owner_8ee98dc3040f160b308166b0';
const NOW = new Date('2026-09-03T10:00:00.000Z');

/**
 * A database with the Signal schema applied.
 *
 * `stopAt` builds a schema production has genuinely had: 0059 on its own is
 * what the chats table looked like before 0060, and a fixture that only ever
 * builds the finished schema cannot test a readiness check whose whole job is
 * noticing a migration that has not been applied yet.
 */
function db(stopAt?: (typeof SIGNAL_MIGRATIONS)[number]): SqliteD1 {
  const database = new SqliteD1();
  // Migration 0003. The harvest configuration lives in system_settings, so a
  // fixture without it cannot test that configuration round-trips.
  database.exec(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`);
  const upto = stopAt ? SIGNAL_MIGRATIONS.slice(0, SIGNAL_MIGRATIONS.indexOf(stopAt) + 1) : SIGNAL_MIGRATIONS;
  for (const name of upto) database.exec(SIGNAL_MIGRATION_SQL[name]);
  return database;
}

const config = (over: Record<string, unknown> = {}) =>
  normalizeChatHarvest({ ...DEFAULT_CHAT_HARVEST, ...over });

/* ==================================================================== *
 * Parsing live markup
 * ==================================================================== */

test('parseChatCard: a group card yields kind=group with members and online', () => {
  const card = parseChatCard(GROUP_CARD_HTML, 'PRTash');
  assert.equal(card.kind, 'group');
  assert.equal(card.members, 2620);
  assert.equal(card.online, 18);
  assert.equal(card.title, 'Объявления в Ташкенте🇺🇿');
  assert.ok(card.about.includes('объявления'));
});

test('parseChatCard: a verified channel uses the other layout and is still a channel', () => {
  // Not the same markup as a group at all: no tgme_page_title, no
  // tgme_page_extra — the name and the counters live under
  // tgme_channel_info_*. An earlier parser read only the first layout and
  // called this 'unknown', which is how channels came to dominate a table
  // that was supposed to be about chats.
  const card = parseChatCard(CHANNEL_CARD_HTML, 'afishauz');
  assert.equal(card.kind, 'channel');
  assert.equal(card.members, 32800, '32.8K must survive parseLooseCount');
  assert.equal(card.online, null);
  // The fixture is the info block only, so there is no og:title to fall back
  // on. What matters is the kind: the counters, not the name, are what make
  // this a channel, and they are what the group parser never saw.
  assert.equal(card.title, '');
});

test('parseChatCard: a slug that does not exist is unresolved, not a group', () => {
  // Telegram answers 200 for a dead slug. Only the absence of both a real
  // title and a counter says "gone", so this asserts on the parser's own
  // judgement rather than on a status code it never sees.
  const card = parseChatCard(DEAD_CARD_HTML, 'zzz_definitely_not_a_real_slug_928374');
  assert.equal(card.kind, 'unknown');
  assert.equal(card.members, null);
});

test('parseChatCard: a room hidden from indexing is not a candidate', () => {
  const card = parseChatCard('<meta name="robots" content="noindex">' + GROUP_CARD_HTML, 'PRTash');
  assert.equal(card.indexable, false);
  assert.equal(card.kind, 'unknown');
});

test('extractHandles: siblings advertised as @name are found, not just links', () => {
  const handles = extractHandles(GROUP_CARD_ABOUT_WITH_HANDLES, 'ishboor_chat');
  assert.ok(handles.includes('Ulugkhon'));
  assert.ok(!handles.includes('ishboor_chat'), 'the room itself is not a sibling');
  // ISHboor is introduced as "Наш основной канал" and it is one — this room is
  // `ishboor_chat`, the channel is the megaphone beside it. Following it costs
  // a paced card fetch and returns `not-a-group`.
  assert.ok(
    !handles.includes('ISHboor'),
    'a handle introduced as a channel is not walked as a room',
  );
});

test('extractHandles: a sales channel is not a broadcast channel', () => {
  // "Канал продаж" is marketing vocabulary for a route to market, and the room
  // it names is frequently the most interesting room on the card.
  const handles = extractHandles('Канал продаж @opt_tashkent. Канал привлечения @leads_uz');
  assert.ok(handles.includes('opt_tashkent'), 'the word "канал" alone must not blind the extractor');
  assert.ok(handles.includes('leads_uz'));
  const broadcast = extractHandles('Подписывайтесь на наш канал @afisha_uz');
  assert.ok(!broadcast.includes('afisha_uz'), 'but an invitation to subscribe is');
});

test('parseTgchatsResults: live result blocks carry slug, title and members', () => {
  const entries = parseTgchatsResults(TGCHATS_RESULT_BLOCKS.join('\n'));
  assert.ok(entries.length >= 4, `expected the frozen blocks to parse, got ${entries.length}`);
  const first = entries[0]!;
  assert.equal(first.slug, 'zlomda');
  assert.equal(first.members, 35722);
  assert.ok(first.title.length > 0);
  for (const entry of entries) {
    assert.match(entry.slug, /^[A-Za-z][A-Za-z0-9_]{3,40}$/, `bad slug ${entry.slug}`);
  }
});

test('parseTelegidEntries: city catalogue cards are read path-local, with no member count', () => {
  const entries = parseTelegidEntries(TELEGID_CONTAINER_BLOCKS.join('\n'));
  assert.ok(entries.length >= 3, `expected the frozen cards to parse, got ${entries.length}`);
  const board = entries.find((entry) => entry.slug === 'reklamazi');
  assert.ok(board, `reklamazi missing: ${JSON.stringify(entries.map((e) => e.slug))}`);
  assert.match(board!.title, /Доска объявления/);
  assert.equal(board!.members, null, 'telegid shows no count; the card supplies it');
  assert.match(board!.about, /PULLIK ELONLAR/, 'the description is the richest field on the card');
});

test('both catalogue parsers skip Telegram service paths', () => {
  const html = '<div class="result-item "><a href="https://t.me/share">x</a></div>'
    + '<div class="result-item "><a href="https://t.me/realroom">real</a></div>'
    + '<div class="link-container"><a href="https://t.me/login">l</a></div>'
    + '<div class="link-container"><a href="https://t.me/realroom2">r2</a></div>';
  assert.deepEqual(parseTgchatsResults(html).map((e) => e.slug), ['realroom']);
  assert.deepEqual(parseTelegidEntries(html).map((e) => e.slug), ['realroom2']);
});

/* ==================================================================== *
 * Word-boundary matching — the two live false results
 * ==================================================================== */

test('a word inside a longer word is not a match', () => {
  // The haystack is padded with spaces, exactly as assessChat builds it.
  const hay = ' добавляйте объявления , бесплатно. соблюдайте правила. запрещено: ссылки. реклама групп и каналов. ';
  assert.deepEqual(foundIn(hay, ['щен']), [], 'щен sits inside запрещено');

  const job = ' работа в ташкенте! chat ';
  assert.deepEqual(foundIn(job, ['бот']), [], 'бот sits inside работа');

  // ...while the words themselves still match, and stems still work.
  const animals = ' щенки и котята ';
  assert.deepEqual(foundIn(animals, ['щен', 'котят']), ['щен', 'котят']);
  const bots = ' заказать бота для telegram ';
  assert.deepEqual(foundIn(bots, ['бот']), ['бот']);
});

test('a recruitment room is rejected as recruitment, not quietly as off-topic', () => {
  // 143 thousand members, the biggest kind of room in the country, and it has
  // never commissioned a landing page.
  const verdict = assessChat(
    {
      slug: 'ishboor_chat', kind: 'group',
      title: 'IshBor - Работа в Ташкенте! Chat',
      about: 'Наш основной канал @ISHboor\nПрямая связь с работодателями\nЗарплата до 20.000.000 сум',
      members: 2606, online: 5, indexable: true,
    },
    config(),
  );
  assert.match(verdict.reject ?? '', /^noise:(работодател|зарплат)/, `got ${verdict.reject}`);
  assert.equal(verdict.topic, null);
});

test('a studio portfolio is not recruitment and not noise', () => {
  // "наши работы" and "разработка" both contain "работ". If the recruitment
  // vocabulary were a bare stem, this room would be thrown away — and it is
  // a peer, not a job board.
  const verdict = assessChat(
    {
      slug: 'studio_tashkent', kind: 'group',
      title: 'Веб-студия Ташкент — чат',
      about: 'Наши работы: сайты, боты, лендинги. Разработка под ключ. Обсуждаем проекты.',
      members: 900, online: 12, indexable: true,
    },
    config(),
  );
  assert.equal(verdict.reject, null, `rejected as ${verdict.reject}`);
  assert.equal(verdict.topic, 'dev');
});

test('"график работы" is not a design signal', () => {
  const verdict = assessChat(
    {
      // Not a beauty salon: "салон красот" is itself a noise term, so a salon
      // would be rejected before this test could say anything about schedules.
      // An office with nothing on the wall but its opening hours is the room
      // whose only interesting property is that it says "график".
      slug: 'ofis_tashkent', kind: 'group',
      title: 'Офис Ташкент',
      about: 'График работы: 9:00–20:00. Запись по телефону.',
      members: 4000, online: 9, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(verdict.topic, null, 'a schedule is not a portfolio');
  assert.equal(verdict.reject, 'off-topic');
});

test('a genuine design room is still found', () => {
  const verdict = assessChat(
    {
      slug: 'design_uz', kind: 'group',
      title: 'Графический дизайн Узбекистан',
      about: 'Дизайнеры Ташкента: логотипы, макеты, фирменный стиль, figma.',
      members: 1200, online: 14, indexable: true,
    },
    config(),
  );
  assert.equal(verdict.reject, null, `rejected as ${verdict.reject}`);
  assert.equal(verdict.topic, 'design');
});

/* ==================================================================== *
 * Assessment
 * ==================================================================== */

test('a channel is rejected as not-a-group before anything else is considered', () => {
  const verdict = assessChat(
    {
      slug: 'afishauz', kind: 'channel', title: 'Afisha.uz', about: 'реклама, маркетинг',
      members: 32800, online: null, indexable: true,
    },
    config(),
  );
  assert.equal(verdict.reject, 'not-a-group');
});

test('membership and activity are checked before the vocabulary, and report why', () => {
  const base = {
    slug: 'dev_chat_tashkent', kind: 'group' as const,
    title: 'Разработка ботов Ташкент', about: 'заказывают сайты и ботов',
    indexable: true,
  };
  assert.equal(assessChat({ ...base, members: 12, online: 40 }, config()).reject, 'too-small');
  assert.equal(assessChat({ ...base, members: 900, online: 0 }, config()).reject, 'inactive');
  // The activity verdict survives a rejection: a room with two people in it
  // is slow whether or not the words are right.
  assert.equal(
    assessChat({ ...base, members: 900, online: 0 }, config()).activity,
    'slow',
  );
});

test('junk and mutual-promo rooms are rejected outright, not scored down', () => {
  const base = { slug: 'some_chat', kind: 'group' as const, members: 9000, online: 40, indexable: true };
  const casino = assessChat({ ...base, title: 'Казино Узбекистан', about: 'заработок и схемы' }, config());
  assert.match(casino.reject ?? '', /^junk:/);

  const swamp = assessChat(
    { ...base, title: 'Взаимный пиар', about: 'обмен рекламой, продвижение каналов, подписчиков' },
    config(),
  );
  assert.match(swamp.reject ?? '', /^promo-swamp:/);
});

test('a room that names another country is rejected even when it also names ours', () => {
  // "Воронеж Иш Узбекистан" is a room for labour migrants in Voronezh. It
  // names Uzbekistan more loudly than it is in it.
  const verdict = assessChat(
    {
      slug: 'voronej_ish', kind: 'group', title: 'Воронеж Иш Узбекистан',
      // Deliberately not a job board. Recruitment is rejected earlier in the
      // funnel than geography is, so a room advertising vacancies would be
      // dismissed as `noise:ваканс` and this test would prove nothing about
      // cities.
      about: 'чат для своих', members: 9000, online: 30, indexable: true,
    },
    config(),
  );
  assert.match(verdict.reject ?? '', /^wrong-city:/);
});

test('localOnly drops a silent room but never one found under a city catalogue', () => {
  const base = {
    kind: 'group' as const, title: 'Маркетинг чат', about: 'реклама, smm, таргет',
    members: 2000, online: 20, indexable: true,
  };
  assert.equal(assessChat({ ...base, slug: 'marketing_chat' }, config()).reject, 'no-geo');

  // Same room, zero geography in its own words, but telegid listed it under
  // /catalog/uzbekistan/tashkent. Most Tashkent rooms never type the word.
  const verdict = assessChat({ ...base, slug: 'marketing_chat', localHint: true }, config());
  assert.equal(verdict.reject, null, `rejected as ${verdict.reject}`);
  assert.equal(verdict.topic, 'ads');

  // localOnly off lets the silent one through without inventing geography.
  assert.equal(
    assessChat({ ...base, slug: 'marketing_chat' }, config({ localOnly: false })).reject,
    null,
  );
});

test('relevance below the floor is rejected as off-topic and keeps its matched words', () => {
  const verdict = assessChat(
    {
      slug: 'tiny_ads_chat', kind: 'group', title: 'Чат', about: 'таргет и smm',
      members: 160, online: 3, indexable: true, localHint: true,
    },
    config({ minRelevance: 90 }),
  );
  assert.equal(verdict.reject, 'off-topic');
  assert.equal(verdict.topic, 'ads', 'a rejected room still says what it was about');
  assert.ok(verdict.matched.includes('таргет'), 'the reason must be inspectable');
  // "реклама" alone no longer matches the ads pack, and that is the point: it
  // is the word every classifieds board in the country uses for "post here".
  assert.deepEqual(verdict.matched.filter((term) => term === 'реклам'), []);
});

test('breadth is capped: a room that matches five packs is not five times a client', () => {
  const kitchen = {
    slug: 'vse_srazu', kind: 'group' as const, members: 9000, online: 60,
    indexable: true, localHint: true,
    // Five packs, and deliberately not one strong term between them: the
    // point of this fixture is breadth, and a strong term would be depth.
    title: 'Лендинги, маркетинг, макеты, стартапы, портфолио Ташкент',
    about: 'общение, обмен опытом, обо всём',
  };
  const broad = assessChat(kitchen, config());
  const narrow = assessChat(
    {
      ...kitchen, title: 'Сайты Ташкент', about: 'лендинги и боты на заказ',
    },
    config(),
  );
  assert.equal(broad.reject, null);
  assert.equal(narrow.reject, null);
  assert.ok(
    broad.relevance <= narrow.relevance + 28,
    `breadth outran depth: ${broad.relevance} vs ${narrow.relevance}`,
  );
});

test('a room that takes orders is not a room that buys development', () => {
  // The twenty rooms that broke the harvest, verbatim from the 2026-09-03
  // sweep of 1 614 live Uzbek rooms. Every one of them was kept, and every
  // one of them was kept by a single word: "заказ", "buyurtma" or "проект".
  //
  //   Tort_soliha                      45  freelance  [проект]
  //   Кунград тойларга салат заказ     40  freelance  [заказ]
  //   JOZIBA ESHIK ZINALAR             45  freelance  [buyurtma]
  //   Вкусная выпечка (Чирчик)         44  freelance  [заказ]
  //   Safo_sweets                      45  freelance  [заказ]
  //   NAMANGAN PARDALARI ROBIYA        45  freelance  [buyurtma]
  //
  // Taking orders is what a bakery does. It is not what a client does, and a
  // word that describes every made-to-order business in the country describes
  // no business in particular.
  const orders = [
    { slug: 'tort_soliha', title: 'Tort_soliha', about: 'торты на заказ' },
    { slug: 'mdf_eshiklar_zina', title: 'JOZIBA ESHIK ZINALAR', about: 'эшик ва зиналар buyurtma asosida' },
    { slug: 'korpatoshak', title: 'Курпа-Тушаклар (АНДИЖОН)', about: 'курпа-тушаклар buyurtma' },
    { slug: 'namanganpardalarr', title: 'NAMANGAN PARDALARI ROBIYA', about: 'пардалар buyurtma' },
  ];
  for (const room of orders) {
    const verdict = assessChat(
      { ...room, kind: 'group' as const, members: 3_000, online: 20, indexable: true, localHint: true },
      config(),
    );
    assert.equal(verdict.reject, 'off-topic', `${room.title} was kept as ${verdict.topic}`);
    assert.notEqual(verdict.topic, 'freelance', `${room.title} is not a freelance exchange`);
  }
});

test('"it" inside a word is not the IT pack', () => {
  // MANG'IT NUKUS POPUTI — an intercity ride-share board — was kept twice
  // under two slugs because the old vocabulary contained the bare term
  // "it " and "MANG'IT" puts "it" between an apostrophe and a space.
  const verdict = assessChat(
    {
      slug: 'mangitnukuspoputiin', kind: 'group', title: "MANG'IT NUKUS POPUTI",
      about: 'нuкус мангит попутка', members: 35_276, online: 157,
      indexable: true, localHint: true,
    },
    config(),
  );
  assert.notEqual(verdict.topic, 'it', 'an apostrophe is not a word boundary we own');
  assert.equal(verdict.reject, 'off-topic');
});

test('naming the trade confirms a room; merely owning a website does not even name it', () => {
  const studio = assessChat(
    {
      slug: 'web_studio_tashkent', kind: 'group', title: 'Веб-студия Ташкент',
      about: 'разработка сайтов, telegram бот, лендинги',
      members: 900, online: 20, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(studio.reject, null);
  assert.equal(studio.topic, 'dev');
  assert.equal(studio.confidence, 'confirmed');

  // Owning a website is not selling websites. "у нас есть сайт" used to be a
  // weak dev hit, and it is what let "Gazon Landshaftniy dizayn" (190 069
  // members) into the development table. It is not a weak hit any more, and
  // the room has nothing else to say, so the room is not ours at all.
  const owner = assessChat(
    {
      slug: 'chiroq_chat', kind: 'group', title: 'Чирокчи гурунг',
      about: 'гурунг, общение, у нас есть сайт',
      members: 900, online: 20, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(owner.reject, 'off-topic', `kept as ${owner.topic} on ${JSON.stringify(owner.matched)}`);

  // One weak word and nothing else. The room may be a studio that never
  // describes itself, so it is kept — but it is labelled as a guess and
  // capped below the band a studio that named its trade lands in.
  const guess = assessChat(
    {
      slug: 'chiroq_chat', kind: 'group', title: 'Чирокчи гурунг',
      about: 'гурунг, общение, внедряем crm',
      members: 900, online: 20, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(guess.reject, null);
  assert.equal(guess.confidence, 'tentative', `matched: ${JSON.stringify(guess.matched)}`);
  assert.ok(
    guess.relevance < studio.relevance,
    `a guess outranked a studio: ${guess.relevance} vs ${studio.relevance}`,
  );
});

test('a catalogue filing is not evidence, and a silent room stays out of the table', () => {
  // This is the most expensive lesson in the harvest, and it is recorded here
  // because the opposite sounds so sensible: a catalogue files rooms by topic,
  // so a room in /ratings/chats/tech must be a technology room.
  //
  // It is not. The categories are real — every one of them returns a distinct
  // set of peers — but the population inside them is not what the label
  // promises, because the rating sorts by members and the largest Uzbek chats
  // are classifieds. "Texnologiyalar" is phone bazaars and excavators;
  // "Marketing, PR, reklama" is labour migration; "Dizayn" opens with 1WIN.
  //
  // Counting the filing as evidence put 383 of the 436 rooms in the table on
  // 2026-09-03 without a single matched word between them.
  const room = {
    slug: 'it_tashkent', kind: 'group' as const, title: 'IT Tashkent', about: '',
    members: 4_000, online: 30, indexable: true, localHint: true,
  };
  const silent = assessChat(room, config());
  assert.equal(silent.reject, 'off-topic', 'with no words there is nothing to go on');

  const filed = assessChat({ ...room, topicHint: 'it' }, config());
  assert.equal(filed.reject, 'off-topic', 'a filing cannot put a mute room in the table');
});

test('the filing breaks a tie between two packs the room spoke for equally', () => {
  // "landing" is a weak dev word, "texnologiya" a weak it word, and this room
  // says one of each. Its own words point at two packs with equal weight, and
  // only then does the catalogue get a say.
  //
  // It used to be "dastur va texnologiyalar", which was a fairer sentence and
  // a worse test: "dastur" left the weak list on 2026-09-03 because "dasturxon"
  // is a tablecloth, and the sentence stopped being a tie.
  const room = {
    slug: 'texnopark_chat', kind: 'group' as const,
    title: 'Texnopark chat', about: 'landing va texnologiyalar haqida gaplashamiz',
    members: 3_000, online: 30, indexable: true, localHint: true,
  };
  assert.equal(assessChat({ ...room, topicHint: 'it' }, config()).topic, 'it');
  assert.equal(assessChat({ ...room, topicHint: 'dev' }, config()).topic, 'dev');
  // Without a filing the first pack wins, and the tie-break is not consulted.
  assert.equal(assessChat(room, config()).topic, 'dev');
});

test('stripPromoBoilerplate removes the contact line, not the topic', () => {
  // A furniture shop, a beekeepers' collective and a pigeon club all scored
  // in the eighties as advertising rooms because every Uzbek description
  // ends with "реклама: @admin". The word was there. The topic was not.
  // The label goes, the handle stays. What scored was the word "реклама"; the
  // @handle after the colon is a contact, and contacts are how the operator
  // reaches the room — stripping them would be tidying away the useful half.
  assert.equal(
    stripPromoBoilerplate('Мебель Джизак. Реклама: @mebel_admin').trim(),
    'Мебель Джизак. @mebel_admin',
  );
  assert.equal(
    stripPromoBoilerplate('РЕКЛАМА В ТАШКЕНТЕ. Реклама: @admin').trim(),
    'РЕКЛАМА В ТАШКЕНТЕ. @admin',
  );
});

test('advertising boilerplate alone no longer makes a room an ads room', () => {
  const verdict = assessChat(
    {
      slug: 'mebel_jizzakh', kind: 'group', title: 'Мебель Джизак',
      about: 'Столы, стулья, софа. Реклама: @mebel_admin',
      members: 8000, online: 25, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(verdict.reject, 'noise:мебел');
});

test('can-write is a guess, and the table is told it is a guess', () => {
  const open = assessChat(
    {
      slug: 'tashkent_dev_chat', kind: 'group', title: 'Чат разработчиков Ташкент',
      about: 'обсуждение лендингов и telegram ботов, пишите все', members: 1500, online: 20,
      indexable: true,
    },
    config(),
  );
  assert.equal(open.canWrite, 'yes');
  assert.equal(open.canWriteBasis, 'heuristic');

  const closed = assessChat(
    {
      slug: 'tashkent_dev_news', kind: 'group', title: 'Разработка Ташкент',
      about: 'новости. писать могут только админы', members: 1500, online: 20,
      indexable: true,
    },
    config(),
  );
  assert.equal(closed.canWrite, 'no');

  assert.equal(inferCanWrite(' что угодно ', 'channel'), 'no', 'a channel is a megaphone by construction');
  // A group defaults to open posting, so silence in the description is a weak
  // "yes" rather than an "unknown". It is still only a guess — the basis is
  // what tells the operator so, and the join is what settles it.
  assert.equal(inferCanWrite(' что угодно ', 'group'), 'yes');
});

test('the same word in two alphabets is one piece of evidence, not two', () => {
  // "Gazon Landshaftniy dizayn" — 190 069 members of a lawn company — was
  // *confirmed* as a design room because its title says "дизайн" and "dizayn",
  // and two weak hits are the rule for confirmed. It said the word once.
  assert.deepEqual(collapseTwins(['дизайн', 'dizayn']).length, 1);
  assert.deepEqual(collapseTwins(['инвест', 'invest']).length, 1);
  assert.deepEqual(collapseTwins(['компани', 'kompaniya']).length, 1);
  assert.deepEqual(collapseTwins(['tadbirkor', 'tadbirkorlar']).length, 1);
  assert.deepEqual(collapseTwins(['логотип', 'лого']).length, 1);
  assert.deepEqual(collapseTwins(['маркетинг', 'marketing']).length, 1);
  assert.deepEqual(collapseTwins(['стартап', 'startap']).length, 1);
  assert.deepEqual(collapseTwins(['медиа', 'media']).length, 1);

  // Different claims survive the fold. Four characters is the stem threshold:
  // short enough to catch "компани"/"kompaniya", long enough to keep these
  // two apart.
  assert.deepEqual(collapseTwins(['код', 'crm']).length, 2);
  assert.deepEqual(collapseTwins(['dastur', 'dizayn']).length, 2);
  assert.deepEqual(collapseTwins(['приложен', 'ilova']).length, 2);
  assert.deepEqual(collapseTwins([]), []);
});

test('a lawn company is not a design studio, however many alphabets it says it in', () => {
  const lawn = assessChat(
    {
      slug: 'gazon_xizmati8', kind: 'group', title: 'Gazon Landshaftniy dizayn',
      about: 'озеления ландшафтный дизайн посадка газон и уход. Манзил: Ташкент',
      members: 190_069, online: 300, indexable: true, localHint: true,
    },
    config(),
  );
  // It is out of the table now rather than tentatively in it. "дизайн" and
  // "dizayn" left the weak list altogether the same day, when the table they
  // were producing turned out to be blinds, gates, lawns, ceilings, cakes and
  // a builders' exchange — "в любом дизайне" is a promise every workshop in
  // this country makes. A lawn company says the word twice and nothing else,
  // and nothing else is exactly what it is.
  // It is out of the table now — on the junk list, in fact, because "gazon"
  // and "landshaft" went onto it the same day — and the point of the test is
  // the second half: the design vocabulary no longer claims it at all. The
  // room says the word twice and has nothing else to say.
  assert.notEqual(lawn.reject, null, `kept as ${lawn.topic}`);
  assert.deepEqual(lawn.matched, [], 'design should not claim a lawn company');

  // A room that sells advertising slots is not a room that buys them.
  for (const [slug, title, about] of [
    ['darvoza_fargona_namangan_andijon', 'DARVOZACHI AKA UKA',
      "Vodiy va toshkent bo'ylab barcha turdagi temir darvozalar yasash. REKLAMA XIZMATI BOR"],
    ['tabriklar95', "Tug'ilgan kun uchun tabriklar",
      "Tug'ilgan kun uchun telefon orqali tabriklar xizmati"],
    ['popda_ishbor', 'Popda ish bor (Popliklar)',
      'Поп туманидаги буш иш уринлари. Реклама хизмати бор. 1 эълон - 40 минг сум'],
  ] as const) {
    const room = assessChat(
      { slug, kind: 'group', title, about, members: 20_000, online: 60, indexable: true, localHint: true },
      config(),
    );
    // Not `off-topic` specifically: the gate fitters land on the junk list
    // now, because "darvoza" went onto it. What matters is that none of them
    // reaches the table, whichever door they are turned away at.
    assert.notEqual(room.reject, null,
      `${slug} kept as ${room.topic} on ${JSON.stringify(room.matched)}`);
    assert.deepEqual(room.matched, [], `${slug} should not claim any vocabulary`);
  }

  // A school with a sign-up bot is not a development shop.
  const academy = assessChat(
    {
      slug: 'ADM_Jizzakh_HR', kind: 'group', title: 'ADM Academy',
      about: 'kursda ishtirok etish uchun quyidagi Telegram bot orqali royxatan oting: @admacade',
      members: 10_152, online: 120, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(academy.confidence, 'tentative', `confirmed on ${JSON.stringify(academy.matched)}`);
});

test('the two rooms the off-topic pile was hiding, and the pile itself', () => {
  // The 2026-09-03 sweep threw 794 rooms away for saying nothing we knew.
  // Counting the words in them was the only honest way to find out whether
  // the vocabulary was missing something or the rooms really were empty, and
  // the answer was one room out of 794. Here it is.
  const xinux = assessChat(
    {
      slug: 'Xinux_Ozbekiston', kind: 'group', title: 'Xinux Oʻzbekiston',
      about: 'O‘zbekistondagi Nix va Linux rivojlantiruvchi hamjamiyatiga xush kelibsiz',
      members: 663, online: 14, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(xinux.topic, 'dev');
  assert.equal(xinux.confidence, 'confirmed', `missed on ${JSON.stringify(xinux.matched)}`);

  // An information-security forum is an IT community, and the brief asks for
  // IT communities by name.
  const cyber = assessChat(
    {
      slug: 'cyber_community_uz', kind: 'group', title: 'Cyber Community 🇺🇿',
      about: 'Форум на тему информационной безопасности и хакинга. Автор: @someone',
      members: 889, online: 22, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(cyber.topic, 'it');
  assert.equal(cyber.confidence, 'confirmed', `missed on ${JSON.stringify(cyber.matched)}`);

  // And the pile. "компьютер" was the loudest word in it that sounds like our
  // business and is not: five rooms, every one of them a shop that sells
  // computers. The same count priced "reklama" at 67 rooms of ad-slot sales,
  // "xizmat" at 36 shops and "zakaz" at 17 more. None of them is a client.
  for (const [slug, title, about] of [
    ['kompyuters', 'KOMPYUTER OLAMIZ & SOTAMIZ. 💻',
      'Gruppa ssilkasi telegram.me/kompyuters Faqat olamiz va sotamiz'],
    ['g_shop_chat', 'G-SHOP ЧАТ', 'Компьютерный магазин для геймеров и энтузиастов'],
    ['quadro_mi', 'Quadro Mi Computers (Andijon)', 'Bu guruhda telefon va kompyuterlar sotiladi'],
    ['andijon_shop', 'ANDIJON SHOP', 'Eng arzon narxlar. Zakaz qilish uchun admin: @andijon_shop'],
    ['orzutech_mobile', 'Orzutech Mobile (GROUP)', 'Наша деятельность: Продажа смартфонов и аксессуаров'],
  ] as const) {
    const room = assessChat(
      { slug, kind: 'group', title, about, members: 1_500, online: 20, indexable: true, localHint: true },
      config(),
    );
    assert.notEqual(
      room.reject, null,
      `${slug} kept as ${room.topic} on ${JSON.stringify(room.matched)}`,
    );
  }
});

test('a room is not a startup because its menu link says so', () => {
  // Two rooms in the 2026-09-03 table were there because of their own URLs.
  // "Термез Мафтуна бижутерия" — a jewellery shop with 239 members — was
  // confirmed as a development room on `facebook.com/profile.php?id=…`, and
  // the Benison restaurant (3 821) was confirmed as a business room on
  // `t.me/benisonMenubot?startapp`. Neither URL is the room talking about
  // itself; both are a query string that happens to contain a word.
  const jewellery = assessChat(
    {
      slug: 'termez_bijuteriya', kind: 'group', title: 'Термез Мафтуна бижутерия',
      about: 'Для заказа директ @Ma_Silver Instagram https://www.facebook.com/profile.php?id=100079557645095',
      members: 239, online: 9, indexable: true, localHint: true,
    },
    config(),
  );
  assert.notEqual(jewellery.reject, null, `kept as ${jewellery.topic} on ${JSON.stringify(jewellery.matched)}`);

  const restaurant = assessChat(
    {
      slug: 'benisonuz', kind: 'group', title: '"Benison" restaurant [Чат]',
      about: 'Семейный Ресторан Benison. Menu: https://t.me/benisonMenubot?startapp',
      members: 3_821, online: 40, indexable: true, localHint: true,
    },
    config(),
  );
  assert.notEqual(restaurant.reject, null, `kept as ${restaurant.topic} on ${JSON.stringify(restaurant.matched)}`);

  // The words are still found when the room says them as words rather than
  // pastes them into a link. Stripping the link is not the same as forgetting
  // the language.
  const studio = assessChat(
    {
      slug: 'startap_uz', kind: 'group', title: 'Startap UZ',
      about: 'стартап ва бизнес лойиҳалар муҳокамаси',
      members: 900, online: 12, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(studio.topic, 'biz');
  assert.equal(studio.confidence, 'confirmed', `missed on ${JSON.stringify(studio.matched)}`);
});

test('a small room is a room, and Uzbekistan is full of them', () => {
  // The floor used to be 150 members and it is 30 now, because the rooms it
  // was keeping out were the ones the brief asked for. @uz_js has 58 members
  // and links to @vuejs_uz, @react_uz, @laravel_uz, @linux_uzbek and six
  // more: the small rooms in this market are the index of the big ones.
  const hub = assessChat(
    {
      slug: 'uz_js', kind: 'group',
      title: 'Uzbek JavaScript community',
      about: '@vuejs_uz @react_uz @nodejs_uz @laravel_uz @linux_uzbek @python_uz',
      members: 58, online: 18, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(hub.topic, 'dev');
  assert.equal(hub.confidence, 'confirmed', `missed on ${JSON.stringify(hub.matched)}`);

  // And a room too quiet to be worth opening is still rejected, however small
  // the floor gets: two people online is not a conversation.
  const quiet = assessChat(
    {
      slug: 'tiny_dev_chat', kind: 'group', title: 'Разработчики Ташкент',
      about: 'frontend, backend, обсуждаем код',
      members: 40, online: 2, indexable: true, localHint: true,
    },
    config(),
  );
  assert.equal(quiet.reject, 'inactive');
});

test('activity is a verdict against a threshold, not a stored fact', () => {
  assert.equal(chatActivity(null, 3), 'unknown');
  assert.equal(chatActivity(3, 3), 'live');
  assert.equal(chatActivity(2, 3), 'slow');
});

/* ==================================================================== *
 * Configuration
 * ==================================================================== */

test('normalizeChatHarvest clamps everything the operator can type', () => {
  const wild = normalizeChatHarvest({
    topics: ['ads', 'nonsense', 'dev', 'ads'],
    keywords: ['  сайт  ', '', 'x'.repeat(200)],
    city: 'x'.repeat(200),
    minMembers: -5,
    minOnline: 0,
    minRelevance: 500,
    limit: 99999,
  });
  assert.deepEqual(wild.topics, ['ads', 'dev']);
  assert.deepEqual(wild.keywords, ['сайт', 'x'.repeat(60)]);
  assert.equal(wild.city.length, 60);
  assert.equal(wild.minMembers, 0);
  assert.equal(wild.minOnline, 0);
  assert.equal(wild.minRelevance, 100);
  assert.equal(wild.limit, CHAT_HARVEST_LIMITS.limit.max,
    'the ceiling, not the default: the operator asked for more rows than one harvest may store');
});

test('geo queries stand alone: a catalogue ANDs its tokens together', () => {
  // tgchats matched tokens conjunctively, so "маркетинг Ташкент" returned
  // nothing while "Ташкент" alone returned fifty. City and topic are
  // therefore separate queries, never composed.
  const queries = buildChatQueries(config({ topics: ['ads'], keywords: ['лендинг'] }));
  assert.ok(queries.some((q) => /ташкент/i.test(q)), 'city gets its own query');
  assert.ok(queries.some((q) => /реклама/i.test(q)), 'pack search terms are used');
  assert.ok(queries.includes('лендинг'), 'operator keywords are included');
  assert.ok(!queries.some((q) => /реклама/i.test(q) && /ташкент/i.test(q)));
});

test('every pack contributes queries when it is switched on', () => {
  const all = buildChatQueries(config({ topics: CHAT_TOPIC_PACKS.map((p) => p.id) }));
  for (const pack of CHAT_TOPIC_PACKS) {
    assert.ok(
      all.some((q) => pack.search.some((s) => q.toLowerCase() === s.toLowerCase())),
      `pack ${pack.id} contributed nothing`,
    );
  }
});

test('chatDirectoryUrls produces a fetchable, encoded tgchats search', () => {
  const [url] = chatDirectoryUrls('реклама Ташкент');
  assert.match(url, /^https:\/\/tgchats\.org\/\?search=/);
  assert.ok(!/[А-Яа-я]/.test(url), 'non-ASCII must be percent-encoded');
});

/* ==================================================================== *
 * Store
 * ==================================================================== */

test('newSignalChatId produces the shape the CHECK constraint demands', () => {
  for (let i = 0; i < 50; i += 1) {
    const id = newSignalChatId();
    assert.ok(signalChatId(id), `bad id ${id}`);
    assert.equal(id.length, 37);
    assert.ok(id.startsWith('lrsc_'));
  }
  assert.ok(!signalChatId('lrsc_'));
  assert.ok(!signalChatId('lrsc_zzz'));
});

test('upsertChat round-trips every field the table renders', async () => {
  const store = new SignalChatStore(db());
  const chat = await store.upsertChat(ORG, {
    slug: 'dev_chat_tashkent', kind: 'group', title: 'Разработка Ташкент',
    about: 'заказывают сайты', topic: 'dev', members: 1500, online: 20,
    activity: 'live', canWrite: 'yes', canWriteBasis: 'heuristic',
    relevance: 71, matched: ['сайт', 'бот'], source: 'tgchats', query: 'сайт',
  }, NOW.toISOString());

  assert.equal(chat.slug, 'dev_chat_tashkent');
  assert.equal(chat.url, 'https://t.me/dev_chat_tashkent');
  assert.equal(chat.status, 'new');
  assert.deepEqual(chat.matched, ['сайт', 'бот']);
  assert.equal(chat.activity, 'live');
  assert.equal(chat.canWriteBasis, 'heuristic');

  const again = await store.getChatBySlug(ORG, 'dev_chat_tashkent');
  assert.equal(again?.id, chat.id, 'the unique key is (org, slug), not the id');
});

test('a re-harvest refreshes the numbers but never overturns a decision', async () => {
  const store = new SignalChatStore(db());
  await store.upsertChat(ORG, {
    slug: 'ads_chat_tashkent', kind: 'group', title: 'Ads', members: 500,
    online: 4, activity: 'live', relevance: 30, source: 'tgchats',
  }, NOW.toISOString());

  await store.updateChat(ORG, (await store.getChatBySlug(ORG, 'ads_chat_tashkent'))!.id, {
    status: 'rejected', rejectReason: 'junk:казино',
  }, NOW.toISOString());

  // Same room comes back from a later harvest with better numbers.
  const refreshed = await store.upsertChat(ORG, {
    slug: 'ads_chat_tashkent', kind: 'group', title: 'Ads', members: 9000,
    online: 90, activity: 'live', relevance: 20, source: 'telegid',
  }, new Date(NOW.getTime() + 86400000).toISOString());

  assert.equal(refreshed.status, 'rejected', 'a dismissal must survive a re-harvest');
  assert.equal(refreshed.members, 9000, 'but the numbers must not go stale');
  assert.equal(refreshed.online, 90);
  assert.equal(refreshed.relevance, 30, 'relevance never regresses: MAX(old, new)');
});

test('an operator verdict on can_write is recorded as its own basis', async () => {
  const store = new SignalChatStore(db());
  const created = await store.upsertChat(ORG, {
    slug: 'write_chat_tashkent', kind: 'group', title: 'Чат', members: 900,
    online: 10, activity: 'live', canWrite: 'yes', canWriteBasis: 'heuristic',
    relevance: 40, source: 'manual',
  }, NOW.toISOString());

  const patched = await store.updateChat(ORG, created.id, { canWrite: 'no' }, NOW.toISOString());
  assert.equal(patched?.canWrite, 'no');
  assert.equal(
    patched?.canWriteBasis,
    'operator',
    'a human decision must not be re-labelled as a regex guess',
  );
});

test('listChats filters, counts and explains what it dropped', async () => {
  const store = new SignalChatStore(db());
  await store.upsertChat(ORG, {
    slug: 'good_chat_tashkent', kind: 'group', title: 'Реклама Ташкент', topic: 'ads',
    members: 5000, online: 40, activity: 'live', relevance: 80, source: 'tgchats',
  }, NOW.toISOString());
  await store.upsertChat(ORG, {
    slug: 'small_chat_tashkent', kind: 'group', title: 'Маленький', topic: 'dev',
    members: 200, online: 40, activity: 'live', relevance: 30, source: 'tgchats',
  }, NOW.toISOString());
  await store.upsertChat(ORG, {
    slug: 'junk_chat_tashkent', kind: 'group', title: 'Казино', members: 9000,
    online: 40, activity: 'live', relevance: 0, rejectReason: 'junk:казино',
    source: 'tgchats',
  }, NOW.toISOString());
  await store.upsertChat(ORG, {
    slug: 'chan_tashkent_afisha', kind: 'channel', title: 'Канал', members: 9000,
    online: null, activity: 'unknown', relevance: 0, rejectReason: 'not-a-group',
    source: 'tgchats',
  }, NOW.toISOString());
  // A different organisation must never leak into this one's table.
  await store.upsertChat('owner_000000000000000000000000', {
    slug: 'other_org_chat', kind: 'group', title: 'Чужой', members: 5000,
    online: 40, activity: 'live', relevance: 70, source: 'tgchats',
  }, NOW.toISOString());

  const visible = await store.listChats(ORG, {});
  assert.deepEqual(visible.map((c) => c.slug), ['good_chat_tashkent', 'small_chat_tashkent'],
    'rejected rows are hidden by default; the table is not a log');

  const withRejected = await store.listChats(ORG, { excludeRejected: false });
  assert.equal(withRejected.length, 4);

  assert.deepEqual(
    (await store.listChats(ORG, { kind: 'group', minMembers: 1000 })).map((c) => c.slug),
    ['good_chat_tashkent'],
  );
  assert.deepEqual(
    (await store.listChats(ORG, { minRelevance: 50 })).map((c) => c.slug),
    ['good_chat_tashkent'],
  );
  assert.deepEqual(
    (await store.listChats(ORG, { status: 'rejected' })).map((c) => c.slug),
    ['junk_chat_tashkent', 'chan_tashkent_afisha'],
  );

  const counts = await store.counts(ORG);
  assert.equal(counts.total, 4);
  assert.equal(counts.rejected, 2);
  assert.equal(counts.groups, 3);
  assert.equal(counts.writable, 0);

  const reasons = await store.rejectBreakdown(ORG);
  // Sorted here because both reasons occur once: `ORDER BY count DESC` has no
  // tiebreaker worth asserting on, and a test that depends on SQLite's rowid
  // order for equal counts is a test that will fail for no reason one day.
  assert.deepEqual(
    reasons.map((r) => ({ reason: r.reason, count: r.count })).sort((a, b) => a.reason.localeCompare(b.reason)),
    [
      { count: 1, reason: 'junk:казино' },
      { count: 1, reason: 'not-a-group' },
    ],
    'a rejection the operator cannot see the reason for is just a missing row',
  );
});

test('listStaleChats serves the oldest first so refresh cannot starve a row', async () => {
  const store = new SignalChatStore(db());
  const base = new Date('2026-08-01T00:00:00.000Z');
  await store.upsertChat(ORG, {
    slug: 'fresh_chat_tashkent', kind: 'group', title: 'A', members: 900,
    online: 9, activity: 'live', relevance: 40, source: 'tgchats',
    checkedAt: new Date('2026-09-03T00:00:00.000Z').toISOString(),
  }, base.toISOString());
  await store.upsertChat(ORG, {
    slug: 'stale_chat_tashkent', kind: 'group', title: 'B', members: 900,
    online: 9, activity: 'live', relevance: 40, source: 'tgchats',
    checkedAt: new Date('2026-08-02T00:00:00.000Z').toISOString(),
  }, base.toISOString());
  await store.upsertChat(ORG, {
    slug: 'never_chat_tashkent', kind: 'group', title: 'C', members: 900,
    online: 9, activity: 'live', relevance: 40, source: 'manual',
  }, base.toISOString());

  const stale = await store.listStaleChats(ORG, 2, new Date('2026-09-03T00:00:00.000Z').toISOString());
  assert.deepEqual(
    stale.map((c) => c.slug),
    ['never_chat_tashkent', 'stale_chat_tashkent'],
    'a row that was never checked is the stalest there is',
  );
});

test('chatsSchemaReady says no rather than throwing when 0059 is missing', async () => {
  // The migration is applied out of band, on a database the deploy token has
  // no rights to. Until it lands the API must show "not installed yet",
  // not a red toast.
  const empty = new SqliteD1();
  assert.equal(await chatsSchemaReady(empty), false);
  assert.equal(await chatsSchemaReady(db()), true);
});

test('harvest config and cooldown survive a round trip', async () => {
  const database = db();
  assert.deepEqual(await readChatHarvestConfig(database, ORG), DEFAULT_CHAT_HARVEST);

  await writeChatHarvestConfig(database, ORG, config({ minMembers: 400, topics: ['dev'] }), ORG);
  const stored = await readChatHarvestConfig(database, ORG);
  assert.equal(stored.minMembers, 400);
  assert.deepEqual(stored.topics, ['dev']);

  await writeChatHarvestCursor(database, ORG, { index: 5, query: 'ташкент', at: NOW.toISOString(), by: ORG });
  const status = chatHarvestStatusFromCursor(
    { index: 5, query: 'ташкент', at: NOW.toISOString(), by: ORG },
    new Date(NOW.getTime() + 10_000).getTime(),
    SIGNAL_CHAT_HARVEST_COOLDOWN_MS,
  );
  // The contract the UI actually consumes: `queued` plus an absolute instant,
  // never a remaining-milliseconds figure — a duration computed on the server
  // would be stale by the time it rendered.
  assert.equal(status.queued, true, 'ten seconds into a five-minute cooldown is still cooling');
  assert.equal(status.nextAvailableAt, new Date(NOW.getTime() + SIGNAL_CHAT_HARVEST_COOLDOWN_MS).toISOString());
  assert.equal(status.lastRequestedAt, NOW.toISOString());
});

/* ==================================================================== *
 * Crawler
 * ==================================================================== */

const env = { LEAD_RADAR_SIGNAL_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: ORG };

test('the topical catalogues lead, and the city ones follow', () => {
  const sources = chatHarvestSources(config());
  // A harvest cut short by a 429 or by the tick budget must have spent itself
  // on rooms that are about the operator's trade, not merely near it.
  //
  // Measured on 2026-09-03: the city directories answered the question "where
  // can I find clients for advertising and development" with 1 614 rooms, kept
  // 37, and twenty of those thirty-seven were bakeries, door workshops and
  // taxi dispatch — held up entirely by the words "заказ" and "buyurtma".
  // TGStat's category ratings are filed by topic by a human editor, which is
  // the one classification we did not have to guess at.
  assert.equal(sources[0]!.parser, 'tgstat', 'the source that answers the question goes first');
  assert.ok(sources[0]!.local);
  assert.equal(
    sources.filter((s) => s.parser === 'tgstat').length,
    TGSTAT_CATEGORIES.length,
    'every category we classify gets a slot',
  );
  assert.equal(
    sources.filter((s) => s.parser === 'telegid').length,
    TELEGID_CATALOGUES.length,
    'the city catalogues are still there, just not ahead of the topic',
  );
  assert.ok(sources.some((s) => s.parser === 'tgchats'), 'keyword queries still get a turn');

  // The lead sources carry the topic they classify, so a room that says
  // nothing about itself can still be confirmed by where it was filed.
  const tech = sources.find((s) => s.label === 'tgstat:tech');
  assert.equal(tech?.topic, 'it', 'tech rooms are filed as IT');
  assert.equal(sources.find((s) => s.label === 'tgstat:public')?.topic, null,
    'a category that is not about the trade confers nothing');
});

test('tgstat peers are read out of a ratings page without the bot links', () => {
  const peers = parseTgstatPeers(TGSTAT_RATINGS_HTML);
  assert.ok(peers.includes('tashkent_dev_chat'), 'a chat is a peer');
  assert.ok(peers.includes('uz_marketing'), 'so is one filed under marketing');
  assert.ok(!peers.includes('some_news_channel'),
    'a channel link is not read: the chats rating links 397 chats and 0 channels');
  assert.ok(!peers.some((p) => /bot$/i.test(p)), 'bots are not rooms: ' + peers.join(' '));
  assert.equal(peers.length, 2, 'exactly the rooms, deduplicated: ' + peers.join(' '));
});

test('a query that is itself a place confers geography; a topic query does not', () => {
  // Measured on a twelve-round live run: 50 of 133 rooms were rejected as
  // `no-geo`, and most of them had been found under "ташкент". The query is
  // the geography — refusing to use it is refusing to know what we asked for.
  const sources = chatHarvestSources(config({ topics: ['ads'] }));
  const byLabel = (label: string) => sources.find((s) => s.label === label);

  assert.equal(byLabel('tgchats:ташкент')?.local, true, 'a city word is a city');
  assert.equal(byLabel('tgchats:toshkent')?.local, true);
  assert.equal(byLabel('tgchats:узбекистан')?.local, true);
});

test('a topic query is not a source while the harvest is local-only', () => {
  // Thirteen topic queries were measured live: `маркетинг` 49 rooms, `дизайн`
  // 49, `dasturlash` 15, `frilans` 1 — and between 30 and 45 of every 50 came
  // back `no-geo`, because the directory indexes the Russian-speaking web.
  // Not one of the thirteen produced a room that survived `localOnly`.
  const local = chatHarvestSources(config({ topics: ['ads'] }));
  assert.equal(
    local.find((s) => s.label === 'tgchats:маркетинг'), undefined,
    'a query that cannot produce a local room does not get a slot in the rotation',
  );
  assert.ok(local.some((s) => s.label.startsWith('tgchats:city:')), 'the city pages stay');

  // Widening the search is the operator's call, and when they make it every
  // query comes back — still marked as carrying no geography.
  const worldwide = chatHarvestSources(config({ topics: ['ads'], localOnly: false }));
  const marketing = worldwide.find((s) => s.label === 'tgchats:маркетинг');
  assert.ok(marketing, 'turning localOnly off restores topic queries');
  assert.equal(marketing?.local, false,
    'a topic word is not a place: those pages are the Russian PR swamps this filter exists to exclude');
});

test('a confirmed room outranks a guess, whatever either scored', async () => {
  // The operator reads the table from the top down. The top of it has to be
  // the rooms that said what they are, not the rooms that used one word and
  // happened to be large.
  const database = db();
  const store = new SignalChatStore(database);
  const base = {
    kind: 'group' as const, members: 40_000, online: 400, activity: 'live' as const,
    canWrite: 'yes' as const, canWriteBasis: 'heuristic' as const, source: 'tgstat:tech',
  };
  await store.upsertChat(ORG, {
    ...base, slug: 'guess_room', title: 'Чат с сайтом', relevance: 48,
    confidence: 'tentative', topic: 'dev',
  }, NOW.toISOString());
  await store.upsertChat(ORG, {
    ...base, slug: 'studio_room', title: 'Веб-студия', relevance: 40,
    confidence: 'confirmed', topic: 'dev',
  }, NOW.toISOString());

  const rows = await store.listChats(ORG, {});
  assert.equal(rows[0]!.slug, 'studio_room',
    'a guess outranked a studio: ' + JSON.stringify(rows.map((r) => [r.slug, r.confidence, r.relevance])));
  assert.equal(rows[0]!.confidence, 'confirmed');
  assert.equal(rows[1]!.confidence, 'tentative');
});

test('confidence only ever rises across harvests', async () => {
  const database = db();
  const store = new SignalChatStore(database);
  const base = {
    kind: 'group' as const, members: 500, online: 20, activity: 'live' as const,
    source: 'manual',
  };
  await store.upsertChat(ORG, { ...base, slug: 'once_confirmed', confidence: 'confirmed', relevance: 60 }, NOW.toISOString());
  // A later pass that matched fewer words — the vocabulary changed, or the
  // room edited its description. Demoting it would silently rewrite a verdict
  // an earlier harvest already stood behind.
  await store.upsertChat(ORG, { ...base, slug: 'once_confirmed', confidence: 'tentative', relevance: 30 }, NOW.toISOString());
  assert.equal((await store.getChatBySlug(ORG, 'once_confirmed'))?.confidence, 'confirmed');

  await store.upsertChat(ORG, { ...base, slug: 'was_null', relevance: 20 }, NOW.toISOString());
  assert.equal((await store.getChatBySlug(ORG, 'was_null'))?.confidence, null);
});

test('the chats schema is not ready until the confidence column exists', async () => {
  // 0059 without 0060 is a table every upsert would fail against. Reporting
  // "not installed" is actionable; failing quietly on every tick is not.
  const partial = db(['0059_lead_radar_signal_chats.sql']);
  assert.equal(await chatsSchemaReady(partial), false,
    'a table without the column is not the schema the harvest writes');
  assert.equal(await chatsSchemaReady(db()), true);
});

test('two harvests do not share a report', async () => {
  // `EMPTY_REPORT` was a module constant, and `{ ...EMPTY_REPORT }` copied the
  // reference to its `sources` array. Every harvest in the lifetime of an
  // isolate pushed into the same one: the twelfth round of a live run claimed
  // credit for all eighty-six sources.
  const database = db();
  const page = '<div class="result-item "><a href="https://t.me/oneroom">r</a>'
    + '<span class="badge">900</span></div>';
  const deps = {
    fetchText: async (url: string) => (url.startsWith('https://t.me/s/')
      ? '<div class="tgme_page"><div class="tgme_page_title"><span>Маркетинг Ташкент</span></div>'
        + '<div class="tgme_page_description">smm и таргет</div>'
        + '<div class="tgme_page_extra">2 000 members, 40 online</div></div>'
      : page),
    sleep: async () => {},
  };
  const first = await runChatHarvest(env, database, NOW, deps, { manual: true, orgId: ORG });
  const second = await runChatHarvest(env, database, NOW, deps, { manual: true, orgId: ORG });
  assert.ok(second.sources.length <= CHAT_CRAWL_LIMITS.maxSourcesManual,
    `the second report inherited the first's: ${second.sources.length}`);
  assert.ok(first.sources.length <= CHAT_CRAWL_LIMITS.maxSourcesManual);
});

test('a harvest keeps the local rooms a catalogue promised and drops the Moscow ones', async () => {
  const database = db();
  const pages = new Map<string, string>([
    ['https://telegid.me/catalog/uzbekistan/tashkent', TELEGID_CONTAINER_BLOCKS.join('\n')],
  ]);
  // A Tashkent room that never types the word "Ташкент" — the catalogue it
  // came from is what makes it local — and a Moscow one that does nothing
  // but. Both are big, both are on-topic; only geography separates them.
  pages.set('https://t.me/s/med_tashkent_chat',
    '<div class="tgme_page"><div class="tgme_page_title"><span>Digital Uzbekistan</span></div>'
    + '<div class="tgme_page_description">маркетинг, таргет, smm. заказывают рекламу и сайты</div>'
    + '<div class="tgme_page_extra">3 200 members, 45 online</div></div>');
  pages.set('https://t.me/s/nukus_toshkent1',
    '<div class="tgme_page"><div class="tgme_page_title"><span>PR Москва</span></div>'
    + '<div class="tgme_page_description">реклама, маркетинг, продвижение</div>'
    + '<div class="tgme_page_extra">9 000 members, 300 online</div></div>');

  const report = await runChatHarvest(
    env, database, NOW,
    {
      fetchText: async (url) => pages.get(url) ?? null,
      sleep: async () => {},
    },
    { manual: true, orgId: ORG },
  );

  assert.equal(report.kept, 1, `report: ${JSON.stringify(report)}`);
  assert.equal(report.sources[0], 'telegid:tashkent');
  // The report collapses reasons to their class ("wrong-city", not
  // "wrong-city:москв"); the per-room detail lives on the row, where the
  // operator can read it next to the name it belongs to.
  assert.deepEqual(report.reasons, { 'wrong-city': 1 },
    'the Moscow room is the only rejection, and it says why');

  const chats = await new SignalChatStore(database).listChats(ORG, {});
  assert.deepEqual(chats.map((c) => c.slug), ['med_tashkent_chat']);
  assert.equal(chats[0]!.source, 'telegid:tashkent', 'a city catalogue is the provenance, not the keyword');
  assert.equal(chats[0]!.activity, 'live');
});

test('a manual harvest interleaves sources instead of spending the budget on one', async () => {
  const database = db();
  const big = Array.from({ length: 40 }, (_, i) =>
    `<div class="link-container"><a href="https://t.me/bigroom${String(i)}">r</a>`
    + '<div class="text-truncate link-container-title">Комната</div></div>').join('\n');
  const small = Array.from({ length: 4 }, (_, i) =>
    `<div class="result-item "><a href="https://t.me/smallroom${String(i)}">s</a>`
    + '<span class="badge">900</span></div>').join('\n');

  const seen: string[] = [];
  const report = await runChatHarvest(
    env, database, NOW,
    {
      fetchText: async (url) => {
        seen.push(url);
        if (url.includes('tgchats')) return small;
        if (url.includes('t.me/s/')) {
          return '<div class="tgme_page"><div class="tgme_page_title"><span>Реклама Ташкент</span></div>'
            + '<div class="tgme_page_description">маркетинг</div>'
            + '<div class="tgme_page_extra">1 000 members, 30 online</div></div>';
        }
        return big;
      },
      sleep: async () => {},
    },
    { manual: true, orgId: ORG, extraKeywords: ['маленький'] },
  );

  // The card budget is 24 and one catalogue alone holds 40 rooms. Without
  // round-robin every slot goes to the catalogue and the operator's own
  // keyword is never looked at.
  const slugs = (await new SignalChatStore(database).listChats(ORG, {})).map((c) => c.slug);
  assert.ok(
    slugs.some((s) => s.startsWith('smallroom')),
    'the keyword query contributed nothing: ' + JSON.stringify(slugs.slice(0, 6)),
  );
  assert.ok(slugs.some((s) => s.startsWith('bigroom')));
  assert.equal(report.cards, Math.min(CHAT_CRAWL_LIMITS.maxCardsManual, slugs.length));
  assert.ok(seen.length > 0);
});

test('a room already judged is not fetched again just to learn nothing', async () => {
  const database = db();
  const store = new SignalChatStore(database);
  await store.upsertChat(ORG, {
    slug: 'reklamazi', kind: 'group', title: 'уже смотрели', members: 10,
    online: 1, activity: 'slow', relevance: 5, source: 'manual',
  }, NOW.toISOString());

  const fetched: string[] = [];
  const report = await runChatHarvest(
    env, database, NOW,
    {
      fetchText: async (url) => {
        fetched.push(url);
        if (url.includes('tgchats')) return TGCHATS_RESULT_BLOCKS.join('\n');
        return url.endsWith('/reklamazi') ? null : GROUP_CARD_HTML;
      },
      sleep: async () => {},
    },
    { manual: true, orgId: ORG },
  );

  assert.ok(!fetched.includes('https://t.me/s/reklamazi'), 'known slugs are skipped before the fetch');
  assert.ok(report.cards > 0, 'the unknown ones were still fetched');
});

test('a harvest without the table reports skipped instead of throwing', async () => {
  const empty = new SqliteD1();
  const report = await runChatHarvest(env, empty, NOW, { fetchText: async () => null, sleep: async () => {} });
  assert.deepEqual(report.skipped, ['chats_schema_missing']);
});

test('a harvest for an organisation outside the allowlist does nothing at all', async () => {
  const report = await runChatHarvest(
    { LEAD_RADAR_SIGNAL_ENABLED: 'true', LEAD_RADAR_ALLOWED_ORGS: 'owner_cafebabecafebabecafebabe' },
    db(), NOW, { fetchText: async () => null, sleep: async () => {} },
    { orgId: ORG },
  );
  assert.deepEqual(report.skipped, ['org_not_allowed']);
  assert.equal(report.cards, 0);
});

test('a dead card is stored as unresolved, not silently dropped', async () => {
  const database = db();
  await runChatHarvest(
    env, database, NOW,
    {
      fetchText: async (url) => {
        if (url.includes('tgchats')) {
          return '<div class="result-item "><a href="https://t.me/ghostroom">ghost</a>'
            + '<span class="badge">900</span></div>';
        }
        return DEAD_CARD_HTML;
      },
      sleep: async () => {},
    },
    { manual: true, orgId: ORG },
  );
  const row = await new SignalChatStore(database).getChatBySlug(ORG, 'ghostroom');
  assert.equal(row?.kind, 'unknown');
  assert.equal(row?.rejectReason, 'unresolved');
  assert.equal(row?.status, 'rejected');
});

test('a harvest opens the rooms it already found before it buys new ones', async () => {
  // The backlog is the whole throughput story. A catalogue page names about
  // fifty rooms and one harvest opens about a dozen, so without a backlog the
  // other thirty-eight are thrown away and paid for again — another 2.2 s of
  // pacing to learn the same slugs.
  const database = db();
  await writeChatHarvestCursor(database, ORG, {
    index: 0,
    query: null,
    at: NOW.toISOString(),
    by: null,
    pending: [
      { slug: 'backlog_room_one', source: 'tgchats:city:Ташкент', local: true },
      { slug: 'backlog_room_two', source: 'tgchats:маркетинг' },
    ],
  });

  const fetched: string[] = [];
  const report = await runChatHarvest(
    env, database, NOW,
    {
      fetchText: async (url) => {
        fetched.push(url);
        // The catalogues would happily answer — thirty more rooms, another
        // 2.2 s of pacing apiece. A round whose card budget is already spoken
        // for must not buy them.
        if (url.includes('tgchats') || url.includes('telegid')) {
          return Array.from({ length: 30 }, (_, i) =>
            `<div class="result-item "><a href="https://t.me/newroom${String(i)}">q</a>`
            + '<span class="badge">900</span></div>').join('\n');
        }
        return '<div class="tgme_page"><div class="tgme_page_title"><span>Маркетинг Ташкент</span></div>'
          + '<div class="tgme_page_description">реклама, smm, таргет</div>'
          + '<div class="tgme_page_extra">2 000 members, 40 online</div></div>';
      },
      sleep: async () => {},
    },
    { manual: true, orgId: ORG, maxCards: 2 },
  );

  assert.equal(report.cards, 2, `report: ${JSON.stringify(report)}`);
  assert.equal(report.entries, 0, 'a round with rooms enough already buys no directories');
  assert.deepEqual(report.sources, [], 'and says so');
  assert.ok(
    report.skipped.some((entry) => entry.startsWith('backlog_first')),
    `the skip is recorded: ${JSON.stringify(report.skipped)}`,
  );
  assert.equal(
    report.nextIndex, 0,
    'nothing was consumed from the rotation, so there is nothing to advance past',
  );
  assert.ok(
    fetched.includes('https://t.me/s/backlog_room_one'),
    'a room found last week is still worth opening this week',
  );
  const chats = await new SignalChatStore(database).listChats(ORG, {});
  assert.deepEqual(chats.map((c) => c.slug).sort(), ['backlog_room_one', 'backlog_room_two']);
});

test('rooms the budget could not open are carried into the next harvest', async () => {
  const database = db();
  const many = Array.from({ length: 30 }, (_, i) =>
    `<div class="result-item "><a href="https://t.me/queueroom${String(i)}">q</a>`
    + '<span class="badge">900</span></div>').join('\n');

  // Two cards per harvest, thirty rooms waiting. Whatever is not opened must
  // survive, or a slow catalogue is a catalogue that never gets read.
  const fetchText = async (url: string) => {
    if (url.includes('tgchats')) return many;
    return '<div class="tgme_page"><div class="tgme_page_title"><span>Чат Ташкент</span></div>'
      + '<div class="tgme_page_description">объявления</div>'
      + '<div class="tgme_page_extra">900 members, 9 online</div></div>';
  };

  const first = await runChatHarvest(
    { ...env, LEAD_RADAR_SIGNAL_ENABLED: 'true' }, database, NOW,
    { fetchText, sleep: async () => {} },
    { manual: true, orgId: ORG, maxCards: 2 },
  );
  assert.ok(first.pending > 0, `nothing was carried: ${JSON.stringify(first)}`);
  assert.equal(first.cards, 2);

  const cursor = await readChatHarvestCursor(database, ORG);
  assert.ok((cursor?.pending.length ?? 0) > 0, 'the cursor is where the backlog lives');
  // The rotation moves past the directories this round actually spent. Their
  // rooms are in the backlog now, and re-reading page four next tick would
  // name the same thirty slugs we are already carrying. Freezing here instead
  // is how the live harvest starved: `next=0` for fourteen rounds, four of
  // eighty-six sources ever visited.
  assert.ok(first.sources.length > 0, `directories were bought: ${JSON.stringify(first.sources)}`);
  const rotation = chatHarvestSources(await readChatHarvestConfig(database, ORG)).length;
  assert.equal(
    cursor?.index, first.sources.length % rotation,
    'the rotation advances by exactly what it consumed',
  );

  const slugsFirst = new Set((cursor?.pending ?? []).map((item) => item.slug));
  const second = await runChatHarvest(
    env, database, NOW, { fetchText, sleep: async () => {} },
    { manual: true, orgId: ORG },
  );
  assert.ok(second.cards > 2, 'the second harvest picked up where the first stopped');
  assert.ok(
    [...slugsFirst].every((slug) => !second.sources.includes(slug)),
    'the backlog is rooms, not sources',
  );
});

/* ==================================================================== *
 * Queue contract
 * ==================================================================== */

test('the harvest queue message validates its own envelope', () => {
  const message = signalChatHarvestQueueMessage({
    orgId: ORG, requestedBy: ORG, requestedAt: NOW.toISOString(), keywords: ['лендинг', 'сайт'],
  });
  assert.equal(message.schema, SIGNAL_CHAT_QUEUE_SCHEMA);
  const parsed = parseSignalChatHarvestQueueMessage(message);
  assert.ok(parsed);
  assert.equal(parsed!.org_id, ORG);
  assert.deepEqual(parsed!.keywords, ['лендинг', 'сайт']);

  assert.equal(parseSignalChatHarvestQueueMessage({ ...message, schema: 'gptbot.signal-radar.chats.v2' }), null,
    'a schema we do not speak is not a message we may guess at');
  assert.equal(parseSignalChatHarvestQueueMessage({ ...message, org_id: 'nope' }), null,
    'an envelope that does not name an organisation cannot be scoped to one');
  assert.equal(parseSignalChatHarvestQueueMessage({ ...message, keywords: 'сайт' }), null);

  // Keywords are clamped, not rejected. One keyword typed sixty-one characters
  // long costs one query, and throwing the whole message away over it would
  // cost the operator the harvest they asked for. The limits are the same ones
  // `normalizeChatHarvest` applies at the UI, so this is a second gate on a
  // door that is already shut, not the door itself.
  const clamped = parseSignalChatHarvestQueueMessage({ ...message, keywords: ['x'.repeat(61)] });
  assert.deepEqual(clamped!.keywords, ['x'.repeat(60)]);
  const many = parseSignalChatHarvestQueueMessage({
    ...message, keywords: Array.from({ length: 41 }, () => 'a'),
  });
  assert.equal(many!.keywords.length, 40);
});
