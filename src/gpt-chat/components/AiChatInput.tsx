import { useRef } from 'react';
import type { ChatStrings } from '../i18n';

export function AiChatInput({
  value,
  onChange,
  onSend,
  disabled,
  maxChars,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  maxChars: number;
  t: ChatStrings;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={t.inputPlaceholder}
        aria-label={t.inputPlaceholder}
        className="flex-1 resize-none rounded-xl bg-bg-base border border-white/10 px-4 py-3 text-white text-sm focus:border-brand-cyan/50 outline-none max-h-40 min-h-[48px]"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="shrink-0 bg-grad-cta text-bg-base font-semibold px-5 py-3 rounded-xl disabled:opacity-40 transition-opacity"
        aria-label={t.send}
      >
        {t.send}
      </button>
    </div>
  );
}
