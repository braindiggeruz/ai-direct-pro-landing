/** @jsxRuntime automatic @jsxImportSource react */
/**
 * «Brauzerda oching» (STUDIO-SPEC §7.7): shown in the browsers inside
 * Instagram, Facebook and Telegram, so the person moves to a real browser
 * before the day's free deck is spent. The button copies this page's
 * address; when the copy fails, the text points to the in-app menu (⋮ / …)
 * and its «Open in browser», the one way that works without the clipboard.
 *
 * In the form it is two pieces, both in the static markup for everybody,
 * hidden (`data-studio-inapp-slot`, src/styles.css), and shown where the
 * head script recognised an in-app browser (inapp.ts INAPP_HEAD_SCRIPT):
 * from the first paint, so nothing below ever jumps.
 *   InAppNotice  above the submit button: one row, «Brauzerda oching» and a
 *                small «Nusxalash» copy button, 8 px above the submit
 *                button, so the warning stands before the button and the
 *                button still ends on the first screen of a 360 × 640 phone
 *                (check-pages.ts in-app);
 *   InAppNote    right under the submit button: why, and the menu way.
 * Under the download button, `compact`: the line about the file, with the
 * copy button; it renders only in an in-app browser.
 */
import { useState } from 'react';
import { copyText, pageLink } from '../../inapp';
import type { ToolTexts } from './texts';

export interface InAppNoticeProps {
  readonly texts: ToolTexts;
  /** The line under the download button instead of the form's row. */
  readonly compact?: boolean;
}

const BOX = 'st:rounded-xl st:border st:border-studio-saffron/50 st:bg-studio-saffron/10 st:text-sm st:text-studio-text';
const FOCUS = 'st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-saffron';

export function InAppNotice({ texts, compact = false }: InAppNoticeProps) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onCopy = () => {
    void copyText(pageLink(window.location)).then((copied) => setCopy(copied ? 'copied' : 'failed'));
  };
  const status =
    copy === 'idle' ? null : (
      <span className={compact ? 'st:ml-2 st:text-xs st:text-studio-muted' : 'st:block st:basis-full st:text-xs st:text-studio-muted'} role="status">
        {copy === 'copied' ? texts.copied : texts.copyFailed}
      </span>
    );
  if (!compact) {
    return (
      <div className={`${BOX} st:px-3 st:py-1.5`} role="note" data-studio-inapp="" data-studio-inapp-slot="">
        <div className="st:flex st:flex-wrap st:items-center st:justify-between st:gap-x-2 st:gap-y-1">
          <span className="st:font-semibold st:text-studio-saffron">{texts.inAppTitle}</span>
          <button
            type="button"
            onClick={onCopy}
            aria-label={texts.copyLink}
            className={`st:shrink-0 st:rounded-md st:border st:border-studio-saffron/60 st:px-2 st:text-xs st:leading-4 st:font-semibold st:text-studio-saffron ${FOCUS}`}
          >
            {texts.copyShort}
          </button>
          {status}
        </div>
      </div>
    );
  }
  return (
    <div className={`${BOX} st:p-3`} role="note" data-studio-inapp="">
      <p className="st:mb-2 st:leading-snug">{texts.inAppDownload}</p>
      <button
        type="button"
        onClick={onCopy}
        className={`st:rounded-lg st:border st:border-studio-saffron/60 st:px-3 st:py-2 st:text-sm st:font-semibold st:text-studio-saffron ${FOCUS}`}
      >
        {texts.copyLink}
      </button>
      {status}
    </div>
  );
}

/** Under the form's submit button, in an in-app browser only (styles.css): why, and the menu way. */
export function InAppNote({ texts }: { readonly texts: ToolTexts }) {
  return (
    <p className="st:text-xs st:leading-snug st:text-studio-saffron" data-studio-inapp-slot="" data-studio-inapp-note="">
      {texts.inAppBody}
    </p>
  );
}
