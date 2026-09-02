import { Link, useLocation, useNavigate } from 'react-router';
import { LayoutDashboard, FileText, BookOpen, Link2, ArrowRightLeft, Settings, LogOut, GitBranch, Gauge, Inbox, PlayCircle, Send, ShieldCheck, Radar, Radio } from 'lucide-react';
import { setToken } from '../lib/api';
import { useT } from '../i18n';

export function Sidebar({ onPublish, role }: { onPublish?: () => void; role?: string }) {
  const { t } = useT();
  const loc = useLocation();
  const nav = useNavigate();
  const logout = () => { setToken(null); nav('/admin-tools/login'); };

  const allItems = [
    { to: '/admin-tools/',                label: t.nav.cockpit,        icon: LayoutDashboard, end: true, testId: 'nav-cockpit' },
    { to: '/admin-tools/seo-autopilot',   label: t.nav.seo_autopilot,  icon: PlayCircle,                  testId: 'nav-seo-autopilot' },
    { to: '/admin-tools/lead-radar',      label: t.nav.lead_radar,     icon: Radar,                       testId: 'nav-lead-radar' },
    { to: '/admin-tools/signal-radar',    label: t.nav.signal_radar,   icon: Radio,                       testId: 'nav-signal-radar' },
    { to: '/admin-tools/agents',          label: t.nav.owner_center,   icon: ShieldCheck,                 testId: 'nav-owner-center' },
    { to: '/admin-tools/pages',           label: t.nav.pages,          icon: FileText,                    testId: 'nav-pages' },
    { to: '/admin-tools/blog',            label: t.nav.blog,           icon: BookOpen,                    testId: 'nav-blog' },
    { to: '/admin-tools/ai-drafts',       label: t.nav.ai_drafts,      icon: Inbox,                       testId: 'nav-ai-drafts' },
    { to: '/admin-tools/internal-links',  label: t.nav.internal_links, icon: Link2,                       testId: 'nav-internal-links' },
    { to: '/admin-tools/seo-booster',     label: t.nav.seo_booster,    icon: Gauge,                       testId: 'nav-seo-booster' },
    { to: '/admin-tools/indexnow',        label: t.nav.indexnow,       icon: Send,                        testId: 'nav-indexnow' },
    { to: '/admin-tools/redirects',       label: t.nav.redirects,      icon: ArrowRightLeft,              testId: 'nav-redirects' },
    { to: '/admin-tools/settings',        label: t.nav.global_seo,     icon: Settings,                    testId: 'nav-settings' },
  ];
  const items = role === 'support_readonly'
    ? allItems.filter((item) => item.testId === 'nav-owner-center')
    : allItems;

  return (
    <aside className="w-[4.5rem] lg:w-64 shrink-0 border-r border-white/5 bg-bg-base/80 backdrop-blur-md h-screen sticky top-0 flex flex-col transition-[width]">
      <div className="px-3 lg:px-6 py-5 border-b border-white/5">
        <div className="text-xs uppercase tracking-widest text-white/60">GPTBot</div>
        <div className="hidden lg:block font-display text-xl text-white mt-1" data-testid="sidebar-brand">{t.nav.brand_label}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              data-testid={it.testId}
              aria-label={it.label}
              title={it.label}
              className={`flex min-h-12 items-center justify-center lg:justify-start gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${active ? 'bg-brand-blue/15 text-brand-cyan' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon size={16} />
              <span className="hidden lg:inline">{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/5 space-y-2">
        {onPublish && (
          <button data-testid="publish-to-github-btn" onClick={onPublish}
            aria-label={t.nav.publish_github}
            title={t.nav.publish_github}
            className="w-full min-h-12 flex items-center justify-center lg:justify-start gap-2 px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 hover:bg-white/10">
            <GitBranch size={16} /> <span className="hidden lg:inline">{t.nav.publish_github}</span>
          </button>
        )}
        <button data-testid="logout-btn" onClick={logout}
          aria-label={t.nav.logout}
          title={t.nav.logout}
          className="w-full min-h-12 flex items-center justify-center lg:justify-start gap-2 px-3 py-2 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5">
          <LogOut size={16} /> <span className="hidden lg:inline">{t.nav.logout}</span>
        </button>
      </div>
    </aside>
  );
}
