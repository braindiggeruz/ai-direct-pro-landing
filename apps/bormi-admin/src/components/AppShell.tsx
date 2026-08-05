/**
 * The shell: navigation that stays put, a header that names where you are, and
 * one scrolling working area.
 *
 * The arrangement is TailAdmin's (MIT). What changed is the scroll model, and
 * it is the difference between a document and a console. Before, the page
 * scrolled: the sidebar was as tall as the content and slid off the top under
 * anything longer than the viewport, so navigation disappeared exactly when a
 * long table made you want it. Now the root is one viewport tall and clipped,
 * the rail and the header are furniture, and `<main>` is the only element with
 * a scrollbar.
 *
 * The rail's active indicator is useLayouts' shared-element pattern (MIT, see
 * THIRD_PARTY_NOTICES.md): one tinted panel and one bar carrying a `layoutId`,
 * so moving between sections slides a single object instead of blinking a
 * highlight out in one row and in again in another. It is the one place in the
 * panel where motion is doing real work — it tells the eye that these nine rows
 * are one control.
 *
 * Everything inside is Bormi's: the sections are the ones this marketplace
 * actually has, and a section with no domain behind it is not in the list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { FIXTURE_MODE, signOut } from '../lib/api';
import { SYNTHETIC_NOTICE } from '../lib/fixtures';
import { SyntheticNotice } from './ui';
import { cn } from './premium';

export interface NavItem {
  to: string;
  label: string;
  icon: 'overview' | 'listings' | 'moderation' | 'reports' | 'categories' | 'operations'
    | 'access' | 'audit' | 'system';
  /** Which queue count, if any, belongs on this row. */
  badge?: 'moderation' | 'reports' | 'operations';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Deliberately short. Marketplace, buyers, growth and settings arrive with the
 * screens that serve them - a menu that lists nine sections and opens four is a
 * menu that has stopped being trusted.
 */
export const NAV: NavGroup[] = [
  { title: 'Обзор', items: [{ to: '/', label: 'Командный центр', icon: 'overview' }] },
  {
    title: 'Контент',
    items: [
      { to: '/listings', label: 'Объявления', icon: 'listings' },
      { to: '/categories', label: 'Категории', icon: 'categories' },
    ],
  },
  {
    // The two queues a marketplace with private sellers cannot open without.
    // They are their own group rather than an entry under Контент, because
    // deciding what may be published is a different job from looking at what
    // already is.
    title: 'Модерация',
    items: [
      { to: '/moderation', label: 'На модерации', icon: 'moderation', badge: 'moderation' },
      { to: '/reports', label: 'Жалобы', icon: 'reports', badge: 'reports' },
    ],
  },
  {
    title: 'Операции',
    items: [{ to: '/operations', label: 'Заказы и вопросы', icon: 'operations', badge: 'operations' }],
  },
  { title: 'Продавцы', items: [{ to: '/access', label: 'Магазины и доступы', icon: 'access' }] },
  { title: 'Безопасность', items: [{ to: '/audit', label: 'Аудит', icon: 'audit' }] },
  { title: 'Система', items: [{ to: '/system', label: 'Состояние', icon: 'system' }] },
];

/**
 * The numbers on the rail.
 *
 * Every one of these is a count the server reported. A badge is drawn only when
 * the number is greater than zero and only when it is genuinely known: an
 * absent count renders nothing at all, rather than a reassuring zero on a queue
 * this build never managed to read.
 */
export interface NavCounts {
  moderation?: number;
  reports?: number;
  operations?: number;
}

const COLLAPSE_KEY = 'bormi_admin_rail';
/** The width at which the rail stops being a sheet and becomes furniture. */
const RAIL_QUERY = '(min-width: 1024px)';

/** Line icons, inline and all on the same 24 grid. No font, no sprite, no request. */
function Icon({ name }: { name: NavItem['icon'] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'overview') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    );
  }
  if (name === 'listings') {
    // A tagged card: the thing a listing is, not a generic box.
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <path d="M7 13h6M7 16.5h9" />
      </svg>
    );
  }
  if (name === 'moderation') {
    // A card with a tick being considered: the queue is about judging one
    // listing at a time, not about a generic inbox.
    return (
      <svg {...common}>
        <rect x="3" y="4" width="14" height="16" rx="2" />
        <path d="M7 9h6M7 12.5h4" />
        <path d="M13.5 17.5l2 2 4-4.5" />
      </svg>
    );
  }
  if (name === 'reports') {
    // A flag. Somebody raised something; it is not an error state.
    return (
      <svg {...common}>
        <path d="M5 21V4" />
        <path d="M5 5h11l-2 3.5L16 12H5z" />
      </svg>
    );
  }
  if (name === 'categories') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </svg>
    );
  }
  if (name === 'operations') {
    // A receipt with a question mark over it: the two queues this section is,
    // and neither of them a generic inbox.
    return (
      <svg {...common}>
        <path d="M5 3.5h11a1 1 0 0 1 1 1V20l-2.4-1.6L12 20l-2.3-1.6L7.4 20 5 18.4z" />
        <path d="M8.5 8.5h5M8.5 12h3" />
      </svg>
    );
  }
  if (name === 'access') {
    return (
      <svg {...common}>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <circle cx="9" cy="7" r="3.2" />
        <path d="M17 11h4M19 9v4" />
      </svg>
    );
  }
  if (name === 'audit') {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v5c0 4.4-2.9 8.3-7 10-4.1-1.7-7-5.6-7-10V6z" />
        <path d="M9.5 12l1.8 1.8L15 10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 7h16M4 12h16M4 17h10" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  );
}

/**
 * The product mark.
 *
 * A plain violet square read as a placeholder, which is roughly what it was.
 * This is a storefront awning over a counter - the thing Bormi is - drawn on
 * the same 24 grid as every other icon so the rail has one geometry.
 */
function BormiMark({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[9px] text-white"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(145deg, var(--color-bormi-violet) 0%, var(--color-bormi-violet-strong) 100%)',
        boxShadow: '0 1px 2px rgb(70 37 220 / 35%)',
      }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8.5 5.6 4.5h12.8L20 8.5" />
        <path d="M4 8.5c0 1.5 1.1 2.6 2.5 2.6S9 10 9 8.5c0 1.5 1.1 2.6 2.5 2.6S14 10 14 8.5c0 1.5 1.1 2.6 2.5 2.6S19 10 19 8.5" />
        <path d="M5.8 11.6V19a.5.5 0 0 0 .5.5h11.4a.5.5 0 0 0 .5-.5v-7.4" />
      </svg>
    </span>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const apply = (next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('bormi_admin_theme', next ? 'dark' : 'light');
    } catch {
      // A preference that cannot be stored still applies for this visit.
    }
  };
  return (
    <button
      type="button"
      onClick={() => apply(!dark)}
      aria-pressed={dark}
      className="inline-flex min-h-11 min-w-10 items-center justify-center rounded-[var(--admin-radius-sm)] border border-[var(--admin-border)] transition-colors hover:border-[var(--admin-border-strong)]"
    >
      <span className="sr-only">{dark ? 'Включить светлую тему' : 'Включить тёмную тему'}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        {dark ? (
          // A bare circle is a dot, not a sun. The rays are what make the
          // control legible at 18px — the accessible name carries the meaning,
          // but the icon should not contradict it.
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path
              strokeLinecap="round"
              d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
            />
          </>
        ) : (
          <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.4 8.4 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

/**
 * Where this build is pointing, said out loud.
 *
 * The worst outcome for an operations console is an operator who believes they
 * are looking at production and is not - or the reverse. Fixtures win over
 * everything else, because a screen full of invented numbers must never be
 * mistakable for the marketplace.
 */
function environment(): { label: string; tone: string; synthetic: boolean } {
  if (FIXTURE_MODE) {
    return {
      label: 'Синтетические данные',
      tone: 'border-[var(--admin-warn)] bg-[var(--admin-warn-soft)] text-[var(--admin-warn)]',
      synthetic: true,
    };
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return { label: 'Локальная сборка', tone: 'border-[var(--admin-border)] muted', synthetic: false };
  }
  if (host.endsWith('.pages.dev')) {
    return { label: 'Preview', tone: 'border-[var(--admin-border)] muted', synthetic: false };
  }
  return {
    label: 'Production',
    tone: 'border-transparent bg-[var(--admin-good-soft)] text-[var(--admin-good)]',
    synthetic: false,
  };
}

function currentItem(pathname: string): { group: string; label: string } | null {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) {
        return { group: group.title, label: item.label };
      }
    }
  }
  return null;
}

/** A count on the rail, drawn only when there is something to count. */
function RailBadge({ value, urgent }: { value: number; urgent: boolean }) {
  return (
    <span
      className={cn(
        'relative z-10 ml-auto inline-flex min-w-5 items-center justify-center rounded-[var(--admin-radius-pill)] px-1.5 text-[11px] font-semibold tabular-nums',
        urgent
          ? 'bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]'
          : 'bg-[var(--admin-surface-subtle)] text-[var(--admin-text-muted)]',
      )}
    >
      {value > 99 ? '99+' : value}
      <span className="sr-only"> в очереди</span>
    </span>
  );
}

export function AppShell({
  children,
  actorEmail,
  counts,
  buildId,
}: {
  children: React.ReactNode;
  actorEmail?: string;
  counts?: NavCounts;
  buildId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const openButton = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const env = environment();
  const still = useReducedMotion();
  const here = currentItem(location.pathname);

  const closeSheet = useCallback(() => {
    setOpen(false);
    // Focus goes back to the control that opened it, or it is left stranded on
    // an element that has just been removed from the page.
    openButton.current?.focus();
  }, []);

  // On a phone the sidebar is a sheet, and following a link must close it.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Widening the window turns the sheet back into the permanent rail. Without
  // this the sheet is still "open" at desktop width, where there is no overlay
  // to see and no close button to reach - and the focus trap below would hold
  // the keyboard inside navigation with no visible way out.
  useEffect(() => {
    const media = window.matchMedia(RAIL_QUERY);
    const sync = (event: MediaQueryListEvent) => { if (event.matches) setOpen(false); };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      // While the sheet is open it is the whole of the interface, so Tab stays
      // inside it rather than wandering into the page behind.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeSheet]);

  const toggleRail = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Not persisting the choice is survivable; ignoring it would not be.
      }
      return next;
    });
  };

  const railWidth = collapsed ? 'lg:w-[var(--shell-sidebar-collapsed)]' : 'lg:w-[var(--shell-sidebar)]';

  return (
    <div className="flex h-full min-h-0">
      <a
        href="#bormi-admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--admin-radius-sm)] focus:border focus:border-[var(--admin-border)] focus:bg-[var(--admin-surface)] focus:px-3 focus:py-2"
      >
        Перейти к содержимому
      </a>

      {open ? (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={closeSheet}
          className="fixed inset-0 z-30 bg-black/45 lg:hidden"
        />
      ) : null}

      {/*
        Shown or not shown, rather than moved off screen and back. A translated
        sidebar has to be kept out of the tab order while it is away, and a
        slide that half-works is worse than no slide.

        Exactly one display utility is applied at a time. Carrying `flex` and
        `hidden` together would leave which one wins to the order Tailwind
        happens to emit them in, which is not a thing a shell should depend on.

        While it is a sheet it is announced as a modal dialog, because that is
        what it behaves like: focus is inside it, Escape closes it, and the page
        behind is inert. On the desktop rail the role is dropped and it goes
        back to being the navigation landmark.
      */}
      <nav
        id="bormi-admin-nav"
        ref={panel}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Разделы панели"
        className={`fixed inset-y-0 left-0 z-40 w-[var(--shell-sidebar)] shrink-0 flex-col border-r border-[var(--admin-border)] bg-[var(--admin-surface)] lg:static lg:flex ${railWidth} ${open ? 'flex' : 'hidden'}`}
      >
        <div className={cn('flex h-[var(--shell-header)] shrink-0 items-center gap-2.5 border-b border-[var(--admin-border)] px-3', collapsed && 'lg:justify-center lg:px-0')}>
          <BormiMark />
          <span className={cn('min-w-0 leading-tight', collapsed && 'lg:hidden')}>
            <span className="block truncate text-sm font-semibold tracking-tight">Bormi</span>
            <span className="muted block truncate text-[11px]">Панель управления</span>
          </span>
          <button
            ref={closeButton}
            type="button"
            onClick={closeSheet}
            className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden"
          >
            <span className="sr-only">Закрыть меню</span>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Scrolls only if the menu is genuinely taller than the rail. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <LayoutGroup id="bormi-rail">
            {NAV.map((group) => (
              <div key={group.title} className="mb-3.5">
                {/*
                  A group label, not a heading. Marking these up as headings puts
                  an h2 above the page h1 in every document, which reads as a
                  broken hierarchy to anyone navigating by headings.
                */}
                <div
                  id={`nav-group-${group.title}`}
                  className={cn('t-eyebrow px-2 pb-1.5', collapsed && 'lg:sr-only')}
                >
                  {group.title}
                </div>
                <ul className="space-y-0.5" aria-labelledby={`nav-group-${group.title}`}>
                  {group.items.map((item) => {
                    const count = item.badge ? counts?.[item.badge] : undefined;
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) => cn(
                            'rail-item relative flex min-h-11 items-center gap-3 rounded-[var(--admin-radius-sm)] px-2 text-sm transition-colors',
                            collapsed && 'lg:justify-center lg:px-0',
                            isActive ? 'nav-active' : 'text-[var(--admin-text)] hover:bg-[var(--admin-surface-subtle)]',
                          )}
                          aria-current={location.pathname === item.to ? 'page' : undefined}
                        >
                          {({ isActive }) => (
                            <>
                              {/* The travelling indicator. One element for the
                                  whole rail, so it moves rather than blinks. */}
                              {isActive ? (
                                <>
                                  <motion.span
                                    aria-hidden="true"
                                    layoutId="rail-active-bg"
                                    className="nav-active-bg"
                                    transition={still ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34, mass: 0.7 }}
                                  />
                                  <motion.span
                                    aria-hidden="true"
                                    layoutId="rail-active-bar"
                                    className="nav-active-bar"
                                    transition={still ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34, mass: 0.7 }}
                                  />
                                </>
                              ) : null}
                              <span className="relative z-10 flex shrink-0 items-center"><Icon name={item.icon} /></span>
                              <span className={cn('relative z-10 min-w-0 truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                              {typeof count === 'number' && count > 0 && !collapsed ? (
                                <RailBadge value={count} urgent={item.badge !== 'operations'} />
                              ) : null}
                              {collapsed ? <span className="rail-tip hidden lg:block">{item.label}</span> : null}
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </LayoutGroup>
        </div>

        {/*
          The footer, and the one place the previous console is offered. It is
          below the fold of the menu on purpose: it is an escape hatch, not a
          tenth section, and listing it among the sections invited an operator
          to treat the two panels as equals.
        */}
        <div className="shrink-0 border-t border-[var(--admin-border)] px-2 py-2">
          <a
            href="/admin-tools/agents"
            className={cn('muted flex min-h-11 items-center gap-3 rounded-[var(--admin-radius-sm)] px-2 text-[13px] transition-colors hover:bg-[var(--admin-surface-subtle)] hover:text-[var(--admin-text)]', collapsed && 'lg:justify-center lg:px-0')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="shrink-0">
              <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            <span className={collapsed ? 'lg:hidden' : ''}>Прежняя админка</span>
          </a>
          <button
            type="button"
            onClick={toggleRail}
            aria-pressed={collapsed}
            className="muted hidden min-h-11 w-full items-center gap-3 rounded-[var(--admin-radius-sm)] px-2 text-[13px] transition-colors hover:bg-[var(--admin-surface-subtle)] hover:text-[var(--admin-text)] lg:flex"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="shrink-0">
              {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
            <span className={collapsed ? 'lg:hidden' : ''}>Свернуть меню</span>
            <span className="sr-only">{collapsed ? 'Развернуть меню' : 'Свернуть меню'}</span>
          </button>
          {/* Which build is on screen, where a release engineer looks first. */}
          <p className={cn('muted mt-1 truncate px-2 text-[11px]', collapsed && 'lg:hidden')}>
            {buildId ?? 'сборка не указана'}
          </p>
        </div>
      </nav>

      {/* While the sheet is a modal, the page behind it is not there to read. */}
      <div className="flex min-w-0 flex-1 flex-col" aria-hidden={open ? true : undefined}>
        <header className="flex h-[var(--shell-header)] shrink-0 items-center gap-2 border-b border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 sm:px-5">
          <button
            ref={openButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="bormi-admin-nav"
            className="inline-flex min-h-11 min-w-10 shrink-0 items-center justify-center rounded-[var(--admin-radius-sm)] border border-[var(--admin-border)] lg:hidden"
          >
            <span className="sr-only">Открыть меню</span>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          {/*
            Where you are, as a trail rather than a single word. The group is
            the context an operator needs to know whether "На модерации" is a
            content screen or a queue, and it costs one line of markup.
          */}
          <nav aria-label="Хлебные крошки" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              {here ? (
                <>
                  <li className="muted hidden shrink-0 sm:block">{here.group}</li>
                  <li aria-hidden="true" className="muted hidden shrink-0 sm:block">/</li>
                  <li className="min-w-0 truncate font-medium" aria-current="page">{here.label}</li>
                </>
              ) : (
                <li className="min-w-0 truncate font-medium">Bormi Admin</li>
              )}
            </ol>
          </nav>

          {/*
            A production or preview label is a convenience and may be dropped
            on the narrowest screens to make room. A synthetic one may not: the
            width at which an operator is most likely to be reading quickly is
            the last width at which to hide the word that says none of this is
            real.
          */}
          <span
            className={cn(
              'shrink-0 items-center rounded-[var(--admin-radius-pill)] border px-2.5 py-1 text-xs font-medium',
              env.synthetic ? 'inline-flex' : 'hidden sm:inline-flex',
              env.tone,
            )}
            data-testid="admin-environment"
          >
            {env.label}
          </span>
          <ThemeToggle />
          <OwnerMenu actorEmail={actorEmail} synthetic={env.synthetic} />
        </header>

        {/*
          The one scroll region in the whole application. It takes focus from
          the skip link, which otherwise moves the caret nowhere and leaves the
          next Tab back at the top of the navigation it was trying to skip.

          The inner wrapper caps the working area. Past about 1560px a table
          stops getting denser and starts making the eye travel, and the row an
          operator is reading loses its left edge.
        */}
        <main
          id="bormi-admin-main"
          tabIndex={-1}
          className="app-scroll min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full max-w-[var(--shell-content-max)]">
            {FIXTURE_MODE ? <SyntheticNotice text={SYNTHETIC_NOTICE} /> : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Who is signed in, and a way out.
 *
 * Under fixtures the identity is named as invented rather than printed as an
 * address: an operator glancing at the corner of a console reads that line as
 * "this is who I am on this system", and a fabricated address in that position
 * is the single most convincing thing on a screen full of fabrications.
 *
 * A disclosure, not a `role="menu"`. The menu role is a promise of arrow-key
 * navigation between items, and a screen reader announces it as one; two links
 * in a box that only answer Tab are a disclosure, and calling them a menu just
 * means the keyboard behaves differently from the way it was announced.
 */
function OwnerMenu({ actorEmail, synthetic }: { actorEmail?: string; synthetic: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    const onClick = (event: MouseEvent) => {
      if (!menu.current || menu.current.contains(event.target as Node)) return;
      if (trigger.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const label = synthetic ? 'Демо-владелец' : (actorEmail ?? 'Владелец');

  return (
    <div className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="bormi-admin-owner"
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--admin-border)] px-2 text-sm transition-colors hover:border-[var(--admin-border-strong)]"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-primary-soft)] text-xs font-semibold text-[var(--admin-primary)]"
        >
          {(label[0] ?? '?').toUpperCase()}
        </span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{label}</span>
      </button>
      {open ? (
        <div
          ref={menu}
          id="bormi-admin-owner"
          className="surface-raised absolute right-0 z-50 mt-1 w-64 p-2"
        >
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{label}</p>
            <p className="muted mt-0.5 text-xs">
              {synthetic
                ? 'Вымышленная учётная запись для проверки интерфейса'
                : 'Владелец платформы'}
            </p>
          </div>
          <a
            href="/admin-tools/agents"
            className="flex min-h-11 items-center rounded-[var(--admin-radius-sm)] px-2 text-sm transition-colors hover:bg-[var(--admin-surface-subtle)]"
          >
            Прежняя админка
          </a>
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-11 w-full items-center rounded-[var(--admin-radius-sm)] px-2 text-left text-sm text-[var(--admin-danger)] transition-colors hover:bg-[var(--admin-danger-soft)]"
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
