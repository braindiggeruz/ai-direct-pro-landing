import { useEffect, useState } from 'react';
import { Badge, Card, Select } from '../../components/ui';
import { OwnerErrorCard, OwnerHeader, OwnerLoadingCard } from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError } from '../../lib/owner-api';
import type { OwnerOrderRow } from '../../../shared/owner-control-center';

export default function OwnerOrders() {
  const [orders, setOrders] = useState<OwnerOrderRow[]>([]);
  const [projection, setProjection] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ownerApi.orders({ status, limit: 50 })
      .then((r) => { setOrders(r.orders); setProjection(r.projection); })
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-orders">
      <OwnerHeader
        title="Заказы"
        subtitle="Объём и жизненный цикл. Персональные данные покупателя не проецируются."/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}

      <Card>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-white/40 text-xs mb-1">Статус</div>
            <Select value={status} onChange={(e) => {
              setError(null);
              setLoading(true);
              setStatus(e.target.value);
            }} data-testid="owner-orders-filter">
              <option value="all">все</option>
              <option value="draft">draft</option>
              <option value="placed">placed</option>
              <option value="confirmed">confirmed</option>
              <option value="done">done</option>
              <option value="cancelled">cancelled</option>
            </Select>
          </div>
          {projection && <div className="text-white/40 text-xs pb-2" data-testid="owner-orders-projection">{projection}</div>}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]" data-testid="owner-orders-table">
          <thead className="text-white/40 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Номер</th>
              <th className="text-left py-2">Магазин</th>
              <th className="text-left py-2">Статус</th>
              <th className="text-left py-2">Выполнение</th>
              <th className="text-right py-2">Позиции</th>
              <th className="text-right py-2">Сумма</th>
              <th className="text-left py-2">Создан</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderId} className="border-t border-white/5">
                <td className="py-2">{order.orderNumber}</td>
                <td className="py-2 text-white/50 text-xs">{order.storeId}</td>
                <td className="py-2"><Badge tone="info">{order.status}</Badge></td>
                <td className="py-2 text-white/60">{order.fulfillmentStatus}</td>
                <td className="py-2 text-right">{order.items}</td>
                <td className="py-2 text-right">{order.totalMinor} {order.currency}</td>
                <td className="py-2 text-white/50">{order.createdAt}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-white/40">Заказов нет</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
