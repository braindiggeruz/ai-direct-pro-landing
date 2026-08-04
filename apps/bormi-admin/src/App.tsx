/**
 * Routing and the two gates in front of it.
 *
 * The first gate is a session: no token on this origin means the login that
 * already owns sessions gets the browser, and this panel never asks for a
 * credential itself. The second is the rollout switch, which the server reports
 * - off, the panel says so and points at the console that still works.
 *
 * Neither gate is authority. Both of them are convenience for the person in
 * front of the screen: every endpoint behind every route is guarded by
 * `requirePlatformRole` on the server, and a client that skips these checks
 * reaches exactly the same 401 or 403 it would have reached anyway.
 */
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { adminApi, hasSession, LOGIN_URL } from './lib/api';
import { useQuery } from './lib/useQuery';
import type { OverviewResponse } from './lib/contracts';
import { AppShell } from './components/AppShell';
import { Card, ErrorState, Skeleton } from './components/ui';

// One chunk per screen. The shell is what every visit pays for; the rest
// arrives when it is opened.
const Overview = lazy(() => import('./pages/Overview'));
const Listings = lazy(() => import('./pages/Listings'));
const ListingDetail = lazy(() => import('./pages/ListingDetail'));
const Categories = lazy(() => import('./pages/Categories'));
const Access = lazy(() => import('./pages/Access'));
const Audit = lazy(() => import('./pages/Audit'));
const System = lazy(() => import('./pages/System'));

function Loading() {
  return (
    <div className="p-6">
      <Skeleton rows={4} />
    </div>
  );
}

function Disabled() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Bormi Admin выключен</h1>
      <p className="muted mt-2 text-sm">
        Панель собрана и задеплоена, но флаг раскатки выключен. Прежний Owner Control Center
        продолжает работать.
      </p>
      <a
        className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border-line)] px-4 text-sm"
        href="/admin-tools/agents"
      >
        Открыть прежнюю панель
      </a>
    </main>
  );
}

export default function App() {
  // No session at all: nothing to render, and the login owns that decision.
  if (!hasSession()) {
    window.location.assign(LOGIN_URL);
    return <Loading />;
  }

  // The same bounded read every screen uses. It answers three questions at
  // once: is the session real, may this role be here, and is the panel on.
  const { data, error, loading, reload } = useQuery<OverviewResponse>(() => adminApi.overview(), []);

  if (loading) return <Loading />;
  if (error === 'forbidden' || error === 'http_403') {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Недостаточно прав</h1>
        <p className="muted mt-2 text-sm">
          Панель доступна владельцу платформы. Ваша сессия действительна, но эта роль сюда не
          допущена.
        </p>
      </main>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <Card><ErrorState code={error ?? 'unknown'} onRetry={reload} /></Card>
      </div>
    );
  }
  if (!data.rollout.admin_v2) return <Disabled />;

  return (
    <AppShell actorEmail={data.actor.email}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/access" element={<Access />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/system" element={<System />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
