/**
 * Builds the .pptx in the browser (STUDIO-SPEC §7.6).
 *
 * pptxgenjs (with jszip, ≈ 123 kB gzip) is imported dynamically: it must
 * never be part of the island's entry chunk, which has a first-load budget
 * of 90 kB gzip for JS and CSS together (prerender-studio fails the build
 * otherwise). The chunk is fetched only when a deck is built, after the
 * person asked for the file.
 *
 * The deck: a cover (title and subtitle), one slide per deck slide in one of
 * four layouts (layouts.ts) and one of three palettes (palettes.ts), Arial
 * throughout (every viewer has it: PowerPoint, Google Slides, WPS, Keynote),
 * every font size fixed by fit.ts, the talk (full deck) in the slide notes,
 * and, while STUDIO_AI_LABEL is on, a last slide «AI yordamida tayyorlangan.
 * Tekshiring.» with the file property company = GPTBot.uz (the lawyer's
 * question 2(c) decides the flag and the words).
 *
 * Pictures arrive as JPEG bytes (URL.createObjectURL in the preview) and are
 * turned into base64 only here, for the file.
 */
import type { Deck, DeckSlide, SlideLayout, StudioLocale } from '../api';
import { BULLET_INDENT_PT, fitBullets, fitTitle, paraSpaceAfter } from './fit';
import { LAYOUTS, MAX_BULLETS_WITH_PICTURE, PICTURE_LAYOUTS, chooseLayouts, splitBullets } from './layouts';
import { paletteFor, type Palette } from './palettes';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const FONT_FACE = 'Arial';

/** The AI label's words (STUDIO-SPEC §7.6); the owner's lawyer may change them. */
export const AI_LABEL = {
  uz: 'AI yordamida tayyorlangan. Tekshiring.',
  ru: 'Подготовлено с помощью AI. Проверьте.',
} as const;
export const AI_LABEL_SITE = 'gptbot.uz';
export const AI_LABEL_COMPANY = 'GPTBot.uz';

/** Language tags of the text runs, for spelling and hyphenation in the viewer. */
export const TEXT_LANG: Readonly<Record<StudioLocale, string>> = { uz: 'uz-Latn-UZ', ru: 'ru-RU' };

export interface DeckBuildInput {
  readonly locale: StudioLocale;
  readonly deck: Deck;
  /** 1–3; anything else is palette 1. */
  readonly palette: number;
  /** Slide index → the picture's JPEG as base64 (no data: prefix). */
  readonly pictures: ReadonlyMap<number, string>;
  /** STUDIO_AI_LABEL (from /config); the label slide and company property. */
  readonly aiLabel: boolean;
}

/** One slide as it goes into the file: its final layout and the pieces to place. */
export interface PlannedSlide {
  readonly slide: DeckSlide;
  readonly layout: SlideLayout;
  readonly picture: string | null;
  readonly titleSize: number;
  /** One per body box. */
  readonly columns: readonly { readonly bullets: readonly string[]; readonly size: number; readonly fits: boolean }[];
}

/** The final layout and font sizes of every slide (no pptxgenjs needed: tests read this). */
export function planSlides(deck: Deck, pictures: ReadonlyMap<number, string>): PlannedSlide[] {
  const pictured = new Set(
    deck.slides.filter((slide) => pictures.has(slide.index) && slide.bullets.length <= MAX_BULLETS_WITH_PICTURE).map((slide) => slide.index),
  );
  const layouts = chooseLayouts(deck.slides, pictured);
  return deck.slides.map((slide, i) => {
    const layout = layouts[i];
    const geometry = LAYOUTS[layout];
    const parts = splitBullets(layout, slide.bullets);
    // Two columns share one size, so the slide reads as one block.
    const fits = parts.map((bullets, column) => fitBullets(bullets, geometry.body[column]));
    const shared = Math.min(...fits.map((fit) => fit.size));
    return {
      slide,
      layout,
      picture: PICTURE_LAYOUTS.has(layout) ? pictures.get(slide.index) ?? null : null,
      titleSize: fitTitle(slide.title, geometry.title).size,
      // A column that fits at its own size fits at the smaller shared one.
      columns: parts.map((bullets, column) => ({ bullets, size: shared, fits: fits[column].fits })),
    };
  });
}

/** The pptxgenjs constructor, loaded on first use. */
export async function loadPptxGenJS() {
  const module = await import('pptxgenjs');
  return module.default;
}

type PptxGenJSClass = Awaited<ReturnType<typeof loadPptxGenJS>>;
type Pptx = InstanceType<PptxGenJSClass>;
type PptxSlide = ReturnType<Pptx['addSlide']>;

function addCover(pptx: Pptx, deck: Deck, palette: Palette, lang: string): void {
  const cover = pptx.addSlide();
  cover.background = { color: palette.background };
  const titleBox = { x: 0.8, y: 1.35, w: 8.4, h: 1.75 };
  cover.addText(deck.title, {
    ...titleBox,
    fontFace: FONT_FACE,
    fontSize: fitTitle(deck.title, titleBox, 2, { max: 40, min: 24 }).size,
    bold: true,
    color: palette.title,
    align: 'center',
    valign: 'bottom',
    lang,
  });
  cover.addShape(pptx.ShapeType.rect, { x: 4.4, y: 3.25, w: 1.2, h: 0.07, fill: { color: palette.accent }, line: { color: palette.accent, width: 0 } });
  if (deck.subtitle) {
    const subtitleBox = { x: 0.8, y: 3.45, w: 8.4, h: 1.0 };
    cover.addText(deck.subtitle, {
      ...subtitleBox,
      fontFace: FONT_FACE,
      fontSize: fitTitle(deck.subtitle, subtitleBox, 2, { max: 22, min: 14 }).size,
      color: palette.text,
      align: 'center',
      valign: 'top',
      lang,
    });
  }
}

function addPicture(slide: PptxSlide, base64: string, frame: { x: number; y: number; w: number; h: number }, altText: string): void {
  // The pictures are square (Flux 1024 × 1024): `cover` crops the square to the frame.
  const side = Math.max(frame.w, frame.h);
  slide.addImage({
    data: `image/jpeg;base64,${base64}`,
    x: frame.x,
    y: frame.y,
    w: side,
    h: side,
    sizing: { type: 'cover', w: frame.w, h: frame.h },
    altText,
  });
}

function addContentSlide(pptx: Pptx, planned: PlannedSlide, palette: Palette, lang: string): void {
  const slide = pptx.addSlide();
  slide.background = { color: palette.background };
  const geometry = LAYOUTS[planned.layout];
  const onPanel = planned.layout === 'image-full';
  if (planned.picture && geometry.picture) addPicture(slide, planned.picture, geometry.picture, planned.slide.title);
  if (onPanel && geometry.panel) {
    slide.addShape(pptx.ShapeType.rect, {
      ...geometry.panel,
      fill: { color: palette.panel, transparency: 6 },
      line: { color: palette.panel, width: 0 },
    });
  }
  slide.addText(planned.slide.title, {
    ...geometry.title,
    fontFace: FONT_FACE,
    fontSize: planned.titleSize,
    bold: true,
    color: onPanel ? palette.panelText : palette.title,
    valign: 'bottom',
    lang,
  });
  slide.addShape(pptx.ShapeType.rect, { ...geometry.rule, fill: { color: palette.accent }, line: { color: palette.accent, width: 0 } });
  planned.columns.forEach((column, i) => {
    if (!column.bullets.length) return;
    slide.addText(
      column.bullets.map((text, at) => ({
        text,
        options: { bullet: { indent: BULLET_INDENT_PT }, breakLine: at < column.bullets.length - 1 },
      })),
      {
        ...geometry.body[i],
        fontFace: FONT_FACE,
        fontSize: column.size,
        color: onPanel ? palette.panelText : palette.text,
        valign: 'top',
        paraSpaceAfter: paraSpaceAfter(column.size),
        lineSpacingMultiple: 1,
        lang,
      },
    );
  });
  if (planned.slide.notes) slide.addNotes(planned.slide.notes);
}

function addLabel(pptx: Pptx, locale: StudioLocale, palette: Palette, lang: string): void {
  const slide = pptx.addSlide();
  slide.background = { color: palette.background };
  slide.addText(AI_LABEL[locale], {
    x: 0.8, y: 1.9, w: 8.4, h: 1.0, fontFace: FONT_FACE, fontSize: 28, bold: true, color: palette.title, align: 'center', valign: 'middle', lang,
  });
  slide.addText(AI_LABEL_SITE, {
    x: 0.8, y: 2.95, w: 8.4, h: 0.6, fontFace: FONT_FACE, fontSize: 16, color: palette.muted, align: 'center', valign: 'top', lang,
  });
}

/** The presentation object for `input`, built with the pptxgenjs class given. */
export function composeDeck(PptxGenJS: PptxGenJSClass, input: DeckBuildInput): Pptx {
  const pptx = new PptxGenJS();
  const palette = paletteFor(input.palette);
  const lang = TEXT_LANG[input.locale];
  pptx.layout = 'LAYOUT_16x9';
  pptx.theme = { headFontFace: FONT_FACE, bodyFontFace: FONT_FACE };
  pptx.title = input.deck.title;
  if (input.aiLabel) {
    pptx.company = AI_LABEL_COMPANY;
    pptx.author = AI_LABEL_COMPANY;
  }
  addCover(pptx, input.deck, palette, lang);
  for (const planned of planSlides(input.deck, input.pictures)) addContentSlide(pptx, planned, palette, lang);
  if (input.aiLabel) addLabel(pptx, input.locale, palette, lang);
  return pptx;
}

export async function buildDeck(input: DeckBuildInput): Promise<Blob> {
  const PptxGenJS = await loadPptxGenJS();
  const output = await composeDeck(PptxGenJS, input).write({ outputType: 'blob' });
  if (!(output instanceof Blob)) throw new Error('pptxgenjs did not return a Blob.');
  return output.type === PPTX_MIME ? output : new Blob([output], { type: PPTX_MIME });
}

/** Standard base64 of a picture's bytes, for the file. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const CYRILLIC: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** The topic as a file-name word: Latin letters, digits and hyphens, at most `max` characters. */
export function topicSlug(topic: string, max = 40): string {
  const latin = Array.from(topic.normalize('NFC').toLowerCase())
    .map((char) => CYRILLIC[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // o‘, g‘ and the tutuq belgisi: the apostrophe goes, the letter stays.
    .replace(/['‘’ʻʼ`´]/g, '');
  const slug = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, max).replace(/-+$/g, '');
}

/** taqdimot-<the topic transliterated, ≤ 40>.pptx (STUDIO-SPEC §7.6). */
export function deckFileName(topic: string): string {
  const slug = topicSlug(topic);
  return slug ? `taqdimot-${slug}.pptx` : 'taqdimot.pptx';
}
