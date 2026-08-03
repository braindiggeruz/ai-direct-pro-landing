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
 * Everything inside is Bormi's: the sections are the ones this marketplace
 * actually has, and a section with no domain behind it is not in the list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { FIXTURE_MODE, signOut } from '../lib/api';
import { SYNTHETIC_NOTICE } from '../lib/fixtures';
import { SyntheticNotice } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: 'overview' | 'access' | 'audit' | 'system';
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
  { title: 'Продавцы', items: [{ to: '/access', label: 'Магазины и доступы', icon: 'access' }] },
  { title: 'Безопасность', items: [{ to: '/audit', label: 'Аудит', icon: 'audit' }] },
  { title: 'Система', items: [{ to: '/system', label: 'Состояние', icon: 'system' }] },
];

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
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-line)]"
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
      tone: 'border-[var(--tone-warn)] text-[var(--tone-warn)]',
      synthetic: true,
    };
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return { label: 'Локальная сборка', tone: 'border-[var(--border-line)] muted', synthetic: false };
  }
  if (host.endsWith('.pages.dev')) {
    return { label: 'Preview', tone: 'border-[var(--border-line)] muted', synthetic: false };
  }
  return { label: 'Production', tone: 'border-[var(--tone-good)] text-[var(--tone-good)]', synthetic: false };
}

function currentSection(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) return item.label;
    }
  }
  return 'Bormi Admin';
}

export function AppShell({ children, actorEmail }: { children: React.ReactNode; actorEmail?: string }) {
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-control)] focus:border focus:border-[var(--border-line)] focus:bg-[var(--surface-paper)] focus:px-3 focus:py-2"
      >
        Перейти к содержимому
      </a>

      {open ? (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={closeSheet}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
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
        className={`fixed inset-y-0 left-0 z-40 w-[var(--shell-sidebar)] shrink-0 flex-col border-r border-[var(--border-line)] bg-[var(--surface-paper)] lg:static lg:flex ${railWidth} ${open ? 'flex' : 'hidden'}`}
      >
        <div className={`flex h-[var(--shell-header)] shrink-0 items-center border-b border-[var(--border-line)] px-3 ${collapsed ? 'lg:justify-center' : ''}`}>
          <span aria-hidden="true" className="inline-block h-6 w-6 shrink-0 rounded-[7px] bg-[var(--accent)]" />
          <span className={`ml-2 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <span className="block truncate text-sm font-semibold tracking-tight">Bormi Admin</span>
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
          {NAV.map((group) => (
            <div key={group.title} className="mb-4">
              {/*
                A group label, not a heading. Marking these up as headings puts
                an h2 above the page h1 in every document, which reads as a
                broken hierarchy to anyone navigating by headings.
              */}
              <div
                id={`nav-group-${group.title}`}
                className={`muted px-2 pb-1.5 text-[11px] font-medium tracking-wide uppercase ${collapsed ? 'lg:sr-only' : ''}`}
              >
                {group.title}
              </div>
              <ul className="space-y-0.5" aria-labelledby={`nav-group-${group.title}`}>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => [
                        'rail-item relative flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm',
                        collapsed ? 'lg:justify-center lg:px-0' : '',
                        isActive ? 'nav-active' : 'text-[var(--text-primary)]',
                      ].join(' ')}
                      aria-current={location.pathname === item.to ? 'page' : undefined}
                    >
                      <Icon name={item.icon} />
                      <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                      {collapsed ? <span className="rail-tip hidden lg:block">{item.label}</span> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-[var(--border-line)] px-2 py-2">
          <a
            href="/admin-tools/agents"
            className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            <span className={collapsed ? 'lg:hidden' : ''}>Прежняя админка</span>
          </a>
          <button
            type="button"
            onClick={toggleRail}
            aria-pressed={collapsed}
            className="hidden min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm lg:flex"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
            <span className={collapsed ? 'lg:hidden' : ''}>Свернуть меню</span>
            <span className="sr-only">{collapsed ? 'Развернуть меню' : 'Свернуть меню'}</span>
          </button>
        </div>
      </nav>

      {/* While the sheet is a modal, the page behind it is not there to read. */}
      <div className="flex min-w-0 flex-1 flex-col" aria-hidden={open ? true : undefined}>
        <header className="flex h-[var(--shell-header)] shrink-0 items-center gap-2 border-b border-[var(--border-line)] bg-[var(--surface-paper)] px-3 sm:px-4">
          <button
            ref={openButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="bormi-admin-nav"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-line)] lg:hidden"
          >
            <span className="sr-only">Открыть меню</span>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <p className="min-w-0 flex-1 truncate text-sm font-medium">{currentSection(location.pathname)}</p>

          {/*
            A production or preview label is a convenience and may be dropped
            on the narrowest screens to make room. A synthetic one may not: the
            width at which an operator is most likely to be reading quickly is
            the last width at which to hide the word that says none of this is
            real.
          */}
          <span
            className={`shrink-0 items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs ${
              env.synthetic ? 'inline-flex' : 'hidden sm:inline-flex'
            } ${env.tone}`}
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
        */}
        <main
          id="bormi-admin-main"
          tabIndex={-1}
          className="app-scroll min-w-0 flex-1 px-4 py-5 sm:px-6"
        >
          {FIXTURE_MODE ? <SyntheticNotice text={SYNTHETIC_NOTICE} /> : null}
          {children}
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
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-line)] px-2 text-sm"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-soft)] text-xs"
        >
          {(label[0] ?? '?').toUpperCase()}
        </span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{label}</span>
      </button>
      {open ? (
        <div
          ref={menu}
          id="bormi-admin-owner"
          className="surface absolute right-0 z-50 mt-1 w-64 p-2"
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
            className="flex min-h-11 items-center rounded-[var(--radius-control)] px-2 text-sm"
          >
            Прежняя админка
          </a>
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-2 text-left text-sm text-[var(--tone-bad)]"
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
