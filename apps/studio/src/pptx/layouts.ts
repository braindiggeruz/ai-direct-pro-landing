/**
 * The four slide layouts of a deck and the choice between them
 * (STUDIO-SPEC §7.3, §7.6). 16:9, 10 × 5.625 in; every box is in inches.
 *
 *   title-bullets  the title across the top, the bullets under it.
 *   two-columns    the title across the top, the bullets in two columns
 *                  (for 4–5 bullets on a slide without a picture).
 *   image-right    title and bullets on the left, a square picture on the
 *                  right.
 *   image-full     the picture over the whole slide, the title and the
 *                  bullets on a panel in the palette's background colour.
 *
 * The server marks the slides that may get a picture ("image-right", with at
 * most 4 bullets: deck-schema.ts withLayouts). The browser picks the final
 * layout from the pictures that actually arrived: a picture that failed or
 * was refused leaves its slide a text layout, and a slide with more than 4
 * bullets never gets a picture layout. For variety, pictured slides
 * alternate image-right / image-full, and text slides with 4 or more
 * bullets alternate title-bullets / two-columns.
 */
import type { SlideLayout } from '../api';
import type { Box } from './fit';

export const SLIDE = { w: 10, h: 5.625 } as const;
/** Bullets a slide with a picture may show (deck-schema.ts DECK_LIMITS.maxBulletsWithImage). */
export const MAX_BULLETS_WITH_PICTURE = 4;

export interface Frame extends Box {
  readonly x: number;
  readonly y: number;
}

export interface LayoutGeometry {
  readonly title: Frame;
  /** The accent bar under the title. */
  readonly rule: Frame;
  /** One box, or two for two-columns. */
  readonly body: readonly Frame[];
  readonly picture?: Frame;
  /** image-full: the panel behind title and body. */
  readonly panel?: Frame;
}

export const LAYOUTS: Readonly<Record<SlideLayout, LayoutGeometry>> = {
  'title-bullets': {
    title: { x: 0.6, y: 0.3, w: 8.8, h: 0.95 },
    rule: { x: 0.6, y: 1.27, w: 1.1, h: 0.06 },
    body: [{ x: 0.6, y: 1.45, w: 8.8, h: 3.75 }],
  },
  'two-columns': {
    title: { x: 0.6, y: 0.3, w: 8.8, h: 0.95 },
    rule: { x: 0.6, y: 1.27, w: 1.1, h: 0.06 },
    body: [
      { x: 0.6, y: 1.45, w: 4.25, h: 3.75 },
      { x: 5.15, y: 1.45, w: 4.25, h: 3.75 },
    ],
  },
  'image-right': {
    title: { x: 0.6, y: 0.3, w: 5.1, h: 0.95 },
    rule: { x: 0.6, y: 1.27, w: 1.1, h: 0.06 },
    body: [{ x: 0.6, y: 1.45, w: 5.1, h: 3.75 }],
    picture: { x: 6.0, y: 0.9, w: 3.5, h: 3.85 },
  },
  'image-full': {
    title: { x: 0.75, y: 0.6, w: 4.9, h: 0.95 },
    rule: { x: 0.75, y: 1.57, w: 1.1, h: 0.06 },
    body: [{ x: 0.75, y: 1.75, w: 4.9, h: 3.25 }],
    picture: { x: 0, y: 0, w: SLIDE.w, h: SLIDE.h },
    panel: { x: 0.45, y: 0.4, w: 5.5, h: 4.825 },
  },
};

export const PICTURE_LAYOUTS: ReadonlySet<SlideLayout> = new Set<SlideLayout>(['image-right', 'image-full']);

export interface LayoutSlide {
  readonly index: number;
  readonly bullets: readonly string[];
}

/**
 * The layout of each slide, given the slide indexes that have a picture in
 * hand. Deterministic: the same deck and pictures give the same layouts.
 */
export function chooseLayouts(slides: readonly LayoutSlide[], pictured: ReadonlySet<number>): SlideLayout[] {
  let pictures = 0;
  let longText = 0;
  return slides.map((slide) => {
    if (pictured.has(slide.index) && slide.bullets.length <= MAX_BULLETS_WITH_PICTURE) {
      return pictures++ % 2 === 0 ? 'image-right' : 'image-full';
    }
    if (slide.bullets.length >= 4) return longText++ % 2 === 0 ? 'title-bullets' : 'two-columns';
    return 'title-bullets';
  });
}

/** The bullets of each body box: two-columns splits them, the first column taking the extra one. */
export function splitBullets(layout: SlideLayout, bullets: readonly string[]): (readonly string[])[] {
  if (layout !== 'two-columns') return [bullets];
  const half = Math.ceil(bullets.length / 2);
  return [bullets.slice(0, half), bullets.slice(half)];
}
