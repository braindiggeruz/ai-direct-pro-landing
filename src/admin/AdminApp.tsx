import AeoWorkspace from './pages/AeoWorkspace';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import { createContext, useContext, useEffect, useState } from 'react';
import Login from './pages/Login';
import Cockpit from './pages/Cockpit';
import PagesList from './pages/PagesList';
import PageEditor from './pages/PageEditor';
import BlogList from './pages/BlogList';
import BlogEditor from './pages/BlogEditor';
import InternalLinksPage from './pages/InternalLinks';
import SeoBooster from './pages/SeoBooster';
import IndexNowPanel from './pages/IndexNowPanel';
import Redirects from './pages/Redirects';
import Settings from './pages/Settings';
import AiDraftsList from './pages/AiDraftsList';
import AiDraftDetail from './pages/AiDraftDetail';
import SeoAutopilotControlCenter from './pages/SeoAutopilotControlCenter';
import LeadRadar from './pages/LeadRadar';
import SignalRadar from './pages/SignalRadar';
import OwnerOverview from './pages/owner/OwnerOverview';
import OwnerStores from './pages/owner/OwnerStores';
import OwnerStoreDetail from './pages/owner/OwnerStoreDetail';
import OwnerOrders from './pages/owner/OwnerOrders';
import OwnerHandoffs from './pages/owner/OwnerHandoffs';
import OwnerAutomation from './pages/owner/OwnerAutomation';
import OwnerAudit from './pages/owner/OwnerAudit';
import OwnerPilot from './pages/owner/OwnerPilot';
import { Sidebar } from './components/Sidebar';
import { AdminErrorBoundary } from './components/AdminErrorBoundary';
import { api, getToken } from './lib/api';
import { ADMIN_HOME, ADMIN_ROUTE_PATHS } from './routes';

interface AdminSession {
  email: string;
  role: string;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const nav = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!getToken()) { nav('/admin-tools/login', { replace: true }); return; }
    void api.me().then(setSession).catch(() => { nav('/admin-tools/login', { replace: true }); });
  }, [nav]);
  if (session === null) return <div className="min-h-screen bg-bg-base text-white/60 flex items-center justify-center">Authenticating…</div>;
  if (
    session.role === 'support_readonly'
    && !location.pathname.startsWith('/admin-tools/agents')
  ) {
    return <Navigate to="/admin-tools/agents" replace/>;
  }
  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const session = useContext(AdminSessionContext);
  const [publishing, setPublishing] = useState(false);
  const [signalBadge, setSignalBadge] = useState<number>(0);

  // Poll signal radar badge every 30s while admin is open.
  useEffect(() => {
    if (session?.role === 'support_readonly') return;
    let mounted = true;
    const poll = async () => {
      try {
        const overview = await api.signalRadarOverview();
        if (mounted) setSignalBadge(overview.installed ? overview.totals.leadsNew : 0);
      } catch { /* badge silently fails */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, [session?.role]);

  const onPublish = async () => {
    if (!confirm('Commit all local content/*.json files to GitHub now?')) return;
    setPublishing(true);
    try {
      const r = await api.publishToGitHub('chore(seo): admin publish');
      alert(`Committed ${r.committed} file(s). ${r.commitSha ? 'SHA: ' + r.commitSha.slice(0,7) : ''}`);
    } catch (e) { alert('Publish failed: ' + (e as Error).message); }
    setPublishing(false);
  };
  return (
    <div className={`flex min-h-screen bg-bg-base text-white ${location.pathname.startsWith("/admin-tools/aeo") ? "aeo-shell" : ""}`}>
      <a
        href="#admin-main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-brand-cyan px-4 py-3 font-semibold text-black shadow-lg transition-transform focus:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
      >
        Перейти к основному содержимому
      </a>
      <Sidebar
        onPublish={session?.role === 'support_readonly' ? undefined : onPublish}
        role={session?.role}
        signalBadge={signalBadge}
      />
      <main id="admin-main-content" tabIndex={-1} className="flex-1 min-w-0">{publishing ? <div className="p-8">Publishing to GitHub…</div> : children}</main>
    </div>
  );
}

// Paths here are RELATIVE to the parent `/admin-tools/*` route mounted in main.tsx.
export default function AdminApp() {
  return (
    <AdminErrorBoundary>
      <Routes>
        <Route path={ADMIN_ROUTE_PATHS.login} element={<Login />} />
        <Route index element={<RequireAuth><Shell><Cockpit/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.pages} element={<RequireAuth><Shell><PagesList/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.pageNew} element={<RequireAuth><Shell><PageEditor/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.pageEdit} element={<RequireAuth><Shell><PageEditor/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.blog} element={<RequireAuth><Shell><BlogList/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.blogNew} element={<RequireAuth><Shell><BlogEditor/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.blogEdit} element={<RequireAuth><Shell><BlogEditor/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.drafts} element={<RequireAuth><Shell><AiDraftsList/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.draftDetail} element={<RequireAuth><Shell><AiDraftDetail/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.aeo} element={<RequireAuth><Shell><AeoWorkspace/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.seoAutopilot} element={<RequireAuth><Shell><SeoAutopilotControlCenter/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.leadRadar} element={<RequireAuth><Shell><LeadRadar/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.signalRadar} element={<RequireAuth><Shell><SignalRadar/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.internalLinks} element={<RequireAuth><Shell><InternalLinksPage/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.seoBooster} element={<RequireAuth><Shell><SeoBooster/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.indexNow} element={<RequireAuth><Shell><IndexNowPanel/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.redirects} element={<RequireAuth><Shell><Redirects/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.settings} element={<RequireAuth><Shell><Settings/></Shell></RequireAuth>} />
        {/* P3.1 Owner Control Center. Every route is behind RequireAuth here and
            behind requirePlatformRole on the server; the client guard is
            convenience, the server guard is the control. */}
        <Route path={ADMIN_ROUTE_PATHS.ownerOverview} element={<RequireAuth><Shell><OwnerOverview/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerStores} element={<RequireAuth><Shell><OwnerStores/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerStoreDetail} element={<RequireAuth><Shell><OwnerStoreDetail/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerOrders} element={<RequireAuth><Shell><OwnerOrders/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerHandoffs} element={<RequireAuth><Shell><OwnerHandoffs/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerAutomation} element={<RequireAuth><Shell><OwnerAutomation/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerAudit} element={<RequireAuth><Shell><OwnerAudit/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.ownerPilot} element={<RequireAuth><Shell><OwnerPilot/></Shell></RequireAuth>} />
        <Route path={ADMIN_ROUTE_PATHS.fallback} element={<Navigate to={ADMIN_HOME} replace/>} />
      </Routes>
    </AdminErrorBoundary>
  );
}
