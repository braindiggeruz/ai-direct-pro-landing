/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The finished deck on the page, before the file is saved: a cover card and
 * one card per slide in the free palette's colours, with the pictures as
 * they arrive.
 *
 * The page asks the person to check the facts, so a card shows its whole
 * text: no fixed 16:9 frame that clips bullets on a 360 px phone. A card
 * grows with its bullets; the picture keeps its own 4:3 box, above the text
 * on a phone and beside it from `sm`; at most two cards a row.
 *
 * When a deck arrives its heading takes the focus (and so scrolls into
 * view): the submit button was disabled while it was made, so the focus
 * would otherwise fall to <body> and a screen reader would hear nothing.
 *
 * The whole block carries `ym-hide-content`: Webvisor (on across the site,
 * scripts/analytics-metrika.ts) never records a deck (STUDIO-SPEC §10.5).
 * Pictures are shown from object URLs (URL.createObjectURL of the JPEG
 * bytes), never as data: URLs, which Webvisor could copy.
 *
 * A full deck (T3.1) also shows each slide's talk («Qisqa ma’ruza matni»)
 * under its bullets, folded (<details>), so the cards stay short.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { Deck } from '../../api';
import type { ToolTexts } from './texts';

export type PictureState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly url: string; readonly blob: Blob }
  | { readonly status: 'none' };

export interface PreviewProps {
  readonly texts: ToolTexts;
  readonly deck: Deck;
  /** By slide index; a slide that never had a picture is absent. */
  readonly pictures: ReadonlyMap<number, PictureState>;
  /** The download block, under the heading and above the slides, so it is in view without scrolling past them. */
  readonly actions?: ReactNode;
  /** A full deck: the label of each slide's folded talk (FULL_TEXTS.notesLabel); without it no talk is shown. */
  readonly notesLabel?: string;
}

export function Preview({ texts, deck, pictures, actions, notesLabel }: PreviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A new deck (the object changes only then): the focus moves to it.
    heading.current?.focus();
  }, [deck]);
  return (
    <section className="ym-hide-content st:mt-6" data-studio-preview="" aria-labelledby="studio-result-title">
      <h2 id="studio-result-title" ref={heading} tabIndex={-1} className="st:mb-1 st:text-xl st:font-semibold st:text-studio-text st:outline-none">
        {texts.resultTitle}
      </h2>
      <p className="st:mb-4 st:text-sm st:text-studio-muted">{texts.draftNote}</p>
      {actions}
      <ol className="st:mt-4 st:grid st:gap-3 st:sm:grid-cols-2">
        <li className="st:flex st:min-h-40 st:flex-col st:items-center st:justify-center st:rounded-lg st:bg-white st:p-4 st:text-center st:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.7)]">
          <p className="st:text-lg st:leading-tight st:font-bold st:text-[#14213d]">{deck.title}</p>
          <span className="st:my-2 st:block st:h-1 st:w-10 st:rounded st:bg-[#229ed9]" aria-hidden="true" />
          <p className="st:text-xs st:text-[#263241]">{deck.subtitle}</p>
        </li>
        {deck.slides.map((slide) => {
          const picture = pictures.get(slide.index);
          return (
            <li
              key={slide.index}
              className="st:flex st:min-h-40 st:flex-col st:gap-3 st:rounded-lg st:bg-white st:p-3 st:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.7)] st:sm:flex-row"
              data-slide={slide.index}
            >
              <div className="st:min-w-0 st:flex-1">
                <p className="st:text-[10px] st:font-medium st:tracking-wide st:text-[#5b6675] st:uppercase">{texts.slide(slide.index)}</p>
                <p className="st:mb-1 st:text-sm st:leading-tight st:font-bold st:text-[#14213d]">{slide.title}</p>
                <ul className="st:list-disc st:space-y-0.5 st:pl-4 st:text-[11px] st:leading-snug st:text-[#263241]">
                  {slide.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
                {notesLabel && slide.notes ? (
                  <details className="st:mt-2 st:text-[11px] st:leading-snug st:text-[#263241]" data-notes={slide.index}>
                    <summary className="st:cursor-pointer st:font-medium st:text-[#14213d]">{notesLabel}</summary>
                    <p className="st:mt-1">{slide.notes}</p>
                  </details>
                ) : null}
              </div>
              {picture ? (
                <div className="st:order-first st:flex st:aspect-[4/3] st:w-full st:shrink-0 st:items-center st:justify-center st:self-start st:overflow-hidden st:rounded-md st:bg-[#eef2f6] st:sm:order-none st:sm:w-2/5">
                  {picture.status === 'ready' ? (
                    <img src={picture.url} alt="" className="st:size-full st:object-cover" data-picture={slide.index} />
                  ) : (
                    <span className="st:px-1 st:text-center st:text-[10px] st:text-[#5b6675]">
                      {picture.status === 'loading' ? texts.pictureLoading : texts.pictureNone}
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
