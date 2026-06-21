import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import Cockpit from './pages/Cockpit';
import PagesList from './pages/PagesList';
import PageEditor from './pages/PageEditor';
import BlogList from './pages/BlogList';
import BlogEditor from './pages/BlogEditor';
import InternalLinksPage from './pages/InternalLinks';
import SeoBooster from './pages/SeoBooster';
import Redirects from './pages/Redirects';
import Settings from './pages/Settings';
import AiDraftsList from './pages/AiDraftsList';
import AiDraftDetail from './pages/AiDraftDetail';
import { Sidebar } from './components/Sidebar';
import { api, getToken } from './lib/api';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<null | boolean>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!getToken()) { nav('/admin-tools/login', { replace: true }); return; }
    void api.me().then(() => setOk(true)).catch(() => { nav('/admin-tools/login', { replace: true }); });
  }, [nav]);
  if (ok === null) return <div className="min-h-screen bg-bg-base text-white/60 flex items-center justify-center">Authenticating…</div>;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [publishing, setPublishing] = useState(false);
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
    <div className="flex min-h-screen bg-bg-base text-white">
      <Sidebar onPublish={onPublish}/>
      <main className="flex-1 min-w-0">{publishing ? <div className="p-8">Publishing to GitHub…</div> : children}</main>
    </div>
  );
}

// Paths here are RELATIVE to the parent `/admin-tools/*` route mounted in main.tsx.
export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route index element={<RequireAuth><Shell><Cockpit/></Shell></RequireAuth>} />
      <Route path="pages" element={<RequireAuth><Shell><PagesList/></Shell></RequireAuth>} />
      <Route path="pages/new" element={<RequireAuth><Shell><PageEditor/></Shell></RequireAuth>} />
      <Route path="pages/:locale/:slug" element={<RequireAuth><Shell><PageEditor/></Shell></RequireAuth>} />
      <Route path="blog" element={<RequireAuth><Shell><BlogList/></Shell></RequireAuth>} />
      <Route path="blog/new" element={<RequireAuth><Shell><BlogEditor/></Shell></RequireAuth>} />
      <Route path="blog/:locale/:slug" element={<RequireAuth><Shell><BlogEditor/></Shell></RequireAuth>} />
      <Route path="ai-drafts" element={<RequireAuth><Shell><AiDraftsList/></Shell></RequireAuth>} />
      <Route path="ai-drafts/:id" element={<RequireAuth><Shell><AiDraftDetail/></Shell></RequireAuth>} />
      <Route path="internal-links" element={<RequireAuth><Shell><InternalLinksPage/></Shell></RequireAuth>} />
      <Route path="seo-booster" element={<RequireAuth><Shell><SeoBooster/></Shell></RequireAuth>} />
      <Route path="redirects" element={<RequireAuth><Shell><Redirects/></Shell></RequireAuth>} />
      <Route path="settings" element={<RequireAuth><Shell><Settings/></Shell></RequireAuth>} />
      <Route path="*" element={<Navigate to="/admin-tools" replace/>} />
    </Routes>
  );
}
