/** @jsxRuntime automatic @jsxImportSource react */
/**
 * Saving the deck (STUDIO-SPEC §7.7): the .pptx is built in the browser
 * (pptx/build.ts loads pptxgenjs on this click, not before) and saved through
 * an <a download> of an object URL. No server keeps the file; there is no
 * link to send in v1.
 *
 * The button waits for the pictures to arrive or fail, so the file has every
 * picture the preview shows. `ym-hide-content`: Webvisor records nothing here.
 */
import type { InAppBrowser } from '../../inapp';
import { InAppNotice } from './InAppNotice';
import type { ToolTexts } from './texts';

export type DownloadState = 'waiting' | 'idle' | 'building' | 'saved' | 'failed';

export interface DownloadProps {
  readonly texts: ToolTexts;
  readonly state: DownloadState;
  readonly inApp: InAppBrowser | null;
  readonly onDownload: () => void;
}

export function Download({ texts, state, inApp, onDownload }: DownloadProps) {
  const busy = state === 'waiting' || state === 'building';
  return (
    <div className="ym-hide-content st:space-y-3" data-studio-download={state}>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="st:w-full st:rounded-xl st:bg-linear-to-br st:from-studio-blue st:to-studio-cyan st:px-4 st:py-3.5 st:text-base st:font-semibold st:text-studio-bg st:transition-opacity st:disabled:cursor-wait st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan"
      >
        {state === 'waiting' ? texts.downloadWait : state === 'building' ? texts.building : texts.download}
      </button>
      {state === 'saved' || state === 'failed' ? (
        <p className={state === 'saved' ? 'st:text-sm st:text-studio-cyan' : 'st:text-sm st:text-studio-danger'} role="status">
          {state === 'saved' ? texts.saved : texts.buildFailed}
        </p>
      ) : null}
      {inApp ? <InAppNotice texts={texts} compact /> : null}
    </div>
  );
}

/** Saves `blob` as `filename` through a temporary <a download>. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later, not at once: some browsers read the URL after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
