import { lazy, Suspense, useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../platform/telegram';
import type { Locale } from '../types';
import { Icon, LoadingView, SectionHeader } from '../components/ui';
import { BuyerOrdersList } from './BuyerOrders';

const SellerApp = lazy(() => import('./SellerApp').then((module) => ({
  default: module.SellerApp,
})));

type CabinetSection = 'root' | 'orders' | 'store';

interface CabinetAppProps {
  locale: Locale;
  /** The person's own first name, shown back to them. Never another user's. */
  userName: string;
  /**
   * Server-granted seller authority. The only thing that decides whether the
   * store section exists — there is no route, parameter or stored preference
   * that can produce it on the client.
   */
  sellerAvailable: boolean;
  sellerCommands: boolean;
  mediaUpload: boolean;
  /** True while an order is half-filled, so the cabinet can say where it left off. */
  activeCheckout: boolean;
  /** True while a question to a seller is still open. */
  activeHandoff: boolean;
  onSearch: () => void;
  onLocale: (next: Locale) => void;
  /**
   * Raised while the seller workspace is open. That screen carries its own
   * bottom navigation, and two fixed bars cannot share the same edge of a
   * 390 px screen, so the shell hides its own while this is true.
   */
  onWorkspace: (active: boolean) => void;
}

function CabinetRow({
  icon,
  title,
  hint,
  note,
  onOpen,
}: {
  icon: 'orders' | 'seller' | 'help';
  title: string;
  hint: string;
  note?: string;
  onOpen?: () => void;
}) {
  const body = <>
    <span className="cabinet-row__icon"><Icon name={icon} size={20}/></span>
    <span className="cabinet-row__text">
      <strong>{title}</strong>
      <small>{hint}</small>
      {note ? <em className="cabinet-row__note">{note}</em> : null}
    </span>
    {onOpen ? <Icon name="chevron" size={18}/> : null}
  </>;
  return onOpen
    ? <button type="button" className="cabinet-row" onClick={onOpen}>{body}</button>
    : <div className="cabinet-row cabinet-row--static">{body}</div>;
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="cabinet-choice">
      <span className="cabinet-choice__label" id={`choice-${label}`}>{label}</span>
      <div className="segmented" role="group" aria-labelledby={`choice-${label}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >{option.label}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * One cabinet for everyone.
 *
 * Grouped by the question being asked rather than by who is asking: what I sent,
 * what I sell, how the app behaves, where to get help. The seller workspace is a
 * section inside it rather than a separate app behind a header toggle, and it is
 * rendered — its chunk not even fetched — only when the server has already said
 * this person owns a store.
 */
export function CabinetApp({
  locale,
  userName,
  sellerAvailable,
  sellerCommands,
  mediaUpload,
  activeCheckout,
  activeHandoff,
  onSearch,
  onLocale,
  onWorkspace,
}: CabinetAppProps) {
  const [section, setSection] = useState<CabinetSection>('root');
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const workspace = section === 'store' && sellerAvailable;

  useEffect(() => {
    onWorkspace(workspace);
    return () => onWorkspace(false);
  }, [workspace, onWorkspace]);

  if (workspace) {
    return <Suspense fallback={<LoadingView locale={locale} />}>
      <SellerApp
        locale={locale}
        commands={sellerCommands}
        mediaUpload={mediaUpload}
        onBuyer={() => setSection('root')}
        returnLabel={t(locale, 'cabinet')}
      />
    </Suspense>;
  }

  if (section === 'orders') {
    return <>
      <button className="buyer-return" onClick={() => setSection('root')}>
        <Icon name="back" size={17} />{t(locale, 'cabinet')}
      </button>
      <section className="hero"><h1>{t(locale, 'myOrders')}</h1></section>
      <BuyerOrdersList locale={locale} onSearch={onSearch} />
    </>;
  }

  const changeTheme = (next: ThemePreference) => {
    setTheme(next);
    setThemePreference(next);
  };

  return <>
    <section className="hero"><h1>{t(locale, 'cabinet')}</h1></section>
    <section className="section">
      <div className="cabinet-profile">
        <span className="cabinet-profile__avatar" aria-hidden="true"><Icon name="cabinet" size={24}/></span>
        <span className="cabinet-profile__text">
          <strong>{userName}</strong>
          <small>{t(locale, sellerAvailable ? 'roleBuyerSeller' : 'roleBuyer')}</small>
        </span>
      </div>
    </section>

    <section className="section">
      <SectionHeader title={t(locale, 'myActivity')} />
      <div className="cabinet-list">
        <CabinetRow
          icon="orders"
          title={t(locale, 'myOrders')}
          hint={t(locale, 'myOrdersHint')}
          note={activeCheckout
            ? t(locale, 'checkoutUnfinished')
            : activeHandoff ? t(locale, 'questionWaiting') : undefined}
          onOpen={() => setSection('orders')}
        />
      </div>
    </section>

    {sellerAvailable ? <section className="section">
      <SectionHeader title={t(locale, 'store')} />
      <div className="cabinet-list">
        <CabinetRow
          icon="seller"
          title={t(locale, 'storeWorkspace')}
          hint={t(locale, 'storeHint')}
          onOpen={() => setSection('store')}
        />
      </div>
    </section> : null}

    <section className="section">
      <SectionHeader title={t(locale, 'settings')} />
      <div className="cabinet-list">
        <ChoiceRow
          label={t(locale, 'language')}
          value={locale}
          options={[
            { value: 'ru' as Locale, label: 'Русский' },
            { value: 'uz' as Locale, label: 'O‘zbekcha' },
          ]}
          onChange={onLocale}
        />
        <ChoiceRow
          label={t(locale, 'theme')}
          value={theme}
          options={[
            { value: 'auto' as ThemePreference, label: t(locale, 'themeAuto') },
            { value: 'light' as ThemePreference, label: t(locale, 'themeLight') },
            { value: 'dark' as ThemePreference, label: t(locale, 'themeDark') },
          ]}
          onChange={changeTheme}
        />
        <p className="cabinet-note">{t(locale, 'themeHint')}</p>
      </div>
    </section>

    <section className="section">
      <SectionHeader title={t(locale, 'helpTitle')} />
      <div className="cabinet-list">
        <CabinetRow
          icon="help"
          title={t(locale, 'helpTitle')}
          hint={t(locale, 'helpBody')}
        />
      </div>
    </section>
  </>;
}
