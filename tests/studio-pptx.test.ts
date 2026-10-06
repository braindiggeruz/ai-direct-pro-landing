// The .pptx the studio builds in the browser (STUDIO-SPEC §7.6, §14.1):
// font sizes chosen from the length of the text, at most 4 bullets on a
// layout with a picture, the AI label, the talk in the notes, and a file
// that unzips into a real presentation.
//
// pptxgenjs and jszip are the studio's own dependencies
// (apps/studio/node_modules, installed by `npm --prefix apps/studio ci`, which
// build:studio runs); the build module imports pptxgenjs lazily, exactly as
// the browser does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import type { Deck, DeckSlide } from '../apps/studio/src/api';
import {
  AI_LABEL,
  AI_LABEL_COMPANY,
  PPTX_MIME,
  TEXT_LANG,
  blobToBase64,
  buildDeck,
  deckFileName,
  planSlides,
  topicSlug,
} from '../apps/studio/src/pptx/build';
import { BODY_SIZES, bulletsHeight, fitBullets, fitTitle, wrappedLines } from '../apps/studio/src/pptx/fit';
import { LAYOUTS, MAX_BULLETS_WITH_PICTURE, PICTURE_LAYOUTS, chooseLayouts, splitBullets } from '../apps/studio/src/pptx/layouts';
import { PALETTES, contrast, paletteFor } from '../apps/studio/src/pptx/palettes';

const ROOT = path.resolve(import.meta.dirname, '..');
const studioRequire = createRequire(path.join(ROOT, 'apps/studio/package.json'));

interface Zip {
  files: Record<string, unknown>;
  file(name: string): { async(type: 'string' | 'nodebuffer'): Promise<string | Buffer> } | null;
}
const JSZip = (() => {
  try {
    return studioRequire('jszip') as { loadAsync(data: Buffer): Promise<Zip> };
  } catch {
    throw new Error('apps/studio/node_modules is missing: run `npm --prefix apps/studio ci` first.');
  }
})();

interface FixtureDeck {
  id: string;
  lang: 'uz' | 'ru';
  topic: string;
  outline: { title: string; subtitle: string };
  parts: { slides: { index: number; title: string; bullets: string[]; notes: string }[] }[];
}
interface FixtureFree {
  id: string;
  lang: 'uz' | 'ru';
  topic: string;
  deck: { title: string; subtitle: string; slides: { title: string; bullets: string[] }[] };
}
const MEASURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/studio/measure30.json'), 'utf8')) as {
  decks: FixtureDeck[];
  free: FixtureFree[];
};

/** The 30 full decks of the T0.1 run as the API hands them to the island (with talk notes). */
const fullDecks = (): { id: string; locale: 'uz' | 'ru'; deck: Deck }[] =>
  MEASURE.decks.map((entry) => ({
    id: entry.id,
    locale: entry.lang,
    deck: {
      title: entry.outline.title,
      subtitle: entry.outline.subtitle,
      slides: entry.parts.flatMap((part) => part.slides).map((slide) => ({ ...slide, layout: 'title-bullets' as const })),
    },
  }));

/** The free decks of the run, as the free /slides answers them (no notes). */
const freeDecks = (): { id: string; locale: 'uz' | 'ru'; deck: Deck }[] =>
  MEASURE.free.map((entry) => ({
    id: entry.id,
    locale: entry.lang,
    deck: {
      title: entry.deck.title,
      subtitle: entry.deck.subtitle,
      slides: entry.deck.slides.map((slide, i) => ({ index: i + 1, title: slide.title, bullets: slide.bullets, layout: 'title-bullets' as const })),
    },
  }));

/** Stand-in picture bytes: pptxgenjs copies them into ppt/media without decoding. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const JPEG_BASE64 = JPEG.toString('base64');

const slide = (index: number, bullets: string[], title = `Slayd ${index}`): DeckSlide => ({ index, title, bullets, layout: 'title-bullets' });

async function unzip(blob: Blob): Promise<Zip> {
  return JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
}

async function text(zip: Zip, name: string): Promise<string> {
  const file = zip.file(name);
  assert.ok(file, `${name} is in the archive`);
  return (await file.async('string')) as string;
}

const slideNames = (zip: Zip) =>
  Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));

// --- font size by length --------------------------------------------------------

test('fit: words wrap at word boundaries, and a word longer than a line breaks', () => {
  assert.equal(wrappedLines('', 20, 200), 1);
  assert.equal(wrappedLines('abc def', 10, 1000), 1);
  // 10 pt × 0.55 = 5.5 pt a character: 200 pt hold 36 characters.
  assert.equal(wrappedLines('a'.repeat(36), 10, 200), 1);
  assert.equal(wrappedLines('a'.repeat(37), 10, 200), 2);
  assert.equal(wrappedLines(`${'a'.repeat(30)} ${'b'.repeat(10)}`, 10, 200), 2);
  assert.equal(wrappedLines('a'.repeat(100), 10, 200), 3);
});

test('fit: longer text never gets a larger size; short text gets the largest', () => {
  const box = LAYOUTS['title-bullets'].body[0];
  assert.equal(fitBullets(['Qisqa', 'Matn'], box).size, BODY_SIZES.max);
  let previous = Infinity;
  for (let length = 20; length <= 110; length += 10) {
    const size = fitBullets(Array.from({ length: 5 }, () => 'x'.repeat(length - 1) + '.'), box).size;
    assert.ok(size <= previous, `${length} characters: ${size} pt after ${previous} pt`);
    previous = size;
  }
});

test('fit: five bullets of 110 characters land near the spec\'s 16 pt, and still fit', () => {
  const words = (n: number) => Array.from({ length: 200 }, (_, i) => ['taqdimot', 'slayd', 'mavzu', 'o‘quvchi', 'tarix'][i % 5]).join(' ').slice(0, n).trim();
  const bullets = Array.from({ length: 5 }, () => words(110));
  const wide = fitBullets(bullets, LAYOUTS['title-bullets'].body[0]);
  assert.ok(wide.fits && wide.size >= 14 && wide.size <= 18, `title-bullets: ${wide.size} pt`);
  const narrow = fitBullets(bullets.slice(0, MAX_BULLETS_WITH_PICTURE), LAYOUTS['image-right'].body[0]);
  assert.ok(narrow.fits && narrow.size >= 12 && narrow.size <= wide.size, `image-right: ${narrow.size} pt`);
  // The estimate the size came from really is inside the box.
  const width = LAYOUTS['title-bullets'].body[0].w * 72 - 14.4;
  assert.ok(bulletsHeight(bullets, wide.size, width) <= LAYOUTS['title-bullets'].body[0].h * 72 - 7.2);
  assert.ok(bulletsHeight(bullets, wide.size + 1, width) > LAYOUTS['title-bullets'].body[0].h * 72 - 7.2, 'one point more would overflow');
});

test('fit: titles take at most two lines; a long one gets a smaller size', () => {
  const box = LAYOUTS['title-bullets'].title;
  assert.equal(fitTitle('Xulosa', box).size, 32);
  const long = fitTitle('Amir Temur davrida Samarqandda qurilgan me’moriy yodgorliklar va ularning ahamiyati', box);
  assert.ok(long.fits && long.size < 32 && long.size >= 18, `${long.size} pt`);
  assert.ok(wrappedLines('Amir Temur davrida Samarqandda qurilgan me’moriy yodgorliklar va ularning ahamiyati', long.size, box.w * 72 - 14.4, 0.6) <= 2);
});

test('fit: every slide of the 30 full and 6 free decks of the T0.1 run fits at 12 pt or more', () => {
  const sizes: number[] = [];
  for (const { id, deck } of [...fullDecks(), ...freeDecks()]) {
    // Every other slide pictured: the narrow layouts are the hard case.
    const pictures = new Map(deck.slides.filter((s) => s.index % 2 === 1).map((s) => [s.index, JPEG_BASE64] as const));
    for (const planned of planSlides(deck, pictures)) {
      assert.ok(planned.titleSize >= 18, `${id} slide ${planned.slide.index}: title ${planned.titleSize} pt`);
      for (const column of planned.columns) {
        assert.ok(column.fits, `${id} slide ${planned.slide.index} (${planned.layout}) overflows at ${column.size} pt`);
        assert.ok(column.size >= BODY_SIZES.min);
        sizes.push(column.size);
      }
    }
  }
  assert.ok(sizes.length > 400);
  // The run's bullets are short (≤ 64 characters): most slides keep a large size.
  assert.ok(sizes.filter((size) => size >= 18).length / sizes.length > 0.8, 'most bodies are set at 18 pt or more');
});

// --- layouts ---------------------------------------------------------------------

test('layouts: a picture layout never carries more than 4 bullets; a missing picture means a text layout', () => {
  const deck: Deck = {
    title: 'T',
    subtitle: 'S',
    slides: [slide(1, ['a', 'b', 'c', 'd']), slide(2, ['a', 'b', 'c', 'd', 'e']), slide(3, ['a', 'b']), slide(4, ['a', 'b', 'c'])],
  };
  const pictures = new Map([[1, JPEG_BASE64], [2, JPEG_BASE64], [3, JPEG_BASE64]]);
  const planned = planSlides(deck, pictures);
  for (const entry of planned) {
    const bullets = entry.columns.reduce((total, column) => total + column.bullets.length, 0);
    if (PICTURE_LAYOUTS.has(entry.layout)) assert.ok(bullets <= MAX_BULLETS_WITH_PICTURE, `slide ${entry.slide.index}`);
    assert.equal(bullets, entry.slide.bullets.length, 'no bullet is dropped');
  }
  assert.equal(planned[0].layout, 'image-right');
  assert.equal(planned[0].picture, JPEG_BASE64);
  assert.ok(!PICTURE_LAYOUTS.has(planned[1].layout), 'five bullets: no picture layout');
  assert.equal(planned[1].picture, null);
  assert.equal(planned[2].layout, 'image-full', 'pictured slides alternate');
  assert.ok(!PICTURE_LAYOUTS.has(planned[3].layout), 'slide 4 has no picture in hand');
  assert.equal(planned[3].picture, null);
});

test('layouts: text slides with 4+ bullets alternate one column and two; the choice is deterministic', () => {
  const slides = [slide(1, ['a', 'b', 'c', 'd']), slide(2, ['a', 'b', 'c', 'd']), slide(3, ['a', 'b']), slide(4, ['a', 'b', 'c', 'd', 'e'])];
  const layouts = chooseLayouts(slides, new Set());
  assert.deepEqual(layouts, ['title-bullets', 'two-columns', 'title-bullets', 'title-bullets']);
  assert.deepEqual(chooseLayouts(slides, new Set()), layouts);
  assert.deepEqual(splitBullets('two-columns', ['a', 'b', 'c', 'd', 'e']), [['a', 'b', 'c'], ['d', 'e']]);
  assert.deepEqual(splitBullets('title-bullets', ['a', 'b']), [['a', 'b']]);
});

test('layouts: every box stays on the 16:9 slide', () => {
  for (const [name, geometry] of Object.entries(LAYOUTS)) {
    for (const frame of [geometry.title, geometry.rule, ...geometry.body, ...(geometry.picture ? [geometry.picture] : []), ...(geometry.panel ? [geometry.panel] : [])]) {
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.w <= 10 + 1e-9 && frame.y + frame.h <= 5.625 + 1e-9, `${name}`);
    }
  }
});

test('palettes: three, palette 1 by default, every text colour readable on its background (≥ 4.5:1)', () => {
  assert.equal(PALETTES.length, 3);
  assert.equal(paletteFor(7).id, 1);
  assert.equal(paletteFor(2).id, 2);
  for (const palette of PALETTES) {
    for (const [fg, bg] of [[palette.text, palette.background], [palette.title, palette.background], [palette.panelText, palette.panel], [palette.muted, palette.background]]) {
      assert.ok(contrast(fg, bg) >= 4.5, `palette ${palette.id}: ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
    }
  }
});

// --- the file ----------------------------------------------------------------------

test('file: the free deck unzips into a presentation with a cover, the slides, the pictures and the AI label', async () => {
  const deck = freeDecks().find((entry) => entry.locale === 'uz')!.deck;
  const pictures = new Map([[1, JPEG_BASE64], [3, JPEG_BASE64]]);
  const blob = await buildDeck({ locale: 'uz', deck, palette: 1, pictures, aiLabel: true });
  assert.equal(blob.type, PPTX_MIME);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK');
  const zip = await unzip(blob);
  for (const name of ['[Content_Types].xml', 'ppt/presentation.xml', 'docProps/app.xml']) assert.ok(zip.file(name), name);
  assert.ok(!Object.keys(zip.files).some((name) => /vbaProject\.bin$/i.test(name)), 'no macros');
  const names = slideNames(zip);
  assert.equal(names.length, 1 + deck.slides.length + 1, 'cover + slides + label');

  const cover = await text(zip, names[0]);
  assert.ok(cover.includes(deck.title));
  const label = await text(zip, names.at(-1)!);
  assert.ok(label.includes(AI_LABEL.uz), 'the last slide is the AI label');
  assert.ok((await text(zip, 'docProps/app.xml')).includes(`<Company>${AI_LABEL_COMPANY}</Company>`));

  const media = Object.keys(zip.files).filter((name) => name.startsWith('ppt/media/') && !name.endsWith('/'));
  assert.equal(media.length, 2, 'both pictures are in the file');
  for (const name of media) assert.deepEqual(await zip.file(name)!.async('nodebuffer'), JPEG);

  // Every planned size is what the slide XML carries, in hundredths of a point.
  const planned = planSlides(deck, pictures);
  for (const [i, entry] of planned.entries()) {
    const xml = await text(zip, names[i + 1]);
    assert.ok(xml.includes(entry.slide.title), `slide ${i + 1} title`);
    for (const bullet of entry.slide.bullets) assert.ok(xml.includes(bullet.replace(/&/g, '&amp;')), `slide ${i + 1}: ${bullet}`);
    assert.ok(xml.includes(`sz="${entry.titleSize * 100}"`), `slide ${i + 1} title size`);
    for (const column of entry.columns) assert.ok(xml.includes(`sz="${column.size * 100}"`), `slide ${i + 1} body size`);
    assert.ok(xml.includes(`lang="${TEXT_LANG.uz}"`));
    assert.equal(xml.includes('normAutofit'), false, "no fit:'shrink': Google Slides and WPS ignore it");
  }
});

test('file: without the AI label there is no label slide and no company property', async () => {
  const deck = freeDecks()[0].deck;
  const zip = await unzip(await buildDeck({ locale: 'ru', deck, palette: 1, pictures: new Map(), aiLabel: false }));
  const names = slideNames(zip);
  assert.equal(names.length, 1 + deck.slides.length);
  for (const name of names) assert.ok(!(await text(zip, name)).includes(AI_LABEL.ru));
  assert.ok(!(await text(zip, 'docProps/app.xml')).includes(AI_LABEL_COMPANY));
  assert.ok(!Object.keys(zip.files).some((name) => name.startsWith('ppt/media/') && !name.endsWith('/')), 'no pictures, no media');
});

test('file: a full deck keeps its talk in the slide notes', async () => {
  const { deck, locale } = fullDecks().find((entry) => entry.locale === 'uz')!;
  const zip = await unzip(await buildDeck({ locale, deck, palette: 2, pictures: new Map(), aiLabel: true }));
  const notes = Object.keys(zip.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
  assert.ok(notes.length >= deck.slides.length);
  const all = (await Promise.all(notes.map((name) => text(zip, name)))).join('\n');
  for (const entry of deck.slides) {
    const start = entry.notes!.slice(0, 40).replace(/&/g, '&amp;');
    assert.ok(all.includes(start), `notes of slide ${entry.index}`);
  }
});

test('file: pictures turn into base64 only for the file', async () => {
  assert.equal(await blobToBase64(new Blob([JPEG], { type: 'image/jpeg' })), JPEG_BASE64);
  const big = Buffer.alloc(200_000, 7);
  assert.equal(await blobToBase64(new Blob([big])), big.toString('base64'));
});

test('file name: taqdimot-<the topic transliterated, ≤ 40>.pptx', () => {
  assert.equal(deckFileName('Amir Temur'), 'taqdimot-amir-temur.pptx');
  assert.equal(deckFileName('Sog‘lom turmush tarzi'), 'taqdimot-soglom-turmush-tarzi.pptx');
  assert.equal(deckFileName('Строение клетки'), 'taqdimot-stroenie-kletki.pptx');
  assert.equal(deckFileName('Ўзбекистон ғалабаси'), 'taqdimot-ozbekiston-galabasi.pptx');
  assert.equal(deckFileName('   ...   '), 'taqdimot.pptx');
  const long = topicSlug('Ikkinchi jahon urushi va O‘zbekistonning frontga qo‘shgan hissasi');
  assert.ok(long.length <= 40 && !long.endsWith('-') && /^[a-z0-9-]+$/.test(long), long);
});

test('build: pptxgenjs is only ever imported dynamically', () => {
  const source = fs.readFileSync(path.join(ROOT, 'apps/studio/src/pptx/build.ts'), 'utf8');
  assert.match(source, /await import\('pptxgenjs'\)/);
  assert.doesNotMatch(source, /^import [^;]*from 'pptxgenjs'/m);
  assert.doesNotMatch(source, /fit:\s*'shrink'/);
  for (const file of fs.readdirSync(path.join(ROOT, 'apps/studio/src'), { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(file)) continue;
    const code = fs.readFileSync(path.join(ROOT, 'apps/studio/src', file), 'utf8');
    assert.doesNotMatch(code, /^import [^;]*from ['"](?:pptxgenjs|jszip)['"]/m, `${file} imports pptxgenjs or jszip statically`);
  }
});
