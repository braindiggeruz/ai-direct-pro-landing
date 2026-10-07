/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The kind of deck and, for the full one, its colours (STUDIO-SPEC §2.1,
 * §7.6): "Bepul" (up to 6 slides, 2 pictures, palette 1) or "To‘liq" (up to
 * STUDIO_MAX_SLIDES slides, 8 pictures, the talk, three palettes). The
 * person chooses; the free deck and the full one are different products and
 * neither is ever spent in place of the other (spec §2.3).
 *
 * Shown only once /config says the full deck is on (asked on the first
 * focus, never on load), so the prerendered form and the free-only site
 * never carry it. Two native radio groups in fieldsets: keyboard and screen
 * readers get them as they are.
 */
import type { StudioLocale } from '../../api';
import { PALETTES } from '../../pptx/palettes';
import type { FullTexts } from './texts';

export type DeckChoice = 'free' | 'full';

export interface ShapePickerProps {
  readonly texts: FullTexts;
  readonly locale: StudioLocale;
  /** A prefix for the inputs' ids and names (Form's useId). */
  readonly id: string;
  readonly shape: DeckChoice;
  readonly onShape: (shape: DeckChoice) => void;
  readonly palette: number;
  readonly onPalette: (palette: number) => void;
  /** The most slides a full deck may have now (/config shapes.full.maxSlides). */
  readonly maxSlides: number;
  readonly disabled: boolean;
}

const OPTION =
  'st:flex st:cursor-pointer st:flex-col st:gap-0.5 st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3.5 st:py-2.5 st:has-checked:border-studio-blue st:has-focus-visible:outline-2 st:has-focus-visible:outline-studio-cyan st:has-disabled:opacity-60';

export function ShapePicker({ texts, locale, id, shape, onShape, palette, onPalette, maxSlides, disabled }: ShapePickerProps) {
  const choices: ReadonlyArray<{ readonly value: DeckChoice; readonly name: string; readonly note: string }> = [
    { value: 'free', name: texts.shapeFree, note: texts.shapeFreeNote },
    { value: 'full', name: texts.shapeFull, note: texts.shapeFullNote(maxSlides) },
  ];
  return (
    <div className="st:space-y-3" data-studio-shape={shape}>
      <fieldset>
        <legend className="st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text">{texts.shapeLabel}</legend>
        <div className="st:grid st:grid-cols-2 st:gap-2">
          {choices.map((choice) => (
            <label key={choice.value} className={OPTION}>
              <input
                type="radio"
                className="st:sr-only"
                name={`${id}-shape`}
                value={choice.value}
                checked={shape === choice.value}
                onChange={() => onShape(choice.value)}
                disabled={disabled}
              />
              <span className="st:text-sm st:font-semibold st:text-studio-text">{choice.name}</span>
              <span className="st:text-xs st:leading-snug st:text-studio-muted">{choice.note}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {shape === 'full' ? (
        <fieldset>
          <legend className="st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text">{texts.paletteLabel}</legend>
          <div className="st:grid st:grid-cols-3 st:gap-2">
            {PALETTES.map((option) => (
              <label key={option.id} className={`${OPTION} st:items-center`}>
                <input
                  type="radio"
                  className="st:sr-only"
                  name={`${id}-palette`}
                  value={option.id}
                  checked={palette === option.id}
                  onChange={() => onPalette(option.id)}
                  disabled={disabled}
                />
                <span
                  aria-hidden="true"
                  className="st:flex st:h-6 st:w-full st:items-end st:overflow-hidden st:rounded-md st:border st:border-studio-line"
                  style={{ backgroundColor: `#${option.background}` }}
                >
                  <span className="st:block st:h-1.5 st:w-1/2" style={{ backgroundColor: `#${option.accent}` }} />
                </span>
                <span className="st:text-xs st:text-studio-text">{option.name[locale]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
