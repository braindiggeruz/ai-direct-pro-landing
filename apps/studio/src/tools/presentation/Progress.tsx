/** @jsxRuntime automatic @jsxImportSource react */
/**
 * What is happening while a deck is made: the steps and the seconds since
 * the submit. A free deck takes about 25–35 s (STUDIO-SPEC §7.1), most of it
 * the one model call, so the person sees the clock move and the step it is
 * on, never a frozen screen.
 *
 * Screen readers: the block is no live region. The step is announced by the
 * form's own visually hidden status line (Form.tsx, there from the first
 * render, so every change is read once); the clock is aria-hidden, or it
 * would be read out every second. The active step carries aria-current. On
 * mount the block is scrolled into view (the form above it fills the first
 * screen on a phone).
 *
 * A full deck (T3.1) shows its own steps (FULL_PROGRESS_STEPS: the plan,
 * then the parts at once, the pictures drawn alongside) with the parts
 * written so far under the active step (PartsProgress) and its own note
 * («40–60 soniya»).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Step, ToolTexts } from './texts';

export const PROGRESS_STEPS: readonly Step[] = ['check', 'write', 'images'];
/** A full deck: the check, the plan, then the parts (pictures are drawn while they are written). */
export const FULL_PROGRESS_STEPS: readonly Step[] = ['check', 'outline', 'write'];

export interface ProgressProps {
  readonly texts: ToolTexts;
  readonly step: Step;
  /** Date.now() at the submit. */
  readonly startedAt: number;
  /** The steps to list; the free deck's by default. */
  readonly steps?: readonly Step[];
  /** Shown under the active step (a full deck's parts). */
  readonly detail?: ReactNode;
  /** Replaces texts.progressNote. */
  readonly note?: string;
}

/** 'smooth' unless the person asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'auto';
  }
}

export function Progress({ texts, step, startedAt, steps = PROGRESS_STEPS, detail, note }: ProgressProps) {
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: scrollBehavior() });
  }, []);
  const current = steps.indexOf(step);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <div ref={box} className="st:mt-4 st:rounded-xl st:border st:border-studio-line st:bg-studio-bg/60 st:p-4" data-studio-progress="">
      <ol className="st:space-y-2">
        {steps.map((name, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'pending';
          return (
            <li key={name} className="st:text-sm" data-state={state} {...(state === 'active' ? { 'aria-current': 'step' as const } : {})}>
              <span className="st:flex st:items-center st:gap-2">
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
              </span>
              {state === 'active' && detail ? detail : null}
            </li>
          );
        })}
      </ol>
      <p className="st:mt-3 st:text-xs st:text-studio-muted">
        <span className="st:tabular-nums" aria-hidden="true" data-studio-seconds="">
          {texts.seconds(seconds)}
        </span>{' '}
        · {note ?? texts.progressNote}
      </p>
    </div>
  );
}
