/**
 * The three colour sets of a deck (STUDIO-SPEC §7.6). The free deck always
 * uses palette 1 (plans.ts DECK_SHAPES.free.palettes = 1); the full deck lets
 * the person pick one of three (T3.1).
 *
 * Colours are hex without '#', as pptxgenjs wants them. Each pair of text and
 * background colours keeps a contrast of at least 4.5:1, so a projector in a
 * bright classroom still shows the words (tests/studio-pptx.test.ts checks).
 */

export interface Palette {
  readonly id: 1 | 2 | 3;
  /** For the person: the palette's name in the picker (T3.1). */
  readonly name: { readonly uz: string; readonly ru: string };
  readonly background: string;
  readonly title: string;
  readonly text: string;
  /** The bar under titles and the cover's rule. */
  readonly accent: string;
  /** The box behind the text of a full-picture slide, and its text. */
  readonly panel: string;
  readonly panelText: string;
  /** Small print: the AI label's second line. */
  readonly muted: string;
}

export const PALETTES: readonly [Palette, Palette, Palette] = [
  {
    id: 1,
    name: { uz: 'Oq', ru: 'Светлая' },
    background: 'FFFFFF',
    title: '14213D',
    text: '263241',
    accent: '229ED9',
    panel: 'FFFFFF',
    panelText: '14213D',
    muted: '5B6675',
  },
  {
    id: 2,
    name: { uz: 'Tun', ru: 'Тёмная' },
    background: '0C1828',
    title: 'FFFFFF',
    text: 'E6EEF7',
    accent: '2FE6D1',
    panel: '0C1828',
    panelText: 'FFFFFF',
    muted: 'A9B8C9',
  },
  {
    id: 3,
    name: { uz: 'Qum', ru: 'Песочная' },
    background: 'FBF6EE',
    title: '4A3216',
    text: '3B2F23',
    accent: 'B8691E',
    panel: 'FBF6EE',
    panelText: '4A3216',
    muted: '6E5D4B',
  },
];

/** Palette `id`, or palette 1 for anything else. */
export function paletteFor(id: number): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

/** WCAG relative luminance of a hex colour. */
export function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio of two hex colours (1 … 21). */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
