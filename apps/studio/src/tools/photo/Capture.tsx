/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The photo input (spec §8.1 item 2): only
 * <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment">.
 * The site's Permissions-Policy header (camera=()) does not touch such an
 * input, and getUserMedia is never used. The input is in the static markup
 * from the build on, so a person can pick a file before the script ran;
 * the island reads it back after hydration (Island.tsx).
 */
import type { ChangeEvent, RefObject } from 'react';
import { PHOTO_TYPES } from './api';
import type { PhotoTexts } from './texts';

export interface CaptureProps {
  readonly texts: PhotoTexts;
  readonly id: string;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly disabled: boolean;
  /** The chosen file's name, shown under the input; '' for none. */
  readonly chosen: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

const LABEL = 'st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text';
const INPUT =
  'st:block st:w-full st:rounded-xl st:border st:border-dashed st:border-studio-line st:bg-studio-bg st:px-3.5 st:py-3 st:text-sm st:text-studio-text st:file:mr-3 st:file:rounded-lg st:file:border-0 st:file:bg-studio-blue st:file:px-3 st:file:py-2 st:file:text-sm st:file:font-semibold st:file:text-studio-bg st:focus:border-studio-blue st:focus:outline-none st:disabled:opacity-60';

export function Capture({ texts, id, inputRef, disabled, chosen, onChange }: CaptureProps) {
  return (
    <div>
      <label htmlFor={`${id}-photo`} className={LABEL}>
        {texts.pickLabel}
      </label>
      <input
        id={`${id}-photo`}
        ref={inputRef}
        type="file"
        name="image"
        accept={PHOTO_TYPES.join(',')}
        capture="environment"
        disabled={disabled}
        onChange={onChange}
        aria-describedby={`${id}-photo-hint`}
        className={INPUT}
      />
      <p id={`${id}-photo-hint`} className="st:mt-1.5 st:text-xs st:text-studio-muted">
        {chosen ? texts.chosen(chosen) : texts.pickHint}
      </p>
    </div>
  );
}
