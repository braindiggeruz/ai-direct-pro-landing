/** @jsxRuntime automatic @jsxImportSource react */
/**
 * What is happening while a deck is made: the steps and the seconds since
 * the submit. A free deck takes about 25–35 s (STUDIO-SPEC §7.1), most of it
 * the one model call, so the person sees the clock move and the step it is
 * on, never a frozen screen.
 */
import { useEffect, useState } from 'react';
import type { Step, ToolTexts } from './texts';

export const PROGRESS_STEPS: readonly Step[] = ['check', 'write', 'images'];

export interface ProgressProps {
  readonly texts: ToolTexts;
  readonly step: Step;
  /** Date.now() at the submit. */
  readonly startedAt: number;
}

export function Progress({ texts, step, startedAt }: ProgressProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const current = PROGRESS_STEPS.indexOf(step);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <div className="st:mt-4 st:rounded-xl st:border st:border-studio-line st:bg-studio-bg/60 st:p-4" aria-live="polite" data-studio-progress="">
      <ol className="st:space-y-2">
        {PROGRESS_STEPS.map((name, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'pending';
          return (
            <li key={name} className="st:flex st:items-center st:gap-2 st:text-sm" data-state={state}>
              <span
                aria-hidden="true"
                className={
                  state === 'done'
                    ? 'st:inline-block st:size-2.5 st:rounded-full st:bg-studio-cyan'
                    : state === 'active'
                      ? 'st:inline-block st:size-2.5 st:animate-pulse st:rounded-full st:bg-studio-blue st:motion-reduce:animate-none'
                      : 'st:inline-block st:size-2.5 st:rounded-full st:bg-studio-line'
                }
              />
              <span className={state === 'pending' ? 'st:text-studio-muted' : 'st:text-studio-text'}>{texts.steps[name]}</span>
            </li>
          );
        })}
      </ol>
      <p className="st:mt-3 st:text-xs st:text-studio-muted">
        <span className="st:tabular-nums">{texts.seconds(seconds)}</span> · {texts.progressNote}
      </p>
    </div>
  );
}
