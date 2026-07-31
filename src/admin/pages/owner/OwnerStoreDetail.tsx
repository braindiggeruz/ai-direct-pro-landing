import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Badge, Card, StatTile } from '../../components/ui';
import { OwnerErrorCard, OwnerHeader, OwnerLoadingCard } from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError } from '../../lib/owner-api';
import type {
  OwnerAuditEvent,
  OwnerHandoffRow,
  OwnerOrderRow,
  OwnerStoreSummary,
} from '../../../shared/owner-control-center';

export default function OwnerStoreDetail() {
  const { storeId = '' } = useParams();
  const [store, setStore] = useState<OwnerStoreSummary | null>(null);
  const [orders, setOrders] = useState<OwnerOrderRow[]>([]);
  const [handoffs, setHandoffs] = useState<OwnerHandoffRow[]>([]);
  const [audit, setAudit] = useState<OwnerAuditEvent[]>([]);
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    void ownerApi.store(storeId).then((r) => {
      setStore(r.store);
      setOrders(r.recent_orders);
      setHandoffs(r.recent_handoffs);
      setAudit(r.audit_trail);
    })
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
  }, [storeId]);

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-store-detail">
      <OwnerHeader
        title={store ? store.name : 'Магазин'}
        subtitle={storeId}/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}

      {store && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Состояние" value={store.status} tone={store.status === 'active' ? 'success' : 'danger'}/>
            <StatTile label="Пилот" value={store.pilotState}/>
            <StatTile label="Товары" value={`${store.publishedProducts}/${store.products}`}/>
            <StatTile label="В наличии" value={store.inStockProducts}/>
            <StatTile label="Заказы" value={store.orders}/>
            <StatTile label="Открытые передачи" value={store.openHandoffs}/>
            <StatTile label="SLA ответа" value={store.handoffSla}
              tone={store.handoffSla === 'breached' ? 'danger' : store.handoffSla === 'due' ? 'warning' : 'neutral'}/>
            <StatTile label="Продавец" value={store.sellerStatus}/>
          </div>

          <Card>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-white/40">Каталог обновлён:</span>{' '}
                <code>{store.catalogUpdatedAt ?? 'нет данных'}</code>
              </div>
              <div>
                <span className="text-white/40">Последняя активность:</span>{' '}
                <code>{store.lastActivityAt}</code>
              </div>
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <h2 className="font-display text-base text-white mb-3">Последние заказы</h2>
            <p className="text-white/40 text-xs mb-3">
              Имя, телефон и адрес покупателя намеренно не показываются на этой поверхности.
            </p>
            <table className="w-full text-sm min-w-[640px]" data-testid="owner-store-orders">
              <thead className="text-white/40 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2">Номер</th>
                  <th className="text-left py-2">Статус</th>
                  <th className="text-right py-2">Позиции</th>
                  <th className="text-right py-2">Сумма</th>
                  <th className="text-left py-2">Создан</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderId} className="border-t border-white/5">
                    <td className="py-2">{order.orderNumber}</td>
                    <td className="py-2"><Badge tone="info">{order.status}</Badge></td>
                    <td className="py-2 text-right">{order.items}</td>
                    <td className="py-2 text-right">{order.totalMinor} {order.currency}</td>
                    <td className="py-2 text-white/50">{order.createdAt}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-white/40">Заказов нет</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto">
            <h2 className="font-display text-base text-white mb-3">Последние передачи</h2>
            <p className="text-white/40 text-xs mb-3">
              Текст вопроса и ответа не показывается — только факт их наличия.
            </p>
            <table className="w-full text-sm min-w-[640px]" data-testid="owner-store-handoffs">
              <thead className="text-white/40 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2">Статус</th>
                  <th className="text-left py-2">Причина</th>
                  <th className="text-left py-2">Вопрос</th>
                  <th className="text-left py-2">Ответ</th>
                  <th className="text-left py-2">Создана</th>
                </tr>
              </thead>
              <tbody>
                {handoffs.map((handoff) => (
                  <tr key={handoff.handoffId} className="border-t border-white/5">
                    <td className="py-2"><Badge tone={handoff.status === 'open' ? 'warning' : 'neutral'}>{handoff.status}</Badge></td>
                    <td className="py-2 text-white/60">{handoff.reason}</td>
                    <td className="py-2">{handoff.hasQuestion ? 'есть' : '—'}</td>
                    <td className="py-2">{handoff.hasReply ? 'есть' : '—'}</td>
                    <td className="py-2 text-white/50">{handoff.createdAt}</td>
                  </tr>
                ))}
                {handoffs.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-white/40">Передач нет</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="font-display text-base text-white mb-3">Журнал действий по этому магазину</h2>
            <ol className="space-y-2 text-sm" data-testid="owner-store-audit">
              {audit.map((event) => (
                <li key={event.eventId} className="border-l-2 border-white/10 pl-3">
                  <div className="text-white/80">
                    <code>{event.action}</code> · {event.reasonCode}
                  </div>
                  <div className="text-white/40 text-xs">
                    {event.createdAt} · {event.actorEmail} ({event.actorRole}) · request_id {event.requestId}
                  </div>
                </li>
              ))}
              {audit.length === 0 && <li className="text-white/40">Действий не было</li>}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
