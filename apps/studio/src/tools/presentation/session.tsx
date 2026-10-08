/** @jsxRuntime automatic @jsxImportSource react */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { type SignedImagePrompt, type StudioApi, type StudioAudience, type StudioLocale, type StudioPublicConfig } from '../../api';
import { captureLastTouch } from '../../attribution';
import { randomId, type Funnel } from '../../analytics';
import { type StudioSession } from '../../config';
import { billingRuntime, watchMe } from '../../billing/runtime';
import { turnstileToken } from '../../identity';
import { currentInApp, INAPP_ATTRIBUTE, type InAppBrowser } from '../../inapp';
import type { IslandSlots } from '../../slots';
import type { PresentationResult, PresentationSnapshot } from '../../embedded/artifact-store';
import { createFullDeckApi, fullUnitsLeft, type FullDeckApi } from './api';
import { saveFile, type DownloadState } from './Download';
import { drawPictures, FREE_SLIDES, FULL_SLIDES_INITIAL, newRequestId, regenerateFullDeck, startFreeDeck, startFullDeck, TOPIC_MAX, topicProblem, type FullOutcome, type FullProgress, type StartOutcome } from './flow';
import { type PictureState } from './Preview';
import { type DeckChoice } from './ShapePicker';
import { applyPresentationEdit, type PresentationEdit } from './editing';
import { freeAgainToday, fullMessage, FULL_TEXTS, messageKey, tashkentTime, TEXTS, UNIT_BACK, UNTIL_RESET, type Step } from './texts';

export interface PresentationSessionProps {
  readonly locale: StudioLocale;
  readonly slots?: IslandSlots;
  /** Supplied only by the embedded adapter; a restored snapshot never starts a job. */
  readonly embedding?: {
    readonly initialTopic?: string;
    readonly initialSnapshot?: PresentationSnapshot | null;
    readonly returning?: boolean;
    readonly onSnapshot: (snapshot: PresentationSnapshot) => void;
  };
}

export const AUDIENCES: readonly StudioAudience[] = ['maktab', 'talaba', 'umumiy'];
export const SLIDE_CHOICES: readonly number[] = [6, 5, 4];

interface Runtime {
  readonly api: StudioApi;
  readonly full: FullDeckApi;
  readonly session: StudioSession;
  readonly funnel: Funnel;
}

type Result = PresentationResult;

/** The form's own line: idle, a deck in the making, or a message after a failed start. A result is kept apart. */
type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'interrupted' }
  /** `full`: a full deck (or its regeneration) is being made: its own steps. */
  | { readonly kind: 'working'; readonly step: Step; readonly startedAt: number; readonly full?: boolean }
  /** `full`: after a full deck's run; `unitBack`: a server fault once its job existed, so the unit comes back. */
  | { readonly kind: 'message'; readonly code: string; readonly resetsAt?: string; readonly tone: 'limit' | 'error'; readonly full?: boolean; readonly unitBack?: boolean }
  /** A deck just arrived: the hidden status line says so. */
  | { readonly kind: 'ready' };


function fullSlideChoices(config: StudioPublicConfig | null): number[] {
  const max = config?.shapes.full.maxSlides ?? FULL_SLIDES_INITIAL;
  const min = config?.shapes.full.minSlides ?? 6;
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => max - i);
}

/** Shared controller. Its owner outlives workspace visibility and viewport changes. */
export function usePresentationSession({ locale, slots, embedding }: PresentationSessionProps) {
  const texts = TEXTS[locale];
  const full = FULL_TEXTS[locale];
  const id = useId();
  // The adapter keys this component by owner/artifact and validates storage before mounting it.
  const [initial] = useState(() => embedding?.initialSnapshot?.locale === locale ? embedding.initialSnapshot : null);
  const embedded = embedding !== undefined;
  const [hydrated, setHydrated] = useState(false);
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [topic, setTopic] = useState(initial?.draft.topic ?? embedding?.initialTopic?.slice(0, TOPIC_MAX) ?? '');
  const [audience, setAudience] = useState<StudioAudience>(initial?.draft.audience ?? 'maktab');
  const [slides, setSlides] = useState<number>(initial?.draft.slides ?? FREE_SLIDES.initial);
  const [shape, setShape] = useState<DeckChoice>(initial?.draft.shape ?? 'free');
  const [palette, setPalette] = useState(initial?.draft.palette ?? 1);
  // /config and /me once asked for (first focus or submit): the picker and the units line read them.
  const [config, setConfig] = useState<StudioPublicConfig | null>(null);
  const [unitsLeft, setUnitsLeft] = useState<number | null>(null);
  const [parts, setParts] = useState<FullProgress | null>(null);
  const [status, setStatus] = useState<Status>(() => initial?.status.kind === 'working' ? { kind: 'interrupted' } : initial?.status ?? { kind: 'idle' });
  // The last deck stays on the page (with its pictures and its download)
  // until a new one replaces it: a second try that hits the day's limit
  // never takes the first deck away.
  const [result, setResult] = useState<Result | null>(initial?.result ?? null);
  const [pictures, setPictures] = useState<ReadonlyMap<number, PictureState>>(new Map());
  const [download, setDownload] = useState<DownloadState>('waiting');
  const runtime = useRef<Runtime | null>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const topicField = useRef<HTMLInputElement>(null);
  const audienceField = useRef<HTMLSelectElement>(null);
  const slidesField = useRef<HTMLSelectElement>(null);
  const run = useRef<AbortController | null>(null);
  const operationRunning = useRef(false);
  const lifetime = useRef(0);
  const mounted = useRef(false);
  // Pictures by job: a full deck draws its pictures while its parts are
  // written, before it replaces the deck on the page.
  const drawings = useRef(new Map<string, { readonly stop: AbortController; readonly map: Map<number, PictureState>; readonly urls: string[]; done: boolean }>());
  const shown = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    lifetime.current++;
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
    const root = embedded ? null : document.getElementById('studio-root');
    if (root) root.dataset.island = 'ready';
    const jobs = drawings.current;
    if (initial?.result) {
      const map = new Map<number, PictureState>();
      const urls: string[] = [];
      for (const picture of initial.pictures) {
        if (picture.status === 'ready') {
          const url = URL.createObjectURL(picture.blob);
          urls.push(url);
          map.set(picture.index, { status: 'ready', blob: picture.blob, url });
        } else map.set(picture.index, { status: 'none' });
      }
      shown.current = initial.result.job.jobId;
      jobs.set(initial.result.job.jobId, { stop: new AbortController(), map, urls, done: true });
      setPictures(map);
      setDownload('idle');
    }
    return () => {
      mounted.current = false;
      // This numeric generation ref deliberately invalidates late async work.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      lifetime.current++;
      run.current?.abort();
      for (const drawing of jobs.values()) {
        drawing.stop.abort();
        for (const url of drawing.urls) URL.revokeObjectURL(url);
      }
      jobs.clear();
    };
  }, [embedded, initial]);

  const onSnapshot = embedding?.onSnapshot;
  useEffect(() => {
    if (!hydrated || !onSnapshot) return;
    onSnapshot({ version: 1, locale, draft: { topic, audience, slides, shape, palette }, result,
      status: status.kind === 'working' ? { kind: 'working' } : status,
      pictures: [...pictures].map(([index, picture]) => picture.status === 'ready'
        ? { index, status: 'ready', blob: picture.blob } : { index, status: picture.status }),
    });
  }, [hydrated, onSnapshot, locale, topic, audience, slides, shape, palette, result, status, pictures]);

  /** API, session and funnel, made on first use: none of them calls anything until asked. */
  const live = useCallback((): Runtime => {
    if (!runtime.current) {
      runtime.current = { ...billingRuntime(), full: createFullDeckApi() };
    }
    return runtime.current;
  }, []);

  /** /me again (after a deck), and what it says about full decks left. */
  const readUnits = useCallback((session: StudioSession) => {
    const epoch = lifetime.current;
    void session.me().then((me) => {
      if (mounted.current && lifetime.current === epoch && me.ok) setUnitsLeft(fullUnitsLeft(me.data));
    });
  }, []);

  const warm = useCallback(() => {
    const epoch = lifetime.current;
    const { session } = live();
    session.warm();
    void session.config().then((answer) => {
      if (mounted.current && lifetime.current === epoch && answer.ok) setConfig(answer.data);
    });
    readUnits(session);
  }, [live, readUnits]);

  const returning = embedding?.returning === true;
  useEffect(() => embedded ? watchMe(me => setUnitsLeft(fullUnitsLeft(me))) : undefined, [embedded]);
  useEffect(() => {
    if (embedded) {
      live().session.refreshMe();
      warm();
    }
  }, [embedded, returning, initial, live, warm]);

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
      if (mounted.current && shown.current === jobId && !stop.signal.aborted) setDownload('idle');
    };
    if (!images.length) return Promise.resolve();
    // drawPictures settles every picture by PICTURE_DEADLINE_MS: the download never waits longer.
    return drawPictures(
      api,
      jobId,
      images,
      (index, blob) => {
        if (!mounted.current || stop.signal.aborted) return;
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
  const performFull = async (original?: Result) => {
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

  const runFull = async (original?: Result) => {
    if (operationRunning.current) return;
    operationRunning.current = true;
    try { await performFull(original); }
    finally { operationRunning.current = false; }
  };

  const performSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
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
      onPhase: (phase) => { if (mounted.current && !controller.signal.aborted) setStatus({ kind: 'working', step: phase, startedAt }); },
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

  const onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (shape === 'full') { await runFull(); return; }
    if (operationRunning.current) return;
    operationRunning.current = true;
    try { await performSubmit(event); }
    finally { operationRunning.current = false; }
  };

  const onDownload = async () => {
    if (!result || download === 'building' || download === 'waiting') return;
    setDownload('building');
    const epoch = lifetime.current;
    try {
      const encoded = new Map<number, string>();
      for (const [index, picture] of pictures) {
        if (picture.status === 'ready') encoded.set(index, await (await import('../../pptx/build')).blobToBase64(picture.blob));
      }
      const { buildDeck, deckFileName } = await import('../../pptx/build');
      const blob = await buildDeck({ locale, deck: result.deck, palette: result.exportPalette ?? result.task.palette, pictures: encoded, aiLabel: result.aiLabel });
      if (!mounted.current || lifetime.current !== epoch) return;
      saveFile(blob, deckFileName(result.task.topic));
      // The browser was asked to save it; nothing says it did (in-app WebViews, a cancelled iOS sheet).
      live().funnel.download('presentation', encoded.size, inApp ?? 'none');
      setDownload('started');
    } catch {
      if (!mounted.current || lifetime.current !== epoch) return;
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
  if (status.kind === 'interrupted') message = locale === 'ru'
    ? 'Создание было прервано. Автоматически оно не продолжается. Проверьте остаток пакета перед новым запуском.'
    : 'Yaratish uzilgan. U avtomatik davom ettirilmaydi. Qayta boshlashdan oldin paket qoldig‘ini tekshiring.';
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

  const edit = (command: PresentationEdit): boolean => {
    if (!result || working || download === 'building') return false;
    const next = applyPresentationEdit(result, command);
    if (!next) return false;
    setResult(next);
    setDownload('idle');
    return true;
  };
  return { locale, texts, full, id, embedded, hydrated, inApp, topic, setTopic, audience, setAudience, audiences: AUDIENCES, slides, setSlides, shape, chooseShape, palette, setPalette,
    config, unitsLeft, parts, status, result, pictures, download, working, fullOpen, fullChosen, limitCard, message, announce, slideChoices, canRegenerate,
    topicField, audienceField, slidesField, turnstileBox, warm, onSubmit, onDownload, runFull, edit };
}

export type PresentationSession = ReturnType<typeof usePresentationSession>;

