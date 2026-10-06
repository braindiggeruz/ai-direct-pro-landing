/**
 * Font sizes chosen by the code from the length of the text
 * (STUDIO-SPEC §7.6).
 *
 * pptxgenjs' `fit: 'shrink'` only asks the viewer to shrink text, and Google
 * Slides and WPS Office never do: long Uzbek bullets would run off the
 * slide there. So each text box gets a fixed size, the largest at which the
 * text, wrapped word by word, fits the box by a deliberately pessimistic
 * estimate:
 *
 *   - a character is CHAR_WIDTH em wide (Arial and Calibri average ≈ 0.5 em
 *     on Uzbek Latin and Russian; 0.55 leaves room for capitals and wide
 *     Cyrillic letters), bold titles TITLE_CHAR_WIDTH;
 *   - a line is LINE_HEIGHT em high (single spacing in PowerPoint);
 *   - paragraphs are PARA_GAP em apart (paraSpaceAfter);
 *   - the box loses PowerPoint's default insets (0.1 in left and right,
 *     0.05 in top and bottom) and a bullet loses its hanging indent.
 *
 * The estimate is checked on the longest decks of the 30-topic run
 * (tests/studio-pptx.test.ts, fixtures/studio/measure30.json).
 */

export const CHAR_WIDTH = 0.55;
export const TITLE_CHAR_WIDTH = 0.6;
export const LINE_HEIGHT = 1.2;
export const PARA_GAP = 0.5;
/** Hanging indent of a bullet, points. */
export const BULLET_INDENT_PT = 18;
const INSET_X_PT = 0.1 * 72 * 2;
const INSET_Y_PT = 0.05 * 72 * 2;

export const BODY_SIZES = { max: 24, min: 12 } as const;
export const TITLE_SIZES = { max: 32, min: 18 } as const;

export interface Box {
  /** Inches. */
  readonly w: number;
  readonly h: number;
}

/** Lines `text` takes when wrapped at word boundaries into `widthPt` at `sizePt`. A word longer than a line breaks across lines. */
export function wrappedLines(text: string, sizePt: number, widthPt: number, charWidth = CHAR_WIDTH): number {
  const perLine = Math.max(1, Math.floor(widthPt / (sizePt * charWidth)));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const length = Array.from(word).length;
    if (used === 0) {
      lines += Math.ceil(length / perLine) - 1;
      used = length % perLine || perLine;
    } else if (used + 1 + length <= perLine) {
      used += 1 + length;
    } else {
      lines += Math.ceil(length / perLine);
      used = length % perLine || perLine;
    }
  }
  return lines;
}

/** Height in points the bullets need at `sizePt` in a box `widthPt` wide (insets already taken off). */
export function bulletsHeight(bullets: readonly string[], sizePt: number, widthPt: number): number {
  const lineWidth = widthPt - BULLET_INDENT_PT;
  const lines = bullets.reduce((total, bullet) => total + wrappedLines(bullet, sizePt, lineWidth), 0);
  return lines * sizePt * LINE_HEIGHT + Math.max(0, bullets.length - 1) * sizePt * PARA_GAP;
}

export interface Fit {
  readonly size: number;
  /** False when even the smallest size overflows by the estimate (the text is then set at the smallest). */
  readonly fits: boolean;
}

/** The largest size from `sizes.max` down to `sizes.min` at which the bullets fit `box`. */
export function fitBullets(bullets: readonly string[], box: Box, sizes: { readonly max: number; readonly min: number } = BODY_SIZES): Fit {
  const width = box.w * 72 - INSET_X_PT;
  const height = box.h * 72 - INSET_Y_PT;
  for (let size = sizes.max; size >= sizes.min; size--) {
    if (bulletsHeight(bullets, size, width) <= height) return { size, fits: true };
  }
  return { size: sizes.min, fits: false };
}

/** The largest size at which a (bold) title fits `box` in at most `maxLines` lines. */
export function fitTitle(title: string, box: Box, maxLines = 2, sizes: { readonly max: number; readonly min: number } = TITLE_SIZES): Fit {
  const width = box.w * 72 - INSET_X_PT;
  const height = box.h * 72 - INSET_Y_PT;
  for (let size = sizes.max; size >= sizes.min; size--) {
    const lines = wrappedLines(title, size, width, TITLE_CHAR_WIDTH);
    if (lines <= maxLines && lines * size * LINE_HEIGHT <= height) return { size, fits: true };
  }
  return { size: sizes.min, fits: false };
}

/** Space after each bullet, points, for a body set at `sizePt`. */
export function paraSpaceAfter(sizePt: number): number {
  return Math.round(sizePt * PARA_GAP);
}
