import { useEffect, type RefObject } from 'react';
import { ArrowUp, Square, Sparkles } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import type { ChatStrings } from '../i18n';

export function AiChatInput({ value, onChange, onSend, onStop, disabled, busy, maxChars, t, inputRef }: {
  value: string; onChange: (v: string) => void; onSend: () => void;
  onStop?: () => void; disabled?: boolean; busy?: boolean; maxChars: number;
  t: ChatStrings; inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value, inputRef]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing &&
      !window.matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      if (!disabled && !busy && value.trim()) onSend();
    }
  };
  const left = maxChars - value.length;
  return (
    <div className="gpt-input-wrap">
      <InputGroup className="gpt-input-surface" aria-busy={busy}>
        <InputGroupTextarea ref={inputRef} value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          onKeyDown={onKeyDown} rows={1} maxLength={maxChars}
          placeholder={t.inputPlaceholder} aria-label={t.inputPlaceholder}
          className="ym-disable-keys" />
        <InputGroupAddon align="block-end" className="gpt-input-toolbar">
          <span className="gpt-input-identity"><Sparkles aria-hidden="true" /> GPTBot AI</span>
          <span className="gpt-key-hint" aria-hidden="true">Enter ↵</span>
          {busy && onStop ? (
            <InputGroupButton variant="secondary" size="icon-sm" className="gpt-send-button"
              onClick={onStop} aria-label={t.stop} title={t.stop}>
              <Square data-icon="inline-start" />
            </InputGroupButton>
          ) : (
            <InputGroupButton variant="default" size="icon-sm" className="gpt-send-button"
              onClick={onSend} disabled={disabled || busy || !value.trim()} aria-label={t.send}>
              <ArrowUp data-icon="inline-start" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      <div className="gpt-input-footnote">
        <span>{t.inputMicrocopy}</span>
        {left <= 200 && <span role="status">{t.charsLeft(Math.max(0, left))}</span>}
      </div>
    </div>
  );
}