import { useEffect, useState, type RefObject } from 'react';
import type { ChatStrings } from '../i18n';

/** The send button's icons (chat design §5.3), one path each: an arrow, a stop square, a clock. */
const ARROW = 'M12 19V5m-6 6 6-6 6 6';
export const CLOCK = 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';

export function AiChatInput({ value, onChange, onSend, onStop, disabled, busy, limited, maxChars, t, inputRef, describedBy, placeholder = t.inputPlaceholder }: {
  value: string; onChange: (v: string) => void; onSend: () => void;
  onStop?: () => void; disabled?: boolean; busy?: boolean;
  /** A limit stands: the send button shows a clock and points to the card. */
  limited?: boolean;
  maxChars: number;
  t: ChatStrings; inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Id of what explains why sending is paused (the limit card). */
  describedBy?: string;
  /** What the empty field shows: an example question on a wide resting screen (REV-2). Its name stays t.inputPlaceholder. */
  placeholder?: string;
}) {
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Empty, the field keeps its CSS height: the example question is not text to make room for.
    if (value) el.style.height = Math.min(el.scrollHeight, 136) + 'px';
  }, [value, inputRef]);
  const left = maxChars - value.length;
  // Text longer than the limit was not typed: the limit fell under it (a role
  // with longer lines, an older draft, a question put back). It is never cut
  // by itself; sending waits until it is shortened, and the line says by how much.
  const over = left < 0;
  const empty = !value.trim();
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing &&
      !window.matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      if (!disabled && !busy && value.trim() && !over) onSend();
    }
  };
  // The browser stops typing at the limit and cuts a paste at the caret
  // (maxLength); a paste that did not fit is said for 8 s, which maxLength
  // alone never did (INPUT-01).
  const [cutAt, setCutAt] = useState(0);
  useEffect(() => {
    if (!cutAt) return;
    const timer = window.setTimeout(() => setCutAt(0), 8_000);
    return () => window.clearTimeout(timer);
  }, [cutAt]);
  // One line between the field and the footnote, only while it has something to say.
  const status = over ? t.charsOver(-left) : cutAt ? t.inputCut : left <= 200 ? t.charsLeft(left) : null;
  return (
    <div className="gpt-input-wrap">
      <div className="gpt-input-surface" aria-busy={busy}>
        <textarea ref={inputRef} value={value} maxLength={maxChars}
          onChange={(e) => {
            const next = e.target.value;
            // A safety net: an Android keyboard can pass maxLength while composing.
            if (next.length > maxChars && next.length > value.length) {
              setCutAt(Date.now());
              onChange(next.slice(0, Math.max(maxChars, value.length)));
            } else onChange(next);
          }}
          onPaste={(e) => {
            const el = e.currentTarget;
            const pasted = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
            if (el.value.length - (el.selectionEnd - el.selectionStart) + pasted.length > maxChars) setCutAt(Date.now());
          }}
          onKeyDown={onKeyDown} rows={1}
          placeholder={placeholder} aria-label={t.inputPlaceholder}
          aria-describedby={describedBy}
          className="ym-disable-keys" />
        {busy && onStop ? (
          <button type="button" className="gpt-send-button" data-state="stop" onClick={onStop} aria-label={t.stop} title={t.stop}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
          </button>
        ) : (
          // Empty, the button keeps its colour and focuses the field (the
          // keyboard opens) instead of looking broken; it sends nothing.
          // Over the limit, during a check or a limit it is off; a limit
          // draws a clock and points to the card that says until when.
          <button type="button" className="gpt-send-button" data-state={limited ? 'limit' : disabled || over ? 'off' : 'ready'}
            onClick={() => (empty ? inputRef.current?.focus() : onSend())}
            disabled={disabled || busy || over} aria-disabled={empty || undefined} aria-label={t.send}
            aria-describedby={limited ? describedBy : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={limited ? CLOCK : ARROW} /></svg>
          </button>
        )}
      </div>
      {status && <p className="gpt-input-status" data-over={over || undefined} role="status">{status}</p>}
      {/* Not OpenAI, and where the question goes, on every screen and with the
          keyboard open (F8); the privacy policy says what is kept and who
          receives it (plan WP-18). The brand is the header's and the
          answer's now (chat design §5.3). */}
      <p className="gpt-input-footnote">
        <span data-testid="ai-input-microcopy">
          {t.inputMicrocopy} · <a href={t.privacyHref} data-testid="ai-input-privacy">{t.privacyLink}</a>
        </span>
      </p>
    </div>
  );
}
