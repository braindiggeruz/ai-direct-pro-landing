/**
 * The composition and motion vocabulary of the console.
 *
 * These are adapted from useLayouts (MIT, Copyright (c) Urvish Mali) - see
 * THIRD_PARTY_NOTICES.md for the pinned commit and the list of components. What
 * was taken is the *pattern* in each case, never the demo: useLayouts ships
 * showcase pieces full of invented teammates, avatar URLs on a third-party host
 * and marketing copy, and none of that belongs in an operations panel. So the
 * bento card kept its unequal-mass grid and its restrained hover; the discrete
 * tabs kept the shared-element indicator that slides between options; the
 * status button kept the idle/loading/success machine. Everything they display
 * here comes from the Admin contracts.
 *
 * Three house rules that differ from the originals, all for the same reason -
 * this is a console somebody works in for an hour, not a page they scroll once:
 *
 *  - Motion is short (120-240ms) and never loops. The originals use springs
 *    that overshoot and a per-character text morph; both are lovely once and
 *    tiring by the fortieth listing.
 *  - Anyone who asked for reduced motion gets none of it, decided in JS rather
 *    than only in CSS, so entrance animations do not merely run instantly but
 *    never mount as animations at all.
 *  - No icon library was added. The panel already draws its own line icons on
 *    one 24 grid; useLayouts reaches for Hugeicons, and a second icon set in a
 *    bundle this size buys nothing but kilobytes and two visual grammars.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import type { Tone } from './ui';

/** Joins class names. Falsy entries drop out, so callers can inline conditions. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** One tone list for the panel, declared in `ui.tsx` and re-exported here. */
export type { Tone };

/**
 * The tinted fill and the text colour for a tone, as one pair.
 *
 * Kept in a table rather than composed at the call site so that a soft
 * background and its foreground can never be picked independently and end up
 * as, say, warn text on a danger fill.
 */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-[var(--admin-surface-subtle)] text-[var(--admin-text-muted)]',
  good: 'bg-[var(--admin-good-soft)] text-[var(--admin-good)]',
  warn: 'bg-[var(--admin-warn-soft)] text-[var(--admin-warn)]',
  bad: 'bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]',
  accent: 'bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]',
  info: 'bg-[var(--admin-info-soft)] text-[var(--admin-info)]',
};

export const TONE_FG: Record<Tone, string> = {
  neutral: 'text-[var(--admin-text-muted)]',
  good: 'text-[var(--admin-good)]',
  warn: 'text-[var(--admin-warn)]',
  bad: 'text-[var(--admin-danger)]',
  accent: 'text-[var(--admin-primary)]',
  info: 'text-[var(--admin-info)]',
};

const TONE_VAR: Record<Tone, string> = {
  neutral: 'var(--admin-border-strong)',
  good: 'var(--admin-good)',
  warn: 'var(--admin-warn)',
  bad: 'var(--admin-danger)',
  accent: 'var(--admin-primary)',
  info: 'var(--admin-info)',
};

/** The one easing curve and the one duration the console animates on. */
const EASE = [0.22, 1, 0.36, 1] as const;
const FAST = 0.18;
const CALM = 0.24;

/* ------------------------------------------------------------------------- */
/* Bento                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * The grid a summary screen is built from.
 *
 * Twelve columns on a desktop so a card can be worth two, three, four or six of
 * them; one column on a phone. The point of the bento is that cards are *not*
 * all the same size - four identical tiles in a row tell an operator that four
 * numbers matter equally, which on every screen here is untrue.
 */
export function Bento({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-4', className)}>
      {children}
    </div>
  );
}

const SPAN: Record<number, string> = {
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  12: 'lg:col-span-12 sm:col-span-2',
};

/**
 * One panel in the bento.
 *
 * `emphasis` is the card's visual mass, and it is the whole reason this exists
 * rather than a div: `lead` is for the one card on a screen that the operator
 * should read first, and a screen with two lead cards has not decided what it
 * is about.
 *
 * The entrance is staggered by index and runs once. It is not decoration - a
 * grid of nine cards that appears all at once gives the eye no order to read
 * them in, and 30ms apart is enough to imply one without anybody noticing they
 * were animated.
 */
export function BentoCard({
  span = 4,
  emphasis = 'normal',
  tone,
  index = 0,
  interactive = false,
  className = '',
  children,
}: {
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  emphasis?: 'normal' | 'lead' | 'quiet';
  tone?: Tone;
  index?: number;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();
  const base =
    emphasis === 'lead'
      ? 'surface-raised'
      : emphasis === 'quiet'
        ? 'rounded-[var(--admin-radius-md)] border border-dashed border-[var(--admin-border)]'
        : 'surface';

  return (
    <motion.section
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: CALM, ease: EASE, delay: still ? 0 : Math.min(index, 8) * 0.03 }}
      style={tone ? { borderLeft: `3px solid ${TONE_VAR[tone]}` } : undefined}
      className={cn(
        base,
        SPAN[span],
        'min-w-0 p-4 sm:p-5',
        interactive && 'surface-interactive',
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

/** The label above a card's content. Not a heading level - the page owns those. */
export function BentoHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="t-section">{title}</h2>
        {hint ? <p className="t-meta mt-1">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Discrete tabs                                                              */
/* ------------------------------------------------------------------------- */

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Only ever a count the server actually reported. Undefined hides the pill. */
  count?: number;
}

/**
 * A row of filters where exactly one is active.
 *
 * useLayouts' discrete tabs animate a shared pill between options with
 * `layoutId`, which is the part worth keeping: the indicator travels, so the
 * eye follows one object instead of watching a highlight blink out here and in
 * there. What is dropped is the original's collapse-to-icon behaviour, which
 * hides the labels of the options you did not pick - on a filter bar, the
 * unchosen labels are the whole point.
 *
 * These are real `tab` semantics pointing at the region they filter, because
 * that is what they do: the list below is the panel, and a screen reader should
 * be told the two are connected rather than left to guess from proximity.
 */
export function DiscreteTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  controls,
}: {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the group for a screen reader, e.g. "Фильтр по статусу". */
  label: string;
  /** id of the region these filter. */
  controls?: string;
}) {
  const groupId = useId();
  const still = useReducedMotion();

  // Arrow keys move between filters, which is what `tablist` promises. Without
  // this the role is a claim the widget does not honour.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowLeft'
            ? (at - 1 + options.length) % options.length
            : (at + 1) % options.length;
    onChange(options[next].value);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--admin-surface-subtle)] p-1"
    >
      <LayoutGroup id={groupId}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={controls}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative inline-flex min-h-9 items-center gap-2 rounded-[7px] px-3 text-sm whitespace-nowrap transition-colors',
                active ? 'text-[var(--admin-text)]' : 'muted hover:text-[var(--admin-text)]',
              )}
            >
              {active ? (
                <motion.span
                  aria-hidden="true"
                  layoutId="discrete-tab-active"
                  className="absolute inset-0 rounded-[7px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--admin-shadow-sm)]"
                  transition={
                    still ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }
                  }
                />
              ) : null}
              <span className="relative z-10 font-medium">{option.label}</span>
              {typeof option.count === 'number' ? (
                <span
                  className={cn(
                    'relative z-10 rounded-[var(--admin-radius-pill)] px-1.5 text-xs tabular-nums',
                    active ? 'bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]' : 'muted',
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Status button                                                              */
/* ------------------------------------------------------------------------- */

export type CommandState = 'idle' | 'loading' | 'success' | 'error';

/**
 * A button that carries out one command and then says what happened.
 *
 * The shape is useLayouts' status button; the honesty is this panel's. In the
 * original the success tick is on a `setTimeout`, which is fine for a demo and
 * is precisely the thing a moderation console must never do - a tick that
 * appears because two and a half seconds passed tells an operator a listing was
 * removed when the request may have 409'd. Here `state` is owned by the caller
 * and only ever becomes `success` when the server said so.
 *
 * While it is not idle the button is disabled, so the second click that would
 * submit a duplicate command cannot land. The state is announced politely, so
 * an operator who is not watching the button still hears the outcome.
 */
export function StatusButton({
  state,
  onClick,
  children,
  labels,
  variant = 'primary',
  tone,
  className = '',
  disabled = false,
  type = 'button',
}: {
  state: CommandState;
  onClick?: () => void;
  children: ReactNode;
  /** What to say in each state. `idle` falls back to `children`. */
  labels?: { loading?: string; success?: string; error?: string };
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Colours a destructive command without changing its behaviour. */
  tone?: Tone;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const still = useReducedMotion();
  const busy = state === 'loading';

  const skin =
    variant === 'primary'
      ? 'bg-[var(--admin-primary)] text-[var(--admin-primary-contrast)] border-transparent hover:bg-[var(--admin-primary-hover)]'
      : variant === 'ghost'
        ? 'border-transparent hover:bg-[var(--admin-surface-subtle)]'
        : 'border-[var(--admin-border)] bg-[var(--admin-surface)] hover:border-[var(--admin-border-strong)]';

  const label =
    state === 'loading'
      ? (labels?.loading ?? 'Выполняем…')
      : state === 'success'
        ? (labels?.success ?? 'Готово')
        : state === 'error'
          ? (labels?.error ?? 'Не получилось')
          : children;

  return (
    <span className="relative inline-flex">
      <button
        type={type}
        onClick={onClick}
        disabled={disabled || busy || state === 'success'}
        aria-busy={busy}
        className={cn(
          'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--admin-radius-sm)] border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70',
          skin,
          tone && variant !== 'primary' && TONE_FG[tone],
          className,
        )}
      >
        {busy ? (
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            className={still ? undefined : 'animate-spin'}
          >
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.3" />
            <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        ) : null}
        {state === 'success' ? (
          <motion.svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={still ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: FAST, ease: EASE }}
          >
            <path d="M5 12.5l4.5 4.5L19 7" />
          </motion.svg>
        ) : null}
        {state === 'error' ? (
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 7v6M12 16.5v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        ) : null}
        <span>{label}</span>
      </button>
      {/* The outcome, for anyone not looking at the button. */}
      <span aria-live="polite" className="sr-only">
        {state === 'success' ? (labels?.success ?? 'Готово') : state === 'error' ? (labels?.error ?? 'Не получилось') : ''}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Stacked list                                                               */
/* ------------------------------------------------------------------------- */

/**
 * A queue of records, one per row.
 *
 * useLayouts' stacked list is a directory of invented people with avatars
 * fetched from a third-party host. What survives here is the staggered entrance
 * and the row rhythm; the avatars do not, because this panel has no user photos
 * to show and inventing faces for a moderation queue is exactly the kind of
 * decoration that makes a console untrustworthy.
 *
 * The stagger is capped: past a dozen rows the delay would be longer than the
 * operator's patience, so later rows all arrive together.
 */
export function StackedList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-[var(--admin-border)]', className)}>{children}</ul>;
}

export function StackedRow({
  index = 0,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  onOpen,
  href,
}: {
  index?: number;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small facts under the title - time, category, district. */
  meta?: ReactNode;
  trailing?: ReactNode;
  onOpen?: () => void;
  href?: string;
}) {
  const still = useReducedMotion();
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle ? <span className="muted mt-0.5 block truncate text-xs">{subtitle}</span> : null}
        {meta ? <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
    </>
  );

  const shell = 'flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-[var(--admin-surface-subtle)]';

  return (
    <motion.li
      initial={still ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: FAST, ease: EASE, delay: still ? 0 : Math.min(index, 12) * 0.02 }}
      className="min-w-0"
    >
      {href ? (
        <a href={href} className={shell}>{body}</a>
      ) : onOpen ? (
        <button type="button" onClick={onOpen} className={shell}>{body}</button>
      ) : (
        <div className={cn(shell, 'hover:bg-transparent')}>{body}</div>
      )}
    </motion.li>
  );
}

/* ------------------------------------------------------------------------- */
/* Compact filters (list-item)                                                */
/* ------------------------------------------------------------------------- */

/**
 * A filter over a closed list, as chips rather than a dropdown.
 *
 * useLayouts' list-item/filter interaction is the source of the shape: a row of
 * low-contrast chips where the chosen one gains a tinted fill. It is used only
 * where the list of values is short and worth seeing at a glance - a district
 * or a reason code. Anything longer stays a real `<select>`, which is what a
 * phone and a keyboard already know how to operate.
 */
export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <span id={id} className="t-eyebrow mb-1.5 block">{label}</span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex min-h-9 items-center rounded-[var(--admin-radius-pill)] border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                active
                  ? 'border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]'
                  : 'border-[var(--admin-border)] muted hover:border-[var(--admin-border-strong)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Dynamic toolbar                                                            */
/* ------------------------------------------------------------------------- */

/**
 * The commands for the one record on screen.
 *
 * useLayouts' dynamic toolbar is a floating bar that morphs as its context
 * changes. Here it is pinned to the bottom of a detail screen on a phone and
 * sits in the sticky side column on a desktop, and it appears only when there
 * is something to do - a toolbar of four disabled buttons is worse than none,
 * because the operator has to read it before learning it is inert.
 *
 * It is deliberately not used for navigation. A bar that sometimes navigates
 * and sometimes mutates is a bar an operator eventually mis-taps.
 */
export function DynamicToolbar({
  title,
  hint,
  children,
  status,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  /** A sentence about the last command, shown under the buttons. */
  status?: { tone: Tone; text: string } | null;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      initial={still ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: CALM, ease: EASE }}
      className="surface-raised p-4"
    >
      <div className="mb-3">
        <h2 className="t-section">{title}</h2>
        {hint ? <p className="t-meta mt-1">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
      <AnimatePresence initial={false}>
        {status ? (
          <motion.p
            initial={still ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: FAST, ease: EASE }}
            role="status"
            className={cn('mt-3 rounded-[var(--admin-radius-sm)] px-3 py-2 text-xs', TONE_SOFT[status.tone])}
          >
            {status.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------- */
/* Status rows                                                                */
/* ------------------------------------------------------------------------- */

/**
 * One capability and whether it is available, as a row rather than a sentence.
 *
 * The rights panel used to be a wall of 12px prose. A person checking whether
 * the console can currently remove a listing wants to scan a column of states,
 * not read a paragraph and infer one.
 */
export function StatusRow({
  tone,
  title,
  detail,
  value,
}: {
  tone: Tone;
  title: string;
  detail?: string;
  value?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={cn('mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full', TONE_SOFT[tone])}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          {tone === 'good' ? (
            <path d="M5 12.5l4.5 4.5L19 7" />
          ) : tone === 'bad' ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : tone === 'warn' ? (
            <path d="M12 7v7M12 17.5v.5" />
          ) : (
            <path d="M5 12h14" />
          )}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {detail ? <span className="muted mt-0.5 block text-xs">{detail}</span> : null}
      </span>
      {value ? <span className="shrink-0 text-sm">{value}</span> : null}
    </li>
  );
}

/* ------------------------------------------------------------------------- */
/* Command runner                                                             */
/* ------------------------------------------------------------------------- */

/**
 * The state machine behind every StatusButton on a detail screen.
 *
 * One hook so that no screen has to re-implement "disable, call, wait for the
 * server, then say what happened" - and so that none of them can accidentally
 * implement the optimistic version. `run` resolves to whether it succeeded, so
 * the caller can refetch only on a real success.
 *
 * The success state clears itself after a few seconds; the error state does
 * not. An operator who walked away should come back to the failure still on
 * screen, and a stale tick is the one thing worth forgetting.
 */
export function useCommand(): {
  state: CommandState;
  error: string | null;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  reset: () => void;
} {
  const [state, setState] = useState<CommandState>('idle');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setState('loading');
    setError(null);
    try {
      await fn();
      if (!alive.current) return true;
      setState('success');
      timer.current = window.setTimeout(() => {
        if (alive.current) setState('idle');
      }, 2600);
      return true;
    } catch (cause) {
      if (!alive.current) return false;
      setState('error');
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);

  return { state, error, run, reset };
}

/* ------------------------------------------------------------------------- */
/* Section scaffolding                                                        */
/* ------------------------------------------------------------------------- */

/**
 * The band at the top of every screen.
 *
 * The same component as `ui.tsx`'s `PageHeader`, under the name the redesigned
 * screens use. It is re-exported rather than reimplemented so the console
 * cannot end up with two mastheads that drift apart - which is exactly what a
 * second copy of this markup would guarantee.
 */
export { PageHeader as ScreenHeader } from './ui';

/**
 * The line that separates two domains on one screen.
 *
 * Used where a screen genuinely shows two different things - classifieds and
 * store commerce, orders and questions - so their numbers are never read as one
 * total.
 */
export function DomainDivider({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-7 mb-3 flex items-baseline gap-3">
      <h2 className="t-section shrink-0">{title}</h2>
      {hint ? <p className="t-meta min-w-0 truncate">{hint}</p> : null}
      <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-[var(--admin-border)]" />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Expandable row                                                             */
/* ------------------------------------------------------------------------- */

const ExpandContext = createContext<string | null>(null);

/**
 * A row that opens to show the detail nobody needs until they ask.
 *
 * This is the progressive disclosure the audit screen and the categories tree
 * both need: raw metadata and mappings exist, and putting either on screen by
 * default turns a readable list into a wall.
 */
export function Expandable({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const still = useReducedMotion();
  const id = useId();
  const group = useContext(ExpandContext);

  return (
    <div className="border-b border-[var(--admin-border)] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`${group ?? 'x'}-${id}`}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 90 : 0 }}
          transition={still ? { duration: 0 } : { duration: FAST, ease: EASE }}
          className="muted shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </motion.span>
        <span className="min-w-0 flex-1">{summary}</span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={`${group ?? 'x'}-${id}`}
            initial={still ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: CALM, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="pb-3 pl-7">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Groups expandables so their generated ids cannot collide across screens. */
export function ExpandableGroup({ name, children }: { name: string; children: ReactNode }) {
  const value = useMemo(() => name, [name]);
  return <ExpandContext.Provider value={value}>{children}</ExpandContext.Provider>;
}
