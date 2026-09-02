import { Link, useLocation, useNavigate } from 'react-router';
import { LayoutDashboard, FileText, BookOpen, Link2, ArrowRightLeft, Settings, LogOut, GitBranch, Gauge, Inbox, PlayCircle, Send, ShieldCheck, Radar, Radio } from 'lucide-react';
import { setToken } from '../lib/api';
import { useT } from '../i18n';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  testId: string;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function Sidebar({ onPublish, role, signalBadge }: { onPublish?: () => void; role?: string; signalBadge?: number }) {
  const { t } = useT();
  const loc = useLocation();
  const nav = useNavigate();
  const logout = () => { setToken(null); nav('/admin-tools/login'); };

  const groups: NavGroup[] = [
    {
      title: t.nav.group_overview,
      items: [
        { to: '/admin-tools/', label: t.nav.cockpit, icon: LayoutDashboard, end: true, testId: 'nav-cockpit' },
      ],
    },
    {
      title: t.nav.group_radars,
      items: [
        { to: '/admin-tools/lead-radar', label: t.nav.lead_radar, icon: Radar, testId: 'nav-lead-radar' },
        { to: '/admin-tools/signal-radar', label: t.nav.signal_radar, icon: Radio, testId: 'nav-signal-radar', badge: signalBadge },
      ],
    },
    {
      title: t.nav.group_platform,
      items: [
        { to: '/admin-tools/agents', label: t.nav.owner_center, icon: ShieldCheck, testId: 'nav-owner-center' },
      ],
    },
    {
      title: t.nav.group_content,
      items: [
        { to: '/admin-tools/pages', label: t.nav.pages, icon: FileText, testId: 'nav-pages' },
        { to: '/admin-tools/blog', label: t.nav.blog, icon: BookOpen, testId: 'nav-blog' },
        { to: '/admin-tools/ai-drafts', label: t.nav.ai_drafts, icon: Inbox, testId: 'nav-ai-drafts' },
      ],
    },
    {
      title: t.nav.group_seo,
      items: [
        { to: '/admin-tools/seo-autopilot', label: t.nav.seo_autopilot, icon: PlayCircle, testId: 'nav-seo-autopilot' },
        { to: '/admin-tools/internal-links', label: t.nav.internal_links, icon: Link2, testId: 'nav-internal-links' },
        { to: '/admin-tools/seo-booster', label: t.nav.seo_booster, icon: Gauge, testId: 'nav-seo-booster' },
        { to: '/admin-tools/indexnow', label: t.nav.indexnow, icon: Send, testId: 'nav-indexnow' },
        { to: '/admin-tools/redirects', label: t.nav.redirects, icon: ArrowRightLeft, testId: 'nav-redirects' },
        { to: '/admin-tools/settings', label: t.nav.global_seo, icon: Settings, testId: 'nav-settings' },
      ],
    },
  ];

  const filtered = role === 'support_readonly'
    ? groups.map((g) => ({ ...g, items: g.items.filter((it) => it.testId === 'nav-owner-center') })).filter((g) => g.items.length > 0)
    : groups;

  return (
    <aside className="w-[4.5rem] lg:w-64 shrink-0 border-r border-white/5 bg-bg-base/80 backdrop-blur-md h-screen sticky top-0 flex flex-col transition-[width]">
      <div className="px-3 lg:px-6 py-5 border-b border-white/5">
        <div className="text-xs uppercase tracking-widest text-white/60">GPTBot</div>
        <div className="hidden lg:block font-display text-xl text-white mt-1" data-testid="sidebar-brand">{t.nav.brand_label}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {filtered.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="hidden lg:block px-3 py-1 text-[10px] uppercase tracking-widest text-white/30 font-medium">
              {group.title}
            </div>
            {group.items.map((it) => {
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
                  <span className="relative">
                    <Icon size={16} />
                    {(it.badge ?? 0) > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-2 ring-bg-base">
                        {it.badge! > 9 ? '9+' : it.badge}
                      </span>
                    )}
                  </span>
                  <span className="hidden lg:inline">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
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
