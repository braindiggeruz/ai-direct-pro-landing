// The GPTBot.uz mark (chat design §3.7): a speech bubble with two eyes on a
// mint tile, legible from 20 to 40px. Inline, so it costs no request; the
// header, the head of every answer and the menu draw it. The size and the
// tile are premium.css's (.gpt-brand-mark).
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`gpt-brand-mark ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v6a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.5V16h-1A2.5 2.5 0 0 1 4 13.5v-6A2.5 2.5 0 0 1 6.5 5z" />
        <circle cx="9.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
