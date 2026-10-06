import { useEffect, useState, type RefObject } from 'react';
import { ArrowUp, Square, Sparkles } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import type { ChatStrings } from '../i18n';

export function AiChatInput({ value, onChange, onSend, onStop, disabled, busy, maxChars, t, inputRef, describedBy }: {
  value: string; onChange: (v: string) => void; onSend: () => void;
  onStop?: () => void; disabled?: boolean; busy?: boolean; maxChars: number;
  t: ChatStrings; inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Id of what explains why sending is paused (the limit card). */
  describedBy?: string;
}) {
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value, inputRef]);
  const left = maxChars - value.length;
  // Text longer than the limit was not typed: the limit fell under it (a role
  // with longer lines, an older draft, a question put back). It is never cut
  // by itself; sending waits until it is shortened, and the line says by how much.
  const over = left < 0;
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
  return (
    <div className="gpt-input-wrap">
      <InputGroup className="gpt-input-surface" aria-busy={busy}>
        <InputGroupTextarea ref={inputRef} value={value} maxLength={maxChars}
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
          placeholder={t.inputPlaceholder} aria-label={t.inputPlaceholder}
          aria-describedby={describedBy}
          className="ym-disable-keys" />
        <InputGroupAddon align="block-end" className="gpt-input-toolbar">
          <span className="gpt-input-identity"><Sparkles aria-hidden="true" /> {t.brand}</span>
          <span className="gpt-key-hint" aria-hidden="true">Enter ↵</span>
          {busy && onStop ? (
            <InputGroupButton variant="secondary" size="icon-sm" className="gpt-send-button"
              onClick={onStop} aria-label={t.stop} title={t.stop}>
              <Square data-icon="inline-start" />
            </InputGroupButton>
          ) : (
            <InputGroupButton variant="default" size="icon-sm" className="gpt-send-button"
              onClick={onSend} disabled={disabled || busy || !value.trim() || over} aria-label={t.send}>
              <ArrowUp data-icon="inline-start" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {/* Not OpenAI, and where the question goes: on every screen size, not
          only inside the menu a phone keeps closed (F8). The privacy policy
          says what is kept and who receives it (plan WP-18). */}
      <div className="gpt-input-footnote">
        <span data-testid="ai-input-microcopy">
          {t.inputMicrocopy} · <a href={t.privacyHref} data-testid="ai-input-privacy">{t.privacyLink}</a>
        </span>
        {cutAt ? <span role="status">{t.inputCut}</span> : over ? <span role="status">{t.charsOver(-left)}</span> : left <= 200 && <span role="status">{t.charsLeft(left)}</span>}
      </div>
    </div>
  );
}