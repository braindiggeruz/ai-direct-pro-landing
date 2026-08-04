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
import { startNavigation } from './platform/navigation';
import {
  preferredLocale,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from './platform/telegram';
import { BuyerApp } from './screens/BuyerApp';
import type { Bootstrap, Locale, MarketLaunch, Role } from './types';

const SellerApp = lazy(() => import('./screens/SellerApp').then((module) => ({
  default: module.SellerApp,
})));

const ClassifiedsBuyer = lazy(() => import('./screens/ClassifiedsBuyer').then((module) => ({
  default: module.ClassifiedsBuyer,
})));

/** Авто → Светлая → Тёмная → Авто. Three taps return you where you started. */
const THEME_CYCLE: Record<ThemePreference, ThemePreference> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
};

const THEME_ICON: Record<ThemePreference, 'contrast' | 'sun' | 'moon'> = {
  auto: 'contrast',
  light: 'sun',
  dark: 'moon',
};

function ConnectedApp({ launch, online }: { launch: MarketLaunch; online: boolean }) {
  const [role, setRole] = useState<Role>('buyer');
  const [locale, setLocale] = useState<Locale>(launch.session.locale);
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const changeTheme = (next: ThemePreference) => {
    setTheme(next);
    setThemePreference(next);
  };
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
  // The cabinet holds the seller workspace itself, so the header toggle — which
  // was the only way to find it — has nothing left to switch.
  const cabinetEnabled = bootstrap.data.flags.cabinet === true;
  // The cabinet's own root. Only meaningful inside the cabinet shell, so it is
  // read together with it rather than on its own.
  const cabinetHomeV2 = cabinetEnabled && bootstrap.data.flags.cabinetHomeV2 === true;
  // Navigation only. Read here so the whole shell agrees on one answer, and
  // never consulted for what a person is allowed to do.
  const navBack = bootstrap.data.flags.navBack === true;
  useEffect(() => startNavigation(navBack), [navBack]);
  const activeRole: Role = !cabinetEnabled && role === 'seller' && sellerAvailable
    ? 'seller'
    : 'buyer';
  const sellerCommands = bootstrap.data.flags.sellerCommands && online;
  // Which screen "Продать" opens, for someone the server has already allowed to
  // create a listing. Read on its own and never folded into a capability: the
  // authority above is the only thing that decides what may be created.
  const quickPostEnabled = bootstrap.data.flags.quickPost === true;
  // Whether the cabinet offers the binding row at all. Presentation, like the
  // switches above: the screen behind it is refused by the server on its own,
  // so this can reveal a door and never open one.
  const bindingOffered = bootstrap.data.flags.ownerTelegramBinding === true;
  const classifiedsDiscovery = bootstrap.data.flags.classifiedsDiscovery === true;
  const mediaUpload = bootstrap.data.flags.mediaUpload === true && online;
  return <div className="app-shell" data-build-id={bootstrap.data.buildId}>
    <header className="app-header">
      <BrandMark />
      <div className="app-header__identity">
        <strong>{t(locale, 'appName')}</strong>
        <span>{t(locale, 'brandPromise')}</span>
      </div>
      {sellerAvailable && !cabinetEnabled ? <div className="role-switch" role="group" aria-label={t(locale, 'role')}>
        <button aria-pressed={activeRole === 'buyer'} onClick={() => setRole('buyer')}>{t(locale, 'buyer')}</button>
        <button aria-pressed={activeRole === 'seller'} onClick={() => setRole('seller')}>{t(locale, 'seller')}</button>
      </div> : null}
      <button
        className="icon-button theme-button"
        onClick={() => changeTheme(THEME_CYCLE[theme])}
        aria-label={`${t(locale, 'theme')}: ${t(locale, `theme${theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}`)}`}
      ><Icon name={THEME_ICON[theme]} size={19} /></button>
      <button className="icon-button locale-button" onClick={() => void changeLocale(locale === 'ru' ? 'uz' : 'ru')} aria-label={t(locale, 'language')}>{locale.toUpperCase()}</button>
    </header>
    {!online ? <div className="offline-banner" role="status"><Icon name="warning" size={17}/>{t(locale, 'offlineBody')}</div> : null}
    {activeRole === 'buyer'
      ? classifiedsDiscovery
          ? <Suspense fallback={<LoadingView locale={locale} />}><ClassifiedsBuyer
            locale={locale}
            navBack={navBack}
            voiceEnabled={bootstrap.data.flags.voice === true}
            privateListing={bootstrap.data.flags.privateListing === true}
            // The classifieds shell replaces the store shell outright, so it
            // has to carry the cabinet the store shell owned. Without these the
            // only account surface left is two unlabelled header icons.
            userName={launch.session.user.firstName}
            buildId={bootstrap.data.buildId}
            theme={theme}
            onTheme={changeTheme}
            onLocale={(next) => void changeLocale(next)}
          /></Suspense>
        : <BuyerApp
          locale={locale}
          initialHome={launch.home}
          voiceEnabled={bootstrap.data.flags.voice === true}
          cabinetEnabled={cabinetEnabled}
          cabinetHomeV2={cabinetHomeV2}
          navBack={navBack}
          quickPostEnabled={quickPostEnabled}
          bindingOffered={bindingOffered}
          // Authority is re-read from the server, never inferred from the
          // response that granted it.
          onBound={async () => { await bootstrap.refetch(); }}
          navigation={bootstrap.data.navigation ?? []}
          sellerAvailable={sellerAvailable}
          sellerCommands={sellerCommands}
          mediaUpload={mediaUpload}
          userName={launch.session.user.firstName}
          buildId={bootstrap.data.buildId}
          activeCheckout={bootstrap.data.counters.activeCheckout}
          activeHandoff={bootstrap.data.counters.activeHandoff}
          theme={theme}
          onTheme={changeTheme}
          onLocale={(next) => void changeLocale(next)}
        />
      : <Suspense fallback={<LoadingView locale={locale} />}><SellerApp locale={locale} commands={sellerCommands} mediaUpload={mediaUpload} onBuyer={() => setRole('buyer')} /></Suspense>}
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
