/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The presentation tool: the island inside #studio-root (STUDIO-SPEC §11.3).
 *
 * Its first state, the empty form, is also written into the static page at
 * build time (static.ts renderForm, used by scripts/prerender-studio.ts),
 * and the browser hydrates it (main.tsx): the same markup and size, no
 * layout shift. That first render reads nothing of the browser: no
 * storage, no user agent, no clock, no network.
 *
 * After hydration, on load:
 *   - the submit button is enabled (until then it is disabled, so a click
 *     before the script ran cannot send the form as a plain POST);
 *   - an in-app browser is recognised and «Brauzerda oching» appears above
 *     the button (inapp.ts);
 *   - a paid visit is recorded as the last touch (attribution.ts,
 *     localStorage only).
 * Still no network request: /config and /me are asked for on the first
 * focus inside the form or its first submit, and Turnstile loads on submit.
 *
 * Webvisor: the form carries `ym-disable-submit`, the topic field
 * `ym-disable-keys`; the preview and download blocks `ym-hide-content`.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createStudioApi, type CreatedJob, type Deck, type DeckTask, type StudioApi, type StudioAudience, type StudioLocale } from '../../api';
import { captureLastTouch } from '../../attribution';
import { createFunnel, randomId, type Funnel } from '../../analytics';
import { createStudioSession, type StudioSession } from '../../config';
import { turnstileToken } from '../../identity';
import { currentInApp, type InAppBrowser } from '../../inapp';
import { blobToBase64, buildDeck, deckFileName } from '../../pptx/build';
import { Download, saveFile, type DownloadState } from './Download';
import { drawPictures, FREE_SLIDES, newRequestId, startFreeDeck, TOPIC_MAX, topicProblem, type StartOutcome } from './flow';
import { InAppNotice } from './InAppNotice';
import { Preview, type PictureState } from './Preview';
import { Progress } from './Progress';
import { messageKey, tashkentTime, TEXTS, type Step } from './texts';

export interface FormProps {
  readonly locale: StudioLocale;
}

export const AUDIENCES: readonly StudioAudience[] = ['maktab', 'talaba', 'umumiy'];
export const SLIDE_CHOICES: readonly number[] = [6, 5, 4];

interface Runtime {
  readonly api: StudioApi;
  readonly session: StudioSession;
  readonly funnel: Funnel;
}

interface Result {
  readonly job: CreatedJob;
  readonly task: DeckTask;
  readonly deck: Deck;
  readonly aiLabel: boolean;
}

/** The form's own line: idle, a deck in the making, or a message after a failed start. A result is kept apart. */
type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly step: Step; readonly startedAt: number }
  | { readonly kind: 'message'; readonly code: string; readonly resetsAt?: string; readonly tone: 'limit' | 'error' };

const FIELD =
  'st:w-full st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3.5 st:py-3 st:text-base st:text-studio-text st:placeholder:text-studio-muted st:outline-none st:focus:border-studio-blue st:disabled:opacity-60';
const LABEL = 'st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text';

export function Form({ locale }: FormProps) {
  const texts = TEXTS[locale];
  const id = useId();
  const [hydrated, setHydrated] = useState(false);
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<StudioAudience>('maktab');
  const [slides, setSlides] = useState<number>(FREE_SLIDES.initial);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // The last deck stays on the page (with its pictures and its download)
  // until a new one replaces it: a second try that hits the day's limit
  // never takes the first deck away.
  const [result, setResult] = useState<Result | null>(null);
  const [pictures, setPictures] = useState<ReadonlyMap<number, PictureState>>(new Map());
  const [download, setDownload] = useState<DownloadState>('waiting');
  const runtime = useRef<Runtime | null>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const run = useRef<AbortController | null>(null);
  const drawing = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    setHydrated(true);
    setInApp(currentInApp());
    captureLastTouch();
    const root = document.getElementById('studio-root');
    if (root) root.dataset.island = 'ready';
    return () => {
      run.current?.abort();
      drawing.current?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  /** API, session and funnel, made on first use: none of them calls anything until asked. */
  const live = useCallback((): Runtime => {
    if (!runtime.current) {
      const api = createStudioApi();
      runtime.current = { api, session: createStudioSession(api), funnel: createFunnel(api.event) };
    }
    return runtime.current;
  }, []);

  const warm = useCallback(() => live().session.warm(), [live]);

  const showOutcome = (outcome: Exclude<StartOutcome, { kind: 'ready' }>, funnel: Funnel) => {
    if (outcome.kind === 'limit') {
      funnel.limitHit(outcome.code);
      setStatus({ kind: 'message', code: outcome.code, tone: 'limit', ...(outcome.resetsAt ? { resetsAt: outcome.resetsAt } : {}) });
    } else if (outcome.kind === 'refused') {
      funnel.error('topic_refused');
      setStatus({ kind: 'message', code: 'topic_refused', tone: 'error' });
    } else {
      if (outcome.code !== 'topic_length' && outcome.code !== 'aborted') funnel.error(outcome.code);
      setStatus({ kind: 'message', code: outcome.code, tone: 'error' });
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind === 'working') return;
    const { api, session, funnel } = live();
    session.warm();
    const problem = topicProblem(topic);
    if (problem) {
      setStatus({ kind: 'message', code: problem, tone: 'error' });
      return;
    }
    // The person submitted the form: the funnel's first step, whatever the server says next.
    funnel.toolStarted('presentation', { slides, audience, shape: 'free', inapp: inApp ?? 'none' });
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    const startedAt = Date.now();
    setStatus({ kind: 'working', step: 'check', startedAt });

    const outcome = await startFreeDeck({ topic, audience, slides }, locale, {
      api,
      session,
      token: (action, siteKey) =>
        turnstileBox.current
          ? turnstileToken({ container: turnstileBox.current, siteKey, action, signal: controller.signal })
          : Promise.resolve({ ok: false as const, code: 'turnstile_unavailable' as const }),
      requestId: () => newRequestId(randomId),
      onPhase: (phase) => setStatus({ kind: 'working', step: phase, startedAt }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (outcome.kind !== 'ready') {
      showOutcome(outcome, funnel);
      return;
    }

    session.refreshMe();
    // The new deck replaces the last one: its pictures stop and their object URLs go.
    drawing.current?.abort();
    const pictureRun = new AbortController();
    drawing.current = pictureRun;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setPictures(new Map<number, PictureState>(outcome.images.map((image) => [image.index, { status: 'loading' }])));
    setDownload(outcome.images.length ? 'waiting' : 'idle');
    setResult({ job: outcome.job, task: outcome.task, deck: outcome.deck, aiLabel: outcome.aiLabel });
    setStatus({ kind: 'idle' });
    funnel.resultReady('presentation', 'free', { slides: outcome.deck.slides.length, audience, seconds: Math.round((Date.now() - startedAt) / 1000) });
    if (!outcome.images.length) return;

    await drawPictures(
      api,
      outcome.job.jobId,
      outcome.images,
      (index, blob) => {
        if (pictureRun.signal.aborted) return;
        let state: PictureState = { status: 'none' };
        if (blob) {
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          state = { status: 'ready', url, blob };
        }
        setPictures((current) => new Map(current).set(index, state));
      },
      pictureRun.signal,
    );
    if (!pictureRun.signal.aborted) setDownload('idle');
  };

  const onDownload = async () => {
    if (!result || download === 'building' || download === 'waiting') return;
    setDownload('building');
    try {
      const encoded = new Map<number, string>();
      for (const [index, picture] of pictures) {
        if (picture.status === 'ready') encoded.set(index, await blobToBase64(picture.blob));
      }
      const blob = await buildDeck({ locale, deck: result.deck, palette: result.task.palette, pictures: encoded, aiLabel: result.aiLabel });
      saveFile(blob, deckFileName(result.task.topic));
      live().funnel.download('presentation', encoded.size);
      setDownload('saved');
    } catch {
      live().funnel.error('build_failed');
      setDownload('failed');
    }
  };

  const working = status.kind === 'working';
  const message =
    status.kind === 'message'
      ? `${texts.messages[messageKey(status.code)]}${status.code === 'free_limit' ? ` ${texts.resetAt(tashkentTime(status.resetsAt))}` : ''}`
      : '';

  return (
    <div className="st:scheme-dark st:rounded-2xl st:border st:border-studio-line st:bg-studio-surface st:p-4 st:text-studio-text st:sm:p-6" data-studio-tool="presentation">
      <form className="ym-disable-submit st:space-y-4" method="post" noValidate onSubmit={onSubmit} onFocusCapture={warm} aria-busy={working}>
        <div>
          <label htmlFor={`${id}-topic`} className={LABEL}>
            {texts.topicLabel}
          </label>
          <input
            id={`${id}-topic`}
            name="topic"
            type="text"
            className={`ym-disable-keys ${FIELD}`}
            placeholder={texts.topicPlaceholder}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={TOPIC_MAX}
            autoComplete="off"
            enterKeyHint="go"
            aria-describedby={`${id}-hint`}
            disabled={working}
          />
          <p id={`${id}-hint`} className="st:mt-1 st:text-xs st:text-studio-muted">
            {texts.topicHint}
          </p>
        </div>
        <div className="st:grid st:grid-cols-[1fr_auto] st:gap-3">
          <div>
            <label htmlFor={`${id}-audience`} className={LABEL}>
              {texts.audienceLabel}
            </label>
            <select
              id={`${id}-audience`}
              name="audience"
              className={FIELD}
              value={audience}
              onChange={(event) => setAudience(event.target.value as StudioAudience)}
              disabled={working}
            >
              {AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {texts.audience[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-slides`} className={LABEL}>
              {texts.slidesLabel}
            </label>
            <select
              id={`${id}-slides`}
              name="slides"
              className={FIELD}
              value={slides}
              onChange={(event) => setSlides(Number(event.target.value))}
              disabled={working}
            >
              {SLIDE_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        {inApp ? <InAppNotice texts={texts} /> : null}
        <button
          type="submit"
          disabled={!hydrated || working}
          className="st:w-full st:rounded-xl st:bg-linear-to-br st:from-studio-blue st:to-studio-cyan st:px-4 st:py-3.5 st:text-base st:font-semibold st:text-studio-bg st:transition-opacity st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan"
        >
          {working ? texts.submitBusy : texts.submit}
        </button>
        <p className="st:text-xs st:leading-snug st:text-studio-muted">{texts.freeNote}</p>
        <div ref={turnstileBox} className="st:flex st:justify-center st:empty:hidden" data-studio-turnstile="" />
        <p
          role="status"
          aria-live="polite"
          className={status.kind === 'message' && status.tone === 'limit' ? 'st:text-sm st:text-studio-saffron' : 'st:text-sm st:text-studio-danger'}
          data-studio-message={status.kind === 'message' ? status.code : ''}
        >
          {message}
        </p>
      </form>
      {status.kind === 'working' ? <Progress texts={texts} step={status.step} startedAt={status.startedAt} /> : null}
      {result ? (
        <Preview
          texts={texts}
          deck={result.deck}
          pictures={pictures}
          actions={<Download texts={texts} state={download} inApp={inApp} onDownload={() => void onDownload()} />}
        />
      ) : null}
    </div>
  );
}
