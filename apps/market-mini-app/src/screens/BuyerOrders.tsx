import { useQuery } from '@tanstack/react-query';
import { marketApi } from '../lib/api';
import { formatDate, formatPrice, labelForStatus, t } from '../lib/i18n';
import type { BuyerOrder, Locale } from '../types';
import { Badge, Button, ErrorView, Icon, SkeletonList, StateView } from '../components/ui';

/**
 * The shopper's own requests.
 *
 * Extracted so the old "Заказы" tab and the cabinet section render the same
 * list from the same query rather than two copies that drift apart. It fetches
 * on mount, so the caller controls loading simply by mounting it.
 */
export function BuyerOrdersList({ locale, onSearch }: { locale: Locale; onSearch: () => void }) {
  const orders = useQuery<{ items: BuyerOrder[] }>({
    queryKey: ['orders'],
    queryFn: ({ signal }) => marketApi.get('/orders?limit=5', signal),
  });

  const timeline = (order: BuyerOrder) => {
    const states = order.status === 'cancelled'
      ? [[t(locale, 'sentStep'), 'done'], [t(locale, 'cancelledStep'), 'current']]
      : [
          [t(locale, 'sentStep'), 'done'],
          [t(locale, 'confirmedStep'), order.status === 'placed' ? 'current' : 'done'],
          [t(locale, 'doneStep'), order.status === 'done' ? 'done' : order.status === 'confirmed' ? 'current' : 'pending'],
        ];
    return <ol className="timeline timeline--compact" aria-label={labelForStatus(locale, order.status)}>{states.map(([label, state]) => <li key={label} data-state={state}><span className="timeline__dot">{state === 'done' ? <Icon name="check" size={13}/> : null}</span><span>{label}</span></li>)}</ol>;
  };

  if (orders.isLoading) return <SkeletonList count={3}/>;
  if (orders.isError) return <ErrorView locale={locale} retry={() => void orders.refetch()} />;
  if (!orders.data?.items.length) {
    return <StateView icon="orders" title={t(locale, 'ordersEmpty')} action={<Button onClick={onSearch}>{t(locale, 'search')}</Button>} />;
  }
  return <ol className="list">{orders.data.items.map((order) => <li className="list-item order-card" key={order.orderId}>
    <div className="row row--between"><strong>№ {order.orderNumber}</strong><Badge tone={order.status === 'done' ? 'positive' : order.status === 'cancelled' ? 'negative' : 'info'}>{labelForStatus(locale, order.status)}</Badge></div>
    <span>{order.productName} · {order.quantity} ×</span>
    {timeline(order)}
    <div className="row row--between"><strong>{formatPrice(order.totalMinor, locale)}</strong><small className="muted">{formatDate(order.placedAt, locale)}</small></div>
  </li>)}</ol>;
}
