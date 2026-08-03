import { lazy, Suspense, useEffect, useState } from 'react';
import { t } from '../lib/i18n';
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
  onSearch: () => void;
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
  onOpen,
}: {
  icon: 'orders' | 'seller' | 'help';
  title: string;
  hint: string;
  onOpen?: () => void;
}) {
  const body = <>
    <span className="cabinet-row__icon"><Icon name={icon} size={20}/></span>
    <span className="cabinet-row__text"><strong>{title}</strong><small>{hint}</small></span>
    {onOpen ? <Icon name="chevron" size={18}/> : null}
  </>;
  return onOpen
    ? <button type="button" className="cabinet-row" onClick={onOpen}>{body}</button>
    : <div className="cabinet-row cabinet-row--static">{body}</div>;
}

/**
 * One cabinet for everyone.
 *
 * The seller workspace is a section inside it rather than a separate app behind
 * a header toggle, so a store owner finds their tools where everything else
 * personal already lives. The section is rendered — and its chunk fetched —
 * only when the server has already said this person owns a store.
 */
export function CabinetApp({
  locale,
  userName,
  sellerAvailable,
  sellerCommands,
  mediaUpload,
  onSearch,
  onWorkspace,
}: CabinetAppProps) {
  const [section, setSection] = useState<CabinetSection>('root');
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

  return <>
    <section className="hero"><h1>{t(locale, 'cabinet')}</h1></section>
    <section className="section">
      <div className="cabinet-profile">
        <span className="cabinet-profile__avatar" aria-hidden="true"><Icon name="cabinet" size={24}/></span>
        <span className="cabinet-profile__text">
          <strong>{userName}</strong>
          <small>{t(locale, 'profile')}</small>
        </span>
      </div>
    </section>
    <section className="section">
      <SectionHeader title={t(locale, 'cabinet')} />
      <div className="cabinet-list">
        <CabinetRow
          icon="orders"
          title={t(locale, 'myOrders')}
          hint={t(locale, 'myOrdersHint')}
          onOpen={() => setSection('orders')}
        />
        {sellerAvailable ? <CabinetRow
          icon="seller"
          title={t(locale, 'store')}
          hint={t(locale, 'storeHint')}
          onOpen={() => setSection('store')}
        /> : null}
        <CabinetRow
          icon="help"
          title={t(locale, 'helpTitle')}
          hint={t(locale, 'helpBody')}
        />
      </div>
    </section>
  </>;
}
