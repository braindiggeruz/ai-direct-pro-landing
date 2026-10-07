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
 *   - whatever the person typed or chose before the script ran (slow 3G, an
 *     in-app WebView) is read from the fields into the state first, in the
 *     same render that enables the button, so React never writes the empty
 *     first state back over it;
 *   - the submit button is enabled (until then it is disabled, so a click
 *     before the script ran cannot send the form as a plain POST);
 *   - «Brauzerda oching» above the button is already shown from the first
 *     paint in an in-app browser (inapp.ts INAPP_HEAD_SCRIPT, styles.css):
 *     it is in the static markup for everybody, hidden elsewhere, so nothing
 *     shifts; the island only marks <html> itself if a page lacks the script;
 *   - a paid visit is recorded as the last touch (attribution.ts,
 *     localStorage only).
 * Still no network request: /config and /me are asked for on the first
 * focus inside the form or its first submit, and Turnstile loads on submit.
 *
 * The full deck (T3.1). Once /config says it is on, the picker shows the two
 * kinds of deck (ShapePicker); the full one has its own slider (6 to
 * STUDIO_MAX_SLIDES), three palettes and, above the button, «Bu to‘liq
 * taqdimot: 1 ta birlik yechiladi (qoldi: N)» (spec §2.3). It runs the plan,
 * then every part at once (flow.ts startFullDeck), drawing the pictures from
 * the moment the plan is in. A full deck can be made once more, the same
 * task, within 24 hours (flow.ts regenerateFullDeck).
 *
 * The paid stage's slots (main.tsx passes them; T3.2 owns what is inside):
 * the neutral "Tariflar" section after a free deck and on the limit card,
 * where the first line says when the free deck is back (DECISIONS 07.10
 * §1(д)), and "Mening paketim". Nothing in a slot renders before hydration,
 * so the prerendered markup stays the first client render.
 *
 * Webvisor: the form carries `ym-disable-submit`, the topic field
 * `ym-disable-keys`; the preview and download blocks `ym-hide-content`.
 *
 * Screen readers: a visually hidden status line, there from the first
 * render, says each step and then «Taqdimot tayyor»; the deck's heading
 * takes the focus when it arrives (Preview.tsx).
 *
 * Pictures: the download waits for them at most PICTURE_DEADLINE_MS after the
 * deck (the plan, for a full deck; flow.ts drawPictures); then the slides
 * still without one go without.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createStudioApi, type CreatedJob, type Deck, type DeckTask, type SignedImagePrompt, type StudioApi, type StudioAudience, type StudioLocale, type StudioPublicConfig } from '../../api';
import { captureLastTouch } from '../../attribution';
import { createFunnel, randomId, type Funnel } from '../../analytics';
import { createStudioSession, type StudioSession } from '../../config';
import { turnstileToken } from '../../identity';
import { currentInApp, INAPP_ATTRIBUTE, type InAppBrowser } from '../../inapp';
import { blobToBase64, buildDeck, deckFileName } from '../../pptx/build';
import type { IslandSlots } from '../../slots';
import { createFullDeckApi, fullUnitsLeft, type FullDeckApi } from './api';
import { Download, saveFile, type DownloadState } from './Download';
import {
  drawPictures,
  FREE_SLIDES,
  FULL_SLIDES_INITIAL,
  newRequestId,
  regenerateFullDeck,
  startFreeDeck,
  startFullDeck,
  TOPIC_MAX,
  topicProblem,
  type FullOutcome,
  type FullProgress,
  type StartOutcome,
} from './flow';
import { InAppNote, InAppNotice } from './InAppNotice';
import { PartsProgress } from './PartsProgress';
import { Preview, type PictureState } from './Preview';
import { FULL_PROGRESS_STEPS, Progress } from './Progress';
import { ShapePicker, type DeckChoice } from './ShapePicker';
import { freeAgainToday, fullMessage, FULL_TEXTS, messageKey, tashkentTime, TEXTS, UNIT_BACK, UNTIL_RESET, type Step } from './texts';

/** What the paid stage puts into the tool: the Build-0 contract (slots.ts), filled by main.tsx (T3.2). */
export type FormSlots = IslandSlots;

export interface FormProps {
  readonly locale: StudioLocale;
  readonly slots?: IslandSlots;
}

export const AUDIENCES: readonly StudioAudience[] = ['maktab', 'talaba', 'umumiy'];
export const SLIDE_CHOICES: readonly number[] = [6, 5, 4];

interface Runtime {
  readonly api: StudioApi;
  readonly full: FullDeckApi;
  readonly session: StudioSession;
  readonly funnel: Funnel;
}

interface Result {
  readonly job: CreatedJob;
  readonly task: DeckTask;
  readonly deck: Deck;
  readonly aiLabel: boolean;
  readonly shape: DeckChoice;
  /** A regeneration: the job it made again (it has no regeneration of its own). */
  readonly regenOf?: string;
}

/** The form's own line: idle, a deck in the making, or a message after a failed start. A result is kept apart. */
type Status =
  | { readonly kind: 'idle' }
  /** `full`: a full deck (or its regeneration) is being made: its own steps. */
  | { readonly kind: 'working'; readonly step: Step; readonly startedAt: number; readonly full?: boolean }
  /** `full`: after a full deck's run; `unitBack`: a server fault once its job existed, so the unit comes back. */
  | { readonly kind: 'message'; readonly code: string; readonly resetsAt?: string; readonly tone: 'limit' | 'error'; readonly full?: boolean; readonly unitBack?: boolean }
  /** A deck just arrived: the hidden status line says so. */
  | { readonly kind: 'ready' };

const FIELD =
  'st:w-full st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3.5 st:py-3 st:text-base st:text-studio-text st:placeholder:text-studio-muted st:outline-none st:focus:border-studio-blue st:disabled:opacity-60';
const LABEL = 'st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text';
const BUTTON =
  'st:w-full st:rounded-xl st:bg-linear-to-br st:from-studio-blue st:to-studio-cyan st:px-4 st:py-3.5 st:text-base st:font-semibold st:text-studio-bg st:transition-opacity st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';

/** The full deck's slider, longest first: STUDIO_MAX_SLIDES … the shape's minimum. */
function fullSlideChoices(config: StudioPublicConfig | null): number[] {
  const max = config?.shapes.full.maxSlides ?? FULL_SLIDES_INITIAL;
  const min = config?.shapes.full.minSlides ?? 6;
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => max - i);
}

export function Form({ locale, slots }: FormProps) {
  const texts = TEXTS[locale];
  const full = FULL_TEXTS[locale];
  const id = useId();
  const [hydrated, setHydrated] = useState(false);
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<StudioAudience>('maktab');
  const [slides, setSlides] = useState<number>(FREE_SLIDES.initial);
  const [shape, setShape] = useState<DeckChoice>('free');
  const [palette, setPalette] = useState(1);
  // /config and /me once asked for (first focus or submit): the picker and the units line read them.
  const [config, setConfig] = useState<StudioPublicConfig | null>(null);
  const [unitsLeft, setUnitsLeft] = useState<number | null>(null);
  const [parts, setParts] = useState<FullProgress | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // The last deck stays on the page (with its pictures and its download)
  // until a new one replaces it: a second try that hits the day's limit
  // never takes the first deck away.
  const [result, setResult] = useState<Result | null>(null);
  const [pictures, setPictures] = useState<ReadonlyMap<number, PictureState>>(new Map());
  const [download, setDownload] = useState<DownloadState>('waiting');
  const runtime = useRef<Runtime | null>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const topicField = useRef<HTMLInputElement>(null);
  const audienceField = useRef<HTMLSelectElement>(null);
  const slidesField = useRef<HTMLSelectElement>(null);
  const run = useRef<AbortController | null>(null);
  // Pictures by job: a full deck draws its pictures while its parts are
  // written, before it replaces the deck on the page.
  const drawings = useRef(new Map<string, { readonly stop: AbortController; readonly map: Map<number, PictureState>; readonly urls: string[]; done: boolean }>());
  const shown = useRef<string | null>(null);

  useEffect(() => {
    // Typed or chosen before the script ran: into the state, in the same
    // batched render as the rest, so the fields keep it.
    const typed = topicField.current?.value ?? '';
    if (typed) setTopic(typed);
    const chosenAudience = audienceField.current?.value;
    if (chosenAudience && (AUDIENCES as readonly string[]).includes(chosenAudience)) setAudience(chosenAudience as StudioAudience);
    const chosenSlides = Number(slidesField.current?.value);
    if (SLIDE_CHOICES.includes(chosenSlides)) setSlides(chosenSlides);
    setHydrated(true);
    const browser = currentInApp();
    setInApp(browser);
    // A page without the head script still shows the notice (late, but shown).
    if (browser && !document.documentElement.hasAttribute(INAPP_ATTRIBUTE)) document.documentElement.setAttribute(INAPP_ATTRIBUTE, browser);
    captureLastTouch();
    const root = document.getElementById('studio-root');
    if (root) root.dataset.island = 'ready';
    const jobs = drawings.current;
    return () => {
      run.current?.abort();
      for (const drawing of jobs.values()) {
        drawing.stop.abort();
        for (const url of drawing.urls) URL.revokeObjectURL(url);
      }
    };
  }, []);

  /** API, session and funnel, made on first use: none of them calls anything until asked. */
  const live = useCallback((): Runtime => {
    if (!runtime.current) {
      const api = createStudioApi();
      runtime.current = { api, full: createFullDeckApi(), session: createStudioSession(api), funnel: createFunnel(api.event) };
    }
    return runtime.current;
  }, []);

  /** /me again (after a deck), and what it says about full decks left. */
  const readUnits = useCallback((session: StudioSession) => {
    void session.me().then((me) => {
      if (me.ok) setUnitsLeft(fullUnitsLeft(me.data));
    });
  }, []);

  const warm = useCallback(() => {
    const { session } = live();
    session.warm();
    void session.config().then((answer) => {
      if (answer.ok) setConfig(answer.data);
    });
    readUnits(session);
  }, [live, readUnits]);

  const chooseShape = (next: DeckChoice) => {
    setShape(next);
    setSlides(next === 'full' ? Math.min(FULL_SLIDES_INITIAL, config?.shapes.full.maxSlides ?? FULL_SLIDES_INITIAL) : FREE_SLIDES.initial);
  };

  /** Starts drawing a job's pictures into its own map; the page shows them once that job's deck is shown. */
  const drawFor = (api: StudioApi, jobId: string, images: readonly SignedImagePrompt[]): Promise<void> => {
    const stop = new AbortController();
    const drawing = { stop, map: new Map<number, PictureState>(images.map((image) => [image.index, { status: 'loading' }])), urls: [] as string[], done: images.length === 0 };
    drawings.current.set(jobId, drawing);
    const finished = () => {
      drawing.done = true;
      if (shown.current === jobId && !stop.signal.aborted) setDownload('idle');
    };
    if (!images.length) return Promise.resolve();
    // drawPictures settles every picture by PICTURE_DEADLINE_MS: the download never waits longer.
    return drawPictures(
      api,
      jobId,
      images,
      (index, blob) => {
        if (stop.signal.aborted) return;
        let state: PictureState = { status: 'none' };
        if (blob) {
          const url = URL.createObjectURL(blob);
          drawing.urls.push(url);
          state = { status: 'ready', url, blob };
        }
        drawing.map.set(index, state);
        if (shown.current === jobId) setPictures(new Map(drawing.map));
      },
      stop.signal,
    ).then(finished);
  };

  /** A new deck replaces the one on the page: the old pictures stop and their object URLs go. */
  const show = (next: Result) => {
    for (const [jobId, drawing] of drawings.current) {
      if (jobId === next.job.jobId) continue;
      drawing.stop.abort();
      for (const url of drawing.urls) URL.revokeObjectURL(url);
      drawings.current.delete(jobId);
    }
    shown.current = next.job.jobId;
    const drawing = drawings.current.get(next.job.jobId);
    setPictures(new Map(drawing?.map ?? []));
    setDownload(!drawing || drawing.done ? 'idle' : 'waiting');
    setResult(next);
    setStatus({ kind: 'ready' });
  };

  const showOutcome = (outcome: Exclude<StartOutcome, { kind: 'ready' }>, funnel: Funnel) => {
    if (outcome.kind === 'limit') {
      funnel.limitHit(outcome.code);
      setStatus({ kind: 'message', code: outcome.code, tone: 'limit', ...(outcome.resetsAt ? { resetsAt: outcome.resetsAt } : {}) });
    } else if (outcome.kind === 'refused') {
      funnel.error('topic_refused');
      setStatus({ kind: 'message', code: 'topic_refused', tone: 'error' });
    } else {
      if (outcome.code !== 'topic_length' && outcome.code !== 'aborted') funnel.error(outcome.code);
      setStatus({ kind: 'message', code: outcome.code, tone: 'error', ...(outcome.resetsAt ? { resetsAt: outcome.resetsAt } : {}) });
    }
  };

  const showFullOutcome = (outcome: Exclude<FullOutcome, { kind: 'ready' }>, funnel: Funnel) => {
    if (outcome.kind === 'no_units') {
      funnel.limitHit('no_units');
      setUnitsLeft(0);
      setStatus({ kind: 'message', code: 'no_units', tone: 'limit', full: true });
    } else if (outcome.kind === 'refused') {
      funnel.error('topic_refused');
      setStatus({ kind: 'message', code: 'topic_refused', tone: 'error', full: true });
    } else {
      if (outcome.code !== 'topic_length' && outcome.code !== 'aborted') funnel.error(outcome.code);
      const unitBack = outcome.afterJob === true && UNIT_BACK.has(outcome.code);
      setStatus({ kind: 'message', code: outcome.code, tone: 'error', full: true, ...(unitBack ? { unitBack } : {}), ...(outcome.resetsAt ? { resetsAt: outcome.resetsAt } : {}) });
    }
  };

  /** Pictures of jobs that never reached the page (a failed or cancelled run) stop, and their object URLs go. */
  const dropHidden = () => {
    for (const [jobId, drawing] of drawings.current) {
      if (jobId === shown.current) continue;
      drawing.stop.abort();
      for (const url of drawing.urls) URL.revokeObjectURL(url);
      drawings.current.delete(jobId);
    }
  };

  /** A full deck, or its regeneration (`original`): the plan, the parts at once, the pictures from the plan on. */
  const runFull = async (original?: Result) => {
    const { api, full: fullApi, session, funnel } = live();
    session.warm();
    if (!original) {
      const problem = topicProblem(topic);
      if (problem) {
        setStatus({ kind: 'message', code: problem, tone: 'error' });
        return;
      }
    }
    funnel.toolStarted('presentation', { slides: original?.task.slides ?? slides, audience: original?.task.audience ?? audience, shape: 'full', inapp: inApp ?? 'none' });
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    const startedAt = Date.now();
    setStatus({ kind: 'working', step: 'check', startedAt, full: true });
    setParts(null);
    const deps = {
      api,
      full: fullApi,
      session,
      requestId: () => newRequestId(randomId),
      signal: controller.signal,
      onProgress: (progress: FullProgress) => {
        if (controller.signal.aborted) return;
        setParts(progress);
        setStatus({ kind: 'working', step: progress.phase, startedAt, full: true });
      },
      onOutline: (jobId: string, images: readonly SignedImagePrompt[]) => {
        if (!controller.signal.aborted) void drawFor(api, jobId, images);
      },
    };
    const outcome = original
      ? await regenerateFullDeck({ jobId: original.job.jobId, task: original.task }, deps)
      : await startFullDeck({ topic, audience, slides, palette }, locale, deps);
    if (controller.signal.aborted) return;
    setParts(null);
    readUnits(session);
    if (outcome.kind !== 'ready') {
      dropHidden();
      showFullOutcome(outcome, funnel);
      return;
    }
    show({ job: outcome.job, task: outcome.task, deck: outcome.deck, aiLabel: outcome.aiLabel, shape: 'full', ...(outcome.regenOf ? { regenOf: outcome.regenOf } : {}) });
    funnel.resultReady('presentation', 'paid', { slides: outcome.deck.slides.length, audience: outcome.task.audience, seconds: Math.round((Date.now() - startedAt) / 1000) });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind === 'working') return;
    if (shape === 'full') {
      await runFull();
      return;
    }
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
    const drawn = drawFor(api, outcome.job.jobId, outcome.images);
    show({ job: outcome.job, task: outcome.task, deck: outcome.deck, aiLabel: outcome.aiLabel, shape: 'free' });
    funnel.resultReady('presentation', 'free', { slides: outcome.deck.slides.length, audience, seconds: Math.round((Date.now() - startedAt) / 1000) });
    await drawn;
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
      // The browser was asked to save it; nothing says it did (in-app WebViews, a cancelled iOS sheet).
      live().funnel.download('presentation', encoded.size, inApp ?? 'none');
      setDownload('started');
    } catch {
      live().funnel.error('build_failed');
      setDownload('failed');
    }
  };

  const working = status.kind === 'working';
  const fullOpen = hydrated && config?.tools.fullDeck === true;
  const fullChosen = fullOpen && shape === 'full';
  // The limit card of the paid stage: the free day's limit, or no full deck left; the tariffs follow it.
  const limitCard = hydrated && !!slots?.tariffs && status.kind === 'message' && (UNTIL_RESET.has(status.code) || status.code === 'no_units');
  let message = '';
  if (status.kind === 'message') {
    const key = messageKey(status.code);
    const own = status.code === 'no_units' ? full.noUnits : status.full ? fullMessage(locale, status.code) : null;
    if (own) message = own;
    else if (key === 'job_in_progress' && status.resetsAt) message = texts.jobOpenUntil(tashkentTime(status.resetsAt));
    // First line: when the free deck is back (DECISIONS 07.10 §1(д)), then what happened.
    else if (limitCard && UNTIL_RESET.has(status.code)) message = `${full.freeAgain(tashkentTime(status.resetsAt), freeAgainToday(Date.now()))} ${texts.messages[key]}`;
    else message = `${texts.messages[key]}${UNTIL_RESET.has(status.code) ? ` ${texts.resetAt(tashkentTime(status.resetsAt))}` : ''}`;
    if (status.unitBack) message = `${message} ${full.unitBack}`;
  }
  // The hidden status line: the step while a deck is made, then «ready».
  const announce = status.kind === 'working' ? texts.steps[status.step] : status.kind === 'ready' ? texts.steps.ready : '';
  const slideChoices = fullChosen ? fullSlideChoices(config) : SLIDE_CHOICES;
  const canRegenerate = hydrated && result?.shape === 'full' && !result.regenOf && result.job.source === 'entitlement';

  return (
    <div className="st:scheme-dark st:rounded-2xl st:border st:border-studio-line st:bg-studio-surface st:p-4 st:text-studio-text st:sm:p-6" data-studio-tool="presentation">
      <form className="ym-disable-submit st:space-y-4" method="post" noValidate onSubmit={onSubmit} onFocusCapture={warm} aria-busy={working}>
        <div>
          <label htmlFor={`${id}-topic`} className={LABEL}>
            {texts.topicLabel}
          </label>
          <input
            ref={topicField}
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
              ref={audienceField}
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
              ref={slidesField}
              id={`${id}-slides`}
              name="slides"
              className={FIELD}
              value={slides}
              onChange={(event) => setSlides(Number(event.target.value))}
              disabled={working}
            >
              {slideChoices.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        {fullOpen && config ? (
          <ShapePicker
            texts={full}
            locale={locale}
            id={id}
            shape={shape}
            onShape={chooseShape}
            palette={palette}
            onPalette={setPalette}
            maxSlides={config.shapes.full.maxSlides}
            disabled={working}
          />
        ) : null}
        {/* The notice sits 8 px above the button (not the form's 16): in an in-app browser both still fit the first screen. */}
        <div className="st:space-y-2">
          <InAppNotice texts={texts} />
          {fullChosen ? (
            <p className="st:text-sm st:text-studio-text" data-studio-units={unitsLeft ?? ''}>
              {unitsLeft === null ? full.unitNoteUnknown : full.unitNote(unitsLeft)}
            </p>
          ) : null}
          <button type="submit" disabled={!hydrated || working} className={BUTTON}>
            {working ? texts.submitBusy : fullChosen ? full.submit : texts.submit}
          </button>
        </div>
        <InAppNote texts={texts} />
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
        <p role="status" className="st:sr-only" data-studio-announce="">
          {announce}
        </p>
      </form>
      {limitCard ? <div data-studio-slot="limit">{slots?.tariffs?.('limit')}</div> : null}
      {status.kind === 'working' ? (
        status.full ? (
          <Progress
            texts={texts}
            step={status.step}
            startedAt={status.startedAt}
            steps={FULL_PROGRESS_STEPS}
            note={full.progressNote}
            detail={parts && parts.parts > 0 ? <PartsProgress done={parts.partsDone} total={parts.parts} label={full.parts} /> : null}
          />
        ) : (
          <Progress texts={texts} step={status.step} startedAt={status.startedAt} />
        )
      ) : null}
      {result ? (
        <Preview
          texts={texts}
          deck={result.deck}
          pictures={pictures}
          notesLabel={result.shape === 'full' ? full.notesLabel : undefined}
          actions={
            <div className="st:space-y-3">
              <Download texts={texts} state={download} inApp={inApp} onDownload={() => void onDownload()} />
              {canRegenerate ? (
                <div className="st:space-y-1" data-studio-regenerate="">
                  <button
                    type="button"
                    onClick={() => void runFull(result)}
                    disabled={working}
                    className="st:w-full st:rounded-xl st:border st:border-studio-line st:px-4 st:py-3 st:text-sm st:font-semibold st:text-studio-text st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan"
                  >
                    {working ? full.regenerating : full.regenerate}
                  </button>
                  <p className="st:text-xs st:text-studio-muted">{full.regenNote}</p>
                </div>
              ) : null}
            </div>
          }
        />
      ) : null}
      {hydrated && result?.shape === 'free' && slots?.tariffs ? <div data-studio-slot="after_result">{slots.tariffs('after_result')}</div> : null}
      {hydrated && slots?.myPack ? <div data-studio-slot="my-pack">{slots.myPack()}</div> : null}
    </div>
  );
}
