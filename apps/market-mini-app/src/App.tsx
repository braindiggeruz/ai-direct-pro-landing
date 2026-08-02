import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrandMark, Button, ErrorView, Icon, LoadingView, StateView } from './components/ui';
import {
  launchQueryOptions,
  MarketApiError,
  marketApi,
  setSessionLocale,
} from './lib/api';
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
    staleTime: 0,
    refetchOnMount: 'always',
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
  return <div className="app-shell" data-build-id={bootstrap.data.buildId}>
    <header className="app-header">
      <BrandMark />
      <div className="app-header__identity">
        <strong>{t(locale, 'appName')}</strong>
        <span>{t(locale, 'brandPromise')}</span>
      </div>
      {sellerAvailable ? <div className="role-switch" role="group" aria-label={t(locale, 'role')}>
        <button aria-pressed={activeRole === 'buyer'} onClick={() => setRole('buyer')}>{t(locale, 'buyer')}</button>
        <button aria-pressed={activeRole === 'seller'} onClick={() => setRole('seller')}>{t(locale, 'seller')}</button>
      </div> : null}
      <button className="icon-button locale-button" onClick={() => void changeLocale(locale === 'ru' ? 'uz' : 'ru')} aria-label={t(locale, 'language')}>{locale.toUpperCase()}</button>
    </header>
    {!online ? <div className="offline-banner" role="status"><Icon name="warning" size={17}/>{t(locale, 'offlineBody')}</div> : null}
    {activeRole === 'buyer'
      ? <BuyerApp locale={locale} initialHome={launch.home} voiceEnabled={bootstrap.data.flags.voice === true} />
      : <Suspense fallback={<LoadingView locale={locale} />}><SellerApp locale={locale} commands={bootstrap.data.flags.sellerCommands && online} mediaUpload={bootstrap.data.flags.mediaUpload === true && online} onBuyer={() => setRole('buyer')} /></Suspense>}
  </div>;
}

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const locale: Locale = preferredLocale();
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

  const launch = useQuery(launchQueryOptions);
  if (launch.isLoading) return <LoadingView locale={locale} />;
  if (launch.isError) {
    const unsupported = launch.error instanceof MarketApiError
      && launch.error.code === 'unsupported_environment';
    return <main className="page page--narrow"><StateView
      icon={unsupported ? 'seller' : 'warning'}
      title={t(locale, unsupported ? 'unsupportedTitle' : 'unavailableTitle')}
      body={t(locale, unsupported ? 'unsupportedBody' : 'unavailableBody')}
      action={!unsupported ? <Button
        variant="secondary"
        pending={launch.isFetching}
        onClick={() => void launch.refetch()}
      >{t(locale, 'retry')}</Button> : undefined}
    /></main>;
  }
  if (!launch.data) {
    return <main className="page page--narrow"><ErrorView locale={locale} retry={() => void launch.refetch()} /></main>;
  }
  return <ConnectedApp launch={launch.data} online={online} />;
}
