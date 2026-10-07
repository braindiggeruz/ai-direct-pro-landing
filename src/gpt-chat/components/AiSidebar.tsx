import { useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Locale } from '../types';
import type { SavedChat } from '../storage';
import type { ChatStrings } from '../i18n';
import type { AiToolId } from '../templates';
import type { RoleId } from '../roles';
import { LazyPart, rolePart } from '../lazy-part';
import { track, EV } from '../analytics';
import { telegramDeepLink } from '../../lib/telegram';
import { BrandMark } from './BrandMark';

const TOOLS: Array<{ id: AiToolId; ru: string; uz: string; icon: string }> = [
  { id: 'chat', ru: 'Chat', uz: 'Chat', icon: 'M4 5h16v11H9l-5 4V5z' },
  { id: 'images', ru: 'Промты', uz: 'Promptlar', icon: 'M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5' },
  { id: 'smm', ru: 'SMM', uz: 'SMM', icon: 'M5 18V9m7 9V5m7 13v-6' },
  { id: 'business', ru: 'Бизнес', uz: 'Biznes', icon: 'M4 8h16v11H4zM9 8V5h6v3m-2 5h-2' },
  { id: 'study', ru: 'Учёба', uz: 'O‘qish', icon: 'M3 9l9-5 9 5-9 5-9-5zm4 3v4c3 2 7 2 10 0v-4' },
];

// One text axis (chat UI 2026-10-07 §5.14): the scroll content has 8px of
// padding and every row 10px more, so the icons, the names of the sections,
// the links, the saved chats, the chatgpt.com line and the disclaimer start
// 18px from the panel's edge, and a row's label after its 18px icon at 48px.
/** A row with an icon: «Yangi chat», a tool, Telegram. */
const ROW = "flex min-h-11 w-full items-center gap-3 rounded-xl text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan";
/** A link of the menu's «Bo‘limlar» list, and a saved chat. */
const LINK = "flex min-h-11 items-center rounded-xl px-2.5 text-[13px] text-white/55 hover:bg-white/[0.03] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan";
/** The name of a section: one look for all of them. */
const LABEL = "mb-1 px-2.5 text-xs font-medium text-white/55";

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
  /** «Batafsil: chat haqida ↓»: to the text under the chat (REV-5). */
  onAbout: (event: { preventDefault: () => void }) => void;
  /** The chatgpt.com link was followed (its line moved here from the first screen, chat design §5.12). */
  onOfficial: () => void;
  /** The conversations kept in this browser (they left the first screen, chat UI §5.14). */
  savedChats: SavedChat[];
  onOpenSaved: (chat: SavedChat) => void;
}

function SidebarBody({
  locale, t, activeTool, onToolChange, onNewChat, role, onRoleChange, busy, collapsed, onToggleCollapsed, inDrawer, onNavigateAway, onAbout, onOfficial, savedChats, onOpenSaved,
}: Omit<SidebarProps, 'mobileOpen' | 'onCloseMobile'> & {
  inDrawer: boolean;
  onNavigateAway?: () => void;
}) {
  const uz = locale === 'uz';
  const botHref = telegramDeepLink(locale);
  const links = [
    { key: 'guide', href: uz ? '/uz/gpt-chat-qollanma/' : '/ru/gpt-chat-guide/', label: t.guideLink, event: null },
    { key: 'pricing', href: uz ? '/uz/chat-bot-narxi/' : '/ru/tarify-ai-chat/', label: t.pricingLink, event: 'pricing' },
    { key: 'business', href: uz ? '/uz/biznes-uchun-ai-bot/' : '/ru/gpt-dlya-biznesa/', label: t.businessLink, event: 'business' },
    { key: 'about', href: uz ? '/uz/biz-haqimizda/' : '/ru/o-kompanii/', label: t.aboutLink, event: null },
  ];
  const onLinkClick = (event: string | null) => {
    if (event === 'pricing') track(EV.pricingClicked, { from: 'sidebar' });
    if (event === 'business') track(EV.businessClicked, { from: 'sidebar' });
  };
  const showLabels = !collapsed || inDrawer;
  const pad = showLabels ? 'px-2.5' : 'justify-center px-0';
  // The desktop's collapse control: at the brand row's right, or alone at the top of a collapsed panel.
  const toggle = !inDrawer && (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? t.expandMenu : t.collapseMenu}
      title={collapsed ? t.expandMenu : t.collapseMenu}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/55 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${showLabels ? 'ml-auto' : ''}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={collapsed ? 'rotate-180' : ''}><path d="M15 6l-6 6 6 6" /></svg>
    </button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The one brand of the app on a wide screen: the mark and the name. */}
      <div className={`flex h-14 shrink-0 items-center ${showLabels ? 'px-3' : 'justify-center px-2'}`}>
        <a href="/" aria-label={showLabels ? undefined : t.brand} className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded-lg">
          <BrandMark />
          {showLabels && <span className="font-display text-[15px] text-white">{t.brand}</span>}
        </a>
        {showLabels && toggle}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-2">
        {!showLabels && toggle}
        {/* New chat */}
        <button
          type="button"
          onClick={() => { onNewChat(); onNavigateAway?.(); }}
          disabled={busy}
          title={t.newChat}
          data-testid="ai-new-chat"
          className={`${ROW} border border-white/10 bg-white/[0.03] font-medium text-white hover:bg-white/[0.07] disabled:opacity-40 ${pad}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {showLabels && t.newChat}
        </button>

        {/* The conversations kept in this browser, newest first. */}
        {showLabels && savedChats.length > 0 && (
          <div>
            <p className={LABEL}>{t.premium.savedChats}</p>
            <ul className="space-y-0.5">
              {savedChats.map((chat) => (
                <li key={chat.id}>
                  <button type="button" disabled={busy} onClick={() => { onOpenSaved(chat); onNavigateAway?.(); }} className={`${LINK} w-full text-left disabled:opacity-40`}>
                    <span className="truncate">{chat.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1 px-2.5 text-xs text-white/55">{t.premium.historyNote}</p>
          </div>
        )}

        {/* Tools */}
        <nav aria-label={t.sidebarTools}>
          {showLabels && <p className={LABEL}>{t.sidebarTools}</p>}
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
                    className={`${ROW} ${pad} ${active ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:bg-white/[0.03] hover:text-white'}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={active ? 'text-brand-cyan' : ''}><path d={tool.icon} /></svg>
                    {showLabels && (uz ? tool.uz : tool.ru)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* AI role: the lazy part chat-role, its place held at its height. */}
        {showLabels && (
          <LazyPart part={rolePart} fallback={<div className="h-[92px]" />} failed={null}>
            {({ RoleSelector }) => <RoleSelector locale={locale} value={role} onChange={onRoleChange} disabled={busy} />}
          </LazyPart>
        )}

        {/* Telegram CTA — the assistant bot, whose username always has a value
            (src/lib/telegram.ts). It used to vanish entirely, which left the
            chat with no route to Telegram. */}
        {showLabels && (
          <a
            href={botHref}
            target="_blank"
            rel="nofollow noopener noreferrer"
            onClick={() => track(EV.telegramCtaClicked, { from: 'sidebar', channel: 'bot', locale })}
            data-testid="sidebar-telegram"
            className={`${ROW} mt-auto border border-brand-cyan/25 bg-brand-cyan/[0.06] px-2.5 font-medium text-brand-cyan hover:bg-brand-cyan/[0.12]`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 4L2 11l6 2 2 6 3-4 5 4 4-15z" /></svg>
            {t.telegramCta}
          </a>
        )}

        {/* Links */}
        {showLabels && (
          <nav aria-label={t.sidebarLinks}>
            <p className={LABEL}>{t.sidebarLinks}</p>
            <ul className="space-y-0.5">
              <li>
                <a href="#seo-summary" onClick={onAbout} className={LINK}>
                  {t.aboutChat}
                </a>
              </li>
              {links.map((l) => (
                <li key={l.key}>
                  <a
                    href={l.href}
                    onClick={() => onLinkClick(l.event)}
                    data-testid={`sidebar-${l.key}`}
                    className={LINK}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Many visitors of both chat pages searched «chatgpt kirish» and may
            want OpenAI itself: where that is, and that this chat is not it.
            It stood on the first screen until the chat design release; the
            header and the composer's line say «not OpenAI» there now. */}
        {showLabels && (
          <p className="gpt-official" data-testid="gpt-official">
            {t.premium.officialLead}
            <a
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOfficial}
            >
              chatgpt.com
            </a>
            {t.premium.officialTail}
          </p>
        )}

        {/* The disclaimer ends the list; it no longer stands over «Bo‘limlar». */}
        {showLabels && (
          <p className="gpt-disclaimer">{t.disclaimer}</p>
        )}
      </div>
    </div>
  );
}

export function AiSidebar(props: SidebarProps) {
  const { collapsed, mobileOpen, onCloseMobile, t } = props;
  // A wide screen shows the menu, and so the role picker, from the start.
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) rolePart.preload();
  }, []);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex h-full shrink-0 flex-col border-r border-white/[0.06] transition-[width] duration-150 motion-reduce:transition-none ${collapsed ? 'w-[60px]' : 'w-[260px]'}`}>
        <SidebarBody {...props} inDrawer={false} />
      </aside>

      <Dialog open={mobileOpen} onOpenChange={(open) => { if (!open) onCloseMobile(); }}>
        <DialogContent className="gpt-premium gpt-sidebar-dialog ym-hide-content" showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>('[data-testid="ai-menu-button"]')?.focus();
          }}>
          <DialogTitle className="sr-only">{t.sidebarLinks}</DialogTitle>
          <DialogDescription className="sr-only">{t.sidebarTools}</DialogDescription>
          <Button type="button" variant="ghost" size="icon-lg" className="gpt-sidebar-close"
            onClick={onCloseMobile} aria-label={t.menuClose}><X data-icon="inline-start" /></Button>
          <SidebarBody {...props} inDrawer collapsed={false} onNavigateAway={onCloseMobile} />
        </DialogContent>
      </Dialog>
    </>
  );
}
