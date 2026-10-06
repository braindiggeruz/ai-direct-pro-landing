/**
 * Builds the .pptx in the browser.
 *
 * pptxgenjs (with jszip, ≈123 kB gzip) is imported dynamically: it must never
 * be part of the island's entry chunk, which has a first-load budget of 90 kB
 * gzip for JS and CSS together (prerender-studio fails the build otherwise).
 * The chunk is fetched only when a deck is actually built, after the visitor
 * has asked for one.
 *
 * T0.3 skeleton: a title slide and one bullet slide per section, enough to put
 * pptxgenjs in the build (and in the secret scan of dist) and to prove the lazy
 * load end to end. Layouts, palettes, text fitting and the AI label arrive with
 * the generator (T2.2).
 */

export interface DeckSlide {
  title: string;
  bullets: string[];
}

export interface DeckInput {
  /** BCP 47 tag of the deck's text: 'uz-Latn' or 'ru'. */
  lang: 'uz-Latn' | 'ru';
  title: string;
  slides: DeckSlide[];
}

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** The pptxgenjs constructor, loaded on first use. */
export async function loadPptxGenJS() {
  const module = await import('pptxgenjs');
  return module.default;
}

export async function buildDeck(input: DeckInput): Promise<Blob> {
  const PptxGenJS = await loadPptxGenJS();
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = input.title;
  pptx.author = 'GPTBot.uz';
  pptx.company = 'GPTBot.uz';

  const cover = pptx.addSlide();
  cover.addText(input.title, {
    x: 0.5, y: 2.0, w: 9.0, h: 1.4, fontSize: 36, bold: true, align: 'center', lang: input.lang,
  });

  for (const section of input.slides) {
    const slide = pptx.addSlide();
    slide.addText(section.title, { x: 0.5, y: 0.3, w: 9.0, h: 0.9, fontSize: 28, bold: true, lang: input.lang });
    slide.addText(
      section.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
      { x: 0.5, y: 1.4, w: 9.0, h: 3.8, fontSize: 18, valign: 'top', lang: input.lang },
    );
  }

  const output = await pptx.write({ outputType: 'blob' });
  if (!(output instanceof Blob)) throw new Error('pptxgenjs did not return a Blob.');
  return output.type === PPTX_MIME ? output : new Blob([output], { type: PPTX_MIME });
}
