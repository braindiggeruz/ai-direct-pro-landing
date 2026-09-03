import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decodeHtmlEntities,
  detectSignalLanguage,
  extractTelegramSlugs,
  htmlToText,
  parseCounterValue,
  parseTelegramPreview,
  parseTgstatEntities,
  scoreSignalTarget,
  SIGNAL_DISCOVERY_SOURCES,
  type TelegramPreview,
} from '../functions/platform/lead-radar/signal-discovery';

/**
 * The HTML under tests/fixtures/signal-radar was cut from live responses on
 * 2026-09-02. It is not hand-written: parser changes must keep it green, and a
 * markup change upstream shows up here first.
 */
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/signal-radar/${name}`, import.meta.url), 'utf8');
}

const SLUG_RE = /^[A-Za-z0-9_]{5,32}$/;

test('parses a live Uzbek channel preview', () => {
  const preview = parseTelegramPreview(fixture('fx-channel.html'), 'Toshkent_Ish');
  assert.equal(preview.shape, 'channel');
  assert.equal(preview.kind, 'channel');
  assert.equal(preview.indexable, true);
  assert.equal(preview.title, 'TOSHKENT ISH | Rasmiy kanal');
  assert.equal(preview.members, 4900);
  assert.match(preview.about, /Ijtimoiy tarmoqlarda/);
  assert.equal(preview.messages.length, 3);

  const [first] = preview.messages;
  assert.equal(first.externalId, 'Toshkent_ish/13016');
  assert.equal(first.occurredAt, '2026-08-24T15:16:42+00:00');
  assert.equal(first.author, 'TOSHKENT ISH | Rasmiy kanal');
  assert.match(first.text, /^#mulohaza/);
  for (const message of preview.messages) {
    assert.equal(message.text.includes('<'), false, 'message text must be tag-free');
    assert.equal(message.text.includes('&'), false, 'message text must be entity-free');
  }
});

test('a second channel fixture keeps the same contract', () => {
  const preview = parseTelegramPreview(fixture('fx-channel2.html'), 'ish_toshkent');
  assert.equal(preview.shape, 'channel');
  assert.equal(preview.kind, 'channel');
  assert.ok((preview.members ?? 0) > 0);
  assert.ok(preview.messages.length >= 2);
});

test('honours noindex: an unavailable page yields nothing', () => {
  const preview = parseTelegramPreview(fixture('fx-dead.html'), 'digitalcapitalpro');
  assert.equal(preview.indexable, false);
  assert.equal(preview.shape, 'dead');
  assert.equal(preview.title, '');
  assert.deepEqual(preview.messages, []);
  assert.deepEqual(preview.linkedSlugs, []);
});

test('a public group has no web preview, and we say so instead of guessing', () => {
  const preview = parseTelegramPreview(fixture('fx-page.html'), 'freetekn0');
  assert.equal(preview.shape, 'page');
  assert.equal(preview.kind, 'unknown');
  assert.equal(preview.members, null);
  assert.deepEqual(preview.messages, []);
  assert.equal(preview.indexable, true);
});

test('counter values: suffixes, separators, garbage', () => {
  assert.equal(parseCounterValue('10.9M'), 10_900_000);
  assert.equal(parseCounterValue('66.3K'), 66_300);
  assert.equal(parseCounterValue('4.9K'), 4_900);
  assert.equal(parseCounterValue('1 234'), 1234);
  assert.equal(parseCounterValue('873'), 873);
  assert.equal(parseCounterValue('abc'), null);
  assert.equal(parseCounterValue(''), null);
});

test('tgstat country pages yield both groups and channels', () => {
  const entities = parseTgstatEntities(fixture('fx-tgstat.html'));
  assert.ok(entities.length >= 6, `expected several entities, got ${entities.length}`);
  const groups = entities.filter((entity) => entity.kind === 'group');
  const channels = entities.filter((entity) => entity.kind === 'channel');
  assert.ok(groups.length >= 4, 'groups must be recognised');
  assert.ok(channels.length >= 2, 'channels must be recognised');
  for (const entity of entities) {
    assert.match(entity.slug, SLUG_RE, `bad slug: ${entity.slug}`);
  }
});

test('tgstat parsing de-duplicates repeated links', () => {
  const html = '<a href="/chat/@uzb_dev">a</a><a href="/chat/@uzb_dev">b</a>';
  assert.deepEqual(parseTgstatEntities(html), [{ slug: 'uzb_dev', kind: 'group' }]);
});

test('discovery sources point at the country subdomain', () => {
  assert.equal(SIGNAL_DISCOVERY_SOURCES.tgstatChats(), 'https://uz.tgstat.com/ratings/chats');
  assert.equal(SIGNAL_DISCOVERY_SOURCES.tgstatChannels(), 'https://uz.tgstat.com/ratings/channels');
  assert.equal(SIGNAL_DISCOVERY_SOURCES.tgstatChats('ru'), 'https://ru.tgstat.com/ratings/chats');
});

test('linked slugs skip self-references and non-entity paths', () => {
  const html = [
    'https://t.me/uzb_dev',
    'https://t.me/share/url?url=x',
    'https://t.me/joinchat/AAAAAEHbEkejzxUjAUCfYg',
    'https://t.me/login',
    'https://t.me/proxy?server=1',
    'https://t.me/tashkent_work',
  ].join(' ');
  const slugs = extractTelegramSlugs(html, 'uzb_dev');
  assert.deepEqual(slugs, ['tashkent_work']);
});

test('language gate separates the scripts we support', () => {
  assert.equal(detectSignalLanguage('Привет, нужен бот для записи клиентов, срочно'), 'ru');
  assert.equal(detectSignalLanguage('Salom, menga sayt kerak, Telegram uchun bot qilish kerak'), 'uz');
  assert.equal(detectSignalLanguage('Hello, we need a website for our company, please contact us'), 'en');
  assert.equal(detectSignalLanguage('مرحبا بالعالم هذا اختبار'), 'other');
  assert.equal(detectSignalLanguage(''), 'other');
  assert.equal(detectSignalLanguage('12345 !!! ???'), 'other');
});

test('htmlToText normalises breaks and entities', () => {
  assert.equal(htmlToText('a<br/>b<br />c'), 'a\nb\nc');
  assert.equal(htmlToText('Tom &amp; Jerry &quot;quote&quot;'), 'Tom & Jerry "quote"');
  assert.equal(htmlToText('&lt;script&gt;'), '<script>');
  assert.equal(htmlToText('<div class="x">  spaced   out  </div>'), 'spaced out');
});

test('decodeHtmlEntities handles numeric and named forms', () => {
  assert.equal(decodeHtmlEntities('&#33;'), '!');
  assert.equal(decodeHtmlEntities('&#x21;'), '!');
  assert.equal(decodeHtmlEntities('&amp;amp;'), '&amp;');
  assert.equal(decodeHtmlEntities('&#999999999;'), '');
});

test('scores a real channel without inventing leads', () => {
  const preview = parseTelegramPreview(fixture('fx-channel.html'), 'Toshkent_Ish');
  const assessment = scoreSignalTarget(preview);
  assert.equal(assessment.language, 'uz');
  assert.equal(assessment.leadCount, 0, 'job vacancies are not demand for digital services');
  assert.ok(assessment.score > 0 && assessment.score <= 100);
  assert.ok(assessment.reasons.includes('lang:uz'));
  assert.ok(assessment.reasons.includes('members:4900'));
  assert.equal(assessment.posts.length, preview.messages.length);
});

function previewWith(messages: Array<{ id: string; text: string; at?: string }>): TelegramPreview {
  return {
    slug: 'uzb_dev',
    shape: 'channel',
    kind: 'channel',
    title: 'UZB dev',
    about: 'Dasturchilar guruhi',
    members: 3200,
    messages: messages.map((message) => ({
      externalId: message.id,
      occurredAt: message.at ?? null,
      author: 'Alisher',
      text: message.text,
    })),
    linkedSlugs: [],
    indexable: true,
  };
}

test('a channel with real demand scores higher than one without', () => {
  const quiet = scoreSignalTarget(previewWith([{ id: 'a/1', text: 'Salom, hammaga yaxshi kun' }]));
  const loud = scoreSignalTarget(previewWith([
    { id: 'a/1', text: 'Menga Telegram bot kerak, mijozlar uchun. Kim qila oladi?' },
    { id: 'a/2', text: 'Sayt kerak, landing qilish kerak, narxi qancha?' },
  ]));
  assert.equal(quiet.leadCount, 0);
  assert.ok(loud.leadCount >= 2, `expected leads, got ${loud.leadCount}`);
  assert.ok(loud.score > quiet.score, `${loud.score} should beat ${quiet.score}`);
  assert.ok(loud.services.includes('bots'));
  assert.ok(loud.services.includes('sites'));
});

test('freshness is rewarded, staleness is not', () => {
  const now = Date.parse('2026-09-02T12:00:00Z');
  const recent = scoreSignalTarget(
    previewWith([{ id: 'a/1', text: 'Salom', at: '2026-09-02T06:00:00Z' }]),
    { now },
  );
  const ancient = scoreSignalTarget(
    previewWith([{ id: 'a/1', text: 'Salom', at: '2025-01-01T06:00:00Z' }]),
    { now },
  );
  assert.ok(recent.reasons.includes('fresh:1d'));
  assert.ok(!ancient.reasons.includes('fresh:1d'));
  assert.ok(recent.score > ancient.score);
});

test('member count moves the score in steps, never above the cap', () => {
  const scores = [0, 150, 700, 3000, 50000].map((members) => {
    const preview = { ...previewWith([{ id: 'a/1', text: 'Salom' }]), members };
    return scoreSignalTarget(preview).score;
  });
  for (const score of scores) assert.ok(score <= 100 && score >= 0);
  assert.ok(scores[4] > scores[3] && scores[3] > scores[2] && scores[2] > scores[1]);
});

test('groups are marked as requiring a join', () => {
  const assessment = scoreSignalTarget({
    ...previewWith([{ id: 'a/1', text: 'Salom' }]),
    kind: 'group',
    shape: 'page',
    members: null,
  });
  assert.ok(assessment.reasons.includes('needs:join'));
});

test('a noindex page is flagged and never scored as a candidate', () => {
  const assessment = scoreSignalTarget({
    ...previewWith([{ id: 'a/1', text: 'Salom' }]),
    indexable: false,
  });
  assert.ok(assessment.reasons.includes('noindex'));
});

test('empty preview is safe end to end', () => {
  const assessment = scoreSignalTarget({
    slug: 'x', shape: 'dead', kind: 'unknown', title: '', about: '',
    members: null, messages: [], linkedSlugs: [], indexable: false,
  });
  assert.equal(assessment.score, 0);
  assert.equal(assessment.language, 'other');
  assert.deepEqual(assessment.posts, []);
});

// ---------------------------------------------------------------------------
// Size is not the same thing as usefulness.
//
// Every channel the radar promoted on its first day was a broadcast with half
// a million subscribers: two news feeds, a militia feed, a job board, a car
// marketplace and a football channel. One author each, 228 posts between
// them, one recruitment advert out. Ranking by size selects for exactly the
// shape that cannot contain a request.
// ---------------------------------------------------------------------------

const CHATTER = 'Salom, hammaga yaxshi kun';
const REQUEST = 'Salom, menga sayt kerak, yordam bera olasizmi?';

function previewFrom(authors: string[], members: number, text = CHATTER): TelegramPreview {
  return {
    slug: 'uzb_room',
    shape: 'channel',
    kind: 'channel',
    title: 'UZB room',
    about: 'Dasturchilar guruhi',
    members,
    messages: authors.map((author, index) => ({
      externalId: `a/${index + 1}`,
      occurredAt: null,
      author,
      text,
    })),
    linkedSlugs: [],
    indexable: true,
  };
}

const NEWS = ['News Desk', 'News Desk', 'News Desk', 'News Desk'];
const CROWD = ['Alisher', 'Dilnoza', 'Jasur', 'Madina'];

test('a large broadcast is not a source, whatever its counter says', () => {
  const broadcast = scoreSignalTarget(previewFrom(NEWS, 500_000));
  assert.ok(broadcast.reasons.includes('broadcast'), broadcast.reasons.join(','));
  // Half a million listeners and not one of them able to post: this is the
  // exact shape that filled the first day with 228 posts and nothing to show.
  assert.ok(broadcast.score < 40, `expected below the promote bar, got ${broadcast.score}`);
});

test('a room with four voices beats a broadcast with a thousand times the reach', () => {
  const crowd = scoreSignalTarget(previewFrom(CROWD, 500));
  const broadcast = scoreSignalTarget(previewFrom(NEWS, 500_000));
  assert.ok(crowd.reasons.some((reason) => reason.startsWith('voices:')), crowd.reasons.join(','));
  assert.ok(crowd.score > broadcast.score, `${crowd.score} should beat ${broadcast.score}`);
  assert.ok(crowd.score >= 40, `a room full of strangers should be watched, got ${crowd.score}`);
});

test('a notice board survives the broadcast penalty when it carries requests', () => {
  // Not every broadcast is useless. Half the service requests in this region
  // are posted to an announcement channel by its admin on somebody's behalf,
  // so the penalty has to hurt without being fatal.
  const board = scoreSignalTarget(previewFrom(NEWS, 500_000, REQUEST));
  assert.ok(board.reasons.includes('broadcast'), board.reasons.join(','));
  assert.ok(board.score >= 40, `a board full of requests must still be watched, got ${board.score}`);
});

test('a two-post sample is too small to call a broadcast', () => {
  // Below three messages a single author is a coincidence, not a shape.
  const short = scoreSignalTarget(previewFrom(['Alisher', 'Alisher'], 500_000));
  assert.equal(short.reasons.includes('broadcast'), false, short.reasons.join(','));
});
