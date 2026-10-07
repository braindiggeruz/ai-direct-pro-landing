/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The photo tool: the island inside #studio-root of /uz/rasmdan-yechim/
 * (T3.3; spec §8, §11.3). main.tsx mounts PhotoIsland({ locale, slots })
 * through import() (BUILD-PLAN contract); static.ts renders the same first
 * state into the page at build time, and the browser hydrates it.
 *
 * The first render reads nothing of the browser: no storage, no clock, no
 * network; the submit button is disabled until hydration (a click before
 * the script ran cannot send the form as a plain POST). After hydration:
 *   - a file chosen before the script ran is read back from the input;
 *   - «Brauzerda oching» stands in the markup for everybody and shows only
 *     where the head script marked <html data-inapp> (styles.css);
 *   - the paid visit is recorded as the last touch (attribution.ts).
 * Still no request: /config and /me are asked on the first focus inside the
 * form or the submit; Turnstile loads on the submit.
 *
 * The run (spec §8.1): the one-time consent (Consent.tsx; localStorage
 * `photo-v1`, else the server's 400 consent_required), the picture shrunk
 * through a canvas to ≤ 1 600 px JPEG ≈ 0.8 (api.ts shrinkPhoto), /config
 * and /me (no free photo left and no tariff with photos → the limit at
 * once, nothing else is called), the identity and a `studio_free_photo`
 * token for a free photo (none for a buyer whose tariff holds photos: the
 * server waives it), then one multipart POST. A lost answer or a fault the
 * server marks `retry` is sent once more with the same request id (the
 * server continues the same job). The answer (Answer.tsx) stays on the page
 * until another photo replaces it; a paid answer may be made once more with
 * the same picture (regenOf), which the island still holds in memory and
 * drops with the result.
 *
 * Webvisor: the form carries `ym-disable-submit`; the answer `ym-hide-content`.
 * Screen readers: a visually hidden status line says each step and then
 * «Tushuntirish tayyor»; the answer's heading takes the focus.
 */
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createStudioApi, type Failure, type StudioApi, type StudioLocale, type StudioMe } from '../../api';
import { captureLastTouch } from '../../attribution';
import { createFunnel, randomId, type Funnel } from '../../analytics';
import { createStudioSession, type StudioSession } from '../../config';
import { obtainIdentity, turnstileToken, type StudioTurnstileAction, type TokenResult } from '../../identity';
import { copyText, currentInApp, INAPP_ATTRIBUTE, pageLink, type InAppBrowser } from '../../inapp';
import type { IslandSlots } from '../../slots';
import { Answer } from './Answer';
import { acceptedPhoto, consentStored, createPhotoApi, shrinkPhoto, storeConsent, type PhotoApi, type PhotoResult } from './api';
import { Capture } from './Capture';
import { Consent } from './Consent';
import { PHOTO_TEXTS, PHOTO_UNIT_BACK, PHOTO_UNTIL_RESET, nextFreeReset, photoMessageKey, tashkentClock, type PhotoModeChoice, type PhotoStep, type PhotoTexts } from './texts';

export interface PhotoIslandProps {
  readonly locale: StudioLocale;
  readonly slots?: IslandSlots;
}

/** The server's action for a free photo (functions/lib/studio/turnstile.ts); identity.ts lists the deck's actions only. */
const FREE_PHOTO_ACTION = 'studio_free_photo' as unknown as StudioTurnstileAction;
export const PHOTO_MODES: readonly PhotoModeChoice[] = ['explain', 'math'];
export const POLICY_HREF: Readonly<Record<StudioLocale, string>> = { uz: '/uz/maxfiylik-siyosati/', ru: '/ru/politika-konfidentsialnosti/' };
/** Request ids the ledger accepts (functions/lib/studio/ledger.ts REQUEST_ID). */
export const newPhotoRequestId = (random: () => string = randomId) => `ph_${random().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`;

interface Runtime {
  readonly api: StudioApi;
  readonly photo: PhotoApi;
  readonly session: StudioSession;
  readonly funnel: Funnel;
}

interface Shown extends PhotoResult {
  /** The shrunk picture, kept for a regeneration only; dropped with the result. */
  readonly blob: Blob;
}

type Status =
  | { readonly kind: 'idle' }
  /** A file is chosen; the person has not given the consent in this browser yet. */
  | { readonly kind: 'consent' }
  | { readonly kind: 'working'; readonly step: PhotoStep; readonly startedAt: number; readonly regen: boolean }
  | { readonly kind: 'message'; readonly code: string; readonly resetsAt?: string; readonly tone: 'limit' | 'error'; readonly unitBack?: boolean }
  | { readonly kind: 'ready' };

const BOX = 'st:scheme-dark st:rounded-2xl st:border st:border-studio-line st:bg-studio-surface st:p-4 st:text-studio-text st:sm:p-6';
const BUTTON =
  'st:w-full st:rounded-xl st:bg-linear-to-br st:from-studio-blue st:to-studio-cyan st:px-4 st:py-3.5 st:text-base st:font-semibold st:text-studio-bg st:transition-opacity st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';
const RADIO = 'st:flex st:items-center st:gap-2 st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3 st:py-2.5 st:text-sm st:text-studio-text st:has-checked:border-studio-blue';
const NOTICE_FOCUS = 'st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-saffron';

const PROGRESS_STEPS: readonly PhotoStep[] = ['shrink', 'check', 'explain'];

/** The steps and the clock while a photo is explained; the clock is aria-hidden (the status line speaks). */
function PhotoProgress({ texts, step, startedAt }: { readonly texts: PhotoTexts; readonly step: PhotoStep; readonly startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let behavior: ScrollBehavior = 'auto';
    try {
      behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    } catch {
      // keep auto
    }
    box.current?.scrollIntoView?.({ block: 'nearest', behavior });
  }, []);
  const current = PROGRESS_STEPS.indexOf(step);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <div ref={box} data-studio-progress="" className="st:mt-4 st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:p-4">
      <ol className="st:space-y-2 st:text-sm">
        {PROGRESS_STEPS.map((name, i) => (
          <li key={name} aria-current={i === current ? 'step' : undefined} className={`st:flex st:items-center st:gap-2 ${i < current ? 'st:text-studio-muted' : i === current ? 'st:font-semibold st:text-studio-text' : 'st:text-studio-muted/60'}`}>
            <span aria-hidden="true" className={`st:size-2.5 st:rounded-full ${i < current ? 'st:bg-studio-cyan' : i === current ? 'st:animate-pulse st:bg-studio-blue' : 'st:bg-studio-line'}`} />
            {texts.steps[name]}
          </li>
        ))}
      </ol>
      <p className="st:mt-3 st:text-xs st:text-studio-muted">
        {texts.progressNote} <span aria-hidden="true" data-studio-seconds="">{texts.seconds(seconds)}</span>
      </p>
    </div>
  );
}

/** «Brauzerda oching» for an in-app browser: in the markup for everybody, displayed by styles.css where <html data-inapp>. */
function InAppRow({ texts }: { readonly texts: PhotoTexts }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onCopy = () => {
    void copyText(pageLink(window.location)).then((copied) => setCopy(copied ? 'copied' : 'failed'));
  };
  return (
    <div className="st:rounded-xl st:border st:border-studio-saffron/50 st:bg-studio-saffron/10 st:px-3 st:py-1.5 st:text-sm st:text-studio-text" role="note" data-studio-inapp="" data-studio-inapp-slot="">
      <div className="st:flex st:flex-wrap st:items-center st:justify-between st:gap-x-2 st:gap-y-1">
        <span className="st:font-semibold st:text-studio-saffron">{texts.inAppTitle}</span>
        <button type="button" onClick={onCopy} aria-label={texts.copyLink} className={`st:shrink-0 st:rounded-md st:border st:border-studio-saffron/60 st:px-2 st:text-xs st:leading-4 st:font-semibold st:text-studio-saffron ${NOTICE_FOCUS}`}>
          {texts.copyShort}
        </button>
        {copy === 'idle' ? null : (
          <span className="st:block st:basis-full st:text-xs st:text-studio-muted" role="status">
            {copy === 'copied' ? texts.copied : texts.copyFailed}
          </span>
        )}
      </div>
      <p className="st:mt-1 st:text-xs st:leading-relaxed st:text-studio-muted">{texts.inAppBody}</p>
    </div>
  );
}

export function PhotoIsland({ locale, slots }: PhotoIslandProps) {
  const texts = PHOTO_TEXTS[locale];
  const id = useId();
  const [hydrated, setHydrated] = useState(false);
  const [inApp, setInApp] = useState<InAppBrowser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<PhotoModeChoice>('explain');
  const [me, setMe] = useState<StudioMe | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [result, setResult] = useState<Shown | null>(null);
  const runtime = useRef<Runtime | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const run = useRef<AbortController | null>(null);

  useEffect(() => {
    const chosen = fileInput.current?.files?.[0];
    if (chosen && acceptedPhoto(chosen)) setFile(chosen);
    setHydrated(true);
    const browser = currentInApp();
    setInApp(browser);
    if (browser && !document.documentElement.hasAttribute(INAPP_ATTRIBUTE)) document.documentElement.setAttribute(INAPP_ATTRIBUTE, browser);
    captureLastTouch();
    const root = document.getElementById('studio-root');
    if (root) root.dataset.island = 'ready';
    return () => run.current?.abort();
  }, []);

  /** API, session and funnel, made on first use: none of them calls anything until asked. */
  const live = useCallback((): Runtime => {
    if (!runtime.current) {
      const api = createStudioApi();
      runtime.current = { api, photo: createPhotoApi(), session: createStudioSession(api), funnel: createFunnel(api.event) };
    }
    return runtime.current;
  }, []);

  /** The first focus inside the form: /config and /me start loading, nothing more. */
  const warm = useCallback(() => {
    const { session } = live();
    session.warm();
    void session.me().then((answer) => {
      if (answer.ok) setMe(answer.data);
    });
  }, [live]);

  const tokenFor = (action: StudioTurnstileAction, siteKey: string, signal: AbortSignal): Promise<TokenResult> =>
    turnstileBox.current
      ? turnstileToken({ container: turnstileBox.current, siteKey, action, signal })
      : Promise.resolve({ ok: false as const, code: 'turnstile_unavailable' as const });

  const showFailure = (failure: Failure, funnel: Funnel) => {
    const limit = PHOTO_UNTIL_RESET.has(failure.code) || failure.code === 'no_units';
    if (limit) funnel.limitHit(failure.code);
    else funnel.error(failure.code);
    setStatus({
      kind: 'message',
      code: failure.code,
      ...(failure.resetsAt ? { resetsAt: failure.resetsAt } : {}),
      tone: limit ? 'limit' : 'error',
      // A server fault once the job existed (the server says whether a call is left): the unit comes back.
      unitBack: PHOTO_UNIT_BACK.has(failure.code) && typeof failure.retry === 'boolean',
    });
  };

  /** The run: shrink, /config and /me, identity and token, the POST (once more after a lost answer or a marked fault). */
  const explain = async (regen: boolean) => {
    const { api, photo, session, funnel } = live();
    const source = regen ? result : file;
    if (!source) return;
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    const startedAt = Date.now();
    funnel.toolStarted('photo', { shape: regen ? 'regen' : mode, inapp: inApp ?? 'none' });
    setStatus({ kind: 'working', step: 'shrink', startedAt, regen });
    const blob = regen ? (source as Shown).blob : await shrinkPhoto(source as File);
    if (controller.signal.aborted) return;
    if (!blob) {
      funnel.error('file_large');
      setStatus({ kind: 'message', code: 'file_large', tone: 'error' });
      return;
    }

    setStatus({ kind: 'working', step: 'check', startedAt, regen });
    session.warm();
    const [config, known] = await Promise.all([session.config(), session.me()]);
    if (controller.signal.aborted) return;
    if (!config.ok) {
      showFailure({ ...config, code: config.code === 'not_found' ? 'photo_closed' : config.code }, funnel);
      return;
    }
    if (!config.data.tools.photo) {
      showFailure({ ok: false, status: 404, code: 'photo_closed' }, funnel);
      return;
    }
    if (known.ok) setMe(known.data);
    const hasPhotos = known.ok && (known.data.entitlements ?? []).some((tariff) => tariff.photosLeft > 0);
    if (!regen && known.ok && known.data.free.photo.left <= 0 && !hasPhotos) {
      const openUntil = known.data.free.photo.openUntil;
      showFailure(openUntil ? { ok: false, status: 409, code: 'job_in_progress', resetsAt: openUntil } : { ok: false, status: 429, code: 'free_limit', resetsAt: nextFreeReset(Date.now()) }, funnel);
      return;
    }

    let token: string | undefined;
    const needsToken = !regen && !hasPhotos;
    const obtainToken = async (): Promise<boolean> => {
      const siteKey = config.data.turnstileSiteKey;
      if (!siteKey) {
        showFailure({ ok: false, status: 503, code: 'studio_busy' }, funnel);
        return false;
      }
      const identity = known.ok ? known.data.identity : false;
      if (!identity) {
        const issued = await obtainIdentity(api, (action) => tokenFor(action, siteKey, controller.signal));
        if (!issued.ok) {
          showFailure({ ok: false, status: 403, code: issued.code }, funnel);
          return false;
        }
      }
      const pass = await tokenFor(FREE_PHOTO_ACTION, siteKey, controller.signal);
      if (!pass.ok) {
        showFailure({ ok: false, status: 403, code: pass.code }, funnel);
        return false;
      }
      token = pass.token;
      return true;
    };
    if (needsToken && !(await obtainToken())) return;
    if (controller.signal.aborted) return;

    setStatus({ kind: 'working', step: 'explain', startedAt, regen });
    const requestId = newPhotoRequestId();
    const call = { image: blob, requestId, mode, locale, ...(regen ? { regenOf: (source as Shown).jobId } : {}) };
    let answer = await photo.explain({ ...call, ...(token ? { turnstileToken: token } : {}) }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!answer.ok && answer.code === 'identity_required' && needsToken) {
      // The cookie was lost: a new identity, a new token, the same request id.
      known.ok && setMe({ ...known.data, identity: false });
      if (!(await obtainToken())) return;
      answer = await photo.explain({ ...call, ...(token ? { turnstileToken: token } : {}) }, { signal: controller.signal });
    } else if (!answer.ok && (answer.retry === true || answer.code === 'network' || answer.code === 'timeout')) {
      // The server continues the same job (no second unit, no second Turnstile).
      answer = await photo.explain(call, { signal: controller.signal });
    }
    if (controller.signal.aborted) return;
    session.refreshMe();
    if (!answer.ok) {
      showFailure(answer, funnel);
      return;
    }
    setResult({ ...answer.data, blob });
    setStatus({ kind: 'ready' });
    funnel.resultReady('photo', answer.data.source === 'free' ? 'free' : 'paid', { seconds: Math.round((Date.now() - startedAt) / 1000) });
    void session.me().then((again) => {
      if (again.ok) setMe(again.data);
    });
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    if (chosen && !acceptedPhoto(chosen)) {
      setFile(null);
      setStatus({ kind: 'message', code: 'file_type', tone: 'error' });
      return;
    }
    setFile(chosen);
    if (status.kind !== 'working') setStatus({ kind: 'idle' });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status.kind === 'working') return;
    if (!file) {
      setStatus({ kind: 'message', code: 'file_type', tone: 'error' });
      return;
    }
    if (!consentStored()) {
      setStatus({ kind: 'consent' });
      return;
    }
    void explain(false);
  };

  const onConsent = () => {
    storeConsent();
    void explain(false);
  };

  const onAnother = () => {
    run.current?.abort();
    setResult(null);
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    setStatus({ kind: 'idle' });
    fileInput.current?.focus();
  };

  const working = status.kind === 'working';
  const regenerating = working && status.regen;
  const limitCard = hydrated && !!slots?.tariffs && status.kind === 'message' && (PHOTO_UNTIL_RESET.has(status.code) || status.code === 'no_units');
  let message = '';
  if (status.kind === 'message') {
    const key = photoMessageKey(status.code);
    if (key === 'job_in_progress' && status.resetsAt) message = texts.jobOpenUntil(tashkentClock(status.resetsAt));
    else message = `${texts.messages[key]}${PHOTO_UNTIL_RESET.has(status.code) && status.resetsAt ? ` ${texts.resetAt(tashkentClock(status.resetsAt))}` : ''}`;
    if (status.unitBack) message = `${message} ${texts.unitBack}`;
  }
  const announce = status.kind === 'working' ? texts.steps[status.step] : status.kind === 'ready' ? texts.steps.ready : '';
  const freeLeft = me?.free.photo.left ?? null;
  const paidPhotos = me?.entitlements?.reduce((sum, tariff) => sum + tariff.photosLeft, 0) ?? 0;
  const unitNote = hydrated && freeLeft === 0 && paidPhotos > 0 ? texts.unitNote(paidPhotos) : null;

  return (
    <div className={BOX} data-studio-tool="photo">
      <form className="ym-disable-submit st:space-y-4" method="post" encType="multipart/form-data" noValidate onSubmit={onSubmit} onFocusCapture={warm} aria-busy={working}>
        <fieldset className="st:space-y-4 st:border-0 st:p-0">
          <legend className="st:sr-only">{texts.legend}</legend>
          <Capture texts={texts} id={id} inputRef={fileInput} disabled={working} chosen={hydrated && file ? file.name : ''} onChange={onPick} />
          <div>
            <p id={`${id}-mode-label`} className="st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text">
              {texts.modeLabel}
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-mode-label`} className="st:grid st:grid-cols-2 st:gap-2">
              {PHOTO_MODES.map((choice) => (
                <label key={choice} className={RADIO}>
                  <input type="radio" name="mode" value={choice} checked={mode === choice} disabled={working} onChange={() => setMode(choice)} className="st:accent-studio-cyan" />
                  {texts.modes[choice]}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <p className="st:flex st:flex-wrap st:items-center st:gap-x-2 st:gap-y-1 st:text-xs st:text-studio-muted">
          <span className="st:rounded-full st:border st:border-studio-saffron/60 st:px-2 st:py-0.5 st:font-semibold st:text-studio-saffron" data-studio-beta="">
            {texts.beta}
          </span>
          <span>{texts.freeNote}</span>
        </p>
        {unitNote ? <p className="st:text-sm st:text-studio-saffron">{unitNote}</p> : null}
        <InAppRow texts={texts} />
        <div ref={turnstileBox} className="st:flex st:justify-center st:empty:hidden" data-studio-turnstile="" />
        <button type="submit" disabled={!hydrated || working} className={BUTTON}>
          {working ? texts.submitBusy : texts.submit}
        </button>
        <p className="st:sr-only" role="status" aria-live="polite" data-studio-announce="">
          {announce}
        </p>
      </form>
      {status.kind === 'consent' ? (
        <div className="st:mt-4">
          <Consent texts={texts} policyHref={POLICY_HREF[locale]} onAccept={onConsent} onDecline={() => setStatus({ kind: 'idle' })} />
        </div>
      ) : null}
      {status.kind === 'working' ? <PhotoProgress texts={texts} step={status.step} startedAt={status.startedAt} /> : null}
      {status.kind === 'message' ? (
        <p role="alert" data-studio-message={status.code} className={`st:mt-4 st:rounded-xl st:border st:px-3.5 st:py-3 st:text-sm ${status.tone === 'limit' ? 'st:border-studio-saffron/50 st:bg-studio-saffron/10 st:text-studio-text' : 'st:border-studio-danger/50 st:bg-studio-danger/10 st:text-studio-text'}`}>
          {message}
        </p>
      ) : null}
      {limitCard ? <div data-studio-slot="limit">{slots?.tariffs?.('limit')}</div> : null}
      {result ? (
        <Answer texts={texts} answer={result.answer} source={result.source} regenAvailable={result.regenAvailable && !regenerating} regenerating={regenerating} onRegenerate={() => void explain(true)} onAnother={onAnother} />
      ) : null}
      {hydrated && result?.source === 'free' && slots?.tariffs ? <div data-studio-slot="after_result">{slots.tariffs('after_result')}</div> : null}
      {hydrated && slots?.myPack ? <div data-studio-slot="my-pack">{slots.myPack()}</div> : null}
    </div>
  );
}
