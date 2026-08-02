import { useState, type FormEvent } from 'react';
import { Button, Icon, Modal } from './ui';
import { formatBudget, formatPrice, t } from '../lib/i18n';
import { VOICE_CAPTURE_LIMITS, formatVoiceTimer } from '../lib/voice';
import type { Locale, VoiceInterpretation } from '../types';

export type VoiceStage =
  | 'closed'
  | 'intro'
  | 'requesting'
  | 'recording'
  | 'processing'
  | 'error';

export type VoiceErrorKind =
  | 'denied'
  | 'unsupported'
  | 'unclear'
  | 'too_short'
  | 'unavailable'
  | 'rate_limited'
  | 'network';

const ERROR_COPY: Record<VoiceErrorKind, { title: 'voiceDeniedTitle' | 'voiceUnsupportedTitle' | 'voiceUnclearTitle' | 'voiceUnavailableTitle' | 'errorTitle'; body: 'voiceDeniedBody' | 'voiceUnsupportedBody' | 'voiceUnclearBody' | 'voiceTooShortBody' | 'voiceUnavailableBody' | 'voiceLimitBody' | 'errorBody'; canRetry: boolean }> = {
  denied: { title: 'voiceDeniedTitle', body: 'voiceDeniedBody', canRetry: false },
  unsupported: { title: 'voiceUnsupportedTitle', body: 'voiceUnsupportedBody', canRetry: false },
  unclear: { title: 'voiceUnclearTitle', body: 'voiceUnclearBody', canRetry: true },
  too_short: { title: 'voiceUnclearTitle', body: 'voiceTooShortBody', canRetry: true },
  unavailable: { title: 'voiceUnavailableTitle', body: 'voiceUnavailableBody', canRetry: false },
  rate_limited: { title: 'voiceUnavailableTitle', body: 'voiceLimitBody', canRetry: false },
  network: { title: 'errorTitle', body: 'errorBody', canRetry: true },
};

/**
 * Loudness meter. It is decorative for sighted users and hidden from assistive
 * technology — the recording state itself is announced through the status line
 * instead, so a screen-reader user is never left guessing.
 */
function Waveform({ levels }: { levels: readonly number[] }) {
  const bars = Array.from({ length: VOICE_CAPTURE_LIMITS.levelBars }, (_, index) => {
    const offset = levels.length - VOICE_CAPTURE_LIMITS.levelBars + index;
    return offset >= 0 ? levels[offset] ?? 0.05 : 0.05;
  });
  return (
    <div className="voice-wave" aria-hidden="true">
      {bars.map((level, index) => (
        <span key={index} style={{ transform: `scaleY(${Math.max(0.06, level).toFixed(3)})` }} />
      ))}
    </div>
  );
}

export function VoiceSheet({
  locale,
  stage,
  error,
  levels,
  elapsedMs,
  onAllow,
  onStop,
  onCancel,
  onRetry,
  onTypeInstead,
}: {
  locale: Locale;
  stage: VoiceStage;
  error: VoiceErrorKind | null;
  levels: readonly number[];
  elapsedMs: number;
  onAllow: () => void;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onTypeInstead: () => void;
}) {
  const remaining = VOICE_CAPTURE_LIMITS.maxDurationMs - elapsedMs;
  const closing = remaining <= VOICE_CAPTURE_LIMITS.maxDurationMs
    - VOICE_CAPTURE_LIMITS.countdownFromMs;
  return (
    <Modal
      open={stage !== 'closed'}
      title={t(locale, 'voiceSearch')}
      onClose={onCancel}
      closeLabel={t(locale, 'close')}
      sheet
    >
      <div className="stack voice-sheet">
        {stage === 'intro' || stage === 'requesting' ? (
          <div className="stack voice-intro">
            <span className="voice-orb voice-orb--idle" aria-hidden="true">
              <Icon name="mic" size={30} />
            </span>
            <h3>{t(locale, 'voiceIntroTitle')}</h3>
            <p className="muted">{t(locale, 'voiceIntroBody')}</p>
            <p className="voice-example">{t(locale, 'voiceExample')}</p>
            <Button wide pending={stage === 'requesting'} onClick={onAllow}>
              <Icon name="mic" size={19} />{t(locale, 'voiceAllow')}
            </Button>
            <Button wide variant="ghost" onClick={onTypeInstead}>
              {t(locale, 'voiceTypeInstead')}
            </Button>
          </div>
        ) : null}

        {stage === 'recording' ? (
          <div className="stack voice-live">
            <p className="voice-status" role="status">{t(locale, 'voiceListening')}</p>
            <span className="voice-orb voice-orb--live" aria-hidden="true">
              <Icon name="mic" size={30} />
            </span>
            <Waveform levels={levels} />
            <p className={closing ? 'voice-timer voice-timer--closing' : 'voice-timer'}>
              <span>{formatVoiceTimer(elapsedMs)}</span>
              <small>{t(locale, 'voiceMaxHint')}</small>
            </p>
            <Button wide onClick={onStop}>
              <Icon name="stop" size={19} />{t(locale, 'voiceStop')}
            </Button>
            <Button wide variant="ghost" onClick={onCancel}>{t(locale, 'cancel')}</Button>
          </div>
        ) : null}

        {stage === 'processing' ? (
          <div className="stack voice-live">
            <span className="voice-orb voice-orb--busy" aria-hidden="true">
              <span className="spinner" />
            </span>
            <p className="voice-status" role="status">{t(locale, 'voiceProcessing')}</p>
            <Button wide variant="ghost" onClick={onCancel}>{t(locale, 'cancel')}</Button>
          </div>
        ) : null}

        {stage === 'error' && error ? (
          <div className="stack voice-live">
            <span className="voice-orb voice-orb--error" aria-hidden="true">
              <Icon name="warning" size={28} />
            </span>
            <h3 role="alert">{t(locale, ERROR_COPY[error].title)}</h3>
            <p className="muted">{t(locale, ERROR_COPY[error].body)}</p>
            {ERROR_COPY[error].canRetry ? (
              <Button wide onClick={onRetry}>
                <Icon name="mic" size={19} />{t(locale, 'voiceRetry')}
              </Button>
            ) : null}
            <Button
              wide
              variant={ERROR_COPY[error].canRetry ? 'secondary' : 'primary'}
              onClick={onTypeInstead}
            >
              {t(locale, 'voiceTypeInstead')}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * What Bormi heard and what it did with it. The transcript stays editable and
 * survives every AI failure, so a wrong word costs one correction instead of a
 * new recording.
 */
export function VoiceSummary({
  locale,
  transcript,
  interpretation,
  activeMaxPrice,
  activeAvailability,
  onSubmitTranscript,
  onClearBudget,
  onClearAvailability,
  onConfirmBudget,
  onDismiss,
}: {
  locale: Locale;
  transcript: string;
  interpretation: VoiceInterpretation;
  /** Live filter state, not the frozen transcript: removing a chip has to
   * remove it from the screen as well as from the query. */
  activeMaxPrice: number | null;
  activeAvailability: string;
  onSubmitTranscript: (value: string) => void;
  onClearBudget: () => void;
  onClearAvailability: () => void;
  onConfirmBudget: (accepted: boolean) => void;
  onDismiss: () => void;
}) {
  // Seeded once per transcript: the caller remounts this on a new recording
  // (key={transcript}), so edits survive re-renders but a fresh recording
  // always starts from what Bormi just heard.
  const [draft, setDraft] = useState(transcript);
  // Correction is one tap away, not in the way. The products are the answer;
  // putting an editable transcript and a "Искать" button above them made the
  // machine's reading of the sentence look like the thing to act on, and the
  // shopper pressed it — which threw away everything Bormi had understood and
  // re-ran the raw sentence as plain text.
  const [editing, setEditing] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (value) onSubmitTranscript(value);
  };
  // What actually ran, when Bormi understood something; the raw sentence only
  // when it did not. Never presented as if the shopper typed it — the caption
  // below says it was recognised automatically.
  const headline = interpretation.productQuery || transcript;
  const budget = activeMaxPrice;
  const ambiguousAmount = interpretation.ambiguousPriceMinor;
  const ambiguous = interpretation.clarification === 'budget'
    && ambiguousAmount !== null;
  return (
    <section className="voice-summary" aria-label={t(locale, 'voiceHeard')}>
      <header className="voice-summary__head">
        <span className="voice-summary__badge"><Icon name="mic" size={15} /></span>
        <div className="voice-summary__said">
          <strong>{headline}</strong>
          <small>{t(locale, 'voiceAiNote')}</small>
        </div>
        {editing ? null : (
          <button
            type="button"
            className="chip chip--action voice-summary__edit-action"
            onClick={() => setEditing(true)}
          >
            {t(locale, 'voiceEdit')}
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          onClick={onDismiss}
          aria-label={t(locale, 'close')}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      {editing ? (
        <form className="voice-summary__edit" onSubmit={submit}>
          <label className="sr-only" htmlFor="voice-transcript">
            {t(locale, 'voiceHeard')}
          </label>
          <input
            id="voice-transcript"
            type="search"
            enterKeyHint="search"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit">{t(locale, 'voiceApply')}</Button>
        </form>
      ) : null}

      {ambiguous ? (
        <div className="voice-clarify" role="group" aria-label={t(locale, 'voiceClarifyBudget')}>
          <p>
            <strong>{formatPrice(ambiguousAmount, locale)}</strong>
            {' — '}
            {t(locale, 'voiceClarifyBudget')}
          </p>
          <div className="cluster">
            <button type="button" className="chip chip--action" onClick={() => onConfirmBudget(true)}>
              {t(locale, 'voiceClarifyBudgetYes')}
            </button>
            <button type="button" className="chip chip--action" onClick={() => onConfirmBudget(false)}>
              {t(locale, 'voiceClarifyBudgetNo')}
            </button>
          </div>
        </div>
      ) : null}

      {interpretation.clarification === 'empty_query' ? (
        <p className="voice-summary__hint" role="status">{t(locale, 'voiceClarifyEmpty')}</p>
      ) : null}

      {budget !== null || activeAvailability === 'available' ? (
        <div className="chip-row" role="group" aria-label={t(locale, 'voiceUnderstood')}>
          {budget !== null ? (
            <span className="chip chip--filter">
              {formatBudget(budget, locale)}
              <button
                type="button"
                onClick={onClearBudget}
                aria-label={`${t(locale, 'voiceRemoveConstraint')}: ${formatBudget(budget, locale)}`}
              >
                <Icon name="close" size={15} />
              </button>
            </span>
          ) : null}
          {activeAvailability === 'available' ? (
            <span className="chip chip--filter">
              {t(locale, 'available')}
              <button
                type="button"
                onClick={onClearAvailability}
                aria-label={`${t(locale, 'voiceRemoveConstraint')}: ${t(locale, 'available')}`}
              >
                <Icon name="close" size={15} />
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
