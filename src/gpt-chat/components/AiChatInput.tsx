import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { ChatStrings } from '../i18n';

export function AiChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  busy,
  maxChars,
  t,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** Real AbortController-backed stop; the button only renders while busy. */
  onStop?: () => void;
  disabled?: boolean;
  busy?: boolean;
  maxChars: number;
  t: ChatStrings;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const ref = inputRef;

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value, ref]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  const left = maxChars - value.length;
  const nearLimit = left <= 200;

  return (
    <div className="mt-4 sticky bottom-0 z-10 pb-[env(safe-area-inset-bottom)]">
      <div
        aria-busy={busy}
        className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 pl-3.5 transition-colors focus-within:border-brand-cyan/40"
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t.inputPlaceholder}
          aria-label={t.inputPlaceholder}
          className="flex-1 resize-none bg-transparent py-2.5 text-[15px] text-white placeholder:text-white/30 outline-none max-h-40 min-h-[24px] leading-relaxed"
        />
        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t.stop}
            title={t.stop}
            className="shrink-0 grid place-items-center w-11 h-11 rounded-xl border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            aria-label={t.send}
            className="shrink-0 grid place-items-center w-11 h-11 rounded-xl bg-grad-cta text-[#04101A] disabled:opacity-30 transition-opacity"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-2.5 px-1">
        <span className="text-[11px] text-white/30">{t.inputMicrocopy}</span>
        {nearLimit && <span className={`text-[11px] ${left <= 0 ? 'text-red-300' : 'text-brand-cyan/70'}`}>{t.charsLeft(Math.max(0, left))}</span>}
      </div>
    </div>
  );
}
