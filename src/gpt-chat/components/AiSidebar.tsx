import { useEffect, useRef } from 'react';
import type { Locale } from '../types';
import type { ChatStrings } from '../i18n';
import type { AiToolId } from '../templates';
import type { RoleId } from '../roles';
import { RoleSelector } from './RoleSelector';
import { track, EV } from '../analytics';

const TOOLS: Array<{ id: AiToolId; ru: string; uz: string; icon: string }> = [
  { id: 'chat', ru: 'Chat', uz: 'Chat', icon: 'M4 5h16v11H9l-5 4V5z' },
  { id: 'images', ru: 'Промты', uz: 'Promptlar', icon: 'M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5' },
  { id: 'smm', ru: 'SMM', uz: 'SMM', icon: 'M5 18V9m7 9V5m7 13v-6' },
  { id: 'business', ru: 'Бизнес', uz: 'Biznes', icon: 'M4 8h16v11H4zM9 8V5h6v3m-2 5h-2' },
  { id: 'study', ru: 'Учёба', uz: 'O‘qish', icon: 'M3 9l9-5 9 5-9 5-9-5zm4 3v4c3 2 7 2 10 0v-4' },
];

interface SidebarProps {
  locale: Locale;
  t: ChatStrings;
  activeTool: AiToolId;
  onToolChange: (tool: AiToolId) => void;
  onNewChat: () => void;
  role: RoleId;
  onRoleChange: (role: RoleId) => void;
  busy?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function SidebarBody({
  locale, t, activeTool, onToolChange, onNewChat, role, onRoleChange, busy, collapsed, inDrawer, onNavigateAway,
}: {
  locale: Locale;
  t: ChatStrings;
  activeTool: AiToolId;
  onToolChange: (tool: AiToolId) => void;
  onNewChat: () => void;
  role: RoleId;
  onRoleChange: (role: RoleId) => void;
  busy?: boolean;
  collapsed: boolean;
  inDrawer: boolean;
  onNavigateAway?: () => void;
}) {
  const uz = locale === 'uz';
  const links = [
    { key: 'guide', href: uz ? '/uz/gpt-chat-qollanma/' : '/ru/gpt-chat-guide/', label: t.guideLink, event: null },
    { key: 'pricing', href: uz ? '/uz/chat-bot-narxi/' : '/ru/tarify-ai-chat/', label: t.pricingLink, event: 'pricing' },
    { key: 'business', href: uz ? '/uz/biznes-uchun-ai-bot/' : '/ru/gpt-dlya-biznesa/', label: t.businessLink, event: 'business' },
    { key: 'about', href: uz ? '/uz/biz-haqimizda/' : '/ru/o-kompanii/', label: t.aboutLink, event: null },
  ];
  const onLinkClick = (event: string | null) => {
    if (event === 'pricing') { track(EV.pricingClicked, { from: 'sidebar' }); track(EV.viewPricing, { from: 'sidebar' }); }
    if (event === 'business') track(EV.businessClicked, { from: 'sidebar' });
  };
  const showLabels = !collapsed || inDrawer;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo */}
      <div className={`flex h-14 shrink-0 items-center border-b border-white/[0.06] ${showLabels ? 'px-4' : 'justify-center px-2'}`}>
        <a href="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded-lg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-grad-cta text-sm font-bold text-[#04101A]" aria-hidden="true">G</span>
          {showLabels && <span className="font-display text-[15px] text-white">{t.brand}</span>}
        </a>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4 ${showLabels ? 'px-3' : 'px-2'}`}>
        {/* New chat */}
        <button
          type="button"
          onClick={() => { onNewChat(); onNavigateAway?.(); }}
          disabled={busy}
          title={t.newChat}
          data-testid="ai-new-chat"
          className={`flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-[13px] font-medium text-white hover:bg-white/[0.07] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40 ${showLabels ? 'px-3.5' : 'justify-center px-0'}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {showLabels && t.newChat}
        </button>

        {/* Tools */}
        <nav aria-label={t.sidebarTools}>
          {showLabels && <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/35">{t.sidebarTools}</p>}
          <ul className="space-y-0.5">
            {TOOLS.map((tool) => {
              const active = tool.id === activeTool;
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={uz ? tool.uz : tool.ru}
                    onClick={() => { onToolChange(tool.id); onNavigateAway?.(); }}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${showLabels ? 'px-3' : 'justify-center px-0'} ${active ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:bg-white/[0.03] hover:text-white'}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={active ? 'text-brand-cyan' : ''}><path d={tool.icon} /></svg>
                    {showLabels && (uz ? tool.uz : tool.ru)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* AI role */}
        {showLabels && <RoleSelector locale={locale} value={role} onChange={onRoleChange} disabled={busy} />}

        {/* Links */}
        {showLabels && (
          <nav aria-label={t.sidebarLinks} className="mt-auto">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/35">{t.sidebarLinks}</p>
            <ul className="space-y-0.5">
              {links.map((l) => (
                <li key={l.key}>
                  <a
                    href={l.href}
                    onClick={() => onLinkClick(l.event)}
                    data-testid={`sidebar-${l.key}`}
                    className="flex min-h-11 items-center rounded-xl px-3 text-[13px] text-white/55 hover:bg-white/[0.03] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* Footer disclaimer */}
      {showLabels && (
        <p className="shrink-0 border-t border-white/[0.06] px-4 py-3 text-[10px] leading-relaxed text-white/30">{t.disclaimer}</p>
      )}
    </div>
  );
}

export function AiSidebar(props: SidebarProps) {
  const { collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, t } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Drawer: Escape closes; Tab is trapped inside the panel.
  useEffect(() => {
    if (!mobileOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseMobile(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex h-full shrink-0 flex-col border-r border-white/[0.06] transition-[width] duration-150 motion-reduce:transition-none ${collapsed ? 'w-[60px]' : 'w-[260px]'}`}>
        <SidebarBody {...props} inDrawer={false} />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t.expandMenu : t.collapseMenu}
          title={collapsed ? t.expandMenu : t.collapseMenu}
          className="flex min-h-11 shrink-0 items-center justify-center border-t border-white/[0.06] text-white/40 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={collapsed ? 'rotate-180' : ''}><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.sidebarLinks}>
          <button type="button" aria-label={t.menuClose} onClick={onCloseMobile} className="absolute inset-0 bg-black/60" />
          <div ref={panelRef} className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-[#0a0f1a] shadow-2xl shadow-black/60">
            <button
              ref={closeRef}
              type="button"
              onClick={onCloseMobile}
              aria-label={t.menuClose}
              className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              ✕
            </button>
            <SidebarBody {...props} inDrawer collapsed={false} onNavigateAway={onCloseMobile} />
          </div>
        </div>
      )}
    </>
  );
}
