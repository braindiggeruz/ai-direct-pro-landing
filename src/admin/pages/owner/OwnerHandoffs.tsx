import { useEffect, useState } from 'react';
import { Badge, Card, Select } from '../../components/ui';
import { OwnerErrorCard, OwnerHeader, OwnerLoadingCard } from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError } from '../../lib/owner-api';
import type { OwnerHandoffRow } from '../../../shared/owner-control-center';

export default function OwnerHandoffs() {
  const [handoffs, setHandoffs] = useState<OwnerHandoffRow[]>([]);
  const [projection, setProjection] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ownerApi.handoffs({ status, limit: 50 })
      .then((r) => { setHandoffs(r.handoffs); setProjection(r.projection); })
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-handoffs">
      <OwnerHeader
        title="Передачи продавцу"
        subtitle="Состояние и доставка. Текст переписки не читается с этой поверхности."/>
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
            }} data-testid="owner-handoffs-filter">
              <option value="all">все</option>
              <option value="open">open</option>
              <option value="answered">answered</option>
              <option value="closed">closed</option>
              <option value="expired">expired</option>
            </Select>
          </div>
          {projection && <div className="text-white/40 text-xs pb-2" data-testid="owner-handoffs-projection">{projection}</div>}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]" data-testid="owner-handoffs-table">
          <thead className="text-white/40 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Магазин</th>
              <th className="text-left py-2">Статус</th>
              <th className="text-left py-2">Причина</th>
              <th className="text-left py-2">Вопрос</th>
              <th className="text-left py-2">Ответ</th>
              <th className="text-right py-2">Попыток продавцу</th>
              <th className="text-right py-2">Попыток покупателю</th>
              <th className="text-left py-2">Создана</th>
            </tr>
          </thead>
          <tbody>
            {handoffs.map((handoff) => (
              <tr key={handoff.handoffId} className="border-t border-white/5">
                <td className="py-2 text-white/50 text-xs">{handoff.storeId}</td>
                <td className="py-2">
                  <Badge tone={handoff.status === 'open' ? 'warning' : handoff.status === 'expired' ? 'danger' : 'neutral'}>
                    {handoff.status}
                  </Badge>
                </td>
                <td className="py-2 text-white/60">{handoff.reason}</td>
                <td className="py-2">{handoff.hasQuestion ? 'есть' : '—'}</td>
                <td className="py-2">{handoff.hasReply ? 'есть' : '—'}</td>
                <td className="py-2 text-right">{handoff.sellerNotifyAttempts}</td>
                <td className="py-2 text-right">{handoff.buyerDeliveryAttempts}</td>
                <td className="py-2 text-white/50">{handoff.createdAt}</td>
              </tr>
            ))}
            {handoffs.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-white/40">Передач нет</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
