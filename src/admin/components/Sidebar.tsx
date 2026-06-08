import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, BookOpen, Link2, ArrowRightLeft, Settings, LogOut, GitBranch, Gauge } from 'lucide-react';
import { setToken } from '../lib/api';

const items = [
  { to: '/admin-tools/', label: 'Cockpit', icon: LayoutDashboard, end: true, testId: 'nav-cockpit' },
  { to: '/admin-tools/pages', label: 'Pages', icon: FileText, testId: 'nav-pages' },
  { to: '/admin-tools/blog', label: 'Blog', icon: BookOpen, testId: 'nav-blog' },
  { to: '/admin-tools/internal-links', label: 'Internal links', icon: Link2, testId: 'nav-internal-links' },
  { to: '/admin-tools/seo-booster', label: 'SEO Booster', icon: Gauge, testId: 'nav-seo-booster' },
  { to: '/admin-tools/redirects', label: 'Redirects', icon: ArrowRightLeft, testId: 'nav-redirects' },
  { to: '/admin-tools/settings', label: 'Global SEO', icon: Settings, testId: 'nav-settings' },
];

export function Sidebar({ onPublish }: { onPublish?: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const logout = () => { setToken(null); nav('/admin-tools/login'); };

  return (
    <aside className="w-64 shrink-0 border-r border-white/5 bg-bg-base/60 backdrop-blur-md h-screen sticky top-0 flex flex-col">
      <div className="px-6 py-5 border-b border-white/5">
        <div className="text-xs uppercase tracking-widest text-white/40">GPTBot</div>
        <div className="font-display text-xl text-white mt-1">SEO Cockpit</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              data-testid={it.testId}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-brand-blue/15 text-brand-cyan' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon size={16} />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/5 space-y-2">
        {onPublish && (
          <button data-testid="publish-to-github-btn" onClick={onPublish}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 hover:bg-white/10">
            <GitBranch size={16} /> Publish to GitHub
          </button>
        )}
        <button data-testid="logout-btn" onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5">
          <LogOut size={16} /> Logout
        </button>
      </div>
    </aside>
  );
}
