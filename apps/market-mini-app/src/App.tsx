import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorView, Icon, LoadingView, StateView } from './components/ui';
import { MarketApiError, exchangeLaunch, marketApi, setSessionLocale } from './lib/api';
import { t } from './lib/i18n';
import { preferredLocale } from './platform/telegram';
import { BuyerApp } from './screens/BuyerApp';
import type { Bootstrap, Locale, MarketLaunch, Role } from './types';

const SellerApp = lazy(() => import('./screens/SellerApp').then((module) => ({
  default: module.SellerApp,
})));

function ConnectedApp({ launch, online }: { launch: MarketLaunch; online: boolean }) {
  const [role, setRole] = useState<Role>('buyer');
  const [locale, setLocale] = useState<Locale>(launch.session.locale);
  const bootstrap = useQuery<Bootstrap>({
    queryKey: ['bootstrap'],
    queryFn: ({ signal }) => marketApi.get('/bootstrap', signal),
    initialData: launch.bootstrap,
    staleTime: 30_000,
  });
  const changeLocale = async (next: Locale) => {
    setLocale(next);
    document.documentElement.lang = next;
    try {
      await setSessionLocale(next);
      await bootstrap.refetch();
    } catch {
      // Copy remains usable; the next launch re-establishes server locale.
    }
  };
  const sellerAvailable = bootstrap.data.flags.sellerRead;
  const activeRole: Role = role === 'seller' && sellerAvailable ? 'seller' : 'buyer';
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">G</div>
      <div className="app-header__identity">
        <strong>{t(locale, 'appName')}</strong>
        <span>{activeRole === 'seller' ? t(locale, 'seller') : t(locale, 'buyer')} · {bootstrap.data.buildId}</span>
      </div>
      {sellerAvailable ? <div className="role-switch" role="group" aria-label={t(locale, 'role')}>
        <button aria-pressed={activeRole === 'buyer'} onClick={() => setRole('buyer')}>{t(locale, 'buyer')}</button>
        <button aria-pressed={activeRole === 'seller'} onClick={() => setRole('seller')}>{t(locale, 'seller')}</button>
      </div> : null}
      <button className="icon-button locale-button" onClick={() => void changeLocale(locale === 'ru' ? 'uz' : 'ru')} aria-label={t(locale, 'language')}>{locale.toUpperCase()}</button>
    </header>
    {!online ? <div className="offline-banner" role="status"><Icon name="warning" size={17}/>{t(locale, 'offlineBody')}</div> : null}
    {activeRole === 'buyer'
      ? <BuyerApp locale={locale} onLocale={(next) => void changeLocale(next)} sellerAvailable={sellerAvailable} onSeller={() => setRole('seller')} initialHome={launch.home} />
      : <Suspense fallback={<LoadingView locale={locale} />}><SellerApp locale={locale} commands={bootstrap.data.flags.sellerCommands && online} onBuyer={() => setRole('buyer')} /></Suspense>}
  </div>;
}

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [locale, setLocale] = useState<Locale>(preferredLocale());
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  const launch = useQuery({
    queryKey: ['launch'],
    queryFn: exchangeLaunch,
    retry: (count, error) => error instanceof MarketApiError
      ? error.status >= 500 && count < 2
      : count < 2,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (launch.data?.session.locale) setLocale(launch.data.session.locale);
  }, [launch.data?.session.locale]);

  if (launch.isLoading) return <LoadingView locale={locale} />;
  if (launch.isError) {
    const unsupported = launch.error instanceof MarketApiError
      && launch.error.code === 'unsupported_environment';
    return <main className="page page--narrow"><StateView
      icon={unsupported ? 'seller' : 'warning'}
      title={t(locale, unsupported ? 'unsupportedTitle' : 'unavailableTitle')}
      body={t(locale, unsupported ? 'unsupportedBody' : 'unavailableBody')}
      action={!unsupported ? <button className="button button--secondary" onClick={() => void launch.refetch()}>{t(locale, 'retry')}</button> : undefined}
    /></main>;
  }
  if (!launch.data) {
    return <main className="page page--narrow"><ErrorView locale={locale} retry={() => void launch.refetch()} /></main>;
  }
  return <ConnectedApp launch={launch.data} online={online} />;
}
