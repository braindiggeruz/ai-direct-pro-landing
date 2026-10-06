/** @jsxRuntime automatic @jsxImportSource react */
/**
 * «Brauzerda oching» (STUDIO-SPEC §7.7): shown in the browsers inside
 * Instagram, Facebook and Telegram, above the form's submit button, so the
 * person moves to a real browser before the day's free deck is spent. The
 * button copies this page's address.
 */
import { useState } from 'react';
import { copyText, pageLink } from '../../inapp';
import type { ToolTexts } from './texts';

export interface InAppNoticeProps {
  readonly texts: ToolTexts;
  /** The short line under the download button instead of the full notice. */
  readonly compact?: boolean;
}

export function InAppNotice({ texts, compact = false }: InAppNoticeProps) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onCopy = () => {
    void copyText(pageLink(window.location)).then((copied) => setCopy(copied ? 'copied' : 'failed'));
  };
  return (
    <div
      className="st:rounded-xl st:border st:border-studio-saffron/50 st:bg-studio-saffron/10 st:p-3 st:text-sm st:text-studio-text"
      role="note"
      data-studio-inapp=""
    >
      {compact ? null : <p className="st:mb-1 st:font-semibold st:text-studio-saffron">{texts.inAppTitle}</p>}
      <p className="st:mb-2 st:leading-snug">{compact ? texts.inAppDownload : texts.inAppBody}</p>
      <button
        type="button"
        onClick={onCopy}
        className="st:rounded-lg st:border st:border-studio-saffron/60 st:px-3 st:py-2 st:text-sm st:font-semibold st:text-studio-saffron st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-saffron"
      >
        {texts.copyLink}
      </button>
      {copy === 'idle' ? null : (
        <span className="st:ml-2 st:text-xs st:text-studio-muted" role="status">
          {copy === 'copied' ? texts.copied : texts.copyFailed}
        </span>
      )}
    </div>
  );
}
