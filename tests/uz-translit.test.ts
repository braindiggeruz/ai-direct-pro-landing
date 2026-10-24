// The Uzbek Cyrillic ↔ Latin converter on the translator pages
// (src/shared/uz-translit.ts): deterministic rules, site apostrophes
// (o‘ g‘ = U+2018, tutuq = U+2019), no model call.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UZ_LETTER_MARK,
  UZ_TUTUQ,
  detectScript,
  normalizeLatin,
  scriptNotes,
  toCyrillic,
  toLatin,
} from '../src/shared/uz-translit';

const Q = UZ_LETTER_MARK; // ‘
const T = UZ_TUTUQ; // ’

/** [Cyrillic, Latin] pairs that must convert both ways. */
const ROUND_TRIP: Array<[string, string]> = [
  ['Тошкент', 'Toshkent'],
  ['ўзбек', `o${Q}zbek`],
  ['Ўзбекистон', `O${Q}zbekiston`],
  ['ЎЗБЕКИСТОН', `O${Q}ZBEKISTON`],
  ['ғалаба', `g${Q}alaba`],
  ['Ғалаба', `G${Q}alaba`],
  ['ўғил', `o${Q}g${Q}il`],
  ['шаҳар', 'shahar'],
  ['Шаҳар', 'Shahar'],
  ['ШАҲАР', 'SHAHAR'],
  ['чой', 'choy'],
  ['Чой', 'Choy'],
  ['ер', 'yer'],
  ['Ер', 'Yer'],
  ['кел', 'kel'],
  ['поезд', 'poyezd'],
  ['поэзия', 'poeziya'],
  ['эшик', 'eshik'],
  ['Эркин', 'Erkin'],
  ['ёз', 'yoz'],
  ['ЁШЛАР', 'YOSHLAR'],
  ['юрак', 'yurak'],
  ['Юрак', 'Yurak'],
  ['ярим', 'yarim'],
  ['маъно', `ma${T}no`],
  ['санъат', `san${T}at`],
  ['эълон', `e${T}lon`],
  ['съезд', `s${T}yezd`],
  ['Исҳоқ', `Is${T}hoq`],
  ['қўшиқ', `qo${Q}shiq`],
  ['ҳаво', 'havo'],
  ['хабар', 'xabar'],
  ['кўнгил', `ko${Q}ngil`],
  ['йўл', `yo${Q}l`],
  ['Йўқ', `Yo${Q}q`],
  ['актёр', 'aktyor'],
];

for (const [cyr, lat] of ROUND_TRIP) {
  test(`cyrillic → latin: ${cyr} → ${lat}`, () => assert.equal(toLatin(cyr), lat));
  test(`latin → cyrillic: ${lat} → ${cyr}`, () => assert.equal(toCyrillic(lat), cyr));
}

test('ц is s at the start of a word and after a consonant, ts after a vowel', () => {
  assert.equal(toLatin('цирк'), 'sirk');
  assert.equal(toLatin('концерт'), 'konsert');
  assert.equal(toLatin('милиция'), 'militsiya');
  assert.equal(toLatin('ЦИРК'), 'SIRK');
  assert.equal(toLatin('ЛИЦЕЙ'), 'LITSEY');
});

test('ц does not come back: Latin ts and s stay тс and с (documented ambiguity)', () => {
  assert.equal(toCyrillic('militsiya'), 'милитсия');
  assert.equal(toCyrillic('sirk'), 'сирк');
  assert.equal(toCyrillic('tong'), 'тонг');
});

test('ъ after ў is not written twice: мўъжиза → mo‘jiza', () => {
  assert.equal(toLatin('мўъжиза'), `mo${Q}jiza`);
});

test('ь is dropped, and е after it is ye', () => {
  assert.equal(toLatin('премьер'), 'premyer');
  assert.equal(toLatin('ПРЕМЬЕР'), 'PREMYER');
});

test('a single capital becomes a capitalised digraph; beside capitals, all capitals', () => {
  assert.equal(toLatin('Ш'), 'Sh');
  assert.equal(toLatin('Ёш'), 'Yosh');
  assert.equal(toLatin('КЕЧ'), 'KECH');
  assert.equal(toLatin('ТОШКЕНТ ШАҲРИ'), 'TOSHKENT SHAHRI');
  assert.equal(toLatin('Шаҳар ЧОРСУ'), 'Shahar CHORSU');
});

test('Latin capitals: a digraph takes the case of its first letter', () => {
  assert.equal(toCyrillic('Shahar'), 'Шаҳар');
  assert.equal(toCyrillic('SHAHAR'), 'ШАҲАР');
  assert.equal(toCyrillic(`O${Q}ZBEKISTON`), 'ЎЗБЕКИСТОН');
  assert.equal(toCyrillic('Yetti'), 'Етти');
  assert.equal(toCyrillic('YER'), 'ЕР');
});

test('every common apostrophe makes o‘ and g‘', () => {
  for (const mark of ["'", '‘', '’', 'ʻ', 'ʼ', '`', '´']) {
    assert.equal(toCyrillic(`o${mark}zbek`), 'ўзбек', `o + U+${mark.codePointAt(0)?.toString(16)}`);
    assert.equal(toCyrillic(`g${mark}alaba`), 'ғалаба', `g + U+${mark.codePointAt(0)?.toString(16)}`);
    assert.equal(toCyrillic(`ma${mark}no`), 'маъно', `tutuq U+${mark.codePointAt(0)?.toString(16)}`);
  }
});

test('word boundaries: e is э at the start of every word, е inside', () => {
  assert.equal(toCyrillic('Erkin esa keldi'), 'Эркин эса келди');
  assert.equal(toLatin('Эркин эса келди'), 'Erkin esa keldi');
  assert.equal(toLatin('Мен ер ва сен'), 'Men yer va sen');
});

test('quotes are not letters: a quoted word keeps its quotes', () => {
  assert.equal(toCyrillic("'kino'"), "'кино'");
  assert.equal(toCyrillic('’Erkin’'), '’Эркин’');
  assert.equal(toLatin('«Ассалому алайкум»'), '«Assalomu alaykum»');
});

test('punctuation, numbers and line breaks pass through unchanged', () => {
  assert.equal(toLatin('Мен 2026 йилда 15 ёшдаман.'), 'Men 2026 yilda 15 yoshdaman.');
  assert.equal(toCyrillic('Men 2026 yilda 15 yoshdaman.'), 'Мен 2026 йилда 15 ёшдаман.');
  assert.equal(toLatin('Салом, дунё!\nНархи: 20 000 сўм (QQS).'), `Salom, dunyo!\nNarxi: 20 000 so${Q}m (QQS).`);
  assert.equal(toCyrillic('2026-yil, 3-band; +998 50 587-07-20'), '2026-йил, 3-банд; +998 50 587-07-20');
});

test('text in the other script passes through', () => {
  assert.equal(toLatin('GPTBot.uz — сайт'), 'GPTBot.uz — sayt');
  assert.equal(toCyrillic('Привет, dunyo'), 'Привет, дунё');
});

test('Russian-only letters: щ → sh, ы → i, and the page is told', () => {
  assert.equal(toLatin('ящик'), 'yashik');
  assert.equal(toLatin('Рыбаков'), 'Ribakov');
  assert.equal(toLatin('ЩИ'), 'SHI');
  assert.deepEqual(scriptNotes('ящик', 'latin'), ['russian-letters']);
  assert.deepEqual(scriptNotes('Тошкент', 'latin'), []);
});

test('c and w are not Uzbek letters: they stay Latin, and the page is told', () => {
  assert.equal(toCyrillic('Coca-Cola va WhatsApp'), 'Cоcа-Cола ва WҳатсАпп');
  assert.deepEqual(scriptNotes('Coca-Cola', 'cyrillic'), ['foreign-latin']);
  assert.deepEqual(scriptNotes('choy ichamiz', 'cyrillic'), []);
});

test('yo before o‘ is й + ў, not ё', () => {
  assert.equal(toCyrillic("yo'q"), 'йўқ');
  assert.equal(toCyrillic(`Yo${Q}ldosh`), 'Йўлдош');
  assert.equal(toCyrillic("yo'"), "ё'");
});

test('normalizeLatin writes the site apostrophes and nothing else', () => {
  assert.equal(normalizeLatin("O'zbekiston bog'i ma'no"), `O${Q}zbekiston bog${Q}i ma${T}no`);
  assert.equal(normalizeLatin('oʻgʻil'), `o${Q}g${Q}il`);
  assert.equal(normalizeLatin("Is'hoq 'kino'"), `Is${T}hoq 'kino'`);
  assert.equal(normalizeLatin('Toshkent'), 'Toshkent');
});

test('the output never contains an ASCII apostrophe, U+02BB or U+02BC', () => {
  const latin = toLatin('Ўзбекистон, ғалаба, маъно, мўъжиза, Исҳоқ, съезд, қўшиқ');
  assert.doesNotMatch(latin, /['ʻʼ`]/);
  assert.match(latin, new RegExp(Q));
  assert.match(latin, new RegExp(T));
});

test('detectScript picks the script most letters are in', () => {
  assert.equal(detectScript('Тошкент шаҳри'), 'cyrillic');
  assert.equal(detectScript(`Toshkent shahri, o${Q}zbek`), 'latin');
  assert.equal(detectScript('2026 — 15%'), 'none');
});

test('empty input stays empty', () => {
  assert.equal(toLatin(''), '');
  assert.equal(toCyrillic(''), '');
  assert.equal(normalizeLatin(''), '');
});
