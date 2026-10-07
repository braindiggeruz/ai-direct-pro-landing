/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The one-time consent before the first photo (spec §8.1 item 1; DECISIONS
 * 07.10 §2(г), С-4): what happens to the picture, who gets it (Z.ai,
 * Singapore), that nothing is kept, and one button. It renders only after
 * hydration, when a file was chosen and localStorage holds no `photo-v1`
 * yet, so the static markup never carries it. The server refuses a photo
 * without the consent field anyway (400 consent_required).
 */
import { useEffect, useRef } from 'react';
import type { PhotoTexts } from './texts';

export interface ConsentProps {
  readonly texts: PhotoTexts;
  readonly policyHref: string;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

const BUTTON =
  'st:rounded-xl st:px-4 st:py-2.5 st:text-sm st:font-semibold st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';

export function Consent({ texts, policyHref, onAccept, onDecline }: ConsentProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="studio-photo-consent-title"
      data-studio-consent=""
      className="st:rounded-xl st:border st:border-studio-blue/60 st:bg-studio-elevated st:p-4"
    >
      <h3 id="studio-photo-consent-title" ref={heading} tabIndex={-1} className="st:text-base st:font-semibold st:text-studio-text st:outline-none">
        {texts.consentTitle}
      </h3>
      <p className="st:mt-2 st:text-sm st:leading-relaxed st:text-studio-text">{texts.consentBody}</p>
      <p className="st:mt-2 st:text-sm st:leading-relaxed st:text-studio-text">{texts.consentFaces}</p>
      <p className="st:mt-2 st:text-sm st:text-studio-muted">
        <a href={policyHref} className="st:text-studio-cyan st:underline st:underline-offset-2 st:hover:text-studio-text">
          {texts.consentPolicy}
        </a>
      </p>
      <div className="st:mt-4 st:flex st:flex-wrap st:gap-3">
        <button type="button" onClick={onAccept} data-studio-consent-accept="" className={`${BUTTON} st:bg-studio-cyan st:text-studio-bg`}>
          {texts.consentAccept}
        </button>
        <button type="button" onClick={onDecline} className={`${BUTTON} st:border st:border-studio-line st:text-studio-muted st:hover:text-studio-text`}>
          {texts.consentDecline}
        </button>
      </div>
    </div>
  );
}
