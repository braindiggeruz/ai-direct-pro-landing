/**
 * The shell: a collapsible sidebar, a thin sticky header, one main region.
 *
 * The arrangement is TailAdmin's (MIT) and it is a good one - navigation that
 * stays put, a header that does not compete with it, content that owns the rest.
 * Everything inside is Bormi's: the sections are the ones this marketplace
 * actually has, and a section that has no domain behind it yet is not in the
 * list at all rather than being present and empty.
 */
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { signOut } from '../lib/api';

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
  {
    title: 'Продавцы',
    items: [{ to: '/access', label: 'Магазины и доступы', icon: 'access' }],
  },
  {
    title: 'Безопасность',
    items: [{ to: '/audit', label: 'Аудит', icon: 'audit' }],
  },
  {
    title: 'Система',
    items: [{ to: '/system', label: 'Состояние', icon: 'system' }],
  },
];

/** Line icons, inline. No icon font, no sprite request, nothing to load. */
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
          <circle cx="12" cy="12" r="4.2" />
        ) : (
          <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.4 8.4 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

export function AppShell({ children, actorEmail }: { children: React.ReactNode; actorEmail?: string }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const closeButton = useRef<HTMLButtonElement | null>(null);

  // On a phone the sidebar is a sheet, and following a link must close it.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    closeButton.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-full lg:flex">
      {open ? (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      {/*
        Shown or not shown, rather than moved off screen and back.
        A translated sidebar has to be kept out of the tab order while it is
        away, and a slide that half-works is worse than no slide: this is one
        rule, it cannot desynchronise from the state, and a keyboard never
        reaches a panel that is not there.
      */}
      <nav
        id="bormi-admin-nav"
        aria-label="Разделы панели"
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-[var(--border-line)] bg-[var(--surface-paper)] px-3 py-4 lg:static lg:block ${open ? 'block' : 'hidden'}`}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-6 w-6 rounded-[8px] bg-[var(--accent)]"
              />
              <span className="text-base font-semibold tracking-tight">Bormi Admin</span>
            </div>
            <p className="muted mt-1 text-xs">Owner Control Center</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden"
          >
            <span className="sr-only">Закрыть меню</span>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {NAV.map((group) => (
          <div key={group.title} className="mb-5">
            <h2 className="muted px-2 pb-2 text-[11px] font-medium tracking-wide uppercase">
              {group.title}
            </h2>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => [
                      'flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 text-sm',
                      isActive
                        ? 'bg-[var(--surface-soft)] font-medium text-[var(--accent)]'
                        : 'text-[var(--text-primary)]',
                    ].join(' ')}
                    aria-current={location.pathname === item.to ? 'page' : undefined}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border-line)] bg-[var(--surface-paper)] px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="bormi-admin-nav"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-line)] lg:hidden"
          >
            <span className="sr-only">Открыть меню</span>
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            {actorEmail ? (
              <p className="muted truncate text-xs">
                Вы вошли как <span className="text-[var(--text-primary)]">{actorEmail}</span>
              </p>
            ) : null}
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
          >
            Выйти
          </button>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
