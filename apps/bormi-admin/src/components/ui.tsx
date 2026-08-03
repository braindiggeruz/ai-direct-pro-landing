/**
 * The whole visual vocabulary of the panel, in one file.
 *
 * Adapted from TailAdmin (MIT): the card, badge, table and metric shapes come
 * from there. What changed is what they say - a status is a word first and a
 * colour second, an empty table explains why it is empty, and a number that
 * could not be measured is never drawn as a zero.
 */
import type { ReactNode } from 'react';

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

export function Switchboard({ items }: { items: { label: string; on: boolean }[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 py-2"
        >
          <span className="text-sm">{item.label}</span>
          <Badge tone={item.on ? 'good' : 'neutral'}>{item.on ? 'включено' : 'выключено'}</Badge>
        </li>
      ))}
    </ul>
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

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
      {subtitle ? <p className="muted mt-1 text-sm">{subtitle}</p> : null}
    </header>
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
