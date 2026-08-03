/**
 * The whole visual vocabulary of the panel, in one file.
 *
 * Adapted from TailAdmin (MIT): the card, badge, table and metric shapes come
 * from there. What changed is what they say - a status is a word first and a
 * colour second, an empty table explains why it is empty, and a number that
 * could not be measured is never drawn as a zero.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-[var(--text-secondary)]',
  good: 'text-[var(--tone-good)]',
  warn: 'text-[var(--tone-warn)]',
  bad: 'text-[var(--tone-bad)]',
  accent: 'text-[var(--accent)]',
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // `min-w-0` is not decoration. A grid or flex child sizes to its own content
  // by default, so one wide table inside a card pushes the whole page sideways
  // - which is exactly how an admin panel ends up with a horizontal scrollbar
  // on a phone.
  return <section className={`surface min-w-0 p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold tracking-tight">{children}</h2>
      {hint ? <p className="muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

/**
 * A single number and what it counts.
 *
 * `value` may be null, and that is not the same as zero: null renders as "нет
 * данных" so a metric nobody measures never masquerades as a calm reading.
 */
export function Metric({
  label,
  value,
  suffix,
  tone = 'neutral',
  note,
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
  tone?: Tone;
  note?: string;
}) {
  return (
    <div className="surface p-4">
      <div className="muted text-xs">{label}</div>
      {value === null ? (
        <div className="muted mt-2 text-sm">нет данных</div>
      ) : (
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
          {value}
          {suffix ? <span className="muted ml-1 text-sm font-normal">{suffix}</span> : null}
        </div>
      )}
      {note ? <div className="muted mt-1 text-xs">{note}</div> : null}
    </div>
  );
}

const BADGE_TONE: Record<Tone, string> = {
  neutral: 'border-[var(--border-line)] text-[var(--text-secondary)]',
  good: 'border-[var(--tone-good)]/40 text-[var(--tone-good)]',
  warn: 'border-[var(--tone-warn)]/40 text-[var(--tone-warn)]',
  bad: 'border-[var(--tone-bad)]/40 text-[var(--tone-bad)]',
  accent: 'border-[var(--accent)]/40 text-[var(--accent)]',
};

/**
 * Status. The word is the signal; the colour repeats it. Never the other way
 * round, so the table stays readable without colour vision.
 */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs whitespace-nowrap ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Feature flags, as a list of states rather than a panel of controls.
 *
 * These cannot be changed from here - flipping one is a configuration commit
 * and a deploy - so nothing on the row may look like a switch. A toggle that
 * does not toggle is a promise the screen cannot keep, and the operator finds
 * out by clicking it during an incident.
 */
export function FlagList({ items }: { items: { label: string; on: boolean; hint?: string }[] }) {
  return (
    <ul className="divide-y divide-[var(--border-line)]">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex min-h-[var(--row-height)] items-center justify-between gap-3 py-2"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm">{item.label}</span>
            {item.hint ? <span className="muted block text-xs">{item.hint}</span> : null}
          </span>
          <Badge tone={item.on ? 'good' : 'neutral'}>{item.on ? 'Включено' : 'Выключено'}</Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * The first thing on an operational screen: does anything need me right now.
 *
 * The verdict is computed from the same counts the rest of the page shows, so
 * it cannot say "everything is fine" above a list of problems.
 */
export function StatusStrip({
  tone,
  title,
  detail,
  action,
}: {
  tone: 'good' | 'warn' | 'bad';
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const accent = tone === 'good' ? 'var(--tone-good)' : tone === 'warn' ? 'var(--tone-warn)' : 'var(--tone-bad)';
  return (
    <section
      className="surface mb-5 flex flex-wrap items-center gap-3 border-l-4 p-4"
      style={{ borderLeftColor: accent }}
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: accent }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {detail ? <span className="muted block text-xs">{detail}</span> : null}
      </span>
      {action}
    </section>
  );
}

/** After this many seconds on screen an answer is called old rather than live. */
const STALE_AFTER_SECONDS = 120;
const AGE_TICK_MS = 15_000;

/**
 * How old the answer on screen is, and a way to ask for a new one.
 *
 * The age is measured by a timer rather than read from the clock while
 * rendering. Reading it during render makes the label true only for the frame
 * that painted it: a screen nobody interacts with never re-renders, so it goes
 * on saying "актуальны" for as long as it is left open. Here the label ages by
 * itself, which is the whole point of showing it.
 */
export function Freshness({
  fetchedAt,
  refreshing,
  onRefresh,
}: {
  fetchedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (fetchedAt === null) return undefined;
    const timer = window.setInterval(
      () => setAgeSeconds(Math.round((Date.now() - fetchedAt) / 1000)),
      AGE_TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [fetchedAt]);

  const stale = ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS;
  // Asking for fresh data resets the age immediately, so the warning cannot
  // linger over an answer that has already been replaced.
  const refresh = () => {
    setAgeSeconds(0);
    onRefresh();
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <span className={`text-xs ${stale ? 'text-[var(--tone-warn)]' : 'muted'}`} data-testid="freshness">
        {fetchedAt === null
          ? 'загрузка…'
          : stale
            ? 'данные устарели'
            : 'данные актуальны'}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-60"
        data-testid="refresh"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
        </svg>
        {refreshing ? 'Обновляем…' : 'Обновить'}
      </button>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="muted mx-auto mt-1 max-w-md text-xs">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ code, onRetry }: { code: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-10 text-center" role="alert">
      <p className="text-sm font-medium">Не удалось загрузить данные</p>
      <p className="muted mt-1 text-xs">
        Сервер ответил: <span className="font-mono">{code}</span>
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-4 text-sm"
        >
          Повторить
        </button>
      ) : null}
    </div>
  );
}

/**
 * The environment, said on the working area of every screen.
 *
 * The badge in the header is the permanent signal; this is the one an operator
 * cannot scroll past or miss on a narrow phone. It exists because the single
 * worst outcome for a console is a screen of invented numbers that somebody
 * reads as the marketplace.
 */
export function SyntheticNotice({ text }: { text: string }) {
  return (
    <p
      className="mb-5 flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--tone-warn)] px-3 py-2 text-xs text-[var(--tone-warn)]"
      role="status"
      data-testid="synthetic-notice"
    >
      <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--tone-warn)]" />
      {text}
    </p>
  );
}

/**
 * A filter over a closed list of values.
 *
 * A real `<select>`: the phone gets its native picker, the keyboard gets arrow
 * keys without any code, and the label is visible rather than implied by the
 * current value. Only fields the server actually filters on are ever given one
 * of these - a control that narrows nothing is a lie the operator only catches
 * by counting rows.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = `filter-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="muted mb-1 block text-xs">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-line)] bg-[var(--surface-paper)] px-2 text-sm sm:w-56"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}

/** Wide content scrolls inside this, so the page body never scrolls sideways. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll w-full">
      <table className="w-full min-w-[36rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`muted sticky top-0 z-10 bg-[var(--surface-paper)] px-3 py-2 text-xs font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`border-t border-[var(--border-line)] px-3 py-3 align-middle ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  // A div, not a header: the shell already owns the one banner landmark on the
  // page, and a second one gives a screen reader two places called "header".
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
        {subtitle ? <p className="muted mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/**
 * A panel that slides in over the page for one record.
 *
 * It traps focus while it is open, returns focus where it came from, closes on
 * Escape, and is labelled - because a dialog that a keyboard can fall out of
 * behind is a dialog that has silently locked somebody out of the page.
 */
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.querySelector<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      restore.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-md flex-col border-l border-[var(--border-line)] bg-[var(--surface-paper)]"
      >
        <div className="flex h-[var(--shell-header)] shrink-0 items-center justify-between gap-3 border-b border-[var(--border-line)] px-4">
          <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-line)]"
          >
            <span className="sr-only">Закрыть</span>
            <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="app-scroll min-h-0 flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}

/** A labelled value pair, used inside drawers and detail panels. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-[var(--border-line)] py-2 last:border-0">
      <dt className="muted text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{value}</dd>
    </div>
  );
}

/**
 * Said out loud rather than implied: this number is not available, and here is
 * why. Used wherever a dashboard would normally invent something.
 */
export function DataGap({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border-line)] px-3 py-3">
      <p className="text-sm">{what}</p>
      <p className="muted mt-1 text-xs">{why}</p>
    </div>
  );
}
