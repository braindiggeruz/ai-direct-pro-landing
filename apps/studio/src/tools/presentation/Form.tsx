/** @jsxRuntime automatic @jsxImportSource react */
import type { ReactNode } from 'react';
import type { StudioAudience } from '../../api';
import type { IslandSlots } from '../../slots';
import { Download } from './Download';
import { InAppNote, InAppNotice } from './InAppNotice';
import { PartsProgress } from './PartsProgress';
import { Preview } from './Preview';
import { FULL_PROGRESS_STEPS, Progress } from './Progress';
import { ShapePicker } from './ShapePicker';
import { TOPIC_MAX } from './flow';
import { usePresentationSession, AUDIENCES, type PresentationSession, type PresentationSessionProps } from './session';
export type { PresentationSession } from './session';
export type FormSlots = IslandSlots;
export interface FormProps extends PresentationSessionProps { readonly render?: (session: PresentationSession) => ReactNode }

const FIELD =
  'st:w-full st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3.5 st:py-3 st:text-base st:text-studio-text st:placeholder:text-studio-muted st:outline-none st:focus:border-studio-blue st:disabled:opacity-60';
const LABEL = 'st:mb-1.5 st:block st:text-sm st:font-medium st:text-studio-text';
const BUTTON =
  'st:w-full st:rounded-xl st:bg-linear-to-br st:from-studio-blue st:to-studio-cyan st:px-4 st:py-3.5 st:text-base st:font-semibold st:text-studio-bg st:transition-opacity st:disabled:opacity-60 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';


export function Form(props: FormProps) {
  const session = usePresentationSession(props);
  if (props.render) return props.render(session);
  const { slots, locale } = props;
  const { texts, full, id, embedded, hydrated, topic, setTopic, audience, setAudience, slides, setSlides, shape, chooseShape, palette, setPalette,
    config, unitsLeft, parts, status, result, pictures, download, working, fullOpen, fullChosen, limitCard, message, announce, slideChoices, canRegenerate,
    topicField, audienceField, slidesField, turnstileBox, warm, onSubmit, onDownload, runFull, inApp } = session;

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
          data-studio-message={status.kind === 'message' ? status.code : status.kind === 'interrupted' ? 'interrupted' : ''}
        >
          {message}
        </p>
        <p role="status" className="st:sr-only" data-studio-announce="">
          {announce}
        </p>
      </form>
      {limitCard || (embedded && fullChosen && unitsLeft === 0 && !working) ? <div data-studio-slot="limit">{slots?.tariffs?.('limit')}</div> : null}
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
              {hydrated && result.shape === 'free' && slots?.tariffs ? <div data-studio-slot="after_result">{slots.tariffs('after_result')}</div> : null}
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
      {hydrated && slots?.myPack ? <div data-studio-slot="my-pack">{slots.myPack()}</div> : null}
    </div>
  );
}
