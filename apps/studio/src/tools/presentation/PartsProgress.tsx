/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The parts of a full deck as they come in (STUDIO-SPEC §7.1): one segment
 * per part of ≤ 4 slides, filled when that part is written, and the count in
 * words. The parts are written at once, so they fill in any order; the
 * segments only count them.
 *
 * Screen readers: the segments are decoration (aria-hidden); the words are
 * plain text inside the progress block, which is no live region (Progress.tsx):
 * the form's hidden status line announces the steps.
 */
export interface PartsProgressProps {
  readonly done: number;
  readonly total: number;
  /** FULL_TEXTS.parts. */
  readonly label: (done: number, total: number) => string;
}

export function PartsProgress({ done, total, label }: PartsProgressProps) {
  if (total <= 0) return null;
  const filled = Math.min(Math.max(0, done), total);
  return (
    <div className="st:mt-1 st:ml-4.5 st:space-y-1" data-studio-parts={`${filled}/${total}`}>
      <div className="st:flex st:gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < filled ? 'st:h-1.5 st:flex-1 st:rounded-full st:bg-studio-cyan' : 'st:h-1.5 st:flex-1 st:rounded-full st:bg-studio-line'} />
        ))}
      </div>
      <p className="st:text-xs st:text-studio-muted st:tabular-nums">{label(filled, total)}</p>
    </div>
  );
}
