import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { ChatStrings } from '../i18n';

export function AiChatInput({
  value,
  onChange,
  onSend,
  disabled,
  busy,
  maxChars,
  t,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
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
    <div className="mt-3">
      <div
        className={`glass-strong flex items-end gap-2 p-2 pl-4 rounded-3xl border-white/12 ${busy ? 'scan-active' : ''}`}
        style={{ borderColor: 'rgba(47,230,209,0.18)' }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t.inputPlaceholder}
          aria-label={t.inputPlaceholder}
          className="flex-1 resize-none bg-transparent py-2.5 text-[15px] text-white placeholder:text-white/35 outline-none max-h-40 min-h-[24px] leading-relaxed"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label={t.send}
          className="shrink-0 grid place-items-center w-11 h-11 rounded-full bg-grad-cta text-[#04101A] shadow-glow disabled:opacity-35 disabled:shadow-none transition-all hover:scale-105 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12l16-8-6 8 6 8-16-8z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[11px] text-white/35">{t.inputMicrocopy}</span>
        {nearLimit && <span className={`text-[11px] ${left <= 0 ? 'text-red-300' : 'text-brand-cyan/80'}`}>{t.charsLeft(Math.max(0, left))}</span>}
      </div>
    </div>
  );
}
